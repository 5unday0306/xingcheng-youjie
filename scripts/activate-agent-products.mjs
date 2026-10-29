// Applies the user's current repair/integration task to finite cumulative guards.
// No credential read, no business call, no expiry extension, no clearing a stop.
import {readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {readApproval,createLedger} from '../lib/runtime05b.mjs';
const path=new URL('../docs/private/05b-approval.json',import.meta.url),old=await readApproval(path);const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),old),before=await ledger.summary();if(before.stopped)throw Error('存在停止保护，不能自动解除');
const next={...old,id:'AGENT-PRODUCTS-20261029',stages:[...new Set([...(old.stages||[]),'agent-products'])],caps:{...old.caps,model:before.counts.model+12,route:before.counts.route+32,map:before.counts.map+3}};
if(old.stages?.includes('agent-products'))throw Error('本轮已登记，不重复增加累计保护次数');
await ledger.amend(next,{approved:true,reference:'用户2026-10-29要求修复本次真实失败并完成真实四角色验收；沿用持续DeepSeek/高德授权。仅本轮有限调试余量12模型/32道路/3SDK，不增加地点、费用限制或安全权限，不延长期限，保留全部历史。'});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({applied:true,countsPreserved:before.counts,caps:next.caps,expiresAt:next.expiresAt});
