// Rendering only: never loads SDK or requests planning services.
export function createMapView({AMap,container,onSelect=()=>{},onLeg=()=>{},initialRegion=null,onPick=()=>{},onDrag=()=>{}}) {
  if(!AMap?.Map||!AMap?.Polyline||!AMap?.Marker)throw Error('地图SDK未就绪');
  const map=new AMap.Map(container,initialRegion?{zoom:13,center:initialRegion}:{zoom:12}),overlays=[],markers=new Map(),groups=[];
  let readyTimer,rejectReady,destroyed=false,settled=false;
  const ready=typeof map.on==='function'?new Promise((resolve,reject)=>{rejectReady=reject;readyTimer=setTimeout(()=>{settled=true;reject(Error('底图加载超时，停止，不自动重试'));},15000);map.on('complete',()=>{if(destroyed||settled)return;settled=true;clearTimeout(readyTimer);resolve();});}):Promise.resolve();
  // destroy may happen before the caller awaits readiness; keep rejection handled.
  ready.catch(()=>{});
  let pickingEnabled=false;const pair=p=>p&&typeof p.getLng==='function'?[p.getLng(),p.getLat()]:Array.isArray(p)?p:[p?.lng,p?.lat];
  map.on?.('click',e=>{if(!destroyed&&pickingEnabled)onPick(pair(e.lnglat));});
  const label=a=>a.role?.includes('集合')?'集合/返':String(a.sequence??'?');
  const content=(group,active=false)=>`<span class="mapPin${active?' isActive':''}${group.pending?' isPending':''}">${group.labels.join('·')}</span>`;
  const clear=()=>{if(overlays.length)map.remove(overlays.splice(0));markers.clear();groups.length=0;};
  function highlight(id){for(const group of groups){const active=group.ids.includes(id);group.marker.setContent?.(content(group,active));group.marker.setzIndex?.(active?200:100);}}
  return {
    showDay(day,{fit=true}={}) {
      if(destroyed)return {gaps:1,complete:false};
      clear();map.resize?.();let gaps=0;
      for(const leg of day.legs) {
        if(leg.status!=='available'||leg.source!=='高德Web服务响应'){gaps++;continue;}
        if(!leg.geometryComplete||!leg.geometry?.length)gaps++;
        for(const part of leg.geometry||[]) {
          if(!Array.isArray(part.path)||part.path.length<2||!part.path.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))){gaps++;continue;}
          const line=new AMap.Polyline({path:part.path,strokeColor:part.mode==='walk'?'#245B76':'#AF5427',strokeStyle:part.mode==='walk'?'dashed':'solid',strokeDasharray:[8,6],strokeWeight:6,showDir:true});
          line.on?.('click',()=>onLeg(leg));overlays.push(line);
        }
      }
      const grouped=new Map();
      for(const [index,a] of day.activities.entries()) {
        if(!(a.entranceVerified===true||a.userSelected===true)||!Array.isArray(a.location)||a.location.length!==2||!a.location.every(Number.isFinite)){gaps++;continue;}
        const key=a.location.join(',');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push({...a,sequence:a.sequence??index+1});
      }
      for(const values of grouped.values()){
        const group={ids:values.map(a=>a.id),labels:values.map(label),pending:values.some(a=>a.userSelected&&!a.routePointAccepted)};
        const marker=new AMap.Marker({position:values[0].location,title:values.map(a=>`${label(a)} ${a.name}`).join(' / '),content:content(group),anchor:'bottom-center',draggable:values[0].editable===true});
        group.marker=marker;groups.push(group);
        if(values[0].editable)marker.on('dragend',e=>{if(!destroyed)onDrag(values[0].id,pair(e.lnglat||marker.getPosition()));});
        marker.on('click',()=>{if(destroyed)return;highlight(values[0].id);onSelect(values[0].id,{origin:'map'});});
        values.forEach(a=>markers.set(a.id,marker));overlays.push(marker);
      }
      map.add(overlays);if(fit&&overlays.length)map.setFitView(overlays);
      return {gaps,complete:gaps===0&&day.legs.length>0};
    },
    setPicking(enabled){pickingEnabled=enabled;},
    whenReady:()=>ready,
    focusActivity(id){if(destroyed)return false;const marker=markers.get(id);if(!marker)return false;highlight(id);map.setCenter(marker.getPosition());onSelect(id,{origin:'list'});return true;},
    fit(){if(destroyed)return;if(overlays.length)map.setFitView(overlays);else if(initialRegion){map.setCenter?.(initialRegion);map.setZoom?.(13);}},
    centerOn(center,zoom){if(!destroyed){map.setZoomAndCenter(zoom,center,true);}},
    zoomIn(){if(!destroyed)map.zoomIn?.();},zoomOut(){if(!destroyed)map.zoomOut?.();},
    clear,
    destroy(){if(destroyed)return;destroyed=true;clearTimeout(readyTimer);if(!settled){settled=true;rejectReady?.(Error('地图已销毁，迟到完成事件不采用'));}clear();map.destroy();}
  };
}
