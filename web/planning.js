import {createWorkspace,sameRequest} from './workspace-shell.js';
import {createReplanPanel08} from './replan08.js';
import {createAgentPanel} from './agent-review.js';
import {rangeText} from './range-text.js';
import {createPickPanel} from './pick-panel.js';
import {createLivePanel} from './live-panel.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const labels={conflict:'冲突',insufficient:'资料不足',uncertain:'不确定',within_estimate:'按当前估计未超'};
function metric(title,result,unit,scale=1) {
  const format=value=>`${rangeText(value,{scale,digits:scale===100||scale===1000?2:0})}${unit}`;
  const box=el('div',undefined,'planMetric');
  box.append(el('strong',`${title}：${labels[result.status]}`),el('p',result.value?`估计合计 ${format(result.value)}`:`总量未知；已计入的预测/估计 ${format(result.knownSubtotal)}，不能当作总量`),el('p',`上限 ${(result.limit/scale).toFixed(scale===100?2:scale===1000?2:0)}${unit}`));
  if(result.knownSubtotal[1]>result.limit){box.append(el('p',result.knownSubtotal[0]>result.limit?'按当前预测/估计下限已超出上限，不能通过此项核查。':'当前估计上界可能超出上限；请核实缺口或调整游览/接驳后重新核查，未自动放宽条件。','warning'));}
  if(result.missing.length){const d=el('details');d.append(el('summary',`查看${result.missing.length}项缺口`));const list=el('ul');result.missing.forEach(s=>list.append(el('li',s)));d.append(list);box.append(d);}
  box.dataset.status=result.status;return box;
}
export function createPlanPanel({getRequest,validate,applyRequest}) {
  let result=null,selectedDay=0,busy=false,revision=0,capabilities=null,livePanel=null,runController=null,agentPanel=null,replanPanel=null;
  let flowBusy=false,metaData=null;const agentStates={review:null,replan:null},agentBusy=new Set();
  const workspace=createWorkspace({getRequest,onAction:runPrimary,onMode:value=>{const panel=value==='replan'?replanPanel?.agents:agentPanel;if(panel?.state()?.original)panel.show(panel.state().status==='accepted'?'preview':'original');else if(result){result=null;paint();}updateExperience();}});
  function agentUpdate(source,value){agentStates[source]=value;updateExperience();}
  function setAgentBusy(source,value){if(value)agentBusy.add(source);else agentBusy.delete(source);busy=agentBusy.size>0;button.disabled=busy||!capabilities?.canGenerate;updateExperience();}
  function stale(r){return r?.review.days.flatMap(d=>d.legs).some(l=>l.source==='高德Web服务响应'&&(!Number.isFinite(Date.parse(l.queriedAt))||Date.now()-Date.parse(l.queriedAt)>1800000));}
  function acceptable(r){return r?.readiness?r.readiness.canAccept:!!r&&!r.review.days.some(d=>d.time.knownSubtotal[1]>d.time.limit||d.members.some(m=>m.walking.knownSubtotal[1]>m.walking.limit))&&!r.review.members.some(m=>m.budget.knownSubtotal[1]>m.budget.limit);}
  function updateExperience(){
    workspace.version(metaData?.meta,result);workspace.mapReady(livePanel?.mapReady?.());
    const saved=metaData?.meta,selected=agentStates[workspace.mode],replan=workspace.mode==='replan';
    const mismatch=replan&&saved?.lock&&!sameRequest(getRequest(),saved.request);
    workspace.action.disabled=flowBusy||agentBusy.size>0||!capabilities;
    workspace.action.textContent=flowBusy?'正在按顺序准备…':agentBusy.size?'协作执行中…':mismatch?'载入已保存的重排条件':selected?.status==='preview'&&selected.preview&&!stale(selected.preview)?acceptable(selected.preview)?'采用修订':'预览未达标 · 查看原因':replan?saved?.lock?'按新条件重排':'设置午餐锁定':capabilities?.mode==='offline-test'?'运行离线测试':'生成行程';
    if(!flowBusy)workspace.status.textContent=mismatch?`编辑需求：${getRequest().members[0].walking.at(-1)}公里；已保存重排：${saved.request.members[0].walking.at(-1)}公里。载入只更新输入，不调用接口。`:selected?.preview?`${selected.replay?'历史回放 · ':''}${stale(selected.preview)?'道路已过期，需显式重新核查':acceptable(selected.preview)?'已计入估计未超，未知仍需核实':'预览仍有步行超限或资料风险，暂不能采用'}。`:result?'当前显示'+result.label+'；未知与冲突见核查。':'地图与协作尚未执行。主操作会顺序准备；刷新、切日不联网。';
  }
  function locateChange(preview,c){result={...preview,label:'修订预览 · 影响路段'};const i=preview.review.days.findIndex(d=>d.legs.some(l=>l.id===c.routeId||`${l.fromPointId}>${l.toPointId}`===c.routeId));selectedDay=Math.max(0,i);paint();$('dayTabs').children[selectedDay]?.click();const activity=preview.review.days[selectedDay].activities.find(a=>a.pointId===c.to||a.name===c.to)||preview.review.days[selectedDay].activities.find(a=>a.pointId===c.from||a.name===c.from);workspace.setPane('map');if(activity&&!livePanel?.focusActivity(activity.id))workspace.status.textContent='该路段尚无可定位几何，请显式加载地图；不会自动请求。';}
  async function runPrimary(){
    if(flowBusy||agentBusy.size)return;if(!validate())return;
    const replan=workspace.mode==='replan',selected=agentStates[workspace.mode],saved=metaData?.meta;
    if(replan&&saved?.lock&&!sameRequest(getRequest(),saved.request)){await replanPanel.restoreInputs();await replanPanel.refresh();updateExperience();return;}
    if(selected?.status==='preview'&&selected.preview&&!stale(selected.preview)){
      if(acceptable(selected.preview)){await (replan?replanPanel.agents:agentPanel).accept();if(replan)await replanPanel.refresh();}
      else{workspace.setPane('agents');$(replan?'replanAgentCompare':'agentCompare')?.scrollIntoView({block:'start'});}return;
    }
    workspace.status.dataset.error='';flowBusy=true;const started=revision;const current=()=>{if(revision!==started)throw Error('需求已修改，旧流程已停止；未启动后续调用');};updateExperience();
    try{
      if(capabilities.mode==='offline-test'){await button.onclick();return;}
      if(!capabilities.canPrepare)throw Error(capabilities.haltReason?'运行已停止，请展开运行记录查看原因':'缺少配置或授权，请按README本机配置后重启');
      workspace.status.textContent='正在准备真实地图…';await livePanel.prepareMap();current();workspace.mapReady(true);
      const missing=livePanel.missing?.()||[];if(missing.length){workspace.missing(missing);return;}
      if(replan){
        workspace.status.textContent='正在恢复已采用方案必要道路…';await replanPanel.restoreBaseline();current();
        if(!metaData?.meta.lock){workspace.lock.open=true;workspace.lock.scrollIntoView({block:'start'});workspace.status.textContent='请确认午餐时刻与新步行限制，再按新条件重排。';return;}
        await replanPanel.agents.reset();replanPanel.agents.baselineReady(true);current();await replanPanel.agents.run();
      }else{
        workspace.status.textContent='正在生成草案并核查当天道路…';await updateCase06Ready();current();const generated=await button.onclick();current();if(!generated||!result)throw Error('未取得当前方案，未启动后续协作');
        if(agentPanel){workspace.status.textContent='道路核查已完成，正在交给四角色协作…';await agentPanel.reset();agentPanel.baselineReady(true);await agentPanel.run();}
      }
    }catch(e){workspace.status.textContent='已停止：'+e.message+'；原采用方案保留。';workspace.status.dataset.error='true';}
    finally{flowBusy=false;workspace.action.disabled=agentBusy.size>0;if(!workspace.status.dataset.error&&!(livePanel?.missing?.().length))updateExperience();}
  }
  const state=$('generationStatus'),button=$('offlineRun');
  async function updateCase06Ready(){if(!capabilities?.case06)return;const started=revision;const r=await fetch('/api/capabilities');if(!r.ok)return;const c=await r.json();if(started!==revision)return;capabilities.canGenerate=c.canGenerate;button.disabled=busy||!c.canGenerate;button.textContent=c.canGenerate?'核查两天完整交通链':'先补齐位置与午餐';updateExperience();}
  async function setup() {
    try {
      const [a,b]=await Promise.all([fetch('/api/capabilities'),fetch('/api/candidates')]);
      if(!a.ok||!b.ok)throw Error();capabilities=await a.json();const data=await b.json();
      if(capabilities.mode==='real-preparation'){const root=el('div');$('planResult').before(root);livePanel=(capabilities.mapPicking||!capabilities.canPrepare)?createPickPanel({root,capabilities,onMapReady:()=>{paint();updateCase06Ready();},onReady:()=>{if(capabilities.case06){state.textContent='首条道路已查询；任务06请先完成位置与午餐选择，完整核查待接通。';return;}capabilities.canGenerate=true;button.disabled=false;button.hidden=false;button.textContent='生成真实模型草案与两天路线';},onModeChange:()=>{revision++;agentPanel?.invalidate();replanPanel?.changed();runController?.abort();result=null;paint();capabilities.canGenerate=false;button.disabled=true;state.textContent=capabilities.case06?'位置或午餐已改变，旧结果失效；完成全部选择后可重新核查。':'落点或方式已改变，旧草案与路线失效；请确认落点并重新查询首段。';updateCase06Ready();}}):createLivePanel({root,capabilities,onModeChange:()=>{revision++;result=null;paint();livePanel?.invalidate();state.textContent='道路方式已修改，旧结果已清除。';},onReady:()=>{if(capabilities.case06){state.textContent='首条道路已查询；任务06请先完成位置与午餐选择，完整核查待接通。';return;}capabilities.canGenerate=true;button.disabled=false;button.textContent='运行一次真实模型草案';}});}
      $('generationMode').textContent=capabilities.mode==='offline-test'?'离线替身测试 · 非模型与地图结果':'离线准备 · 真实生成未启用';
      state.textContent=capabilities.canGenerate?'此入口用当前日期与限制测试交接；候选按顺序分配，不做偏好优化。不会查询道路或加载地图。':'本轮未授权真实调用。可展开候选资料；体验草案交接请另启动离线测试服务（端口4174）。';
      button.disabled=!capabilities.canGenerate;button.textContent=capabilities.mode==='real-preparation'?'运行一次真实模型草案':capabilities.canGenerate?'运行离线替身测试':'真实生成未启用';
      if(capabilities.mapPicking){button.disabled=!capabilities.canGenerate;button.hidden=!capabilities.productFlow;$('generationTitle').textContent=capabilities.productFlow?'真实地图、草案与程序核查':'本轮：地图选点与首条道路';}
      if(capabilities.mode==='real-preparation'){$('generationMode').textContent=capabilities.productFlow?'真实模型与高德道路 · 手动触发':'真实接入准备 · 默认不调用';state.textContent=capabilities.productFlow?'加载地图，分别确认测试落点与交通方式，查询首段后可生成真实草案。未知资料保留缺口。':capabilities.mapPicking?'本轮仅验证两个用户测试落点与首条道路，地点检索和模型均关闭。':'先完成入口和单路段验收；有配置不代表有本轮授权。';}
      if(capabilities.productFlow){const r=await fetch('/api/live/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(getRequest())});if(r.ok){const old=await r.json();if(old.result){result=old.result;paint();state.textContent='历史回放：当前服务内真实结果，未重新调用模型或道路；地图需手动加载。';}}}
      if(capabilities.agentReview){const root=el('div');$('planResult').before(root);if(capabilities.replan08){const d=el('details');d.append(el('summary','可选：查看普通冲突审查'));root.replaceWith(d);d.append(root);}agentPanel=createAgentPanel({root,getRequest,validate,onResult:r=>{if(workspace.mode==='review'){result=r;paint();}},onState:s=>agentUpdate('review',s),onLocate:locateChange,onBusy:v=>setAgentBusy('review',v)});agentPanel.baselineReady(!!result);}
      if(capabilities.replan08){const host=el('div');$('planResult').before(host);replanPanel=createReplanPanel08({root:host,getRequest,validate,applyRequest:async r=>{revision++;runController?.abort();agentPanel?.invalidate();await applyRequest(r);},onResult:r=>{if(workspace.mode==='replan'){result=r;paint();}},onMeta:d=>{metaData=d;updateExperience();},onState:s=>agentUpdate('replan',s),onLocate:locateChange,onBusy:v=>setAgentBusy('replan',v)});}
      if(capabilities.case06){state.textContent=result?'历史回放：当前真实草案与道路未重新调用；再次手动核查时，相同需求复用游览草案，需求改变才请求模型。':'先确认位置与午餐，再手动核查。短路先查步行；超过1.2公里或20分钟的外部路段再取实际公交结果，无自动重试。';await updateCase06Ready();}
      workspace.mountPick();workspace.mountAgents();paint();updateExperience();document.dispatchEvent(new Event('workspace:ready'));
      $('candidateList').replaceChildren(...data.candidates.map(c=>{
        const item=el('li');item.append(el('strong',`${c.id} ${c.name}`),el('p',c.reference.value),el('p',`停留估计${c.stayMinutes.value.join('～')}分钟；内部步行估计${c.internalMeters.value.map(v=>v/1000).join('～')}公里。`),el('p','当日开放、预约、票价与等待：待核实。'));
        c.entrance.sources.forEach(id=>{const source=data.sources.find(s=>s.id===id);const a=el('a',`${id} ${source.kind}（${source.obtainedAt}）`);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';item.append(a);});return item;
      }));
    } catch(e) {workspace.status.textContent='本地准备接口不可用，请重启服务；未联网。';state.textContent='本地准备接口不可用。请重启本项目服务再刷新；没有发起模型或地图请求。';button.disabled=true;}
  }
  function paint() {
    updateExperience();const root=$('planResult');root.replaceChildren();const pending=$('pendingTitle')?.closest('.routePending');if(pending){pending.querySelector('h3').textContent=result?.mode==='real'?'已取得真实道路，请查看核查结果':'路线还未接入';pending.querySelector('p').textContent=result?.mode==='real'?'可以切换日期、定位活动和查看路段；资料缺口与约束冲突仍需处理，不代表旅行已经可行。':'先检查需求，再运行已启用的草案入口。地图仅显示已确认测试落点之间查询成功的路段。';}if(!result){document.getElementById('currentPlanBasis')?.replaceChildren();document.getElementById('currentPlanRecord')?.replaceChildren();root.append(el('p','尚未载入当前道路与活动。已保存的采用状态保持，显式开始后才取得当前路段。','emptyActivities'));return;}
    if(result.mode==='real')livePanel?.showDay(result.review.days[Math.min(selectedDay,result.review.days.length-1)]);
    const heading=el('h3',result.label);heading.tabIndex=-1;heading.id='planResultTitle';
    root.append(heading);if(result.versionContext)root.append(el('p',result.versionContext.matchesCurrent?'当前方案对应的条件见顶部版本栏':'旧采用方案尚未适配新条件，不能视为4公里有效方案','warning'));root.append(el('p',`${labels[result.review.status]} · 估计与未知仍保留，未证明旅行可行。`,'warning'));
    const d=result.review.days[Math.min(selectedDay,result.review.days.length-1)];root.append(el('h4',`${d.date} ${result.mode==='real'?'模型草案':'测试'}活动顺序`));
    const timeline=el('ol',undefined,'planItems');
    d.timeline.forEach(item=>{const li=el('li');if(item.candidateId){li.dataset.activityRowId=item.candidateId;li.tabIndex=-1;}if(result.mode==='real'&&item.candidateId){const focus=el('button','在地图定位此活动');focus.type='button';focus.dataset.activityId=item.candidateId;focus.onclick=()=>{if(!livePanel?.focusActivity(item.candidateId))state.textContent='此活动没有已确认落点，不在地图补造。';};li.append(focus);}if(item.lock)li.append(el('p',`锁定计划 ${item.lock.start}～${item.lock.end}；未知等待仍可能导致迟到`,'warning'));li.append(el('strong',item.name),el('p',item.durationMinutes?`${result.mode==='real'?'安排':'测试'}停留 ${item.durationMinutes}分钟（估计）；到离时间未知`:item.type==='connection'?'出发、入口接驳或返回；到离时间未知':'用餐门店、时间、费用待确定'),el('p',item.reason,'hint'));timeline.append(li);});root.append(timeline,metric('当天时间',d.time,'分钟'));
    let basis=document.getElementById('currentPlanBasis');if(!basis){basis=el('div');basis.id='currentPlanBasis';workspace.basis.prepend(basis);}basis.replaceChildren(el('h4','当天核查依据与未知'));d.messages.forEach(m=>basis.append(el('p',m,'hint')));
    const members=el('div',undefined,'planMembers');
    const groups=new Map();d.members.forEach(m=>{const key=JSON.stringify([m.walking,result.review.members.find(p=>p.id===m.id).budget]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);});
    groups.forEach(group=>{const m=group[0],box=el('section');box.append(el('h4',group.map(v=>v.name).join('、')+(group.length>1?' · 核算相同':'')),metric('当天步行',capabilities?.case06?{...m.walking,missing:m.walking.missing.map(s=>s==='用餐落点及内部步行未知'?'餐厅内部步行尚未核实（所选餐厅位置已知）':s)}:m.walking,'公里',1000),metric('个人全程费用',result.review.members.find(p=>p.id===m.id).budget,'元',100));members.append(box);});root.append(members);
    const road=el('details');road.append(el('summary',result.mode==='real'?'道路逐段状态 · 缺口不连线':'道路与地图：未查询、未加载'));const list=el('ul');d.legs.forEach(l=>list.append(el('li',`${l.fromName||l.from} → ${l.toName||l.to}：${l.reason||(result.mode==='real'?`高德${l.mode==='walk'?'步行':'公交地铁'}预计${rangeText(l.minutes)}分钟；距离${rangeText(l.distanceMeters)}米；${l.accounting||''}；${l.reused?'沿用已取得道路':'来自已记录的真实查询'}${l.queriedAt?'，取得于'+new Date(l.queriedAt).toLocaleString('zh-CN'):''}`:'仅离线替身值，非真实道路')}`)));road.append(list);root.append(road);
    const events=el('details');events.append(el('summary','查看来源与实际运行记录'));(result.events||[]).forEach(e=>events.append(el('p',`${e.stage} · ${e.status}`)));events.append(el('p',result.mode==='real'?(result.draftProvenance?'本次复用已生成的真实游览草案，未再次请求模型；道路按本次实际查询记录。':'当前草案与已成功路段；调用详情仅用于核对，不代表旅行可行。'):'真实模型/地点/道路/地图调用均为0。替身调用仅用于测试。'));if(result.callRecord)events.append(el('pre',JSON.stringify(result.callRecord,null,2)));let record=document.getElementById('currentPlanRecord');if(!record){record=el('div');record.id='currentPlanRecord';workspace.records.append(record);}record.replaceChildren(events);
  }
  button.onclick=async()=>{
    if(busy||!capabilities?.canGenerate)return;if(!validate())return;
    const startedRevision=revision,request=getRequest(),previousResult=result;runController=new AbortController();busy=true;button.disabled=true;result=null;paint();state.textContent=capabilities.mode==='real-preparation'?'已提交真实请求，受技术次数与超时保护；预留仅记账，无自动重试。':'本地测试运行中，没有发起真实调用……';
    if(livePanel)request.transportMode=capabilities.case06?'mixed':livePanel.mode();
    try {
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.any([AbortSignal.timeout(185000),runController.signal])});
      const body=await response.json();if(!response.ok)throw Error(body.message||'本地测试失败');
      if(revision!==startedRevision){state.textContent='运行期间需求已改变，本次旧结果已丢弃，请重新检查。';return;}
      result=body;replanPanel?.refresh();agentPanel?.baselineReady(body.mode==='real');paint();state.textContent=body.mode==='real'?(body.review.status==='conflict'?'真实道路已返回；程序发现约束冲突，请查看逐人核查。没有自动放宽条件。':'真实结果已返回；资料缺口仍在，旅行可行性未验证。'):'离线替身测试结束：存在缺口，未验证真实旅行可行性。';$('planResultTitle').focus({preventScroll:true});$('planResultTitle').scrollIntoView({block:'start'});return true;
    } catch(error) {if(revision===startedRevision){result=previousResult;paint();}state.textContent=`未得到草案：${error.name==='TimeoutError'?'本地处理超时，无自动重试':error.message}。输入保留。`;return false;}
    finally {busy=false;button.disabled=!capabilities?.canGenerate;}
  };
  setup();return {invalidate(){workspace.status.dataset.error='';revision++;agentPanel?.invalidate();replanPanel?.changed();if(capabilities?.mode==='real-preparation')runController?.abort();livePanel?.invalidate();if(result){result=null;paint();state.textContent='需求已改变，旧测试结果已清除；重新运行才会核查当前输入。';}updateExperience();},selectDay(index){selectedDay=index;if(result)paint();}};
}
