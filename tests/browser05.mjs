import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';
import {createPlanningService} from '../lib/planning.mjs';
import {offlinePlanner} from '../lib/offline-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const service=createPlanningService({mode:'offline-test',planner:async p=>{await new Promise(r=>setTimeout(r,250));return offlinePlanner(p);}});
const testServer=createServer({planning:service}),normalServer=createServer();
await Promise.all([new Promise(r=>testServer.listen(0,'127.0.0.1',r)),new Promise(r=>normalServer.listen(0,'127.0.0.1',r))]);
const testBase=`http://127.0.0.1:${testServer.address().port}`,normalBase=`http://127.0.0.1:${normalServer.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
const external=[],errors=[];let assertions=0,posts=0;
const eq=(a,b)=>{assert.equal(a,b);assertions++;};
const has=async(selector,text)=>{assert.ok((await page.locator(selector).innerText()).includes(text));assertions++;};
await context.route('**/*',route=>{const url=new URL(route.request().url());if(![testBase,normalBase].includes(url.origin)){external.push(url.origin);return route.abort();}if(url.pathname==='/api/plan')posts++;return route.continue();});
page.on('pageerror',e=>errors.push(e.message));
const edit=async()=>{if(await page.locator('#navEdit').isVisible())await page.locator('#navEdit').click();else await page.locator('#brand').click();};
const route=async()=>{if(await page.locator('#navRoute').isVisible())await page.locator('#navRoute').click();else await page.locator('#tabRoute').click();};
const run=async()=>{await route();await page.locator('#offlineRun').click();await page.locator('#planResultTitle').waitFor();};
try {
  await page.goto(normalBase);await has('#generationMode','真实生成未启用');eq(await page.locator('#offlineRun').isDisabled(),true);eq(posts,0);
  eq(await page.locator('#candidateList > li').count(),4);await page.screenshot({path:'docs/verification/task05-default-1440.png'});
  await page.goto(testBase);await page.locator('#offlineRun:not([disabled])').waitFor();await run();
  await has('#planResult','离线替身测试');await has('#planResult','非真实模型或地图结果');await has('#planResult','总量未知');
  await has('#planResult','到离时间未知');await has('#planResult','道路与地图：未查询、未加载');eq(posts,1);
  await page.screenshot({path:'docs/verification/task05-offline-1440.png'});
  await page.locator('#dayTabs button').nth(1).click();await has('#planResult','2026-11-08');eq(posts,1);
  await edit();await page.locator('#member-0-budget').fill('1');eq(await page.locator('#planResult').innerText(),'');await run();
  await has('#planResult','个人全程费用：冲突');await has('#planResult','同行者2');
  await edit();await page.locator('#startDate').fill('2026-11-14');await page.locator('#people').selectOption('1');await page.locator('#acceptChange').click();
  await page.locator('#dayCount').selectOption('1');await page.locator('#acceptChange').click();await run();await has('#planResult','2026-11-14');eq(await page.locator('.planMembers > section').count(),1);
  // A running result cannot be applied to an edited requirement.
  await page.locator('#offlineRun').click();eq(await page.locator('#offlineRun').isDisabled(),true);await edit();await page.locator('#member-0-budget').fill('600');
  await page.waitForFunction(()=>document.getElementById('generationStatus').textContent.includes('旧结果已丢弃'));eq(await page.locator('#planResult').innerText(),'');
  await page.locator('#people').selectOption('6');await page.locator('#dayCount').selectOption('3');
  for(let i=1;i<6;i++){await page.locator(`#members > details`).nth(i).evaluate(n=>n.open=true);await page.locator(`#member-${i}-preference`).fill(`测试需求${i}`);}
  await run();eq(await page.locator('.planMembers > section').count(),6);eq(await page.locator('#dayTabs button').count(),3);
  await page.locator('#dayTabs button').nth(2).click();await has('#planResult','2026-11-16');
  for(const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:width===390?844:900});await route();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await edit();await page.locator('#members > details').nth(5).evaluate(n=>n.open=true);await page.locator('#member-5-budget').fill('');await page.locator('#check').click();
    eq(await page.evaluate(()=>document.activeElement.id),'member-5-budget');await page.locator('#member-5-budget').fill('600');
    await route();await page.locator('#displayScroll').evaluate(n=>n.scrollTop=n.scrollHeight);await edit();await page.locator('#check').click();
    await page.waitForFunction(()=>{const h=document.getElementById('summaryTitle').getBoundingClientRect(),s=document.getElementById('displayScroll').getBoundingClientRect();return h.top>=s.top&&h.bottom<=s.bottom;});
    eq(await page.evaluate(()=>document.activeElement.id),'summaryTitle');
  }
  // Capture the test result on an ordinary 390x844 page with explicit label.
  await page.setViewportSize({width:390,height:844});await page.goto(testBase);await page.locator('#navRoute').click();await page.locator('#offlineRun:not([disabled])').waitFor();await run();
  await page.screenshot({path:'docs/verification/task05-offline-390.png'});
  eq(await page.evaluate(()=>window.AMap===undefined),true);eq(await page.locator('script[src*="amap"]').count(),0);
  assert.deepEqual(errors,[]);assertions++;assert.deepEqual(external,[]);assertions++;
  const report={executedAt:new Date().toISOString(),mode:'offline-test, test adapters only',browser:'Edge headless / Playwright',assertions,passed:true,externalRequests:external.length,pageErrors:errors,localPlanPosts:posts,
    realCalls:{model:0,location:0,route:0,map:0},checks:['default disabled; candidates available','default 3/2, 1/1, 6/3','unknown values, personal budget conflict','day switch no new post','stale result discarded during edit','375/390/768/1024/1440, error correction then summary title inside viewport','no map SDK or geometry']};
  await writeFile('docs/verification/task05-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
} finally {await browser.close();await Promise.all([new Promise(r=>testServer.close(r)),new Promise(r=>normalServer.close(r))]);}
