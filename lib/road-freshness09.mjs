import {PlanningError} from './planning.mjs';
export const ROAD_CACHE_MS=30*60*1000;
export function assertFreshRoads(result,now=Date.now()){
 const expired=result.review.days.flatMap(d=>d.legs).filter(l=>l.status==='available'&&l.source==='高德Web服务响应'&&(!Number.isFinite(Date.parse(l.queriedAt))||now-Date.parse(l.queriedAt)>ROAD_CACHE_MS));
 if(expired.length)throw new PlanningError('ROADS_STALE','原道路超过30分钟有效期，请显式恢复/核查当前采用方案，再运行或接受修订；未自动查询',409);
}
