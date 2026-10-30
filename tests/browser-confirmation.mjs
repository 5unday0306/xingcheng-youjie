import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';
import {createDynamicOffline} from '../lib/dynamic-offline.mjs';
const live=createDynamicOffline(JSON.parse(await readFile('docs/verification/task06-research.json','utf8')));
let starts=0,external=0,assertions=0,lastRequest;const errors=[];
const wrapped={...live,action:async(p,i)=>{if(/dynamic\/(start|retry)$/.test(p)){starts++;lastRequest=structuredClone(i.request);}return live.action(p,i);}};
const server=createServer({planning:live,live:wrapped});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
const eq=(a,b)=>{assert.equal(a,b);assertions++;};
await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external++;return r.abort();}return r.continue();});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/#summaryView');await page.locator('#primaryFlow:not([disabled])').waitFor();eq(await page.locator('#summaryView').isVisible(),false);eq(new URL(page.url()).hash,'#routeView');
 await page.locator('#navEdit').click();await page.locator('details.member').first().evaluate(n=>n.open=true);const input=page.locator('#member-0-preference');await input.fill('喜欢历史展览');await page.locator('#check').click();eq(await page.locator('#planningStart').innerText(),'运行离线演练');eq(starts,0);
 // Change the underlying input using a real input event while modal is open.
 await input.evaluate(n=>{n.value='喜欢美食街区';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#planningStart').click();eq(starts,0);eq(await page.locator('#editDialog').isVisible(),true);eq(await input.inputValue(),'喜欢美食街区');
 await page.locator('#check').click();await page.locator('#planningStart').evaluate(n=>{n.click();n.click();});await page.waitForFunction(()=>/生成待确认/.test(document.querySelector('#agentStatus')?.textContent||''));eq(starts,1);eq(lastRequest.members[0].preference,'喜欢美食街区');eq(await page.locator('#editDialog').isVisible(),false);eq(await page.locator('#routeView').isVisible(),true);
 await page.locator('[data-pane=activities]').click();await page.locator('#agentAccept:not([disabled])').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('已采用'));
 const request=lastRequest,adopted=(await live.action('/api/live/replan/state',{})).meta.adopted.id;
 await page.getByRole('button',{name:'固定这项安排',exact:true}).click();await page.getByRole('button',{name:'确认本餐时间锁定',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 await page.locator('#navEdit').click();await page.locator('details.member').first().evaluate(n=>n.open=true);await input.fill('保留美食偏好，想轻松一些');await page.locator('#check').click();eq((await page.locator('#planningConfirmation').innerText()).includes('12:30～13:30'),true);eq(starts,1);await page.locator('#planningBack').click();eq(await input.inputValue(),'保留美食偏好，想轻松一些');
 const meta=(await live.action('/api/live/replan/state',{})).meta;eq(meta.adopted.id,adopted);eq(meta.lock.start,'12:30');eq(meta.lock.end,'13:30');eq(await page.locator('#planResult [data-activity-id]').count(),0);eq(external,0);eq(errors.length,0);
 await writeFile('docs/verification/confirmation-offline-browser.json',JSON.stringify({at:new Date().toISOString(),source:'独立临时离线替身服务，不读正式存档',assertions,starts,realCalls:0,external,errors,checks:'旧摘要链接归工作区/离线文案/在框期间编辑阻止提交/最新偏好/双击一次/保留采用与午餐锁定/修改后不展示旧活动'},null,2));console.log({assertions,external,errors});
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
