// Explicit policies; only the isolated map container may enable string compilation.
const base={
  'default-src':["'self'"], 'script-src':["'self'"],
  'connect-src':["'self'"], 'object-src':["'none'"],
  'base-uri':["'none'"], 'frame-ancestors':["'none'"], 'form-action':["'self'"]
};
const realMap={...base,
  // Main JS API and the runtime script endpoint observed in M2. No SDK search plugins are requested by the app.
  'script-src':["'self'",'https://webapi.amap.com','https://jsapi-service.amap.com'],
  'style-src':["'self'","'unsafe-inline'"],
  'img-src':["'self'",'data:','https://*.amap.com','https://*.autonavi.com'],
  'connect-src':["'self'",'https://*.amap.com','https://*.autonavi.com'],
  'worker-src':["'self'",'blob:']
};
const serialize=policy=>Object.entries(policy).map(([name,sources])=>`${name} ${sources.join(' ')}`).join('; ');
export const localCsp=serialize(base);
export const realMapCsp=serialize(realMap);
// Parent remains strict; map permissions are configured separately.
export function isolatedWorkbenchCsp(mapOrigin){
  if(new URL(mapOrigin).origin!==mapOrigin)throw Error('地图来源必须固定');
  return serialize({...base,'frame-src':[mapOrigin]});
}
export function mapContainerCsp(parentOrigin,{sdkEnabled=false}={}){
  if(new URL(parentOrigin).origin!==parentOrigin)throw Error('主工作台来源必须固定');
  const scripts=sdkEnabled?['https://webapi.amap.com/maps','https://jsapi-service.amap.com/mapsplugincdn']:[];
  const resources=sdkEnabled?['https://webapi.amap.com','https://jsapi-service.amap.com','https://*.autonavi.com']:[];
  return serialize({...base,'script-src':["'self'","'unsafe-eval'",...scripts],
    'script-src-elem':["'self'",...scripts],'script-src-attr':["'none'"],
    // User additionally approved map-only inline styles/vendor tile resources; never inline scripts.
    'style-src':sdkEnabled?["'self'","'unsafe-inline'"]:["'self'"],
    'img-src':sdkEnabled?["'self'",'data:','blob:',...resources]:["'none'"],
    'connect-src':sdkEnabled?["'self'",...resources]:["'none'"],
    'worker-src':sdkEnabled?["'self'",'blob:']:["'none'"],'form-action':["'none'"],'frame-src':["'none'"],'frame-ancestors':[parentOrigin],sandbox:['allow-scripts','allow-same-origin']});
}
