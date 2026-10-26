const evidencePath=p=>process.env.MAP_ISOLATION_REGRESSION==='1'?p.replace('task05b-sdk-policy','task05b-isolation-regression-policy'):p;
// Real browser CSP enforcement; every external request is locally intercepted.
// No credentials, approval, ledger or real SDK is loaded.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';
import {observeResourceFailures} from '../scripts/browser-resource-diagnostics.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});let assertions=0,externalFulfilled=0;
const reports=[],eq=(a,b)=>{assert.equal(a,b);assertions++;};
const servers=[];
async function setup(real=true,scenario='policy'){
 const server=createServer(real?{live:{}}:{});servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const context=await browser.newContext(),page=await context.newPage(),seen=[];let sdk=0;
 const network=await observeResourceFailures(await context.newCDPSession(page),base);
 await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.origin===base){if(u.pathname==='/sdk-policy-fixture.js')return route.fulfill({contentType:'text/javascript',body:`const a=document.createElement('a');a.href='javascript:window.__forbiddenRan=true';document.body.append(a);a.click();const img=new Image();img.src='/controlled-missing-image.png?key=CANARY_SECRET';document.body.append(img);fetch('/controlled-missing-image.png?key=CANARY_OTHER');const forbidden=document.createElement('script');forbidden.src='https://not-allowed.invalid/from-fixture.js?key=CANARY_OTHER';document.head.append(forbidden);try{eval('1+1');}catch{}WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])).catch(()=>{});`});return route.continue();}
  // Interception prevents all real external traffic, including accidental calls.
  seen.push({origin:u.origin,path:u.pathname});externalFulfilled++;
  if(u.origin==='https://webapi.amap.com'){sdk++;if(scenario==='error')return route.abort();if(scenario==='timeout')await new Promise(r=>setTimeout(r,250));
    return route.fulfill({contentType:'text/javascript',body:scenario==='policy'?`window.__mainLoaded=true;const s=document.createElement('script');s.src='https://jsapi-service.amap.com/mapsplugincdn?key=CANARY_SECRET';document.head.append(s);`:`window.AMap={Map:class{constructor(n){window.__fakeMap=this;this.handlers={};this.dead=0;}on(k,f){this.handlers[k]=f;}add(){}remove(){}destroy(){this.dead++;}},Marker:class{},Polyline:class{}};`});}
  if(u.origin==='https://jsapi-service.amap.com')return route.fulfill({contentType:'text/javascript',body:'window.__dependencyLoaded=true;'});
  return route.fulfill({contentType:'text/javascript',body:'window.__forbiddenRan=true;'});
 });
 await page.goto(base);await page.evaluate(async()=>{const {installSdkDiagnostics}=await import('/sdk-diagnostics.js');installSdkDiagnostics();});
 return {base,context,page,seen,network,sdk:()=>sdk};
}
try{
 for(const real of [true,false]){
  const s=await setup(real);const {page}=s;
  await page.evaluate(()=>{for(const src of ['https://webapi.amap.com/maps?key=CANARY_SECRET','https://not-allowed.invalid/attack.js?token=CANARY_SECRET']){const script=document.createElement('script');script.src=src;document.head.append(script);}});
  if(real)await page.waitForFunction(()=>window.__dependencyLoaded===true);else await page.waitForFunction(()=>__sdkDiagnostics.snapshot().some(r=>r.kind==='csp'));
  eq(await page.evaluate(()=>!!window.__mainLoaded),real);eq(await page.evaluate(()=>!!window.__dependencyLoaded),real);eq(await page.evaluate(()=>!!window.__forbiddenRan),false);
  eq(s.seen.some(u=>u.origin==='https://not-allowed.invalid'),false);if(!real)eq(s.seen.length,0);
  // Exercise native policy violation and HTTP 404 diagnostics without guessing M2's 404.
  await page.evaluate(()=>{const script=document.createElement('script');script.src='/sdk-policy-fixture.js?key=CANARY_OTHER';document.head.append(script);});
  await page.waitForFunction(()=>__sdkDiagnostics.snapshot().some(r=>r.kind==='http-error'&&r.status===404&&r.resourceType==='fetch'));await page.waitForFunction(()=>__sdkDiagnostics.snapshot().some(r=>r.origin==='wasm-eval'));
  const diagnostics=await page.evaluate(()=>__sdkDiagnostics.snapshot());eq(JSON.stringify(diagnostics).includes('CANARY'),false);eq(diagnostics.some(r=>r.path==='/controlled-missing-image.png'&&r.status===404),true);eq(await page.evaluate(()=>!!window.__forbiddenRan),false);
  eq(diagnostics.some(r=>r.origin==='wasm-eval'&&r.path===''),true);eq(diagnostics.some(r=>r.origin==='eval'&&r.path===''),true);const network=s.network.snapshot();await writeFile(evidencePath('docs/verification/task05b-sdk-policy-diagnostic-probe.json'),JSON.stringify({mode:'offline synthetic diagnostic probe',diagnostics,network},null,2)+'\n');eq(JSON.stringify(network).includes('CANARY'),false);eq(network.some(r=>r.status===404&&r.path==='/controlled-missing-image.png'&&r.initiator.path==='/sdk-policy-fixture.js'),true);
  eq(diagnostics.some(r=>r.kind==='csp'&&r.initiator.path==='/sdk-policy-fixture.js'),true);
  reports.push({scenario:real?'real-mode-policy-synthetic':'ordinary-mode-policy',diagnostics,network,intercepted:s.seen});await s.context.close();
 }
 for(const scenario of ['error','timeout','abort','destroy','panel-expiry','panel-destroy','panel-display-only','map-timeout']){
  const s=await setup(true,scenario),{page,context}=s;await page.clock.install();
  if(scenario.startsWith('panel-')){
   const events=[];let leases=0;
   await context.route(s.base+'/api/live/**',async r=>{const p=new URL(r.request().url()).pathname;let b={revision:0,points:{ENDPOINT:null,TY04:null},mode:'',route:null};
    if(p.endsWith('/map-lease')){leases++;b={jsKey:'TEST_PUBLIC',lease:'TEST',expiresAt:Date.now()+5000};}
    if(p.endsWith('/sdk-event')){events.push(r.request().postDataJSON().event);b={recorded:true};}
    return r.fulfill({contentType:'application/json',body:JSON.stringify(b)});
   });
   await page.evaluate(async displayOnly=>{const {createPickPanel}=await import('/pick-panel.js');const root=document.createElement('div');document.body.replaceChildren(root);window.__panel=createPickPanel({root,capabilities:{canPrepare:true,mapPicking:true,mapDisplayOnly:displayOnly,map:'未加载'}});},scenario==='panel-display-only');
   await page.locator('#pickLoad').click();await page.waitForFunction(()=>!!window.__fakeMap);eq((await page.locator('#pickStatus').textContent()).includes('正在加载'),true);
   // Duplicate real DOM clicks while pending must not issue another lease.
   await page.evaluate(()=>document.getElementById('pickLoad').click());
   if(scenario==='panel-display-only'){
    await page.evaluate(()=>__fakeMap.handlers.complete?.());await page.waitForFunction(()=>document.getElementById('pickStatus').textContent.includes('请人工核对可见底图'));
    eq(events.includes('map-ready'),true);eq(await page.locator('#pickMode').isHidden(),true);eq(await page.locator('#pickRoute').isHidden(),true);eq(await page.locator('#pick-card-ENDPOINT').isHidden(),true);eq(leases,1);
    await page.evaluate(()=>__panel.destroy());reports.push({scenario,events,leases});await context.close();continue;
   }
   if(scenario==='panel-destroy')await page.evaluate(()=>__panel.destroy());else await page.clock.fastForward(6000);
   await page.evaluate(()=>__fakeMap.handlers.complete?.());await page.waitForTimeout(50);
   eq(events.includes('map-ready'),false);eq(leases,1);eq(s.sdk(),1);eq(await page.locator('#pickMap').isHidden(),true);eq(await page.locator('#pickLoad').isDisabled(),true);
   reports.push({scenario,events,leases});
  }else{
   await page.evaluate(async()=>{window.__loader=await import('/amap-loader.js');window.__abort=new AbortController();window.__attempt=__loader.loadAMapSdk({jsKey:'TEST_PUBLIC',serviceHost:location.origin+'/_AMapService',signal:__abort.signal});window.__outcome='pending';__attempt.then(()=>__outcome='resolved',()=>__outcome='rejected');});
   if(scenario==='abort')await page.evaluate(()=>__abort.abort());
   if(scenario==='timeout')await page.clock.fastForward(16000);
   await page.waitForFunction(()=>__outcome!=='pending');
   if(['error','timeout','abort'].includes(scenario)){
    eq(await page.evaluate(()=>__outcome),'rejected');await page.waitForTimeout(350);eq(await page.evaluate(()=>__outcome),'rejected');
    eq(await page.evaluate(()=>__attempt===__loader.loadAMapSdk({jsKey:'TEST_PUBLIC',serviceHost:location.origin})),true);eq(s.sdk()<=1,true);
   }else{
    await page.evaluate(async()=>{const {createMapView}=await import('/map-view.js');window.__view=createMapView({AMap,container:document.createElement('div')});window.__ready='pending';__view.whenReady().then(()=>__ready='resolved',()=>__ready='rejected');});
    if(scenario==='destroy')await page.evaluate(()=>{__view.destroy();__view.destroy();});else await page.clock.fastForward(16000);
    await page.evaluate(()=>__fakeMap.handlers.complete?.());eq(await page.evaluate(()=>__ready),'rejected');
    if(scenario==='destroy'){eq(await page.evaluate(()=>__fakeMap.dead),1);eq(await page.evaluate(()=>__view.focusActivity('ENDPOINT')),false);}
   }
   reports.push({scenario,sdkSubstitutions:s.sdk()});
  }
  await context.close();
 }
 const report={at:new Date().toISOString(),mode:'离线受控替身，非真实高德兼容验收',assertions,externalRequestsFulfilledLocally:externalFulfilled,realExternalRequests:0,reports};
 await writeFile(evidencePath('docs/verification/task05b-sdk-policy-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({assertions,scenarios:reports.length,realExternalRequests:0}));
}finally{await browser.close();for(const s of servers)await new Promise(r=>s.close(r));}
