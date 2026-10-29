// Explicit local application of the user's task07 decision; no business requests.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readApproval,createLedger} from '../lib/runtime05b.mjs';
const root=new URL('../',import.meta.url),path=new URL('docs/private/05b-approval.json',root);
const old=await readApproval(path,{allowExpired:true}),ledger=createLedger(fileURLToPath(new URL('docs/private/05b-ledger.json',root)),old);
const config=JSON.parse(await readFile(new URL('config/development07.json',root),'utf8'));
const next={...old,id:'TASK07-DEVELOPMENT',stages:config.stages,expiresAt:new Date(Date.now()+23*3600000).toISOString(),caps:{...old.caps,model:config.modelCap}};
const result=await ledger.amend(next,{approved:true,reference:config.reference});
await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({authorizationApplied:true,...result});
