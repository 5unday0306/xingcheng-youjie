// Bounded candidate search; a returned POI is never an accepted entrance or meal.
import {PlanningError} from './planning.mjs';import {point} from './upstream-contract.mjs';
export const researchQueries=[
 {id:'museum',keywords:'山西博物院',purpose:'机构位置参考，集合点/院门/主馆入口必须分别选择'},
 {id:'park',keywords:'迎泽公园',purpose:'公园与入口候选参考'},
 {id:'clock',keywords:'钟楼街',purpose:'街区位置参考，不是已核实入口'},
 {id:'food',keywords:'食品街',purpose:'街区位置参考，不是餐馆'},
 {id:'lunchA',keywords:'老太原菜馆',purpose:'晋菜午餐候选，未接受'},
 {id:'lunchB',keywords:'晋韵楼',purpose:'晋菜午餐候选，未接受'}
];
export function referenceDistance(a,b){const rad=x=>x*Math.PI/180,dlat=rad(b[1]-a[1]),dlng=rad(b[0]-a[0]);return Math.round(6371000*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlng/2)**2)));}
export function parseResearch(body,query,at=new Date().toISOString()){
 if(body?.status!=='1'||!Array.isArray(body.pois))throw new PlanningError('RESEARCH_FAILED','地点资料查询失败，不自动重试',502);
 const list=[];for(const p of body.pois){if(!/^1401\d{2}$/.test(String(p.adcode))||typeof p.name!=='string'||typeof p.id!=='string')continue;let location;try{location=point(p.location);}catch{continue;}if(location[0]<112.4||location[0]>112.7||location[1]<37.75||location[1]>37.95)continue;
  const cost=typeof p.biz_ext?.cost==='string'&&/^\d+(\.\d+)?$/.test(p.biz_ext.cost)?Number(p.biz_ext.cost):null;
  const opening=[p.biz_ext?.opentime,p.biz_ext?.opentime2,p.opentime,p.opentime2].find(v=>typeof v==='string'&&v.trim());
  list.push({id:p.id,name:p.name.slice(0,100),location,address:typeof p.address==='string'?p.address.slice(0,200):'',type:typeof p.type==='string'?p.type:'',costReferenceYuan:cost,openingReference:opening?.slice(0,200)||null,priceStatus:cost===null?'unknown':'platform-reference',openingStatus:opening?'platform-reference':'unknown',source:'高德Web服务关键词搜索',sourceUrl:`https://www.amap.com/place/${encodeURIComponent(p.id)}`,obtainedAt:at,entranceVerified:false,futureAccessVerified:false});
 }
 return {query:{...query},obtainedAt:at,declaredCount:typeof body.count==='string'?body.count:null,returned:body.pois.length,candidates:list,notice:'仅本页候选，不证明唯一或穷尽；地点/价格/营业为地图参考，不是旅行日承诺'};
}
