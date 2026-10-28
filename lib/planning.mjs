import {validateRequest} from '../web/core.js';
import {catalog} from '../data/taiyuan.mjs';

export class PlanningError extends Error {
  constructor(code,message,status=422) { super(message);this.code=code;this.status=status; }
}
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x,allowed) => object(x) && Object.keys(x).every(k=>allowed.includes(k));
const range = x => Array.isArray(x)&&x.length===2&&x.every(Number.isSafeInteger)&&x[0]>=0&&x[1]>=x[0];
const minute = x => Number(x.slice(0,2))*60+Number(x.slice(3));
// Decimal upper limits are rounded down to the accounting unit without float drift.
export function scaledLimit(value,scale) {
  const [coefficient,exponent='0']=String(value).split('e');
  const decimals=(coefficient.split('.')[1]||'').length;
  const power=Number(exponent)-decimals;
  let numerator=BigInt(coefficient.replace('.',''))*BigInt(scale);
  if(power>=0)numerator*=10n**BigInt(power);else numerator/=10n**BigInt(-power);
  return Number(numerator);
}
export function validateInput(request) {
  const errors=validateRequest(request);
  if(errors.length) throw new PlanningError('INVALID_INPUT','需求未通过服务端校验');
  for(const m of request.members) {
    if(m.id.length>80||m.name.length>60||m.preference.length>2000||!Number.isSafeInteger(Math.round(m.budget*100))||m.walking.some(v=>!Number.isSafeInteger(Math.round(v*1000)))) {
      throw new PlanningError('INPUT_LIMIT','个人文本或数值超过本轮处理上限，请缩短或调整');
    }
  }
  // Use only approved input fields. Display names and endpoint text do not go to the model.
  return structuredClone(request);
}
export function modelInput(request,data=catalog()) {
  return {city:request.city,days:request.days.map(d=>({date:d.date,start:d.start,end:d.end})),
    members:request.members.map((m,i)=>({id:`person-${i+1}`,preference:m.preference,budget:m.budget,walking:m.walking})),
    // Preserve the full sourced records in the catalog/reviewer; send only planning fields.
    candidates:data.candidates.map(c=>({id:c.id,name:c.name,stayMinutes:{status:c.stayMinutes.status,value:c.stayMinutes.value},internalMeters:{status:c.internalMeters.status,value:c.internalMeters.value},opening:{status:c.opening.status,value:c.opening.value},ticketCents:{status:c.ticketCents.status,value:c.ticketCents.value},...(c.foodCents?{foodCents:{status:c.foodCents.status,value:c.foodCents.value}}:{})})),
    instructions:'仅返回一个JSON对象，根字段严格为version和days；version必须为数字1，days是数组。每天对象严格为date和items；date与输入对应，items是数组。游览项严格为{"type":"visit","candidateId":"候选ID","durationMinutes":整数,"reason":"理由"}；durationMinutes必须落在该候选stayMinutes.value上下界内，不能为满足偏好缩短到下界之外。候选ID在全程最多出现一次。每天恰好一项{"type":"meal","reason":"具体门店待确定"}，meal不能添加candidateId或durationMinutes。不能新增字段、坐标、票价、营业事实或放宽约束；未知保留。即使资料不足，也按此合同输出草案而不是改用另一种解释对象。'};
}
export function parsePlan(raw,request,data=catalog()) {
  let plan;
  try { if(typeof raw!=='string'||Buffer.byteLength(raw)>24000) throw Error();plan=JSON.parse(raw); }
  catch { throw new PlanningError('MODEL_JSON','规划输出不是有效且大小受限的JSON'); }
  const fail=(reason='invalid-item')=>{const e=new PlanningError('PLAN_SCHEMA','草案结构、候选或停留时间无效，未继续查询交通');e.diagnostic={stage:'plan-schema',reason};throw e;};
  if(!keys(plan,['version','days'])||plan.version!==1||!Array.isArray(plan.days)||plan.days.length!==request.days.length)fail('root-fields-version-or-day-count');
  const seen=new Set();
  plan.days.forEach((d,i)=>{
    if(!keys(d,['date','items'])||d.date!==request.days[i].date||!Array.isArray(d.items)||d.items.length>5||d.items.filter(x=>x?.type==='meal').length!==1)fail('day-fields-date-or-meal-count');
    for(const item of d.items) {
      if(!object(item)||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>500)fail();
      if(item.type==='meal') { if(!keys(item,['type','reason']))fail();continue; }
      const candidate=data.candidates.find(c=>c.id===item.candidateId);
      if(item.type!=='visit'||!keys(item,['type','candidateId','durationMinutes','reason'])||!candidate||seen.has(candidate.id))fail();
      if(!Number.isInteger(item.durationMinutes)||item.durationMinutes<candidate.stayMinutes.value[0]||item.durationMinutes>candidate.stayMinutes.value[1])fail('stay-duration');
      seen.add(candidate.id);
    }
  });
  return plan;
}
export function requiredLegs(plan) {
  return plan.days.flatMap((day,dayIndex)=>{
    const ids=['ENDPOINT',...day.items.map(x=>x.type==='meal'?'MEAL_PENDING':x.candidateId),'ENDPOINT'];
    return ids.slice(1).map((to,i)=>({id:`day${dayIndex+1}-leg${i+1}`,dayIndex,from:ids[i],to}));
  });
}
function total(parts,limit) {
  const known=parts.filter(p=>p.value!==null), missing=parts.filter(p=>p.value===null).map(p=>p.reason);
  const lower=known.reduce((a,p)=>a+p.value[0],0),upper=known.reduce((a,p)=>a+p.value[1],0);
  return {status:lower>limit?'conflict':missing.length?'insufficient':upper>limit?'uncertain':'within_estimate',
    value:missing.length?null:[lower,upper],knownSubtotal:[lower,upper],limit,missing};
}
const part=(value,reason)=>({value,reason});
function fieldPart(f,reason,date) {
  // Platform references do not count as confirmed numerical facts.
  return part(f&&['estimate','fact'].includes(f.status)&&range(f.value)&&(!f.applicableDate||f.applicableDate===date)?f.value:null,reason);
}
export function reviewPlan(request,plan,legs,data=catalog(),context={}) {
  legs=requiredLegs(plan).map(required=>legs.find(l=>l.id===required.id)??{...required,status:'missing',minutes:null,walkingMeters:null,fareCentsPerPerson:null});
  const memberCosts=request.members.map(()=>[]);
  const days=plan.days.map((day,index)=>{
    const visits=day.items.filter(i=>i.type==='visit').map(i=>({item:i,c:data.candidates.find(c=>c.id===i.candidateId)}));
    const messages=[],time=[],walk=[],cost=[];
    for(const {item,c} of visits) {
      time.push(part([item.durationMinutes,item.durationMinutes],`${c.name}停留`),fieldPart(c.waitingMinutes,`${c.name}等待未知`,day.date));
      cost.push(fieldPart(c.ticketCents,`${c.name}门票未知`,day.date));
      if(c.foodCents)cost.push(fieldPart(c.foodCents,`${c.name}逛吃金额未知`,day.date));
      const overlapping=c.overlapGroup&&visits.some(v=>v.c.id!==c.id&&v.c.overlapGroup===c.overlapGroup);
      if(!overlapping)walk.push(fieldPart(c.internalMeters,`${c.name}内部步行未知`,day.date));
      // No invented deduplication when two street ranges overlap.
      else if(!messages.includes('街区内部步行重叠，去重边界未知')) {walk.push(part(null,'街区内部步行重叠，去重边界未知'));messages.push('街区内部步行重叠，去重边界未知');}
      if(c.opening.status!=='fact'||c.opening.applicableDate!==day.date)messages.push(`${c.name}当日开放/预约未核实`);
      else if(item.durationMinutes>c.opening.value[1]-c.opening.value[0])messages.push(`${c.name}违反已知开放或入场窗口`);
    }
    const meal=context.meals?.[index];
    time.push(part(meal?[meal.durationMinutes,meal.durationMinutes]:null,'午餐停留未知'));
    if(meal)time.push(part(null,'餐厅等位与旅行日营业未知'));
    cost.push(part(meal?meal.costCentsPerPerson:null,'午餐费用未知'));
    cost.push(part(null,'其他餐饮总额未核实（逛吃不替代午餐）'));
    walk.push(part(null,meal?'餐厅内部步行未知':'用餐落点及内部步行未知'));
    for(const leg of legs.filter(l=>l.dayIndex===index)) {
      const ok=leg.status==='available';
      time.push(part(ok?leg.minutes:null,`${leg.id}交通时长未知`));
      walk.push(part(ok?leg.walkingMeters:null,`${leg.id}道路/接驳步行未知`));
      cost.push(part(ok?leg.fareCentsPerPerson:null,`${leg.id}逐人交通费未知`));
      if(ok&&leg.excludesInternal!==true)walk.push(part(null,`${leg.id}道路与内部步行去重未确认`));
    }
    let cursor=minute(request.days[index].start);
    // Earliest known arrival can prove a conflict, never prove full executability.
    const timeline=day.items.map((item,itemIndex)=>{
      const leg=legs.find(l=>l.id===`day${index+1}-leg${itemIndex+1}`);
      const arrival=cursor===null||leg?.status!=='available'||!leg.minutes?null:cursor+leg.minutes[0];
      const c=data.candidates.find(c=>c.id===item.candidateId);
      if(c&&arrival!==null&&c.opening.status==='fact'&&c.opening.applicableDate===day.date) {
        const [open,close]=c.opening.value;
        const last=c.lastEntry.status==='fact'&&c.lastEntry.applicableDate===day.date?c.lastEntry.value:close;
        // An early arrival can wait. A lower bound already after closing cannot.
        if(Math.max(arrival,open)+item.durationMinutes>close||arrival>last)messages.push(`${c.name}违反已知开放或入场窗口`);
      }
      cursor=item.type==='meal'||arrival===null?null:arrival+item.durationMinutes;
      return {type:item.type,candidateId:item.candidateId??null,name:c?.name??'待选用餐区段',durationMinutes:item.durationMinutes??null,
        arrivalMinute:null,reason:item.reason,notice:'交通/等待与午餐尚未齐全，不给出确定到离时间'};
    });
    const end=minute(request.days[index].end),timeCheck=total(time,end-minute(request.days[index].start));
    if(messages.some(m=>m.includes('违反')))timeCheck.status='conflict';
    const members=request.members.map((m,i)=>{
      memberCosts[i].push(...cost);
      return {id:m.id,name:m.name,walking:total(context.walkBounds?.[index]?[part(context.walkBounds[index],'道路与内部步行保守包络'),...walk.filter(p=>p.value===null)]:walk,scaledLimit(m.walking[index],1000)),dayCost:total(cost,scaledLimit(m.budget,100))};
    });
    return {date:day.date,time:timeCheck,members,timeline,messages,legs:legs.filter(l=>l.dayIndex===index)};
  });
  const members=request.members.map((m,i)=>({id:m.id,name:m.name,budget:total(memberCosts[i],scaledLimit(m.budget,100))}));
  const conflict=days.some(d=>d.time.status==='conflict'||d.members.some(m=>m.walking.status==='conflict'))||members.some(m=>m.budget.status==='conflict');
  return {status:conflict?'conflict':'insufficient',executable:false,structure:'valid',days,members,
    notice:'草案结构已检查；未知项未置零，行程可行性未验证。'};
}

