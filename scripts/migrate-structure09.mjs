// One-time local recovery of OWN structural output from the actual 08 journal.
// No provider request or road/coordinate serialization; adoption is never changed.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {orderOptions} from '../lib/replan08.mjs';import {case06RequestHash} from '../lib/case06-draft.mjs';import {assertStructuralRecord} from '../lib/plan-export09.mjs';
const root=new URL('../docs/private/',import.meta.url),p=new URL('08-state.json',root),meta=assertStructuralRecord(JSON.parse(await readFile(p,'utf8')));
if(meta.previewSnapshot){console.log({changed:false,message:'已有预览结构，不覆盖'});process.exit(0);}
const candidates=[];for(const name of await readdir(root)){if(!/^08-[a-f0-9-]{36}\.json$/.test(name))continue;const s=JSON.parse(await readFile(new URL(name,root),'utf8'));if(['preview','accepted','rejected'].includes(s.status)&&s.requestHash===case06RequestHash(meta.request))candidates.push(s);}
candidates.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const s=candidates[0];if(!s)throw Error('没有与当前需求匹配的完整协作历史，未生成假快照');
if(s.status==='accepted')throw Error('采用记录需人工核对，不自动推断已采用结构');const last=s.nodes.filter(n=>n.role==='plan'&&n.status==='completed').at(-1),option=orderOptions(meta.adopted.plan).find(o=>o.id===last?.output.optionId);if(!option)throw Error('规划候选引用缺失，未修改');
await writeFile(new URL('08-state-before09.json',root),JSON.stringify(meta,null,2),{mode:0o600});
meta.previewSnapshot={version:1,id:s.id+'-r'+s.round,requestVersion:meta.requestVersion,runId:s.id,status:s.status,request:meta.request,requestHash:s.requestHash,lock:meta.lock,plan:option.plan,assessmentStatus:'资料不足/冲突需在应用重新核查',selectedOption:{id:option.id,label:option.label,tradeoff:option.tradeoff},savedAt:new Date().toISOString(),source:'从实际08角色规划日志恢复结构，不是原始道路或新生成'};
await writeFile(p,JSON.stringify(meta,null,2),{mode:0o600});console.log({changed:true,adoptedUnchanged:meta.adopted.id,previewStillUnadopted:true,sourceRun:s.id,rawMapDataSaved:false});
