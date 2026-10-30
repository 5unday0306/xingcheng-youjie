import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [], external = [];
const groups = [];
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
const has = async (selector, text) => { assert.ok((await page.locator(selector).textContent()).includes(text)); assertions++; };
page.on('pageerror', e => pageErrors.push(e.message));
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin !== base) {
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
  await page.goto(base);
  await has('#routeView', '路线还未接入');
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
  await check(); await has('#summary','1人 · 1天'); await has('#tripOverview','1位同行者 / 1天');
  await edit(); await page.locator('#people').selectOption('6'); await page.locator('#dayCount').selectOption('3');
  for(let i=1;i<6;i++) { await openMember(i); await page.locator(`#member-${i}-preference`).fill(`同行偏好${i}`); }
  await check(); await has('#checkStatus','输入检查通过'); await has('#summary','6人 · 3天');
  await has('#summary','2026-11-09'); await has('#tripOverview','6位同行者 / 3天');
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
    await page.setViewportSize({width,height:width===1440?900:900}); await page.reload(); await edit();
    equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const box=await page.locator('#check').boundingBox();assert.ok(box && box.y>=0 && box.y+box.height<=page.viewportSize().height);assertions++;
    await check(); equal(await page.locator('#summaryView').isVisible(),true);
    equal(await page.evaluate(()=>document.activeElement.id),'summaryTitle');
    await edit(); await page.locator('#member-0-budget').focus();
    equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true);
    await openMember(5); await page.locator('#member-5-walk-2').focus();
    await page.locator('#member-5-walk-2').scrollIntoViewIfNeeded();
    const lastField=await page.locator('#member-5-walk-2').boundingBox();
    const actionArea=await page.locator('.editorActions').boundingBox();
    assert.ok(lastField && actionArea && lastField.y+lastField.height<=actionArea.y+1);assertions++;
  }
  groups.push('6/3 at 375/390/768/1024/1440, visible actions, mobile navigation, keyboard focus');

  await page.evaluate(()=>localStorage.clear()); await page.setViewportSize({width:1440,height:900}); await page.reload();
  await mkdir('docs/verification',{recursive:true});
  await page.screenshot({path:'docs/verification/task05-regression-after-1440.png',fullPage:true});
  await check(); await page.screenshot({path:'docs/verification/task05-regression-summary-1440.png',fullPage:true});
  await edit(); await page.locator('#check').focus(); await page.keyboard.press('Tab');
  equal(await page.evaluate(()=>document.activeElement.id),'save');
  equal(await page.locator('#save').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),true);
  await edit(); await page.locator('#restore').click();
  await page.screenshot({path:'docs/verification/task05-regression-restore-dialog.png',fullPage:true}); await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844}); await page.reload();
  await page.screenshot({path:'docs/verification/task05-regression-after-390.png',fullPage:true});
  await page.locator('#navRoute').click(); await page.screenshot({path:'docs/verification/task05-regression-route-390.png',fullPage:true});
  equal(await page.locator('#routeView').isVisible(),true); await has('#routeView','路线还未接入');
  for(const path of ['/.env','/AGENTS.md','/scripts/verify_api_access.py']) equal((await page.request.get(`${base}${path}`)).status(),404);
  assert.deepEqual(pageErrors,[]);assertions++;assert.deepEqual(external,[]);assertions++;
  // UI05 retained-specific content and live-data checks. No business network calls.
  await page.setViewportSize({width:1440,height:900}); await page.evaluate(()=>localStorage.clear()); await page.reload();
  await has('#destinationName','太原'); await has('#pilotTag','太原试点');
  await has('#tripDates','2026-11-07'); await has('#tripOverview','3位同行者');
  equal(await page.locator('#companionOverview > article').count(),3);
  await has('#companionOverview','历史展览'); await has('.cityArtwork figcaption','城市意象插画');
  const emptyBox=await page.locator('.routePending').boundingBox(); assert.ok(emptyBox.height>=160&&emptyBox.height<=220); assertions++;
  await page.locator('#startDate').fill('2026-12-21'); await has('#tripDates','2026-12-21'); await has('#tripDates','2026-12-22');
  await page.locator('#startDate').fill(''); await has('#tripDates','待填写');
  assert.ok(!(await page.locator('#tripDates').innerText()).includes('2026-12'));assertions++;
  await page.locator('#startDate').fill('2026-11-07');
  await page.locator('#companionOverview').getByRole('button',{name:'编辑同行者2的需求'}).click();
  equal(await page.evaluate(()=>document.activeElement.id),'member-1-preference');
  equal(await member(1).evaluate(n=>n.open),true);
  const original='必须去历史展览，不想去人多的地方。原话保留。';
  await page.locator('#member-1-preference').fill(original); await has('#companionOverview',original);
  await page.locator('#member-1-budget').fill('388'); await has('#companionOverview','388元');
  equal(await page.locator('#member-0-budget').inputValue(),'600');
  await member(1).locator(':scope > summary').click(); await openMember(1);
  equal(await page.locator('#member-1-preference').inputValue(),original);
  await page.locator('#quickCheck').click();
  await has('#summary',original); equal(await page.locator('.editor').isVisible(),false);
  equal(await page.evaluate(()=>document.activeElement.id),'summaryTitle');
  await edit(); equal(await page.locator('#member-1-budget').inputValue(),'388');
  await page.locator('#brand').click(); equal(await page.locator('#member-1-budget').inputValue(),'388');
  groups.push('UI05 retained dynamic city/date/people, original illustration, companion editing, raw words, full-width summary');

  // Browser 200% equivalent reflow: 1440x900 physical pixels / 2 = 720x450 CSS pixels.
  const zoomContext=await browser.newContext({viewport:{width:720,height:450},deviceScaleFactor:2,reducedMotion:'reduce'});
  await zoomContext.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}
    return route.continue();
  });
  const zoomPage=await zoomContext.newPage();
  zoomPage.on('pageerror',e=>pageErrors.push(e.message));
  await zoomPage.goto(base);
  equal(await zoomPage.evaluate(()=>innerWidth),720);
  equal(await zoomPage.evaluate(()=>devicePixelRatio),2);
  equal(await zoomPage.evaluate(()=>matchMedia('(max-width:1050px)').matches),true);
  equal(await zoomPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const last=zoomPage.locator('#members > details').nth(2);
  await last.locator(':scope > summary').click();
  await zoomPage.locator('#member-2-walk-1').focus();
  await zoomPage.locator('#member-2-walk-1').scrollIntoViewIfNeeded();
  const focused=await zoomPage.locator('#member-2-walk-1').boundingBox();assert.ok(focused&&focused.y>=0&&focused.y+focused.height<=450);assertions++;
  const zoomActions=await zoomPage.locator('.editorActions').boundingBox();
  assert.ok(zoomActions&&focused.y+focused.height<=zoomActions.y+1);assertions++;
  await zoomPage.locator('#check').scrollIntoViewIfNeeded();await zoomPage.locator('#check').click();
  equal(await zoomPage.locator('#summaryView').isVisible(),true);
  await zoomPage.screenshot({path:'docs/verification/task05-regression-zoom200-equivalent.png'});
  await zoomContext.close();
  groups.push('200% equivalent reflow 720x450 CSS / DPR2, media query and editing/navigation checked (not Ctrl+plus test)');

  const pairs=await page.evaluate(()=>{
    const pairs=[];
    for(const sel of ['.destinationText h2','.destinationText #tripDates','#check','.editorHeading h1','.hint','label','.companionQuote']){
      const el=document.querySelector(sel);const css=getComputedStyle(el);let n=el,bg;
      while(n){const c=getComputedStyle(n).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break;}n=n.parentElement;}
      pairs.push({selector:sel,foreground:css.color,background:bg||'rgb(244,247,245)',fontSize:css.fontSize});
    }
    return pairs;
  });
  function luminance(s){const a=s.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
  const contrasts=pairs.map(pair=>{const a=luminance(pair.foreground),b=luminance(pair.background);return {...pair,ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2))};});
  for(const c of contrasts){assert.ok(c.ratio>=4.5,JSON.stringify(c));assertions++;}
  groups.push('computed color contrast sampled on actual page, each >=4.5:1; not a full accessibility audit');
  const report={executedAt:new Date().toISOString(),browser:'Microsoft Edge, Playwright 1.62.1 headless',assertions,passed:true,viewports:[375,390,768,1024,1440],pageErrors,externalRequests:external.length,reducedMotion:true,zoom200:'Equivalent browser context 720x450 CSS, DPR2; native Ctrl+plus not tested',contrasts,groups};
  await writeFile('docs/verification/task05-regression-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
