// Explicit local application of the user's standing 05B development authorization.
// No credentials, no business requests; appends authorization and retains all entries/stops.
import {readFile,writeFile} from 'node:fs/promises';import {readApproval,createLedger} from '../lib/runtime05b.mjs';import {fileURLToPath} from 'node:url';
const config=JSON.parse(await readFile(new URL('../config/development05b.json',import.meta.url),'utf8'));
const path=new URL('../docs/private/05b-approval.json',import.meta.url),old=await readApproval(path,{allowExpired:true});
const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),old);
const next={version:1,id:'05B-DEVELOPMENT-20261027',enabled:true,policy:config.policy,flow:config.flow,expiresAt:new Date(Date.now()+config.sessionHours*3600000-60000).toISOString(),termsConfirmed:true,accountCostBoundConfirmed:true,model:old.model,budgetCents:null,caps:config.caps,reserveCents:config.reserveCents};
const result=await ledger.amend(next,{approved:true,reference:config.reference+(process.argv[2]?'；修复记录：'+process.argv[2]:'')});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({authorizationApplied:true,...result});
