export const STORAGE_KEY='xingchengyoujie.requirements.v1';
export const ENDPOINT={name:'山西博物院东门外公共集合点',address:'太原市滨河西路北段13号（东门地址线索）',verified:false};
export const GAPS=['入口实际落点与现场通行待人工核对','所选日期的营业、预约与名额待核实','具体午餐门店、时间、价格待确定','交通时长、费用及接驳步行待核实','场馆内部步行待估计并复核；6/4公里限制尚未验证'];
export const BUDGET='每人全程预算，含餐饮、门票、市内交通；不含住宿和往返太原大交通。每人单独检查，不互相抵销。';
export function dateAt(start,offset){if(typeof start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(start))return '';const d=new Date(`${start}T00:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==start)return '';d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function defaultDraft(){return {city:'taiyuan',startDate:'2026-11-07',dayCount:2,people:3,days:[{start:'09:00',end:'18:00'},{start:'09:00',end:'18:00'}],members:['历史展览','风景拍照','美食，少走路'].map((preference,i)=>({id:`member-${i+1}`,name:`同行者${i+1}`,preference,budget:'600',walking:['6','6']}))};}
// Only explicitly valid decimal strings become numbers. Empty/booleans never become zero.
export function decimal(value){if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value.trim()))return NaN;return Number(value.trim());}
export function toRequest(d){return {city:d.city,people:d.people,...(d.adjustableGoals===true?{adjustableGoals:true}:{}),days:d.days.map((day,i)=>({date:dateAt(d.startDate,i),...day})),endpoint:{...ENDPOINT},members:d.members.map(m=>({...m,budget:decimal(m.budget),walking:m.walking.map(decimal)}))};}
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const clock=x=>typeof x==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x);
export function validateRequest(r){const errors=[];const add=(field,message)=>errors.push({field,message});
 if(!record(r))return [{field:'root',message:'需求必须是有效对象'}];
 if(Object.hasOwn(r,'adjustableGoals')&&typeof r.adjustableGoals!=='boolean')add('adjustableGoals','时间与步行调整选项须为开关');
 if(r.city!=='taiyuan')add('city','目前仅太原市可测试');
 if(!Number.isInteger(r.people)||r.people<1||r.people>6)add('people','人数必须是1～6的整数');
 if(!Array.isArray(r.days)||r.days.length<1||r.days.length>3)add('days','天数必须为1～3天');
 if(Array.isArray(r.days))r.days.forEach((d,i)=>{if(!record(d)){add(`days.${i}`,'每日安排格式不正确');return;}if(!dateAt(d.date,0))add(`days.${i}.date`,'请填写有效日期');if(i>0&&d.date!==dateAt(r.days[0]?.date,i))add(`days.${i}.date`,'旅行日期必须连续');if(!clock(d.start)||!clock(d.end)||d.start>=d.end)add(`days.${i}.start`,'每日结束时间必须晚于开始时间，且时间有效');});
 if(!record(r.endpoint)||r.endpoint.name!==ENDPOINT.name||r.endpoint.address!==ENDPOINT.address||r.endpoint.verified!==false)add('endpoint','本轮起终点须为待人工核对的公共测试集合点');
 if(!Array.isArray(r.members)||r.members.length!==r.people)add('members','人数必须与同行者数量一致');
 const ids=new Set();
 if(Array.isArray(r.members))r.members.forEach((m,i)=>{const f=`members.${i}`;if(!record(m)){add(f,'同行者格式不正确');return;}if(!text(m.id)||ids.has(m.id))add(`${f}.id`,'同行者标识必须非空且唯一');ids.add(m.id);if(!text(m.name))add(`${f}.name`,'请填写匿名显示名');if(!text(m.preference))add(`${f}.preference`,'请填写个人偏好');if(!nonnegative(m.budget))add(`${f}.budget`,'个人预算必须是非负有限数字（元），不能为空');if(!Array.isArray(m.walking)||m.walking.length!==r.days?.length)add(`${f}.walking`,'步行上限须覆盖每一天');if(Array.isArray(m.walking))m.walking.forEach((v,j)=>{if(!nonnegative(v))add(`${f}.walking.${j}`,'每日步行上限必须是非负有限数字（公里），不能为空');});});
 return errors;
}
export function fromRequest(r){return {city:r.city,people:r.people,...(r.adjustableGoals===true?{adjustableGoals:true}:{}),startDate:r.days[0].date,dayCount:r.days.length,days:r.days.map(({start,end})=>({start,end})),members:r.members.map(m=>({id:m.id,name:m.name,preference:m.preference,budget:String(m.budget),walking:m.walking.map(String)}))};}
export function encodeDraft(d){const r=toRequest(d);const errors=validateRequest(r);if(errors.length)throw Error('输入尚未通过检查，未保存');return JSON.stringify({version:1,savedAt:new Date().toISOString(),request:r});}
export function decodeDraft(raw){let data;try{data=JSON.parse(raw);}catch{throw Error('本地存档损坏，当前输入未改变。请保留原存档或明确覆盖后再保存。');}if(!record(data)||data.version!==1)throw Error('本地存档版本不兼容，当前输入未改变。');if(validateRequest(data.request).length)throw Error('本地存档内容无效，当前输入未改变。');return fromRequest(data.request);}
export function restore(storage){const raw=storage.getItem(STORAGE_KEY);return raw===null?null:decodeDraft(raw);}
export function save(storage,draft,{replaceInvalid=false}={}){const encoded=encodeDraft(draft);const raw=storage.getItem(STORAGE_KEY);if(raw!==null&&!replaceInvalid)decodeDraft(raw);storage.setItem(STORAGE_KEY,encoded);}

// UI metadata only: adding a region here does not bypass supported-city validation.
export const CITY_CONFIG = Object.freeze({ taiyuan: Object.freeze({ name: '太原', fullName: '太原市', pilot: '首个试点', illustration: 'taiyuan-imagery' }) });
