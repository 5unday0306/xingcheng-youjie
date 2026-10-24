// No SDK loader. Only a caller with an explicitly loaded SDK and actual road data
// may construct this view. The offline app never imports or serves this module.
export function createMapView({AMap,container,onSelect=()=>{}}) {
  if(!AMap?.Map||!AMap?.Polyline||!AMap?.Marker)throw Error('地图SDK未就绪');
  const map=new AMap.Map(container,{zoom:12}),overlays=[],markers=new Map();
  const clear=()=>{if(overlays.length)map.remove(overlays.splice(0));markers.clear();};
  return {
    showDay(day) {
      clear();let gaps=0;
      for(const leg of day.legs) {
        if(leg.status!=='available'||leg.source!=='高德Web服务响应'){gaps++;continue;}
        if(!leg.geometryComplete||!leg.geometry?.length)gaps++;
        for(const part of leg.geometry||[]) {
          if(!Array.isArray(part.path)||part.path.length<2||!part.path.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))){gaps++;continue;}
          overlays.push(new AMap.Polyline({path:part.path,strokeColor:part.mode==='walk'?'#226A54':'#355F91',strokeWeight:5}));
        }
      }
      for(const [index,activity] of day.activities.entries()) {
        if(activity.entranceVerified!==true||!Array.isArray(activity.location)||activity.location.length!==2||!activity.location.every(Number.isFinite)){gaps++;continue;}
        const marker=new AMap.Marker({position:activity.location,title:`${index+1} ${activity.name}`});
        marker.on('click',()=>onSelect(activity.id));markers.set(activity.id,marker);overlays.push(marker);
      }
      map.add(overlays);if(overlays.length)map.setFitView(overlays);
      return {gaps,complete:gaps===0&&day.legs.length>0};
    },
    focusActivity(id){const marker=markers.get(id);if(!marker)return false;map.setCenter(marker.getPosition());onSelect(id);return true;},
    destroy(){clear();map.destroy();}
  };
}
