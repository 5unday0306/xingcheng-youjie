import {PlanningError} from './planning.mjs';
import {referenceDistance} from './case06-research.mjs';
export const case06Names={TY04:'迎泽公园北侧测试位置',MUSEUM_GATE:'博物院院门测试位置',TY01:'博物院主馆参观入口测试位置',LUNCH1:'第1天午餐测试位置',LUNCH2:'第2天午餐测试位置'};
const targets={ENDPOINT:['museum','B015F031GS'],MUSEUM_GATE:['museum','B015F031GS'],TY01:['museum','B0LDLYNO9H'],TY04:['park','B015F026WL'],TY05:['clock','B0HGTS96YH'],TY06:['food','B015F0I9AO']};
// Selection lists, not accepted meals. Nearness is only straight-line reference.
const lunchIds=[['B0MR2ZOJST','B0FFFGWXV3','B0MGB1V65D'],['B0I6T5MXGG','B0FFG2GBSR','B0FFFFXGN6']];
export function case06Research(research,oldPoints={}){
 const all=research.results.flatMap(r=>r.candidates),find=id=>all.find(p=>p.id===id);
 const references=Object.entries(targets).map(([id,[,poi]])=>{const p=find(poi);if(!p)throw new Error('任务06参考资料不完整');return {id,reference:p,oldLocation:oldPoints[id]?.location||null,offsetMeters:oldPoints[id]?referenceDistance(oldPoints[id].location,p.location):null,notice:['ENDPOINT','MUSEUM_GATE','TY01','TY04'].includes(id)?'机构/建筑位置参考，不是院门或参观入口。请在真实地图上分别选点确认。':'街区位置参考，可明确接受为测试落点；非官方入口核验。'};});
 const lunches=lunchIds.map((ids,i)=>({dayIndex:i,candidates:ids.map(id=>{const p=find(id);if(!p||!p.type.includes('餐饮'))throw new Error('午餐候选资料不完整');return p;})}));
 const parkCandidate=find('B0FFKG7U75');if(!parkCandidate)throw new Error('缺少公园北入口广场候选');
 return {references,lunches,parkCandidate,notice:'旧坐标保留在私有历史。偏差是与机构/街区参考点的直线距离，不是道路距离或入口核验。'};
}
export function validateMeal(input,research){
 const {dayIndex,poiId,durationMinutes,costYuan,accepted}=input;
 const candidate=research.lunches.find(d=>d.dayIndex===dayIndex)?.candidates.find(p=>p.id===poiId);
 if(!candidate||accepted!==true||!Number.isInteger(durationMinutes)||durationMinutes<30||durationMinutes>120||!Array.isArray(costYuan)||costYuan.length!==2||!costYuan.every(n=>Number.isFinite(n)&&n>=0&&n<=1000)||costYuan[0]>costYuan[1])throw new PlanningError('MEAL_SELECTION','请明确选择本日候选，并确认30～120分钟停留和有效个人费用区间');
 return {dayIndex,candidate:structuredClone(candidate),durationMinutes,costCentsPerPerson:costYuan.map(n=>Math.round(n*100)),costBasis:'用户接受的用餐估计，非餐厅报价',confirmedAt:new Date().toISOString(),futureOpeningVerified:false};
}
export function assertSeparateMuseumPoints(state,input){
 if(!['ENDPOINT','MUSEUM_GATE','TY01'].includes(input.id))return;
 const p=state.points[input.id];if(p&&['ENDPOINT','MUSEUM_GATE','TY01'].some(id=>id!==input.id&&state.points[id]?.location.join(',')===p.location.join(',')))throw new PlanningError('MUSEUM_SAME','公共集合点、院门和主馆入口需分别选择，不能使用同一点或把内部步行记为零');
}
