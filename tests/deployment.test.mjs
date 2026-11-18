import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {deploymentConfig} from '../lib/deployment-config.mjs';
import {createServer} from '../server.mjs';
import {createMapContainerServer} from '../lib/map-container-server.mjs';
const app='https://travel.example.com',map='https://map.example.com';
const request=(port,path,headers={})=>new Promise((resolve,reject)=>{const r=http.get({hostname:'127.0.0.1',port,path,headers},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});r.on('error',reject);});
async function serve(server,run){await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('deployment origins are explicit paired HTTPS hosts, never inferred from proxy headers',()=>{
 assert.equal(deploymentConfig({}),null);assert.deepEqual(deploymentConfig({APP_PUBLIC_ORIGIN:app,MAP_PUBLIC_ORIGIN:map}),{appOrigin:app,mapOrigin:map});
 for(const [a,m] of [[app,''],['http://travel.example.com',map],[app+'/',map],[app+'/path',map],[app+'?x=1',map],['https://u:p@travel.example.com',map],[app,app],['https://localhost',map],['https://127.0.0.1',map],['https://travel.example.com:8443',map]])assert.throws(()=>deploymentConfig({APP_PUBLIC_ORIGIN:a,MAP_PUBLIC_ORIGIN:m}));
});
test('public reverse proxy preserves exact origin guards and frontend-only file boundary',async()=>{
 await serve(createServer({publicOrigin:app,mapFrameOrigin:map}),async port=>{
 const good={host:'travel.example.com',origin:app,'sec-fetch-site':'same-origin'};
 assert.equal((await request(port,'/api/candidates',good)).status,200);
 for(const headers of [{...good,origin:'https://evil.example.com'},{...good,host:'evil.example.com'},{...good,host:'127.0.0.1:'+port},{...good,'sec-fetch-site':'cross-site'},{...good,origin:'http://travel.example.com','x-forwarded-proto':'https'},{...good,host:'evil.example.com','x-forwarded-host':'travel.example.com'}])assert.equal((await request(port,'/api/candidates',headers)).status,403);
 const r=await request(port,'/',good);assert.equal(r.status,200);assert.ok(r.headers['content-security-policy'].includes('frame-src '+map));assert.ok(!r.headers['content-security-policy'].includes('unsafe-inline'));assert.ok(!r.headers['content-security-policy'].includes('unsafe-eval'));
 for(const path of ['/.env','/deploy/.env','/docs/private/08-state.json','/.git/config'])assert.equal((await request(port,path,good)).status,404);
 const cap=JSON.parse((await request(port,'/api/capabilities',good)).body);assert.equal(cap.mapFrameOrigin,map);
 });
});
test('map host advertises deployed parent and CSP without enabling extra vendor permissions',async()=>{
 await serve(createMapContainerServer({getOrigins:()=>({parentOrigin:app,mapOrigin:map})}),async port=>{
 const r=await request(port,'/container-config.js',{host:'map.example.com'});assert.equal(r.status,200);assert.ok(r.body.includes(app));assert.ok(r.headers['content-security-policy'].includes('frame-ancestors '+app));
 assert.equal((await request(port,'/container-config.js',{host:'travel.example.com'})).status,403);
 assert.equal((await request(port,'/container',{host:'map.example.com','sec-fetch-dest':'iframe'})).status,200);
 assert.equal((await request(port,'/container',{host:'map.example.com'})).status,403);
 });
});
