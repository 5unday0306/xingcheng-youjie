import {randomUUID} from 'node:crypto';
import {catalog} from '../data/taiyuan.mjs';
import {locationTargets,querySignature} from '../data/location-targets.mjs';
import {PlanningError,validateInput,modelInput,parsePlan,requiredLegs,reviewPlan} from './planning.mjs';
import {createUpstreamAdapters,buildJsProxyRequest} from './upstream-contract.mjs';

export const entranceList=locationTargets;
// Runtime-only facts; no raw map data or personal input written to disk.
export function createLivePlanning({credentials={},configuration={},approval=null,ledger=null,send=null,initialStop=null}={}) {
  const locations=new Map(),pending=new Map(),located=new Map(),roads=new Map();let busy=false,proof=null,mapLease=null,proofAccepted=false,proxyCount=0;
  let haltReason=initialStop;
  const enabled=()=>!!approval&&!!ledger&&!!send&&!haltReason;
  const assertEnabled=()=>{if(!enabled())throw new PlanningError('AUTH_REQUIRED','新授权与账号费用边界尚未确认，未调用',403);};
  const adapter=createUpstreamAdapters({credentials,model:approval?.model,enabled:enabled(),send,reserve:k=>ledger.reserve(k),finish:(...a)=>ledger.finish(...a)});
  const stop=async (code,diagnostic)=>{haltReason=code;await ledger.stop(code,diagnostic);};
  const exclusive=async action=>{assertEnabled();if(busy)throw new PlanningError('BUSY','本机已有请求，未并行调用',409);busy=true;try{return await action();}catch(e){if(['UPSTREAM_DATA','UPSTREAM_FAILED','CALL_LIMIT','MODEL_JSON','PLAN_SCHEMA','TIMEOUT','STOPPED'].includes(e.code))await stop(e.code,e.diagnostic);throw e;}finally{busy=false;}};
  const signal=()=>AbortSignal.timeout(180000);
  const locatePoint=id=>{const p=locations.get(id);if(!p)throw new PlanningError('ENTRANCE_UNKNOWN','所选入口尚未人工确认，未查询道路');return p;};
  const modeCheck=mode=>{if(!['walk','transit','mixed'].includes(mode))throw new PlanningError('MODE','请明确选择本次路段采用步行或公交地铁');};
  const activities=ids=>ids.map(id=>({id,name:entranceList().find(p=>p.id===id)?.name||'未知',...locations.get(id)}));
  async function getRoad(from,to,mode,signal){
    const origin=locatePoint(from),destination=locatePoint(to),key=JSON.stringify([origin.location,destination.location,mode]);
    if(roads.has(key))return {...roads.get(key),reused:true};
    const road={...await adapter.road({origin,destination,mode},{signal}),queriedAt:new Date().toISOString(),reused:false};roads.set(key,road);return road;
  }
  return {
    capabilities:()=>({mode:'real-preparation',realCallsAllowed:enabled(),canGenerate:enabled()&&proofAccepted,canPrepare:enabled(),haltReason,configuration,model:'用户点击后才请求',map:mapLease?'本次已领取加载许可':'未加载',entrances:entranceList(),confirmed:[...locations.keys()],pending:[...pending.entries()].map(([token,p])=>({token,...p})),proofAccepted}),
    async action(path,input) {
      if(path==='/api/live/ledger'){if(!ledger)assertEnabled();return ledger.summary();}
      if(path==='/api/live/sdk-event')return exclusive(async()=>{
        if(!mapLease)throw new PlanningError('MAP_LEASE','尚未领取SDK许可',403);
        if(!['script-loaded','map-ready','sdk-failed','resource-count'].includes(input.event))throw new PlanningError('RESOURCE_EVENT','未知SDK事件');
        if(input.event==='resource-count'){if(!input.counts||!['script','tiles','other'].every(k=>Number.isSafeInteger(input.counts[k])&&input.counts[k]>=0&&input.counts[k]<=10000))throw new PlanningError('RESOURCE_EVENT','资源计数无效');await ledger.resource('resources','snapshot',{script:input.counts.script,tiles:input.counts.tiles,other:input.counts.other});}
        else await ledger.resource(input.event==='script-loaded'?'script':'map',input.event==='script-loaded'?'loaded':input.event==='map-ready'?'ready':'failed');
        if(input.event==='sdk-failed')await stop('SDK_FAILED');return {recorded:true};
      });
      if(path==='/api/live/locate')return exclusive(async()=>{
        const entry=entranceList().find(p=>p.id===input.id);if(!entry)throw new PlanningError('LOCATION_ID','只允许本批候选');
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
        if(!proof?.day.legs[0].geometryComplete||!proof.day.legs[0].geometry?.length)throw new PlanningError('PROOF_REQUIRED','先成功查询一条带几何的已确认路段');
        if(mapLease)throw new PlanningError('MAP_LIMIT','本轮地图加载已领取，不自动重复加载',429);
        if(!credentials.jsKey||!credentials.jsSecurityCode)throw new PlanningError('CONFIG_MISSING','JS Key或服务端安全密钥未配置',503);
        await ledger.reserve('map');mapLease={id:randomUUID(),expiresAt:Date.now()+600000};return {jsKey:credentials.jsKey,lease:mapLease.id,expiresAt:mapLease.expiresAt};
      });
      if(path==='/api/live/accept-proof')return exclusive(async()=>{
        if(!mapLease||mapLease.id!==input.lease||Date.now()>mapLease.expiresAt||input.proofId!==proof?.id||input.visibleConfirmed!==true)throw new PlanningError('PROOF_REQUIRED','先核对单路段地图显示与列表联动');
        proofAccepted=true;return {proofAccepted:true};
      });
      throw new PlanningError('NOT_FOUND','接口不存在',404);
    },
    async proxy(rawPath,query,lease) {
      assertEnabled();if(!mapLease||mapLease.id!==lease||Date.now()>mapLease.expiresAt)throw new PlanningError('MAP_LEASE','地图许可无效或已到期',403);
      // No SDK search/direction plugins: these would bypass the route ledger.
      if(rawPath==='/v3/log/init') {
        const q=new URLSearchParams(query);if(++proxyCount>4)throw new PlanningError('PROXY_LIMIT','SDK初始化代理请求上限已到',429);
        for(const [k,v] of q)if(!['key','v','type','platform','logversion','product','sdkversion'].includes(k)||q.getAll(k).length!==1||v.length>200)throw new PlanningError('PROXY_DENIED','SDK参数不在已核对范围；停止，不扩大代理',403);
        if(q.get('key')!==credentials.jsKey)throw new PlanningError('PROXY_DENIED','JS Key不匹配',403);
        await ledger.resource('sdk-init-proxy','requested');q.set('jscode',credentials.jsSecurityCode);return (await send({url:`https://restapi.amap.com/v3/log/init?${q}`,method:'GET'})).body;
      }
      buildJsProxyRequest(rawPath,query,credentials);
      throw new PlanningError('PROXY_SCOPE','此SDK业务服务未授权；请使用受控本地路线入口',403);
    },
    async run(raw,{signal:externalSignal}={}) {
      return exclusive(async()=>{
        if(!proofAccepted)throw new PlanningError('PROOF_REQUIRED','先完成单路段地图联动验收，尚未调用模型',403);
        const request=validateInput(raw);modeCheck(raw.transportMode);
        const payload=modelInput(request);if(Buffer.byteLength(JSON.stringify(payload))>8000)throw new PlanningError('PROMPT_LIMIT','匿名输入与资料超过8000字节保守上限');
        const stop=AbortSignal.any([signal(),...(externalSignal?[externalSignal]:[])]),events=[];const event=(stage,status)=>events.push({stage,status,at:new Date().toISOString()});
        event('planner','running');const response=await adapter.plan(payload,{signal:stop});const plan=parsePlan(response.content,request);event('planner','validated');
        const legs=[];let stopped=false;
        for(const leg of requiredLegs(plan)) {
          const missing={...leg,status:'missing',reason:'入口未知，未查询道路',minutes:null,walkingMeters:null,fareCentsPerPerson:null};
          if(stopped){legs.push({...missing,reason:'前段失败或额度停止，未继续调用'});continue;}
          if(leg.from==='MEAL_PENDING'||leg.to==='MEAL_PENDING'){legs.push({...missing,reason:'午餐落点未知，不跨缺口连线'});continue;}
          if(!locations.has(leg.from)||!locations.has(leg.to)){legs.push(missing);continue;}
          if(leg.from==='ENDPOINT'&&leg.to==='TY01'||leg.from==='TY01'&&leg.to==='ENDPOINT'){
            legs.push({...missing,reason:'集合点与场馆入口关系及内部步行边界未核实'});continue;
          }
          event(leg.id,'running');
          try {const mode=raw.transportMode==='mixed'?(['TY05','TY06'].includes(leg.from)&&['TY05','TY06'].includes(leg.to)?'walk':'transit'):raw.transportMode;const road=await getRoad(leg.from,leg.to,mode,stop);legs.push({...leg,status:'available',...road});event(leg.id,'completed');}
          catch {stopped=true;await ledger.stop('ROUTE_FAILED');haltReason='ROUTE_FAILED';legs.push({...missing,reason:'道路失败/超时/额度不足；停止后续交通请求，无重试'});event(leg.id,'failed');}
        }
        const review=reviewPlan(request,plan,legs);review.days.forEach((d,i)=>{const items=plan.days[i].items;d.activities=[{...activities(['ENDPOINT'])[0],sequence:0,role:'集合出发/返回'},...items.map((x,j)=>x.type==='meal'?{id:`MEAL_PENDING-${i}`,name:'待选用餐区段',sequence:j+1,role:'用餐缺口',entranceVerified:false}:{...activities([x.candidateId])[0],sequence:j+1,role:'活动'})];});event('review','completed');
        return {mode:'real',label:'真实单次模型草案 · 高德路段仅部分查询',review,events,usage:response.usage,callRecord:await ledger.summary(),generatedAt:new Date().toISOString()};
      });
    },
  };
}
