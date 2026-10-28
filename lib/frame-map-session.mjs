import {PlanningError} from './planning.mjs';
export function createFrameMapSession({live}){
 let session=null,starting=false;
 const guard=async runId=>{if(!session||session.runId!==runId||session.ended||Date.now()>=session.expiresAt)throw new PlanningError('MAP_LEASE','地图运行已失效',403);await live.frameCheck();return session;};
 return {
  async start(runId){if(typeof runId!=='string'||!/^[a-f0-9-]{36}$/.test(runId))throw new PlanningError('FRAME_DATA','运行标识无效',400);if(session?.runId===runId||(session&&!live.frameCanReplace?.())||starting)throw new PlanningError('MAP_LIMIT','本次已开始，不自动重载',409);starting=true;try{await live.frameCheck();if(session){session.ended=true;await live.frameEnd();}const lease=await live.action('/api/live/map-lease',{});session={runId,expiresAt:lease.expiresAt,claimed:false,ended:false};return {runId,expiresAt:lease.expiresAt};}finally{starting=false;}},
  async bootstrap(runId){const s=await guard(runId);if(s.claimed)throw new PlanningError('MAP_BOOTSTRAP_USED','配置只下发一次',409);s.claimed=true;try{const config=await live.frameBootstrap();await guard(runId);return config;}catch(e){s.ended=true;await live.frameStop();throw e;}},
  async event(runId,event){await guard(runId);if(!session.claimed)throw new PlanningError('MAP_LEASE','未领取配置',403);if(!['script-loaded','map-ready','sdk-failed'].includes(event))throw new PlanningError('RESOURCE_EVENT','事件不支持',400);try{return await live.action('/api/live/sdk-event',{event});}finally{if(event==='sdk-failed')session.ended=true;}},
  async end(runId){if(!session||session.runId!==runId)throw new PlanningError('MAP_LEASE','不是当前运行',403);session.ended=true;await(live.frameEnd?live.frameEnd():live.frameStop());return {ended:true};},
  async proxy(path,query){const s=await guard(session?.runId);if(!s.claimed||path!=='/v3/log/init')throw new PlanningError('PROXY_SCOPE','仅已领取许可的初始化请求可用',403);try{return await live.frameProxy(path,query);}catch(e){s.ended=true;throw e;}},
  async rejectProxy(){if(session?.claimed&&!session.ended){session.ended=true;await live.frameStop();}return {rejected:true};},
 };
}
