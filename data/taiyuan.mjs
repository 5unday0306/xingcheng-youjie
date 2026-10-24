// Research snapshot, not a verified itinerary. No coordinates or map responses.
const source = (id, url, kind) => ({ id, url, kind, obtainedAt: '2026-10-23' });
export const SOURCES = [
  source('S1','https://wwj.hunan.gov.cn/wwj/ewebeditor/uploadfile/201602/20160219165150876001.pdf','政府名录搜索摘要，地址线索'),
  source('S2','https://shanximuseum.com.cn/sx/index/index.html','官方首页搜索摘要，完整读取失败'),
  source('S3','https://ty.bendibao.com/tour/2020916/46330.shtm','2023平台旧文，入口线索'),
  source('S9','https://you.ctrip.com/sight/taiyuan167/9672.html','平台参考'),
  source('S10','https://ty.bendibao.com/wangdian/dian/5799202.shtm','平台参考'),
  source('S12','https://ty.bendibao.com/tour/20231130/71165.shtm','街区定位线索'),
  source('S13','https://shanxi.chinatax.gov.cn/son/detail/ty-11401-3393-1824771','街区业态报道'),
  source('S14','https://touch.travel.qunar.com/poi/10024405','街区POI线索'),
  source('S15','https://lzhbwg.mofcom.gov.cn/edi_ecms_web_front/thb/articledeail/3284','餐饮业态报道'),
];
const field = (status, value, unit, sources, reason) => ({status,value,unit,sources,obtainedAt:'2026-10-23',applicableDate:null,reason});
const unknown = reason => field('unknown',null,null,[],reason);
const estimate = (value,unit) => field('estimate',value,unit,[],'开发估计，非实测，允许修正');
function candidate(id,name,address,sources,minutes,meters,reference,overlapGroup=null) {
  return {id,city:'taiyuan',name,
    entrance:field('reference',address,'text',sources,'地址/入口线索，不是已核实地图落点'),
    opening:unknown('旅行日期开放、预约与名额待核实'),
    lastEntry:unknown('旅行日期停止入场时间待核实'),
    ticketCents:unknown('当期实际收费范围待核实，不按0计算'),
    stayMinutes:estimate(minutes,'minute'),internalMeters:estimate(meters,'meter'),
    waitingMinutes:unknown('排队或现场等待未知'),
    reference:field('reference',reference,'text',sources,'常规/平台信息，不适用于保证未来日期'),
    overlapGroup};
}
export const CANDIDATES = [
  candidate('TY01','山西博物院','滨河西路北段13号，东门文字线索',['S1','S2','S3'],[150,210],[1000,2000],'常规09:00～17:00、16:00停入；普通参观免费为官方搜索摘要，特展与当期规则未知'),
  candidate('TY04','迎泽公园短环线','迎泽大街218号，具体入口待核实',['S9','S10'],[45,75],[800,1500],'平台称全天/免费；未来开放与维修影响未知'),
  candidate('TY05','钟楼街','柴市巷与钟楼街交叉口定位线索',['S12','S13'],[45,60],[500,1000],'街区业态存在，统一通行与店铺营业未知','old-town'),
  candidate('TY06','食品街','帽儿巷33号街区POI线索，非餐馆地址',['S14','S15'],[45,60],[300,800],'一次逛吃30～60元/人为开发假设，非午餐报价','old-town'),
];
// Food browsing is additional to the still-unknown daily meal, never its replacement.
CANDIDATES[3].foodCents = estimate([3000,6000],'CNY-cent');
export function catalog() { return structuredClone({version:1,city:'taiyuan',candidates:CANDIDATES,sources:SOURCES}); }
