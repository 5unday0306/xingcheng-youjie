import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from '../server.mjs';
import {createPlanningService} from '../lib/planning.mjs';
import {offlinePlanner} from '../lib/offline-fixture.mjs';
import {defaultDraft,toRequest} from '../web/core.js';
async function local(fn,options) {
  const server=createServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}
}
const post=(base,body,headers={})=>fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const request=()=>toRequest(defaultDraft());
test('默认API能力显示未授权，不能以参数或请求字段开启真实调用',()=>local(async base=>{
  const cap=await(await fetch(`${base}/api/capabilities`)).json();assert.equal(cap.mode,'offline');assert.equal(cap.canGenerate,false);assert.equal(cap.configuration,'未读取本机凭据');
  const r=await post(base,{...request(),mode:'online',authorization:true});assert.equal(r.status,403);assert.equal((await r.json()).code,'OFFLINE_ONLY');
}));
test('API阻止异源、跨站与伪造Host，接口不能充当开放代理',()=>local(async base=>{
  for(const headers of [{Origin:'https://example.invalid'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await fetch(`${base}/api/candidates`,{headers})).status,403,JSON.stringify(headers));
  // Node fetch normalizes Host. Use the HTTP client to send the actual hostile header.
  const hostStatus=await new Promise((resolve,reject)=>http.get(`${base}/api/candidates`,{headers:{Host:'example.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));assert.equal(hostStatus,403);
  const r=await fetch(`${base}/_AMapService/v3/direction/walking?url=https://example.invalid&key=CANARY_SECRET`);assert.equal(r.status,403);assert.ok(!(await r.text()).includes('CANARY_SECRET'));
  assert.equal((await fetch(`${base}/api/proxy?url=https://example.invalid`)).status,404);
}));
test('JSON类型、格式和请求大小限制在进入测试规划之前生效',()=>local(async base=>{
  assert.equal((await post(base,'{}',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post(base,'{')).status,400);assert.equal((await post(base,' '.repeat(33000))).status,413);
  const bad=request();bad.members[0].budget=null;assert.equal((await post(base,bad)).status,422);
}));
test('候选与静态响应不下发凭据或服务端代码，CSP仅开放本机连接',()=>local(async base=>{
  const r=await fetch(base);const csp=r.headers.get('content-security-policy');assert.ok(csp.includes("connect-src 'self'"));assert.ok(!csp.includes('amap.com'));
  const c=await(await fetch(`${base}/api/candidates`)).json();assert.equal(c.candidates.length,4);assert.equal(c.candidates[0].opening.value,null);
  for(const path of ['/.env','/.env.example','/data/taiyuan.mjs','/lib/planning.mjs','/server.mjs','/.git/config'])assert.equal((await fetch(base+path)).status,404);
  const text=JSON.stringify(c);for(const word of ['AMAP_WEB_SERVICE_KEY','DEEPSEEK_API_KEY','AMAP_JS_SECURITY_CODE'])assert.ok(!text.includes(word));
}));
test('显式测试服务运行当前日期人数天数，输出替身标记且真实调用全0',()=>local(async base=>{
  for(const [people,days] of [[1,1],[3,2],[6,3]]) {
    const d=defaultDraft();d.people=people;d.dayCount=days;d.days=Array.from({length:days},()=>({start:'09:00',end:'18:00'}));
    d.members=Array.from({length:people},(_,i)=>({id:`p-${i}`,name:`匿名${i+1}`,preference:`测试${i}`,budget:'600',walking:Array(days).fill('6')}));
    d.startDate='2026-11-14';const r=await post(base,toRequest(d));assert.equal(r.status,200);const body=await r.json();assert.equal(body.mode,'offline-test');assert.ok(body.label.includes('非真实'));
    assert.equal(body.review.days.length,days);assert.equal(body.review.members.length,people);assert.equal(body.review.days[0].date,'2026-11-14');assert.equal(body.review.executable,false);
    assert.deepEqual(body.realCalls,{model:0,location:0,route:0,map:0});assert.equal(body.testAdapterInvocations.model,1);assert.equal(body.testAdapterInvocations.route,0);
  }
},{planning:createPlanningService({mode:'offline-test',planner:offlinePlanner})}));
test('HTTP模型错误脱敏且保留失败状态，未假报草案成功',()=>local(async base=>{
  const response=await post(base,request());assert.equal(response.status,502);const body=await response.text();assert.ok(!body.includes('CANARY_SECRET'));assert.ok(body.includes('PLANNER_FAILED'));
},{planning:createPlanningService({mode:'offline-test',planner:async()=>{throw Error('CANARY_SECRET');}})}));
test('HTTP并发重复点击只启动一次替身',()=>{
  let release,entered;const started=new Promise(r=>{entered=r;});let calls=0;
  const planning=createPlanningService({mode:'offline-test',planner:async p=>{calls++;entered();await new Promise(r=>{release=r;});return offlinePlanner(p);}});
  return local(async base=>{const first=post(base,request());await started;const second=await post(base,request());assert.equal(second.status,409);release();assert.equal((await first).status,200);assert.equal(calls,1);},{planning});
});
