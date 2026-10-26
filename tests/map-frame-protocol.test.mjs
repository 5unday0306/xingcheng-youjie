import test from 'node:test';import assert from 'node:assert/strict';import {validMessage,createMapEndpoint,validDisplay} from '../web/map-frame-protocol.js';
import {createServer} from '../server.mjs';
const runId='01234567-0123-0123-0123-0123456789ab',msg=(type,payload,seq=1)=>({v:1,runId,seq,type,payload});
test('隔离消息严格数据合同：白名单、尺寸、坐标、个人字段和代码/URL均限制',()=>{
 const display={points:[{id:'TY04',label:'测试落点',position:[112.55,37.87],sequence:1}],segments:[],selectedId:null};
 assert.equal(validDisplay(display),true);assert.equal(validMessage(msg('DISPLAY',display),'map'),true);
 for(const key of ['budget','preference','jsKey','url','code'])assert.equal(validDisplay({...display,[key]:'synthetic'}),false);
 for(const type of ['ROAD_QUERY','LOAD_URL','EVAL','AUTHORIZE'])assert.equal(validMessage(msg(type,{}),'main'),false);
 assert.equal(validDisplay({...display,points:[{...display.points[0],position:[0,0]}]}),false);
 assert.equal(validDisplay({...display,selectedId:'unknown'}),false);
 assert.equal(validDisplay({...display,segments:[{mode:'walk',path:Array(10001).fill([112.55,37.87])}]}),false);
 assert.equal(validMessage({...msg('READY',{}),extra:1},'main'),false);assert.equal(validMessage(msg('READY',{budget:1}),'main'),false);
});
test('地图来源不能跨源调用正式业务或初始化代理；favicon独立204',async()=>{
 let calls=0;const live={action:async()=>{calls++;return {};},proxy:async()=>{calls++;return {};}};
 const server=createServer({live});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const path of ['/api/live/pick/route','/api/live/map-lease']){const r=await fetch(base+path,{method:'POST',headers:{Origin:'http://127.0.0.2:4186','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);}
  const proxy=await fetch(base+'/_AMapService/v3/log/init',{headers:{Origin:'http://127.0.0.2:4186'}});assert.equal(proxy.status,403);assert.equal(calls,0);
  assert.equal((await fetch(base+'/favicon.ico')).status,204);assert.equal((await fetch(base+'/favicon.ico',{method:'HEAD'})).status,204);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('隔离接收同时检查来源、窗口、runId、结构与序号；销毁后忽略迟到消息',()=>{
 const target={postMessage(){}},other={},received=[],host={addEventListener(){},removeEventListener(){}};
 const ep=createMapEndpoint({target,origin:'http://127.0.0.2:4186',runId,role:'main',host,onMessage:m=>received.push(m)}),e={origin:'http://127.0.0.2:4186',source:target,data:msg('READY',{})};
 assert.equal(ep.receive({...e,origin:'null'}),false);assert.equal(ep.receive({...e,source:other}),false);assert.equal(ep.receive({...e,data:{...e.data,runId:'01234567-0123-0123-0123-0123456789ac'}}),false);
 assert.equal(ep.receive(e),true);assert.equal(ep.receive(e),false);ep.dispose();assert.equal(ep.receive({...e,data:msg('READY',{},2)}),false);assert.equal(received.length,1);
});
