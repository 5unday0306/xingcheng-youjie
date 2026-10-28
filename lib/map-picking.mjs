import {PlanningError} from './planning.mjs';
export const PICK_NAMES={ENDPOINT:'博物院东门外公共集合位置',TY04:'迎泽公园北门位置'};
export const PICK_SOURCE='用户确认的测试落点';
// Scope guard for this urban test, not a claim of official administrative boundaries.
export const PICK_REGION={center:[112.55,37.87],bounds:[112.4,37.75,112.7,37.95],name:'太原中心城区测试范围'};
export function createPickingSession({road,extended=false,initialState=null,extraNames={}}) {
  const names=extended?{...PICK_NAMES,...extraNames,TY05:'钟楼街测试落点',TY06:'食品街测试落点'}:PICK_NAMES;
  let revision=0,mode='',route=null,inflight=null;
  const points=Object.fromEntries(Object.keys(names).map(id=>[id,null])),backups=new Map();
  if(initialState){
    if(initialState.version!==1||!initialState.points||!['','walk','transit'].includes(initialState.mode))throw new PlanningError('PICK_SNAPSHOT','本地落点记录无效，不自动使用');
    mode=initialState.mode;
    for(const [id,p] of Object.entries(initialState.points)){if(!Object.hasOwn(names,id))throw new PlanningError('PICK_SNAPSHOT','落点记录包含未知地点');if(!p)continue;
      const b=PICK_REGION.bounds,v=p.location;if(!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||v[0]<b[0]||v[0]>b[2]||v[1]<b[1]||v[1]>b[3]||typeof p.confirmed!=='boolean'||p.confirmed&&(p.source!==PICK_SOURCE||p.routePointAccepted!==true))throw new PlanningError('PICK_SNAPSHOT','测试落点记录无效');
      points[id]={id,name:names[id],location:[...v],confirmed:p.confirmed,userSelected:true,routePointAccepted:p.confirmed,entranceVerified:false,futureAccessVerified:false,source:p.confirmed?PICK_SOURCE:'用户地图点选，尚未确认',...(p.confirmedAt?{confirmedAt:p.confirmedAt}:{})};
    }
  }
  const state=()=>structuredClone({revision,mode,points,route,source:PICK_SOURCE,region:PICK_REGION});
  const idCheck=id=>{if(!Object.hasOwn(names,id))throw new PlanningError('PICK_ID','只允许当前测试案例的落点');};
  const revCheck=n=>{if(n!==revision)throw new PlanningError('PICK_REVISION','状态已改变，请使用当前落点重新操作',409);};
  function invalidate(){revision++;route=null;inflight?.abort();}
  function backup(id){if(!backups.has(id))backups.set(id,structuredClone(points[id]));}
  return {
    state,
    edit(action,input){
      idCheck(input.id);revCheck(input.revision);const id=input.id;
      if(action==='set'){
        const p=input.location,b=PICK_REGION.bounds;
        if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<b[0]||p[0]>b[2]||p[1]<b[1]||p[1]>b[3])throw new PlanningError('PICK_RANGE','请选择太原中心城区测试范围内的位置；该范围不是行政区核验');
        backup(id);points[id]={id,name:names[id],location:[...p],confirmed:false,userSelected:true,routePointAccepted:false,entranceVerified:false,futureAccessVerified:false,source:'用户地图点选，尚未确认'};
      }else if(action==='begin'){
        backup(id);if(points[id]){points[id].confirmed=points[id].routePointAccepted=false;points[id].source='用户地图点选，尚未确认';}
      }else if(action==='confirm'){
        if(!points[id]||input.accepted!==true)throw new PlanningError('PICK_CONFIRM','请先选择位置，再明确接受其为测试落点');
        points[id]={...points[id],confirmed:true,routePointAccepted:true,source:PICK_SOURCE,confirmedAt:new Date().toISOString()};backups.delete(id);
      }else if(action==='cancel'){
        if(backups.has(id))points[id]=backups.get(id);backups.delete(id);
      }else if(action==='remove'){points[id]=null;backups.delete(id);}
      else throw new PlanningError('PICK_ACTION','未知落点操作');
      invalidate();return state();
    },
    setMode(input){revCheck(input.revision);if(!['','walk','transit'].includes(input.mode))throw new PlanningError('MODE','请明确选择步行或公交地铁');if(mode!==input.mode){mode=input.mode;invalidate();}return state();},
    invalidate(){invalidate();return state();},
    async query(input,{signal}={}){
      revCheck(input.revision);
      if(!points.ENDPOINT?.confirmed||!points.TY04?.confirmed)throw new PlanningError('PICK_UNCONFIRMED','两个测试落点均需分别确认，未发起道路请求');
      if(!['walk','transit'].includes(mode))throw new PlanningError('MODE','请选择交通方式，未发起道路请求');
      if(points.ENDPOINT.location.join(',')===points.TY04.location.join(','))throw new PlanningError('PICK_SAME','起终点不能相同');
      if(route)return {...state(),reused:true};
      if(inflight)throw new PlanningError('BUSY','已有道路查询，未重复发送',409);
      const started=revision,controller=new AbortController();inflight=controller;
      try{
        const result=await road({origin:structuredClone(points.ENDPOINT),destination:structuredClone(points.TY04),mode},{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000),...(signal?[signal]:[])])});
        if(started!==revision)throw new PlanningError('PICK_REVISED','落点或方式已修改，旧道路结果丢弃；已发送次数保留',409);
        route={id:'picked-first-road',from:'ENDPOINT',to:'TY04',status:'available',...result,queriedAt:new Date().toISOString()};return state();
      }catch(e){if(started!==revision)throw new PlanningError('PICK_REVISED','落点已修改，旧请求不再采用；已发送次数保留',409);throw e;}
      finally{if(inflight===controller)inflight=null;}
    },
  };
}
