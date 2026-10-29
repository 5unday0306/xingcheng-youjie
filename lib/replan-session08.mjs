import {randomUUID} from 'node:crypto';
import {createAgentReview} from './agent-review.mjs';
import {PlanningError,validateInput,parsePlan} from './planning.mjs';
import {case06RequestHash} from './case06-draft.mjs';
import {createMealLock,assertLock,day2FourKm,orderOptions,evaluateReplan,revisionReadiness} from './replan08.mjs';
import {makePlanExport,renderPlanHtml,assertStructuralRecord} from './plan-export09.mjs';
import {assertFreshRoads} from './road-freshness09.mjs';
const clone=x=>structuredClone(x);
export function createReplanSession08({initial=null,save=async()=>{},saveJournal=async()=>{},model,getRoad,getSelections,ensureEnabled}={}){
 let meta=initial?clone(assertStructuralRecord(initial)):{version:1,requestVersion:randomUUID(),request:null,lock:null,adopted:null},baseline=null,operation=Promise.resolve();
 const persist=()=>{const snap=clone(meta);const p=operation.then(()=>save(snap));operation=p.catch(()=>{});return p;};
 const workflow=createAgentReview({model,getRoad,ensureEnabled,save:saveJournal});
 const change=()=>{workflow.invalidate();meta.requestVersion=randomUUID();};
 function view(){const state=meta.request?workflow.state(meta.request):null;return {meta:clone(meta),baselineAvailable:!!baseline,adoptedMatchesCurrent:!!meta.adopted&&!!meta.request&&meta.adopted.requestHash===case06RequestHash(meta.request)&&JSON.stringify(meta.adopted.lock||null)===JSON.stringify(meta.lock),state,baseline:baseline?{...clone(baseline),label:'已采用原方案 · 尚未适配新条件',versionContext:{adoptedId:meta.adopted.id,requestVersion:meta.requestVersion,matchesCurrent:meta.adopted.requestHash===case06RequestHash(meta.request||meta.adopted.request)}}:null};}
 return {
  running:()=>workflow.state()?.status==='running',view,
  cancelWorkflow(){workflow.invalidate();},
  invalidate(){change();persist().catch(()=>{});},
  reference:()=>clone(meta.adopted),
  async saveStructure(){
   const s=meta.request?workflow.state(meta.request):null;
   if(s?.preview&&['preview','accepted','rejected'].includes(s.status)){
    const option=orderOptions(meta.adopted.plan).find(o=>o.id===s.preview.selectedOption.id);
    // If already accepted, adopted.plan is itself the selected structure.
    const plan=s.status==='accepted'?meta.adopted.plan:option?.plan;
    if(plan)meta.previewSnapshot={version:1,id:s.preview.versionId,requestVersion:meta.requestVersion,runId:s.id,status:s.status,request:clone(meta.request),requestHash:case06RequestHash(meta.request),lock:clone(meta.lock),plan:clone(plan),assessmentStatus:s.preview.review.status,selectedOption:clone(s.preview.selectedOption),assessmentIssues:clone(s.preview.readiness?.issues||[]),savedAt:new Date().toISOString()};
   }
   meta.savedAt=new Date().toISOString();await persist();return view();
  },
  exportStructure(kind){
   if(!['adopted','preview'].includes(kind))throw new PlanningError('EXPORT_KIND','请选择当前采用或修订预览');
   let selected=meta.adopted,state='adopted',history=!baseline;
   if(kind==='preview'){
    const s=meta.request?workflow.state(meta.request):null;
    if(s?.preview&&['preview','accepted','rejected'].includes(s.status)){const option=orderOptions(meta.adopted.plan).find(o=>o.id===s.preview.selectedOption.id);selected={id:s.preview.versionId,request:meta.request,plan:s.status==='accepted'?meta.adopted.plan:option?.plan,lock:meta.lock,assessmentStatus:s.preview.review.status,status:s.status,selectedOption:clone(s.preview.selectedOption),assessmentIssues:clone(s.preview.readiness?.issues||[])};history=false;}
    else{selected=meta.previewSnapshot;history=true;}
    state=selected?.status==='accepted'?'accepted':selected?.status==='rejected'?'rejected':'preview';
   }
   if(!selected?.plan)throw new PlanningError('EXPORT_MISSING','暂无可导出的结构记录；不会自动生成或查询');
   const data=makePlanExport({meals:getSelections().meals,request:selected.request,plan:selected.plan,lock:selected.lock||null,versionId:selected.id,requestVersion:selected.requestVersion||case06RequestHash(selected.request),state,history,assessmentStatus:selected.assessmentStatus||'需在线复核',changeSummary:selected.selectedOption?.tradeoff||null,assessmentIssues:selected.assessmentIssues||[]});data.scheme.matchesCurrentRequest=!!meta.request&&case06RequestHash(selected.request)===case06RequestHash(meta.request)&&JSON.stringify(selected.lock||null)===JSON.stringify(meta.lock);if(!data.scheme.matchesCurrentRequest)data.scheme.adoptionNotice+='；此版本与当前需求/锁定不同，不能按新条件视为有效';return {data,html:renderPlanHtml(data)};
  },
  async adoptGenerated(result,request,plan){
   if(meta.lock)assertLock(meta.lock,request,getSelections().picks,getSelections().meals);assertFreshRoads(result);if(result.availableLegCount!==result.physicalLegCount)throw new PlanningError('BASELINE_REQUIRED','生成交通尚不完整，保留原采用方案');const oldMeta=clone(meta),oldBaseline=clone(baseline);try{change();meta.request=clone(request);meta.previewSnapshot=null;meta.adopted=null;await this.capture(result,request,plan);if(meta.lock){meta.adopted.lock=clone(meta.lock);await persist();}return view();}catch(e){meta=oldMeta;baseline=oldBaseline;throw e;}
  },
  async capture(result,request,plan){
   if(meta.adopted&&meta.adopted.requestHash!==case06RequestHash(request))throw new PlanningError('ADOPTED_VERSION','不可用新需求静默替换当前采用版本');
   if(result.availableLegCount!==result.physicalLegCount)throw new PlanningError('BASELINE_REQUIRED','原方案真实交通尚不完整');
   const id=meta.adopted?.id||result.versionId||`adopted-${result.generatedAt}`;
   meta.adopted={...meta.adopted,id,requestVersion:meta.adopted?.requestVersion||meta.requestVersion,requestHash:case06RequestHash(request),request:clone(request),plan:clone(plan),origin:meta.adopted?.origin||'用户明确采用的生成方案',roadPreferences:Object.fromEntries(result.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,{mode:l.mode,strategy:l.strategy||0}]))};
   meta.request??=clone(request);baseline={...clone(result),versionId:id};await persist();return view();
  },
  async configure({request,start,end,confirmed,dayIndex=1,changeLimits=true}){
   ensureEnabled();if(!baseline)throw new PlanningError('BASELINE_REQUIRED','先显式恢复当前采用方案道路，不需重选落点');
   const {picks,meals}=getSelections(),target=changeLimits?day2FourKm(request):clone(validateInput(request));const lock=createMealLock({request:target,points:picks.points,meals,start,end,confirmed,dayIndex});change();meta.request=target;meta.lock=lock;await persist();return view();
  },
  async sync(request){validateInput(request);if(meta.request&&case06RequestHash(meta.request)!==case06RequestHash(request)){change();meta.request=clone(request);await persist();}return view();},
  async unlock(confirmed){if(confirmed!==true)throw new PlanningError('CONFIRM_REQUIRED','需明确解锁');change();meta.lock=null;await persist();return view();},
  state(request){if(meta.request&&case06RequestHash(meta.request)!==case06RequestHash(request))return {state:null,stale:true,reason:'当前输入与已保存重排需求不同，请先同步确认'};return {state:workflow.state(request)};},
  async start(request){
   ensureEnabled();if(this.running())return {state:workflow.state(meta.request)};
   if(!baseline||!meta.lock||!meta.request||case06RequestHash(request)!==case06RequestHash(meta.request))throw new PlanningError('LOCK_REQUIRED','先恢复原方案、确认午餐锁定与当前需求');
   assertFreshRoads(baseline);
   const {picks,meals}=getSelections();assertLock(meta.lock,request,picks,meals);const plan=clone(meta.adopted.plan);parsePlan(JSON.stringify(plan),request);
   const choices=orderOptions(plan),oldByRelation=new Map(baseline.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,l]));
   // Reassess the unchanged adopted route under NEW limits, without any request.
   const originalAssessment=await evaluateReplan({request,plan,picks,meals,lock:meta.lock,baseline,getRoad:async(f,t)=>({...oldByRelation.get(`${f}>${t}`),reused:true}),current(){},event(){},budget:{route:0}});
   const lock=clone(meta.lock),requestVersion=meta.requestVersion;
   const scenario={context:{kind:'task08',requestVersion,adoptedId:meta.adopted.id,lock,change:'仅第2天三人4公里；第1天及预算、地点保持；取消/换序是待接受取舍',originalRequestHash:meta.adopted.requestHash,requestHash:case06RequestHash(request)},options:choices,evaluate:async({optionId,signal,current,event,budget})=>{
    if(requestVersion!==meta.requestVersion)throw new PlanningError('CANCELLED','旧版本重排已失效');const option=choices.find(o=>o.id===optionId);
    const r=await evaluateReplan({request,plan:option.plan,picks,meals,lock,baseline,getRoad,signal,current,event,budget});r.selectedOption={id:option.id,label:option.label,tradeoff:option.tradeoff};r.versionContext={adoptedId:meta.adopted.id,requestVersion,matchesCurrent:true,preview:true};return r;
   }};
   return {state:await workflow.start({request,original:{...originalAssessment,events:[],mode:'real',versionId:meta.adopted.id,versionContext:{adoptedId:meta.adopted.id,requestVersion,matchesCurrent:false},label:'原方案按新锁定及4公里核查（尚未适配）'},plan,picks,meals,scenario})};
  },
  async decide(request,input){
   if(case06RequestHash(request)!==case06RequestHash(meta.request))throw new PlanningError('PREVIEW_STALE','当前需求版本已改变');
   const s=workflow.state(request);if(input.accept&&(!s?.preview||!revisionReadiness(s.preview).canAccept))throw new PlanningError('PREVIEW_UNSATISFIED','预览仍有明确冲突或步行上界超限，不能采用；请查看取舍选项');
   if(input.accept)assertFreshRoads(s.preview);
   const d=workflow.decide(request,input);
   if(input.accept){const option=orderOptions(meta.adopted.plan).find(o=>o.id===s.preview.selectedOption.id);baseline=clone(s.preview);meta.adopted={...meta.adopted,id:baseline.versionId,requestVersion:meta.requestVersion,request:clone(request),requestHash:case06RequestHash(request),plan:clone(option.plan),origin:'用户明确接受08重排',lock:clone(meta.lock),roadPreferences:Object.fromEntries(baseline.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,{mode:l.mode,strategy:l.strategy||0}]))};}
   meta.lastDecision={runId:s.id,accept:input.accept,at:new Date().toISOString()};await this.saveStructure();return {...d,meta:clone(meta),result:{...d.result,label:input.accept?'已采用动态重排（未知保留）':'保留已采用原方案（尚未适配当前4公里）',versionContext:{adoptedId:meta.adopted.id,requestVersion:meta.requestVersion,matchesCurrent:input.accept}}};
  }
 };
}
