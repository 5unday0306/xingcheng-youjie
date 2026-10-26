import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
import {createIsolationLab} from '../scripts/serve-map-isolation-lab.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const lab=await createIsolationLab(),browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage();
let assertions=0,blockedExternal=0;const eq=(a,b)=>{assert.equal(a,b);assertions++;};
const requests=[];await context.route('**/*',r=>{const u=new URL(r.request().url());if(![lab.parentOrigin,lab.mapOrigin].includes(u.origin)){blockedExternal++;return r.abort();}requests.push(u.pathname);return r.continue();});
try{
 await page.goto(lab.parentOrigin);await page.waitForFunction(()=>window.__lab?.snapshot().ready);
 const frame=page.frames().find(f=>f.url().startsWith(lab.mapOrigin));await frame.waitForFunction(()=>!!__mapLab.snapshot().display);
 eq(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin');eq(await page.locator('iframe').getAttribute('referrerpolicy'),'no-referrer');
 await page.evaluate(()=>{localStorage.setItem('requirements','synthetic private preference and budget');document.cookie='private_session=synthetic; Path=/; SameSite=Strict';});
 eq(await frame.evaluate(()=>{try{return parent.document.body.textContent;}catch{return 'DOM_BLOCKED';}}),'DOM_BLOCKED');
 eq(await frame.evaluate(()=>localStorage.getItem('requirements')),null);eq(await frame.evaluate(()=>document.cookie.includes('private_session')),false);
 eq(await frame.evaluate(()=>{try{parent.localStorage.getItem('requirements');return false;}catch{return true;}}),true);
 eq(await frame.evaluate(()=>window.open('about:blank')===null),true);
 eq(await frame.evaluate(origin=>{try{top.location.href=origin+'/#not-allowed';return false;}catch{return true;}},lab.parentOrigin),true);
 eq(page.url(),lab.parentOrigin+'/');
 const parentResponse=await context.request.get(lab.parentOrigin),childResponse=await context.request.get(lab.mapOrigin+'/frame');
 for(const r of [parentResponse,childResponse]){const c=r.headers()['content-security-policy'];eq(c.includes('unsafe-eval'),false);eq(c.includes('unsafe-inline'),false);}
 eq(childResponse.headers()['content-security-policy'].includes('frame-ancestors '+lab.parentOrigin),true);
 eq(await page.evaluate(async()=>{const {createMapEndpoint}=await import('/map-frame-protocol.js');try{createMapEndpoint({target:window,origin:location.origin,runId:__lab.runId,role:'main',onMessage(){}});return false;}catch{return true;}}),true);
 await frame.getByRole('button',{name:'1 测试起点'}).click();await page.waitForFunction(()=>__lab.snapshot().selected==='ENDPOINT');
 await page.locator('#focus').click();await page.waitForFunction(()=>__lab.snapshot().selected==='TY04');
 await page.locator('#zoom').click();await page.waitForFunction(()=>__lab.snapshot().view?.zoom===14);
 await frame.locator('#pan').click();await page.waitForFunction(()=>__lab.snapshot().view?.center[0]===112.551);
 eq(JSON.stringify(await frame.evaluate(()=>__mapLab.snapshot().display)).includes('synthetic private'),false);
 // Correct-origin sibling still has the wrong Window and must be rejected.
 const runId=await page.evaluate(()=>__lab.runId);const sibling=await page.evaluate(({origin,runId})=>{const f=document.createElement('iframe');f.id='sibling';f.src=origin+'/frame#'+new URLSearchParams({runId});f.sandbox='allow-scripts allow-same-origin';document.body.append(f);return true;},{origin:lab.mapOrigin,runId});eq(sibling,true);
 await page.waitForFunction(()=>document.getElementById('sibling').contentWindow!==null);
 const siblingFrame=await (await page.locator('#sibling').elementHandle()).contentFrame();await siblingFrame.waitForURL(lab.mapOrigin+'/frame**');await siblingFrame.waitForFunction(()=>!!window.__mapLab);
 await siblingFrame.evaluate(({parentOrigin,runId})=>parent.postMessage({v:1,runId,seq:100,type:'SELECT',payload:{id:'ENDPOINT'}},parentOrigin),{parentOrigin:lab.parentOrigin,runId});
 await frame.evaluate(({parentOrigin,runId})=>{parent.postMessage({v:1,runId:runId.replace(/.$/,'z'),seq:100,type:'SELECT',payload:{id:'ENDPOINT'}},parentOrigin);parent.postMessage({v:1,runId,seq:101,type:'ROAD_QUERY',payload:{}},parentOrigin);parent.postMessage({v:1,runId,seq:102,type:'SELECT',payload:{id:'ENDPOINT',budget:10}},parentOrigin);}, {parentOrigin:lab.parentOrigin,runId});
 await page.evaluate(({origin,runId})=>window.postMessage({v:1,runId,seq:100,type:'SELECT',payload:{id:'ENDPOINT'}},origin),{origin:lab.parentOrigin,runId});
 await page.waitForTimeout(100);eq(await page.evaluate(()=>__lab.snapshot().selected),'TY04');eq(await page.evaluate(()=>__lab.snapshot().ignored>=5),true);
 // Valid but unknown ID cannot become selected. Duplicate sequence cannot replay a selection.
 await frame.evaluate(({origin,runId})=>{parent.postMessage({v:1,runId,seq:200,type:'SELECT',payload:{id:'UNKNOWN'}},origin);parent.postMessage({v:1,runId,seq:200,type:'SELECT',payload:{id:'ENDPOINT'}},origin);},{origin:lab.parentOrigin,runId});
 await page.waitForTimeout(50);eq(await page.evaluate(()=>__lab.snapshot().selected),'TY04');
 // DOM/text sinks remain inert. No command for arbitrary URLs or execution.
 eq(await page.evaluate(()=>{try{__lab.send('DISPLAY',{...__lab.display,code:'synthetic'});return false;}catch{return true;}}),true);
 const before=await page.evaluate(()=>__lab.snapshot());await page.locator('#destroy').click();await page.waitForFunction(()=>__lab.snapshot().ended);eq(await page.evaluate(()=>__lab.endpoint.send('VIEW',{action:'zoomIn'})),false);eq(await page.locator('#frameRoot iframe').count(),0);
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:{type:'READY'}})));eq(await page.evaluate(()=>__lab.snapshot().ended),true);
 // Explicit restart gets a new run identifier. Old-run messages are rejected.
 await page.goto(lab.parentOrigin);await page.waitForFunction(()=>window.__lab?.snapshot().ready);eq(await page.evaluate(old=>__lab.runId!==old,runId),true);
 const reloaded=page.frames().find(f=>f.url().startsWith(lab.mapOrigin));await reloaded.evaluate(({origin,old})=>parent.postMessage({v:1,runId:old,seq:300,type:'SELECT',payload:{id:'ENDPOINT'}},origin),{origin:lab.parentOrigin,old:runId});await page.waitForTimeout(50);eq(await page.evaluate(()=>__lab.snapshot().selected),null);
 await page.screenshot({path:'docs/verification/task05b-isolation-lab.png'});
 // The handshake timeout removes the iframe; no automatic replacement or SDK attempt.
 const frameRequestsBefore=requests.filter(p=>p==='/frame').length;await page.goto(lab.parentOrigin+'/?scenario=timeout');await page.waitForFunction(()=>__lab?.snapshot().ended);eq(await page.locator('#frameRoot iframe').count(),0);await page.waitForTimeout(1200);eq(requests.filter(p=>p==='/frame').length-frameRequestsBefore,1);eq(await page.evaluate(()=>__lab.snapshot().ready),false);
 eq(requests.some(p=>p.startsWith('/api/')||p.startsWith('/_AMapService')),false);eq(blockedExternal,0);
 const report={at:new Date().toISOString(),assertions,mode:'本地双来源严格CSP替身；未加载真实SDK、未启用权限放宽',origins:{parent:lab.parentOrigin,map:lab.mapOrigin},blockedExternal,realBusinessCalls:0,checks:['父DOM/本地存储/host-only cookie隔离','精确来源+窗口+runId+schema+序号','列表/地图选择与视图消息','伪造消息及旧run拒绝','超时销毁与不自动重试','正式业务请求0'],beforeDestroy:before};
 await writeFile('docs/verification/task05b-isolation-browser.json',JSON.stringify(report,null,2)+'\n');console.log({assertions,realBusinessCalls:0});
}finally{await context.close();await browser.close();await lab.close();}
