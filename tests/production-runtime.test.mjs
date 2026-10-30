import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProductionLedger} from '../lib/production-runtime.mjs';
test('正式任务额度结束后新任务可恢复；失败历史及重启调用记录保留',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'production-ledger-')),path=join(dir,'ledger.json');
 try{let l=createProductionLedger(path);await l.claimDynamicRun();for(let i=0;i<6;i++)await l.reserve('model');await assert.rejects(()=>l.reserve('model'),{code:'CALL_LIMIT'});await l.stop('SDK_FAILED');assert.equal((await l.summary()).stopped,null);await l.claimDynamicRun();await l.reserve('model');l=createProductionLedger(path);await l.claimDynamicRun();await l.reserve('model');assert.equal((await l.summary()).counts.model,8);assert.equal(JSON.parse(await readFile(path)).events.filter(e=>e.code==='SDK_FAILED').length,1);}finally{await rm(dir,{recursive:true,force:true});}
});
test('正式地图并发预留串行记录且频率有限；不同实例不得重复下发配置',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'production-map-'));try{const l=createProductionLedger(join(dir,'ledger.json'));await l.reserve('map');await l.claimMapBootstrap();await assert.rejects(()=>l.claimMapBootstrap(),{code:'MAP_BOOTSTRAP_USED'});await l.reserve('map');await l.claimMapBootstrap();await l.reserve('map');await assert.rejects(()=>l.reserve('map'),{code:'CALL_LIMIT'});assert.equal((await l.summary()).counts.map,3);}finally{await rm(dir,{recursive:true,force:true});}
});
