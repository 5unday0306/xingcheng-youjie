import {createHash} from 'node:crypto';
import {PlanningError,parsePlan,validateInput} from './planning.mjs';
import {case06RequestHash} from './case06-draft.mjs';
import {queryCase06,case06Chains} from './case06-routes.mjs';
import {catalog} from '../data/taiyuan.mjs';
const clone=x=>structuredClone(x),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=m=>{throw new PlanningError('LOCK_INVALID',m);};
export const clockMinute=s=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
export function createMealLock({request,meals,points,start,end,confirmed,dayIndex=1}){
 validateInput(request);if(confirmed!==true||![0,1].includes(dayIndex)||!request.days[dayIndex]||!meals[dayIndex]||!points['LUNCH'+(dayIndex+1)]?.confirmed)fail('请明确确认本日已选餐厅与计划时刻');
 const a=clockMinute(start),b=clockMinute(end),day=request.days[dayIndex],meal=meals[dayIndex],pointId='LUNCH'+(dayIndex+1);if(a===null||b===null||b<=a||a<clockMinute(day.start)||b>clockMinute(day.end)||b-a!==meal.durationMinutes)fail('锁定时刻须在本日旅行窗口内，并与已确认午餐时长一致');
 return {version:1,activityId:`meal:${day.date}:${pointId}`,date:day.date,pointId,poiId:meal.candidate.id,pointHash:hash(points[pointId].location),name:meal.candidate.name,start,end,confirmed:true,notice:'用户确认的计划锁定；非预约、营业或保证到达'};
}
export function assertLock(lock,request,picks,meals){
 const expected=createMealLock({request,points:picks.points,meals,start:lock?.start,end:lock?.end,confirmed:lock?.confirmed,dayIndex:request.days.findIndex(d=>d.date===lock?.date)});
 if(JSON.stringify(expected)!==JSON.stringify(lock))fail('锁定地点、活动ID或日期已改变，请显式重新确认');
 return expected;
}
export function day2FourKm(request){const r=clone(validateInput(request));if(r.days.length!==2)fail('本轮重排仅适用两天案例');r.members.forEach(m=>m.walking[1]=4);return r;}
export function orderOptions(plan){
 const one=clone(plan),two=clone(plan),three=clone(plan);two.days[1].items.reverse();three.days[1].items=three.days[1].items.filter(x=>x.candidateId!=='TY06');
 return [{id:'option-1',label:'保留两街区顺序，比较少步行接驳',plan:one,tradeoff:'保持全部活动，不保证4公里达标'},
 {id:'option-2',label:'调换两街区顺序，午餐地点及时刻保持',plan:two,tradeoff:'改变未锁定活动顺序，仅作预览，需用户接受'},
 {id:'option-3',label:'取消第2天食品街，保留钟楼街与锁定午餐',plan:three,tradeoff:'损失美食街游览偏好，属于关键取舍；仅作预览，用户明确接受才采用'}]
 .map(o=>({...o,routeIds:case06Chains(o.plan,{allowReorderDay2:true}).filter(g=>g.dayIndex===1).flatMap(g=>g.pairs.map(p=>`${p.from}>${p.to}`))}));
}
export function applyLockedSchedule(completed,request,lock){
 const dayIndex=request.days.findIndex(d=>d.date===lock.date);if(dayIndex<0)fail('锁定日期不在当前需求');const r=clone(completed),d=r.review.days[dayIndex],start=clockMinute(request.days[dayIndex].start),end=clockMinute(request.days[dayIndex].end);let cursor=[start,start],unknown=false,lockSeen=false,conditionalWait=[0,0],lockStatus='within_estimate';
 const data=catalog();
 d.activities.forEach((a,i)=>{
  if(i>0){const leg=d.legs[i-1];if(leg?.status==='available'&&leg.minutes)cursor=cursor.map((v,j)=>v+leg.minutes[j]);else unknown=true;}
  const t=d.timeline[i];t.earliestKnownArrival=cursor[0];t.arrivalMinute=null;t.arrivalEstimate=unknown?null:clone(cursor);t.notice='当前道路预测和停留估计的条件性时序；未知等待会传播，不保证未来到达';
  if(a.pointId===lock.pointId){
   lockSeen=true;const target=clockMinute(lock.start),finish=clockMinute(lock.end);a.locked=true;a.name=`${lock.name}（锁定${lock.start}～${lock.end}）`;t.name=a.name;t.lock=clone(lock);t.scheduledStart=lock.start;t.scheduledEnd=lock.end;
   conditionalWait=cursor.map(v=>Math.max(0,target-v)).reverse();
   lockStatus=cursor[0]>target?'conflict':cursor[1]>target?'uncertain':unknown?'insufficient':'within_estimate';
   d.lockCheck={...clone(lock),status:lockStatus,earliestKnownArrival:cursor[0],arrivalEstimate:unknown?null:clone(cursor),conditionalWaitMinutes:conditionalWait,unknownBeforeLock:unknown,notice:'等待值仅基于已计入预测/估计；额外未知会减少等待或导致迟到，不能与未知排队简单叠加成保证'};
   cursor=[Math.max(cursor[0],target)+finish-target,Math.max(cursor[1],target)+finish-target];unknown=unknown||d.time.missing.length>0;
  }else if(t?.type==='visit'){
   const c=data.candidates.find(c=>c.id===a.pointId),minutes=t.durationMinutes||0;
   if(c?.opening.status==='fact'&&c.opening.applicableDate===d.date){if(Math.max(cursor[0],c.opening.value[0])+minutes>c.opening.value[1]){lockStatus='conflict';d.messages.push(`${c.name}违反已知开放窗口`);}cursor=cursor.map(v=>Math.max(v,c.opening.value[0]));}
   cursor=cursor.map(v=>v+minutes);if(c?.waitingMinutes.status!=='fact')unknown=true;
  }
 });
 if(!lockSeen)fail('重排没有保留已锁定午餐');
 // A fixed meal anchor creates a conditional waiting allowance, not an invented
 // known queue. Anchor-derived lower/upper finish bounds are checked separately.
 d.time.knownSubtotal=cursor.map(v=>v-start);d.time.value=d.time.missing.length?null:clone(d.time.knownSubtotal);
 if(lockStatus==='conflict'||cursor[0]>end)d.time.status='conflict';else if(d.time.missing.length||unknown)d.time.status='insufficient';else if(cursor[1]>end)d.time.status='uncertain';else d.time.status='within_estimate';
 d.messages.push(`锁定午餐${lock.start}～${lock.end}，条件性等待${conditionalWait.join('～')}分钟；未知排队/营业未消除。`);
 if(d.lockCheck.status==='conflict')d.messages.push('按已知预测/估计下限也无法在锁定开始前到达，锁定冲突，未自动移时或解锁');
 r.review.status=r.review.days.some(d=>d.time.status==='conflict'||d.members.some(m=>m.walking.status==='conflict'))||r.review.members.some(m=>m.budget.status==='conflict')?'conflict':'insufficient';r.review.executable=false;return r;
}
export function revisionReadiness(result){
 const d=result.review.days[1],issues=[];if(result.review.days[0].members.some(m=>m.walking.knownSubtotal[1]>m.walking.limit))issues.push('保留的第1天仍有步行估计冲突/上界风险，未自动采用07预览');if(d.lockCheck?.status==='conflict')issues.push('锁定午餐迟到');
 d.members.forEach((m,i)=>{if(m.walking.knownSubtotal[0]>m.walking.limit)issues.push(`同行者${i+1}第2天步行估计下限超限`);else if(m.walking.knownSubtotal[1]>m.walking.limit)issues.push(`同行者${i+1}第2天步行估计上界超限`);});
 if(result.review.days.some(d=>d.time.status==='conflict'))issues.push('每日时间或开放窗口冲突');if(result.review.members.some(m=>m.budget.status==='conflict'))issues.push('个人全程预算冲突');
 return {canAccept:issues.length===0,status:issues.length?'needs-decision':'estimated-with-unknowns',issues,choices:issues.length?['保留原方案并维持4公里待适配','显式调整未锁定活动取舍','另行决定是否放宽条件或解锁，不自动执行']:[],notice:'仅本轮候选和已计入约束检查；不是全局最优或已证明旅行可行'};
}
export async function evaluateReplan({request,plan,picks,meals,lock,baseline,getRoad,signal,current,event,budget}){
 assertLock(lock,request,picks,meals);parsePlan(JSON.stringify(plan),request);
 const old=new Map(baseline.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,l]));
 const fields=['mode','strategy','minutes','walkingMeters','distanceMeters','fareCentsPerPerson','geometry','geometryComplete','excludesInternal','source','queriedAt'];const facts=l=>Object.fromEntries(fields.filter(k=>Object.hasOwn(l,k)).map(k=>[k,clone(l[k])]));
 const changes=[];
 const result=await queryCase06({request,plan,state:picks,meals,signal,ensureCurrent:current,event,onFailure:e=>{throw e;},allowReorderDay2:true,selectRoad:async(link,s)=>{
  const key=`${link.from}>${link.to}`,before=old.get(key);
  if(link.dayIndex===0||before?.mode==='walk'){if(!before)throw new PlanningError('BASELINE_REQUIRED','未受影响原路段缺失');changes.push({relation:key,change:'retained',queriedAt:before.queriedAt});return {...facts(before),reused:true,changeType:'retained'};}
  const mode=before?.mode||(['TY05','TY06'].includes(link.from)&&link.to==='LUNCH2'||link.from==='LUNCH2'&&['TY05','TY06'].includes(link.to)?'walk':'transit');
  budget.route++;if(budget.route>16)throw new PlanningError('ROUND_LIMIT','受影响道路达到16次上限');const candidate=await getRoad(link.from,link.to,mode,s,mode==='transit'?3:0);if(candidate.reused)budget.route--;current();
  if(!candidate.geometryComplete||!candidate.geometry?.length)throw new PlanningError('UPSTREAM_DATA','受影响路段没有完整真实几何，不补线');
  const chosen=before&&candidate.walkingMeters[1]>=before.walkingMeters[1]?facts(before):facts(candidate);changes.push({relation:key,change:before?'compared':'reconnected',original:before?{walking:before.walkingMeters,minutes:before.minutes,fare:before.fareCentsPerPerson,queriedAt:before.queriedAt}:null,candidate:{walking:candidate.walkingMeters,minutes:candidate.minutes,fare:candidate.fareCentsPerPerson,queriedAt:candidate.queriedAt},notice:'不同取得时刻的交通预测可能变化，不能全部归因于算法'});return {...chosen,reused:chosen.queriedAt===before?.queriedAt,changeType:before?'compared':'reconnected'};
 }});
 const checked=applyLockedSchedule(result,request,lock);checked.review.days.forEach(d=>d.legs.forEach(l=>l.accounting=`[${l.changeType==='reconnected'?'重新连接':l.changeType==='compared'?'已比较候选':'保留原路段'}] ${l.accounting}`));return {...checked,changes08:changes,lock:clone(lock),readiness:revisionReadiness(checked)};
}
