// Explicit mode policies. Never enable arbitrary scripts, inline scripts or eval.
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
