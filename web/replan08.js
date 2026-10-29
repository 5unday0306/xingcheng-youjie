import {addExportControls} from './export09.js';
import {createAgentPanel} from './agent-review.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function createReplanPanel08({root,getRequest,validate,applyRequest,onResult,onBusy,onMeta=()=>{},onState=()=>{},onLocate=()=>{}}){
 let data=null,setting=false;const section=el('section');section.id='replan08';section.className='agentReview';
 const h=el('h3','锁定午餐与动态重排'),status=el('p','正在核对当前采用版本……');status.id='replanStatus';status.setAttribute('role','status');
 const start=el('input'),end=el('input');start.type=end.type='time';start.id='lockStart08';end.id='lockEnd08';start.value='12:30';end.value='13:30';
 const a=el('label','第2天午餐计划开始');a.htmlFor=start.id;const b=el('label','计划结束');b.htmlFor=end.id;
 const restore=el('button','恢复当前已采用方案的真实道路');restore.id='restoreBaseline08';restore.type='button';
 const configure=el('button','确认锁定午餐，并将第2天三人改为4公里');configure.id='configure08';configure.type='button';
 const unlock=el('button','明确解锁午餐（保留当前步行条件）');unlock.id='unlock08';unlock.type='button';
 const restoreInputs=el('button','恢复已保存的重排条件与锁定');restoreInputs.id='restoreInputs08';restoreInputs.type='button';
 const detail=el('p');detail.id='replanVersion08';const lockText=el('p');lockText.id='lockSummary08';
 const versionBox=el('details');versionBox.append(el('summary','版本与锁定记录'),detail);const roles=el('div');section.append(h,status,lockText,versionBox,el('p','锁定的是计划安排，不是餐厅预约、营业或到达保证。其他日期、逐人预算与已确认测试地点保留。'),restore,a,start,b,end,configure,unlock,restoreInputs,roles);root.append(section);
 const post=async(action,extra={})=>{const r=await fetch('/api/live/replan/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:getRequest(),...extra})});const d=await r.json();if(!r.ok)throw Error(d.message||'重排操作失败');return d;};
 const agents=createAgentPanel({root:roles,prefix:'replanAgent',apiBase:'/api/live/replan/agents/',getRequest,validate,onBusy,onResult,onState,onLocate});
 function render(){if(!data)return;onMeta(data);const m=data.meta;if(m.previewSnapshot&&!data.baselineAvailable&&!data.state)status.textContent='已恢复结构历史快照；真实地图和交通需手动重取。未自动采用或调用。';configure.disabled=setting||!data.baselineAvailable;restore.disabled=setting||!m.adopted;unlock.disabled=setting||!m.lock;restoreInputs.disabled=setting||!m.request;agents.baselineReady(data.baselineAvailable&&!!m.lock);detail.textContent=`采用版本：${m.adopted?.id||'尚未取得'}；当前需求版本：${m.requestVersion}；活动ID：${m.lock?.activityId||'无'}；${data.adoptedMatchesCurrent?'条件一致，仍需查看资料缺口':'原采用方案尚未适配当前条件，未自动采用07预览'}`;lockText.textContent=m.lock?`已锁定 ${m.lock.date} ${m.lock.name} ${m.lock.start}～${m.lock.end}（计划）`:'当前未锁定午餐。请明确确认地点与计划时刻。';if(m.lock){start.value=m.lock.start;end.value=m.lock.end;}}
 async function run(action,fn){if(setting)return;setting=true;render();try{const d=await fn();if(d?.meta){data=d;render();}return d;}catch(e){status.textContent=action+'失败：'+e.message;}finally{setting=false;render();}}
 restore.onclick=()=>run('恢复原方案',async()=>{const d=await post('restore');status.textContent='已恢复原采用方案真实道路；本次取得时间可展开，不采用07预览。';if(d.baseline)onResult(d.baseline);return d;});
 configure.onclick=()=>run('锁定',async()=>{if(!validate())return;const d=await post('configure',{start:start.value,end:end.value,confirmed:true});await applyRequest(d.meta.request);localStorage.setItem('xingchengyoujie.replan.v1',JSON.stringify({version:1,requestVersion:d.meta.requestVersion,request:d.meta.request,lock:d.meta.lock}));agents.invalidate();data=d;render();status.textContent='已保存锁定与第2天4公里条件；旧方案保留但尚未适配，点击下方运行协作生成预览。';if(d.baseline)onResult(d.baseline);return d;});
 unlock.onclick=()=>run('解锁',async()=>{const d=await post('unlock',{confirmed:true});agents.invalidate();localStorage.setItem('xingchengyoujie.replan.v1',JSON.stringify({version:1,requestVersion:d.meta.requestVersion,request:d.meta.request,lock:null}));status.textContent='已显式解锁，4公里输入保持；旧预览失效，重新锁定后才重排。';return d;});
 restoreInputs.onclick=()=>run('恢复条件',async()=>{await applyRequest(data.meta.request);await agents.refresh();status.textContent='已恢复已保存的需求与关联锁定；未发起业务调用。';return data;});
 addExportControls({section,post,refresh:()=>post('state').then(d=>{data=d;render();})});
 post('state').then(d=>{data=d;render();status.textContent=d.baselineAvailable?'原方案道路可用；当前4公里和锁定状态如下。':'服务内暂无原道路。请先加载地图，再点“恢复当前已采用方案的真实道路”；已选位置和两餐无需重选。';}).catch(e=>status.textContent=e.message);
 return {
  state:()=>data,
  agents,
  async restoreBaseline(){const d=await post('restore');data=d;render();if(d.baseline)onResult(d.baseline);return d;},
  async restoreInputs(){if(!data?.meta.request)throw Error('没有已保存重排条件');await applyRequest(data.meta.request);await agents.refresh();return data;},
  refresh(){return post('state').then(d=>{data=d;render();});},changed(){agents.invalidate();if(setting)return;post('sync').then(d=>{data=d;render();status.textContent='输入已改变：旧运行/预览失效，原采用方案保留并标为尚未适配。';}).catch(()=>post('invalidate').catch(()=>{}));}};
}
