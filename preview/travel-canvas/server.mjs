import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const prefix='/preview/travel-canvas/';
const files=new Map([[prefix,['index.html','text/html']],[prefix+'canvas.css',['canvas.css','text/css']],[prefix+'canvas.js',['canvas.js','text/javascript']],[prefix+'core.js',['../../web/core.js','text/javascript']]]);
export function createCanvasServer(){return http.createServer(async(req,res)=>{
  const path=req.url?.split('?')[0];if(path==='/'&&req.method==='GET'){res.writeHead(302,{Location:prefix});res.end();return;}
  const file=files.get(path);if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const bytes=await readFile(new URL(file[0],import.meta.url));res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500);res.end('预览暂不可用');}
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createCanvasServer().listen(4176,'127.0.0.1',()=>console.log('动态设计预览：http://127.0.0.1:4176/preview/travel-canvas/'));
