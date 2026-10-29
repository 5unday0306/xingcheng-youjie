import {PlanningError,requiredLegs,reviewPlan} from './planning.mjs';
import {catalog} from '../data/taiyuan.mjs';
export function assertCase06Ready(request,state,meals){
 if(request.days.length!==2)throw new PlanningError('CASE06_DAYS','本轮完整交通链核查仅准备了两天案例；其他天数仍可编辑保存');
 const ids=['ENDPOINT','MUSEUM_GATE','TY01','TY04','TY05','TY06','LUNCH1','LUNCH2'];
 const missing=ids.filter(id=>!state.points[id]?.confirmed);
 if(missing.length||!meals[0]||!meals[1])throw new PlanningError('CASE06_SELECTION',`尚需确认位置或餐厅：${missing.join('、')||'两天午餐'}；未调用模型或道路`);
 for(const id of ['MUSEUM_GATE','TY01'])if(state.points[id].location.join(',')===state.points.ENDPOINT.location.join(',')||id==='TY01'&&state.points[id].location.join(',')===state.points.MUSEUM_GATE.location.join(','))throw new PlanningError('MUSEUM_SAME','集合、院门、参观入口必须分别选择');
 for(const [i,m] of meals.entries())if(state.points['LUNCH'+(i+1)].location.join(',')!==m.candidate.location.join(','))throw new PlanningError('MEAL_CHANGED','午餐位置已偏离所选餐厅，请重新选择餐厅，不沿用旧费用和名称');
}
export function case06Chains(plan,{allowReorderDay2=false}={}){
 const expected=[['TY01','meal','TY04'],['TY05','meal','TY06']];
 const second=d=>d.items.length>=2&&d.items.length<=3&&d.items.filter(x=>x.type==='meal').length===1&&d.items.every(x=>x.type==='meal'||['TY05','TY06'].includes(x.candidateId))&&new Set(d.items.filter(x=>x.type==='visit').map(x=>x.candidateId)).size===d.items.length-1;
 if(plan.days.length!==2||plan.days.some((d,i)=>i===1&&allowReorderDay2?!second(d):d.items.map(x=>x.type==='meal'?'meal':x.candidateId).join(',')!==expected[i].join(',')))throw new PlanningError('CASE06_PLAN','本轮草案必须保留已确认的两天地点组合和中间午餐，不自动换日或重排');
 return requiredLegs(plan).map(leg=>{
  const from=leg.from==='MEAL_PENDING'?'LUNCH'+(leg.dayIndex+1):leg.from,to=leg.to==='MEAL_PENDING'?'LUNCH'+(leg.dayIndex+1):leg.to;
  const pairs=to==='TY01'?[[from,'MUSEUM_GATE'],['MUSEUM_GATE','TY01']]:from==='TY01'?[['TY01','MUSEUM_GATE'],['MUSEUM_GATE',to]]:[[from,to]];
  return {...leg,pairs:pairs.map(([from,to],i)=>({id:leg.id+'-part'+(i+1),logicalId:leg.id,dayIndex:leg.dayIndex,from,to,includedInVisit:from==='TY01'||to==='TY01',walkOnly:from==='TY01'||to==='TY01'||from==='ENDPOINT'&&to==='MUSEUM_GATE'}))};
 });
}
const sum=(list,key)=>list.length&&list.every(l=>Array.isArray(l[key]))?list.reduce((a,l)=>a.map((v,i)=>v+l[key][i]),[0,0]):null;
export async function queryCase06({request,plan,state,meals,getRoad,signal,ensureCurrent,onFailure,event,selectRoad=null,allowReorderDay2=false}){
 assertCase06Ready(request,state,meals);const groups=case06Chains(plan,{allowReorderDay2}),physical=[],logical=[];let failed=false;
 for(const g of groups){const parts=[];
  for(const link of g.pairs){ensureCurrent();const absent={...link,status:'missing',minutes:null,walkingMeters:null,fareCentsPerPerson:null,reason:'前段失败，未继续查询'};
   if(failed){physical.push(absent);parts.push(absent);continue;}
   try{event(link.id+'-walk','running');let road=selectRoad?await selectRoad(link,signal):await getRoad(link.from,link.to,'walk',signal);ensureCurrent();
    // Actual walking result first. Long links use an actual transit result; never
    // infer a bus ride from distance, and never add both alternatives to totals.
    if(!selectRoad&&!link.walkOnly&&road.walkingMeters&&road.minutes&&(road.walkingMeters[1]>1200||road.minutes[1]>20)){event(link.id+'-transit','running');road=await getRoad(link.from,link.to,'transit',signal);ensureCurrent();}
    const item={...link,...road,status:'available'};parts.push(item);physical.push(item);event(link.id,'completed');
   }catch(e){if(e.code==='CANCELLED')throw e;failed=true;await onFailure(e);const item={...absent,reason:`道路未取得（${e.code||'FAILED'}），已停止后续请求，无自动重试`};parts.push(item);physical.push(item);event(link.id,'failed');}
  }
  const ok=parts.every(l=>l.status==='available'),outside=parts.filter(l=>!l.includedInVisit);
  logical.push({...g,status:ok?'available':'missing',minutes:ok?sum(outside,'minutes'):null,walkingMeters:ok?sum(outside,'walkingMeters'):null,fareCentsPerPerson:ok?sum(parts,'fareCentsPerPerson'):null,excludesInternal:false,source:'程序汇总实际路段',reason:ok?undefined:'交通链存在缺段'});
 }
 const data=catalog(),museum=data.candidates.find(c=>c.id==='TY01'),access=physical.filter(l=>l.includedInVisit&&l.status==='available'),accessWalk=sum(access,'walkingMeters');
 if(accessWalk){museum.internalMeters.value=museum.internalMeters.value.map((v,i)=>Math.max(v,accessWalk[i]));museum.internalMeters.reason='含院门往返参观入口的内部步行包络估计，不重复累计同一接驳；非实测游览全程';}
 const walkBounds=plan.days.map((d,i)=>{
  const road=sum(physical.filter(l=>l.dayIndex===i&&!l.includedInVisit&&l.status==='available'),'walkingMeters')||[0,0];
  const visits=d.items.filter(x=>x.type==='visit').map(x=>data.candidates.find(c=>c.id===x.candidateId));let lower=0,upper=0;
  for(const c of visits){const overlaps=c.overlapGroup&&visits.some(v=>v.id!==c.id&&v.overlapGroup===c.overlapGroup);if(!overlaps)lower+=c.internalMeters.value[0];upper+=c.internalMeters.value[1];}
  // Each transport traversal is counted even when it retraces a geographic path.
  // Only gate/visitor access already INCLUDED in the museum visit is excluded.
  // Street browsing overlap has no confirmed additional lower bound; its unknown
  // remains in missing, rather than being treated as zero or satisfied.
  return [road[0]+lower,road[1]+upper];
 });
 const review=reviewPlan(request,plan,logical,data,{meals,walkBounds});
 review.days.forEach((d,i)=>{
  const raw=physical.filter(l=>l.dayIndex===i);const canonical=[raw[0].from,...raw.map(l=>l.to)],ids=canonical.map((id,j)=>`d${i+1}-p${j+1}-${id}`);
  const label=id=>id.startsWith('LUNCH')?meals[i].candidate.name:state.points[id]?.name||id;
  d.activities=canonical.map((id,j)=>({...state.points[id],id:ids[j],pointId:id,name:label(id),sequence:j+1,role:j===0?'集合出发':j===canonical.length-1?'返回集合点':id==='MUSEUM_GATE'?'院门接驳':id.startsWith('LUNCH')?'用餐':'活动'}));
  d.legs=raw.map((l,j)=>({...l,fromPointId:l.from,toPointId:l.to,from:ids[j],to:ids[j+1],fromName:label(l.from),toName:label(l.to),accounting:l.includedInVisit?'时间和步行已纳入博物院停留/内部步行估计，不重复累加':'计入当日交通'}));
  d.timeline=d.activities.map((a,j)=>{const visit=plan.days[i].items.find(x=>x.candidateId===a.pointId),meal=a.pointId.startsWith('LUNCH')?meals[i]:null;return {type:meal?'meal':visit?'visit':'connection',candidateId:a.id,name:a.name,durationMinutes:meal?.durationMinutes||visit?.durationMinutes||null,arrivalMinute:null,reason:meal?'用户接受的餐厅和估计；旅行日营业、等位仍未知':visit?.reason||a.role,notice:'到离时间未知，不展示虚构时间轴'};});
  d.messages.push('集合点、院门、主馆入口分开；院门往返参观入口包含在博物院停留与内部步行包络估计内。','不同时段的交通步行分别累计；博物院入口往返已包含于内部估计，不再重复加。街区游逛重叠边界仍未知，不能按零认定满足。','公交时长已含接口返回的接驳/等待，不另造等待数值；未来车次、入口排队与用餐等位未知。');
  const accessTime=sum(raw.filter(l=>l.includedInVisit&&l.status==='available'),'minutes'),visit=plan.days[i].items.find(x=>x.candidateId==='TY01');if(visit&&accessTime&&accessTime[0]>visit.durationMinutes){d.time.status='conflict';d.messages.push('院门往返入口的道路预计已超过博物院停留，需调整，未暗中延长停留');}
 });
 review.status=review.days.some(d=>d.time.status==='conflict'||d.members.some(m=>m.walking.status==='conflict'))||review.members.some(m=>m.budget.status==='conflict')?'conflict':'insufficient';
 review.notice='草案结构通过；道路为当前预测、停留/费用/内部步行为估计。开放预约、费用与等待缺口保留，未证明旅行可行。';
 return {review,logicalLegs:logical,physicalLegCount:physical.length,availableLegCount:physical.filter(l=>l.status==='available').length};
}
