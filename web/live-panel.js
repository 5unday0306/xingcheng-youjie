import {createMapView} from './map-view.js';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function createLivePanel({root,capabilities,onReady,onModeChange=()=>{}}) {
  let busy=false,proof=null,lease=null,map=null,expired=false;
  const status=el('p','按顺序核对入口与单路段。每次查询都消耗本轮授权额度；失败不自动重试。');status.setAttribute('role','status');
  const section=el('details');section.open=true;section.append(el('summary','真实接入准备与单路段验收'),status);
  const places=el('div');section.append(places);
  const message=text=>status.textContent=text;
  function resourceCounts(){const counts={script:0,tiles:0,other:0};for(const e of performance.getEntriesByType('resource')){try{const u=new URL(e.name);if(!/(^|\.)(amap\.com|autonavi\.com)$/.test(u.hostname))continue;const k=u.pathname==='/maps'?'script':/tile|autonavi/.test(u.hostname+u.pathname)?'tiles':'other';counts[k]++;}catch{}}return counts;}
  async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(185000)});const b=await r.json();if(!r.ok)throw Error(b.message);return b;}
  async function action(fn){if(busy)return;busy=true;section.setAttribute('aria-busy','true');section.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){if(lease&&!map){try{await post('/api/live/sdk-event',{event:'sdk-failed'});}catch{}expired=true;mapBox.hidden=true;}message(e.message||'未完成；无自动重试');}finally{busy=false;section.removeAttribute('aria-busy');section.querySelectorAll('button').forEach(b=>b.disabled=!capabilities.canPrepare||expired);}}
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.disabled=!capabilities.canPrepare;b.onclick=()=>action(fn);return b;};
  for(const entry of capabilities.entrances||[]) {
    const row=el('section'),output=el('p');row.dataset.entryId=entry.id;row.append(el('strong',entry.name),el('p',entry.note||''),el('p',`检索：${entry.query.kind} / ${entry.query.poiId||entry.query.keywords}`));
    function showFound(found){
      output.replaceChildren(el('p',`${found.formattedAddress}；高德坐标 ${found.location.join(',')}。POI匹配仍不等于入口或未来通行已确认。`));
      const confirm=button('已人工核对实际入口，确认此落点',async()=>{await post('/api/live/confirm',{token:found.token,confirmed:true});output.append(el('p','已人工确认；仅本次服务有效，不代表营业或预约已核实。'));confirm.remove();});output.append(confirm);query.remove();message('请对照实际入口核对坐标，不能只因返回了地址就确认。');
    }
    const query=button('核对地点条目',async()=>showFound(await post('/api/live/locate',{id:entry.id})));
    row.append(query,output);places.append(row);
    const found=capabilities.pending?.find(p=>p.id===entry.id);if(found)showFound(found);
    if(capabilities.confirmed?.includes(entry.id)){query.remove();output.append(el('p','已人工确认；仅本次服务有效，不代表营业或预约已核实。'));}

  }
  const from=el('select'),to=el('select'),mode=el('select');
  for(const p of capabilities.entrances||[]){from.append(new Option(p.name,p.id));to.append(new Option(p.name,p.id));}to.value='TY04';mode.append(new Option('请选择道路方式',''),new Option('步行','walk'),new Option('公交地铁','transit'),new Option('公交地铁＋街区间步行（不自动切换）','mixed'));
  for(const [name,input] of [['测试起点',from],['测试终点',to],['本次草案道路方式（不自动切换）',mode]]){const label=el('label',name);input.setAttribute('aria-label',name);label.append(input);section.append(label);}
  mode.onchange=()=>onModeChange();
  const proofList=el('div'),mapBox=el('div');mapBox.id='realMap';mapBox.hidden=true;mapBox.setAttribute('aria-label','高德地图，仅显示已查询成功的路段');
  const showDay=day=>{if(!map)return;mapBox.hidden=false;const state=map.showDay(day);message(`地图已显示已查询几何；缺段/落点${state.gaps}处，不代表行程可行。`);};
  const road=button('查询一条已确认路段',async()=>{
    if(!mode.value)throw Error('请选择道路方式');proof=await post('/api/live/road-test',{from:from.value,to:to.value,mode:mode.value});proofList.replaceChildren(el('p','真实单路段结果，仅当前查询，不是两天行程。'));showLeg(proof.day.legs[0]);
    for(const p of proof.day.activities){const b=el('button',p.name);b.type='button';b.dataset.activityId=p.id;b.onclick=()=>map?.focusActivity(p.id);proofList.append(b);}message('单路段查询成功。下一步明确加载地图并核对联动。');if(map)showDay(proof.day);
  });
  const load=button('加载一次真实地图（会联网）',async()=>{
    if(!proof)throw Error('请先查询一条有真实几何的路段');if(map||lease)throw Error('已经领取地图加载许可，不自动重新初始化');
    lease=await post('/api/live/map-lease',{});window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
    await new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();reject(Error('SDK加载超时，停止，不自动重试'));},15000);script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(lease.jsKey)}`;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('SDK加载失败，请核对权限和域名；不自动重试'));};document.head.append(script);});
    await post('/api/live/sdk-event',{event:'script-loaded'});
    if(Date.now()>=lease.expiresAt)throw Error('本次地图许可已过期');mapBox.hidden=false;
    map=createMapView({AMap:window.AMap,container:mapBox,onLeg:showLeg,onSelect:(id,{origin}={})=>{document.querySelectorAll('[data-activity-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.activityId===id)));document.querySelectorAll('[data-activity-row-id]').forEach(n=>{n.dataset.active=String(n.dataset.activityRowId===id);if(origin==='map'&&n.dataset.active==='true'){n.focus({preventScroll:true});n.scrollIntoView({block:'nearest',behavior:'auto'});}});if(origin==='map'&&!document.querySelector(`[data-activity-row-id="${id}"]`))proofList.querySelector(`[data-activity-id="${id}"]`)?.focus({preventScroll:true});}});showDay(proof.day);try{await map.whenReady();await post('/api/live/sdk-event',{event:'map-ready'});}catch(e){map.destroy();map=null;throw e;}
    setTimeout(()=>{expired=true;map?.destroy();map=null;mapBox.hidden=true;message('地图会话已到期，已销毁；不自动重新请求。');},Math.max(0,lease.expiresAt-Date.now()));
  });
  const tools=el('div');tools.className='mapTools';
  for(const [text,fn] of [['放大',()=>map?.zoomIn()],['缩小',()=>map?.zoomOut()],['适配当天路线',()=>map?.fit()]]){const b=el('button',text);b.type='button';b.onclick=fn;tools.append(b);}
  const legend=el('p');legend.className='mapLegend';const walk=el('span','步行 · 虚线'),transit=el('span','公交地铁 · 实线');legend.append(walk,transit);
  const legInfo=el('p','点击已查询路段查看方式、距离和预测时长。');legInfo.setAttribute('role','status');
  function showLeg(leg){legInfo.textContent=`${leg.from} → ${leg.to}：${leg.mode==='walk'?'步行':'公交地铁'}；${leg.distanceMeters?leg.distanceMeters.join('～')+'米':'距离未知'}；${leg.minutes?.join('～')||'未知'}分钟（预测）；${leg.reused?'复用本次会话已查结果':'真实查询结果'}。`;}
  const accept=button('已核对地图显示与列表联动',async()=>{
    if(!map||!proof||!lease)throw Error('请先加载地图并人工核对单路段');await post('/api/live/accept-proof',{lease:lease.lease,proofId:proof.id,visibleConfirmed:true});onReady(mode.value);message('单路段由用户确认；可运行一次真实模型草案，仍不代表两天可行。');
  });
  const ledger=el('pre');const count=button('查看本轮次数与费用预留',async()=>{if(lease)await post('/api/live/sdk-event',{event:'resource-count',counts:resourceCounts()});ledger.textContent=JSON.stringify(await post('/api/live/ledger',{}),null,2);});
  section.append(road,proofList,load,tools,legend,mapBox,legInfo,accept,count,ledger);root.append(section);
  if(!capabilities.canPrepare)message(capabilities.haltReason==='DIAGNOSTIC_COMPLETE'?'单次诊断已结束，未确认落点、未启动下游。真实入口保持关闭，等待明确后续范围。':capabilities.haltReason?`本轮已停止（${capabilities.haltReason}）。所有真实入口关闭；请先复核失败原因，不自动重试。`:'新授权尚未就绪，所有真实入口关闭；配置密钥不会自动授权。');
  if(capabilities.haltReason)post('/api/live/ledger',{}).then(record=>ledger.textContent=JSON.stringify(record,null,2)).catch(()=>message('本轮已停止，调用记录暂时无法读取；不发起真实请求。'));
  return {mode:()=>mode.value,showDay,focusActivity:id=>map?.focusActivity(id),invalidate(){if(map){map.clear();mapBox.hidden=true;message('需求已修改，旧草案及地图覆盖物失效；不会自动重新规划。');}}};
}
