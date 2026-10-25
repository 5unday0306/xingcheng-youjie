import {createLivePanel} from './live-panel.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const labels={conflict:'冲突',insufficient:'资料不足',uncertain:'不确定',within_estimate:'按当前估计未超'};
function metric(title,result,unit,scale=1) {
  const format=value=>`${(value[0]/scale).toFixed(scale===100?2:scale===1000?2:0)}～${(value[1]/scale).toFixed(scale===100?2:scale===1000?2:0)}${unit}`;
  const box=el('div',undefined,'planMetric');
  box.append(el('strong',`${title}：${labels[result.status]}`),el('p',result.value?`估计合计 ${format(result.value)}`:`总量未知；已知部分 ${format(result.knownSubtotal)}，不能当作总量`),el('p',`上限 ${(result.limit/scale).toFixed(scale===100?2:scale===1000?2:0)}${unit}`));
  if(result.missing.length){const d=el('details');d.append(el('summary',`查看${result.missing.length}项缺口`));const list=el('ul');result.missing.forEach(s=>list.append(el('li',s)));d.append(list);box.append(d);}
  box.dataset.status=result.status;return box;
}
export function createPlanPanel({getRequest,validate}) {
  let result=null,selectedDay=0,busy=false,revision=0,capabilities=null,livePanel=null,runController=null;
  const state=$('generationStatus'),button=$('offlineRun');
  async function setup() {
    try {
      const [a,b]=await Promise.all([fetch('/api/capabilities'),fetch('/api/candidates')]);
      if(!a.ok||!b.ok)throw Error();capabilities=await a.json();const data=await b.json();
      if(capabilities.mode==='real-preparation'){const root=el('div');$('planResult').before(root);livePanel=createLivePanel({root,capabilities,onModeChange:()=>{revision++;result=null;paint();livePanel?.invalidate();state.textContent='道路方式已修改，旧结果已清除。';},onReady:()=>{capabilities.canGenerate=true;button.disabled=false;button.textContent='运行一次真实模型草案';}});}
      $('generationMode').textContent=capabilities.mode==='offline-test'?'离线替身测试 · 非模型与地图结果':'离线准备 · 真实生成未启用';
      state.textContent=capabilities.canGenerate?'此入口用当前日期与限制测试交接；候选按顺序分配，不做偏好优化。不会查询道路或加载地图。':'本轮未授权真实调用。可展开候选资料；体验草案交接请另启动离线测试服务（端口4174）。';
      button.disabled=!capabilities.canGenerate;button.textContent=capabilities.mode==='real-preparation'?'运行一次真实模型草案':capabilities.canGenerate?'运行离线替身测试':'真实生成未启用';
      if(capabilities.mode==='real-preparation'){$('generationMode').textContent='真实接入准备 · 默认不调用';state.textContent='先完成入口和单路段验收；有配置不代表有本轮授权。';}
      $('candidateList').replaceChildren(...data.candidates.map(c=>{
        const item=el('li');item.append(el('strong',`${c.id} ${c.name}`),el('p',c.reference.value),el('p',`停留估计${c.stayMinutes.value.join('～')}分钟；内部步行估计${c.internalMeters.value.map(v=>v/1000).join('～')}公里。`),el('p','当日开放、预约、票价与等待：待核实。'));
        c.entrance.sources.forEach(id=>{const source=data.sources.find(s=>s.id===id);const a=el('a',`${id} ${source.kind}（${source.obtainedAt}）`);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';item.append(a);});return item;
      }));
    } catch {state.textContent='本地准备接口不可用。请重启本项目服务再刷新；没有发起模型或地图请求。';button.disabled=true;}
  }
  function paint() {
    const root=$('planResult');root.replaceChildren();if(!result)return;
    if(result.mode==='real')livePanel?.showDay(result.review.days[Math.min(selectedDay,result.review.days.length-1)]);
    const heading=el('h3',result.label);heading.tabIndex=-1;heading.id='planResultTitle';
    root.append(heading,el('p',`${labels[result.review.status]} · ${result.review.notice}`,'warning'));
    const d=result.review.days[Math.min(selectedDay,result.review.days.length-1)];root.append(el('h4',`${d.date} ${result.mode==='real'?'模型草案':'测试'}活动顺序`));
    const timeline=el('ol',undefined,'planItems');
    d.timeline.forEach(item=>{const li=el('li');if(item.candidateId){li.dataset.activityRowId=item.candidateId;li.tabIndex=-1;}if(result.mode==='real'&&item.candidateId){const focus=el('button','在地图定位此活动');focus.type='button';focus.dataset.activityId=item.candidateId;focus.onclick=()=>{if(!livePanel?.focusActivity(item.candidateId))state.textContent='此活动没有已确认落点，不在地图补造。';};li.append(focus);}li.append(el('strong',item.name),el('p',item.durationMinutes?`${result.mode==='real'?'建议':'测试'}停留 ${item.durationMinutes}分钟（估计）；到离时间未知`:'用餐门店、时间、费用待确定'),el('p',item.reason,'hint'));timeline.append(li);});root.append(timeline,metric('当天时间',d.time,'分钟'));
    d.messages.forEach(m=>root.append(el('p',m,'hint')));
    const members=el('div',undefined,'planMembers');
    d.members.forEach(m=>{const box=el('section');box.append(el('h4',m.name),metric('当天步行',m.walking,'公里',1000),metric('个人全程费用',result.review.members.find(p=>p.id===m.id).budget,'元',100));members.append(box);});root.append(members);
    const road=el('details');road.open=true;road.append(el('summary',result.mode==='real'?'道路逐段状态 · 缺口不连线':'道路与地图：未查询、未加载'));const list=el('ul');d.legs.forEach(l=>list.append(el('li',`${l.id} ${l.from} → ${l.to}：${l.reason||(result.mode==='real'?`高德${l.mode}预测${l.minutes.join('～')}分钟`:'仅离线替身值，非真实道路')}`)));road.append(list);root.append(road);
    const events=el('details');events.append(el('summary','查看实际本地阶段记录（不是Agent看板）'));result.events.forEach(e=>events.append(el('p',`${e.stage} · ${e.status}`)));events.append(el('p',result.mode==='real'?'真实单次模型与已成功路段；费用预留不等于供应商实扣。':'真实模型/地点/道路/地图调用均为0。替身调用仅用于测试。'));if(result.callRecord)events.append(el('pre',JSON.stringify(result.callRecord,null,2)));root.append(events);
  }
  button.onclick=async()=>{
    if(busy||!capabilities?.canGenerate)return;if(!validate())return;
    const startedRevision=revision,request=getRequest();runController=new AbortController();busy=true;button.disabled=true;result=null;paint();state.textContent=capabilities.mode==='real-preparation'?'已提交真实请求，受次数、超时与费用预留限制，无自动重试。':'本地测试运行中，没有发起真实调用……';
    if(livePanel)request.transportMode=livePanel.mode();
    try {
      const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.any([AbortSignal.timeout(185000),runController.signal])});
      const body=await response.json();if(!response.ok)throw Error(body.message||'本地测试失败');
      if(revision!==startedRevision){state.textContent='运行期间需求已改变，本次旧结果已丢弃，请重新检查。';return;}
      result=body;paint();state.textContent=body.mode==='real'?'真实草案已返回；仅部分道路可能可用，资料缺口仍在，旅行可行性未验证。':'离线替身测试结束：存在缺口，未验证真实旅行可行性。';$('planResultTitle').focus({preventScroll:true});$('planResultTitle').scrollIntoView({block:'start'});
    } catch(error) {state.textContent=`未得到草案：${error.name==='TimeoutError'?'本地处理超时，无自动重试':error.message}。输入保留。`;}
    finally {busy=false;button.disabled=!capabilities?.canGenerate;}
  };
  setup();return {invalidate(){revision++;if(capabilities?.mode==='real-preparation')runController?.abort();livePanel?.invalidate();if(result){result=null;paint();state.textContent='需求已改变，旧测试结果已清除；重新运行才会核查当前输入。';}},selectDay(index){selectedDay=index;if(result)paint();}};
}
