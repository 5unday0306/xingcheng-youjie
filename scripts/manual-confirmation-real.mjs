// Manual real acceptance, run only after this batch's explicit authorization.
import {createRequire} from 'node:module';import {readFile,writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const out='docs/private/confirmation-real',base='http://127.0.0.1:4177';await mkdir(out,{recursive:true});
const approval=JSON.parse(await readFile('docs/private/05b-approval.json','utf8'));if(!approval.id.startsWith('CONFIRM-NEGOTIATION-')||Date.parse(approval.expiresAt)<=Date.now())throw Error('本轮授权未生效或到期');
const ledger=async()=>{const l=JSON.parse(await readFile('docs/private/05b-ledger.json','utf8'));return {counts:Object.fromEntries(['model','location','route','map'].map(k=>[k,l.entries.filter(e=>e.kind===k).length])),reservedCents:l.entries.reduce((n,e)=>n+e.reservedCents,0),stop:l.stopped||null,starts:l.dynamicStarts.filter(s=>s.authorizationId===approval.id).length};};
const beforeState=JSON.parse(await readFile(out+'/state-before.json','utf8')),request=beforeState.adopted.request;
const before=await ledger();assert.equal(before.counts.map,70);assert.equal(before.starts,0);
const post=async(path,body)=>{const r=await fetch(base+'/api/live/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw Error(b.message||b.code);return b;};
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({channel:'msedge',headless:false}),ctx=await browser.newContext({viewport:{width:1440,height:960}}),page=await ctx.newPage();let phase='open',state=null;const errors=[],checks={},network=[];page.on('pageerror',e=>errors.push(e.name));page.on('response',r=>{const u=new URL(r.url());if(!['127.0.0.1','127.0.0.2'].includes(u.hostname)){network.push({origin:u.origin,path:u.pathname,status:r.status(),type:r.request().resourceType()});if(network.length>80)network.shift();}});
try{
 await page.goto(base+'/#routeView');await page.locator('#primaryFlow:not([disabled])').waitFor({timeout:20000});
 phase='requirements';await page.locator('#navEdit').click();await page.locator('#adjustableGoals').setChecked(request.adjustableGoals===true);await page.locator('#startDate').fill(request.days[0].date);
 for(const [i,d]of request.days.entries()){await page.locator('#day-'+i+'-start').fill(d.start);await page.locator('#day-'+i+'-end').fill(d.end);}
 for(const [i,m]of request.members.entries()){await page.locator('details.member').nth(i).evaluate(n=>n.open=true);await page.locator('#member-'+i+'-name').fill(m.name);await page.locator('#member-'+i+'-preference').fill(m.preference);await page.locator('#member-'+i+'-budget').fill(String(m.budget));for(const [j,v]of m.walking.entries())await page.locator('#member-'+i+'-walk-'+j).fill(String(v));}
 phase='confirmation';const passive=await ledger();await page.locator('#check').click();await page.locator('#planningConfirmation').waitFor();checks.confirmationVisible=true;checks.lockShown=(await page.locator('#planningConfirmation').innerText()).includes('12:30～13:30');assert.ok(checks.lockShown);assert.deepEqual((await ledger()).counts,passive.counts);checks.confirmationNoCalls=true;await page.screenshot({path:out+'/confirmation.png'});
 phase='start';await page.locator('#planningStart').click();const started=Date.now();let initialized=false;
 for(;;){await page.waitForTimeout(1200);const l=await ledger();if(l.counts.model>before.counts.model){phase='roles';initialized=true;}const d=await post('dynamic/state',{request});state=d.state;
 if(l.stop){phase='stopped';break;}
 if(l.starts>0&&state&&state.createdAt&&Date.parse(state.createdAt)>=Date.parse(approval.expiresAt)-45*60000&&state.status!=='running')break;
 if(await page.locator('#flowStatus').getAttribute('data-error')==='true'){phase='flow-error';break;}
 if(Date.now()-started>12*60000){phase='timeout';break;}
 }
 checks.visibleBasemap=await page.locator('#mapEmptyState').isHidden();if(checks.visibleBasemap){await page.locator('#mapDock').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/map.png'});}
 if(state?.status==='preview'){
 phase='candidate-checks';assert.ok(state.nodes.every(n=>n.status==='completed'));checks.fourRolesComplete=state.nodes.length>=4;
 const candidates=state.comparisonCandidates||[];checks.candidateCount=candidates.length;const passive=await ledger();
 for(const c of candidates.slice(0,2)){await page.locator('#agentCompare [data-select-candidate="'+c.id+'"]').click();await page.waitForFunction(id=>document.querySelector('#agentCompare [data-select-candidate="'+id+'"]')?.getAttribute('aria-pressed')==='true',c.id);const selected=(await post('dynamic/state',{request})).state;assert.equal(selected.selectedCandidateId,c.id);assert.equal(await page.locator('#planResult [data-activity-id]').count(),selected.preview.review.days[0].activities.length);await page.locator('#mapDock').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/candidate-'+(candidates.indexOf(c)+1)+'.png'});}
 checks.candidateVersionSync=true;
 await page.locator('#dayTabs button').nth(1).click();await page.locator('#planResult [data-activity-id]').first().click();checks.activityToMap=await page.locator('[data-pane=map]').first().getAttribute('aria-pressed')==='true';
 const frame=page.frameLocator('#pickMap iframe');const marker=frame.getByRole('button',{name:/博物院东门外公共集合/}).first();if(await marker.count()){await marker.click();checks.mapToActivity=await page.evaluate(()=>!!document.activeElement?.dataset.activityRowId);}else checks.mapToActivity=false;
 for(const role of ['coordinate','screen','plan','audit']){await page.locator('#agentNodes [data-role='+role+']>summary').click();await page.screenshot({path:out+'/'+role+'.png'});checks[role+'Product']=!/JSON|哈希|person-\d|proposal-\d/.test(await page.locator('.agentDrawer[open]').innerText());await page.keyboard.press('Escape');}
 assert.deepEqual((await ledger()).counts,passive.counts);checks.passiveNoCalls=true;
 await page.setViewportSize({width:390,height:844});await page.locator('[data-pane=activities]').first().click();await page.screenshot({path:out+'/390.png'});checks.narrowNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await page.setViewportSize({width:1440,height:960});await page.locator('[data-pane=map]').first().click();
 }
 phase=phase==='candidate-checks'?'complete':phase;
}catch(e){checks.error=e.message;checks.errorPhase=phase;console.log(JSON.stringify({phase,error:e.message}));}
const after=await ledger(),meta=(await post('replan/state',{})).meta;checks.adoptedPreserved=meta.adopted.id===beforeState.adopted.id;checks.lockPreserved=JSON.stringify(meta.lock)===JSON.stringify(beforeState.lock);await writeFile(out+'/state-after.json',JSON.stringify(meta,null,2));
const summary={at:new Date().toISOString(),phase,before,after,checks,status:state?.status,reason:state?.reason,blockedRole:state?.blockedRole,errorCode:state?.errorCode,nodes:state?.nodes?.map(n=>({role:n.role,status:n.status,upstreamRefs:n.upstreamRefs,responseMeta:n.responseMeta,error:n.error})),errors,network};await writeFile(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({done:true,phase,status:state?.status,checks,before,after}));
// Keep the actual tested page available; never click accept or rerun.
await new Promise(resolve=>browser.on('disconnected',resolve));
