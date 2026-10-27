// Read-only stopped workbench evidence; abort all non-local requests.
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage();let external=0;
await ctx.route('**/*',r=>{if(['http://127.0.0.1:4178','http://127.0.0.2:4184'].includes(new URL(r.request().url()).origin))return r.continue();external++;return r.abort();});
try{
 await page.goto('http://127.0.0.1:4178');await page.locator('#pickInspectContainer').click();await page.waitForFunction(()=>document.getElementById('pickStatus').textContent.includes('容器已就绪'));
 await page.locator('#pickPanel').evaluate(n=>scrollTo(0,n.getBoundingClientRect().top+scrollY-12));await page.screenshot({path:'docs/verification/task05b-isolated-stopped-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#pickPanel').evaluate(n=>scrollTo(0,n.getBoundingClientRect().top+scrollY-12));await page.screenshot({path:'docs/verification/task05b-isolated-stopped-mobile.png'});
 const ledger=await(await ctx.request.post('http://127.0.0.1:4178/api/live/ledger',{data:{}})).json();
 const report={at:new Date().toISOString(),scope:'实际停止账本只读核对与正式工作台容器检查，未加载SDK',counts:ledger.counts,reservedCents:ledger.reservedCents,stopped:ledger.stopped?.code,loadDisabled:await page.locator('#pickLoad').isDisabled(),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),externalRequests:external};
 if(report.counts?.map!==3||report.counts?.location!==5||report.reservedCents!==20||report.stopped!=='SDK_FAILED'||!report.loadDisabled||external)throw Error('停止状态或调用基线不符');
 await writeFile('docs/verification/task05b-isolated-stopped.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await ctx.close();await browser.close();}
