import test from 'node:test';
import assert from 'node:assert/strict';
import {localCsp,realMapCsp} from '../lib/content-security-policy.mjs';
import {safeLocation,diagnosticRecord} from '../web/sdk-diagnostics.js';
import {validateApproval,createLedger} from '../lib/runtime05b.mjs';
import {createLivePlanning} from '../lib/live-planning.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('SDK策略：普通模式不允许外域；真实模式只有明确脚本来源且无inline/eval',()=>{
  assert.match(localCsp,/script-src 'self';/);assert.ok(!localCsp.includes('amap.com'));
  assert.equal(realMapCsp.split('; ').find(x=>x.startsWith('script-src ')),"script-src 'self' https://webapi.amap.com https://jsapi-service.amap.com");
  assert.ok(!realMapCsp.includes('unsafe-eval'));assert.ok(!realMapCsp.includes("script-src 'self' 'unsafe-inline'"));
});
test('M3仅在独立底图范围允许第三次；底图就绪仍拒绝选点/道路/模型且失败后拒绝迟到就绪',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sdk-only-test-'));
  try{
    const a={version:1,id:'SDK_ONLY_TEST',enabled:true,flow:'map-pick',sdkOnly:true,expiresAt:new Date(Date.now()+3600000).toISOString(),termsConfirmed:true,accountCostBoundConfirmed:true,model:'deepseek-flash',budgetCents:100,caps:{model:1,location:7,route:12,map:2},reserveCents:{model:10,location:1,route:1,map:5},recoveryAllowance:{baseCounts:{model:0,location:0,route:0,map:0},caps:{model:0,location:0,route:0,map:1}}};
    assert.equal(validateApproval(a),a);assert.throws(()=>validateApproval({...a,caps:{...a.caps,map:3}}),e=>e.code==='AUTH_INVALID');
    const m3={...a,caps:{...a.caps,map:3},recoveryAllowance:{baseCounts:{model:0,location:5,route:0,map:2},caps:{model:0,location:0,route:0,map:1}}};
    assert.equal(validateApproval(m3),m3);assert.throws(()=>validateApproval({...m3,sdkOnly:false}),e=>e.code==='AUTH_INVALID');assert.throws(()=>validateApproval({...m3,recoveryAllowance:{...m3.recoveryAllowance,caps:{model:0,location:0,route:1,map:1}}}),e=>e.code==='AUTH_INVALID');
    const ledger=createLedger(join(dir,'ledger.json'),a);let sends=0;
    const live=createLivePlanning({credentials:{jsKey:'TEST_PUBLIC',jsSecurityCode:'TEST_SERVER'},approval:a,ledger,send:async()=>{sends++;throw Error('must not send');}});
    assert.equal(live.capabilities().mapDisplayOnly,true);await live.action('/api/live/map-lease',{});await live.action('/api/live/sdk-event',{event:'map-ready'});
    for(const action of ['pick/begin','pick/set','pick/confirm','pick/route','locate','road-test','accept-proof'])await assert.rejects(live.action('/api/live/'+action,{}),e=>e.code==='SDK_ONLY');
    await assert.rejects(live.run({}),e=>e.code==='MAP_PICK_ONLY');await live.action('/api/live/sdk-event',{event:'sdk-failed'});
    await assert.rejects(live.action('/api/live/sdk-event',{event:'map-ready'}),e=>e.code==='AUTH_REQUIRED');
    assert.equal((await live.action('/api/live/pick/state',{})).mapReady,false);assert.equal((await ledger.summary()).stopped.code,'SDK_FAILED');assert.equal(sends,0);assert.equal((await ledger.summary()).counts.map,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('SDK诊断：不保留查询、fragment、用户名密码、javascript正文或长标识符',()=>{
  assert.deepEqual(safeLocation('https://name:secret@jsapi-service.amap.com/mapsplugincdn?key=CANARY_SECRET&jscode=CANARY_OTHER#token'),{origin:'https://jsapi-service.amap.com',path:'/mapsplugincdn'});
  assert.deepEqual(safeLocation('javascript:CANARY_SECRET'),{origin:'javascript:',path:''});
  for(const special of ['inline','eval','wasm-eval'])assert.deepEqual(safeLocation(special),{origin:special,path:''});
  const record=diagnosticRecord({kind:'csp',directive:'script-src-elem',url:'https://example.invalid/a?key=CANARY_SECRET',source:'http://localhost/sdk.js?jscode=CANARY_OTHER',line:12,column:9,resourceType:'script',status:404});
  assert.equal(record.status,404);assert.equal(record.initiator.line,12);assert.ok(!JSON.stringify(record).includes('CANARY'));
  assert.equal(safeLocation('https://example.invalid/0123456789abcdef0123456789abcdef').path,'/[redacted]');
});

test('单轮确认验收累计SDK71必须显式阶段，恢复额度保留旧次数且不允许地点',async()=>{
 const a={version:1,id:'SYNTHETIC_CONFIRMATION',enabled:true,policy:'development-05b',flow:'product-05b',expiresAt:new Date(Date.now()+60000).toISOString(),termsConfirmed:true,accountCostBoundConfirmed:true,model:'deepseek-flash',budgetCents:null,stages:['dynamic-input','negotiation-comparison','confirmation-negotiation'],dynamicRuns:1,caps:{model:113,route:552,location:11,map:71},reserveCents:{model:10,route:1,location:1,map:5},recoveryAllowance:{baseCounts:{model:107,route:520,location:11,map:70},caps:{model:6,route:32,location:0,map:1}}};
 assert.equal(validateApproval(a),a);assert.throws(()=>validateApproval({...a,stages:a.stages.filter(s=>s!=='confirmation-negotiation')}),e=>e.code==='AUTH_INVALID');assert.throws(()=>validateApproval({...a,caps:{...a.caps,map:72}}),e=>e.code==='AUTH_INVALID');
 const dir=await mkdtemp(join(tmpdir(),'confirmation-allowance-'));try{const ledger=createLedger(join(dir,'ledger.json'),{...a,caps:{model:6,route:32,location:0,map:1},recoveryAllowance:{baseCounts:{model:0,route:0,location:0,map:0},caps:{model:6,route:32,location:0,map:1}}});await ledger.claimDynamicRun();await assert.rejects(ledger.claimDynamicRun(),e=>e.code==='ROUND_LIMIT');await assert.rejects(ledger.reserve('location'),e=>e.code==='RECOVERY_LIMIT');await ledger.reserve('map');await assert.rejects(ledger.reserve('map'),e=>e.code==='RECOVERY_LIMIT');}finally{await rm(dir,{recursive:true,force:true});}
});
