import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [], external = [];
const groups = [];
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
const has = async (selector, text) => { assert.ok((await page.locator(selector).textContent()).includes(text)); assertions++; };
page.on('pageerror', e => pageErrors.push(e.message));
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') {
    external.push(route.request().url()); return route.abort();
  }
  return route.continue();
});
const member = i => page.locator('#members > details').nth(i);
async function openMember(i) {
  const card = member(i);
  if (!await card.evaluate(n => n.open)) await card.locator(':scope > summary').click();
}
async function edit() {
  if (await page.locator('#navEdit').isVisible()) await page.locator('#navEdit').click();
  else if (await page.locator('#backEdit').isVisible()) await page.locator('#backEdit').click();
}
async function check() { await page.locator('#check').click(); }
async function confirmText(title, button) {
  await has('#confirmTitle', title);
  equal(await page.locator('#acceptChange').innerText(), button);
}
const key = 'xingchengyoujie.requirements.v1';
try {
  await page.goto('http://127.0.0.1:4173');
  await has('#routeView', '未加载地图');
  equal(await page.locator('#routeView').isVisible(), true);
  equal(await page.locator('#dayTabs button').count(), 2);
  await page.locator('#dayTabs button').nth(1).click();
  await has('#activeDay', '2026-11-08');
  await has('#activeDayTitle', '第2天');
  await check();
  await has('#checkStatus', '输入检查通过');
  equal(await page.evaluate(() => document.activeElement.id), 'summaryTitle');
  for (const text of ['历史展览','风景拍照','美食，少走路','2026-11-08','600','6公里','公共测试点']) await has('#summary', text);
  equal(await page.locator('#summary .developerDetails').evaluate(n => n.open), false);
  groups.push('default, route empty state, date linkage and summary navigation');

  await edit(); await page.locator('#save').click(); await has('#storageStatus', '已保存');
  await page.locator('#member-0-budget').fill('450'); await has('#storageStatus', '有未保存修改');
  await page.reload(); await openMember(0);
  equal(await page.locator('#member-0-budget').inputValue(), '600');
  await has('#storageStatus', '已恢复'); await has('#checkStatus','重新检查');
  await page.locator('#member-0-budget').fill('450');
  await page.locator('#save').click(); await page.reload(); await openMember(0);
  equal(await page.locator('#member-0-budget').inputValue(), '450');
  await page.locator('#member-0-budget').fill('451');
  await page.locator('#member-0-budget').fill('450');
  await has('#storageStatus', '与上次保存一致');
  await openMember(1); equal(await page.locator('#member-1-budget').inputValue(),'600');
  await has('#members','风景拍照');
  groups.push('save600-edit450-refresh600, save450-refresh450, independent state');

  await page.locator('#member-0-budget').fill('333');
  await page.locator('#restore').click(); await confirmText('恢复上次保存的需求','确认恢复');
  await page.locator('#cancelChange').click();
  equal(await page.locator('#member-0-budget').inputValue(),'333');
  await page.locator('#restore').click(); await page.keyboard.press('Escape');
  equal(await page.locator('#member-0-budget').inputValue(),'333');
  await page.locator('#restore').click(); await page.locator('#acceptChange').click();
  equal(await page.locator('#member-0-budget').inputValue(),'450');
  await has('#checkStatus','重新检查');
  groups.push('restore dialog visible wording, cancel, Escape, actual restore');

  await openMember(1);
  await page.locator('#member-0-budget').fill(''); await page.locator('#member-1-budget').fill('');
  await check();
  equal(await page.evaluate(() => document.activeElement.id),'member-0-budget');
  equal(await page.locator('#member-0-budget').getAttribute('aria-invalid'),'true');
  const description = await page.locator('#member-0-budget').getAttribute('aria-describedby');
  assert.ok(description); assertions++;
  await has(`#${description.split(' ')[0]}`,'不能为空');
  await page.locator('#member-0-budget').fill('450');
  equal(await page.locator('#member-0-budget').getAttribute('aria-invalid'),null);
  equal(await page.locator('#member-1-budget').getAttribute('aria-invalid'),'true');
  await has('#errors','同行者2');
  await page.locator('#errors a').first().click();
  equal(await page.evaluate(() => document.activeElement.id),'member-1-budget');
  equal(await member(1).evaluate(n => n.open),true);
  await page.locator('#member-1-budget').fill('600');
  await page.locator('#day-0-end').fill('08:00'); await check();
  await has('#errors','每日结束时间');
  equal(await page.locator('#day-0-end').getAttribute('aria-invalid'),'true');
  await page.locator('#day-0-end').fill('18:00');
  groups.push('persistent field errors, aria association, error links, first-error focus');

  await openMember(0);
  await page.locator('#member-0-walk-1').fill('4');
  await page.locator('#member-1-walk-1').fill('5');
  equal(await member(0).getByRole('button',{name:'将本人第1天步行上限应用到其余天'}).count(),0);
  equal(await page.locator('#member-0-walk-1').inputValue(),'4');
  equal(await page.locator('#member-1-walk-1').inputValue(),'5');
  groups.push('independent walking values; no copy button');

  await page.locator('#people').selectOption('1'); await confirmText('减少同行人数','确认减少');
  await page.keyboard.press('Escape'); equal(await page.locator('#people').inputValue(),'3');
  await page.locator('#people').selectOption('1'); await page.locator('#acceptChange').click();
  await page.locator('#dayCount').selectOption('1'); await confirmText('减少游玩天数','确认减少');
  await page.locator('#cancelChange').click(); equal(await page.locator('#dayCount').inputValue(),'2');
  await page.locator('#dayCount').selectOption('1'); await page.locator('#acceptChange').click();
  await check(); await has('#summary','1人 · 1天');
  await edit(); await page.locator('#people').selectOption('6'); await page.locator('#dayCount').selectOption('3');
  for(let i=1;i<6;i++) { await openMember(i); await page.locator(`#member-${i}-preference`).fill(`同行偏好${i}`); }
  await check(); await has('#checkStatus','输入检查通过'); await has('#summary','6人 · 3天');
  await has('#summary','2026-11-09');
  groups.push('reduction wording and cancellation, 1/1 and 6/3 boundaries');

  // A v1 archive created by the original core format remains readable.
  await edit(); await page.locator('#save').click();
  equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).version,key),1);
  await page.evaluate(k=>localStorage.setItem(k,'BROKEN'),key);
  await page.locator('#restore').click(); await page.locator('#acceptChange').click();
  await has('#storageStatus','恢复失败');
  await page.locator('#save').click(); await has('#storageStatus','保存失败');
  equal(await page.evaluate(k=>localStorage.getItem(k),key),'BROKEN');
  await page.locator('#replace').click(); await confirmText('覆盖无法恢复的旧存档','确认覆盖');
  await page.locator('#cancelChange').click(); equal(await page.evaluate(k=>localStorage.getItem(k),key),'BROKEN');
  await page.locator('#replace').click(); await page.keyboard.press('Escape');
  equal(await page.evaluate(k=>localStorage.getItem(k),key),'BROKEN');
  await page.locator('#replace').click(); await page.locator('#acceptChange').click();
  await has('#storageStatus','已保存'); await page.reload();
  equal(await page.locator('#people').inputValue(),'6');
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({version:99})),key); await page.reload();
  await has('#storageStatus','版本不兼容');
  equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).version,key),99);
  groups.push('v1 compatibility, invalid-archive save protection, overwrite wording/cancel/Escape, unknown version');

  // Six-member editing actions remain in the viewport at each requested size.
  await page.evaluate(async k=>{
    const {defaultDraft,toRequest}=await import('/core.js');
    const d=defaultDraft();d.people=6;d.dayCount=3;d.days.push({start:'09:00',end:'18:00'});
    d.members.forEach(m=>m.walking.push('6'));
    while(d.members.length<6)d.members.push({id:`test-${d.members.length}`,name:`同行者${d.members.length+1}`,preference:'历史',budget:'600',walking:['6','6','6']});
    localStorage.setItem(k,JSON.stringify({version:1,request:toRequest(d)}));
  },key);
  for(const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:width===1440?1000:900}); await page.reload(); await edit();
    equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const box=await page.locator('#check').boundingBox();assert.ok(box && box.y>=0 && box.y+box.height<=page.viewportSize().height);assertions++;
    await check(); equal(await page.locator('#summaryView').isVisible(),true);
    equal(await page.evaluate(()=>document.activeElement.id),'summaryTitle');
    await edit(); await page.locator('#member-0-budget').focus();
    equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true);
  }
  groups.push('6/3 at 375/390/768/1024/1440, visible actions, mobile navigation, keyboard focus');

  await page.evaluate(()=>localStorage.clear()); await page.setViewportSize({width:1440,height:1000}); await page.reload();
  await mkdir('docs/verification',{recursive:true});
  await page.screenshot({path:'docs/verification/task03-after-1440.png',fullPage:true});
  await check(); await page.screenshot({path:'docs/verification/task03-summary-1440.png',fullPage:true});
  await edit(); await page.locator('#check').focus(); await page.keyboard.press('Tab');
  equal(await page.evaluate(()=>document.activeElement.id),'save');
  equal(await page.locator('#save').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),true);
  await edit(); await page.locator('#restore').click();
  await page.screenshot({path:'docs/verification/task03-restore-dialog.png',fullPage:true}); await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844}); await page.reload();
  await page.screenshot({path:'docs/verification/task03-after-390.png',fullPage:true});
  await page.locator('#navRoute').click(); await page.screenshot({path:'docs/verification/task03-route-390.png',fullPage:true});
  equal(await page.locator('#routeView').isVisible(),true); await has('#routeView','无路线数据');
  for(const path of ['/.env','/AGENTS.md','/scripts/verify_api_access.py']) equal((await page.request.get(`http://127.0.0.1:4173${path}`)).status(),404);
  assert.deepEqual(pageErrors,[]);assertions++;assert.deepEqual(external,[]);assertions++;
  const report={executedAt:new Date().toISOString(),browser:'Microsoft Edge, Playwright 1.62.1 headless',assertions,passed:true,viewports:[375,390,768,1024,1440],pageErrors,externalRequests:external.length,reducedMotion:true,groups};
  await writeFile('docs/verification/task03-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
} finally { await browser.close(); }
