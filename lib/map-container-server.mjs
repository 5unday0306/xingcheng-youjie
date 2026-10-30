// Separate-origin container. Optional session exposes only bounded initialization.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {mapContainerCsp} from './content-security-policy.mjs';
import {PlanningError} from './planning.mjs';
const assets=new Map([['/container',['map-container.html','text/html']],['/map-container.js',['map-container.js','text/javascript']],['/map-frame-protocol.js',['map-frame-protocol.js','text/javascript']],['/map-container.css',['map-container.css','text/css']]]);
export function createMapContainerServer({getOrigins,mapSession=null}){
 return http.createServer(async(req,res)=>{
  const {parentOrigin,mapOrigin}=getOrigins();if(!parentOrigin||!mapOrigin){res.writeHead(503);res.end();return;}
  const headers={'Content-Security-Policy':mapContainerCsp(parentOrigin,{sdkEnabled:!!mapSession}),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(), camera=(), microphone=()'};
  const reply=(status,body='',type='text/plain')=>{res.writeHead(status,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(body);};
  if(req.headers.host!==new URL(mapOrigin).host)return reply(403);
  const u=new URL(req.url,mapOrigin),path=u.pathname;
  if(mapSession&&path.startsWith('/_AMapService/')&&path!=='/_AMapService/v3/log/init'){
   if(req.headers['sec-fetch-site']==='same-origin'&&(!req.headers.origin||req.headers.origin===mapOrigin))await mapSession.rejectProxy();
   return reply(403,JSON.stringify({code:'PROXY_SCOPE'}),'application/json');
  }
  if(mapSession&&['/frame/bootstrap','/frame/event','/_AMapService/v3/log/init'].includes(path)){
   const json=(s,b)=>reply(s,JSON.stringify(b),'application/json');
   if(req.headers['sec-fetch-site']!=='same-origin'||(req.headers.origin&&req.headers.origin!==mapOrigin))return json(403,{code:'ORIGIN'});
   try{
    if(path==='/_AMapService/v3/log/init'){
     if(req.method!=='GET')return json(405,{code:'METHOD'});
     const r=await mapSession.proxy('/v3/log/init',u.searchParams);return r.kind==='sdk-script'?reply(200,r.body,'application/javascript'):json(200,r.data);
    }
    if(req.method!=='POST'||req.headers.origin!==mapOrigin||req.headers['content-type']!=='application/json')return json(403,{code:'ORIGIN'});
    req.setTimeout(5000,()=>req.destroy());let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw new PlanningError('BODY_LIMIT','消息过大',413);}
    let b;try{b=JSON.parse(body);}catch{throw new PlanningError('BODY_JSON','消息无效',400);}
    const keys=path==='/frame/event'?['runId','event',...(['sdk-failed','map-initializing','map-ready'].includes(b?.event)&&Object.hasOwn(b,'diagnostic')?['diagnostic']:[])]:['runId'];if(!b||Object.keys(b).length!==keys.length||!keys.every(k=>Object.hasOwn(b,k)))throw new PlanningError('FRAME_DATA','结构无效',400);
    const result=path==='/frame/bootstrap'?{...await mapSession.bootstrap(b.runId),serviceHost:mapOrigin+'/_AMapService'}:await mapSession.event(b.runId,b.event,b.diagnostic);return json(200,result);
   }catch(e){return json(e instanceof PlanningError?e.status:500,{code:e instanceof PlanningError?e.code:'FRAME_FAILED'});}
  }
  if(req.method!=='GET')return reply(405);
  if(path==='/favicon.ico')return reply(204);
  if(path==='/container'&&req.headers['sec-fetch-dest']!=='iframe')return reply(403,'只能嵌入指定工作台');
  if(path==='/container-config.js')return reply(200,`export const PARENT_ORIGIN=${JSON.stringify(parentOrigin)},SDK_ENABLED=${!!mapSession};`,'text/javascript');
  const extra=new Map([['/amap-loader.js',['amap-loader.js','text/javascript']],['/map-view.js',['map-view.js','text/javascript']],['/sdk-diagnostics.js',['sdk-diagnostics.js','text/javascript']]]);
  const asset=assets.get(path)||(mapSession?extra.get(path):null);if(!asset)return reply(404);
  try{return reply(200,await readFile(new URL('../web/'+asset[0],import.meta.url)),asset[1]);}catch{return reply(500);}
 });
}
