import {defaultDraft,toRequest,validateRequest,dateAt} from './core.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
let draft=defaultDraft(),view='overview',selected=0,day=0,editorKind='person',returnFocus='edit-person-0',closing=false,previewSaved=null,toastTimer;
const sample=defaultDraft(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const current=()=>view==='offline'?sample:draft;
const signature=()=>JSON.stringify(toRequest(draft));
function transition(node,kind='content'){
  if(reduced()||!node.animate)return Promise.resolve();
  const frames=kind==='close'?[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(12px)'}]:kind==='drawer'?[{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'translateY(0)'}]:[{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}];
  return node.animate(frames,{duration:kind==='close'?160:280,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.catch(()=>{});
}
function dates(data){const first=dateAt(data.startDate,0),last=dateAt(data.startDate,data.dayCount-1);return first?`${first.replaceAll('-','.')} — ${last.slice(5).replace('-','.')}`:'出发日期待填写';}
function avatar(i){const n=el('span',String(i+1),'avatar');n.dataset.person=i;n.setAttribute('aria-hidden','true');return n;}
function hero(){const data=current();$('scene-dates').textContent=dates(data);$('scene-party').textContent=`${data.people}位同行者 / ${data.dayCount}天共同游玩`;$('ticket-date').textContent=dateAt(data.startDate,0)?data.startDate.slice(5).replace('-','.'):'待填写';}
function crew(){
  if(!$('crew').children.length)draft.members.forEach((m,i)=>{
    const card=el('article',undefined,'crew-card');card.id=`person-${i}`;
    const select=el('button',undefined,'person-select');select.type='button';select.id=`select-person-${i}`;select.setAttribute('aria-label',`选择${m.name}`);
    const text=el('div',undefined,'person-text');text.append(el('strong',m.name),el('p'),el('small'));select.append(avatar(i),text);
    select.onclick=()=>{selected=i;crew();transition(card);};
    const edit=el('button','编辑','edit-person');edit.type='button';edit.id=`edit-person-${i}`;edit.setAttribute('aria-label',`编辑${m.name}`);edit.onclick=()=>openEditor('person',i,edit.id);
    card.append(select,edit);$('crew').append(card);
  });
  current().members.forEach((m,i)=>{const card=$(`person-${i}`);card.dataset.selected=String(i===selected);card.querySelector('.person-select').setAttribute('aria-pressed',String(i===selected));card.querySelector('.person-text p').textContent=m.preference||'需求待填写';card.querySelector('.person-text small').textContent=`全程 ${m.budget||'待填'}元 / 步行 ${m.walking.map((v,j)=>`第${j+1}天${v||'待填'}公里`).join('、')}`;});
  const person=current().members[selected];$('selected-note').textContent=`正在关注${person.name}：${person.preference||'需求待填写'}`;$('crew-context').textContent=view==='offline'?'固定样例需求，与你的编辑分开':'分别保留每个人的期待';
}
function status(){const saved=previewSaved&&JSON.stringify(toRequest(previewSaved))===signature();$('memory-state').textContent=previewSaved?(saved?'已暂存本页，刷新后清空':'本页有未暂存修改'):'仅预览，尚未暂存';}
function edited(){if(view!=='overview')setView('overview',false);hero();crew();status();}
function conditions(data){const row=el('div',undefined,'condition-row');[[dates(data),'旅行日期'],[`${data.days[day].start||'待填'}—${data.days[day].end||'待填'}`,'当天可用窗口'],['公共测试点往返','起终点'],['步行＋公交地铁','交通方式']].forEach(([value,label])=>{const cell=el('div');cell.append(el('span',label),el('strong',value));row.append(cell);});return row;}
function renderOverview(){
  const layout=el('div',undefined,'overview-layout'),body=el('section',undefined,'overview-main'),note=el('aside',undefined,'overview-note');
  body.append(el('h3','在出发前，先照顾彼此的期待。'),el('p','选择同行者，展开面板编辑。检查只核对需求格式，不会生成行程或确认旅行可行。'),conditions(draft));
  note.append(el('h3','仍在准备，不替未知作答'),el('p','集合点的实际入口、开放预约、具体午餐和道路资料仍需核实。'),el('p','本页是动态设计预览；正式应用与存档保持原样。'));layout.append(body,note);return layout;
}
function renderSummary(){
  const sheet=el('section',undefined,'summary-sheet'),heading=el('div',undefined,'summary-status'),text=el('div');text.append(el('h3','输入检查通过，仅结构与格式'),el('p','已使用现有程序规则检查；行程尚未生成，旅行可行性未验证。'));heading.append(el('span','✓'),text);sheet.append(heading,conditions(draft));
  const people=el('div',undefined,'summary-people');draft.members.forEach(m=>{const person=el('section',undefined,'summary-person');person.append(el('strong',m.name),el('p',m.preference),el('small',`个人全程预算 ${m.budget}元`),el('small',m.walking.map((v,i)=>`第${i+1}天步行上限 ${v}公里`).join(' / ')));people.append(person);});sheet.append(people);return sheet;
}
const fixedActivities=[[
  {name:'山西博物院',stay:150,note:'当日开放、预约及实际入口待核实。'},
  {name:'待选用餐区段',meal:true,note:'门店、位置、价格和用餐时间均未知。'},
  {name:'迎泽公园短环线',stay:45,note:'可走区域与当日开放待核实。'},
],[
  {name:'钟楼街',stay:45,note:'通行条件与内部步行去重仍待核实。'},
  {name:'待选用餐区段',meal:true,note:'未定位或锁定午餐，不冒充已选餐厅。'},
  {name:'食品街',stay:45,note:'逛吃费用每人30～60元为开发估计，不替代正餐。'},
]];
function renderOffline(){
  const root=el('div');root.append(el('p','固定离线样例，非真实模型或地图结果；不应用于你的预览编辑。','offline-warning'));
  const tabs=el('div',undefined,'day-selector');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','选择离线样例日期');[0,1].forEach(i=>{const button=el('button',`第${i+1}天　${dateAt(sample.startDate,i)}`);button.type='button';button.id=`sample-day-${i}`;button.setAttribute('aria-pressed',String(i===day));button.onclick=()=>{day=i;renderContent();$(`sample-day-${i}`).focus({preventScroll:true});transition($('view-content'));};tabs.append(button);});root.append(tabs);
  const grid=el('div',undefined,'offline-grid'),list=el('ol',undefined,'activity-list');
  fixedActivities[day].forEach((item,i)=>{const li=el('li',undefined,`activity${item.meal?' meal':''}`),body=el('div',undefined,'activity-body');body.append(el('h3',item.name),el('p',item.meal?'用餐时间 / 位置未知':`停留估计 ${item.stay}分钟 · 到离时间未知`),el('small',item.note));li.append(el('span',i+1,'activity-index'),body);list.append(li);});
  const end=el('p','出发与返回均为山西博物院东门外公共集合点。所有道路与返程交通未查询，列表细线只表示顺序。','editor-hint');
  const main=el('section');main.append(list,end);
  const check=el('aside',undefined,'check-block');check.append(el('h3','资料不足，尚不可判定可执行'),el('p',`第${day+1}天总时间未知；已知停留估计${day===0?195:90}分钟。`));
  const gaps=el('ul',undefined,'gap-list');['道路与接驳：未查询','开放与预约：待核实','用餐门店与等待：未知'].forEach(s=>gaps.append(el('li',s)));check.append(gaps);
  sample.members.forEach(m=>{const person=el('section',undefined,'check-person');person.append(el('strong',m.name),el('p','个人全程预算上限600元；费用总量未知。'),el('p','已知部分30～60元，仅为两天中食品街逛吃估计。'),el('p',`第${day+1}天步行上限6公里；${day===0?'内部步行估计1.8～3.5公里，总量未知':'街区去重及接驳未知，暂无总量'}。`));check.append(person);});grid.append(main,check);root.append(grid);return root;
}
function renderContent(){const body=view==='summary'?renderSummary():view==='offline'?renderOffline():renderOverview();$('view-content').replaceChildren(body);}
function setView(value,animate=true){view=value;for(const name of ['overview','summary','offline'])$(`view-${name}`).setAttribute('aria-pressed',String(name===value));$('work-title').textContent={overview:'旅行需求概览',summary:'检查后的需求摘要',offline:'每日活动与核查'}[view];$('view-caption').textContent=view==='offline'?'固定三人两天离线样例，未知仍是未知':'设计预览，编辑仅在本次打开期间保留';hero();crew();renderContent();if(animate)transition($('view-content'));}
function relevantErrors(){const errors=validateRequest(toRequest(draft));return errors.filter(e=>editorKind==='trip'?e.field.startsWith('days'):e.field.startsWith(`members.${selected}.`));}
function fieldId(field){const parts=field.split('.');if(parts[0]==='days')return parts[2]==='date'?'edit-date':`edit-day-${parts[1]}-end`;if(parts[2]==='walking')return `edit-walk-${parts[3]}`;return {'preference':'edit-preference','budget':'edit-budget'}[parts[2]];}
function showErrors(errors,focus=false){
  document.querySelectorAll('#editor .field-error').forEach(n=>n.remove());document.querySelectorAll('#editor [aria-invalid]').forEach(n=>{n.removeAttribute('aria-invalid');n.removeAttribute('aria-describedby');});
  $('editor-errors').textContent=errors.length?`还有${errors.length}项需要调整，输入已保留。`:'';
  errors.forEach((e,i)=>{const input=$(fieldId(e.field));if(!input)return;const hint=el('span',e.message,'field-error');hint.id=`field-error-${i}`;input.parentElement.append(hint);input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',hint.id);});
  if(focus&&errors.length){const target=$(fieldId(errors[0].field));target?.focus();target?.scrollIntoView({block:'center'});}
}
function field(label,value,type,id,update){const box=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;if(type==='number'){input.min='0';input.step='any';}input.value=value;input.id=id;input.oninput=()=>{update(input.value);edited();if($('editor-errors').textContent)showErrors(relevantErrors());};box.append(input);return box;}
function openEditor(kind,index=selected,trigger='edit-trip'){
  if($('editor').open||closing)return;
  editorKind=kind;selected=index;returnFocus=trigger;if(view==='offline')setView('overview',false);crew();$('editor-errors').textContent='';
  const fields=$('editor-fields');fields.replaceChildren();
  if(kind==='person'){
    const m=draft.members[selected];$('editor-title').textContent=`${m.name}的期待`;
    fields.append(field('兴趣与需求原话',m.preference,'textarea','edit-preference',v=>m.preference=v),field('个人全程预算（元）',m.budget,'number','edit-budget',v=>m.budget=v));
    const walks=el('div',undefined,'field-pair');m.walking.forEach((v,j)=>walks.append(field(`第${j+1}天步行上限（公里）`,v,'number',`edit-walk-${j}`,x=>m.walking[j]=x)));fields.append(walks,el('p','步行包含交通接驳和场馆内部。每天独立填写，不改其他同行者。','editor-hint'));
  }else{
    $('editor-title').textContent='旅行条件';fields.append(field('出发日期',draft.startDate,'date','edit-date',v=>draft.startDate=v));
    draft.days.forEach((d,i)=>{const row=el('div',undefined,'field-pair');row.append(field(`第${i+1}天出发`,d.start,'time',`edit-day-${i}-start`,v=>d.start=v),field(`第${i+1}天返回`,d.end,'time',`edit-day-${i}-end`,v=>d.end=v));fields.append(row);});fields.append(el('p','固定太原三人两天测试案例。可用窗口含出发和返回交通，不代表活动时刻。','editor-hint'));
  }
  $('editor').showModal();transition(document.querySelector('.editor-shell'),'drawer');document.querySelector('.editor-scroll').scrollTop=0;
  $(kind==='person'?'edit-preference':'edit-date').focus({preventScroll:true});
}
async function closeEditor(){if(closing||!$('editor').open)return;closing=true;await transition(document.querySelector('.editor-shell'),'close');$('editor').close();renderContent();closing=false;$(returnFocus)?.focus({preventScroll:true});}
function checkInput(navigate=true){const errors=validateRequest(toRequest(draft));if(errors.length){const e=errors[0],parts=e.field.split('.');openEditor(parts[0]==='members'?'person':'trip',parts[0]==='members'?Number(parts[1]):selected,'check-preview');showErrors(relevantErrors(),true);return false;}if(navigate){setView('summary');$('work-title').focus({preventScroll:true});document.querySelector('.work-area').scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'});}return true;}
$('editor-form').onsubmit=e=>{e.preventDefault();const errors=relevantErrors();showErrors(errors,true);if(!errors.length){renderContent();closeEditor();}};
$('close-editor').onclick=closeEditor;$('cancel-editor').onclick=closeEditor;$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('edit-trip').onclick=()=>openEditor('trip',selected,'edit-trip');$('check-preview').onclick=()=>checkInput();
$('save-preview').onclick=()=>{if(!checkInput(false))return;previewSaved=structuredClone(draft);status();const toast=$('toast');clearTimeout(toastTimer);toast.textContent='已暂存本次预览，关闭或刷新后不保留；正式存档未改变。';toast.hidden=false;transition(toast);toastTimer=setTimeout(()=>toast.hidden=true,4000);};
$('view-overview').onclick=()=>setView('overview');$('view-summary').onclick=()=>checkInput();$('view-offline').onclick=()=>setView('offline');
history.scrollRestoration='manual';window.scrollTo(0,0);hero();crew();status();renderContent();
