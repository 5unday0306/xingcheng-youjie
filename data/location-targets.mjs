// Query-only contract. Never concatenate research notes into service parameters.
// Public POI identifiers are source pointers, not verified coordinates/entrances.
const target=(id,name,poiId,expectedNames,note)=>({id,name,
  query:{kind:'poi-detail',poiId,expectedNames,cityAdcode:'140100'},
  source:{url:`https://www.amap.com/place/${poiId}`,obtainedAt:'2026-10-25',status:'reference'},note});
const targets=[
  target('ENDPOINT','山西博物院东门外公共集合点','B0FFHNOWTU',['山西博物院(东门)'],'只确认院门定位；门外集合侧、过街和可停留位置需人工确认，不是酒店。'),
  target('TY01','山西博物院','B0FFHNOWTU',['山西博物院(东门)'],'与集合点复用同一门口查询；内部参观动线未知，不将内部步行或门内外接驳填0。'),
  target('TY04','迎泽公园短环线','B015F0I4JP',['迎泽公园(北门)'],'北门条目208号与原公园整体218号资料并列；未来通行和内部短环线待核实。'),
  target('TY05','钟楼街','B0H01BOHQP',['太原市钟楼街步行街'],'街区条目不是已核实入口；不能替代原柴市巷交叉口，须确认实际下车与进入位置。'),
  target('TY06','食品街','B015F0I9AO',['食品街'],'街区条目不是餐馆。新地址线索钟楼街129号与原帽儿巷资料保留差异，落点须人工核对。'),
];
export const locationTargets=()=>structuredClone(targets);
export const querySignature=q=>`${q.kind}:${q.poiId}`;
