import {applyLockedSchedule} from './replan08.mjs';
import {goalAdjustments,numericRisks,touringQuality} from './dynamic-policy.mjs';
import {createDynamicWorkflow} from './dynamic-workflow.mjs';
import {dynamicScopeErrors,DYNAMIC_SCOPE} from '../web/dynamic-scope.js';
import {createJourneyGeneration} from './journey-generation.mjs';
import {createReplanSession08} from './replan-session08.mjs';
import {ROAD_CACHE_MS} from './road-freshness09.mjs';
import {createAgentReview} from './agent-review.mjs';
import {case06RequestHash} from './case06-draft.mjs';
import {setTimeout as waitForRoad} from 'node:timers/promises';
import {assertCase06Ready,queryCase06} from './case06-routes.mjs';
import {case06Names,validateMeal,assertSeparateMuseumPoints} from './case06.mjs';
import {createPickingSession} from './map-picking.mjs';
import {sdkInitRequest,sdkScriptReply} from './sdk-init-proxy.mjs';
import {randomUUID} from 'node:crypto';
import {catalog} from '../data/taiyuan.mjs';
import {locationTargets,querySignature} from '../data/location-targets.mjs';
import {PlanningError,validateInput,modelInput,parsePlan,requiredLegs,reviewPlan} from './planning.mjs';
import {createUpstreamAdapters,buildJsProxyRequest} from './upstream-contract.mjs';

