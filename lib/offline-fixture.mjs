// Explicit test substitute. Never enabled by npm start, never a model response.
export async function offlinePlanner(payload) {
  const groups=payload.days.map(()=>[]);
  payload.candidates.forEach((c,i)=>groups[Math.min(Math.floor(i*groups.length/payload.candidates.length),groups.length-1)].push(c));
  return JSON.stringify({version:1,days:payload.days.map((d,i)=>{
    const visits=groups[i].map(c=>({type:'visit',candidateId:c.id,durationMinutes:c.stayMinutes.value[0],reason:'测试替身按候选顺序分配，仅验证交接，不代表偏好优化'}));
    visits.splice(Math.ceil(visits.length/2),0,{type:'meal',reason:'具体门店未知，未定位或锁定午餐'});
    return {date:d.date,items:visits};
  })});
}
