// Shared explicit loader. A failed attempt is not silently retried.
let loading=null;
export function loadAMapSdk({jsKey,serviceHost,signal}) {
  if(loading)return loading;
  window._AMapSecurityConfig={serviceHost};
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let ended=false,timer;
    const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);script.onload=null;script.onerror=null;signal?.removeEventListener('abort',abort);if(error)script.remove();error?reject(error):resolve(window.AMap);};
    const abort=()=>finish(Error('SDK加载已取消，未自动重试'));
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(Error('SDK加载超时，未自动重试')),15000);
    script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`;
    script.onload=()=>finish(window.AMap?null:Error('SDK响应未提供地图对象'));
    script.onerror=()=>finish(Error('SDK加载失败，请核对权限或网络；未自动重试'));
    document.head.append(script);
  });return loading;
}
