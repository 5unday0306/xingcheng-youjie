import {createDynamicOffline} from '../lib/dynamic-offline.mjs';
import {createServer} from '../server.mjs';
import {defaultDraft,toRequest} from '../web/core.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const before=process.argv.includes('--before'),stem='adjust-preview-binding'+(before?'-before':'-after');
const live=createDynamicOffline(JSON.parse(await readFile('docs/verification/task06-research.json','utf8'))),request=toRequest(defaultDraft());
await live.action('/api/live/replan/configure',{request,start:'12:30',end:'13:30',confirmed:true,dayIndex:1});
await live.run(request);let state=(await live.action('/api/live/dynamic/state',{request})).state;
await live.action('/api/live/dynamic/decide',{request,id:state.id,accept:true});
const saved=JSON.stringify((await live.action('/api/live/replan/state',{request})).meta);
await live.run(request);state=(await live.action('/api/live/dynamic/state',{request})).state;
const signature=r=>JSON.stringify(r.review.days.map(d=>d.timeline));
const alternative=state.comparisonCandidates.find(c=>signature(c.result)!==signature(state.original));
assert.ok(alternative,'fixture must contain a genuinely different preview');
state=(await live.action('/api/live/dynamic/select',{request,id:state.id,candidateId:alternative.id})).state;
let starts=0;const service={...live,action:(p,i)=>{if(/\/(start|retry|restore|decide)$/.test(p))starts++;return live.action(p,i);}};
const server=createServer({planning:live,live:service});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:960}}),page=await ctx.newPage();let n=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));const eq=(a,b)=>{assert.equal(a,b);n++;};
await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(before&&['/web/planning.js','/web/agent-review.js'].includes(u.pathname))return r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','HEAD:'+u.pathname.slice(1)],{encoding:'utf8'})});return r.continue();});
try{
 await page.goto(base+'/#routeView');await page.locator('#agentNodes [data-role=audit][data-status=completed]').waitFor();
 await page.locator('#agentCompare [data-scheme=original]').click();await page.waitForFunction(()=>document.querySelector('#planResultTitle')?.textContent.includes('原方案'));
 const original=await page.locator('#planResult .planItems').innerText();
 await page.locator('#navReplan').click();await page.locator('#replanAgentNodes [data-role=audit][data-status=completed]').waitFor();
 if(!before){
 await page.waitForFunction(()=>document.querySelector('#planResultTitle')?.textContent.includes('预览'));
 eq(await page.locator('#replanAgentCompare [data-scheme=preview]').getAttribute('aria-pressed'),'true');
 eq(await page.locator('#replanAgentChooser').isVisible(),true);
 const preview=await page.locator('#planResult .planItems').innerText();eq(preview!==original,true);
 eq(await page.locator('#replanAgentChooser [aria-pressed=true]').getAttribute('data-quick-candidate'),alternative.id);
 await page.locator('#dayTabs button').nth(1).click();const day2=await page.locator('#planResult .planItems').innerText();eq(day2.includes('固定 12:30～13:30'),true);
 await page.locator('#navRoute').click();await page.waitForFunction(()=>document.querySelector('#agentCompare [data-scheme=preview]')?.getAttribute('aria-pressed')==='true');eq(await page.locator('#planResult .planItems').innerText(),day2);
 await page.locator('#agentCompare [data-scheme=original]').click();eq((await page.locator('#planResultTitle').innerText()).includes('原方案'),true);
 await page.locator('#navReplan').click();await page.waitForFunction(()=>document.querySelector('#planResultTitle')?.textContent.includes('预览'));eq(await page.locator('#planResult .planItems').innerText(),day2);
 await page.locator('#dayTabs button').first().click();eq(await page.locator('#planResult .planItems').innerText(),preview);
 eq(starts,0);eq(JSON.stringify((await live.action('/api/live/replan/state',{request})).meta),saved);
 }
 await page.locator('#activityDock').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/verification/'+stem+'-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('button[data-pane=activities]').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'docs/verification/'+stem+'-390.png'});
 if(!before){eq((await page.locator('#planResultTitle').innerText()).includes('预览'),true);
 await page.setViewportSize({width:1440,height:960});await page.locator('#replanAgentReject').click();await page.waitForFunction(()=>document.querySelector('#planResultTitle')?.textContent.includes('原方案'));
 const afterReject=starts;await page.locator('#navRoute').click();await page.locator('#navReplan').click();await page.waitForFunction(()=>document.querySelector('#replanAgentStatus')?.textContent.includes('保留原方案'));eq((await page.locator('#planResultTitle').innerText()).includes('原方案'),true);eq(starts,afterReject);eq(JSON.stringify((await live.action('/api/live/replan/state',{request})).meta),saved);eq(errors.length,0);}
 await writeFile('docs/verification/'+stem+'.json',JSON.stringify({at:new Date().toISOString(),source:'独立离线角色/道路替身，无真实接口或正式存档写入',assertions:n,starts,errors,resultTitle:await page.locator('#planResultTitle').innerText(),coverage:'原方案切调整显示所选预览/候选一致/切日返回/显式查看原方案/固定时间/零生成采用/采用元数据不变/390'},null,2));console.log({before,assertions:n,starts,errors});
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
