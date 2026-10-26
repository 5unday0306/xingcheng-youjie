import {PlanningError} from './planning.mjs';
// Only the SDK initialization endpoint; never a generic service proxy.
const allowed=new Set(['key','v','type','platform','logversion','product','sdkversion','eventId','s','t','csid','appname','resolution','mob','vt','dpr','scale','callback']);
export function sdkInitRequest(query,credentials) {
  const q=new URLSearchParams(query),deny=()=>{throw new PlanningError('PROXY_DENIED','SDK初始化参数无效或超出已核对范围',403);};
  for(const [k,v] of q)if(!allowed.has(k)||q.getAll(k).length!==1||v.length>2048||/[\r\n\0]/.test(v))deny();
  if(!credentials?.jsKey||!credentials?.jsSecurityCode||q.get('key')!==credentials.jsKey)deny();
  const callback=q.get('callback');
  if(callback&&(callback.length>120||!/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*){0,5}$/.test(callback)))deny();
  q.delete('callback');q.set('jscode',credentials.jsSecurityCode);q.set('output','JSON');
  return {request:{url:`https://restapi.amap.com/v3/log/init?${q}`,method:'GET'},callback};
}
export function sdkScriptReply(callback,body,credentials) {
  const secrets=[credentials.modelKey,credentials.webKey,credentials.jsSecurityCode].filter(Boolean);
  const text=JSON.stringify(body,(key,value)=>{if(['jscode','securityJsCode','modelKey','webKey'].includes(key))return '[redacted]';if(typeof value==='string')for(const secret of secrets)value=value.replaceAll(secret,'[redacted]');return value;});
  const data=JSON.parse(text);
  if(!callback)return {kind:'sdk-json',data};
  const safe=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return {kind:'sdk-script',body:`${callback}(${safe});`};
}
