import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPreviewServer} from '../preview/planning-desk/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,url=base+'/preview/planning-desk/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
const external=[],api=[],errors=[];let assertions=0;
const eq=(actual,expected)=>{assert.equal(actual,expected);assertions++;};
const ok=(condition,message)=>{assert.ok(condition,message);assertions++;};
const has=async(selector,text)=>ok((await page.locator(selector).innerText()).includes(text),`${selector}: ${text}`);
await context.addInitScript(()=>{
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,key='xingchengyoujie.requirements.v1';
  set.call(localStorage,key,'formal-canary');window.__storageTouches=[];window.__peekCanary=()=>get.call(localStorage,key);
  for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){window.__storageTouches.push(method);throw Error('Preview must not use storage');};
});
await context.route('**/*',route=>{
  const requestUrl=new URL(route.request().url());
  if(requestUrl.origin!==base){external.push(requestUrl.origin);return route.abort();}
  if(requestUrl.pathname.startsWith('/api/')||requestUrl.pathname.startsWith('/_AMapService')){api.push(requestUrl.pathname);return route.abort();}
  return route.continue();
});
page.on('pageerror',e=>errors.push(e.message));
async function panel(name){if(await page.locator('.mobile-panels').isVisible())await page.locator(`#panel-${name}`).click();}
try {
  await page.goto(url);await has('.design-label','设计预览');await has('#preview-notice','不保存');
  await page.screenshot({path:'docs/verification/ui-desk-preview-edit-1440.png'});
  eq(await page.locator('#preparation-view').isVisible(),true);eq(await page.locator('#sample-view').isVisible(),false);eq(await page.locator('.activity:visible').count(),0);
  await page.locator('#mode-sample').click();await has('#plan-subtitle','非真实模型或地图结果');await has('#activities','山西博物院');await has('#activities','待选用餐区段');await has('#checks-content','总量未知');
  await page.screenshot({path:'docs/verification/ui-desk-preview-sample-1440.png'});
  await page.locator('#day-1').click();await has('#activities','钟楼街');await has('#checks-content','第2天步行上限');await has('#checks-content','全程预算上限');await has('#checks-content','90分钟');
  await page.locator('#mode-edit').click();await page.locator('.travel-conditions > summary').click();await page.locator('#departure-date').fill('');await has('#header-dates','待填写');
  await page.locator('#departure-date').fill('2026-11-14');await has('#header-dates','2026.11.14');
  const raw='我希望慢慢看历史展览，途中能够休息；不想被赶着走，也希望照顾其他同行者。'.repeat(7);
  await page.locator('#preference-0').fill(raw);await has('#preparation-view',raw);await page.locator('#budget-0').fill('450');
  eq(await page.locator('#budget-1').inputValue(),'600');await page.locator('#member-0 > summary').click();await page.locator('#member-0 > summary').click();eq(await page.locator('#preference-0').inputValue(),raw);
  await page.locator('#mode-sample').click();await has('#header-dates','2026.11.07');await has('#sample-needs','固定');await has('#sample-needs','600元');
  await page.locator('#mode-edit').click();eq(await page.locator('#budget-0').inputValue(),'450');eq(await page.locator('#preference-0').inputValue(),raw);
  for(const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:width===390?844:900});await page.locator('#mode-edit').click();await panel('needs');
    eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(!await page.locator('#member-2').evaluate(n=>n.open))await page.locator('#member-2 > summary').click();await page.locator('#walking-2-1').focus();await page.locator('#walking-2-1').scrollIntoViewIfNeeded();
    const field=await page.locator('#walking-2-1').boundingBox(),actions=await page.locator('.needs-actions').boundingBox();ok(field&&actions&&field.y+field.height<=actions.y+1,JSON.stringify({width,field,actions}));
    await page.locator('#preview-action').click();await panel('plan');eq(await page.locator('#sample-view').isVisible(),true);eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await panel('checks');eq(await page.locator('#checks-title').isVisible(),true);await has('#checks-content','资料不足');await page.locator('#mode-edit').click();
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#reset-preview').click();
  const firstMember=await page.locator('#member-0 > summary').boundingBox(),needsViewport=await page.locator('#needs-scroll').boundingBox(),resetActions=await page.locator('.needs-actions').boundingBox();ok(firstMember.y>=needsViewport.y&&firstMember.y+firstMember.height<=resetActions.y,'Reset returns to the visible first member');
  await page.screenshot({path:'docs/verification/ui-desk-preview-edit-390.png'});
  await page.locator('#mode-sample').click();await panel('plan');await page.locator('#day-0').click();await page.screenshot({path:'docs/verification/ui-desk-preview-sample-390.png'});
  await panel('checks');await page.screenshot({path:'docs/verification/ui-desk-preview-checks-390.png'});
  await page.setViewportSize({width:720,height:450});await page.locator('#mode-edit').click();await panel('needs');
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#preview-action').scrollIntoViewIfNeeded();await page.locator('#preview-action').click();await panel('checks');eq(await page.locator('#checks-title').isVisible(),true);
  await page.setViewportSize({width:1440,height:900});await page.locator('#mode-edit').click();await page.locator('#mode-edit').focus();await page.keyboard.press('Tab');
  eq(await page.evaluate(()=>document.activeElement.id),'mode-sample');eq(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true);
  const contrast=[];
  await page.locator('#mode-sample').click();
  for(const selector of ['.wordmark strong','.design-label','.pilot','.field-hint','.view-switch button[aria-pressed=true]','.review-signal p','.activity-caption','.sample-badge']) {
    const pair=await page.locator(selector).first().evaluate(n=>{const c=getComputedStyle(n);let p=n,bg='rgb(255,255,255)';while(p){const b=getComputedStyle(p).backgroundColor;if(b!=='rgba(0, 0, 0, 0)'&&b!=='transparent'){bg=b;break;}p=p.parentElement;}return {fg:c.color,bg};});
    const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const a=lum(pair.fg),b=lum(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);ok(ratio>=4.5,`${selector} contrast ${ratio}`);contrast.push({selector,ratio:Number(ratio.toFixed(2))});
  }
  eq(await page.evaluate(()=>window.__peekCanary()),'formal-canary');eq(await page.evaluate(()=>window.__storageTouches.length),0);
  eq(await page.locator('script[src*="amap"]').count(),0);eq(await page.evaluate(()=>typeof window.AMap),'undefined');
  const csp=(await page.request.get(url)).headers()['content-security-policy'];ok(csp.includes("connect-src 'none'"));
  for(const path of ['/.env','/api/plan','/server.mjs','/preview/planning-desk/../../.env'])eq((await page.request.get(base+path)).status(),404);
  eq(errors.length,0);eq(external.length,0);eq(api.length,0);
  const baseline=JSON.parse(await readFile('docs/verification/ui-desk-preview-baseline.json','utf8'));
  for(const [path,sha] of Object.entries(baseline.files))eq(createHash('sha256').update(await readFile(path)).digest('hex'),sha);
  const report={executedAt:new Date().toISOString(),passed:true,assertions,browser:'Edge headless / Playwright 1.62.1',viewports:[375,390,768,1024,1440],externalRequests:external.length,businessRequests:api.length,pageErrors:errors,storageAccesses:0,unchangedBaselineFiles:Object.keys(baseline.files).length,contrast,zoom:'720x450 CSS equivalent reflow only; no native 200% zoom or real-phone test',scope:'Independent visual preview only; formal application not integrated or functionally re-tested'};
  await writeFile('docs/verification/ui-desk-preview-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
} finally {await browser.close();await new Promise(r=>server.close(r));}
