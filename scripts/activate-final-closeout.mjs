// Explicit local amendment only. Startup and web requests cannot renew authorization.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readApproval,createLedger} from '../lib/runtime05b.mjs';
if(!process.argv.includes('--confirm-authorized'))throw Error('须先取得五组有限真实验证授权');
const path=new URL('../docs/private/05b-approval.json',import.meta.url),config=JSON.parse(await readFile(new URL('../config/final-closeout.json',import.meta.url),'utf8')),old=await readApproval(path,{allowExpired:true});
const finish=process.argv.includes('--finish-one'),recovery=process.argv.includes('--recovery')||finish;if(recovery&&(!old.id.startsWith('FINAL-CLOSEOUT-')||old.dynamicRuns!==(finish?6:5)||Date.parse(old.expiresAt)<=Date.now()))throw Error('仅适用本轮仍未到期的五组授权恢复');
if(!recovery&&old.id.startsWith('FINAL-CLOSEOUT-'))throw Error('本批授权已激活，禁止重复续期；请检查实际账本');
const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),old),before=await ledger.summary();
const next={...old,id:recovery?old.id:'FINAL-CLOSEOUT-'+Date.now(),stages:recovery?[...config.stages,'final-closeout']:config.stages,dynamicRuns:finish?7:recovery?6:config.maxRuns,expiresAt:recovery?old.expiresAt:new Date(Date.now()+config.validHours*3600000).toISOString(),caps:Object.fromEntries(Object.entries(finish?{model:Math.max(0,old.caps.model-before.counts.model),route:21,location:0,map:Math.max(0,old.caps.map-before.counts.map)}:recovery?{model:18,route:48,location:0,map:2}:config.additionalCaps).map(([k,v])=>[k,before.counts[k]+v]))};delete next.recoveryAllowance;
const change=await ledger.amend(next,{approved:true,reference:finish?'用户明确允许最后一组：额外1启动/21新道路，模型最多6和SDK最多1用现有余量，原到期不延长，失败不自动重试，保留历史':recovery?'用户明确回复好：偏好/人数/可调整目标锁定午餐3组，额外18模型/48道路/2SDK，原到期不延长，无自动失败重试，旧记录全部保留':config.reference});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({applied:true,expiresAt:next.expiresAt,maxRuns:next.dynamicRuns,countsPreserved:before.counts,...change});
