import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const files=new Map([
  ['/preview/planning-desk/',['index.html','text/html']],
  ['/preview/planning-desk/styles.css',['styles.css','text/css']],
  ['/preview/planning-desk/preview.js',['preview.js','text/javascript']],
]);
export function createPreviewServer(){return http.createServer(async(req,res)=>{
  const path=req.url?.split('?')[0];
  if(path==='/'&&req.method==='GET'){res.writeHead(302,{Location:'/preview/planning-desk/'});res.end();return;}
  const entry=files.get(path);
  if(!entry||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const body=await readFile(new URL(entry[0],import.meta.url));res.writeHead(200,{'Content-Type':`${entry[1]}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:body);}
  catch{res.writeHead(500);res.end('预览文件不可用');}
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createPreviewServer().listen(4175,'127.0.0.1',()=>console.log('设计预览：http://127.0.0.1:4175/preview/planning-desk/ （不保存，不调用接口）'));
