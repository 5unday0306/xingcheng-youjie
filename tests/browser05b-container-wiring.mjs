import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';import {createMapContainerServer} from '../lib/map-container-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');let assertions=0,external=0,forbiddenActions=0;const eq=(a,b)=>{assert.equal(a,b);assertions++;};
const origins={},live={capabilities:()=>({mode:'real-preparation',mapPicking:true,mapDisplayOnly:true,map:'未加载',canPrepare:false,canGenerate:false,haltReason:'SDK_FAILED'}),action:async path=>{if(path.endsWith('/pick/state'))return {revision:0,points:{ENDPOINT:null,TY04:null},mode:'',route:null};if(path.endsWith('/ledger'))return {counts:{location:5,map:3,route:0,model:0},reservedCents:20,stopped:{code:'SDK_FAILED'}};forbiddenActions++;throw Error('synthetic stop');}};
const main=createServer({planning:live,live,mapFrameOrigin:()=>origins.mapOrigin}),child=createMapContainerServer({getOrigins:()=>origins});await new Promise(r=>main.listen(0,'127.0.0.1',r));await new Promise(r=>child.listen(0,'127.0.0.2',r));origins.parentOrigin='http://127.0.0.1:'+main.address().port;origins.mapOrigin='http://127.0.0.2:'+child.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();let holdContainer=false,containerRequests=0;
await context.route('**/*',async r=>{const u=new URL(r.request().url());if(!Object.values(origins).includes(u.origin)){external++;return r.abort();}
 if(u.pathname==='/container'){containerRequests++;if(holdContainer)return;}
 if(u.pathname==='/map-container.js'||u.pathname==='/isolated-map-container.js'){
  const file=u.pathname==='/map-container.js'?'web/map-container.js':'web/isolated-map-container.js',body=await readFile(file,'utf8');
  return r.fulfill({contentType:'text/javascript',body:body+`;try{window.__compileProbe=new Function('return 42')()===42;}catch{window.__compileProbe=false;}`});
 }
 return r.continue();});
try{
 await page.goto(origins.parentOrigin);await page.locator('#pickInspectContainer').waitFor();eq(await page.locator('#pickLoad').isDisabled(),true);eq(containerRequests,0);
 const headers=(await context.request.get(origins.parentOrigin)).headers();eq(headers['content-security-policy'].includes('unsafe-eval'),false);eq(headers['content-security-policy'].includes('amap.com'),false);
 await page.locator('#pickInspectContainer').click();await page.waitForFunction(()=>document.getElementById('pickStatus').textContent.includes('容器已就绪'));
 const frame=page.frames().find(f=>f.url().startsWith(origins.mapOrigin));await frame.waitForFunction(()=>typeof __compileProbe==='boolean');
 eq(await page.evaluate(()=>__compileProbe),false);eq(await frame.evaluate(()=>__compileProbe),true);eq(await frame.locator('#containerStatus').textContent(),'隔离容器已就绪；真实SDK未加载');
 eq(await frame.evaluate(()=>{try{return parent.document.title;}catch{return 'blocked';}}),'blocked');
 eq(await page.locator('#pickInspectContainer').isDisabled(),true);eq(containerRequests,1);
 await page.locator('#pickPanel').evaluate(n=>window.scrollTo(0,n.getBoundingClientRect().top+scrollY-12));await page.screenshot({path:'docs/verification/task05b-container-wiring-desktop.png'});
 await page.setViewportSize({width:390,height:844});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'docs/verification/task05b-container-wiring-mobile.png'});
 await page.locator('#pickCloseContainer').click();eq(await page.locator('#pickMap iframe').count(),0);eq(await page.locator('#pickInspectContainer').isDisabled(),false);
 await page.reload();await page.locator('#pickInspectContainer').waitFor();eq(containerRequests,1);eq(await page.locator('#pickLoad').isDisabled(),true);
 await page.clock.install();holdContainer=true;await page.locator('#pickInspectContainer').click();await page.clock.fastForward(6000);await page.waitForFunction(()=>document.getElementById('pickStatus').textContent.includes('超时'));eq(await page.locator('#pickMap iframe').count(),0);eq(containerRequests,2);eq(forbiddenActions,0);eq(external,0);
 const report={at:new Date().toISOString(),assertions,scope:'正式工作台容器集成，合成停止记录；不是SDK/底图验收',externalRequests:external,forbiddenActions,containerRequests,realSdkCalls:0,permission:'仅子页unsafe-eval；无inline、通配来源、bootstrap或代理'};await writeFile('docs/verification/task05b-container-wiring-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await context.close();await browser.close();main.closeAllConnections();child.closeAllConnections();await Promise.all([new Promise(r=>main.close(r)),new Promise(r=>child.close(r))]);}
