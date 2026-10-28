import {createHash} from 'node:crypto';
import {parsePlan,PlanningError} from './planning.mjs';
export const case06RequestHash=request=>{const {transportMode,...core}=request;return createHash('sha256').update(JSON.stringify(core)).digest('hex');};
// This recovers validated VISITS from the program result, not original model text.
// Meal wording belongs to the user's selection and is explicitly reconstructed.
export function recoverCase06Draft(result,request){
 if(result?.mode!=='real'||result.review?.structure!=='valid'||result.review.days.length!==2)throw new PlanningError('DRAFT_SOURCE','没有可复用的真实游览草案');
 const plan={version:1,days:result.review.days.map(day=>({date:day.date,items:day.timeline.filter(t=>['visit','meal'].includes(t.type)).map(t=>t.type==='meal'?{type:'meal',reason:'用户已选择本日午餐，程序恢复草案中间用餐位置'}:{type:'visit',candidateId:day.activities.find(a=>a.id===t.candidateId)?.pointId,durationMinutes:t.durationMinutes,reason:t.reason})}))};
 parsePlan(JSON.stringify(plan),request);
 return {version:1,requestHash:case06RequestHash(request),plan,originGeneratedAt:result.generatedAt,originalUsage:result.usage,kind:'recovered-validated-visits',notice:'真实草案的游览顺序/时长/理由来自已核查结果；午餐理由为程序恢复，不是原始模型全文'};
}
