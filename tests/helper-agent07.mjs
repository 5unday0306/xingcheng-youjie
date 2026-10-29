export function syntheticAgent(payload,{revise=false}={}){
 const {role,input:i}=payload,unknowns=['开放、预约、餐厅内部步行与未来交通仍未知'];
 const common={version:1,role,unknowns};let x;
 if(role==='coordinate')x={...common,hardConstraintIds:i.hardConstraintIds,conflictIds:i.issueIds,preferenceSummary:'保留逐人6公里及600元条件'};
 if(role==='screen')x={...common,coordinationRef:i.upstream.ref,options:[{id:'option-1',routeIds:i.allowedRouteIds,reason:'比较少步行公交',affectedPersons:i.personIds,tradeoffs:['可能增加时间和交通费用']}]};
 if(role==='plan')x={...common,screenRef:i.upstream.ref,optionId:i.upstream.output.options[0].id,routeIds:i.upstream.output.options[0].routeIds,reason:'使用筛选候选，不改地点和内部估计'};
 if(role==='audit')x={...common,planningRef:i.upstream.ref,programStatus:i.program.status,issueIds:i.issueIds,decision:revise?'revise':'complete',reason:'依据程序结果保留冲突及缺口'};
 return {content:JSON.stringify(x),usage:{input:1,output:1,total:2}};
}
