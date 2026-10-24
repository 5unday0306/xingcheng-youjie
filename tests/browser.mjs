import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1400,height:1000}});
const page=await context.newPage();const failures=[],external=[];let checks=0;
page.on('pageerror',e=>failures.push(e.message));
await context.route('**/*',route=>{if(new URL(route.request().url()).origin!=='http://127.0.0.1:4173'){external.push(route.request().url());return route.abort();}return route.continue();});
const clickCheck=()=>page.getByRole('button',{name:'检查输入并查看摘要'}).click();
const contains=async(selector,text)=>{assert.ok((await page.locator(selector).textContent()).includes(text));checks++;};
try{
 await page.goto('http://127.0.0.1:4173');await clickCheck();await contains('#checkStatus','输入检查通过');await contains('#summary','风景拍照');await contains('#summary','2026-11-08');await contains('#summary','600');await contains('#summary','公共测试点');await contains('.warning','旅行可行性未验证');
 await page.locator('#member-0-budget').fill('450');await page.locator('#member-0-preference').fill('历史建筑');assert.equal(await page.locator('#member-1-budget').inputValue(),'600');assert.equal(await page.locator('#member-1-preference').inputValue(),'风景拍照');checks+=2;
 await page.locator('#save').click();await contains('#storageStatus','已保存');await page.reload();assert.equal(await page.locator('#member-0-budget').inputValue(),'450');assert.equal(await page.locator('#member-0-preference').inputValue(),'历史建筑');checks+=2;
 await page.locator('#people').selectOption('1');assert.equal(await page.locator('#confirmDialog').isVisible(),true);await page.locator('#cancelChange').click();assert.equal(await page.locator('#people').inputValue(),'3');checks++;
 await page.locator('#people').selectOption('1');await page.locator('#acceptChange').click();await page.locator('#dayCount').selectOption('1');await page.locator('#acceptChange').click();await clickCheck();await contains('#summary','1人 · 1天');
 await page.locator('#people').selectOption('6');await page.locator('#dayCount').selectOption('3');for(let i=1;i<6;i++)await page.locator(`#member-${i}-preference`).fill(`偏好${i}`);await clickCheck();await contains('#checkStatus','输入检查通过');assert.equal(await page.locator('#members .member').count(),6);await contains('#summary','2026-11-09');checks++;
 await page.locator('#day-0-end').fill('08:00');await clickCheck();await contains('#errors','每日结束时间必须晚于开始时间');assert.equal(await page.locator('#day-0-end').inputValue(),'08:00');checks++;await page.locator('#day-0-end').fill('18:00');
 await page.locator('#member-0-budget').fill('');await clickCheck();await contains('#errors','不能为空');assert.equal(await page.locator('#member-0-budget').inputValue(),'');checks++;
 await page.locator('#member-0-budget').fill('450');await page.locator('#save').click();await page.reload();await clickCheck();await contains('#summary','6人 · 3天');
 await page.evaluate(()=>localStorage.setItem('xingchengyoujie.requirements.v1','BROKEN'));await page.locator('#member-0-budget').fill('333');await page.locator('#restore').click();await page.locator('#acceptChange').click();await contains('#storageStatus','恢复失败');assert.equal(await page.locator('#member-0-budget').inputValue(),'333');assert.equal(await page.evaluate(()=>localStorage.getItem('xingchengyoujie.requirements.v1')),'BROKEN');checks+=2;
 await page.locator('#save').click();await contains('#storageStatus','保存失败');assert.equal(await page.evaluate(()=>localStorage.getItem('xingchengyoujie.requirements.v1')),'BROKEN');checks++;
 await page.locator('#replace').click();await page.locator('#acceptChange').click();await contains('#storageStatus','已保存');await page.reload();assert.equal(await page.locator('#member-0-budget').inputValue(),'333');checks++;
 await page.evaluate(()=>localStorage.setItem('xingchengyoujie.requirements.v1',JSON.stringify({version:99})));await page.reload();await contains('#storageStatus','版本不兼容');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('xingchengyoujie.requirements.v1')).version),99);checks++;
 await page.evaluate(()=>localStorage.clear());await page.reload();await clickCheck();
 await mkdir('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/task02-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/verification/task02-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
 for(const path of ['/.env','/AGENTS.md','/scripts/verify_api_access.py','/docs/verification/api-probe-2026-10-24.json','/../.env']){const res=await page.request.get('http://127.0.0.1:4173'+path);assert.equal(res.status(),404);checks++;}
 assert.deepEqual(external,[]);assert.deepEqual(failures,[]);checks+=2;
 const report={executedAt:new Date().toISOString(),browser:'Microsoft Edge via Playwright, headless',checks,passed:true,externalRequests:external.length,pageErrors:failures.length,scope:'default, isolated members, 1/1 and 6/3, reduction cancellation, invalid time/empty amount, refresh restore, damaged/version storage protection, explicit overwrite, mobile overflow, private paths 404'};
 await writeFile('docs/verification/task02-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();}
