// Explicit user-approved transition; never invoked by HTTP, startup or refresh.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {readApproval,createLedger} from '../lib/runtime05b.mjs';
if(!process.argv.includes('--confirm-authorized'))throw Error('需要本轮用户明确批准');
const path='docs/private/05b-approval.json',old=await readApproval(path,{allowExpired:true});if(old.stages.includes('confirmation-negotiation'))throw Error('本批已激活，不重复启动或续期');
const ledger=createLedger('docs/private/05b-ledger.json',old),before=await ledger.summary();if(JSON.stringify(before.counts)!==JSON.stringify({model:107,route:520,location:11,map:70}))throw Error('基线改变，先复核');
// Conservative receipt anchor: before the first 02:46:51 check, not activation time.
const issuedAt='2026-10-30T18:46:00.000Z',expiresAt='2026-10-30T19:31:00.000Z';
const caps={model:113,route:552,location:11,map:71},allowance={model:6,route:32,location:0,map:1};
const next={...old,id:'CONFIRM-NEGOTIATION-'+Date.now(),sdkOnly:false,diagnosticOnly:false,dynamicRuns:1,stages:[...old.stages,'confirmation-negotiation'],expiresAt,caps,recoveryAllowance:{baseCounts:before.counts,caps:allowance}};
await mkdir('docs/private/confirmation-real',{recursive:true});
await writeFile('docs/private/confirmation-real/authorization-before.json',JSON.stringify(old,null,2));
await writeFile('docs/private/confirmation-real/state-before.json',await readFile('docs/private/08-state.json'));
await ledger.amend(next,{approved:true,reference:'用户明确同意一次真实多人候选验收：确认起45分钟、1轮/6模型/8候选/32新道路/1SDK/地点0，并发1、单请求60秒内、整轮12分钟、失败不自动重试；复用有效数据，不替用户采用，不购买、不新增安全权限；保留全部旧记录'});
await writeFile(path,JSON.stringify(next,null,2));await writeFile('docs/private/confirmation-real/authorization.json',JSON.stringify({issuedAt,expiresAt,activatedAt:new Date().toISOString(),before:before.counts,caps,allowance,previousStop:before.stopped},null,2));console.log({issuedAt,expiresAt,before:before.counts,caps});
