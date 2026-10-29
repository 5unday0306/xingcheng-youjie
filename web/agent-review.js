const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const roleNames={coordinate:'需求协调',screen:'方案筛选',plan:'行程规划',audit:'行程审查'};
const metricStates={conflict:'估计冲突',insufficient:'资料不足',uncertain:'不确定',within_estimate:'当前估计未超'};
const states={running:'正在执行',completed:'已完成',failed:'失败',preview:'修订待确认',accepted:'已采用修订',rejected:'保留原方案',invalidated:'需求已变，结果失效',cancelled:'已取消'};
export function createAgentPanel({root,getRequest,validate,onResult,onBusy,apiBase='/api/live/agents/',prefix='agent'}){
 let state=null,epoch=0,poll=null,view='original',baseline=false,disposed=false;
 const section=el('section');section.id=prefix+'Review';section.className=prefix+'Review';
 const h=el('h3','多Agent冲突审查与修订预览'),notice=el('p','四个角色独立调用，程序核算；先核查原交通链，再手动启动。地点、午餐和硬约束保持，原方案保留。');
 const start=el('button','运行一次多Agent冲突审查');start.id=prefix+'Start';start.type='button';
 const status=el('p','尚未运行');status.id=prefix+'Status';status.setAttribute('role','status');
 const nodes=el('div');nodes.id=prefix+'Nodes';const compare=el('div');compare.id=prefix+'Compare';
 section.append(h,notice,el('p','需求协调 → 方案筛选 → 行程规划 → 程序核算 → 行程审查；最多一次规划/审查回交。'),start,status,nodes,compare);root.append(section);
 const post=async(action,extra={})=>{const r=await fetch(apiBase+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:getRequest(),...extra})});const b=await r.json();if(!r.ok)throw Error(b.message||'协作接口失败');return b;};
 function show(which){view=which;const r=which==='preview'?state?.preview:state?.original;if(r)onResult({...r,label:(state?.replay?'历史回放 · ':'')+(which==='preview'?'修订预览（'+(state.status==='accepted'?'已采用':'尚未采用')+'）':'原方案（保留）')});}
 function render(){
  start.disabled=!baseline||state?.status==='running'||!!state&&state.status!=='invalidated';
  status.textContent=state?(state.replay?'历史回放 · ':'')+(states[state.status]||state.status)+(state.reason?'：'+state.reason:''):'尚未运行，先取得原方案真实道路';
  const opened=new Set([...nodes.querySelectorAll('details[data-role][open]')].map(n=>n.dataset.role));const openedInputs=new Set([...nodes.querySelectorAll('details[data-node-input][open]')].map(n=>n.dataset.nodeInput));
  nodes.replaceChildren();if(state?.historicalReview){const past=state.historicalReview;nodes.append(el('p',`历史核查（${past.at}）：第1天${past.days[0].walking[0].range.join('～')}米，对应${past.days[0].walking[0].limit}米上限，估计下限冲突。本次原方案按新取得道路重新核算，与历史值分别展示。`));}
  for(const role of Object.keys(roleNames)){
   const entries=state?.nodes.filter(n=>n.role===role)||[],box=el('details');box.dataset.role=role;box.open=opened.has(role);box.append(el('summary',`${roleNames[role]} · ${entries.length?states[entries.at(-1).status]:'尚未执行'}`));
   for(const n of entries){box.append(el('p',`运行 ${n.id} · ${n.startedAt}${n.completedAt?' → '+n.completedAt:''}`));const input=el('details');input.dataset.nodeInput=n.id;input.open=openedInputs.has(n.id);input.append(el('summary','收到的结构化输入与交接'),el('pre',JSON.stringify(n.input,null,2)));box.append(input);if(n.output)box.append(el('p','实际结构化产出（职责结果，不是内部思考）'),el('pre',JSON.stringify(n.output,null,2)));if(n.error)box.append(el('p',n.error.code+'：'+n.error.message));if(n.ref)box.append(el('p','交接指纹：'+n.ref));}
   nodes.append(box);
  }
  compare.replaceChildren();if(!state?.preview)return;
  const bars=el('div');for(const [v,t] of [['original','查看原方案'],['preview','查看修订预览']]){const b=el('button',t);b.type='button';b.dataset.scheme=v;b.setAttribute('aria-pressed',String(view===v));b.onclick=()=>{show(v);render();compare.querySelector(`[data-scheme="${v}"]`)?.focus({preventScroll:true});};bars.append(b);}compare.append(bars);
  const table=el('table');table.append(el('caption','逐日步行、时间与个人全程费用（预测/估计，未知保留）'));const head=el('tr');for(const t of ['项目','原方案','修订预览'])head.append(el('th',t));table.append(head);
  const range=(x,scale=1)=>x.map(v=>(v/scale).toFixed(scale===1?0:2)).filter((v,i,a)=>i===0||v!==a[0]).join('～');
  const row=(t,a,b)=>{const r=el('tr');[t,a,b].forEach(s=>r.append(el('td',s)));table.append(r);};
  state.original.review.days.forEach((d,i)=>{const p=state.preview.review.days[i];d.members.forEach((m,j)=>row(`第${i+1}天 · 同行者${j+1}步行`,range(m.walking.knownSubtotal,1000)+'公里 · '+metricStates[m.walking.status],range(p.members[j].walking.knownSubtotal,1000)+'公里 · '+metricStates[p.members[j].walking.status]));row(`第${i+1}天已计入时间`,range(d.time.knownSubtotal)+'分钟',range(p.time.knownSubtotal)+'分钟');});
  state.original.review.members.forEach((m,i)=>row(`同行者${i+1}全程费用`,range(m.budget.knownSubtotal,100)+'元 · 总量未知',range(state.preview.review.members[i].budget.knownSubtotal,100)+'元 · 总量未知'));compare.append(table);
  const changes=el('details');changes.append(el('summary','每项候选修改、影响与来源'));for(const c of state.changes){changes.append(el('p',`${c.from} → ${c.to}：${c.usedAlternative?'预览采用较少步行路段':'候选没有更少步行，保留原路段'}；影响${c.affectedPersons.join('、')}`),el('p',c.reason),el('pre',JSON.stringify({original:c.original,candidate:c.candidate,notice:c.notice},null,2)));}compare.append(changes,el('p','未知开放、预约、内部步行、等位和费用仍在。修订未达标或资料不足也可比较，不自动判为可行。'));
  if(state.preview?.selectedOption)compare.append(el('p',state.preview.selectedOption.label+'：'+state.preview.selectedOption.tradeoff));if(state.preview?.readiness){compare.append(el('p',state.preview.readiness.canAccept?'已计入估计未发现硬冲突，未知仍待核实':'本轮候选未满足，不能采用失败预览'));state.preview.readiness.issues.forEach(x=>compare.append(el('p',x)));state.preview.readiness.choices.forEach(x=>compare.append(el('p',x)));}
  if(state.roundLimitReached)compare.append(el('p','已达到最多两轮，停止修订；遗留问题保留。'));
  for(const [accept,label,id] of [[true,'接受当前修订',prefix+'Accept'],[false,'保留原方案',prefix+'Reject']]){const b=el('button',label);b.id=id;b.type='button';b.disabled=!['preview','accepted','rejected'].includes(state.status)||(accept&&state.preview?.readiness?.canAccept===false);b.onclick=async()=>{b.disabled=true;try{const d=await post('decide',{id:state.id,accept});state=d.state;view=accept?'preview':'original';show(view);render();}catch(e){status.textContent=e.message;}};compare.append(b);}
 }
 async function read(replay=false){const current=epoch;try{const d=await post('state');if(current!==epoch||disposed)return;state=d.state;if(state)state.replay=replay;render();onBusy(state?.status==='running');if(state?.status==='running')poll=setTimeout(()=>read(false),750);else if(state?.preview){show(state.status==='accepted'?'preview':view);}}catch(e){if(current===epoch){status.textContent=e.message;onBusy(false);}}}
 start.onclick=async()=>{if(start.disabled||!validate())return;start.disabled=true;onBusy(true);const current=++epoch;try{const d=await post('start');if(current!==epoch)return;state=d.state;render();await read();}catch(e){status.textContent=e.message;onBusy(false);start.disabled=!baseline;}};
 render();read(true);
 return {refresh:()=>read(true),baselineReady(v){baseline=v;render();},invalidate(){epoch++;clearTimeout(poll);state=null;baseline=false;render();onBusy(false);post('invalidate').catch(()=>{});},destroy(){disposed=true;clearTimeout(poll);}};
}
