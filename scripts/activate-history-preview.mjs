// Local explicit authorization only; this script has no web endpoint.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readApproval,createLedger} from '../lib/runtime05b.mjs';
if(!process.argv.includes('--confirm-authorized'))throw Error('先取得历史预览恢复的明确授权');
const path=new URL('../docs/private/05b-approval.json',import.meta.url),old=await readApproval(path,{allowExpired:true});
if(old.stages?.includes('history-preview-restore'))throw Error('本次历史恢复已激活，不重复续期');
const source=JSON.parse(await readFile(new URL('../docs/private/final-closeout-delivery-session-2026-10-30/manifest.json',import.meta.url),'utf8'))[0].source.replace(/^\/c\//,'C:/');
const events=(await readFile(source,'utf8')).trimEnd().split('\n');
const confirmed=events.map(x=>{try{return JSON.parse(x);}catch{return null;}}).filter(x=>x?.type==='response_item'&&x.payload?.role==='user'&&x.payload.content?.some(c=>c.text?.includes('允许这次历史预览恢复'))).at(-1);
if(!confirmed)throw Error('未找到本次用户明确恢复决定');
const expiresAt=new Date(Date.parse(confirmed.timestamp)+30*60000).toISOString();if(Date.parse(expiresAt)<=Date.now())throw Error('本次恢复已过期');
const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),old),before=await ledger.summary();
const next={...old,stages:[...old.stages,'history-preview-restore'],expiresAt,caps:{...before.counts,route:before.counts.route+8,map:before.counts.map+1},recoveryAllowance:{baseCounts:before.counts,caps:{model:0,location:0,route:8,map:1}}};
const reference='2026-10-31用户明确允许历史预览恢复：确认起30分钟，SDK1/已选道路8/模型0/地点0，并发1、单请求60秒、失败不自动重试；旧记录全保留，不代为采用';
const result=await ledger.amend(next,{approved:true,reference});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({expiresAt,countsPreserved:before.counts,...result});
