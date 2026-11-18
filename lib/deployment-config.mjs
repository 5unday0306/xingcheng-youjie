// Fixed HTTPS origins for a reverse proxy; local startup remains loopback-only.
export function validatePublicOrigin(origin){
 let u;try{u=new URL(origin);}catch{throw Error('部署来源无效');}
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.port||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||!u.hostname.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))throw Error('部署来源必须是无路径、无端口的固定HTTPS域名');
 return origin;
}
export function deploymentConfig(env=process.env){
 const app=env.APP_PUBLIC_ORIGIN,map=env.MAP_PUBLIC_ORIGIN;
 if(!app&&!map)return null;
 if(!app||!map)throw Error('部署必须同时配置主站与地图HTTPS来源');
 [app,map].forEach(validatePublicOrigin);
 if(new URL(app).hostname===new URL(map).hostname)throw Error('地图必须使用独立主机来源');
 return {appOrigin:app,mapOrigin:map};
}
