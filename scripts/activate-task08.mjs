import {readFile,writeFile,access} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {createLedger,readApproval} from '../lib/runtime05b.mjs';import {defaultDraft,toRequest} from '../web/core.js';import {case06RequestHash} from '../lib/case06-draft.mjs';
const root=new URL('../',import.meta.url),path=new URL('docs/private/05b-approval.json',root),statePath=new URL('docs/private/08-state.json',root);
try{await access(statePath);}catch(e){if(e.code!=='ENOENT')throw e;
 const request=toRequest(defaultDraft());let s;
 try{const response=await fetch('http://127.0.0.1:4177/api/live/agents/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request})});s=(await response.json()).state;}catch{
   const evidence=JSON.parse(await readFile(new URL('docs/verification/task07-real-a5-agents.json',root),'utf8'));
   const journal=JSON.parse(await readFile(new URL(`docs/private/07-${evidence.id}.json`,root),'utf8'));
   if(journal.status!=='preview'&&journal.status!=='rejected')throw Error('私有采用状态有变化，不能自动选用07原方案');
   s={...evidence,status:journal.status};s.original.versionId=`task07-${evidence.id}-original`;console.log({baselineSource:'committed-real-task07-original-plus-private-decision-journal',previousServiceUnavailable:true});
 }
 if(!s?.original||!['preview','rejected','accepted'].includes(s.status))throw Error('请先在当前服务核对实际采用版本，不能猜测基线');
 const adopted=s.status==='accepted'?s.preview:s.original,origin=s.status==='accepted'?'用户实际采用07修订':'07修订未采用，沿用原方案';
 // Only the visit structure/request/transport mode references survive restart.
 const draft=JSON.parse(await readFile(new URL('docs/private/06-draft.json',root),'utf8'));
 if(s.status==='accepted')throw Error('07已被用户采用，需从实际采用结果核对游览结构后再初始化08，未覆盖');
 const state={version:1,requestVersion:randomUUID(),request,lock:null,adopted:{id:adopted.versionId||`adopted-${adopted.generatedAt}`,origin,request,requestHash:case06RequestHash(request),plan:draft.plan,roadPreferences:Object.fromEntries(adopted.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,{mode:l.mode,strategy:l.strategy||0}]))}};
 await writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});console.log({baselineCaptured:true,adoptedId:state.adopted.id,previewNotAccepted:s.status!=='accepted',rawGeometrySaved:false});
}
const old=await readApproval(path,{allowExpired:true}),ledger=createLedger(fileURLToPath(new URL('docs/private/05b-ledger.json',root)),old),config=JSON.parse(await readFile(new URL('config/development08.json',root),'utf8'));
const next={...old,id:'TASK08-DEVELOPMENT',stages:config.stages,caps:config.caps,expiresAt:new Date(Date.now()+23*3600000).toISOString()};const result=await ledger.amend(next,{approved:true,reference:config.reference});await writeFile(path,JSON.stringify(next,null,2),{mode:0o600});console.log({authorizationApplied:true,...result});
