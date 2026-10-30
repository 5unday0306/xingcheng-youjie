import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PlanningError} from './planning.mjs';

// Formal operation has its own append-preserving journal. Development history
// remains untouched; neither expiration nor its stop flag is a production gate.
export const productionPolicy=()=>({flow:'product-05b',model:'deepseek-flash',stages:['task07','task08','dynamic-input','history-preview-restore','negotiation-comparison'],caps:{model:6,route:32,location:6,map:1}});
export function createProductionLedger(path){
 let queue=Promise.resolve(),task=null;
 const transact=fn=>{const job=queue.then(async()=>{await mkdir(dirname(path),{recursive:true});let s;try{s=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new PlanningError('LEDGER_INVALID','运行记录无法读取，请修复文件后重试',503);s={version:1,entries:[],events:[]};}if(s.version!==1||!Array.isArray(s.entries)||!Array.isArray(s.events))throw new PlanningError('LEDGER_INVALID','运行记录格式无效',503);const result=fn(s);const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(s,null,2),{mode:0o600});await rename(tmp,path);return result;});queue=job.catch(()=>{});return job;};
 const begin=()=>{task={id:randomUUID(),counts:{model:0,route:0,location:0},until:Date.now()+720000};};
 return {
  beginTask:()=>transact(s=>{begin();s.events.push({kind:'task-start',id:task.id,at:new Date().toISOString()});}),
  claimDynamicRun:()=>transact(s=>{begin();s.events.push({kind:'dynamic-start',id:task.id,at:new Date().toISOString()});}),
  reserve:kind=>transact(s=>{if(!['model','route','location','map'].includes(kind))throw new PlanningError('CALL_KIND','不支持的请求');if(kind==='map'){if(s.entries.filter(e=>e.kind==='map'&&Date.now()-Date.parse(e.at)<60000).length>=3)throw new PlanningError('CALL_LIMIT','地图加载过于频繁，请一分钟后手动重试',429);}else{if(!task)begin();if(Date.now()>task.until||task.counts[kind]>=productionPolicy().caps[kind])throw new PlanningError('CALL_LIMIT','本次任务已达请求或时间上限；原方案保留，可手动开始新任务',429);task.counts[kind]++;}const id=randomUUID();s.entries.push({id,kind,taskId:task?.id??null,at:new Date().toISOString(),status:'reserved',reservedCents:0});return id;}),
  finish:(id,status,usage)=>transact(s=>{const e=s.entries.find(e=>e.id===id);if(!e)throw new PlanningError('LEDGER_INVALID','请求记录缺失');e.status=status;e.finishedAt=new Date().toISOString();if(usage)e.usage=usage;}),
  resource:(kind,status,counts)=>transact(s=>{s.events.push({kind,status,...(counts?{counts}:{}),at:new Date().toISOString()});}),
  claimMapBootstrap:()=>transact(s=>{const e=s.entries.filter(e=>e.kind==='map').at(-1);if(!e||e.claimed)throw new PlanningError('MAP_BOOTSTRAP_USED','地图配置已领取',409);e.claimed=true;return {claimed:true};}),
  stop:(code,diagnostic)=>transact(s=>{s.events.push({kind:'task-failure',code,diagnostic,taskId:task?.id??null,at:new Date().toISOString()});}),
  summary:()=>transact(s=>({counts:Object.fromEntries(['model','location','route','map'].map(k=>[k,s.entries.filter(e=>e.kind===k).length])),entries:s.entries,resources:s.events,stopped:null,dynamicRunsUsed:0,reservedCents:0,budgetCents:null,actualCharge:'正式运行未估算费用，以供应商账单为准'}))
 };
}
