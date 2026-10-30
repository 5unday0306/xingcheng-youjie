import {createDynamicOffline} from '../lib/dynamic-offline.mjs';import {createServer} from '../server.mjs';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const before=process.argv.includes('--before'),prefix='concise-notices';
const live=createDynamicOffline(JSON.parse(await readFile('docs/verification/task06-research.json','utf8')));let calls=0;const service={...live,action:(p,i)=>{if(/\/(start|retry|restore)$/.test(p))calls++;return live.action(p,i);}};
const server=createServer({planning:live,live:service});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:960}}),page=await ctx.newPage();let n=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const eq=(a,b)=>{assert.equal(a,b);n++;};
try{
 await page.goto(base);await page.locator('#primaryFlow:not([disabled])').waitFor();await page.locator('#primaryFlow').click();await page.locator('#planningStart').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('生成待确认'));

 const result=await live.action('/api/live/dynamic/state',{request:(await import('../web/core.js')).toRequest((await import('../web/core.js')).defaultDraft())});const raw=JSON.stringify(result);
 eq(await page.locator('#planEvidenceNotice').count(),1);
 eq(await page.locator('#planEvidenceNotice').isVisible(),true);
 eq((await page.locator('#planResult').innerText()).includes('总量未知；已计入的预测/估计'),false);
 eq((await page.locator('#planResult .planItems').innerText()).includes('到离时间未知'),false);
 const retained=result.state.preview.review.days[0],gaps=[...retained.time.missing,...retained.members.flatMap(m=>m.walking.missing),...result.state.preview.review.members.flatMap(m=>m.budget.missing)];
 await page.locator('#basisDetails').evaluate(n=>n.open=true);const evidence=await page.locator('#currentPlanBasis').innerText();for(const gap of new Set(gaps))eq(evidence.includes(gap),true);
 const rows=await page.locator('#currentPlanBasis li').allTextContents();eq(new Set(rows).size,rows.length);
 await page.locator('#basisDetails').evaluate(n=>n.open=false);eq(await page.locator('#currentPlanBasis').isVisible(),false);
 const beforeView=calls;await page.locator('#dayTabs button').nth(1).click();await page.locator('#dayTabs button').first().click();eq(calls,beforeView);
 eq(JSON.stringify(await live.action('/api/live/dynamic/state',{request:(await import('../web/core.js')).toRequest((await import('../web/core.js')).defaultDraft())})),raw);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/verification/concise-notices-preview-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('button[data-pane=activities]').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'docs/verification/concise-notices-preview-390.png'});await page.setViewportSize({width:1440,height:960});
 await page.locator('#agentAccept:not([disabled])').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('已采用'));
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/verification/'+prefix+'-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('button[data-pane=activities]').click();await page.screenshot({path:'docs/verification/'+prefix+'-390.png'});
 if(!before){
 eq(await page.locator('#journeyVersion').innerText().then(t=>t.includes('我的行程')),true);eq(await page.locator('#navReplan').innerText(),'调整行程');
 await page.locator('#navEdit').click();await page.locator('details.member').first().evaluate(n=>n.open=true);eq(await page.locator('.copyWalking').count(),0);await page.locator('#member-0-walk-0').fill('5');eq(await page.locator('#member-0-walk-1').inputValue(),'6');await page.locator('#member-0-walk-1').fill('4');await page.locator('#save').click();await page.locator('#closeEditor').click();eq((await page.locator('#flowStatus').innerText()).includes('需求已修改'),true);eq(await page.locator('#primaryFlow').innerText(),'运行离线演练');
 const count=calls;await page.locator('#dayTabs button').nth(1).click();await page.locator('button[data-pane=agents]').click();await page.locator('button[data-pane=activities]').click();eq(calls,count);await page.reload();await page.locator('#navEdit').click();await page.locator('details.member').first().evaluate(n=>n.open=true);eq(await page.locator('#member-0-walk-0').inputValue(),'5');eq(await page.locator('#member-0-walk-1').inputValue(),'4');eq(await page.locator('#member-1-walk-0').inputValue(),'6');await page.locator('#closeEditor').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);eq(errors.length,0);
 await writeFile('docs/verification/concise-notices-browser.json',JSON.stringify({at:new Date().toISOString(),source:'独立本地离线替身；未读正式账本或调用真实接口',assertions:n,calls,errors,coverage:'公共提醒唯一/原始缺口可展开完整读取/重复合并/展示不改数据与调用/采用到我的行程/需求变更提示/独立步行保存恢复/页签日期不请求/390无溢出'},null,2));}
 console.log({before,assertions:n,errors});
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
