import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from '../server.mjs';import {createMapContainerServer} from '../lib/map-container-server.mjs';
import {isolatedWorkbenchCsp,mapContainerCsp} from '../lib/content-security-policy.mjs';
import {createFrameMapSession} from '../lib/frame-map-session.mjs';

test('SDK权限仅限子页面，脚本inline及客户端道路API仍禁止',()=>{
 const c=mapContainerCsp('http://127.0.0.1:4177',{sdkEnabled:true});
 const directives=Object.fromEntries(c.split('; ').map(x=>{const [k,...v]=x.split(' ');return [k,v];}));
 assert.ok(directives['script-src'].includes("'unsafe-eval'"));assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
 assert.deepEqual(directives['script-src-attr'],["'none'"]);assert.ok(directives['style-src'].includes("'unsafe-inline'"));
 assert.ok(!c.includes('restapi.amap.com'));assert.ok(!c.includes('https://*.amap.com'));
 assert.ok(!isolatedWorkbenchCsp('http://127.0.0.2:4184').includes('unsafe'));
});

test('运行许可、单次领取、错误运行标识、停止及重复开始保护',async()=>{
 let stopped=false,leases=0,claims=0,events=0;
 const live={frameCheck:async()=>{if(stopped)throw Error('stopped');},action:async p=>{if(p.endsWith('map-lease')){leases++;return {expiresAt:Date.now()+60000};}events++;return {};},frameBootstrap:async()=>{claims++;return {jsKey:'SYNTHETIC_PUBLIC'};},frameStop:async()=>{stopped=true;},frameProxy:async()=>({})};
 const session=createFrameMapSession({live}),id='12345678-1234-1234-1234-123456789abc';
 await assert.rejects(session.bootstrap(id));await session.start(id);assert.equal(leases,1);
 await assert.rejects(session.start(id));await assert.rejects(session.bootstrap('bad'));
 await session.bootstrap(id);await assert.rejects(session.bootstrap(id));assert.equal(claims,1);
 await assert.rejects(session.event(id,'route'));assert.equal(events,0);
 await session.event(id,'map-ready');assert.equal(events,1);
 await session.rejectProxy();assert.equal(stopped,true);await assert.rejects(session.proxy('/v3/log/init',new URLSearchParams()));
});

test('关闭期间迟到的配置不得返回并激活容器',async()=>{
 let release;const pending=new Promise(r=>release=r);let stopped=false;
 const live={frameCheck:async()=>{},action:async()=>({expiresAt:Date.now()+60000}),frameBootstrap:()=>pending,frameStop:async()=>{stopped=true;}};
 const s=createFrameMapSession({live}),id='12345678-1234-1234-1234-123456789abc';await s.start(id);
 const result=s.bootstrap(id);await new Promise(r=>setImmediate(r));await s.end(id);release({jsKey:'SYNTHETIC_PUBLIC'});
 await assert.rejects(result);assert.equal(stopped,true);await assert.rejects(s.event(id,'map-ready'));
});
test('批准权限精确隔离：仅子页面eval，无inline、通配网络或主页面eval',()=>{
 const main=isolatedWorkbenchCsp('http://127.0.0.2:4184'),child=mapContainerCsp('http://127.0.0.1:4177');
 assert.ok(!main.includes('unsafe-eval'));assert.ok(child.includes("script-src 'self' 'unsafe-eval'"));
 for(const c of [main,child]){assert.ok(!c.includes('unsafe-inline'));assert.ok(!c.includes('*'));assert.ok(!c.includes('amap.com'));}
 assert.ok(child.includes("connect-src 'none'"));assert.ok(child.includes('sandbox allow-scripts allow-same-origin'));
});
test('正式容器服务只有静态资源；配置/代理/API未启用；主页面拒绝许可和代理回退',async()=>{
 const origins={};let actions=0,proxies=0;const live={capabilities:()=>({canPrepare:true,canGenerate:true}),action:async()=>{actions++;return {};},proxy:async()=>{proxies++;return {};}};
 const main=createServer({planning:live,live,mapFrameOrigin:()=>origins.mapOrigin}),child=createMapContainerServer({getOrigins:()=>origins});
 await new Promise(r=>main.listen(0,'127.0.0.1',r));await new Promise(r=>child.listen(0,'127.0.0.2',r));origins.parentOrigin='http://127.0.0.1:'+main.address().port;origins.mapOrigin='http://127.0.0.2:'+child.address().port;
 try{
  const caps=await(await fetch(origins.parentOrigin+'/api/capabilities')).json();assert.equal(caps.canPrepare,false);assert.equal(caps.canGenerate,false);
  assert.equal((await fetch(origins.mapOrigin+'/container')).status,403);
  const frame=await fetch(origins.mapOrigin+'/container',{headers:{'Sec-Fetch-Dest':'iframe'}});assert.equal(frame.status,200);assert.ok(frame.headers.get('content-security-policy').includes('unsafe-eval'));
  for(const p of ['/frame/bootstrap','/frame/event','/_AMapService/v3/log/init','/api/live/map-lease'])assert.equal((await fetch(origins.mapOrigin+p)).status,404);
  for(const p of ['/api/live/map-lease','/api/live/sdk-event'])assert.equal((await fetch(origins.parentOrigin+p,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(origins.parentOrigin+'/_AMapService/v3/log/init')).status,403);assert.equal(actions,0);assert.equal(proxies,0);
 }finally{main.closeAllConnections();child.closeAllConnections();await Promise.all([new Promise(r=>main.close(r)),new Promise(r=>child.close(r))]);}
});
