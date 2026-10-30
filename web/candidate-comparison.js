import {modelNarrative,formatMoney} from './agent-products.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const range=(v,scale=1)=>!Array.isArray(v)?'未知':v.map(x=>+(x/scale).toFixed(2)).filter((x,i,a)=>!i||x!==a[0]).join('～');
export function renderCandidateComparison({state,names,onSelect,onLocate}){
 const root=el('section',undefined,'candidateComparison');root.setAttribute('aria-label','多人协商方案对比');root.append(el('h3','一起比较，选择更合适的安排'));
 root.append(el('p',state.comparisonNotice||'仅比较本轮已取得道路并完成核查的候选。'));
 const cards=el('div',undefined,'candidateGrid');
 for(const [i,c] of (state.comparisonCandidates||[]).entries()){
  const r=c.result,selected=c.id===state.selectedCandidateId,card=el('article',undefined,'candidateCard');card.dataset.candidateIndex=i;card.dataset.selected=String(selected);
  card.append(el('h4',`方案${i+1}${c.id===state.recommendedCandidateId?' · 规划建议':''}`),el('p',r.readiness.canAccept?'可供明确采用':'可查看，暂不能采用','candidateGate'));
  for(const [j,d] of r.review.days.entries()){
   const day=el('section');day.append(el('strong',`第${j+1}天 · ${d.date}`));
   const activities=c.plan.days[j].items.map(a=>a.type==='meal'?d.activities.find(x=>x.pointId==='LUNCH'+(j+1))?.name||'已选午餐':names.name(a.candidateId));
   day.append(el('p',activities.join(' → ')));
   if(!c.plan.days[j].items.some(a=>a.type==='visit'))day.append(el('strong','本日没有游览：仅保留午餐与往返，需明确接受取舍','candidateWarning'));
   const modes=[...new Set(d.legs.map(l=>l.mode==='walk'?'步行':'公交地铁'))];day.append(el('p',modes.join('＋')+' · 已计入'+range(d.time.knownSubtotal)+'分钟'));
   const groups=new Map();d.members.forEach(m=>{const key=JSON.stringify([m.walking.knownSubtotal,m.walking.limit,m.walking.status]);if(!groups.has(key))groups.set(key,{m,people:[]});groups.get(key).people.push(m.name||names.name(m.id));});
   for(const {m,people} of groups.values())day.append(el('p',people.join('、')+'：步行'+range(m.walking.knownSubtotal,1000)+'公里 / '+(state.requestSnapshot.adjustableGoals?'原目标':'上限')+m.walking.limit/1000+'公里'));
   if(d.lockCheck)day.append(el('p','锁定午餐 '+d.lockCheck.start+'～'+d.lockCheck.end+' · '+(d.lockCheck.status==='conflict'?'有迟到风险':'计划保持')));
   const locate=el('button','在地图查看第'+(j+1)+'天');locate.type='button';locate.onclick=()=>onLocate(c,j);day.append(locate);card.append(day);
  }
  const details=el('details');details.append(el('summary','逐人影响、费用与取舍'));
  for(const [j,p] of (r.coverage||[]).entries()){
   const b=r.review.members[j]?.budget;details.append(el('p',p.name+' · 模型偏好覆盖 '+p.score+'/5（非满意度）'+(p.overlooked?' · 有高匹配候选未覆盖':'')));
   if(b)details.append(el('p','全程已计入 '+[...new Set(b.knownSubtotal.map(formatMoney))].join('～')+' / 预算'+formatMoney(b.limit)+(b.missing.length?' · '+b.missing.length+'项未计费用（见依据）':'')));
   for(const x of p.covered)details.append(el('p',names.name(x.candidateId)+'：'+names.clean(modelNarrative(x.reason))));
   if(p.missed.length)details.append(el('p','本案未选的高匹配项：'+p.missed.map(x=>names.name(x.candidateId)).join('、')));
  }
  details.append(el('p','审查：'+names.clean(modelNarrative(r.negotiationAudit.reason))));
  for(const a of r.adjustments||[])details.append(el('p',`${a.date} ${a.personName}：原目标${a.originalTarget}${a.unit} → 已计入${range(a.estimatedRange)}${a.unit}，增加${a.excess}${a.unit}`));
  for(const issue of r.readiness.issues)details.append(el('p',names.clean(issue)));
  const sources=el('details');sources.append(el('summary','依据与待核实'));
  const times=[...new Set(r.review.days.flatMap(d=>d.legs).map(l=>l.queriedAt).filter(Boolean))];sources.append(el('p','同一轮共享有效道路缓存；各道路取得时间：'+(times.join('、')||'未提供')));
  const gaps=new Set(r.review.days.flatMap(d=>[...d.time.missing,...d.members.flatMap(m=>m.walking.missing)]).concat(r.review.members.flatMap(m=>m.budget.missing)));const list=el('ul');for(const gap of gaps)list.append(el('li',gap));sources.append(list);details.append(sources);card.append(details);
  const button=el('button',selected?'正在查看此方案':'查看方案'+(i+1));button.type='button';button.dataset.selectCandidate=c.id;button.setAttribute('aria-pressed',String(selected));button.onclick=()=>onSelect(c.id);card.append(button);cards.append(card);
 }
 root.append(cards,el('p','查看或切换不改变已采用方案；只有明确接受才会替换。'));return root;
}
