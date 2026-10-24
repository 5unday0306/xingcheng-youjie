import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']],['/index.html',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/core.js',['core.js','text/javascript']],['/styles.css',['styles.css','text/css']]]);
export function createServer(){return http.createServer(async(req,res)=>{
  const entry=files.get(req.url?.split('?')[0]);
  if(!entry || !['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const body=await readFile(new URL(`./web/${entry[0]}`,import.meta.url));res.writeHead(200,{'Content-Type':`${entry[1]}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500);res.end('无法读取页面文件');}
});}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){createServer().listen(4173,'127.0.0.1',()=>console.log('行程有解：http://127.0.0.1:4173 （Ctrl+C停止）'));}
