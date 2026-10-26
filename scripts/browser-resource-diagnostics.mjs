import {diagnosticRecord} from '../web/sdk-diagnostics.js';
// Keep only sanitized locations, never raw request/response objects or a HAR.
export async function observeResourceFailures(cdp,base) {
  const records=[],initiators=new Map();
  const add=d=>{records.push(diagnosticRecord(d,base));if(records.length>100)records.shift();};
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',e=>{const f=e.initiator?.stack?.callFrames?.[0];initiators.set(e.requestId,diagnosticRecord({url:e.request.url,resourceType:e.type,source:f?.url||e.initiator?.url,line:f?.lineNumber,column:f?.columnNumber},base));if(initiators.size>500)initiators.delete(initiators.keys().next().value);});
  const input=(e,i)=>({url:i?i.origin+i.path:e.response?.url,resourceType:e.type,source:i&&i.initiator.origin!=='unknown'?i.initiator.origin+i.initiator.path:undefined,line:i?.initiator.line,column:i?.initiator.column});
  cdp.on('Network.responseReceived',e=>{if(e.response.status>=400)add({kind:'http-error',...input(e,initiators.get(e.requestId)),status:e.response.status});});
  cdp.on('Network.loadingFailed',e=>{const i=initiators.get(e.requestId);if(i)add({kind:'network-failure',...input(e,i)});initiators.delete(e.requestId);});
  cdp.on('Network.loadingFinished',e=>initiators.delete(e.requestId));
  return {snapshot:()=>structuredClone(records)};
}
