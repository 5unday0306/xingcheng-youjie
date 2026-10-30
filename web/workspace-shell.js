const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function requestLabel(r){if(!r)return '尚无记录';const limits=r.members.map(m=>m.walking[1]??m.walking[0]);const same=limits.every(v=>v===limits[0]);return `${r.people}人 / ${r.days.length}天 · ${r.days.length>1?'第2天':'当天'}${same?limits[0]:limits.join('、')}公里`;}
export function sameRequest(a,b){const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).filter(k=>k!=='transportMode').sort().map(k=>[k,sort(x[k])])):x;return !!a&&!!b&&JSON.stringify(sort(a))===JSON.stringify(sort(b));}
export function createWorkspace({getRequest,onAction,onMode}){
 document.body.classList.add('journeyWorkspace');
 const panel=document.querySelector('.generationPanel');const head=el('div',undefined,'journeyActionbar');
 const version=el('div');version.id='journeyVersion';version.setAttribute('aria-live','polite');const action=el('button','正在读取本地状态','primary');action.id='primaryFlow';action.type='button';action.disabled=true;action.onclick=()=>onAction();
 const status=el('p','确认需求后开始规划。');status.id='flowStatus';status.setAttribute('role','status');head.append(version,action,status);
 const tabs=el('div',undefined,'workspacePanes');tabs.setAttribute('aria-label','地图、活动与协作');
 const grid=el('div',undefined,'journeyGrid');grid.id='experienceWorkspace';
 const map=el('section',undefined,'journeyMap');map.id='mapDock';map.append(el('h3','当天地图'));const empty=el('p','地图尚未加载。开始后显示已取得路线，缺段保留。','mapEmpty');empty.id='mapEmptyState';map.append(empty);
 const activities=el('section',undefined,'journeyActivities');activities.id='activityDock';activities.append(el('h3','当天安排'));activities.append(document.getElementById('planResult'));
 const agents=el('aside',undefined,'journeyAgents');agents.id='agentDock';agents.append(el('h3','多Agent协作'));const modes=el('div',undefined,'workflowModes');
 const selectMode=value=>{api.mode=value;for(const b of modes.children)b.setAttribute('aria-pressed',String(b.dataset.mode===value));document.getElementById('agentReview')?.toggleAttribute('hidden',value!=='review');document.getElementById('replanAgentReview')?.toggleAttribute('hidden',value!=='replan');document.getElementById('agentChooser')?.toggleAttribute('hidden',value!=='review');document.getElementById('replanAgentChooser')?.toggleAttribute('hidden',value!=='replan');document.getElementById('agentCompare')?.toggleAttribute('hidden',value!=='review');document.getElementById('replanAgentCompare')?.toggleAttribute('hidden',value!=='replan');if(document.getElementById('routeView')&&!document.getElementById('routeView').hidden){document.getElementById('navRoute')?.setAttribute('aria-pressed',String(value==='review'));document.getElementById('navReplan')?.setAttribute('aria-pressed',String(value==='replan'));history.replaceState(null,'',value==='replan'?'#replan08':'#routeView');}onMode?.(value);};
 for(const [v,t] of [['review','旅行规划'],['replan','调整行程']]){const b=el('button',t);b.type='button';b.dataset.mode=v;b.onclick=()=>selectMode(v);modes.append(b);}agents.append(modes);
 grid.append(map,activities);panel.prepend(head,tabs,agents,grid);
 const disclosure=(id,title)=>{const d=el('details');d.id=id;d.append(el('summary',title));panel.append(d);return d;};
 const places=disclosure('placeSettings','开发模式 · 地点维护');const lock=disclosure('lockSettings','固定安排与调整条件');const basis=disclosure('basisDetails','依据与待核实');const notice=el('p','金额、步行和时间为已计入估计；开放、预约及未计入项目请在出行前核实。采用方案不代表全部可行。','hint');notice.id='planEvidenceNotice';basis.before(notice);const records=disclosure('devRecords','开发与运行记录');records.hidden=new URLSearchParams(location.search).get('developer')!=='1';records.append(places);
 for(const n of [document.getElementById('generationTitle')?.parentElement,document.getElementById('generationMode'),document.getElementById('generationStatus'),document.getElementById('offlineRun')])if(n)records.append(n);
 const candidates=document.getElementById('candidateList')?.closest('details');if(candidates)basis.append(candidates);
 for(const n of [document.querySelector('.gaps'),document.querySelector('.dayBrief')])if(n)basis.append(n);
 document.querySelector('.routeStage')?.setAttribute('hidden','');
 let pane='map';const setPane=value=>{pane=value;grid.dataset.pane=value;panel.dataset.pane=value;for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.pane===value));};
 for(const [v,t] of [['map','地图'],['activities','活动'],['agents','协作']]){const b=el('button',t);b.type='button';b.dataset.pane=v;b.onclick=()=>setPane(v);tabs.append(b);}setPane(pane);
 const api={mode:location.hash==='#replan08'?'replan':'review',map,agents,activities,places,lock,basis,records,action,status,
  setMode:selectMode,setPane,
  version(meta,result){
    version.replaceChildren();const adopted=meta?.adopted,changed=adopted&&!sameRequest(adopted.request,getRequest());
    const title=el('strong',result?.label?.includes('已采用')?'我的行程':result?.label?.includes('预览')?'方案预览':adopted?'我的行程':'旅行安排');title.id='journeyStateTitle';version.append(title);
    version.append(el('p',requestLabel(getRequest())));
    if(changed)version.append(el('p','原采用方案对应之前的需求，继续保留。'));
    if(meta?.lock)version.append(el('p',`已固定：${meta.lock.date} ${meta.lock.start}～${meta.lock.end} ${meta.lock.name}`,'lockBadge'));
    if(result)version.append(el('p',result.label?.includes('已采用')?'已保存':(result.label||'方案'),'currentScheme'));
    let debug=document.getElementById('requestVersionDetails');if(!debug){debug=el('details');debug.id='requestVersionDetails';records.append(debug);}debug.replaceChildren(el('summary','多套需求与版本对照'));for(const [t,r]of [['正在编辑',getRequest()],['当前采用',adopted?.request],['调整条件',meta?.request]])debug.append(el('p',t+'：'+requestLabel(r)));
  },
  mountPick(){const p=document.getElementById('pickPanel');if(!p)return;map.append(p);for(const child of [...p.children]){if(child.id==='pickMap'||child.classList.contains('mapTools')||child.classList.contains('mapLegend')||child.id==='activePickBar')continue;if(child.id==='pickRouteInfo'){basis.append(child);continue;}if(child.id==='case06Progress'||child.querySelector?.('#case06Choices')||child.classList.contains('pickCards')||child.tagName==='LABEL'||['pickMode','pickRoute'].includes(child.id)){places.append(child);continue;}records.append(child);}records.append(places);const text=places.querySelector('#case06Choices h3');if(text)text.textContent='已确认地点与两天午餐';},
  mountAgents(){const normal=document.getElementById('agentReview'),replan=document.getElementById('replan08'),roles=document.getElementById('replanAgentReview');if(normal){const wrapper=normal.parentElement?.parentElement;agents.append(normal);if(wrapper?.tagName==='DETAILS'&&!wrapper.querySelector('button'))wrapper.remove();}if(replan){replan.id='replanSettings08';lock.append(replan);const anchor=el('span');anchor.id='replan08';grid.prepend(anchor);}if(roles)agents.append(roles);for(const id of ['agentCompare','replanAgentCompare']){const n=document.getElementById(id);if(n)activities.append(n);}if(!normal&&!roles){const d=el('div');for(const title of ['需求协调','方案筛选','行程规划','行程审查']){const row=el('details');row.dataset.role=title;row.dataset.status='not-run';row.append(el('summary',title+' · 尚未执行'),el('p','当前模式未启用真实角色调用。'));d.append(row);}agents.append(d);}selectMode(api.mode);},
  missing(items){places.open=true;status.textContent='请补齐：'+items.join('、')+'。其他确认保持。';places.scrollIntoView({block:'start'});},
  mapReady(ready){empty.hidden=ready;},
 };
 document.addEventListener('workspace:activity-focus',()=>setPane('activities'));
 document.addEventListener('workspace:mode',e=>{selectMode(e.detail);setPane('agents');});return api;
}
