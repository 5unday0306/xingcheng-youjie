// Offline-only lab. No SDK, credentials, live APIs, authorization or ledger imports.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
export async function createIsolationLab({parentPort=0,mapPort=0}={}){
 let parentOrigin,mapOrigin;
 const server=kind=>http.createServer(async(req,res)=>{
  const origin=kind==='main'?parentOrigin:mapOrigin,path=new URL(req.url,origin).pathname;
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
  const csp=`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src ${kind==='main'?mapOrigin:"'none'"}; frame-ancestors ${kind==='main'?"'none'":parentOrigin}${kind==='map'?"; sandbox allow-scripts allow-same-origin":''}`;
  const headers={'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(), camera=(), microphone=()','Origin-Agent-Cluster':'?1'};
  if(path==='/favicon.ico'){res.writeHead(204,headers);res.end();return;}
  let body,type='text/javascript';
  try{
   if(path==='/config.js')body=`export const PARENT_ORIGIN=${JSON.stringify(parentOrigin)},MAP_ORIGIN=${JSON.stringify(mapOrigin)};`;
   else if(path==='/map-frame-protocol.js')body=await readFile(new URL('../web/map-frame-protocol.js',import.meta.url));
   else if(path==='/main.js'&&kind==='main')body=await readFile(new URL('../tests/fixtures/map-isolation/main.js',import.meta.url));
   else if(path==='/frame.js'&&kind==='map')body=await readFile(new URL('../tests/fixtures/map-isolation/frame.js',import.meta.url));
   else if(path==='/style.css'){type='text/css';body='body{font:16px system-ui;color:#173f50;background:#f2f7f7;padding:20px}iframe{width:95%;height:380px;border:1px solid #456}button{padding:12px;margin:8px}p{line-height:1.6}';}
   else if((path==='/'&&kind==='main')||(path==='/frame'&&kind==='map')){type='text/html';body=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><script type="module" src="/${kind==='main'?'main':'frame'}.js"></script><title>离线地图隔离评估</title><h1>离线隔离验证 · 没有真实地图</h1>${kind==='main'?'<p id="status">正在加载离线隔离替身</p><button id="focus">列表定位测试终点</button><button id="zoom">缩放消息</button><button id="destroy">销毁</button><p id="selected">尚未选中</p><div id="frameRoot"></div>':'<p>仅验证坐标、选中与视图消息，不绘制合成道路。</p><div id="points"></div><p id="output">等待结构化消息</p><button id="pan">模拟平移消息（非真实地图操作）</button>'}</html>`;}
   else{res.writeHead(404,headers);res.end('Not found');return;}
   res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(body);
  }catch{res.writeHead(500,headers);res.end('Lab file unavailable');}
 });
 const parent=server('main'),map=server('map');
 await new Promise(r=>parent.listen(parentPort,'127.0.0.1',r));parentOrigin=`http://127.0.0.1:${parent.address().port}`;
 await new Promise(r=>map.listen(mapPort,'127.0.0.2',r));mapOrigin=`http://127.0.0.2:${map.address().port}`;
 return {parentOrigin,mapOrigin,close:async()=>{parent.closeAllConnections();map.closeAllConnections();await Promise.all([new Promise(r=>parent.close(r)),new Promise(r=>map.close(r))]);}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const lab=await createIsolationLab({parentPort:4185,mapPort:4186});console.log(`离线隔离验证：${lab.parentOrigin}，地图替身来源：${lab.mapOrigin}；不会调用任何业务接口`);
 process.on('SIGINT',async()=>{await lab.close();process.exit(0);});
}
