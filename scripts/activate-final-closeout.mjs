// Explicit local amendment only. Startup and web requests cannot renew authorization.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readApproval,createLedger} from '../lib/runtime05b.mjs';
if(!process.argv.includes('--confirm-authorized'))throw Error('须先取得五组有限真实验证授权');
const path=new URL('../docs/private/05b-approval.json',import.meta.url),config=JSON.parse(await readFile(new URL('../config/final-closeout.json',import.meta.url),'utf8')),old=await readApproval(path,{allowExpired:true});
if(old.id.startsWith('FINAL-CLOSEOUT-'))throw Error('本批授权已激活，禁止重复续期；请检查实际账本');
const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),old),before=await ledger.summary();
const next={...old,id:'FINAL-CLOSEOUT-'+Date.now(),stages:config.stages,dynamicRuns:config.maxRuns,expiresAt:new Date(Date.now()+config.validHours*3600000).toISOString(),caps:Object.fromEntries(Object.entries(config.additionalCaps).map(([k,v])=>[k,before.counts[k]+v]))};delete next.recoveryAllowance;
const change=await ledger.amend(next,{approved:true,reference:config.reference});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({applied:true,expiresAt:next.expiresAt,maxRuns:next.dynamicRuns,countsPreserved:before.counts,...change});
