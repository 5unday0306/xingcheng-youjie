import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from '../server.mjs';
import {createDynamicOffline} from '../lib/dynamic-offline.mjs';
const live=createDynamicOffline(JSON.parse(await readFile('docs/verification/task06-research.json','utf8')));
let starts=0,external=0,n=0;const errors=[];
const wrapped={...live,action:async(p,i)=>{if(/dynamic\/(start|retry)$/.test(p))starts++;return live.action(p,i);}};
const server=createServer({planning:live,live:wrapped});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({channel:'msedge',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage();
const ok=(v,msg)=>{assert.ok(v,msg);n++;};
await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){external++;return r.abort();}return r.continue();});page.on('pageerror',e=>errors.push(e.message));
async function settled(){await page.waitForFunction(()=>/生成待确认|失败|已取消/.test(document.querySelector('#agentStatus')?.textContent||''),null,{timeout:30000});}
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#primaryFlow:not([disabled])').waitFor();ok(starts===0,'不自动调用');ok(await page.locator('#planningScope').isVisible(),'边界显式可见');await page.locator('#primaryFlow').click();await settled();ok((await page.locator('#agentStatus').textContent()).includes('离线替身'),'不冒充真实');ok(await page.locator('#dayTabs button').count()===2,'两日');
 for(const role of ['coordinate','screen','plan','audit']){await page.locator('#agentNodes [data-role='+role+']>summary').click();const text=await page.locator('.agentDrawer[open]').textContent();ok(!/技术数据与原始结构|运行编号|"version"/.test(text),'普通角色详情无技术结构');await page.keyboard.press('Escape');}
 await page.locator('#agentAccept:not([disabled])').click();await page.waitForFunction(()=>document.querySelector('#agentStatus').textContent.includes('已采用'));
 await page.locator('#dayTabs button').nth(1).click();await page.getByRole('button',{name:'锁定时间',exact:true}).click();await page.getByRole('button',{name:'确认本餐时间锁定',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 ok((await live.action('/api/live/replan/state',{})).meta.lock.start==='12:30','卡片锁定成功');
 await page.locator('#navEdit').click();await page.locator('#dayCount').selectOption('3');await page.locator('#closeEditor').click();const before=starts;await page.locator('#primaryFlow').click();ok(starts===before,'3日提交前阻止');ok((await page.locator('body').textContent()).includes('动态规划目前支持1～2天'),'范围错误明确');
 await page.locator('#dayCount').selectOption('2');await page.getByRole('button',{name:'确认减少',exact:true}).click();await page.locator('#people').selectOption('1');await page.getByRole('button',{name:'确认减少',exact:true}).click();await page.locator('#closeEditor').click();await page.locator('#primaryFlow').click();await settled();ok((await page.locator('#agentStatus').textContent()).includes('生成待确认'),'人数改变后重新生成');
 await page.locator('#dayTabs button').first().click();const count=starts;await page.locator('#dayTabs button').nth(1).click();ok(starts===count,'切日不调用');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/verification/dynamic-input-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('[data-pane=activities]').first().click();ok(await page.locator('#planResult').isVisible(),'窄屏活动可达');ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390无横溢出');await page.screenshot({path:'docs/verification/dynamic-input-390.png'});await page.locator('[data-pane=agents]').first().click();ok(await page.locator('#agentNodes').isVisible(),'窄屏协作可达');await page.reload();await page.locator('#primaryFlow:not([disabled])').waitFor();ok(starts===count,'刷新不调用');ok(external===0,'没有外网请求');ok(errors.length===0,errors.join(';'));
 await writeFile('docs/verification/dynamic-input-browser.json',JSON.stringify({at:new Date().toISOString(),assertions:n,starts,external,errors,realBusinessCalls:0,source:'真实页面运行；角色和道路为明确标注的离线替身'},null,2));console.log({assertions:n,starts,external,errors});
}catch(e){await writeFile('docs/verification/dynamic-input-browser-failure.json',JSON.stringify({message:e.message,errors,body:await page.locator('body').innerText()},null,2));throw e;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
