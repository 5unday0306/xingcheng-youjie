// One named relation only. Never writes raw responses, keys or full URLs.
import {readFile,writeFile} from 'node:fs/promises';
import {readApproval,createLedger,loadCredentials,createHttpSender} from '../lib/runtime05b.mjs';
import {parseRoad} from '../lib/upstream-contract.mjs';
const approval=await readApproval('docs/private/05b-approval.json'),ledger=createLedger('docs/private/05b-ledger.json',approval),{credentials}=await loadCredentials('.env');
const picks=JSON.parse(await readFile('docs/private/06-picks.json','utf8')),from=picks.points.LUNCH1,to=picks.points.TY04;
if(!from?.confirmed||!to?.confirmed)throw Error('本轮已确认目标不完整，不调用');
const receipt=await ledger.reserve('route');let report;
try{
 const query=new URLSearchParams({key:credentials.webKey,origin:from.location.join(','),destination:to.location.join(','),output:'JSON'});
 const response=await createHttpSender()({url:'https://restapi.amap.com/v3/direction/walking?'+query,method:'GET'});await ledger.finish(receipt,'responded');const body=response.body;
 const p=body.route?.paths?.[0];report={at:new Date().toISOString(),purpose:'首次失败关系的单次步行诊断；不是对旧无日志响应根因的追认',mode:'walk',from:'LUNCH1',to:'TY04',httpStatus:response.status,status:body.status,infocode:/^\d{5}$/.test(body.infocode)?body.infocode:null,info:typeof body.info==='string'&&/^[A-Z_]{1,80}$/.test(body.info)?body.info:null,pathCount:body.route?.paths?.length??null,pathFields:p?Object.keys(p):[],durationType:typeof p?.duration,distanceType:typeof p?.distance};
 try{const road=parseRoad(body,'walk');report.validation='passed';report.statistics={minutes:road.minutes,distanceMeters:road.distanceMeters,geometryComplete:road.geometryComplete,geometryParts:road.geometry.length};}catch(e){report.validation='failed';report.code=e.code;}
}catch(e){await ledger.finish(receipt,'failed-or-unknown');report={at:new Date().toISOString(),mode:'walk',from:'LUNCH1',to:'TY04',validation:'transport-failed',code:e.code||'FAILED'};}
await ledger.stop('TASK06_DIAGNOSTIC_COMPLETE',{validation:report.validation,infocode:report.infocode});await writeFile('docs/verification/task06-road-single-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(report);
