import {readFile,writeFile,mkdir,rename,rmdir} from 'node:fs/promises';
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
export function validateApproval(a,{allowExpired=false}={}) {
  const development=a?.policy==='development-05b',max=development?{model:a?.stages?.includes('dynamic-input')?128:a?.stages?.includes('agent-products')?96:a?.stages?.includes('task08')?64:a?.stages?.includes('task07')?24:8,location:40,route:a?.stages?.includes('dynamic-input')?512:a?.stages?.includes('agent-products')?400:a?.stages?.includes('task08')?320:160,map:64}:{model:1,location:7,route:12,map:3};
  if(a?.version!==1||a.enabled!==true||typeof a.id!=='string'||!a.id||!Number.isFinite(Date.parse(a.expiresAt))||(!allowExpired&&Date.parse(a.expiresAt)<=Date.now())||Date.parse(a.expiresAt)>Date.now()+86400000||a.termsConfirmed!==true||a.accountCostBoundConfirmed!==true||a.model!=='deepseek-flash'||(development?a.budgetCents!==null:!Number.isSafeInteger(a.budgetCents)||a.budgetCents<=0))throw new PlanningError('AUTH_REQUIRED','缺少有效的新授权、账号费用边界或用途确认',403);
  for(const k of Object.keys(max))if(!Number.isInteger(a.caps?.[k])||a.caps[k]<0||a.caps[k]>max[k]||!Number.isSafeInteger(a.reserveCents?.[k])||a.reserveCents[k]<0||(a.caps[k]>0&&a.reserveCents[k]===0))throw new PlanningError('AUTH_INVALID','授权次数或保守预留费用无效',403);
  if(!development&&a.caps.map===3&&!(a.sdkOnly===true&&a.flow==='map-pick'&&a.recoveryAllowance?.baseCounts.map===2&&a.recoveryAllowance?.caps.map===1&&['location','route','model'].every(k=>a.recoveryAllowance?.caps[k]===0)))throw new PlanningError('AUTH_INVALID','M3只允许以累计SDK2为基线新增底图1次，其他业务0次',403);
  if(a.recoveryAllowance)for(const k of Object.keys(max))if(!Number.isSafeInteger(a.recoveryAllowance.baseCounts?.[k])||a.recoveryAllowance.baseCounts[k]<0||!Number.isSafeInteger(a.recoveryAllowance.caps?.[k])||a.recoveryAllowance.caps[k]<0||a.recoveryAllowance.baseCounts[k]+a.recoveryAllowance.caps[k]>a.caps[k])throw new PlanningError('AUTH_INVALID','恢复阶段额度无效',403);
  return a;
}
export async function readApproval(path,options={}) {
  try{return validateApproval(JSON.parse(await readFile(path,'utf8')),options);}catch(e){if(e instanceof PlanningError)throw e;throw new PlanningError('AUTH_REQUIRED','尚未配置本轮有效授权，真实调用关闭',403);}
}
// Reserve before dispatch. Never refund uncertain/failed calls. Files contain no input/geometry/credential.
// Windows antivirus/indexers may briefly hold the destination. Retry only the
// atomic local replacement; never repeat an upstream business request.
export async function commitLedgerFile(temp,path,replace=rename){
 for(let attempt=0;;attempt++){try{return await replace(temp,path);}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=5)throw new PlanningError('LEDGER_WRITE','调用记录暂时无法写入，已停止；不自动重复接口请求',503);await new Promise(r=>setTimeout(r,40*(attempt+1)));}}
}
export function createLedger(path,approval) {
  const fingerprint=createHash('sha256').update(JSON.stringify(approval)).digest('hex');
  let pendingTransaction=Promise.resolve();
  function transaction(...args){const current=pendingTransaction.then(()=>performTransaction(...args));pendingTransaction=current.catch(()=>{});return current;}
  async function performTransaction(fn,authorization=approval,readOnly=false) {
    validateApproval(authorization,{allowExpired:readOnly});await mkdir(dirname(path),{recursive:true});
    const lock=path+'.lock';try{await mkdir(lock);}catch{throw new PlanningError('LEDGER_LOCK','调用记录被占用或上次异常中止，请人工复核；未调用',409);}
    try {
      let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new PlanningError('LEDGER_INVALID','调用记录损坏，停止联网',503);state={version:1,fingerprint,entries:[]};}
      if(state.fingerprint!==fingerprint||state.version!==1||!Array.isArray(state.entries)||state.entries.some(e=>!Object.hasOwn(approval.caps,e.kind)||!Number.isSafeInteger(e.reservedCents)||e.reservedCents<0))throw new PlanningError('LEDGER_MISMATCH','授权与既有调用记录不符，停止联网',403);
      const result=fn(state);if(readOnly)return result;const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await commitLedgerFile(temp,path);return result;
    }finally{await rmdir(lock);}
  }
  return {
    reserve:kind=>transaction(s=>{
      if(s.stopped)throw new PlanningError('RUN_STOPPED','本轮已因失败停止，须先复核原因并重新明确继续范围；未发送请求',403);
      if(approval.recoveryAllowance&&(!Object.hasOwn(approval.recoveryAllowance.caps,kind)||s.entries.filter(e=>e.kind===kind).length-approval.recoveryAllowance.baseCounts[kind]>=approval.recoveryAllowance.caps[kind]))throw new PlanningError('RECOVERY_LIMIT','本次恢复的额外调用次数已用尽或不允许此类调用',429);
      if(!Object.hasOwn(approval.caps,kind)||s.entries.filter(e=>e.kind===kind).length>=approval.caps[kind]||(approval.budgetCents!==null&&s.entries.reduce((v,e)=>v+e.reservedCents,0)+approval.reserveCents[kind]>approval.budgetCents))throw new PlanningError('CALL_LIMIT','技术次数或费用预留额度耗尽，未发送请求',429);
      const id=randomUUID();s.entries.push({id,kind,reservedCents:approval.reserveCents[kind],status:'reserved',at:new Date().toISOString()});return id;
    }),
    finish:(id,status,usage=null)=>transaction(s=>{const e=s.entries.find(e=>e.id===id);if(!e)throw new PlanningError('LEDGER_INVALID','调用记录缺失',503);e.status=status;e.finishedAt=new Date().toISOString();if(usage&&['input','output','total'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0))e.usage=usage;}),
    resource:(kind,status,counts=null)=>transaction(s=>{if(!['sdk-init-proxy','script','map','resources'].includes(kind)||!['requested','loaded','ready','failed','snapshot','closed'].includes(status))throw new PlanningError('RESOURCE_EVENT','资源记录类型无效');s.resources??=[];if(s.resources.length>=(approval.policy==='development-05b'?1000:30))throw new PlanningError('RESOURCE_LIMIT','资源记录上限已到',429);s.resources.push({kind,status,at:new Date().toISOString(),...(counts?{counts}: {})});}),
    claimDynamicRun:()=>transaction(s=>{if(s.stopped||Date.parse(approval.expiresAt)<=Date.now())throw new PlanningError('AUTH_REQUIRED','本轮已停止或到期');if(!approval.stages?.includes('dynamic-input')||![3,4].includes(approval.dynamicRuns))throw new PlanningError('STAGE_AUTH','缺少本轮动态对照授权');s.dynamicStarts??=[];if(s.dynamicStarts.filter(r=>r.authorizationId===approval.id).length>=approval.dynamicRuns)throw new PlanningError('ROUND_LIMIT','本轮动态启动验证次数已用尽，未发请求');s.dynamicStarts.push({authorizationId:approval.id,at:new Date().toISOString()});}),
    claimMapBootstrap:()=>transaction(s=>{
      if(s.stopped)throw new PlanningError('RUN_STOPPED','已停止，不下发地图配置',403);
      const entry=s.entries.filter(e=>e.kind==='map').at(-1);if(!entry)throw new PlanningError('MAP_LEASE','没有预留SDK次数',403);
      s.resources??=[];
      if(s.resources.some(e=>e.kind==='frame-bootstrap'&&e.entryId===entry.id))throw new PlanningError('MAP_BOOTSTRAP_USED','配置已下发，刷新不重复加载',409);
      if(s.resources.length>=(approval.policy==='development-05b'?1000:30))throw new PlanningError('RESOURCE_LIMIT','资源记录上限已到',429);
      s.resources.push({kind:'frame-bootstrap',status:'claimed',entryId:entry.id,at:new Date().toISOString()});return {claimed:true};
    }),
    stop:(code,diagnostic)=>transaction(s=>{s.stopped={code:/^[A-Z_]{1,40}$/.test(code)?code:'FAILED',at:new Date().toISOString()};if(diagnostic)s.stopped.diagnostic=diagnostic;}),
    // Local-only operation. No HTTP endpoint can resume or change an authorization.
    amend:async(next,decision)=>{
      if(decision?.approved!==true||typeof decision.reference!=='string'||!decision.reference.trim())throw new PlanningError('RECOVERY_REQUIRED','必须先有用户对具体恢复范围的明确决定',403);
      validateApproval(next);if(next.policy!=='development-05b'&&next.budgetCents>approval.budgetCents)throw new PlanningError('RECOVERY_BUDGET','本恢复方案不提高已有总费用上限',403);
      return transaction(s=>{
        if(Object.keys(next.caps).some(k=>s.entries.filter(e=>e.kind===k).length>next.caps[k])||(next.budgetCents!==null&&s.entries.reduce((n,e)=>n+e.reservedCents,0)>next.budgetCents))throw new PlanningError('RECOVERY_LIMIT','新范围不能小于已发生记录',403);
        s.authorizations??=[];s.authorizations.push({previousFingerprint:s.fingerprint,nextFingerprint:createHash('sha256').update(JSON.stringify(next)).digest('hex'),previousStop:s.stopped||null,decision:decision.reference,at:new Date().toISOString()});
        s.fingerprint=createHash('sha256').update(JSON.stringify(next)).digest('hex');s.stopped=null;return {entriesPreserved:s.entries.length,reservedCents:s.entries.reduce((n,e)=>n+e.reservedCents,0)};
      },next);
    },
    summary:()=>transaction(s=>({dynamicRunsUsed:(s.dynamicStarts||[]).filter(r=>r.authorizationId===approval.id).length,counts:Object.fromEntries(Object.keys(approval.caps).map(k=>[k,s.entries.filter(e=>e.kind===k).length])),reservedCents:s.entries.reduce((v,e)=>v+e.reservedCents,0),budgetCents:approval.budgetCents,actualCharge:'待供应商账单核对；预留不等于实扣',stopped:s.stopped||null,entries:s.entries,resources:s.resources||[]}),approval,true),
  };
}
const allowed=new Set(['https://api.deepseek.com/chat/completions','https://restapi.amap.com/v3/geocode/geo','https://restapi.amap.com/v3/place/detail','https://restapi.amap.com/v3/place/text','https://restapi.amap.com/v3/log/init','https://restapi.amap.com/v3/direction/walking','https://restapi.amap.com/v3/direction/transit/integrated']);
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
