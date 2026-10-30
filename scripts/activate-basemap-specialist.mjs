// Explicit local amendment. Never invoked by startup, refresh or HTTP.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {readApproval,createLedger} from '../lib/runtime05b.mjs';
if(!process.argv.includes('--confirm-authorized'))throw Error('须取得本轮单次底图专项明确授权');
const path='docs/private/05b-approval.json',old=await readApproval(path,{allowExpired:true});if(old.id.startsWith('BASEMAP-SPECIAL-'))throw Error('本批已激活，禁止重复激活或续期');
const l=createLedger('docs/private/05b-ledger.json',old),before=await l.summary(),issuedAt=new Date().toISOString();
if(before.counts.map!==69)throw Error('实际基线已变，先复核');
const next={...old,id:'BASEMAP-SPECIAL-'+Date.now(),sdkOnly:true,dynamicRuns:0,stages:[...new Set([...old.stages,'basemap-specialist'])],expiresAt:new Date(Date.now()+30*60000).toISOString(),caps:{...before.counts,map:before.counts.map+1},recoveryAllowance:{baseCounts:before.counts,caps:{model:0,route:0,location:0,map:1}}};
await mkdir('docs/private/basemap-specialist',{recursive:true});await writeFile('docs/private/basemap-specialist/authorization-before.json',JSON.stringify(old,null,2));
await l.amend(next,{approved:true,reference:'本轮用户明确批准单次真实底图专项：30分钟/SDK1/模型道路地点0，允许底图显示拖动缩放与窄屏切换，失败即停不重试；不生成候选、不修改采用或锁定、不新增安全权限'});await writeFile(path,JSON.stringify(next,null,2));await writeFile('docs/private/basemap-specialist/authorization.json',JSON.stringify({issuedAt,expiresAt:next.expiresAt,before:before.counts},null,2));console.log({issuedAt,expiresAt:next.expiresAt,before:before.counts});
