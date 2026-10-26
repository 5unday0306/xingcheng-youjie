import {MAP_ORIGIN} from '/config.js';
import {createMapEndpoint} from '/map-frame-protocol.js';
const status=document.getElementById('status'),frame=document.createElement('iframe');
const runId=crypto.randomUUID(),scenario=new URL(location.href).searchParams.get('scenario')||'normal';
frame.title='离线地图隔离替身，无真实底图';frame.sandbox='allow-scripts allow-same-origin';frame.referrerPolicy='no-referrer';
frame.allow="geolocation 'none'; camera 'none'; microphone 'none'; fullscreen 'none'";
frame.src=MAP_ORIGIN+'/frame#'+new URLSearchParams({runId,scenario});
let ended=false,ready=false,selected=null,view=null,timer,loaded=false;
function stop(text){if(ended)return;ended=true;clearTimeout(timer);endpoint.send('DESTROY');endpoint.dispose();frame.remove();status.textContent=text;}
const display={points:[{id:'ENDPOINT',label:'测试起点',position:[112.53,37.86],sequence:1},{id:'TY04',label:'测试终点',position:[112.56,37.85],sequence:2}],segments:[],selectedId:null};
function handle(m){if(ended)return;if(m.type==='READY'){if(ready)return;ready=true;clearTimeout(timer);status.textContent='离线替身已就绪（非真实地图）';endpoint.send('DISPLAY',display);return;}if(!ready)return;if(m.type==='ERROR'||m.type==='CLOSED'){stop('离线地图环境已停止');return;}if(m.type==='SELECT'&&display.points.some(p=>p.id===m.payload.id)){selected=m.payload.id;document.getElementById('selected').textContent=selected;}if(m.type==='VIEW_CHANGED')view=m.payload;}
document.getElementById('frameRoot').append(frame);
const endpoint=createMapEndpoint({target:frame.contentWindow,origin:MAP_ORIGIN,runId,role:'main',onMessage:handle});
const finish=stop;
timer=setTimeout(()=>finish('离线替身超时，已销毁且不重试'),1500);
frame.addEventListener('load',()=>{if(!ended){if(loaded){finish('离线替身重新导航，已停止');return;}loaded=true;endpoint.send('INIT');status.textContent='正在加载离线隔离替身';}});
document.getElementById('focus').onclick=()=>{if(ready&&!ended)endpoint.send('FOCUS',{id:'TY04'});};
document.getElementById('zoom').onclick=()=>{if(ready&&!ended)endpoint.send('VIEW',{action:'zoomIn'});};
document.getElementById('destroy').onclick=()=>finish('已销毁，不采用迟到消息');
window.__lab={endpoint,frame,runId,display,snapshot:()=>({ended,ready,selected,view,...endpoint.stats()}),send:(type,payload)=>endpoint.send(type,payload)};
