// Small, in-memory, opt-in-to-export diagnostic ring. Never retain URL queries,
// fragments, console messages, script samples, request headers or response bodies.
export function safeLocation(value,base='http://localhost/') {
  if(!value)return {origin:'unknown',path:''};
  if(['inline','eval','wasm-eval','trusted-types-policy','trusted-types-sink'].includes(value))return {origin:value,path:''};
  try {const u=new URL(value,base);
    if(!['http:','https:'].includes(u.protocol))return {origin:u.protocol,path:''};
    return {origin:u.origin,path:u.pathname.split('/').map(p=>p.length>80||/[a-f\d]{24,}/i.test(p)?'[redacted]':p).join('/').slice(0,300)};
  }catch{return {origin:'unknown',path:''};}
}
const number=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const label=v=>/^[a-zA-Z0-9_-]{1,64}$/.test(v||'')?v:'unknown';
export function diagnosticRecord(input,base) {
  return {kind:label(input.kind),directive:label(input.directive),...safeLocation(input.url,base),
    resourceType:label(input.resourceType),status:number(input.status),
    initiator:{...safeLocation(input.source,base),line:number(input.line),column:number(input.column)}};
}
export function installSdkDiagnostics(target=window) {
  if(target.__sdkDiagnostics)return target.__sdkDiagnostics;
  const records=[];const add=input=>{records.push({...diagnosticRecord(input,target.location.href),at:new Date().toISOString()});if(records.length>80)records.shift();};
  const violation=e=>add({kind:'csp',directive:e.effectiveDirective,url:e.blockedURI,resourceType:e.effectiveDirective?.split('-')[0],status:e.statusCode,source:e.sourceFile,line:e.lineNumber,column:e.columnNumber});
  const error=e=>{const n=e.target;if(!n||n===target)return;add({kind:'resource-error',url:n.currentSrc||n.src||n.href,resourceType:n.tagName?.toLowerCase()});};
  target.addEventListener('securitypolicyviolation',violation);
  target.addEventListener('error',error,true);
  const observer=target.PerformanceObserver?new target.PerformanceObserver(list=>{for(const r of list.getEntries())if(r.responseStatus>=400)add({kind:'http-error',url:r.name,resourceType:r.initiatorType,status:r.responseStatus});}):null;
  observer?.observe({type:'resource',buffered:true});
  const api={snapshot:()=>structuredClone(records),dispose(){target.removeEventListener('securitypolicyviolation',violation);target.removeEventListener('error',error,true);observer?.disconnect();}};
  target.__sdkDiagnostics=api;return api;
}

// Only enumerated phases/reasons and sanitized resource metadata cross the boundary.
export function sdkFailureDiagnostic(input={}){
 const stages=['bootstrap','modules','script','script-event','map-create','map-ready','ready-event'];
 const reasons=['timeout','cancelled','resource','configuration','initialization'];
 return {stage:stages.includes(input.stage)?input.stage:'bootstrap',reason:reasons.includes(input.reason)?input.reason:'initialization',elapsedMs:Math.min(120000,Math.max(0,Number.isFinite(input.elapsedMs)?Math.round(input.elapsedMs):0)),records:(Array.isArray(input.records)?input.records:[]).slice(-12).map(r=>diagnosticRecord({kind:r.kind,directive:r.directive,url:r.origin&&r.path?r.origin+r.path:r.origin,resourceType:r.resourceType,status:r.status,source:r.initiator?.origin&&r.initiator?.path?r.initiator.origin+r.initiator.path:r.initiator?.origin,line:r.initiator?.line,column:r.initiator?.column}))};
}