async function bounded(action,ms,signal) {
  if(signal?.aborted)throw new PlanningError('STOPPED','运行已停止',504);
  const controller=new AbortController();
  const forward=()=>controller.abort();signal?.addEventListener('abort',forward,{once:true});
  let timer;
  try { return await Promise.race([action(controller.signal),new Promise((_,reject)=>{
    timer=setTimeout(()=>{reject(new PlanningError('TIMEOUT','离线模块超时，已停止，无自动重试',504));controller.abort();},ms);
  }),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new PlanningError('STOPPED','运行已停止',504)),{once:true}))]); }
  finally {clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
export function createPlanningService({planner=null,route=null,mode='offline',timeoutMs=45000,routeTimeoutMs=15000,runTimeoutMs=180000}={}) {
  let busy=false;
  return {
    capabilities:()=>({mode,realCallsAllowed:false,canGenerate:mode==='offline-test'&&!!planner,model:'未调用',map:'未加载',configuration:'未读取本机凭据'}),
    async run(input) {
      const request=validateInput(input);
      if(mode!=='offline-test'||!planner)throw new PlanningError('OFFLINE_ONLY','本轮仅离线实现，真实生成与地图调用未授权',403);
      if(busy)throw new PlanningError('BUSY','已有一次运行，请等待结束',409);
      busy=true;
      const events=[],calls={model:0,location:0,route:0,map:0},controller=new AbortController();
      const overall=setTimeout(()=>controller.abort(),runTimeoutMs);
      const event=(stage,status)=>events.push({stage,status,at:new Date().toISOString()});
      try {
        const data=catalog();event('input','validated');event('planner','running');
        calls.model++;
        const payload=modelInput(request,data);
        if(Buffer.byteLength(JSON.stringify(payload))>8000)throw new PlanningError('PROMPT_LIMIT','匿名需求与资料超过保守输入上限，请缩短需求');
        const raw=await bounded(signal=>planner(payload,{signal}),timeoutMs,controller.signal);
        const plan=parsePlan(raw,request,data);event('planner','validated');
        const required=requiredLegs(plan),legs=[];
        for(const leg of required) {
          if(controller.signal.aborted)throw new PlanningError('STOPPED','运行超时，未继续下游',504);
          const missing={...leg,status:'missing',reason:'离线模式：未查询真实道路',minutes:null,walkingMeters:null,fareCentsPerPerson:null};
          if(leg.from==='MEAL_PENDING'||leg.to==='MEAL_PENDING') {legs.push({...missing,reason:'午餐落点未知，不能查询或跨过缺口连线'});continue;}
          if(!route||calls.route>=12) {legs.push({...missing,reason:calls.route>=12?'路段上限已到，停止查询':missing.reason});continue;}
          calls.route++;event(leg.id,'running');
          try {
            const result=await bounded(signal=>route(leg,{signal}),routeTimeoutMs,controller.signal);
            if(!object(result)||!['walk','transit'].includes(result.mode)||!range(result.minutes)||!range(result.walkingMeters)||!(result.fareCentsPerPerson===null||range(result.fareCentsPerPerson)))throw Error();
            legs.push({...leg,status:'available',mode:result.mode,minutes:result.minutes,walkingMeters:result.walkingMeters,fareCentsPerPerson:result.fareCentsPerPerson,excludesInternal:result.excludesInternal===true,source:'离线测试替身，非地图数据'});
            event(leg.id,'completed');
          } catch {legs.push({...missing,reason:'路段测试失败，已停止后续交通查询，无重试'});event(leg.id,'failed');
            for(const rest of required.slice(legs.length))legs.push({...rest,status:'missing',reason:'前段失败，未调用',minutes:null,walkingMeters:null,fareCentsPerPerson:null});break;}
        }
        event('review','completed');
        return {mode:'offline-test',label:'离线替身测试 · 非真实模型或地图结果',review:reviewPlan(request,plan,legs,data),events,
          testAdapterInvocations:calls,realCalls:{model:0,location:0,route:0,map:0},generatedAt:new Date().toISOString()};
      } catch(error) {
        if(error instanceof PlanningError)throw error;
        throw new PlanningError('PLANNER_FAILED','规划测试失败，已停止，不重试',502);
      } finally {clearTimeout(overall);busy=false;}
    }
  };
}
