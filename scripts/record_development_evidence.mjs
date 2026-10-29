// Local evidence viewer recording only: no app server or upstream requests.
import {createRequire} from 'node:module';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {writeFile,rename} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=resolve('docs/private/final-delivery-2026-10-29'),browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir,size:{width:1920,height:1080}}});
let blocked=0;await context.route(/^https?:/,route=>{blocked++;return route.abort();});const page=await context.newPage();const events=[];const start=Date.now();
try{await page.goto(pathToFileURL(resolve(dir,'开发证据回放台.html')).href);for(let i=0;i<5;i++){
 await page.locator(`[data-index="${i}"]`).click();events.push({chapter:i+1,atMs:Date.now()-start,source:'真实记录导航，不执行原Prompt或工具'});await page.waitForTimeout(9000);
 const pre=page.locator(`#chapter-${i} pre`);for(let j=0;j<3;j++){await pre.evaluate((n,j)=>n.scrollTo({top:(n.scrollHeight-n.clientHeight)*(j+1)/3,behavior:'smooth'}),j);await page.waitForTimeout(5000);}await pre.evaluate(n=>n.scrollTo({top:0,behavior:'smooth'}));await page.waitForTimeout(4000);
}await page.screenshot({path:resolve(dir,'开发回放-最后一帧.png')});const v=page.video();await context.close();await rename(await v.path(),resolve(dir,'真实开发记录导航-原始录屏.webm'));await writeFile(resolve(dir,'开发回放录制记录.json'),JSON.stringify({recordedAt:new Date().toISOString(),durationMs:Date.now()-start,viewport:[1920,1080],events,blockedExternalRequests:blocked,description:'实际浏览器导航/滚动真实脱敏记录与Git差异；历史复现，不是原开发时刻现场录像，无业务调用'},null,2));console.log({recorded:true,seconds:(Date.now()-start)/1000,blocked});}finally{await browser.close();}
