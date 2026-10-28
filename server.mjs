import {case06Research} from './lib/case06.mjs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {catalog} from './data/taiyuan.mjs';
import {createPlanningService,PlanningError} from './lib/planning.mjs';
import {loadCredentials,readApproval,createLedger,createHttpSender} from './lib/runtime05b.mjs';
import {createLivePlanning} from './lib/live-planning.mjs';
import {offlinePlanner} from './lib/offline-fixture.mjs';
import {localCsp,realMapCsp,isolatedWorkbenchCsp} from './lib/content-security-policy.mjs';
import {createMapContainerServer} from './lib/map-container-server.mjs';
import {createFrameMapSession} from './lib/frame-map-session.mjs';
const files = new Map([['/', ['index.html','text/html']],['/index.html',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/planning.js',['planning.js','text/javascript']],['/core.js',['core.js','text/javascript']],['/styles.css',['styles.css','text/css']],['/map-view.js',['map-view.js','text/javascript']],['/live-panel.js',['live-panel.js','text/javascript']],['/case06-controls.js',['case06-controls.js','text/javascript']],['/range-text.js',['range-text.js','text/javascript']],['/pick-panel.js',['pick-panel.js','text/javascript']],['/amap-loader.js',['amap-loader.js','text/javascript']],['/sdk-diagnostics.js',['sdk-diagnostics.js','text/javascript']],['/isolated-map-container.js',['isolated-map-container.js','text/javascript']],['/map-frame-protocol.js',['map-frame-protocol.js','text/javascript']]]);
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let size=0,body='',done=false;
    const fail=error=>{if(done)return;done=true;clearTimeout(timer);reject(error);};
    const timer=setTimeout(()=>fail(new PlanningError('BODY_TIMEOUT','读取请求超时',408)),10000);
    req.setEncoding('utf8');
    req.on('data',chunk=>{if(done)return;size+=Buffer.byteLength(chunk);if(size>32768){body='';fail(new PlanningError('BODY_LIMIT','请求超过32KB上限',413));}else body+=chunk;});
    req.on('end',()=>{if(done)return;done=true;clearTimeout(timer);try{resolve(JSON.parse(body));}catch{reject(new PlanningError('BODY_JSON','请求必须是有效JSON',400));}});
    req.on('error',()=>fail(new PlanningError('BODY_ERROR','请求读取失败',400)));
    req.on('aborted',()=>fail(new PlanningError('BODY_ERROR','请求已取消',400)));
  });
}
export function createServer({planning=createPlanningService(),live=null,mapFrameOrigin=null,mapFrameSession=null}={}) {
  const server=http.createServer(async(req,res)=>{
    const path=req.url?.split('?')[0];
    const frameOrigin=typeof mapFrameOrigin==='function'?mapFrameOrigin():mapFrameOrigin;
    if(path?.startsWith('/api/')||path?.startsWith('/_AMapService')) {
      const host=req.headers.host,allowed=new Set([`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`]);
      if(!allowed.has(host)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${host}`))return json(res,403,{code:'ORIGIN',message:'只允许本机同源请求'});
      if(path.startsWith('/_AMapService')) {
        if(mapFrameOrigin)return json(res,403,{code:'ISOLATED_PROXY_PENDING',message:'独立地图代理尚未启用，不回退到主页面代理'});
        if(!live||req.method!=='GET')return json(res,403,{code:'OFFLINE_ONLY',message:'安全代理未启用'});
        try {const u=new URL(req.url,'http://localhost');const lease=/mapLease=([a-zA-Z0-9-]+)/.exec(req.headers.cookie||'')?.[1];u.searchParams.delete('lease');const reply=await live.proxy(path.slice('/_AMapService'.length),u.searchParams,lease);
          if(reply?.kind==='sdk-script'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(reply.body);return;}
          return json(res,200,reply?.kind==='sdk-json'?reply.data:reply);}
        catch(e){return json(res,e instanceof PlanningError?e.status:502,{code:e instanceof PlanningError?e.code:'PROXY_FAILED',message:e instanceof PlanningError?e.message:'安全代理失败'});}
      }
      if(req.method==='GET'&&path==='/api/capabilities')return json(res,200,{...planning.capabilities(),...(mapFrameOrigin?{mapFrameOrigin:frameOrigin,mapFrameContainerOnly:!mapFrameSession,canPrepare:!!frameOrigin&&!!mapFrameSession&&planning.capabilities().canPrepare,canGenerate:!!mapFrameSession&&planning.capabilities().canGenerate}:{})});
      if(req.method==='GET'&&path==='/api/candidates')return json(res,200,catalog());
      if(req.method==='POST'&&(path==='/api/plan'||path.startsWith('/api/live/'))) {
        if(mapFrameOrigin&&['/api/live/map-lease','/api/live/sdk-event'].includes(path))return json(res,403,{code:'ISOLATED_SDK_PENDING',message:'容器阶段不领取SDK许可或记录SDK就绪'});
        if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return json(res,415,{code:'CONTENT_TYPE',message:'请使用JSON请求'});
        if(Number(req.headers['content-length'])>32768)return json(res,413,{code:'BODY_LIMIT',message:'请求超过32KB上限'});
        const controller=new AbortController();const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
        try {const input=await readBody(req);let result;
          if(mapFrameSession&&['/api/live/frame/start','/api/live/frame/end'].includes(path)){
            if(!input||Object.keys(input).length!==1||typeof input.runId!=='string')throw new PlanningError('FRAME_DATA','只接收运行标识',400);
            result=await(path.endsWith('/start')?mapFrameSession.start(input.runId):mapFrameSession.end(input.runId));
          }else result=await(path==='/api/plan'?planning.run(input,{signal:controller.signal}):live?live.action(path,input):Promise.reject(new PlanningError('OFFLINE_ONLY','真实调用未启用',403)));
          if(path==='/api/live/map-lease')res.setHeader('Set-Cookie',`mapLease=${result.lease}; HttpOnly; SameSite=Strict; Path=/_AMapService; Max-Age=600`);
          return json(res,200,result);}
        catch(error) {return json(res,error instanceof PlanningError?error.status:500,{code:error instanceof PlanningError?error.code:'INTERNAL',message:error instanceof PlanningError?error.message:'本地处理失败，输入保留',...(error instanceof PlanningError&&error.diagnostic?{diagnostic:error.diagnostic}:{})});}
      }
      return json(res,404,{code:'NOT_FOUND',message:'接口不存在'});
    }
    const entry=files.get(path);
    // Browser icon fallback is separate from map initialization and business APIs.
    if(path==='/favicon.ico'&&['GET','HEAD'].includes(req.method)){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return;}
    if(!entry||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
    try {const body=await readFile(new URL(`./web/${entry[0]}`,import.meta.url));res.writeHead(200,{'Content-Type':`${entry[1]}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':mapFrameOrigin?(frameOrigin?isolatedWorkbenchCsp(frameOrigin):localCsp):live?realMapCsp:localCsp});res.end(req.method==='HEAD'?undefined:body);}
    catch {res.writeHead(500);res.end('无法读取页面文件');}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const testMode=process.argv.includes('--offline-test'),realPrep=process.argv.includes('--real-preparation');
  if(testMode&&realPrep)throw Error('模式不能同时启用');
  const task06=process.argv.includes('--case06');
  if(task06&&!realPrep)throw Error('任务06需使用正式受控联调模式');
  let live=null;
  if(realPrep){
    const {credentials,status}=await loadCredentials(new URL('./.env',import.meta.url));
    let approval=null;try{approval=await readApproval(new URL('./docs/private/05b-approval.json',import.meta.url));}catch(e){console.log(e.message);}
    const historyApproval=approval||await readApproval(new URL('./docs/private/05b-approval.json',import.meta.url),{allowExpired:true}).catch(()=>null);
    const ledger=historyApproval?createLedger(fileURLToPath(new URL('./docs/private/05b-ledger.json',import.meta.url)),historyApproval):null;
    const picksName=task06?'06-picks':'05b-picks';
    let case06=null;if(task06){const research=JSON.parse(await readFile(new URL('./docs/verification/task06-research.json',import.meta.url),'utf8')),old=JSON.parse(await readFile(new URL('./docs/private/05b-picks.json',import.meta.url),'utf8').catch(e=>{if(e.code==='ENOENT')return '{"points":{}}';throw e;}));case06=case06Research(research,old.points);}
    let initialPicks=null;try{initialPicks=JSON.parse(await readFile(new URL(`./docs/private/${picksName}.json`,import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}let savingPicks=Promise.resolve();
    const savePicks=s=>{const next=savingPicks.then(async()=>{const path=new URL(`./docs/private/${picksName}.json`,import.meta.url),tmp=new URL(`./docs/private/${picksName}.tmp`,import.meta.url);await writeFile(tmp,JSON.stringify(s),{mode:0o600});await rename(tmp,path);});savingPicks=next.catch(()=>{});return next;};
    let initialCase06Draft=null;if(task06)try{initialCase06Draft=JSON.parse(await readFile(new URL('./docs/private/06-draft.json',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const saveCase06Draft=async d=>{const path=new URL('./docs/private/06-draft.json',import.meta.url),tmp=new URL('./docs/private/06-draft.tmp',import.meta.url);await writeFile(tmp,JSON.stringify(d),{mode:0o600});await rename(tmp,path);};
    live=createLivePlanning({credentials,configuration:status,approval,ledger,initialPicks,savePicks,case06,initialCase06Draft,saveCase06Draft,send:createHttpSender(),initialStop:ledger?(await ledger.summary()).stopped?.code:null});
  }
  const planning=live||createPlanningService(testMode?{mode:'offline-test',planner:offlinePlanner}:{});
  const port=realPrep?4177:testMode?4174:4173;
  let frameOrigin=null;
  const mapSession=realPrep?createFrameMapSession({live}):null;
  const mainServer=createServer({planning,live,mapFrameOrigin:realPrep?()=>frameOrigin:null,mapFrameSession:mapSession});
  if(realPrep){
    const child=createMapContainerServer({getOrigins:()=>({parentOrigin:'http://127.0.0.1:'+port,mapOrigin:frameOrigin}),mapSession});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.listen(4184,'127.0.0.2',resolve);});
    frameOrigin='http://127.0.0.2:4184';
    process.on('SIGINT',()=>child.close());
  }
  mainServer.listen(port,'127.0.0.1',()=>console.log(`行程有解：http://127.0.0.1:${port} ${testMode?'（离线替身测试）':realPrep?'（受控联调准备，点击前不联网）':'（普通模式，真实生成关闭）'}，Ctrl+C停止`));
}
