import {createDynamicOffline} from '../lib/dynamic-offline.mjs';import {createServer} from '../server.mjs';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const before=process.argv.includes('--before'),prefix='agent-history-visible';
const live=createDynamicOffline(JSON.parse(await readFile('docs/verification/task06-research.json','utf8')));let calls=0;const service={...live,action:(p,i)=>{if(/\/(start|retry|restore)$/.test(p))calls++;return live.action(p,i);}};
const server=createServer({planning:live,live:service});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:960}}),page=await ctx.newPage();let n=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const eq=(a,b)=>{assert.equal(a,b);n++;};
try{
 await page.goto(base);await page.locator('#primaryFlow:not([disabled])').waitFor();await page.locator('#primaryFlow').click();await page.locator('#planningStart').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('生成待确认'));
 await page.locator('#agentAccept:not([disabled])').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('已采用'));

 const beforeCalls=calls;
 const roles=async(prefix)=>{eq(await page.locator('#'+prefix+'Nodes details[data-role]').count(),4);for(const role of ['coordinate','screen','plan','audit'])eq(await page.locator('#'+prefix+'Nodes [data-role='+role+']').getAttribute('data-status'),'completed');};
 await roles('agent');
 await page.locator('#navReplan').click();await page.waitForFunction(()=>document.querySelector('#replanAgentNodes [data-role=audit]')?.dataset.status==='completed');await roles('replanAgent');eq(calls,beforeCalls);
 await page.locator('#navRoute').click();await roles('agent');
 await page.locator('#navEdit').click();await page.locator('details.member').first().evaluate(n=>n.open=true);await page.locator('#member-0-preference').fill('希望看更多历史文物');await page.locator('#save').click();await page.locator('#closeEditor').click();
 await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('上次规划'));await roles('agent');eq(await page.locator('#agentAccept:not([disabled])').count(),0);eq((await page.locator('#flowStatus').innerText()).includes('需求已修改'),true);
 await page.locator('#agentNodes [data-role=screen]>summary').click();eq((await page.locator('.agentDrawer[open]').innerText()).includes('上次规划'),true);await page.keyboard.press('Escape');
 await page.locator('#navReplan').click();await page.waitForFunction(()=>document.querySelector('#replanAgentStatus').textContent.includes('上次规划'));await roles('replanAgent');eq(await page.locator('#replanAgentAccept:not([disabled])').count(),0);
 await page.locator('#navRoute').click();await page.reload();await page.locator('#primaryFlow:not([disabled])').waitFor();await page.waitForFunction(()=>document.querySelector('#agentNodes [data-role=audit]')?.dataset.status==='completed');await roles('agent');eq(await page.locator('#agentAccept:not([disabled])').count(),0);eq(calls,beforeCalls);
 await page.locator('#agentReview').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/verification/agent-history-visible-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('button[data-pane=agents]').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'docs/verification/agent-history-visible-390.png'});eq(errors.length,0);
 await writeFile('docs/verification/agent-history-visible-browser.json',JSON.stringify({at:new Date().toISOString(),source:'独立本地离线角色与道路替身；真实调用0',assertions:n,calls,errors,coverage:'生成后切协作页签同步/需求变化保留上次产物/失效不采用/历史详情/刷新保留四角色/切换零新生成/390可见'},null,2));
 console.log({before,assertions:n,errors});
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
