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
  map=createMapView({AMap,container:mapBox,initialRegion:[112.55,37.87]});await map.whenReady();check();
  await post('/frame/event',{runId,event:'map-ready'});check();mapReady=true;status.textContent='底图完成事件已取得，仍需人工核对可见性；未选点、未查路';document.getElementById('containerBoundary').textContent='当前只验收底图缩放与拖动，不代表行程可行';endpoint.send('MAP_READY');
 }catch{dispose();try{await post('/frame/event',{runId,event:'sdk-failed'});}catch{}endpoint.send('ERROR',{code:'SDK_FAILED'});}
}
if(parent===window)throw Error('地图容器不支持直接打开');
const endpoint=createMapEndpoint({target:parent,origin:PARENT_ORIGIN,runId,role:'map',onMessage:m=>{
 if(closed)return;
 if(m.type==='INIT'&&!initialized){initialized=true;status.textContent='隔离容器已就绪；真实SDK未加载';endpoint.send('READY');}
 if(m.type==='LOAD')load();
 if(m.type==='VIEW'&&mapReady&&!closed){if(m.payload.action==='zoomIn')map.zoomIn();if(m.payload.action==='zoomOut')map.zoomOut();if(m.payload.action==='fit')map.fit();}
 if(m.type==='DESTROY'){dispose();status.textContent='容器已销毁';endpoint.send('CLOSED');endpoint.dispose();}
}});
