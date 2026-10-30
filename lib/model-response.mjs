import {PlanningError} from './planning.mjs';
export function schemaForExample(value,key='',maxStringLength=null){
 if(Array.isArray(value))return {type:'array',items:value.length?schemaForExample(value[0],'',maxStringLength):{type:'string'}};
 if(value&&typeof value==='object')return {type:'object',properties:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,schemaForExample(v,k,maxStringLength)])),required:Object.keys(value),additionalProperties:false};
 const type=typeof value==='number'?(Number.isInteger(value)?'integer':'number'):typeof value;
 return {type,...(type==='string'&&maxStringLength?{maxLength:maxStringLength}:{}),...(['version','role'].includes(key)||key.endsWith('Ref')?{enum:[value]}:{})};
}
export function dynamicRoleSchema(contract,candidates=[]){
 const schema=schemaForExample(contract,'',500);
 if(contract.role==='screen'){
  const item=schema.properties.proposedPlan.properties.days.items.properties.items;
  const visit=schemaForExample({type:'visit',candidateId:'candidate',durationMinutes:60,reason:'来源候选'},'',500),meal=schemaForExample({type:'meal',reason:'保留午餐'},'',500);
  visit.properties.type.enum=['visit'];meal.properties.type.enum=['meal'];visit.properties.candidateId.enum=contract.rankings.map(r=>r.candidateId);
  // Source-specific stay bounds must reach the provider as well as local validation.
  const visits=candidates.length?candidates.map(c=>({...visit,properties:{...visit.properties,candidateId:{type:'string',enum:[c.id]},durationMinutes:{type:'integer',minimum:c.stayMinutes.value[0],maximum:c.stayMinutes.value[1]}}})): [visit];
  item.items={oneOf:[...visits,meal]};
 }
 return schema;
}
export function parseRoleResponse(response){
 const fail=(code,message,extra={})=>{const e=new PlanningError(code,message);e.diagnostic={finishReason:response.finishReason??null,transport:response.transport??'direct',rawBytes:typeof response.content==='string'?Buffer.byteLength(response.content):0,...extra};throw e;};
 if(response.finishReason==='length')fail('MODEL_TRUNCATED','模型回答未写完，本次未采用；可重新尝试当前步骤。');
 if(response.deliveryError)fail('MODEL_DELIVERY','模型没有返回约定的规划结果，本次已停止。');
 if(typeof response.content!=='string'||!response.content.trim())fail('MODEL_EMPTY','模型没有给出内容，本次未采用；可重新尝试当前步骤。');
 if(response.finishReason&&!['stop','tool_calls'].includes(response.finishReason))fail('MODEL_FINISH','模型回答被中断，本次未采用。');
 let value;try{value=JSON.parse(response.content);}catch(e){const position=Number(/position (\d+)/.exec(e.message)?.[1]);fail('MODEL_JSON_SYNTAX','模型返回的内容格式不完整，规划未完成；原方案已保留。',{parsePosition:Number.isFinite(position)?position:null});}
 return value;
}
