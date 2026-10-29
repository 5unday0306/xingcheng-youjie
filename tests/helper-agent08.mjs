import {syntheticAgent} from './helper-agent07.mjs';
export function syntheticAgent08(p,{choose='option-1',revise=false}={}){
 if(!p.task.includes('任务08'))return syntheticAgent(p,{revise});
 if(p.role==='screen')return {content:JSON.stringify({...p.contract,unknowns:['测试资料仍有未知']}),usage:{input:1,output:1,total:2}};
 if(p.role==='plan'){const option=p.input.upstream.output.options.find(o=>o.id===choose)||p.input.upstream.output.options[0];return {content:JSON.stringify({...p.contract,optionId:option.id,routeIds:option.routeIds,reason:'受控重排候选，待用户决定',unknowns:['测试未知']}),usage:{input:1,output:1,total:2}};}
 return syntheticAgent(p,{revise});
}
