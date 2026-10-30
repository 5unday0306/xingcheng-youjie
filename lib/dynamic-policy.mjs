import {catalog} from '../data/taiyuan.mjs';
import {PlanningError,validateInput,parsePlan,scaledLimit} from './planning.mjs';
import {dynamicScopeErrors} from '../web/dynamic-scope.js';
export function assertDynamicScope(request,lock=null){validateInput(request);const errors=dynamicScopeErrors(request,lock);if(errors.length){const e=new PlanningError('DYNAMIC_SCOPE',errors[0].message);e.fields=errors;throw e;}return request;}
export function dynamicCandidates(request,picks,data=catalog()){
 return data.candidates.filter(c=>picks.points[c.id]?.confirmed&&(c.id!=='TY01'||picks.points.MUSEUM_GATE?.confirmed)).map(c=>({...c,applicability:request.days.map(d=>({date:d.date,opening:c.opening.status==='fact'&&c.opening.applicableDate===d.date?'本日期事实':'本日期未核实',ticket:c.ticketCents.applicableDate&&c.ticketCents.applicableDate!==d.date?'旧日期数值不适用':c.ticketCents.status}))}));
}
const perms=ids=>ids.length?[[],...ids.flatMap((id,i)=>perms(ids.filter((_,j)=>j!==i)).map(a=>[id,...a]))]:[[]];
const serial=plan=>JSON.stringify(plan.days.map(d=>d.items.map(a=>a.type==='meal'?'meal':a.candidateId)));
function minPlan(request,groups,positions,data){return {version:1,days:request.days.map((d,i)=>{const items=groups[i].map(id=>({type:'visit',candidateId:id,durationMinutes:data.find(c=>c.id===id).stayMinutes.value[0],reason:'候选估计范围内停留；不得借缩短停留调低步行'}));items.splice(positions[i],0,{type:'meal',reason:'保留有来源午餐，营业与等位待核实'});return {date:d.date,items};})};}
export function planPrecheck(request,plan,meals,candidates){
 const days=plan.days.map((d,i)=>{const visits=d.items.filter(a=>a.type==='visit'),cs=visits.map(a=>candidates.find(c=>c.id===a.candidateId));let budget=meals[i]?.costCentsPerPerson?.[0]??0,budgetUpper=meals[i]?.costCentsPerPerson?.[1]??0,missing=!meals[i];for(const c of cs){for(const f of [c.ticketCents,c.foodCents].filter(Boolean)){if(['fact','estimate'].includes(f.status)&&f.value&&(!f.applicableDate||f.applicableDate===d.date)){budget+=f.value[0];budgetUpper+=f.value[1];}else missing=true;}}
 const minutes=visits.reduce((n,a)=>n+a.durationMinutes,0)+(meals[i]?.durationMinutes||0),window=Number(request.days[i].end.slice(0,2))*60+Number(request.days[i].end.slice(3))-Number(request.days[i].start.slice(0,2))*60-Number(request.days[i].start.slice(3)),walk=cs.reduce((n,c)=>n+(c.internalMeters.value?.[0]||0),0),limit=Math.min(...request.members.map(m=>scaledLimit(m.walking[i],1000)));return {date:d.date,knownMinimumMinutes:minutes,window,knownInternalWalking:walk,walkingLimit:limit,knownBudgetLower:budget,knownBudgetUpper:budgetUpper,budgetUnknown:missing};});
 let violation=0;for(const d of days){violation+=Math.max(0,d.knownMinimumMinutes-d.window)*30+Math.max(0,d.knownInternalWalking-d.walkingLimit);}
 const lower=days.reduce((n,d)=>n+d.knownBudgetLower,0);for(const m of request.members)violation+=Math.max(0,days.reduce((n,d)=>n+d.knownBudgetUpper,0)-scaledLimit(m.budget,100));return {days,knownBudgetLower:lower,violation,notice:'只用于有界候选排序的已知下界，不含未知道路与费用，不是可行结论'};
}
export function generateDynamicOptions({request,rankings,meals,candidates,originalPlan=null,proposedPlan=null,maxOptions=8}){
 const ids=candidates.map(c=>c.id),all=[],seen=new Set();
 const score=plan=>{const chosen=plan.days.flatMap(d=>d.items.filter(a=>a.type==='visit').map(a=>a.candidateId)),values=request.members.map((_,i)=>chosen.reduce((n,id)=>n+(rankings.find(r=>r.candidateId===id)?.personScores[i]?.score||0),0));return Math.min(...values)*2+values.reduce((a,b)=>a+b,0)/values.length;};
 const add=plan=>{try{parsePlan(JSON.stringify(plan),request,{candidates});}catch{return;}const key=serial(plan);if(seen.has(key))return;seen.add(key);const precheck=planPrecheck(request,plan,meals,candidates);const loads=precheck.days.map(d=>d.knownMinimumMinutes/Math.max(1,d.window)+d.knownInternalWalking/Math.max(1,d.walkingLimit));const balance=Math.max(...loads)-Math.min(...loads);all.push({plan,precheck,balance,utility:score(plan),count:plan.days.reduce((n,d)=>n+d.items.length-1,0),key});};
 if(proposedPlan)add(proposedPlan);if(originalPlan&&originalPlan.days.length===request.days.length)add({...structuredClone(originalPlan),days:originalPlan.days.map((d,i)=>({...d,date:request.days[i].date}))});
 for(const order of perms(ids)){if(request.days.length===1){for(let p=0;p<=order.length;p++)add(minPlan(request,[order],[p],candidates));}else for(let split=0;split<=order.length;split++){const groups=[order.slice(0,split),order.slice(split)];for(let a=0;a<=groups[0].length;a++)for(let b=0;b<=groups[1].length;b++)add(minPlan(request,groups,[a,b],candidates));}}
 const emptyDays=o=>o.plan.days.filter(d=>!d.items.some(a=>a.type==='visit')).length;
 const compare=(a,b)=>a.precheck.violation-b.precheck.violation||emptyDays(a)-emptyDays(b)||b.utility-a.utility||a.balance-b.balance||a.key.localeCompare(b.key);
 all.sort(compare);
 const chosen=[],take=o=>{if(o&&!chosen.includes(o)&&chosen.length<maxOptions)chosen.push(o);};
 // Query a small but meaningful full-day structure before expensive large tours.
 const covered=all.filter(o=>emptyDays(o)===0),minimum=request.days.length;
 take(covered.find(o=>o.count===minimum));
 take(covered.find(o=>o.count===minimum+1));
 take(covered.find(o=>o.count===ids.length));
 const signature=o=>o.plan.days.map(d=>d.items.filter(a=>a.type==='visit').map(a=>a.candidateId).join(',')).join('|');
 const signatures=new Set(chosen.map(signature));
 for(const o of covered.filter(o=>o.count===minimum)){if(!signatures.has(signature(o))){take(o);signatures.add(signature(o));if(chosen.length>=5)break;}}
 // Retain a checked fallback, without letting it displace every touring option.
 take(all.find(o=>o.count===1));take(all.find(o=>o.count===0));
 if(proposedPlan)take(all.find(o=>o.key===serial(proposedPlan)));
 if(originalPlan&&originalPlan.days.length===request.days.length)take(all.find(o=>o.key===serial(originalPlan)));
 for(const o of all)take(o);
 return chosen.map((o,i)=>({...o,id:'proposal-'+(i+1),enumerated:all.length}));
}
export function touringQuality(plan){
 const days=plan.days.map(d=>({date:d.date,visits:d.items.filter(a=>a.type==='visit').map(a=>({id:a.candidateId,minutes:a.durationMinutes}))}));
 const emptyDays=days.filter(d=>!d.visits.length).map(d=>d.date);
 return {days,emptyDays,visitMinutes:days.reduce((n,d)=>n+d.visits.reduce((m,a)=>m+a.minutes,0),0),status:emptyDays.length?'tradeoff':'touring',notice:emptyDays.length?'当天没有游览，仅保留午餐及往返；这是取舍预览，不是推荐完成。':'已核查游览候选；估计与未知仍保留。'};
}

