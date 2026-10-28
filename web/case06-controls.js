const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function case06Controls({root,post,enqueue,getState,apply,center,changed,isReady}){
 let currentData=null;
 const panel=el('section');panel.id='case06Choices';panel.append(el('h3','任务06 · 位置复核与两天午餐'),el('p','先在下方检查容器并加载地图，再展开参考资料与午餐候选。本页不会自动查询道路或模型。集合点、院门、主馆入口是三个不同位置；机构中心不是已核实入口。'));
 const note=el('p','读取本地参考资料中……');note.setAttribute('role','status');panel.append(note);root.append(panel);
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 async function refresh(){const data=await post('case06/state');currentData=data;panel.querySelectorAll('details').forEach(n=>n.remove());note.textContent=data.notice;
  const candidate=data.parkCandidate;let parkBox=panel.querySelector('#case06ParkChoice');if(!parkBox){parkBox=el('article');parkBox.id='case06ParkChoice';note.after(parkBox);}parkBox.replaceChildren(el('h4','公园位置不好找？直接选择已有候选'),el('p',`${candidate.name} · ${candidate.address}`),el('p','来自本轮高德地点资料，位于公园北侧。可以接受为测试落点，不冒充官方入口核验。其他7处位置和两天午餐保留。'),button('查看北入口广场位置（不选择）',()=>{if(!isReady()){note.textContent='请先加载地图';return;}center(candidate.location,17);}),button('采用北入口广场作为公园测试落点',()=>enqueue(async()=>{const s=await post('case06/park',{revision:getState().revision,accepted:true});apply(s);changed();center(candidate.location,17);note.textContent='已按你的明确选择，接受北入口广场作为公园测试落点；非官方北门核验。';})));parkBox.querySelector('button:last-child').id='case06AcceptPark';
  const source=el('a','查看候选来源');source.href=candidate.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';parkBox.append(source);
  const locations=el('details');locations.open=false;locations.append(el('summary','1 · 核对六处位置（旧四点均需重新确认）'));
  for(const p of data.references){const article=el('article');article.append(el('h4',`${p.id} · ${p.reference.name}`),el('p',p.notice),el('p',p.offsetMeters===null?'此位置需单独点选':`旧点距机构/街区参考点约${p.offsetMeters}米（直线参考，非道路）。旧点未自动沿用。`),el('p',`参考地址：${p.reference.address}；取得于${new Date(p.reference.obtainedAt).toLocaleString('zh-CN')}`));
   article.append(button('在地图查看参考区域（不选择）',()=>{if(!isReady()){note.textContent='请先在下方检查容器并加载真实地图。';return;}center(p.reference.location,p.id==='TY04'?16:18);}));
   if(['TY05','TY06'].includes(p.id))article.append(button('接受该街区参考位置为测试落点',()=>enqueue(async()=>{if(!isReady())throw Error('请先加载地图');let s=await post('pick/set',{id:p.id,location:p.reference.location,revision:getState().revision});s=await post('pick/confirm',{id:p.id,revision:s.revision,accepted:true});apply(s);changed();note.textContent=`已明确接受${p.reference.name}测试落点；非官方入口核验。`;})));
   const a=el('a','查看高德地点资料');a.href=p.reference.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';article.append(a);locations.append(article);
  }panel.append(locations);
  for(const day of data.lunches){const group=el('details');group.open=false;const heading=el('summary',`2 · 第${day.dayIndex+1}天午餐`);heading.dataset.mealDay=String(day.dayIndex);group.append(heading,el('p','晋菜候选供选择，平台信息不保证旅行日营业。估计费用按每人计算；逛吃、早晚餐不自动算作已覆盖。'));
   for(const c of day.candidates){const article=el('article');article.dataset.mealCandidate=c.id;article.append(el('h4',c.name),el('p',c.address),el('p',`平台人均参考：${c.costReferenceYuan===null?'未知':c.costReferenceYuan+'元'}；营业参考：${c.openingReference||'未知'}。旅行日状态待核实。`),el('p',`来源：${c.source}，${new Date(c.obtainedAt).toLocaleString('zh-CN')}。`));
    const duration=el('input');duration.type='number';duration.min='30';duration.max='120';duration.value='60';duration.setAttribute('aria-label',c.name+'用餐分钟');
    const min=el('input'),max=el('input');for(const n of [min,max]){n.type='number';n.min='0';n.max='1000';n.step='1';}min.value=String(c.costReferenceYuan===null?40:Math.floor(c.costReferenceYuan*.8));max.value=String(c.costReferenceYuan===null?80:Math.ceil(c.costReferenceYuan*1.2));min.setAttribute('aria-label',c.name+'个人费用估计下限');max.setAttribute('aria-label',c.name+'个人费用估计上限');
    const fields=el('div');fields.className='case06Estimates';for(const [text,n] of [['停留估计（分钟）',duration],['每人估计下限（元）',min],['每人估计上限（元）',max]]){const l=el('label',text);l.append(n);fields.append(l);}article.append(fields,el('p','以上是可调整的准备估计，不是餐厅报价；缺价格时预填40～80元供你明确接受或修改。'));
    article.append(button('查看餐厅参考位置',()=>{if(!isReady()){note.textContent='请先加载地图。';return;}center(c.location,18);}),button('选择此餐厅并接受以上估计',()=>enqueue(async()=>{const s=await post('case06/meal',{dayIndex:day.dayIndex,poiId:c.id,durationMinutes:duration.valueAsNumber,costYuan:[min.valueAsNumber,max.valueAsNumber],accepted:true,revision:getState().revision});apply(s);changed();await refresh();note.textContent='午餐选择和估计已保存至本机测试记录，旧路线失效；没有自动查询。';})));
    const a=el('a','高德地点资料');a.href=c.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';article.append(a);group.append(article);
   }panel.append(group);
  }
  update(getState());
 }
 function update(state){for(const h of panel.querySelectorAll('[data-meal-day]')){const i=Number(h.dataset.mealDay);h.textContent=`2 · 第${i+1}天午餐：${state.meals?.[i]?.candidate.name||'尚未选择或需重新选择'}`;}}
 refresh().catch(e=>note.textContent=e.message);
 return {refresh,update,locate(id){const p=currentData?.references.find(r=>r.id===id)?.reference;if(p)center(p.location,id==='TY04'?16:18);},showMeals(i){const h=panel.querySelector(`[data-meal-day="${i}"]`);if(h){h.closest('details').open=true;h.scrollIntoView({block:'start'});h.focus();}}};
}
