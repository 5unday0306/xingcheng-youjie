import {createMapEndpoint} from './map-frame-protocol.js';
export function attachMapContainer({container,mapOrigin,onStatus=()=>{},onEnd=()=>{},onReady=()=>{},onPick=()=>{},onDrag=()=>{},onSelect=()=>{},timeoutMs=5000}){
 const peer=new URL(mapOrigin);if(peer.origin!==mapOrigin||peer.hostname===location.hostname)throw Error('需要固定的独立地图来源');
 const frame=document.createElement('iframe'),runId=crypto.randomUUID();let ended=false,ready=false,loaded=false,timer,expiryTimer,sdkRequested=false,mapReady=false,shownIds=new Set();
 frame.title='独立地图容器接线检查，真实SDK未加载';frame.sandbox='allow-scripts allow-same-origin';frame.referrerPolicy='no-referrer';frame.allow="geolocation 'none'; camera 'none'; microphone 'none'";
 frame.className='isolatedContainerFrame';frame.src=mapOrigin+'/container#'+runId;container.append(frame);
 const stop=text=>{if(ended)return;ended=true;clearTimeout(timer);clearTimeout(expiryTimer);endpoint.send('DESTROY');endpoint.dispose();frame.remove();if(sdkRequested)Promise.resolve(onEnd(runId)).catch(()=>{});onStatus(text);};
 const endpoint=createMapEndpoint({target:frame.contentWindow,origin:mapOrigin,runId,role:'main',onMessage:m=>{
  if(ended)return;if(m.type==='READY'&&!ready){ready=true;clearTimeout(timer);onStatus('隔离容器已就绪；真实SDK未加载，原停止状态保持。');}
  if(m.type==='MAP_READY'&&sdkRequested){mapReady=true;clearTimeout(timer);onStatus('底图加载完成事件已取得；请核对可见底图，再选择测试落点。');onReady();}
  if(mapReady&&m.type==='PICK_LOCATION')onPick(m.payload.position);
  if(mapReady&&m.type==='MOVE_POINT')onDrag(m.payload.id,m.payload.position);
  if(mapReady&&m.type==='SELECT')onSelect(m.payload.id,{origin:'map'});
  if(m.type==='ERROR'||m.type==='CLOSED')stop('隔离容器已停止；没有重新加载。');
 }});
 timer=setTimeout(()=>stop('隔离容器超时，已销毁；没有重试或SDK调用。'),timeoutMs);
 frame.addEventListener('load',()=>{if(ended)return;if(loaded){stop('容器重新导航，已停止。');return;}loaded=true;endpoint.send('INIT');});
 onStatus('正在连接独立地图容器；不加载SDK。');
 return {destroy:()=>stop(sdkRequested?'地图已关闭；已发调用记录保留。':'隔离容器已关闭；没有业务调用。'),state:()=>({ready,ended,runId,sdkRequested,mapReady}),
  load(ticket){if(ended||!ready||sdkRequested||ticket.runId!==runId||!Number.isFinite(ticket.expiresAt)||ticket.expiresAt<=Date.now())throw Error('地图许可无效');sdkRequested=true;frame.classList.add('hasSdk');timer=setTimeout(()=>stop('底图加载超时，已停止，不自动重试。'),35000);expiryTimer=setTimeout(()=>stop('地图会话已到期，不自动重载。'),ticket.expiresAt-Date.now());endpoint.send('LOAD');onStatus('正在加载SDK与底图；尚未取得可见底图。');},
  centerOn(center,zoom=17){if(mapReady&&!ended)endpoint.send('CAMERA',{center,zoom});},
  zoomIn(){if(mapReady&&!ended)endpoint.send('VIEW',{action:'zoomIn'});},zoomOut(){if(mapReady&&!ended)endpoint.send('VIEW',{action:'zoomOut'});},fit(){if(mapReady&&!ended)endpoint.send('VIEW',{action:'fit'});},
  showDay(day){if(!mapReady||ended)return;const points=(day.activities||[]).map((a,i)=>({a,i})).filter(({a})=>a.location&&(a.entranceVerified||a.userSelected||a.routePointAccepted)).map(({a,i})=>({id:a.id,label:a.name,position:a.location,sequence:i+1,editable:a.editable===true,pending:a.userSelected===true&&!a.routePointAccepted}));shownIds=new Set(points.map(p=>p.id));const segments=(day.legs||[]).filter(l=>l.status==='available'&&l.source==='高德Web服务响应').flatMap(l=>l.geometry||[]).map(s=>({mode:s.mode,path:s.path}));endpoint.send('DISPLAY',{points,segments,selectedId:null});},
  setPicking(enabled){if(mapReady&&!ended)endpoint.send('PICK',{enabled});},focusActivity(id){if(!mapReady||ended||!shownIds.has(id))return false;endpoint.send('FOCUS',{id});return true;},clear(){if(mapReady&&!ended)endpoint.send('DISPLAY',{points:[],segments:[],selectedId:null});}
 };
}