export const entranceList=locationTargets;
// Road geometry stays in memory. Callers may privately persist accepted test
// points and validated visit structure; request matching uses a hash.
export function createLivePlanning({credentials={},configuration={},approval=null,ledger=null,send=null,initialStop=null,initialPicks=null,savePicks=async()=>{},case06=null,initialCase06Draft=null,saveCase06Draft=async()=>{},saveAgentJournal=async()=>{},historicalReview=null,initialReplan08=null,saveReplan08=async()=>{},saveReplanJournal=async()=>{},saveGenerationJournal=async()=>{},historicalGeneration=null,dynamicPlanning=false,historicalDynamic=null,initialDynamicRunsUsed=0,saveDynamicJournal=async()=>{}}={}) {
  const product=approval?.flow==='product-05b';
  if(case06&&!product)throw new PlanningError('CASE06_SCOPE','任务06需沿用已明确批准的持续产品联调范围，不能使用旧底图单次授权',403);
  const entries=locationTargets(approval?.lookup);
  const locations=new Map(),pending=new Map(),located=new Map(),roads=new Map();let busy=false,proof=null,mapLease=null,proofAccepted=false,proxyCount=0,lastResult=null,lastRequestKey=null;
  let haltReason=initialStop,dynamicRunsUsed=initialDynamicRunsUsed;const dynamicExhausted=()=>dynamicPlanning&&Number.isInteger(approval?.dynamicRuns)&&dynamicRunsUsed>=approval.dynamicRuns;
  const enabled=()=>!!approval&&!!ledger&&!!send&&!haltReason&&Date.parse(approval.expiresAt)>Date.now();
  const assertEnabled=()=>{if(!enabled())throw new PlanningError('AUTH_REQUIRED',haltReason?'此前接口加载失败，当前运行已停止；请查看运行记录，原采用方案保留':'授权尚未启用或已到期，未调用',403);};
  const replanAllowed=!!case06&&approval?.stages?.includes('task08');
  const agentAllowed=!!case06&&approval?.stages?.includes('task07');
  const adapter=createUpstreamAdapters({credentials,model:approval?.model,enabled:enabled(),send,reserve:k=>ledger.reserve(k),finish:(...a)=>ledger.finish(...a),limits:product?{model:replanAllowed?64:agentAllowed?24:8,location:40,route:replanAllowed?320:160}:undefined});
  const picking=createPickingSession({extended:product,extraNames:case06?case06Names:{},initialState:product?initialPicks:null,road:(input,options)=>{const key=JSON.stringify([input.origin.location,input.destination.location,input.mode]);return product&&roads.has(key)?Promise.resolve({...roads.get(key),reused:true}):adapter.road(input,options);}});
  if(product)for(const p of Object.values(picking.state().points))if(p?.confirmed)locations.set(p.id,structuredClone(p));
  let meals=structuredClone(initialPicks?.meals||[null,null]),parkSelection=structuredClone(initialPicks?.parkSelection||null);
  const persistPicks=async s=>{collaboration?.invalidate();replan?.invalidate();generation?.invalidate();dynamic?.invalidate();lastResult=null;lastRequestKey=null;if(product)await savePicks({version:1,points:s.points,mode:s.mode,...(case06?{meals,parkSelection}: {})});return case06?{...s,meals:structuredClone(meals),parkSelection:structuredClone(parkSelection)}:s;};
  let storedCase06Draft=initialCase06Draft;
  let mapReady=false;
  const manual=approval?.flow==='map-pick'||product;
  const stop=async (code,diagnostic)=>{haltReason=code;await ledger.stop(code,diagnostic);};
  const exclusive=async action=>{assertEnabled();if(busy||dynamic?.running()||generation?.running()||collaboration?.state()?.status==='running'||replan?.running())throw new PlanningError('BUSY','本机已有请求，未并行调用',409);busy=true;try{return await action();}catch(e){if(['UPSTREAM_DATA','UPSTREAM_FAILED','CALL_LIMIT','MODEL_JSON','PLAN_SCHEMA','TIMEOUT','STOPPED'].includes(e.code))await stop(e.code,e.diagnostic);throw e;}finally{busy=false;}};
  const signal=()=>AbortSignal.timeout(180000);
  const locatePoint=id=>{const p=locations.get(id);if(!p)throw new PlanningError('ENTRANCE_UNKNOWN','所选入口尚未人工确认，未查询道路');return p;};
  const modeCheck=mode=>{if(!['walk','transit','mixed'].includes(mode))throw new PlanningError('MODE','请明确选择本次路段采用步行或公交地铁');};
  const activities=ids=>ids.map(id=>({id,name:entries.find(p=>p.id===id)?.name||'未知',...locations.get(id)}));
  let lastRoadAt=0;
  async function getRoad(from,to,mode,signal,strategy=0){
    assertEnabled();
    const origin=locatePoint(from),destination=locatePoint(to),key=JSON.stringify([origin.location,destination.location,mode,...(strategy?[strategy]:[])]);
    if(roads.has(key)&&Date.now()-Date.parse(roads.get(key).queriedAt)<=ROAD_CACHE_MS)return {...roads.get(key),reused:true};
    const pause=Math.max(0,1100-(Date.now()-lastRoadAt));if(pause)try{await waitForRoad(pause,null,{signal});}catch{throw new PlanningError('CANCELLED','等待道路请求间隔时已取消，未继续请求',409);}if(signal?.aborted)throw new PlanningError('CANCELLED','道路查询已取消',409);lastRoadAt=Date.now();
    const road={...await adapter.road({origin,destination,mode,strategy},{signal}),queriedAt:new Date().toISOString(),reused:false};roads.set(key,road);return road;
  }
  const getCachedRoad=(from,to,mode,strategy=0)=>{const origin=locations.get(from),destination=locations.get(to);if(!origin||!destination)return null;const key=JSON.stringify([origin.location,destination.location,mode,...(strategy?[strategy]:[])]),road=roads.get(key);return road&&Date.now()-Date.parse(road.queriedAt)<=ROAD_CACHE_MS?{...road,reused:true}:null;};
  const collaboration=case06?createAgentReview({model:(...args)=>adapter.plan(...args),getRoad,historicalReview,ensureEnabled:()=>{assertEnabled();if(!agentAllowed)throw new PlanningError('STAGE_AUTH','任务07尚未授权，未调用模型或道路',403);},save:saveAgentJournal}):null;
  const replan=case06?createReplanSession08({initial:initialReplan08,save:saveReplan08,saveJournal:saveReplanJournal,model:(...a)=>adapter.plan(...a),getRoad,getSelections:()=>({picks:picking.state(),meals:structuredClone(meals)}),ensureEnabled:()=>{assertEnabled();if(!replanAllowed)throw new PlanningError('STAGE_AUTH','任务08尚未授权',403);}}):null;
  const placeChoices=new Map();
  const syncLocations=()=>{locations.clear();for(const p of Object.values(picking.state().points))if(p?.confirmed)locations.set(p.id,structuredClone(p));};
  const saveSelections=async()=>{syncLocations();const s=picking.state();await savePicks({version:1,points:s.points,mode:s.mode,meals,parkSelection});};
  const generation=case06&&agentAllowed?createJourneyGeneration({model:(...a)=>adapter.plan(...a),getRoad,ensureEnabled:assertEnabled,save:saveGenerationJournal,history:historicalGeneration,getSelections:()=>({picks:picking.state(),meals:structuredClone(meals),lunches:case06.lunches}),setMeals:async selected=>{meals=selected;for(const [i,m] of selected.entries())if(!picking.state().points['LUNCH'+(i+1)]?.confirmed||picking.state().points['LUNCH'+(i+1)].location.join(',')!==m.candidate.location.join(','))picking.importCandidate('LUNCH'+(i+1),m.candidate);await saveSelections();},publish:async(result,request,plan)=>{lastResult=structuredClone(result);lastRequestKey=JSON.stringify(request);storedCase06Draft={version:1,requestHash:case06RequestHash(request),plan,originGeneratedAt:result.generatedAt,kind:'four-role-generated'};await saveCase06Draft(storedCase06Draft);},accept:async(result,request,plan)=>{await replan.adoptGenerated(result,request,plan);lastResult={...structuredClone(result),label:'已采用四角色生成方案'};lastRequestKey=JSON.stringify(request);}}):null;
  const dynamic=dynamicPlanning&&case06&&agentAllowed&&approval?.stages?.includes('dynamic-input')?createDynamicWorkflow({getCachedRoad,reserveRun:async()=>{if(approval?.stages?.includes('dynamic-input')){await ledger.claimDynamicRun();dynamicRunsUsed++;}const summary=await ledger.summary();return {remainingRoadRequests:Math.max(0,approval.caps.route-summary.counts.route)};},history:historicalDynamic||historicalGeneration,model:(...a)=>adapter.plan(...a),getRoad,ensureEnabled:assertEnabled,save:saveDynamicJournal,getSelections:()=>({picks:picking.state(),meals:structuredClone(meals),lunches:case06.lunches}),setMeals:async selected=>{for(const [i,m] of selected.entries()){meals[i]=m;const p=picking.state().points['LUNCH'+(i+1)];if(!p?.confirmed||p.location.join(',')!==m.candidate.location.join(','))picking.importCandidate('LUNCH'+(i+1),m.candidate);}await saveSelections();},publish:async(result,request,plan)=>{lastResult=structuredClone(result);lastRequestKey=JSON.stringify(request);storedCase06Draft={version:1,requestHash:case06RequestHash(request),plan,originGeneratedAt:result.generatedAt,kind:'dynamic-generated'};await saveCase06Draft(storedCase06Draft);},accept:async(result,request,plan)=>{await replan.adoptGenerated(result,request,plan);lastResult={...structuredClone(result),label:'已采用动态方案'};lastRequestKey=JSON.stringify(request);}}):null;
  const queryTargets={ENDPOINT:'山西博物院东门外公共广场',MUSEUM_GATE:'山西博物院东门',TY01:'山西博物院主馆入口',TY04:'迎泽公园北入口广场',TY05:'钟楼街',TY06:'食品街'};
  async function preparePlaces(){
   const issues=[];let lookups=0;
   for(const [id,keywords] of Object.entries(queryTargets)){
    if(picking.state().points[id]?.confirmed)continue;
    let pending=placeChoices.get(id);if(pending){issues.push(pending);continue;}
    if(++lookups>6)throw new PlanningError('PLACE_LIMIT','本次地点查询已到6次保护');
    try{const r=await adapter.searchPlaces(keywords,{signal:AbortSignal.timeout(20000)});const wanted=keywords.replace(/\s/g,'');const exact=r.candidates.filter(c=>c.name.replace(/\s/g,'')===wanted);
     // Institution/entrance/public meeting positions are distinct. Only a named street or named park square can auto-select a unique exact match from this page.
     const automatic=['TY04','TY05','TY06'].includes(id)&&exact.length===1&&r.declaredCount!==null&&r.declaredCount<=r.returned;
     if(automatic){picking.importCandidate(id,exact[0]);await saveSelections();continue;}
     pending={id,keywords,status:r.candidates.length?'choice':'missing',reason:['ENDPOINT','MUSEUM_GATE','TY01'].includes(id)?'入口或公共集合位置需明确，不能用机构中心替代':'同名或结果不足，请选择本次测试候选',candidates:r.candidates.slice(0,8)};
    }catch(e){pending={id,keywords,status:'failed',reason:e.message,candidates:[]};}
    placeChoices.set(id,pending);issues.push(pending);
   }
   return {ready:issues.length===0,issues,reused:Object.values(picking.state().points).filter(p=>p?.confirmed).length};
  }
  return {
    // Internal calls only; HTTP dispatch cannot select these methods by name.
    async frameCheck(){assertEnabled();if(!approval.sdkOnly&&!product)throw new PlanningError('SDK_ONLY','本阶段仅接通底图',403);const s=await ledger.summary();if(s.stopped||Date.parse(approval.expiresAt)<=Date.now())throw new PlanningError('RUN_STOPPED','已停止或授权到期',403);return {active:true};},
    async frameBootstrap(){await this.frameCheck();if(!mapLease||Date.now()>=mapLease.expiresAt)throw new PlanningError('MAP_LEASE','地图会话已失效',403);await ledger.claimMapBootstrap();return {jsKey:credentials.jsKey,expiresAt:mapLease.expiresAt};},
    async frameProxy(path,query){await this.frameCheck();if(path!=='/v3/log/init')throw new PlanningError('PROXY_SCOPE','仅允许初始化路径',403);return this.proxy(path,query,mapLease?.id);},
    frameCanReplace:()=>product,
    async frameEnd(){if(!product)return this.frameStop();mapReady=false;mapLease=null;proxyCount=0;if(!haltReason)await ledger.resource('map','closed');},
    async frameStop(){mapReady=false;if(!haltReason){haltReason='SDK_FAILED';try{await ledger.stop('SDK_FAILED');}catch(e){if(Date.parse(approval?.expiresAt)>Date.now())throw e;}}},
    capabilities:()=>({mode:'real-preparation',readOnly:!enabled(),dynamicRunExhausted:dynamicExhausted(),realCallsAllowed:enabled()&&!dynamicExhausted(),productFlow:product,agentReview:agentAllowed,journeyGeneration:!!generation,dynamicPlanning:!!dynamic,canRestorePreview:!!dynamic&&enabled()&&approval?.stages?.includes('history-preview-restore'),dynamicScope:DYNAMIC_SCOPE,replan08:replanAllowed,case06:!!case06,case06Ready:!!case06&&Object.values(picking.state().points).every(p=>p?.confirmed)&&meals.every(Boolean),canGenerate:enabled()&&!dynamicExhausted()&&(!manual||product)&&!approval?.sdkOnly&&!approval?.diagnosticOnly&&(case06?mapReady&&Object.values(picking.state().points).every(p=>p?.confirmed)&&meals.every(Boolean):proofAccepted||product&&!!picking.state().route?.geometry?.length),canPrepare:enabled()&&!approval?.diagnosticOnly,diagnosticOnly:!!approval?.diagnosticOnly,mapDisplayOnly:!!approval?.sdkOnly,supportsMapPicking:true,mapPicking:manual,haltReason,configuration,model:'用户点击后才请求',map:mapLease?'本次已领取加载许可':'未加载',entrances:structuredClone(entries),confirmed:[...locations.keys()],pending:[...pending.entries()].map(([token,p])=>({token,...p})),proofAccepted}),
    async action(path,input) {
      if(path.startsWith('/api/live/dynamic/')&&dynamic){
       if(path.endsWith('/state'))return {state:dynamic.state(input.request)};
       if(path.endsWith('/history'))return {state:dynamic.state()};
       if(path.endsWith('/invalidate'))return {invalidated:dynamic.invalidate(input.clientId??null)};
       if(path.endsWith('/preflight'))return {errors:dynamicScopeErrors(validateInput(input.request),replan.view().meta.lock),scope:DYNAMIC_SCOPE};
       if(path.endsWith('/prepare'))return exclusive(async()=>{const prepared=await preparePlaces();const required=prepared.issues.filter(i=>i.id==='ENDPOINT');return {...prepared,ready:required.length===0,issues:required,optionalIssues:prepared.issues.filter(i=>i.id!=='ENDPOINT')};});
       const request=validateInput(input.request);
       if(path.endsWith('/restore-preview')){assertEnabled();if(!approval?.stages?.includes('history-preview-restore'))throw new PlanningError('RECOVERY_SCOPE','尚未授权历史预览道路恢复');if(busy||generation?.running()||collaboration?.state()?.status==='running'||replan?.running())throw new PlanningError('BUSY','已有操作进行中');if(!mapReady)throw new PlanningError('SDK_NOT_READY','先显式加载地图再恢复历史预览道路');return {state:await dynamic.restore({request,locked:replan.view().meta.lock,clientId:input.clientId??null})};}
       if(path.endsWith('/start')||path.endsWith('/retry')){if(busy||generation?.running()||collaboration?.state()?.status==='running'||replan?.running())throw new PlanningError('BUSY','已有任务进行中');if(!mapReady)throw new PlanningError('SDK_NOT_READY','地图未就绪，未启动动态规划');return {state:await dynamic.start({request,original:replan.view().baseline,originalPlan:replan.reference()?.plan,locked:replan.view().meta.lock,retry:path.endsWith('/retry'),clientId:typeof input.clientId==='string'?input.clientId:null})};}
       if(path.endsWith('/select'))return dynamic.select(request,input);
       if(path.endsWith('/decide'))return dynamic.decide(request,input);
       throw new PlanningError('NOT_FOUND','动态入口不存在',404);
      }
      if(path.startsWith('/api/live/journey/')&&generation){
       if(path.endsWith('/state'))return {state:generation.state(input.request)};
       if(path.endsWith('/invalidate')){generation.invalidate();return {invalidated:true};}
       if(path.endsWith('/prepare'))return exclusive(preparePlaces);
       if(path.endsWith('/search'))return exclusive(async()=>{if(!Object.hasOwn(queryTargets,input.id)||picking.state().points[input.id]?.confirmed)throw new PlanningError('PLACE_SCOPE','仅查询当前缺失地点');const r=await adapter.searchPlaces(input.keywords,{signal:AbortSignal.timeout(20000)});const issue={id:input.id,keywords:input.keywords,status:'choice',reason:'请选择有来源的测试候选；不是官方入口核验',candidates:r.candidates.slice(0,8)};placeChoices.set(input.id,issue);return {issue};});
       if(path.endsWith('/choose'))return exclusive(async()=>{const issue=placeChoices.get(input.id),p=issue?.candidates.find(c=>c.id===input.poiId);if(!p||input.accepted!==true)throw new PlanningError('PLACE_CHOICE','需从本次返回候选明确选择');if(['ENDPOINT','MUSEUM_GATE','TY01'].includes(input.id)&&['ENDPOINT','MUSEUM_GATE','TY01'].some(id=>id!==input.id&&picking.state().points[id]?.location.join(',')===p.location.join(',')))throw new PlanningError('MUSEUM_SAME','集合、院门、主馆位置不能重用同一点');picking.importCandidate(input.id,p);placeChoices.delete(input.id);dynamic?.invalidate();generation.invalidate();await saveSelections();return {chosen:p.name};});
       if(path.endsWith('/meal'))return exclusive(async()=>{if(replan.view().meta.lock?.pointId==='LUNCH'+(input.dayIndex+1))throw new PlanningError('LOCK_ACTIVE','已有锁定，先明确解锁后换餐厅');const meal=validateMeal(input,case06);meals[meal.dayIndex]=meal;picking.importCandidate('LUNCH'+(meal.dayIndex+1),meal.candidate);await saveSelections();dynamic?.invalidate();generation.invalidate();replan.invalidate();lastResult=null;lastRequestKey=null;return {meal};});
       const request=validateInput(input.request);
       if(path.endsWith('/start')||path.endsWith('/retry')){assertEnabled();if(busy||dynamic?.running()||collaboration?.state()?.status==='running'||replan?.running())throw new PlanningError('BUSY','已有操作进行中');if(!mapReady)throw new PlanningError('SDK_NOT_READY','底图未就绪，未启动生成');return {state:await generation.start({request,original:replan.view().baseline||lastResult,locked:replan.view().meta.lock,retry:path.endsWith('/retry')})};}
       if(path.endsWith('/decide'))return generation.decide(request,input);
       throw new PlanningError('NOT_FOUND','规划入口不存在',404);
      }
      if(path.startsWith('/api/live/replan/')&&replan){
        if(path==='/api/live/replan/state')return replan.view();
        if(path==='/api/live/replan/save'){await replan.sync(validateInput(input.request));const s=dynamic?.state(input.request);if(s?.plan&&['preview','accepted','rejected'].includes(s.status))await replan.saveExternalPreview(s);return replan.saveStructure();}
        if(path==='/api/live/replan/export'){const s=dynamic?.state(input.request);if(s?.plan&&['preview','accepted','rejected'].includes(s.status))await replan.saveExternalPreview(s);return replan.exportStructure(input.kind);}
        if(path.endsWith('/agents/invalidate')){replan.cancelWorkflow();return {invalidated:true};}
        if(path==='/api/live/replan/invalidate'){replan.invalidate();return {invalidated:true};}
        if(path==='/api/live/replan/configure'){dynamic?.invalidate();collaboration?.invalidate();return replan.configure(input);}
        if(path==='/api/live/replan/sync'){generation?.invalidate();return replan.sync(input.request);}
        if(path==='/api/live/replan/unlock'){dynamic?.invalidate();return replan.unlock(input.confirmed);}
        if(path==='/api/live/replan/restore')return exclusive(async()=>{
          if(!mapReady)throw new PlanningError('SDK_NOT_READY','先显式加载地图，再恢复原方案真实道路');
          const adopted=replan.reference();if(!adopted)throw new PlanningError('BASELINE_REQUIRED','尚无采用版本记录，请先核查原交通链');
          const request=validateInput(adopted.request),plan=parsePlan(JSON.stringify(adopted.plan),request);
          let restored=await queryCase06({request,plan,state:picking.state(),meals,getRoad,signal:signal(),ensureCurrent(){},event(){},onFailure:e=>{throw e;},allowReorderDay2:true,dynamic:adopted.origin==='用户明确采用的动态方案',selectRoad:link=>{const pref=adopted.roadPreferences[`${link.from}>${link.to}`];if(!pref)throw new PlanningError('BASELINE_REQUIRED','原版本缺少交通方式来源');return getRoad(link.from,link.to,pref.mode,signal(),pref.strategy);}});
          if(adopted.lock)restored=applyLockedSchedule(restored,request,adopted.lock);
          const r={...restored,mode:'real',label:'恢复当前已采用方案',versionId:adopted.id,events:[],generatedAt:new Date().toISOString(),requestSnapshot:request};if(adopted.origin==='用户明确采用的动态方案'){r.quality=touringQuality(plan);r.adjustments=goalAdjustments(r);r.readiness={canAccept:numericRisks(r).length===0,issues:numericRisks(r).map(x=>x.kind+'仍需处理'),choices:[]};}lastResult=r;lastRequestKey=JSON.stringify(request);return replan.capture(r,request,plan);
        });
        const request=validateInput(input.request);
        if(path.endsWith('/agents/state'))return replan.state(request);
        if(path.endsWith('/agents/start')){if(busy||dynamic?.running()||generation?.running()||collaboration?.state()?.status==='running')throw new PlanningError('BUSY','其他规划仍在执行');return replan.start(request);}
        if(path.endsWith('/agents/decide'))return replan.decide(request,input);
        throw new PlanningError('NOT_FOUND','重排接口不存在',404);
      }
      if(path.startsWith('/api/live/agents/')&&collaboration){
        if(path.endsWith('/invalidate')){collaboration.invalidate();return {invalidated:true};}
        const request=validateInput(input.request);
        if(path.endsWith('/state'))return {state:collaboration.state(request)};
        if(path.endsWith('/invalidate')){collaboration.invalidate();return {invalidated:true};}
        if(path.endsWith('/decide')){const decision=collaboration.decide(request,input);lastResult=decision.result;return decision;}
        if(path.endsWith('/start')){assertEnabled();if(busy||dynamic?.running()||generation?.running()||replan?.running())throw new PlanningError('BUSY','原方案或重排正在核查');const {transportMode,...core}=request;if(lastRequestKey!==JSON.stringify(core)||storedCase06Draft?.requestHash!==case06RequestHash(request))throw new PlanningError('BASELINE_REQUIRED','当前需求没有原方案，请先手动核查原交通链');return {state:await collaboration.start({request,original:lastResult,plan:storedCase06Draft.plan,picks:picking.state(),meals:structuredClone(meals)})};}
        throw new PlanningError('NOT_FOUND','协作接口不存在',404);
      }
      if(path==='/api/live/ledger'){if(!ledger)assertEnabled();return ledger.summary();}
      if(path==='/api/live/invalidate'&&product){lastResult=null;lastRequestKey=null;return persistPicks(picking.invalidate());}
      if(path==='/api/live/result'&&product){const {transportMode,...request}=input;return lastResult&&lastRequestKey===JSON.stringify(request)?{result:{...structuredClone(lastResult),replay:true,label:'历史回放 · 当前服务内的真实草案与道路'}}:{result:null};}
      if(path==='/api/live/case06/state'&&case06)return {...structuredClone(case06),meals:structuredClone(meals),parkSelection:structuredClone(parkSelection),...picking.state()};
      if(path==='/api/live/case06/park'&&case06){assertEnabled();if(!mapReady)throw new PlanningError('SDK_NOT_READY','请先加载地图查看候选');if(input.accepted!==true)throw new PlanningError('PICK_CONFIRM','需明确接受北入口广场作为测试落点');const candidate=case06.parkCandidate;picking.edit('set',{id:'TY04',revision:input.revision,location:candidate.location});picking.edit('confirm',{id:'TY04',revision:picking.state().revision,accepted:true});parkSelection={candidate:structuredClone(candidate),acceptedAt:new Date().toISOString(),notice:'用户接受北入口广场作为测试落点，非官方北门核验'};locations.clear();for(const p of Object.values(picking.state().points))if(p?.confirmed)locations.set(p.id,structuredClone(p));return persistPicks(picking.state());}
      if(path==='/api/live/case06/meal'&&case06){assertEnabled();if(!mapReady)throw new PlanningError('SDK_NOT_READY','先加载真实地图，核对候选位置');const meal=validateMeal(input,case06);const id=meal.dayIndex===0?'LUNCH1':'LUNCH2';picking.edit('set',{id,revision:input.revision,location:meal.candidate.location});picking.edit('confirm',{id,revision:picking.state().revision,accepted:true});meals[meal.dayIndex]=meal;locations.clear();for(const p of Object.values(picking.state().points))if(p?.confirmed)locations.set(p.id,structuredClone(p));return persistPicks(picking.state());}
      if(path==='/api/live/pick/state')return {available:enabled()&&manual,mapReady,...picking.state(),...(case06?{meals:structuredClone(meals)}:{})};
      if(approval?.sdkOnly&&!['/api/live/map-lease','/api/live/sdk-event'].includes(path))throw new PlanningError('SDK_ONLY','本次仅底图加载与缩放拖动，不允许选点或业务查询',403);
      if(manual&&!product&&!['/api/live/map-lease','/api/live/sdk-event','/api/live/pick/set','/api/live/pick/begin','/api/live/pick/confirm','/api/live/pick/cancel','/api/live/pick/remove','/api/live/pick/mode','/api/live/pick/invalidate','/api/live/pick/route'].includes(path))throw new PlanningError('MAP_PICK_ONLY','本轮仅地图选点和首段道路，不允许搜索或模型',403);
      if(path.startsWith('/api/live/pick/')){
        assertEnabled();if(!manual)throw new PlanningError('PICK_SCOPE','尚未批准地图选点恢复范围',403);
        if(!mapReady)throw new PlanningError('SDK_NOT_READY','请先明确加载地图并等待底图就绪');
        const action=path.split('/').at(-1);
        if(action==='route')return exclusive(async()=>{const s=await picking.query(input);if(product&&s.route){const {id,from,to,status,...road}=s.route;roads.set(JSON.stringify([s.points.ENDPOINT.location,s.points.TY04.location,s.mode]),road);}return s;});
        if(action==='mode')return persistPicks(picking.setMode(input));
        if(action==='invalidate')return persistPicks(picking.invalidate());
        if(case06&&action==='confirm')assertSeparateMuseumPoints(picking.state(),input);
        const state=picking.edit(action,input);if(case06&&input.id==='TY04'&&['set','begin','remove'].includes(action))parkSelection=null;if(case06&&['set','begin','remove'].includes(action)&&['LUNCH1','LUNCH2'].includes(input.id))meals[input.id==='LUNCH1'?0:1]=null;if(product){locations.clear();for(const p of Object.values(state.points))if(p?.confirmed)locations.set(p.id,structuredClone(p));}
        return persistPicks(state);
      }
      if(approval?.diagnosticOnly&&path!=='/api/live/diagnose')throw new PlanningError('DIAGNOSTIC_ONLY','本次只允许1次统计诊断，不允许地点确认或任何下游操作',403);
      if(path==='/api/live/diagnose')return exclusive(async()=>{
        if(!approval.diagnosticOnly)throw new PlanningError('DIAGNOSTIC_SCOPE','尚未批准诊断范围',403);
        const entry=entries.find(p=>p.id===input.id);
        if(!entry||!approval.locationQueries?.includes(querySignature(entry.query)))throw new PlanningError('RECOVERY_SCOPE','不是批准的诊断目标',403);
        const statistics=await adapter.diagnoseTarget(entry.query,{signal:signal()});
        await stop('DIAGNOSTIC_COMPLETE',statistics);return {mode:'diagnostic-only',target:entry.id,statistics,notice:'本次单次诊断结束，已停止；不确认落点，不启动下游'};
      });
      if(path==='/api/live/sdk-event')return exclusive(async()=>{
        if(!mapLease)throw new PlanningError('MAP_LEASE','尚未领取SDK许可',403);
        if(input.event==='map-ready'&&Date.now()>=mapLease.expiresAt)throw new PlanningError('MAP_LEASE','地图会话已到期，迟到的加载完成不采用',403);
        if(!['script-loaded','map-ready','sdk-failed','resource-count'].includes(input.event))throw new PlanningError('RESOURCE_EVENT','未知SDK事件');
        if(input.event==='resource-count'){if(!input.counts||!['script','tiles','other'].every(k=>Number.isSafeInteger(input.counts[k])&&input.counts[k]>=0&&input.counts[k]<=10000))throw new PlanningError('RESOURCE_EVENT','资源计数无效');await ledger.resource('resources','snapshot',{script:input.counts.script,tiles:input.counts.tiles,other:input.counts.other});}
        else await ledger.resource(input.event==='script-loaded'?'script':'map',input.event==='script-loaded'?'loaded':input.event==='map-ready'?'ready':'failed');
        if(input.event==='map-ready')mapReady=true;
        if(input.event==='sdk-failed'){mapReady=false;await stop('SDK_FAILED');}return {recorded:true};
      });
      if(path==='/api/live/locate')return exclusive(async()=>{
        const entry=entries.find(p=>p.id===input.id);if(!entry)throw new PlanningError('LOCATION_ID','只允许本批候选');
        if(locations.has(entry.id)||[...pending.values()].some(p=>p.id===entry.id))throw new PlanningError('DUPLICATE','本次已查询此地点，不自动重查',409);
        const signature=querySignature(entry.query);
        if(approval.locationQueries&&!approval.locationQueries.includes(signature))throw new PlanningError('RECOVERY_SCOPE','该地点不在本次明确恢复范围，未请求',403);
        let result=located.get(signature);const reused=!!result;if(!result){result=await adapter.locateTarget(entry.query,{signal:signal()});located.set(signature,result);}
        const token=randomUUID();pending.set(token,{id:entry.id,...result});return {token,id:entry.id,...result,reused};
      });
      if(path==='/api/live/confirm')return exclusive(async()=>{
        const p=pending.get(input.token);if(!p||input.confirmed!==true)throw new PlanningError('CONFIRM_REQUIRED','需核对返回坐标与实际入口后明确确认');
        locations.set(p.id,{location:p.location,formattedAddress:p.formattedAddress,poiId:p.poiId,source:p.source,queriedAt:p.queriedAt,entranceVerified:true,confirmedAt:new Date().toISOString(),futureAccessVerified:false});pending.delete(input.token);return {confirmed:p.id};
      });
      if(path==='/api/live/road-test')return exclusive(async()=>{
        modeCheck(input.mode);if(input.from===input.to)throw new PlanningError('SAME_POINT','测试路段请选择不同入口');
        const road=await getRoad(input.from,input.to,input.mode==='mixed'?'transit':input.mode,signal());
        proof={id:randomUUID(),day:{legs:[{id:'proof',from:input.from,to:input.to,status:'available',...road}],activities:activities([input.from,input.to]).map((p,i)=>({...p,sequence:i,role:i===0?'集合出发':'测试终点'}))}};return proof;
      });
      if(path==='/api/live/map-lease')return exclusive(async()=>{
        if(!manual&&(!proof?.day.legs[0].geometryComplete||!proof.day.legs[0].geometry?.length))throw new PlanningError('PROOF_REQUIRED','先成功查询一条带几何的已确认路段');
        if(mapLease)throw new PlanningError('MAP_LIMIT','本轮地图加载已领取，不自动重复加载',429);
        if(!credentials.jsKey||!credentials.jsSecurityCode)throw new PlanningError('CONFIG_MISSING','JS Key或服务端安全密钥未配置',503);
        await ledger.reserve('map');mapLease={id:randomUUID(),expiresAt:Math.min(Date.parse(approval.expiresAt),Date.now()+(product?7200000:manual&&!approval.sdkOnly?1800000:600000))};return {jsKey:credentials.jsKey,lease:mapLease.id,expiresAt:mapLease.expiresAt};
      });
      if(path==='/api/live/accept-proof')return exclusive(async()=>{
        if(!mapLease||mapLease.id!==input.lease||Date.now()>mapLease.expiresAt||input.proofId!==proof?.id||input.visibleConfirmed!==true)throw new PlanningError('PROOF_REQUIRED','先核对单路段地图显示与列表联动');
        proofAccepted=true;return {proofAccepted:true};
      });
      throw new PlanningError('NOT_FOUND','接口不存在',404);
    },
    async proxy(rawPath,query,lease) {
      try{
      assertEnabled();if(!mapLease||mapLease.id!==lease||Date.now()>mapLease.expiresAt)throw new PlanningError('MAP_LEASE','地图许可无效或已到期',403);
      // No SDK search/direction plugins: these would bypass the route ledger.
      if(rawPath==='/v3/log/init') {
        if(++proxyCount>(product?64:4))throw new PlanningError('PROXY_LIMIT','SDK初始化代理请求上限已到',429);
        const {request,callback}=sdkInitRequest(query,credentials);
        await ledger.resource('sdk-init-proxy','requested');const response=await send(request);
        if(response?.status!==200)throw new PlanningError('UPSTREAM_FAILED','SDK初始化上游失败，未重试',502);
        return sdkScriptReply(callback,response.body,credentials);
      }
      buildJsProxyRequest(rawPath,query,credentials);
      throw new PlanningError('PROXY_SCOPE','此SDK业务服务未授权；请使用受控本地路线入口',403);
      }catch(e){if(manual&&enabled()){mapReady=false;await stop('SDK_PROXY_FAILED',{reason:e.code||'proxy-failed',...(e.diagnostic?{upstream:e.diagnostic}:{}),parameterNames:[...new URLSearchParams(query).keys()].filter(k=>/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k))});}throw e;}
    },
    async run(raw,{signal:externalSignal}={}) {
      if(manual&&!product)throw new PlanningError('MAP_PICK_ONLY','本轮不允许模型或完整行程调用',403);
      if(approval?.diagnosticOnly)throw new PlanningError('DIAGNOSTIC_ONLY','本次没有模型或道路授权',403);
      return exclusive(async()=>{
        if(case06){assertCase06Ready(validateInput(raw),picking.state(),meals);if(!mapReady)throw new PlanningError('SDK_NOT_READY','请先显式加载地图，再发起完整交通核查');}
        if(!case06&&!proofAccepted&&!(product&&picking.state().route?.geometry?.length))throw new PlanningError('PROOF_REQUIRED','先完成单路段地图联动验收，尚未调用模型',403);
        const request=validateInput(raw);modeCheck(raw.transportMode);lastResult=null;lastRequestKey=null;
        const startedRevision=picking.state().revision;
        const ensureCurrent=()=>{if(product&&(startedRevision!==picking.state().revision||externalSignal?.aborted))throw new PlanningError('CANCELLED','需求或测试落点已改变，旧草案与路段不采用',409);};
        const payload=modelInput(request);if(case06)payload.instructions+=' 本轮固定两天案例组合与顺序：第1天TY01、meal、TY04；第2天TY05、meal、TY06；不得改变该顺序，模型仅解释偏好与建议范围内停留，门店与入口由用户确认资料补入。';if(Buffer.byteLength(JSON.stringify(payload))>8000)throw new PlanningError('PROMPT_LIMIT','匿名输入与资料超过8000字节保守上限');
        const stop=AbortSignal.any([signal(),...(externalSignal?[externalSignal]:[])]),events=[];const event=(stage,status)=>events.push({stage,status,at:new Date().toISOString()});
        let response,plan,draftProvenance=null;
        if(case06&&storedCase06Draft?.version===1&&storedCase06Draft.requestHash===case06RequestHash(request)){plan=parsePlan(JSON.stringify(storedCase06Draft.plan),request);response={usage:null};draftProvenance={kind:storedCase06Draft.kind,originGeneratedAt:storedCase06Draft.originGeneratedAt,notice:storedCase06Draft.notice||'复用已验证的真实游览草案，本次未请求模型'};event('planner','reused-validated-visits');}
        else{event('planner','running');response=await adapter.plan(payload,{signal:stop});ensureCurrent();plan=parsePlan(response.content,request);if(case06){storedCase06Draft={version:1,requestHash:case06RequestHash(request),plan,originGeneratedAt:new Date().toISOString(),originalUsage:response.usage,kind:'model-validated'};await saveCase06Draft(storedCase06Draft);}}
        event('planner','validated');
        if(case06){const completed=await queryCase06({request,plan,state:picking.state(),meals:structuredClone(meals),getRoad,signal:stop,ensureCurrent,event,onFailure:async e=>{await ledger.stop('ROUTE_FAILED',{reason:e.code||'FAILED',...(e.diagnostic?{upstream:e.diagnostic}:{})});haltReason='ROUTE_FAILED';}});ensureCurrent();event('review','completed');const result={mode:'real',label:draftProvenance?'沿用真实游览草案 · 用户午餐 · 每日交通重新核查':'真实模型草案 · 用户午餐选择 · 每日交通链核查',draftProvenance,...completed,events,usage:response.usage,callRecord:await ledger.summary(),generatedAt:new Date().toISOString()};const {transportMode,...core}=request;lastRequestKey=JSON.stringify(core);lastResult=structuredClone(result);if(replanAllowed&&!replan.reference())await replan.capture(result,request,plan);return result;}
        const legs=[];let stopped=false;
        for(const leg of requiredLegs(plan).slice(0,24)) {
          ensureCurrent();
          const missing={...leg,status:'missing',reason:'入口未知，未查询道路',minutes:null,walkingMeters:null,fareCentsPerPerson:null};
          if(stopped){legs.push({...missing,reason:'前段失败或额度停止，未继续调用'});continue;}
          if(leg.from==='MEAL_PENDING'||leg.to==='MEAL_PENDING'){legs.push({...missing,reason:'午餐落点未知，不跨缺口连线'});continue;}
          if(!locations.has(leg.from)||!locations.has(leg.to)){legs.push(missing);continue;}
          if(leg.from==='ENDPOINT'&&leg.to==='TY01'||leg.from==='TY01'&&leg.to==='ENDPOINT'){
            legs.push({...missing,reason:'集合点与场馆入口关系及内部步行边界未核实'});continue;
          }
          event(leg.id,'running');
          try {const mode=raw.transportMode==='mixed'?(['TY05','TY06'].includes(leg.from)&&['TY05','TY06'].includes(leg.to)?'walk':'transit'):raw.transportMode;const road=await getRoad(leg.from,leg.to,mode,stop);legs.push({...leg,status:'available',...road});event(leg.id,'completed');}
          catch(e) {if(e.code==='CANCELLED')throw e;stopped=true;await ledger.stop('ROUTE_FAILED');haltReason='ROUTE_FAILED';legs.push({...missing,reason:'道路失败/超时/额度不足；停止后续交通请求，无重试'});event(leg.id,'failed');}
        }
        const review=reviewPlan(request,plan,legs);review.days.forEach((d,i)=>{const items=plan.days[i].items;d.activities=[{...activities(['ENDPOINT'])[0],sequence:0,role:'集合出发/返回'},...items.map((x,j)=>x.type==='meal'?{id:`MEAL_PENDING-${i}`,name:'待选用餐区段',sequence:j+1,role:'用餐缺口',entranceVerified:false}:{...activities([x.candidateId])[0],sequence:j+1,role:'活动'})];});event('review','completed');
        ensureCurrent();const result={mode:'real',label:'真实单次模型草案 · 高德路段仅部分查询',review,events,usage:response.usage,callRecord:await ledger.summary(),generatedAt:new Date().toISOString()};ensureCurrent();const {transportMode,...core}=request;lastRequestKey=JSON.stringify(core);lastResult=structuredClone(result);return result;
      });
    },
  };
}
