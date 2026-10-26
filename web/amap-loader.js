// Shared explicit loader. A failed attempt is not silently retried.
let loading=null;
export function loadAMapSdk({jsKey,serviceHost}) {
  if(loading)return loading;
  window._AMapSecurityConfig={serviceHost};
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let ended=false;
    const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);error?reject(error):resolve(window.AMap);};
    const timer=setTimeout(()=>{script.remove();finish(Error('SDK加载超时，未自动重试'));},15000);
    script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`;
    script.onload=()=>finish(window.AMap?null:Error('SDK响应未提供地图对象'));
    script.onerror=()=>finish(Error('SDK加载失败，请核对权限或网络；未自动重试'));
    document.head.append(script);
  });return loading;
}
