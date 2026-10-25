import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvasServer} from '../preview/travel-canvas/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createCanvasServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,url=base+'/preview/travel-canvas/';
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
let assertions=0;const external=[],api=[],errors=[];
const eq=(a,b)=>{assert.equal(a,b);assertions++;};const ok=(x,message)=>{assert.ok(x,message);assertions++;};const has=async(s,t)=>ok((await page.locator(s).innerText()).includes(t),s+': '+t);
await context.addInitScript(()=>{const g=Storage.prototype.getItem,s=Storage.prototype.setItem;s.call(localStorage,'xingchengyoujie.requirements.v1','FORMAL_CANARY');window.__storage=[];window.__peek=()=>g.call(localStorage,'xingchengyoujie.requirements.v1');for(const key of ['getItem','setItem','removeItem','clear'])Storage.prototype[key]=function(){window.__storage.push(key);throw Error('No storage in preview');};});
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base){external.push(u.origin);return route.abort();}if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/_AMapService')){api.push(u.pathname);return route.abort();}return route.continue();});page.on('pageerror',e=>errors.push(e.message));
const shot=async(name)=>{await page.screenshot({path:`docs/verification/ui-canvas-${name}.png`});};
try{
  await page.goto(url);await has('.top-labels','设计预览');eq(await page.locator('.activity').count(),0);await shot('overview-1440');
  await page.locator('#edit-person-0').click();await has('#editor-title','同行者1');eq(await page.evaluate(()=>document.activeElement.id),'edit-preference');await shot('editor-1440');
  const raw='想慢慢看历史展览，也希望途中能够坐下来休息。请保留我的原话，不要替别人修改预算。'.repeat(8);
  await page.locator('#edit-preference').fill(raw);await page.locator('#edit-preference').evaluate(n=>window.__inputNode=n);await page.locator('#edit-preference').pressSequentially('我还想拍照',{delay:15});
  eq(await page.locator('#edit-preference').evaluate(n=>n===window.__inputNode),true);eq(await page.evaluate(()=>document.activeElement.id),'edit-preference');
  await page.locator('#edit-budget').fill('');await page.locator('#editor-form button[type=submit]').click();eq(await page.locator('#editor').evaluate(n=>n.open),true);eq(await page.evaluate(()=>document.activeElement.id),'edit-budget');await has('#editor-errors','需要调整');
  await page.locator('#edit-budget').fill('450');await page.locator('#editor-form button[type=submit]').click();eq(await page.locator('#editor').evaluate(n=>n.open),false);eq(await page.evaluate(()=>document.activeElement.id),'edit-person-0');await has('#person-0','450元');await has('#person-1','600元');
  await page.locator('#check-preview').click();await has('#view-content','输入检查通过');await has('#view-content',raw);await has('#view-content','行程尚未生成');await shot('summary-longtext-1440');
  await page.locator('#save-preview').click();await has('#toast','本次预览');await has('#memory-state','已暂存');
  await page.locator('#toast').waitFor({state:'hidden'});
  await page.locator('#view-offline').click();await has('#view-content','固定离线样例');await has('#view-content','道路与接驳：未查询');await has('#person-0','600元');
  await page.locator('#sample-day-1').click();await has('#view-content','钟楼街');await has('#view-content','第2天步行');await page.locator('#sample-day-0').click();await page.locator('.work-area').scrollIntoViewIfNeeded();await shot('offline-1440');
  await page.locator('#view-overview').click();await has('#person-0','450元');await page.locator('#edit-trip').click();await page.locator('#edit-date').fill('');await has('#scene-dates','待填写');await page.locator('#edit-date').fill('2026-11-14');await page.keyboard.press('Escape');eq(await page.locator('#editor').evaluate(n=>n.open),false);await has('#scene-dates','2026.11.14');
  for(const width of [375,390,768,1024,1440]){
    await page.setViewportSize({width,height:width===390?844:900});await page.reload();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#edit-person-2').click();await page.locator('#edit-walk-1').focus();await page.locator('#edit-walk-1').scrollIntoViewIfNeeded();const field=await page.locator('#edit-walk-1').boundingBox(),footer=await page.locator('.editor-actions').boundingBox();ok(field&&footer&&field.y+field.height<=footer.y+1,'Editor field above footer');
    const close=await page.locator('#close-editor').boundingBox();ok(close&&close.y>=0&&close.y+close.height<=page.viewportSize().height,'Close reachable');
    await page.keyboard.press('Escape');eq(await page.evaluate(()=>document.activeElement.id),'edit-person-2');await page.locator('#check-preview').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await shot('summary-1440');
  await page.setViewportSize({width:390,height:844});await page.reload();eq(await page.evaluate(()=>scrollY),0);await shot('overview-390');await page.locator('#edit-person-0').click();await shot('editor-390');await page.locator('#edit-budget').fill('');await page.locator('#editor-form button[type=submit]').click();await shot('error-390');
  await page.locator('#edit-budget').fill('600');await page.locator('#editor-form button[type=submit]').click();await page.locator('#check-preview').click();await shot('summary-390');await page.locator('#view-offline').click();await page.locator('.work-area').scrollIntoViewIfNeeded();await shot('offline-390');
  eq(await page.evaluate(()=>document.getAnimations().length),0);eq(await page.evaluate(()=>window.__storage.length),0);eq(await page.evaluate(()=>window.__peek()),'FORMAL_CANARY');
  const pairs=[];for(const selector of ['.top-labels strong','.scene-copy h1','.scene-facts strong','.art-caption','.person-text>small','.offline-warning','.activity small','.primary']){
    const pair=await page.locator(selector).first().evaluate(n=>{const css=getComputedStyle(n);let p=n,bg='rgb(7,59,75)';while(p){const b=getComputedStyle(p).backgroundColor;if(b!=='rgba(0, 0, 0, 0)'&&b!=='transparent'){bg=b;break;}p=p.parentElement;}return {fg:css.color,bg};});
    const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const a=lum(pair.fg),b=lum(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);ok(ratio>=4.5,selector+' contrast '+ratio);pairs.push({selector,ratio:Number(ratio.toFixed(2))});
  }
  await page.setViewportSize({width:720,height:450});await page.reload();await page.locator('#edit-person-0').click();await page.locator('#edit-budget').focus();await page.keyboard.press('Tab');ok((await page.evaluate(()=>document.activeElement.closest('dialog')?.id))==='editor','Focus trapped');await page.keyboard.press('Escape');eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const motion=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});await motion.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await motion.addInitScript(()=>{window.__motionCalls=[];const native=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.__motionCalls.push(options);return native.call(this,frames,options);};});
  const dynamic=await motion.newPage();await dynamic.goto(url);ok(await dynamic.evaluate(()=>document.getAnimations().every(a=>a.effect.getTiming().iterations===1)),'Entrance animations finite');
  await dynamic.waitForTimeout(1400);eq(await dynamic.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  await dynamic.locator('#select-person-1').click();await dynamic.locator('#edit-person-1').click();await dynamic.locator('#editor-form button[type=submit]').click();await dynamic.locator('#editor').waitFor({state:'hidden'});await dynamic.locator('#check-preview').click();await dynamic.locator('#save-preview').click();
  ok(await dynamic.evaluate(()=>window.__motionCalls.length>=5),'Operation driven transitions executed');ok(await dynamic.evaluate(()=>window.__motionCalls.every(x=>x.duration<=300&&x.iterations!==Infinity)),'Short finite transitions');await motion.close();
  for(const path of ['/.env','/api/plan','/web/app.js','/preview/travel-canvas/../../.env'])eq((await page.request.get(base+path)).status(),404);
  const baseline=JSON.parse(await readFile('docs/verification/ui-canvas-baseline.json','utf8'));for(const [path,sha]of Object.entries(baseline.files))eq(createHash('sha256').update(await readFile(path)).digest('hex'),sha);
  eq(external.length,0);eq(api.length,0);eq(errors.length,0);
  const report={executedAt:new Date().toISOString(),assertions,passed:true,viewports:[375,390,768,1024,1440],externalRequests:0,businessRequests:0,storageAccesses:0,pageErrors:errors,unchangedFiles:Object.keys(baseline.files).length,contrast:pairs,motion:'Finite entrance, operation transitions tested; reduced-motion has no animations',zoom:'720x450 CSS equivalent reflow only; native 200% and real phone not tested'};await writeFile('docs/verification/ui-canvas-browser.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();await new Promise(r=>server.close(r));}
