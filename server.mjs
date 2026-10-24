import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {catalog} from './data/taiyuan.mjs';
import {createPlanningService,PlanningError} from './lib/planning.mjs';
import {offlinePlanner} from './lib/offline-fixture.mjs';
const files = new Map([['/', ['index.html','text/html']],['/index.html',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/planning.js',['planning.js','text/javascript']],['/core.js',['core.js','text/javascript']],['/styles.css',['styles.css','text/css']]]);
const csp="default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
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
export function createServer({planning=createPlanningService()}={}) {
  const server=http.createServer(async(req,res)=>{
    const path=req.url?.split('?')[0];
    if(path?.startsWith('/api/')||path?.startsWith('/_AMapService')) {
      const host=req.headers.host,allowed=new Set([`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`]);
      if(!allowed.has(host)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${host}`))return json(res,403,{code:'ORIGIN',message:'只允许本机同源请求'});
      if(path.startsWith('/_AMapService'))return json(res,403,{code:'OFFLINE_ONLY',message:'离线实现：安全代理尚未启用，未发送上游请求'});
      if(req.method==='GET'&&path==='/api/capabilities')return json(res,200,planning.capabilities());
      if(req.method==='GET'&&path==='/api/candidates')return json(res,200,catalog());
      if(req.method==='POST'&&path==='/api/plan') {
        if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return json(res,415,{code:'CONTENT_TYPE',message:'请使用JSON请求'});
        if(Number(req.headers['content-length'])>32768)return json(res,413,{code:'BODY_LIMIT',message:'请求超过32KB上限'});
        try {return json(res,200,await planning.run(await readBody(req)));}
        catch(error) {return json(res,error instanceof PlanningError?error.status:500,{code:error instanceof PlanningError?error.code:'INTERNAL',message:error instanceof PlanningError?error.message:'本地处理失败，输入保留'});}
      }
      return json(res,404,{code:'NOT_FOUND',message:'接口不存在'});
    }
    const entry=files.get(path);
    if(!entry||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
    try {const body=await readFile(new URL(`./web/${entry[0]}`,import.meta.url));res.writeHead(200,{'Content-Type':`${entry[1]}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp});res.end(req.method==='HEAD'?undefined:body);}
    catch {res.writeHead(500);res.end('无法读取页面文件');}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const testMode=process.argv.includes('--offline-test');
  const planning=createPlanningService(testMode?{mode:'offline-test',planner:offlinePlanner}:{});
  const port=testMode?4174:4173;
  createServer({planning}).listen(port,'127.0.0.1',()=>console.log(`行程有解：http://127.0.0.1:${port} ${testMode?'（离线替身测试，不是真实模型/地图）':'（真实生成未授权）'}，Ctrl+C停止`));
}
