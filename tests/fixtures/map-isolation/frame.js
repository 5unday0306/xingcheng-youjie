import {PARENT_ORIGIN} from '/config.js';
import {createMapEndpoint} from '/map-frame-protocol.js';
const params=new URLSearchParams(location.hash.slice(1)),runId=params.get('runId'),scenario=params.get('scenario');
let initialized=false,destroyed=false,display=null,center=[112.55,37.87],zoom=13;
const output=document.getElementById('output'),points=document.getElementById('points');
const endpoint=createMapEndpoint({target:parent,origin:PARENT_ORIGIN,runId,role:'map',onMessage:m=>{
 if(destroyed)return;
 if(m.type==='INIT'&&!initialized){initialized=true;if(scenario==='timeout')setTimeout(()=>endpoint.send('READY'),2500);else endpoint.send('READY');}
 if(m.type==='DESTROY'){destroyed=true;display=null;output.textContent='离线替身已销毁';endpoint.send('CLOSED');endpoint.dispose();return;}
 if(!initialized)return;
 if(m.type==='DISPLAY'){display=m.payload;points.replaceChildren();for(const p of display.points){const b=document.createElement('button');b.textContent=p.sequence+' '+p.label;b.onclick=()=>endpoint.send('SELECT',{id:p.id});points.append(b);}}
 if(m.type==='FOCUS'&&display?.points.some(p=>p.id===m.payload.id)){display.selectedId=m.payload.id;output.textContent='离线定位：'+m.payload.id;endpoint.send('SELECT',{id:m.payload.id});}
 if(m.type==='VIEW'){if(m.payload.action==='zoomIn')zoom=Math.min(20,zoom+1);if(m.payload.action==='zoomOut')zoom=Math.max(3,zoom-1);endpoint.send('VIEW_CHANGED',{center,zoom});}
}});
document.getElementById('pan').onclick=()=>{if(!destroyed&&initialized){center=[112.551,37.871];endpoint.send('VIEW_CHANGED',{center,zoom});}};
window.__mapLab={endpoint,snapshot:()=>({initialized,destroyed,display,center,zoom})};
