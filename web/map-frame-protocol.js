// Display-only protocol prototype. No URLs, executable text, credentials or business commands.
const own=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(x);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=112.4&&p[0]<=112.7&&p[1]>=37.75&&p[1]<=37.95;
const empty=p=>own(p,[]);
export function validDisplay(p){
  if(!own(p,['points','segments','selectedId'])||!Array.isArray(p.points)||p.points.length>64||!Array.isArray(p.segments)||p.segments.length>128)return false;
  if(!p.points.every(n=>(own(n,['id','label','position','sequence'])||own(n,['id','label','position','sequence','editable','pending'])&&typeof n.editable==='boolean'&&typeof n.pending==='boolean')&&id(n.id)&&typeof n.label==='string'&&n.label.length>0&&n.label.length<=60&&point(n.position)&&Number.isSafeInteger(n.sequence)&&n.sequence>=1&&n.sequence<=64))return false;
  const ids=new Set(p.points.map(n=>n.id));if(ids.size!==p.points.length||!(p.selectedId===null||ids.has(p.selectedId)))return false;
  let total=0;return p.segments.every(s=>own(s,['mode','path'])&&['walk','transit'].includes(s.mode)&&Array.isArray(s.path)&&s.path.length>=2&&(total+=s.path.length)<=10000&&s.path.every(point));
}
const camera=p=>own(p,['center','zoom'])&&point(p.center)&&Number.isFinite(p.zoom)&&p.zoom>=3&&p.zoom<=20;
const fromMain={CAMERA:camera,INIT:empty,LOAD:p=>empty(p)||own(p,['pane'])&&['map','activities','agents','unknown'].includes(p.pane),PICK:p=>own(p,['enabled'])&&typeof p.enabled==='boolean',DISPLAY:validDisplay,FOCUS:p=>own(p,['id'])&&id(p.id),VIEW:p=>own(p,['action'])&&['zoomIn','zoomOut','fit'].includes(p.action),DESTROY:empty};
const fromMap={READY:empty,MAP_READY:empty,SELECT:p=>own(p,['id'])&&id(p.id),PICK_LOCATION:p=>own(p,['position'])&&point(p.position),MOVE_POINT:p=>own(p,['id','position'])&&id(p.id)&&point(p.position),VIEW_CHANGED:p=>own(p,['center','zoom'])&&point(p.center)&&Number.isFinite(p.zoom)&&p.zoom>=3&&p.zoom<=20,CLOSED:empty,ERROR:p=>own(p,['code'])&&['TIMEOUT','DESTROYED','INVALID_DATA','SDK_FAILED'].includes(p.code)};
export function validMessage(m,receiver){
  try{return own(m,['v','runId','seq','type','payload'])&&m.v===1&&typeof m.runId==='string'&&/^[a-f0-9-]{36}$/.test(m.runId)&&Number.isSafeInteger(m.seq)&&m.seq>0&&m.seq<=1000000&&Object.hasOwn(receiver==='main'?fromMap:fromMain,m.type)&&(receiver==='main'?fromMap:fromMain)[m.type](m.payload)&&new TextEncoder().encode(JSON.stringify(m)).length<=65536;}catch{return false;}
}
export function createMapEndpoint({target,origin,runId,role,onMessage,host=window}){
  if(!/^https?:\/\//.test(origin)||new URL(origin).origin!==origin||!['main','map'].includes(role))throw Error('固定来源配置无效');
  if(host.location&&new URL(origin).hostname===new URL(host.location.href).hostname)throw Error('隔离原型要求独立主机来源，不能只换端口');
  let disposed=false,lastSeq=0,seq=0,received=0,ignored=0;
  const receive=e=>{if(disposed||e.origin!==origin||e.source!==target||!validMessage(e.data,role)||e.data.runId!==runId||e.data.seq<=lastSeq){ignored++;return false;}lastSeq=e.data.seq;received++;onMessage(e.data);return true;};
  host.addEventListener('message',receive);
  return {send(type,payload={}){if(disposed)return false;const m={v:1,runId,seq:++seq,type,payload};if(!validMessage(m,role==='main'?'map':'main'))throw Error('拒绝不支持的地图消息');target.postMessage(m,origin);return true;},dispose(){disposed=true;host.removeEventListener('message',receive);},stats:()=>({received,ignored,disposed}),receive};
}