export function numericRisks(result){return result.review.days.flatMap((d,i)=>[...(d.time.knownSubtotal[1]>d.time.limit?[{kind:'time',dayIndex:i,excess:d.time.knownSubtotal[1]-d.time.limit}]:[]),...(d.lockCheck?.status==='conflict'?[{kind:'lock',dayIndex:i,excess:1}]:[]),...d.members.flatMap((m,j)=>m.walking.knownSubtotal[1]>m.walking.limit?[{kind:'walking',dayIndex:i,personIndex:j,excess:m.walking.knownSubtotal[1]-m.walking.limit}]:[])]).concat(result.review.members.flatMap((m,j)=>m.budget.knownSubtotal[1]>m.budget.limit?[{kind:'budget',personIndex:j,excess:m.budget.knownSubtotal[1]-m.budget.limit}]:[]));}
export function rankAssessed(items){
 return [...items].sort((a,b)=>numericRisks(a.result).length-numericRisks(b.result).length||numericRisks(a.result).reduce((n,r)=>n+r.excess,0)-numericRisks(b.result).reduce((n,r)=>n+r.excess,0)||touringQuality(a.plan).emptyDays.length-touringQuality(b.plan).emptyDays.length||b.utility-a.utility);
}
export function eligibleAssessed(items){
 const safe=rankAssessed(items).filter(o=>numericRisks(o.result).length===0);
 if(!safe.length)return rankAssessed(items);
 const missing=Math.min(...safe.map(o=>touringQuality(o.plan).emptyDays.length));
 return safe.filter(o=>touringQuality(o.plan).emptyDays.length===missing);
}
