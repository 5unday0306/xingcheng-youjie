import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PlanningError} from './planning.mjs';

const names={AMAP_WEB_SERVICE_KEY:'webKey',DEEPSEEK_API_KEY:'modelKey',AMAP_JS_KEY:'jsKey',AMAP_JS_SECURITY_CODE:'jsSecurityCode'};
// Explicit real-preparation startup only; values never enter status or exceptions.
export async function loadCredentials(path,env=process.env) {
  let text='';try{text=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw new PlanningError('CONFIG_READ','本地配置无法读取',503);}
  const credentials={};
  for(const line of text.split(/\r?\n/)) {
    const m=/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);if(!m||!names[m[1]])continue;
    let value=m[2];if(/^(['"]).*\1$/.test(value))value=value.slice(1,-1);
    if(value&&!/[\r\n\0]/.test(value))credentials[names[m[1]]]=value;
  }
  for(const [name,key] of Object.entries(names))if(env[name])credentials[key]=env[name];
  return {credentials,status:Object.fromEntries(Object.values(names).map(k=>[k,!!credentials[k]]))};
}
export function validateApproval(a) {
  const max={model:1,location:5,route:12,map:1};
  if(a?.version!==1||a.enabled!==true||typeof a.id!=='string'||!a.id||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=Date.now()||Date.parse(a.expiresAt)>Date.now()+86400000||a.termsConfirmed!==true||a.accountCostBoundConfirmed!==true||a.model!=='deepseek-flash'||!Number.isSafeInteger(a.budgetCents)||a.budgetCents<=0)throw new PlanningError('AUTH_REQUIRED','缺少有效的新授权、账号费用边界或用途确认',403);
  for(const k of Object.keys(max))if(!Number.isInteger(a.caps?.[k])||a.caps[k]<0||a.caps[k]>max[k]||!Number.isSafeInteger(a.reserveCents?.[k])||a.reserveCents[k]<0||(a.caps[k]>0&&a.reserveCents[k]===0))throw new PlanningError('AUTH_INVALID','授权次数或保守预留费用无效',403);
  return a;
}
export async function readApproval(path) {
  try{return validateApproval(JSON.parse(await readFile(path,'utf8')));}catch(e){if(e instanceof PlanningError)throw e;throw new PlanningError('AUTH_REQUIRED','尚未配置本轮有效授权，真实调用关闭',403);}
}
// Reserve before dispatch. Never refund uncertain/failed calls. Files contain no input/geometry/credential.
export function createLedger(path,approval) {
  const fingerprint=createHash('sha256').update(JSON.stringify(approval)).digest('hex');
  async function transaction(fn) {
    validateApproval(approval);await mkdir(dirname(path),{recursive:true});
    const lock=path+'.lock';try{await mkdir(lock);}catch{throw new PlanningError('LEDGER_LOCK','调用记录被占用或上次异常中止，请人工复核；未调用',409);}
    try {
      let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new PlanningError('LEDGER_INVALID','调用记录损坏，停止联网',503);state={version:1,fingerprint,entries:[]};}
      if(state.fingerprint!==fingerprint||state.version!==1||!Array.isArray(state.entries)||state.entries.some(e=>!Object.hasOwn(approval.caps,e.kind)||!Number.isSafeInteger(e.reservedCents)||e.reservedCents<0))throw new PlanningError('LEDGER_MISMATCH','授权与既有调用记录不符，停止联网',403);
      const result=fn(state);const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await rename(temp,path);return result;
    }finally{await rm(lock,{recursive:false}).catch(async()=>{const {rmdir}=await import('node:fs/promises');await rmdir(lock);});}
  }
  return {
    reserve:kind=>transaction(s=>{
      if(s.stopped)throw new PlanningError('RUN_STOPPED','本轮已因失败停止，须先复核原因并重新明确继续范围；未发送请求',403);
      if(!Object.hasOwn(approval.caps,kind)||s.entries.filter(e=>e.kind===kind).length>=approval.caps[kind]||s.entries.reduce((v,e)=>v+e.reservedCents,0)+approval.reserveCents[kind]>approval.budgetCents)throw new PlanningError('CALL_LIMIT','本轮次数或费用预留额度耗尽，未发送请求',429);
      const id=randomUUID();s.entries.push({id,kind,reservedCents:approval.reserveCents[kind],status:'reserved',at:new Date().toISOString()});return id;
    }),
    finish:(id,status,usage=null)=>transaction(s=>{const e=s.entries.find(e=>e.id===id);if(!e)throw new PlanningError('LEDGER_INVALID','调用记录缺失',503);e.status=status;e.finishedAt=new Date().toISOString();if(usage&&['input','output','total'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0))e.usage=usage;}),
    stop:code=>transaction(s=>{s.stopped={code:/^[A-Z_]{1,40}$/.test(code)?code:'FAILED',at:new Date().toISOString()};}),
    summary:()=>transaction(s=>({counts:Object.fromEntries(Object.keys(approval.caps).map(k=>[k,s.entries.filter(e=>e.kind===k).length])),reservedCents:s.entries.reduce((v,e)=>v+e.reservedCents,0),budgetCents:approval.budgetCents,actualCharge:'待供应商账单核对；预留不等于实扣',stopped:s.stopped||null,entries:s.entries})),
  };
}
const allowed=new Set(['https://api.deepseek.com/chat/completions','https://restapi.amap.com/v3/geocode/geo','https://restapi.amap.com/v3/direction/walking','https://restapi.amap.com/v3/direction/transit/integrated']);
export function createHttpSender({fetchImpl=fetch,timeoutMs=15000,maxBytes=1000000}={}) {
  return async ({url,method,headers,body,signal})=>{
    const u=new URL(url);if(u.username||u.password||u.hash||!allowed.has(u.origin+u.pathname))throw new PlanningError('HTTP_DENIED','请求目标不允许',403);
    const abort=AbortSignal.any([AbortSignal.timeout(u.hostname==='api.deepseek.com'?45000:timeoutMs),...(signal?[signal]:[])]);
    try {
      const response=await fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:abort});
      if(response.status!==200){await response.body?.cancel();throw Error();}
      const reader=response.body.getReader();let size=0;const chunks=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      return {status:200,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
    } catch {throw new PlanningError('UPSTREAM_FAILED','上游失败、超时或响应超限，已停止且不自动重试',502);}
  };
}
