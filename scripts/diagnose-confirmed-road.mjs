// Explicit standing development authorization; one request, no retry, no SDK.
import {readFile,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {readApproval,loadCredentials,createLedger,createHttpSender} from '../lib/runtime05b.mjs';import {createUpstreamAdapters} from '../lib/upstream-contract.mjs';
const approval=await readApproval(new URL('../docs/private/05b-approval.json',import.meta.url));if(approval.policy!=='development-05b')throw Error('需要当前05B持续授权');
const ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),approval),{credentials}=await loadCredentials(new URL('../.env',import.meta.url));
const picks=JSON.parse(await readFile(new URL('../docs/private/05b-picks.json',import.meta.url),'utf8'));
const adapter=createUpstreamAdapters({credentials,enabled:true,send:createHttpSender(),reserve:k=>ledger.reserve(k),finish:(...a)=>ledger.finish(...a)});
let report;try{const r=await adapter.road({origin:picks.points.ENDPOINT,destination:picks.points.TY04,mode:picks.mode});report={success:true,mode:r.mode,minutes:r.minutes,distanceMeters:r.distanceMeters,geometryComplete:r.geometryComplete,geometryParts:r.geometry.length};}catch(e){await ledger.stop(e.code,e.diagnostic);report={success:false,code:e.code,diagnostic:e.diagnostic};}
report.at=new Date().toISOString();report.calls=(await ledger.summary()).counts;await writeFile(new URL('../docs/verification/task05b-product-road-diagnostic.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
