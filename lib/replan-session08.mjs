import {randomUUID} from 'node:crypto';
import {createAgentReview} from './agent-review.mjs';
import {PlanningError,validateInput,parsePlan} from './planning.mjs';
import {case06RequestHash} from './case06-draft.mjs';
import {createMealLock,assertLock,day2FourKm,orderOptions,evaluateReplan,revisionReadiness} from './replan08.mjs';
const clone=x=>structuredClone(x);
export function createReplanSession08({initial=null,save=async()=>{},saveJournal=async()=>{},model,getRoad,getSelections,ensureEnabled}={}){
 let meta=clone(initial)||{version:1,requestVersion:randomUUID(),request:null,lock:null,adopted:null},baseline=null,operation=Promise.resolve();
 const persist=()=>{const snap=clone(meta);const p=operation.then(()=>save(snap));operation=p.catch(()=>{});return p;};
 const workflow=createAgentReview({model,getRoad,ensureEnabled,save:saveJournal});
 const change=()=>{workflow.invalidate();meta.requestVersion=randomUUID();};
 function view(){const state=meta.request?workflow.state(meta.request):null;return {meta:clone(meta),baselineAvailable:!!baseline,adoptedMatchesCurrent:!!meta.adopted&&!!meta.request&&meta.adopted.requestHash===case06RequestHash(meta.request)&&JSON.stringify(meta.adopted.lock||null)===JSON.stringify(meta.lock),state,baseline:baseline?{...clone(baseline),label:'已采用原方案 · 尚未适配新条件',versionContext:{adoptedId:meta.adopted.id,requestVersion:meta.requestVersion,matchesCurrent:meta.adopted.requestHash===case06RequestHash(meta.request||meta.adopted.request)}}:null};}
 return {
  running:()=>workflow.state()?.status==='running',view,
  cancelWorkflow(){workflow.invalidate();},
  invalidate(){change();persist().catch(()=>{});},
  reference:()=>clone(meta.adopted),
  async capture(result,request,plan){
   if(meta.adopted&&meta.adopted.requestHash!==case06RequestHash(request))throw new PlanningError('ADOPTED_VERSION','不可用新需求静默替换当前采用版本');
   if(result.availableLegCount!==result.physicalLegCount)throw new PlanningError('BASELINE_REQUIRED','原方案真实交通尚不完整');
   const id=meta.adopted?.id||result.versionId||`adopted-${result.generatedAt}`;
   meta.adopted={...meta.adopted,id,requestHash:case06RequestHash(request),request:clone(request),plan:clone(plan),origin:meta.adopted?.origin||'当前正式已采用方案，非07预览',roadPreferences:Object.fromEntries(result.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,{mode:l.mode,strategy:l.strategy||0}]))};
   meta.request??=clone(request);baseline={...clone(result),versionId:id};await persist();return view();
  },
  async configure({request,start,end,confirmed}){
   ensureEnabled();if(!baseline)throw new PlanningError('BASELINE_REQUIRED','先显式恢复当前采用方案道路，不需重选落点');
   const {picks,meals}=getSelections(),target=day2FourKm(request);const lock=createMealLock({request:target,points:picks.points,meals,start,end,confirmed});change();meta.request=target;meta.lock=lock;await persist();return view();
  },
  async sync(request){validateInput(request);if(meta.request&&case06RequestHash(meta.request)!==case06RequestHash(request)){change();meta.request=clone(request);await persist();}return view();},
  async unlock(confirmed){if(confirmed!==true)throw new PlanningError('CONFIRM_REQUIRED','需明确解锁');change();meta.lock=null;await persist();return view();},
  state(request){if(meta.request&&case06RequestHash(meta.request)!==case06RequestHash(request))return {state:null,stale:true,reason:'当前输入与已保存重排需求不同，请先同步确认'};return {state:workflow.state(request)};},
  async start(request){
   ensureEnabled();if(this.running())return {state:workflow.state(meta.request)};
   if(!baseline||!meta.lock||!meta.request||case06RequestHash(request)!==case06RequestHash(meta.request))throw new PlanningError('LOCK_REQUIRED','先恢复原方案、确认午餐锁定与当前需求');
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
   const d=workflow.decide(request,input);
   if(input.accept){const option=orderOptions(meta.adopted.plan).find(o=>o.id===s.preview.selectedOption.id);baseline=clone(s.preview);meta.adopted={...meta.adopted,id:baseline.versionId,request:clone(request),requestHash:case06RequestHash(request),plan:clone(option.plan),origin:'用户明确接受08重排',lock:clone(meta.lock),roadPreferences:Object.fromEntries(baseline.review.days.flatMap(d=>d.legs).map(l=>[`${l.fromPointId}>${l.toPointId}`,{mode:l.mode,strategy:l.strategy||0}]))};}
   await persist();return {...d,meta:clone(meta),result:{...d.result,label:input.accept?'已采用动态重排（未知保留）':'保留已采用原方案（尚未适配当前4公里）',versionContext:{adoptedId:meta.adopted.id,requestVersion:meta.requestVersion,matchesCurrent:input.accept}}};
  }
 };
}
