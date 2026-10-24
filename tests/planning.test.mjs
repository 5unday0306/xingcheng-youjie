import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../data/taiyuan.mjs';
import {defaultDraft,toRequest} from '../web/core.js';
import {validateInput,modelInput,parsePlan,requiredLegs,reviewPlan,createPlanningService,scaledLimit} from '../lib/planning.mjs';
const input=()=>toRequest(defaultDraft());
const planFor=r=>({version:1,days:r.days.map((d,i)=>({date:d.date,items:[{type:'visit',candidateId:i===0?'TY01':i===1?'TY04':'TY05',durationMinutes:i===0?150:45,reason:'离线测试选择，不代表优化结果'},{type:'meal',reason:'门店待选'}]}))});
const service=(options={})=>createPlanningService({mode:'offline-test',planner:async p=>JSON.stringify(planFor(p)),...options});
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);
test('预算与步行上限按分/米保守精确转换，不因浮点误差或四舍五入放宽',()=>{
  assert.equal(scaledLimit(1.001,1000),1001);assert.equal(scaledLimit(1.005,100),100);assert.equal(scaledLimit(1e-7,1000),0);assert.equal(scaledLimit(0,100),0);
});
test('候选字段保留来源、估计和未知；目录副本不能污染源',()=>{
  const d=catalog();assert.equal(d.candidates.length,4);assert.equal(d.candidates[0].ticketCents.value,null);
  assert.equal(d.candidates[0].opening.status,'unknown');assert.equal(d.candidates[0].internalMeters.status,'estimate');
  const sources=new Set(d.sources.map(s=>s.id));for(const c of d.candidates)for(const s of c.entrance.sources)assert.ok(sources.has(s));
  d.candidates[0].name='污染';assert.equal(catalog().candidates[0].name,'山西博物院');
});
test('服务端重新校验坏输入和文本体积，不只依赖浏览器',()=>{
  const r=input();r.members[0].budget=null;assert.throws(()=>validateInput(r),e=>e.code==='INVALID_INPUT');
  r.members[0].budget=600;r.members[0].preference='x'.repeat(2001);assert.throws(()=>validateInput(r),e=>e.code==='INPUT_LIMIT');
});
test('模型交接不带显示名、持久成员ID或请求附加字段',()=>{
  const r=input();r.days[0].extra='SECRET';r.members[0].name='PRIVATE';r.members[0].id='PRIVATE-ID';
  const text=JSON.stringify(modelInput(r));assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('PRIVATE'));assert.ok(text.includes('历史展览'));
});
test('坏JSON、未知ID、额外坐标/票价、日期错位、重复候选及超区间均拒绝',()=>{
  const r=input();assert.throws(()=>parsePlan('{',r),e=>e.code==='MODEL_JSON');
  for(const change of [p=>p.days[0].items[0].candidateId='invented',p=>p.days[0].items[0].coordinates=[1,2],p=>p.days[0].items[0].price=0,p=>p.days[0].date='2026-11-08',p=>p.days[1].items[0]={...p.days[0].items[0]},p=>p.days[0].items[0].durationMinutes=10,p=>p.days[0].items.pop()]) {
    const p=planFor(r);change(p);assert.throws(()=>parsePlan(JSON.stringify(p),r),e=>e.code==='PLAN_SCHEMA');
  }
});
test('各日必须保留出发/相邻/午餐/返回路段，不跨过未知午餐连线',async()=>{
  const r=input(),p=planFor(r),required=requiredLegs(p);assert.equal(required.length,6);
  assert.equal(required[0].from,'ENDPOINT');assert.equal(required[2].to,'ENDPOINT');
  const out=await service().run(r);assert.equal(out.review.days[0].legs.length,3);assert.ok(out.review.days[0].legs[1].reason.includes('午餐'));
  assert.equal(out.review.days[0].time.value,null);assert.equal(out.review.days[0].members[0].walking.value,null);assert.equal(out.review.members[0].budget.value,null);
  assert.equal(out.review.executable,false);assert.equal(out.review.status,'insufficient');assert.deepEqual(out.realCalls,{model:0,location:0,route:0,map:0});
});
test('缺营业/交通/餐费不能变成0或通过；遗漏传入路段也保留未知',()=>{
  const r=input(),out=reviewPlan(r,planFor(r),[]);assert.equal(out.days[0].time.value,null);assert.equal(out.days[0].legs.length,3);
  assert.ok(out.days[0].messages.some(s=>s.includes('开放')));assert.equal(out.members[0].budget.value,null);
});
test('每人每日独立判步行，不用其他人的额度抵销',async()=>{
  const r=input();r.members[0].walking=[0.5,6];r.members[1].walking=[6,0.5];
  const out=(await service().run(r)).review;assert.equal(out.days[0].members[0].walking.status,'conflict');assert.equal(out.days[0].members[1].walking.status,'insufficient');
  assert.equal(out.days[1].members[1].walking.status,'conflict');assert.equal(out.status,'conflict');
});
test('逐人预算：有未知仍能证明已知部分超支；公交不按人数均分',async()=>{
  const r=input();r.members[0].budget=1;
  const route=async()=>({mode:'transit',minutes:[10,15],walkingMeters:[100,200],fareCentsPerPerson:[200,200],excludesInternal:true});
  const out=(await service({route}).run(r)).review;
  assert.equal(out.members[0].budget.status,'conflict');assert.equal(out.members[0].budget.knownSubtotal[0],400);
  assert.equal(out.members[1].budget.status,'insufficient');assert.equal(out.members[1].budget.knownSubtotal[0],400);
});
test('每日已知游玩下界超可用时间即冲突，即使交通未知',async()=>{
  const r=input();r.days[0].end='10:00';const out=(await service().run(r)).review;assert.equal(out.days[0].time.status,'conflict');
});
test('已知当日开放窗与入场限时冲突被程序指出，常规参考不升级为当日事实',()=>{
  const r=input(),p=planFor(r),d=catalog();d.candidates[0].opening={status:'fact',value:[540,600],applicableDate:r.days[0].date};
  const leg={...requiredLegs(p)[0],status:'available',minutes:[90,100],walkingMeters:[0,0],fareCentsPerPerson:[0,0],excludesInternal:true};
  const out=reviewPlan(r,p,[leg],d);assert.equal(out.days[0].time.status,'conflict');assert.ok(out.days[0].messages.some(s=>s.includes('入场窗口')));
  d.candidates[0].opening.applicableDate='2026-11-01';assert.ok(reviewPlan(r,p,[leg],d).days[0].messages.some(s=>s.includes('未核实')));
});
test('重叠街区内部步行不能直接相加导致假冲突',()=>{
  const r=input(),p=planFor(r);p.days[0].items=[{type:'visit',candidateId:'TY05',durationMinutes:45,reason:'测试'},{type:'visit',candidateId:'TY06',durationMinutes:45,reason:'测试'},{type:'meal',reason:'待选'}];
  p.days[1].items=[{type:'meal',reason:'待选'}];r.members.forEach(m=>m.walking[0]=0.6);
  const out=reviewPlan(r,p,[]);assert.equal(out.days[0].members[0].walking.status,'insufficient');assert.ok(out.days[0].messages.some(s=>s.includes('重叠')));
});
test('默认服务即使注入替身也禁止运行，不读凭据、不调用适配器',async()=>{
  let called=0;const s=createPlanningService({planner:async()=>{called++;}});await rejects(s.run(input()),'OFFLINE_ONLY');assert.equal(called,0);assert.equal(s.capabilities().realCallsAllowed,false);
});
test('模型超时后终止、无交通调用或自动重试',async()=>{
  let model=0,route=0;const s=service({timeoutMs:15,planner:async(_,ctx)=>{model++;return new Promise(resolve=>ctx.signal.addEventListener('abort',()=>resolve('{}')));},route:async()=>{route++;}});
  await rejects(s.run(input()),'TIMEOUT');assert.equal(model,1);assert.equal(route,0);
});
test('错误JSON或上游异常不继续路段、不泄露原始错误',async()=>{
  let calls=0;await rejects(service({planner:async()=>'{',route:async()=>{calls++;}}).run(input()),'MODEL_JSON');
  await assert.rejects(service({planner:async()=>{throw Error('SECRET-URL');}}).run(input()),e=>e.code==='PLANNER_FAILED'&&!e.message.includes('SECRET'));
  assert.equal(calls,0);
});
test('重复运行并发被拦截，结束后允许新的离线测试',async()=>{
  let release;const s=service({planner:()=>new Promise(resolve=>{release=resolve;})});const first=s.run(input());
  await rejects(s.run(input()),'BUSY');release(JSON.stringify(planFor(input())));await first;
  const second=s.run(input());release(JSON.stringify(planFor(input())));await second;
});
test('道路失败或非法交通方式停止后续查询，已完成部分不冒充全路线',async()=>{
  for(const mode of ['fail','taxi']) {
    let calls=0;const out=await service({route:async()=>{calls++;if(mode==='fail')throw Error('SECRET');return {mode:'taxi'};}}).run(input());
    assert.equal(calls,1);assert.equal(out.review.days[0].legs[0].status,'missing');assert.equal(out.review.days[1].legs[0].reason,'前段失败，未调用');
    assert.equal(out.review.executable,false);
  }
});
test('超大匿名输入在适配器前被保守token上限拦截',async()=>{
  const r=input();r.members.forEach(m=>m.preference='中'.repeat(1500));let called=0;
  await rejects(service({planner:async()=>{called++;}}).run(r),'PROMPT_LIMIT');assert.equal(called,0);
});
