import {createMapView} from './map-view.js';
import {loadAMapSdk} from './amap-loader.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const names={ENDPOINT:'博物院东门外公共集合位置',TY04:'迎泽公园北门位置'};
export function createPickPanel({root,capabilities}) {
  let state={revision:0,points:{ENDPOINT:null,TY04:null},mode:'',route:null},view=null,lease=null,activeId=null,failed=false,queue=Promise.resolve(),pending=0,querying=false;
  let disposed=false,loadEpoch=0,loadAbort=null,sessionTimer;
  function destroyMap(){loadEpoch++;loadAbort?.abort();clearTimeout(sessionTimer);view?.destroy();view=null;mapBox.hidden=true;}
  const section=el('section');section.className='pickPanel';section.id='pickPanel';
  const status=el('p',capabilities.canPrepare&&capabilities.mapPicking?'尚未加载地图。点击加载才会联网。':'当前停止或授权已过期；等待地图选点恢复计划确认。');status.id='pickStatus';status.setAttribute('role','status');
  section.append(el('h3','地图选点与首条道路'),el('p','位置由用户选择并接受，仅作测试落点，不代表官方入口核验或旅行日通行。'),status);
  async function post(path,input={}) {const r=await fetch('/api/live/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok){const error=Error(b.message);error.code=b.code;throw error;}return b;}
  const button=(text,id,fn)=>{const b=el('button',text);b.type='button';b.id=id;b.onclick=fn;return b;};
  const load=button('加载真实地图并开始选点','pickLoad',()=>enqueue(loadMap));
  const mapBox=el('div');mapBox.id='pickMap';mapBox.hidden=true;mapBox.setAttribute('aria-label','高德真实地图，太原初始视野；点击或拖动选择测试位置');
  const cards=el('div');cards.className='pickCards';const controls={};
  for(const id of Object.keys(names)){
    const card=el('article');card.id=`pick-card-${id}`;card.tabIndex=-1;
    const position=el('p','尚未选择'),confirmation=el('p','未确认');position.id=`pick-position-${id}`;confirmation.id=`pick-confirmation-${id}`;
    const begin=button('选择／调整',`pick-begin-${id}`,()=>enqueue(async()=>{state=await post('pick/begin',{id,revision:state.revision});activeId=id;render();status.textContent=`正在选择${names[id]}。点击地图或拖动标记，不会查路。`;}));
    const confirm=button('确认此测试落点',`pick-confirm-${id}`,()=>enqueue(async()=>{state=await post('pick/confirm',{id,revision:state.revision,accepted:true});activeId=null;render();status.textContent='测试落点已确认；另一处仍需分别确认。不会自动查询道路。';}));
    const cancel=button('取消调整',`pick-cancel-${id}`,()=>enqueue(async()=>{state=await post('pick/cancel',{id,revision:state.revision});activeId=null;render();status.textContent='已取消本次选点，旧路线不会自动恢复。';}));
    const remove=button('撤销落点',`pick-remove-${id}`,()=>enqueue(async()=>{state=await post('pick/remove',{id,revision:state.revision});activeId=null;render();status.textContent='落点已撤销，旧路线已失效。';}));
    const focus=button('地图定位',`pick-focus-${id}`,()=>view?.focusActivity(id));
    card.append(el('h4',id==='ENDPOINT'?'① '+names[id]:'② '+names[id]),position,confirmation,begin,confirm,cancel,remove,focus);cards.append(card);controls[id]={card,position,confirmation,begin,confirm,cancel,remove,focus};
  }
  const mode=el('select');mode.id='pickMode';mode.setAttribute('aria-label','首条道路交通方式');mode.append(new Option('请选择交通方式',''),new Option('步行','walk'),new Option('公交地铁','transit'));
  mode.onchange=()=>{const selected=mode.value;enqueue(async()=>{state=await post('pick/mode',{revision:state.revision,mode:selected});render();status.textContent='交通方式已改变，旧路线失效；不会自动查询。';});};
  const query=button('查询首条真实道路','pickRoute',()=>{
    if(querying)return;querying=true;renderControls();
    enqueue(async()=>{status.textContent='真实道路查询中，无自动重试。';const started=state.revision;const result=await post('pick/route',{revision:started});if(state.revision!==started){status.textContent='落点已修改，旧道路结果不采用；未自动重查。';return;}state=result;render(true);status.textContent=state.route?.geometry?.length?'已显示实际返回的道路几何；这是首条测试路线，05B整体未完成。':'已取得道路统计，但未取得可画几何，未补直线。';}).finally(()=>{querying=false;renderControls();});
  });
  const tools=el('div');tools.className='mapTools';for(const [text,fn] of [['放大',()=>view?.zoomIn()],['缩小',()=>view?.zoomOut()],['适配路线与落点',()=>view?.fit()]])tools.append(button(text,'pick-tool-'+tools.children.length,fn));
  const legend=el('p');legend.className='mapLegend';legend.append(el('span','步行 · 虚线'),el('span','公交地铁 · 实线'));
  const routeInfo=el('p','尚未查询道路。');routeInfo.id='pickRouteInfo';routeInfo.setAttribute('role','status');
  const counts=el('pre');counts.id='pickLedger';const recordBox=el('details'),recordTitle=el('summary','本机调用与SDK资源记录');recordBox.append(recordTitle,counts);
  function showRecord(s){counts.textContent=JSON.stringify(s,null,2);recordTitle.textContent=`累计地点${s.counts.location}、道路${s.counts.route}、SDK${s.counts.map}；预留${(s.reservedCents/100).toFixed(2)}元（非实扣）`;}
  const refresh=button('查看调用与SDK资源记录','pickLedgerRefresh',()=>enqueue(async()=>{if(lease&&view&&!failed)await post('sdk-event',{event:'resource-count',counts:resourceCounts()});showRecord(await post('ledger'));recordBox.open=true;}));
  const diagnosticBox=el('details'),diagnosticText=el('pre');diagnosticBox.append(el('summary','本页脱敏资源诊断（不含查询参数）'),diagnosticText);
  diagnosticBox.addEventListener('toggle',()=>{if(diagnosticBox.open)diagnosticText.textContent=JSON.stringify(window.__sdkDiagnostics?.snapshot()||[],null,2);});
  section.append(load,cards,el('label','交通方式（修改后需手动重新查询）'),mode,query,tools,legend,mapBox,routeInfo,refresh,recordBox);root.append(section);
  section.append(diagnosticBox);
  if(capabilities.mapDisplayOnly){section.querySelector('h3').textContent='真实底图单次验证';section.children[1].textContent='本次仅验证真实底图可见与基本缩放拖动，不选点、不查路。';load.textContent='加载一次真实底图（仅缩放拖动）';cards.hidden=true;mode.hidden=true;query.hidden=true;legend.hidden=true;section.querySelector('label').hidden=true;routeInfo.textContent='本次不选点、不查路，只验证底图可见及缩放拖动。';mapBox.setAttribute('aria-label','高德真实底图，仅验证太原初始区域与基本缩放拖动');}
  function resourceCounts(){const r={script:0,tiles:0,other:0};for(const e of performance.getEntriesByType('resource'))try{const u=new URL(e.name);if(!/(^|\.)(amap\.com|autonavi\.com)$/.test(u.hostname))continue;r[u.pathname==='/maps'?'script':/tile|autonavi/.test(u.hostname+u.pathname)?'tiles':'other']++;}catch{}return r;}
  function renderControls(){const editable=!!view&&!failed;load.disabled=pending>0||!!lease||(capabilities.map&&capabilities.map!=='未加载')||failed||!capabilities.canPrepare||!capabilities.mapPicking;mode.disabled=!editable||pending>0;query.disabled=!editable||pending>0||querying||!state.points.ENDPOINT?.confirmed||!state.points.TY04?.confirmed||!state.mode||!!state.route;for(const id of Object.keys(names)){const c=controls[id],p=state.points[id];c.begin.disabled=!editable||pending>0;c.confirm.disabled=!editable||pending>0||!p||p.confirmed;c.cancel.disabled=!editable||pending>0||activeId!==id;c.remove.disabled=!editable||pending>0||!p;c.focus.disabled=!p||!view;}}
  function render(fit=false){for(const id of Object.keys(names)){const p=state.points[id],c=controls[id];c.position.textContent=p?`高德坐标：${p.location.map(n=>n.toFixed(6)).join(', ')}`:'尚未选择';c.confirmation.textContent=p?.confirmed?'已确认 · 用户确认的测试落点（非官方入口核验）':p?'已选择，尚未确认':'未确认';}mode.value=state.mode;
    const r=state.route;routeInfo.textContent=capabilities.mapDisplayOnly?'本次不选点、不查路，只验证底图可见及缩放拖动。':r?`${names.ENDPOINT} → ${names.TY04}；${r.mode==='walk'?'步行':'公交地铁'}；${r.distanceMeters?r.distanceMeters.join('～')+'米':'距离未知'}；预计${r.minutes?.join('～')||'未知'}分钟。几何${r.geometryComplete?'完整返回':'存在缺段'}，不代表未来通行或旅行可行。`:'尚无当前有效路线；选点、确认、拖动或修改方式不会自动查路。';
    if(view){const activities=Object.values(state.points).filter(Boolean).map((p,i)=>({...p,sequence:p.id==='ENDPOINT'?1:2,role:p.id==='ENDPOINT'?'测试起点':'测试终点',editable:true}));view.showDay({activities,legs:r?[r]:[]},{fit});view.setPicking(!!activeId);}
    renderControls();
  }
  function enqueue(fn){pending++;renderControls();const job=queue.then(fn).catch(async e=>{status.textContent=e.message;if(['UPSTREAM_FAILED','UPSTREAM_DATA','CALL_LIMIT','RECOVERY_LIMIT','AUTH_REQUIRED','RUN_STOPPED','SDK_NOT_READY'].includes(e.code)){failed=true;view?.destroy();view=null;mapBox.hidden=true;}return null;}).finally(()=>{pending--;renderControls();});queue=job;return job;}
  const selected=(id,location)=>{const apply=async()=>{state=await post('pick/set',{id,location,revision:state.revision});render();status.textContent='位置已调整且取消该点确认，旧路线失效；不会自动查询。';};if(querying){state.route=null;render();pending++;renderControls();apply().catch(e=>status.textContent=e.message).finally(()=>{pending--;renderControls();});return;}return enqueue(apply);};
  async function loadMap(){if(lease||failed||disposed)return;const epoch=++loadEpoch;loadAbort=new AbortController();
    status.textContent='正在加载真实地图，尚未取得可见底图；不会自动重试。';
    const current=()=>!disposed&&!failed&&epoch===loadEpoch&&(!lease||Date.now()<lease.expiresAt);
    const check=()=>{if(!current())throw Error('地图加载会话已停止，迟到结果不采用');};
    try{lease=await post('map-lease');check();sessionTimer=setTimeout(()=>{failed=true;destroyMap();status.textContent='本次地图会话已到期，已停止；不自动加载。';renderControls();},Math.max(0,lease.expiresAt-Date.now()));
      const AMap=await loadAMapSdk({jsKey:lease.jsKey,serviceHost:location.origin+'/_AMapService',signal:loadAbort.signal});check();await post('sdk-event',{event:'script-loaded'});check();mapBox.hidden=false;
      view=createMapView({AMap,container:mapBox,initialRegion:[112.55,37.87],onPick:location=>{if(activeId)selected(activeId,location);},onDrag:(id,location)=>{activeId=id;selected(id,location);},onSelect:(id,{origin}={})=>{for(const key of Object.keys(names))controls[key].card.dataset.active=String(key===id);if(origin==='list')mapBox.scrollIntoView({block:'center'});if(origin==='map'){controls[id].card.focus({preventScroll:true});controls[id].card.scrollIntoView({block:'nearest'});}}});
      await view.whenReady();check();await post('sdk-event',{event:'map-ready'});check();
      if(capabilities.mapDisplayOnly){status.textContent='底图已发出加载完成事件；请人工核对可见底图，并尝试缩放和拖动。本次不选点、不查路。';renderControls();}
      else{state=await post('pick/state');check();render();status.textContent='真实地图已加载到太原初始视野（不是预选落点）。请分别选择并确认两处位置。';}
    }catch(e){failed=true;destroyMap();if(lease)try{await post('sdk-event',{event:'sdk-failed'});}catch{}if(!disposed)throw e;}}
  post('pick/state').then(s=>{state=s;render();}).catch(()=>renderControls());
  if(capabilities.haltReason)post('ledger').then(showRecord).catch(()=>{});
  if(capabilities.map&&capabilities.map!=='未加载')status.textContent='本轮地图许可已使用，刷新不会重新加载。已确认落点和记录仍在本次服务中；再次初始化需明确恢复范围。';
  renderControls();
  return {destroy(){disposed=true;failed=true;destroyMap();renderControls();},invalidate(){if(view&&!capabilities.mapDisplayOnly){const apply=async()=>{state=await post('pick/invalidate');render();status.textContent='旅行需求已修改，旧路线失效；未自动查路。';};if(querying){state.route=null;view.clear();apply().catch(e=>status.textContent=e.message);}else enqueue(apply);}},selectDay(){},showDay(){},focusActivity:id=>view?.focusActivity(id)};
}
