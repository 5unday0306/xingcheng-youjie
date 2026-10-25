// Presentation-only state. No storage, fetch, backend import or model/map SDK.
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const initial=()=>({date:'2026-11-07',start:'09:00',end:'18:00',members:['历史展览','风景拍照','美食，少走路'].map((preference,i)=>({name:`同行者${i+1}`,preference,budget:'600',walking:['6','6']}))});
let edited=initial(),mode='edit',day=0,panel='needs';
const fixed=initial();
function avatar(i){const n=el('span',String(i+1),'avatar');n.dataset.person=i;n.setAttribute('aria-hidden','true');return n;}
function dateAt(start,offset){if(!start)return '';const date=new Date(`${start}T00:00:00Z`);if(!Number.isFinite(date.getTime()))return '';date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function dates(start){const end=dateAt(start,1);return end?`${start.replaceAll('-','.')} — ${end.slice(5).replace('-','.')}`:'出发日期待填写';}
function headline(){const source=mode==='edit'?edited:fixed;$('header-dates').textContent=dates(source.date);$('trip-caption').textContent=mode==='edit'?'三个人的期待，放在同一份计划里。':'一份可核对的草案，保留所有未知。';}
function inputField(labelText,value,{type='text',id,onInput}){
  const label=el('label',labelText),input=el(type==='textarea'?'textarea':'input');
  if(type!=='textarea')input.type=type;input.value=value;input.id=id;
  if(type==='number'){input.min='0';input.step='any';}
  input.addEventListener('input',()=>onInput(input.value));label.append(input);return label;
}
function shortLimit(m){return `${m.budget?`个人全程 ${m.budget}元`:'预算待填写'}　${m.walking.map((v,i)=>`第${i+1}天 ${v?`${v}公里`:'上限待填写'}`).join(' / ')}`;}
function renderEditors(){
  $('member-editors').replaceChildren(...edited.members.map((m,i)=>{
    const details=el('details',undefined,'member');details.open=i===0;details.id=`member-${i}`;
    const summary=el('summary'),text=el('div',undefined,'member-identity'),name=el('strong',m.name),words=el('p',m.preference),limits=el('small',shortLimit(m));text.append(name,words,limits);summary.append(avatar(i),text);
    const body=el('div',undefined,'member-body');
    const changed=()=>{words.textContent=m.preference||'需求原话待填写';limits.textContent=shortLimit(m);renderPreparation();};
    body.append(inputField('兴趣与需求原话',m.preference,{type:'textarea',id:`preference-${i}`,onInput:v=>{m.preference=v;changed();}}),inputField('个人全程预算（元）',m.budget,{type:'number',id:`budget-${i}`,onInput:v=>{m.budget=v;changed();}}));
    const walking=el('div',undefined,'two-fields');m.walking.forEach((v,j)=>walking.append(inputField(`第${j+1}天步行上限（公里）`,v,{type:'number',id:`walking-${i}-${j}`,onInput:x=>{m.walking[j]=x;changed();}})));
    body.append(walking,el('p','包含接驳和内部步行；每一天独立保留。','field-hint'));details.append(summary,body);return details;
  }));
}
function renderSnapshot(){
  $('sample-needs').replaceChildren(el('p','以下是固定三人两天样例需求，与你的预览编辑分开。切回需求编辑可找回刚才的修改。','sample-need-intro'),...fixed.members.map((m,i)=>{
    const item=el('div',undefined,'sample-member'),content=el('div');content.append(el('strong',m.name),el('p',m.preference),el('small','个人全程 600元'),el('small','第1天 6公里 / 第2天 6公里'));item.append(avatar(i),content);return item;
  }));
}
function brief(label,title,description){const line=el('div',undefined,'brief-line'),content=el('div');content.append(el('strong',title));if(description)content.append(el('p',description));line.append(el('span',label),content);return line;}
function renderPreparation(){
  if(mode!=='edit')return;
  headline();const root=$('preparation-view'),intro=el('div',undefined,'preparation-intro');intro.append(el('h3','把不同的期待，安排在一起。'),el('p','先核对时间与每个人的限制。这里是需求编辑的设计预览，还没有活动安排。'));
  const list=el('div',undefined,'preparation-list');list.append(brief('旅行日期',dates(edited.date),'连续2天，共同游玩'),brief('每日窗口',`${edited.start||'待填写'}—${edited.end||'待填写'}`,'从公共集合点出发，并在当日返回'),brief('交通方式','步行＋公交地铁','不分头活动，不启用共享车辆'));
  const members=el('div',undefined,'preparation-members');edited.members.forEach((m,i)=>{const item=el('div',undefined,'preparation-member'),content=el('div');content.append(el('strong',m.name),el('p',m.preference||'需求原话待填写'));item.append(avatar(i),content);members.append(item);});list.append(members);
  root.replaceChildren(intro,list,el('p','预览内不执行格式校验或保存。正式功能待视觉方向确认后再集成。','preparation-foot'));
  renderChecks();
}
const activityData=[[
  {name:'山西博物院',caption:'历史展览',duration:'150分钟',note:'开放、预约与当日入场条件待核实。'},
  {name:'待选用餐区段',meal:true,caption:'还没有确定具体门店',note:'不把街区当作餐馆；位置、费用与时间保持未知。'},
  {name:'迎泽公园短环线',caption:'风景与休闲',duration:'45分钟',note:'可走区域、维修影响和当日开放待核实。'},
],[
  {name:'钟楼街',caption:'街区文化与拍照',duration:'45分钟',note:'通行条件与店铺营业待核实，内部步行去重未知。'},
  {name:'待选用餐区段',meal:true,caption:'还没有确定具体门店',note:'未定位、未预约，也没有锁定午餐。'},
  {name:'食品街',caption:'逛吃与美食',duration:'45分钟',note:'逛吃30～60元/人为开发估计，不替代午餐报价。'},
]];
function renderActivities(){
  $('activities').replaceChildren(...activityData[day].map((item,i)=>{
    const li=el('li',undefined,`activity${item.meal?' meal':''}`),content=el('div',undefined,'activity-content');
    content.append(el('h3',item.name));if(item.meal)content.append(el('p',item.caption,'activity-caption'));
    const metrics=el('div',undefined,'activity-metrics');if(item.duration){const duration=el('span');duration.append(el('strong',item.duration),' 停留估计');metrics.append(duration);}metrics.append(el('span',item.meal?'时间 / 地点待定':'到离时间未知'));content.append(metrics,el('p',item.note,'activity-note'));
    li.append(el('span',String(i+1),'activity-number'),content);return li;
  }));
  [0,1].forEach(i=>$(`day-${i}`).setAttribute('aria-pressed',String(i===day)));renderChecks();
}
function signal(title,text,neutral=false){const box=el('div',undefined,`review-signal${neutral?' neutral':''}`),heading=el('strong');heading.append(el('span',neutral?'i':'!','alert-icon'),title);box.append(heading,el('p',text));return box;}
function renderChecks(){
  const root=$('checks-content');
  if(mode==='edit'){
    const time=el('div',undefined,'time-review');time.append(el('h3','每日可用窗口','review-label'),el('div',`${edited.start||'待填'}—${edited.end||'待填'}`,'time-total'),el('p','这是你填写的时间限制，尚未核算交通和活动。'));
    root.replaceChildren(signal('尚未核查','本页只展示设计。输入校验、保存与恢复仍在正式页面。',true),time,el('p','下一步可切换“固定离线样例”，比较结果和核查信息的版式。','budget-note'));return;
  }
  const time=el('div',undefined,'time-review');time.append(el('h3',`第${day+1}天时间总量`,'review-label'),el('div','未知','time-total'),el('p',`已知停留估计 ${day===0?'195':'90'}分钟`),el('p','当天窗口 09:00—18:00（540分钟）'));
  const gaps=el('section',undefined,'gaps');gaps.append(el('h3','公共资料缺口'));const list=el('ul',undefined,'gap-list');
  [['道路与接驳','未查询'],['开放与预约','待核实'],['午餐门店','待选择'],['等待与内部步行','资料不足']].forEach(([name,status])=>{const li=el('li');li.append(el('span',name),el('em',status));list.append(li);});gaps.append(list);
  const people=el('section',undefined,'personal-review');people.append(el('h3','个人核查'));
  fixed.members.forEach((m,i)=>{const item=el('section',undefined,'personal-check'),top=el('div',undefined,'person-top');top.append(avatar(i),el('strong',m.name));item.append(top);
    const budget=el('p');budget.append(el('b','全程预算上限 600元'));const walking=el('p');walking.append(el('b',`第${day+1}天步行上限 6公里`));
    item.append(budget,el('p','已知费用部分 30～60元；总量未知'),walking,el('p',day===0?'内部步行估计1.8～3.5公里；总量未知':'街区去重与接驳未知，暂无总量'));people.append(item);
  });
  people.append(el('p','费用已知部分覆盖两天，仅为食品街逛吃估计；不代表门票、正餐和交通已计入。','field-hint'));
  root.replaceChildren(signal('资料不足','缺少必要资料，不能判定行程可执行。'),time,gaps,people);
}
function selectPanel(value,focus=false){
  panel=value;document.body.dataset.panel=value;
  for(const name of ['needs','plan','checks'])$(`panel-${name}`).setAttribute('aria-pressed',String(name===value));
  if(focus){const title=$(value==='needs'?'needs-title':value==='plan'?'plan-title':'checks-title');title.focus({preventScroll:true});title.scrollIntoView({block:'nearest'});}
}
function setMode(value){
  mode=value;document.body.dataset.mode=value;
  $('mode-edit').setAttribute('aria-pressed',String(mode==='edit'));$('mode-sample').setAttribute('aria-pressed',String(mode==='sample'));
  $('editable-needs').hidden=mode!=='edit';$('sample-needs').hidden=mode!=='sample';$('preparation-view').hidden=mode!=='edit';$('sample-view').hidden=mode!=='sample';
  $('plan-title').textContent=mode==='edit'?'出发前的准备单':'每日安排';$('plan-subtitle').textContent=mode==='edit'?'整理期待，再核对限制':'固定离线样例，非真实模型或地图结果';
  $('plan-badge').textContent=mode==='edit'?'需求准备':'离线样例';$('plan-badge').className=mode==='edit'?'neutral-badge':'sample-badge';
  $('needs-subtitle').textContent=mode==='edit'?'先说好，怎样一起出发':'固定三人两天样例需求';
  $('preview-notice').textContent=mode==='edit'?'仅预览布局与交互，编辑不保存；正式需求和存档不受影响。':'设计预览中的固定离线样例，与预览编辑分开；没有调用模型、道路或地图。';
  $('preview-action').textContent=mode==='edit'?'查看固定离线样例':'编辑预览需求';
  headline();renderPreparation();renderActivities();selectPanel(mode==='edit'?'needs':'plan');$('content-scroll').scrollTop=0;$('needs-scroll').scrollTop=0;
}
$('departure-date').addEventListener('input',e=>{edited.date=e.target.value;renderPreparation();});
$('departure-time').addEventListener('input',e=>{edited.start=e.target.value;renderPreparation();});
$('return-time').addEventListener('input',e=>{edited.end=e.target.value;renderPreparation();});
$('mode-edit').onclick=()=>setMode('edit');$('mode-sample').onclick=()=>setMode('sample');
$('preview-action').onclick=()=>setMode(mode==='edit'?'sample':'edit');
$('reset-preview').onclick=()=>{edited=initial();$('departure-date').value=edited.date;$('departure-time').value=edited.start;$('return-time').value=edited.end;document.querySelector('.travel-conditions').open=false;renderEditors();setMode('edit');};
for(const name of ['needs','plan','checks'])$(`panel-${name}`).onclick=()=>selectPanel(name,true);
for(const i of [0,1])$(`day-${i}`).onclick=()=>{day=i;renderActivities();};
renderEditors();renderSnapshot();setMode('edit');
