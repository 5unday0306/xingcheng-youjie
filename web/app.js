import {dynamicScopeErrors} from './dynamic-scope.js';
import {installSdkDiagnostics} from './sdk-diagnostics.js';
installSdkDiagnostics();
import {
  defaultDraft, toRequest, fromRequest, validateRequest, dateAt, BUDGET, GAPS,
  save, restore, STORAGE_KEY, CITY_CONFIG,
} from './core.js';
import {createPlanPanel} from './planning.js';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
};
let draft = defaultDraft();
let savedSignature = null;
let corrupt = false;
let validationStarted = false;
let activeDay = 0;
let currentDisplay = 'route';
let planPanel=null;
let focusRevision=0;
const signature = () => JSON.stringify(toRequest(draft));

function storageStatus(text, kind = '') {
  $('storageStatus').textContent = text;
  $('storageStatus').dataset.kind = kind;
}
function updateDirty() {
  if (savedSignature === signature()) storageStatus('当前需求与上次保存一致', 'saved');
  else storageStatus('有未保存修改，刷新不会保留本次修改', 'dirty');
}
let routeReturnHash='#routeView';
function showView(view, focus = false, updateHash = true) {
  if(view==='summary')view='route';
  if(['#replan08','#routeView'].includes(location.hash))routeReturnHash=location.hash;
  const focusId=++focusRevision;
  const editor=$('editDialog');
  if(view==='edit'&&!editor.open)editor.showModal();
  if(view!=='edit'&&editor.open)editor.close();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) $(view==='edit'?'editDialog':'displayScroll').animate([{opacity:.45,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220});
  if (view !== 'edit') currentDisplay = view;
  $('workbench').dataset.view = view;
  $('routeView').hidden = currentDisplay !== 'route';
  $('summaryView').hidden = currentDisplay !== 'summary';
  for (const [id, target] of [['navEdit','edit'],['navRoute','route']]) {
    $(id).setAttribute('aria-pressed', String(view === target));
  }
  $('tabRoute').setAttribute('aria-pressed', String(currentDisplay === 'route'));

  if(updateHash)history.replaceState(null,'',view==='edit'?'#edit':view==='summary'?'#summaryView':routeReturnHash);
  $('navReplan').setAttribute('aria-pressed',String(location.hash==='#replan08'&&view==='route'));if(location.hash==='#replan08'&&view==='route')$('navRoute').setAttribute('aria-pressed','false');
  if (focus) {
    const title = $(view === 'edit' ? 'editorTitle' : view === 'summary' ? 'summaryTitle' : 'routeTitle');
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(focusId!==focusRevision||document.activeElement!==title)return;
      if(view!=='edit')$('displayScroll').scrollTop=0;
      title.focus({preventScroll:true});title.scrollIntoView({block:'nearest'});
    }));
  }
}
function confirmAction({ title, text, accept, cancel = '取消' }) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('acceptChange').textContent = accept;
  $('cancelChange').textContent = cancel;
  const dialog = $('confirmDialog');
  // Resolve from the actual action, not a later close event. A queued close
  // event from an earlier dialog must never settle a newly opened dialog.
  const result = new Promise(resolve => {
    const finish = accepted => {
      dialog.oncancel = null;
      dialog.close(accepted ? 'accept' : 'cancel');
      resolve(accepted);
    };
    $('acceptChange').onclick = () => finish(true);
    $('cancelChange').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
  dialog.showModal();
  return result;
}
function errorTarget(field) {
  const p = field.split('.');
  if (p[0] === 'members' && p.length > 2) {
    if (p[2] === 'walking') return `member-${p[1]}-walk-${p[3] || 0}`;
    return `member-${p[1]}-${p[2]}`;
  }
  if (p[0] === 'days') {
    if (p[2] === 'date') return 'startDate';
    const start = draft.days[Number(p[1])]?.start;
    return `day-${p[1]}-${/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start || '') ? 'end' : 'start'}`;
  }
  return {city:'city', people:'people', members:'people', days:'dayCount'}[field] || 'startDate';
}
function fieldLabel(path) {
  const p = path.split('.');
  if (p[0] === 'members') {
    const labels = {name:'显示名', preference:'偏好', budget:'个人预算', walking:'步行上限', id:'成员标识'};
    return `同行者${Number(p[1]) + 1}的${labels[p[2]] || '资料'}${p[3] !== undefined ? `（第${Number(p[3]) + 1}天）` : ''}`;
  }
  if (p[0] === 'days' && p.length > 1) return `第${Number(p[1]) + 1}天时段或日期`;
  return {city:'城市', people:'人数', members:'同行者人数', days:'天数'}[path] || '需求';
}
function focusField(id) {
  showView('edit');
  const target = $(id);
  if (!target) return;
  const card = target.closest('details');
  if (card) card.open = true;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center' });
}
function paintErrors(errors) {
  document.querySelectorAll('[aria-invalid]').forEach(input => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  });
  document.querySelectorAll('.fieldError').forEach(e => e.remove());
  $('errors').replaceChildren();
  if (!errors.length) return;
  const list = node('ul');
  errors.forEach((error, i) => {
    const targetId = errorTarget(error.field);
    const item = node('li');
    const link = node('a', `${fieldLabel(error.field)}：${error.message}`);
    link.href = `#${targetId}`;
    link.onclick = event => { event.preventDefault(); focusField(targetId); };
    item.append(link);
    list.append(item);
    const input = $(targetId);
    if (input) {
      const msg = node('span', error.message, 'fieldError');
      msg.id = `error-${i}`;
      input.parentElement.append(msg);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'),msg.id].filter(Boolean).join(' '));
      const card = input.closest('details');
      if (card) card.open = true;
    }
  });
  $('errors').append(node('strong', `还有${errors.length}项输入需要调整`), list);
}
function edited() {
  planPanel?.invalidate();
  $('checkStatus').textContent = '输入已修改，请重新检查';
  $('summaryValidation').textContent='当前编辑需求尚未重新检查；旧方案与预览不代表本次输入。';
  $('summary').replaceChildren(node('p', '当前需求尚未重新检查。回到编辑区检查后，再核对完整摘要。', 'summaryEmpty'));
  updateDirty();
  paintRoute();
  if (validationStarted) paintErrors(validateRequest(toRequest(draft)));
}
function field(label, value, type, update, id) {
  const box = node('label', label);
  const input = node(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  if (type === 'number') { input.min = '0'; input.step = 'any'; }
  input.id = id;
  input.value = value;
  input.addEventListener('input', () => { update(input.value); edited(); });
  box.append(input);
  return box;
}
function avatar(index) {
  const badge = node('span', String(index + 1), 'avatar');
  badge.setAttribute('aria-hidden', 'true');
  badge.dataset.person = String(index % 3);
  return badge;
}
function walkingTags(m, selected = false) {
  const tags = node('div', undefined, 'walkingTags');
  m.walking.forEach((value, day) => {
    const tag = node('span', `第${day + 1}天 ${value || '待填'}公里`);
    if (selected && day === activeDay) tag.className = 'selectedDay';
    tags.append(tag);
  });
  return tags;
}
function memberHeadline(m, summary) {
  const text = node('span', undefined, 'memberHeadlineText');
  text.append(node('strong', m.name || '匿名同行者'), node('span', m.preference || '尚未填写个人需求', 'memberPreference'),
    node('span', `个人全程 ${m.budget || '待填'}元`, 'memberBudget'), walkingTags(m));
  summary.replaceChildren(avatar(draft.members.indexOf(m)), text);
}
function paintCompanions() {
  $('companionCount').textContent = `${draft.members.length}位同行者`;
  $('companionOverview').replaceChildren(...draft.members.map((m, i) => {
    const card = node('article', undefined, 'companionCard');
    const head = node('div', undefined, 'companionHeading');
    head.append(avatar(i), node('h4', m.name || '匿名同行者'));
    const quote = node('p', m.preference || '还没有填写需求', 'companionQuote');
    const editButton = node('button', '编辑', 'textAction');
    editButton.type = 'button';
    editButton.setAttribute('aria-label', `编辑${m.name || `同行者${i + 1}`}的需求`);
    editButton.onclick = () => focusField(`member-${i}-preference`);
    head.append(editButton);
    card.append(head, quote, node('p', `个人全程 ${m.budget || '待填'}元`, 'companionBudget'), walkingTags(m, true));
    return card;
  }));
}
function renderDays() {
  $('days').replaceChildren(...draft.days.map((day, i) => {
    const row = node('div', undefined, 'dayRow');
    row.append(node('strong',`第${i + 1}天　${dateAt(draft.startDate,i) || '日期待填写'}`),
      field('出发',day.start,'time',v => day.start=v,`day-${i}-start`),
      field('返回',day.end,'time',v => day.end=v,`day-${i}-end`));
    return row;
  }));
}
function renderMembers() {
  const openIds = new Set([...document.querySelectorAll('.member[open]')].map(e => e.dataset.id));
  const firstRender = !$('members').children.length;
  $('members').replaceChildren(...draft.members.map((m, i) => {
    const card = node('details', undefined, 'member');
    card.dataset.id = m.id;
    card.open = openIds.has(m.id) || (firstRender && i === 0);
    const summary = node('summary');
    memberHeadline(m, summary);
    const body = node('div',undefined,'memberBody');
    const grid = node('div',undefined,'grid');
    grid.append(field('匿名显示名',m.name,'text',v => {m.name=v;memberHeadline(m,summary);},`member-${i}-name`),
      field('个人全程预算（元）',m.budget,'number',v => {m.budget=v;memberHeadline(m,summary);},`member-${i}-budget`));
    body.append(node('h4','基本信息','fieldGroupTitle'), grid, node('h4','兴趣与需求','fieldGroupTitle'), field('兴趣与需求原话',m.preference,'textarea',v => {m.preference=v;memberHeadline(m,summary);},`member-${i}-preference`));
    const walk = node('div',undefined,'grid');
    m.walking.forEach((v,j) => walk.append(field(`第${j+1}天步行上限（公里）`,v,'number',x => {m.walking[j]=x;memberHeadline(m,summary);},`member-${i}-walk-${j}`)));
    body.append(node('h4','每天步行限制','fieldGroupTitle'), walk);
    if (draft.dayCount > 1) {
      const copy = node('button','将本人第1天步行上限应用到其余天','copyWalking');
      copy.type = 'button';
      copy.onclick = async () => {
        const first = m.walking[0];
        if (!/^\d+(?:\.\d+)?$/.test(first.trim()) || !Number.isFinite(Number(first))) {
          validationStarted = true;
          paintErrors(validateRequest(toRequest(draft)));
          focusField(`member-${i}-walk-0`);
          return;
        }
        if (m.walking.slice(1).some(v => v !== first)) {
          const confirmed = await confirmAction({title:'覆盖本人的其余天步行上限？',
            text:`${m.name}的其余天将改为${first}公里。原值为${m.walking.slice(1).join('、')}公里，不影响其他同行者。`,accept:'确认应用',cancel:'保留原值'});
          if (!confirmed) return;
        }
        m.walking = m.walking.map(() => first);
        renderMembers();
        edited();
      };
      body.append(copy);
    }
    body.append(node('p','步行包含交通接驳与场馆内部步行；这是上限，不是实际距离。','hint'));
    const dev = node('details',undefined,'developerDetails');
    dev.append(node('summary','开发详情'),node('code',`稳定ID：${m.id}`));
    if(new URLSearchParams(location.search).get('developer')==='1')body.append(dev);
    card.append(summary,body);
    return card;
  }));
  $('memberCount').textContent = `${draft.members.length}位同行者`;
}
function render() {
  $('adjustableGoals').checked=draft.adjustableGoals===true;
  for (const k of ['city','people','startDate','dayCount']) $(k).value = draft[k];
  renderDays();
  renderMembers();
  paintRoute();
}
function paintRoute() {
  activeDay = Math.min(activeDay,draft.dayCount - 1);
  const city = CITY_CONFIG[draft.city];
  $('destinationName').textContent = city?.name || '目的地待确认';
  $('pilotStamp').textContent = city?.pilot || '暂不支持';
  $('pilotTag').textContent = city ? `${city.name}试点` : '目的地待确认';
  document.querySelectorAll('[data-city-art]').forEach(art => { art.hidden = art.dataset.cityArt !== city?.illustration; });
  const first = dateAt(draft.startDate, 0), last = dateAt(draft.startDate, draft.dayCount - 1);
  $('tripDates').textContent = first ? (draft.dayCount === 1 ? first : `${first} — ${last}`) : '出发日期待填写';
  $('tripOverview').textContent = `${draft.people}位同行者 / ${draft.dayCount}天共同游玩`;
  $('ticketDate').textContent=first?first.slice(5).replace('-','.'):'待填写';
  $('ticketDays').textContent=`出发 · 连续${draft.dayCount}天`;
  $('ticketParty').textContent=`${draft.people}人 / ${draft.dayCount}天`;
  paintCompanions();
  planPanel?.selectDay(activeDay);
  $('dayTabs').replaceChildren(...draft.days.map((day,i) => {
    const button = node('button',`第${i+1}天　${dateAt(draft.startDate,i) || '日期待填'}`);
    button.type = 'button';
    button.setAttribute('aria-pressed',String(i === activeDay));
    button.onclick = () => {activeDay=i;paintRoute();$('dayTabs').children[i].focus();};
    return button;
  }));
  const day = draft.days[activeDay];
  $('activeDayTitle').textContent = `第${activeDay+1}天的出行条件`;
  const endpoint = toRequest(draft).endpoint;
  $('activeDay').replaceChildren(node('p',dateAt(draft.startDate,activeDay) || '日期待填写','dayDate'),
    node('p',`${day.start || '待填'}～${day.end || '待填'}（含往返交通）`),
    node('p',endpoint.name,'meetingPoint'), node('small','公共测试集合点；位置来源与适用范围见依据。','hint'));
}
function summaryContent(r) {
  const intro = node('section', undefined, 'summaryTrip');
  intro.append(node('h4', `${CITY_CONFIG[r.city]?.fullName || '目的地'} · ${r.people}人 · ${r.days.length}天`));
  const schedule = node('div', undefined, 'summarySchedule');
  r.days.forEach(day => schedule.append(node('p', `${day.date}　${day.start}～${day.end}（含出发与返回交通）`)));
  intro.append(schedule, node('p', `每天往返：${r.endpoint.name}`), node('p', `${r.endpoint.address}；公共测试点；采用位置与确认来源见方案依据。`, 'hint'));
  const scope = node('details', undefined, 'budgetDetails');
  scope.append(node('summary', '查看预算包含与排除范围'), node('p', BUDGET, 'hint'));
  intro.append(scope);
  const members = node('div', undefined, 'summaryMembers');
  r.members.forEach((m, index) => {
    const section = node('section', undefined, 'summaryMember');
    const content = node('div');
    content.append(node('h4', m.name), node('p', `需求原话：${m.preference}`, 'originalWords'), node('p', `个人全程预算上限：${m.budget}元`));
    r.days.forEach((d, j) => content.append(node('p', `${d.date}：${r.adjustableGoals?'步行目标（允许调整）':'总步行上限'}${m.walking[j]}公里`, 'summaryWalking')));
    section.append(avatar(index), content);
    members.append(section);
  });
  const dev = node('details', undefined, 'developerDetails');
  dev.append(node('summary', '开发详情：结构化需求与稳定ID'), node('pre', JSON.stringify(r, null, 2)));
  $('summary').replaceChildren(intro, members);if(new URLSearchParams(location.search).get('developer')==='1')$('devRecords').append(dev);
}
let planningConfirmation=null,startingPlanning=false;
async function requestPlanningConfirmation(){
  if(planningConfirmation||startingPlanning)return;
  const context=planPanel?.confirmationContext();
  if(!context?.ready){$('checkStatus').textContent='正在读取规划能力，请稍后再试';return;}
  if(context.busy)return;
  if(!check({navigate:false,extraErrors:context.dynamic?dynamicScopeErrors(toRequest(draft),context.lock):[]}))return;
  const captured=signature(),request=toRequest(draft),wasEditing=$('editDialog').open;
  const dialog=node('dialog',undefined,'planningConfirmation');dialog.id='planningConfirmation';dialog.setAttribute('aria-labelledby','planningConfirmationTitle');
  dialog.append(node('h2','确认本次旅行条件','confirmationTitle'));dialog.firstChild.id='planningConfirmationTitle';
  dialog.append(node('p',`${CITY_CONFIG[request.city]?.fullName} · ${request.people}人 · ${request.days.length}天`));
  for(const day of request.days)dialog.append(node('p',`${day.date}　${day.start}～${day.end}`));
  for(const member of request.members){const row=node('section',undefined,'confirmationMember');row.append(node('strong',member.name),node('p',`个人全程预算 ${member.budget}元；`+member.walking.map((v,i)=>`第${i+1}天${v}公里`).join('、')));dialog.append(row);}
  dialog.append(node('p',context.lock?`锁定：${context.lock.date} ${context.lock.start}～${context.lock.end} ${context.lock.name}（计划，非预约保证）`:'锁定安排：无'));
  dialog.append(node('p',request.adjustableGoals?'允许建议调整时段与步行目标；采用前显示增量，预算与锁定保持。':'每日时段与步行上限严格限制，不自动放宽。'));
  const words=node('details');words.append(node('summary','查看个人偏好原话'));for(const m of request.members)words.append(node('p',m.name+'：'+m.preference));dialog.append(words);
  dialog.append(node('p',context.offline?'离线演练使用替身，不代表真实地图或接口结果。':'开始后运行真实规划；资料不足与冲突会保留，结果需你决定是否采用。','hint'));
  const actions=node('div',undefined,'dialogActions'),back=node('button','返回修改'),start=node('button',context.offline?'运行离线演练':'开始规划','primary');back.type=start.type='button';back.id='planningBack';start.id='planningStart';actions.append(back,start);dialog.append(actions);
  planningConfirmation=dialog;document.body.append(dialog);
  const close=()=>{planningConfirmation=null;dialog.close();dialog.remove();};
  back.onclick=()=>{close();showView('edit',true);};
  dialog.oncancel=e=>{e.preventDefault();close();if(wasEditing)showView('edit',true);};
  start.onclick=async()=>{
    if(startingPlanning)return;
    if(captured!==signature()){close();$('checkStatus').textContent='需求已变化，请重新确认';showView('edit',true);return;}
    startingPlanning=true;start.disabled=true;back.disabled=true;close();
    showView('route',true);
    try{await planPanel.startConfirmedPlanning();}finally{startingPlanning=false;}
  };
  dialog.showModal();
}
function check({navigate=true,extraErrors=[]} = {}) {
  validationStarted = true;
  const r = toRequest(draft), errors = [...validateRequest(r),...extraErrors];
  paintErrors(errors);
  if (errors.length) {
    $('checkStatus').textContent = '输入检查未通过';
    $('summaryValidation').textContent='当前需求检查未通过，请修正输入；不是行程核查结果。';
    $('summary').replaceChildren(node('p','输入仍有错误，请返回编辑区修正。','summaryEmpty'));
    focusField(errorTarget(errors[0].field));
    return false;
  }
  $('checkStatus').textContent = '输入检查通过 · 仅结构与格式';
  $('summaryValidation').textContent='当前需求格式已检查；方案须单独核查，旅行可行性未验证。';
  summaryContent(r);
  // Validation never navigates or starts a business request.
  return true;
}
function restoreDraft(auto=false) {
  try {
    const data = restore(localStorage);
    if (!data) {
      storageStatus(auto ? '固定测试需求，尚未保存' : '没有找到存档，当前输入未改变');
      return;
    }
    draft = data;
    planPanel?.invalidate();
    savedSignature = signature();
    corrupt = false;
    validationStarted = false;
    $('replace').hidden = true;
    render();
    paintErrors([]);
    $('checkStatus').textContent = '已恢复需求，请重新检查';
    $('summaryValidation').textContent='已恢复编辑需求，尚未重新检查；不代表当前方案已满足。';
    $('summary').replaceChildren(node('p','已恢复上次保存，请重新检查后查看摘要。','summaryEmpty'));
    storageStatus('已恢复上次保存，尚未重新检查','saved');
  } catch (error) {
    corrupt = true;
    savedSignature = null;
    $('replace').hidden = false;
    storageStatus(`恢复失败：${error.message} 当前输入和原存档均保留。`,'error');
  }
}
function saveDraft(replaceInvalid=false) {
  if (!check({navigate:false})) {
    storageStatus('保存失败：请先修正输入，旧存档未改变','error');
    return;
  }
  try {
    save(localStorage,draft,{replaceInvalid});
    savedSignature = signature();
    corrupt = false;
    $('replace').hidden = true;
    storageStatus(`已保存需求（${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}），可在本浏览器恢复`,'saved');
  } catch (error) {
    // A damaged archive may have appeared since the page was opened.
    try { restore(localStorage); } catch { corrupt=true; }
    if (corrupt) savedSignature = null;
    $('replace').hidden = !corrupt;
    storageStatus(`保存失败：${error.message} 当前输入保留。`,'error');
  }
}

for (const [id,city] of Object.entries(CITY_CONFIG)) $('city').append(new Option(`${city.fullName} · 可测试`,id));
for (let i=1;i<=6;i++) $('people').append(new Option(`${i}人`,i));
for (let i=1;i<=3;i++) $('dayCount').append(new Option(`${i}天`,i));
$('city').onchange = () => {draft.city=$('city').value;edited();};
$('adjustableGoals').onchange=()=>{draft.adjustableGoals=$('adjustableGoals').checked;edited();};
$('startDate').oninput = () => {draft.startDate=$('startDate').value;renderDays();edited();};
$('people').onchange = async () => {
  const n=Number($('people').value);
  if (n<draft.people && !await confirmAction({title:'减少同行人数？',text:`将移除末尾${draft.people-n}位同行者的需求和限制。上次保存不会自动改变。`,accept:'确认减少',cancel:'保留原人数'})) {
    $('people').value=draft.people;return;
  }
  draft.members=draft.members.slice(0,n);
  while(draft.members.length<n) draft.members.push({id:crypto.randomUUID(),name:`同行者${draft.members.length+1}`,preference:'',budget:'600',walking:Array(draft.dayCount).fill('6')});
  draft.people=n;render();edited();
};
$('dayCount').onchange = async () => {
  const n=Number($('dayCount').value);
  if (n<draft.dayCount && !await confirmAction({title:'减少游玩天数？',text:'将移除末尾日期的时段和步行设置。个人全程预算保留，请自行按新天数核对。',accept:'确认减少',cancel:'保留原天数'})) {
    $('dayCount').value=draft.dayCount;return;
  }
  draft.days=draft.days.slice(0,n);
  while(draft.days.length<n) draft.days.push({start:'09:00',end:'18:00'});
  draft.members.forEach(m=>{m.walking=m.walking.slice(0,n);while(m.walking.length<n)m.walking.push('6');});
  draft.dayCount=n;render();edited();
};
$('brand').onclick = () => showView('edit',true);
$('jumpMembers').onclick = () => { $('membersTitle').focus({preventScroll:true}); $('membersTitle').scrollIntoView({block:'start'}); };
$('quickCheck').onclick = () => requestPlanningConfirmation();
$('form').onsubmit = event => {event.preventDefault();requestPlanningConfirmation();};
$('save').onclick = () => saveDraft();
$('restore').onclick = async () => {
  if (await confirmAction({title:'恢复上次保存的需求？',text:'将替换当前未保存输入。取消或按Esc保留当前内容。',accept:'确认恢复',cancel:'保留当前输入'})) restoreDraft();
};
$('replace').onclick = async () => {
  if (await confirmAction({title:'覆盖无法恢复的旧存档？',text:'旧存档将被当前有效需求替换，无法由本页面找回。确认后仍会先检查输入。',accept:'确认覆盖',cancel:'保留旧存档'})) saveDraft(true);
};
for(const [id,view] of [['navEdit','edit'],['navRoute','route'],['tabRoute','route'],['backEdit','edit']]) $(id).onclick=()=>showView(view,true);
$('budgetScope').textContent=BUDGET;
$('gaps').replaceChildren(...GAPS.map(text=>node('li',text)));
$('summary').append(node('p','先在编辑区检查需求，再查看逐人摘要。','summaryEmpty'));
render();
restoreDraft(true);
showView('route',false,false);
$('editTrip').onclick=()=>showView('edit',true);
$('closeEditor').onclick=()=>{showView(currentDisplay);$('editTrip').focus();};
$('editDialog').addEventListener('cancel',event=>{event.preventDefault();showView(currentDisplay);$('editTrip').focus();});
planPanel=createPlanPanel({confirmPlanning:requestPlanningConfirmation,getRequest:()=>toRequest(draft),validate:()=>check({navigate:false}),validateDynamic:lock=>check({navigate:false,extraErrors:dynamicScopeErrors(toRequest(draft),lock)}),applyRequest:async request=>{const next=fromRequest(request);save(localStorage,next);draft=next;savedSignature=signature();render();check({navigate:false});updateDirty();}});

function routeHash(){
 const hash=location.hash;
 if(hash==='#edit'){showView('edit',false,false);return;}
 if(hash==='#summaryView'){history.replaceState(null,'','#routeView');showView('route',false,false);return;}
 showView('route',false,false);
 const target=document.getElementById(hash==='#replan08'?'experienceWorkspace':hash.slice(1));
 if(target){for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target.scrollIntoView({block:'start'});}
 if(hash==='#replan08'){document.dispatchEvent(new CustomEvent('workspace:mode',{detail:'replan'}));$('navRoute').setAttribute('aria-pressed','false');$('navReplan').setAttribute('aria-pressed','true');}
}
$('navRoute').onclick=()=>{routeReturnHash='#routeView';if(location.hash==='#replan08')history.replaceState(null,'','#routeView');showView('route',true);document.dispatchEvent(new CustomEvent('workspace:mode',{detail:'review'}));};
$('navReplan').onclick=()=>{history.pushState(null,'','#replan08');routeHash();};
window.addEventListener('hashchange',routeHash);
document.addEventListener('workspace:ready',routeHash);
routeHash();
