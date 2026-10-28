import {PARENT_ORIGIN,SDK_ENABLED} from '/container-config.js';
import {createMapEndpoint} from '/map-frame-protocol.js';
const runId=location.hash.slice(1),status=document.getElementById('containerStatus');
let initialized=false,closed=false,loading=false,map=null,mapReady=false,expiresAt=0,expiryTimer;
const abort=new AbortController(),mapBox=document.getElementById('mapView');
// Do not delay the INIT listener with a top-level await: iframe load may precede it.
if(SDK_ENABLED)import('/sdk-diagnostics.js').then(({installSdkDiagnostics})=>{if(!closed)installSdkDiagnostics();}).catch(()=>{});
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)}),b=await r.json();if(!r.ok)throw Error(b.code||'SDK_FAILED');return b;}
function check(){if(closed||expiresAt&&Date.now()>=expiresAt)throw Error('地图已停止或到期');}
function dispose(){closed=true;clearTimeout(expiryTimer);abort.abort();map?.destroy();map=null;mapBox.hidden=true;}
async function load(){if(!SDK_ENABLED||!initialized||loading||closed)return;loading=true;status.textContent='正在加载SDK与底图；尚未取得可见底图';
 try{
  const config=await post('/frame/bootstrap',{runId});check();
  if(typeof config.jsKey!=='string'||config.jsKey.length>128||config.serviceHost!==location.origin+'/_AMapService'||!Number.isFinite(config.expiresAt)||config.expiresAt<=Date.now())throw Error('SDK配置结构无效');
  expiresAt=config.expiresAt;expiryTimer=setTimeout(()=>{dispose();endpoint.send('ERROR',{code:'SDK_FAILED'});},Math.max(0,expiresAt-Date.now()));
  const [{loadAMapSdk},{createMapView}]=await Promise.all([import('/amap-loader.js'),import('/map-view.js')]);check();
  const AMap=await loadAMapSdk({jsKey:config.jsKey,serviceHost:config.serviceHost,signal:abort.signal});check();
  await post('/frame/event',{runId,event:'script-loaded'});check();mapBox.hidden=false;
  map=createMapView({AMap,container:mapBox,initialRegion:[112.55,37.87],onPick:position=>endpoint.send('PICK_LOCATION',{position}),onDrag:(id,position)=>endpoint.send('MOVE_POINT',{id,position}),onSelect:(id,{origin}={})=>{if(origin==='map')endpoint.send('SELECT',{id});}});await map.whenReady();check();
  await post('/frame/event',{runId,event:'map-ready'});check();mapReady=true;status.textContent='地图已就绪；测试落点需分别确认，不代表官方入口核验';document.getElementById('containerBoundary').textContent='只绘制真实返回的路段，未知路段保持缺口，整体可行性由程序核查并提示';endpoint.send('MAP_READY');
 }catch{dispose();try{await post('/frame/event',{runId,event:'sdk-failed'});}catch{}endpoint.send('ERROR',{code:'SDK_FAILED'});}
}
if(parent===window)throw Error('地图容器不支持直接打开');
const endpoint=createMapEndpoint({target:parent,origin:PARENT_ORIGIN,runId,role:'map',onMessage:m=>{
 if(closed)return;
 if(m.type==='INIT'&&!initialized){initialized=true;status.textContent='隔离容器已就绪；真实SDK未加载';endpoint.send('READY');}
 if(m.type==='LOAD')load();
 if(m.type==='CAMERA'&&mapReady&&!closed)map.centerOn(m.payload.center,m.payload.zoom);
 if(m.type==='VIEW'&&mapReady&&!closed){if(m.payload.action==='zoomIn')map.zoomIn();if(m.payload.action==='zoomOut')map.zoomOut();if(m.payload.action==='fit')map.fit();}
 if(m.type==='PICK'&&mapReady)map.setPicking(m.payload.enabled);
 if(m.type==='DISPLAY'&&mapReady){const p=m.payload;map.showDay({activities:p.points.map(n=>({id:n.id,name:n.label,location:n.position,sequence:n.sequence,userSelected:true,routePointAccepted:!n.pending,editable:n.editable===true})),legs:p.segments.map((s,i)=>({id:'shown-'+i,status:'available',source:'高德Web服务响应',geometryComplete:true,geometry:[s]}))},{fit:false});if(p.selectedId)map.focusActivity(p.selectedId);}
 if(m.type==='FOCUS'&&mapReady)map.focusActivity(m.payload.id);
 if(m.type==='DESTROY'){dispose();status.textContent='容器已销毁';endpoint.send('CLOSED');endpoint.dispose();}
}});
