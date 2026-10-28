// Every response/coordinate/token below is synthetic, used only in offline tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUpstreamAdapters,parseGeocode,parseRoad,buildJsProxyRequest} from '../lib/upstream-contract.mjs';
import {createMapView} from '../web/map-view.js';
const credentials={webKey:'test-web',jsKey:'test-js',jsSecurityCode:'test-security',modelKey:'test-model'};
const walk=()=>({status:'1',route:{paths:[{distance:'1234',duration:'61',steps:[{polyline:'112.5,37.8;112.51,37.81'}]}]}});
const settings=send=>({enabled:true,reserve:async()=>true,send,credentials,model:'offline-test-model-name'});

test('显式取消保留发送记录，区别于超时/上游失败，不自动重试',async()=>{
 const controller=new AbortController();let calls=0,finished=0,ready;const started=new Promise(r=>ready=r);
 const adapter=createUpstreamAdapters({...settings(async r=>{calls++;return new Promise((resolve,reject)=>{r.signal.addEventListener('abort',()=>reject(Error('SYNTHETIC_CANCEL')));ready();});}),finish:async()=>{finished++;}});
 const pending=adapter.plan({}, {signal:controller.signal});await started;controller.abort();await assert.rejects(pending,e=>e.code==='CANCELLED');assert.equal(calls,1);assert.equal(finished,1);
});

test('公交空铁路信封不误判实际铁路；存在列车数据仍拒绝',()=>{
 const body={status:'1',route:{transits:[{duration:'600',walking_distance:'100',distance:'1000',cost:'2',segments:[{railway:{via_stops:[],alters:[],spaces:[]},walking:{distance:'100',steps:[{polyline:'112.5,37.8;112.51,37.81'}]},bus:{buslines:[{polyline:'112.51,37.81;112.52,37.82'}]}}]}]}};
 assert.equal(parseRoad(body,'transit').geometryComplete,true);
 body.route.transits[0].segments[0].railway.name='SYNTHETIC_TRAIN';assert.throws(()=>parseRoad(body,'transit'));
});
test('上游适配默认关闭，配置存在也不会执行send；配额拒绝也不执行',async()=>{
  let calls=0;const send=async()=>{calls++;};
  await assert.rejects(createUpstreamAdapters({...settings(send),enabled:false}).locate('测试地址'),e=>e.code==='OFFLINE_ONLY');
  await assert.rejects(createUpstreamAdapters({...settings(send),reserve:async()=>false}).locate('测试地址'),e=>e.code==='CALL_LIMIT');assert.equal(calls,0);
});
test('模型固定上游/JSON输出/2000输出上限，截断或非200不可当成功',async()=>{
  let sent;const adapters=createUpstreamAdapters(settings(async req=>{sent=req;return {status:200,body:{choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}}};}));
  const result=await adapters.plan({test:true});assert.equal(sent.url,'https://api.deepseek.com/chat/completions');assert.equal(sent.redirect,'error');assert.equal(sent.body.max_tokens,2000);assert.equal(sent.body.response_format.type,'json_object');assert.equal(result.content,'{}');assert.equal(result.usage.total,12);
  const cut=createUpstreamAdapters(settings(async()=>({status:200,body:{choices:[{finish_reason:'length',message:{content:'{}'}}]}})));await assert.rejects(cut.plan({}),e=>e.code==='UPSTREAM_DATA');
  const denied=createUpstreamAdapters(settings(async()=>({status:403,body:{message:'test-security'}})));await assert.rejects(denied.plan({}),e=>e.code==='UPSTREAM_FAILED'&&!e.message.includes('test-security'));
});
test('并发调用也不能越过模型1次上限；失败URL与凭据不回传',async()=>{
  let calls=0;const adapters=createUpstreamAdapters(settings(async()=>{calls++;throw Error('test-security URL');}));
  const results=await Promise.allSettled([adapters.plan({}),adapters.plan({})]);assert.equal(calls,1);assert.ok(results.every(r=>r.status==='rejected'&&!r.reason.message.includes('test-security')));
});
test('地理编码歧义/外市拒绝，唯一结果也不自动认定入口已核实',()=>{
  const body={status:'1',geocodes:[{location:'112.5,37.8',adcode:'140107',formatted_address:'合成测试地址'}]};
  assert.equal(parseGeocode(body).entranceVerified,false);assert.throws(()=>parseGeocode({...body,geocodes:[...body.geocodes,...body.geocodes]}));
  body.geocodes[0].adcode='110101';assert.throws(()=>parseGeocode(body));
});
test('道路只准步行公交；未确认入口不查询；秒转分钟向上且不补直线',async()=>{
  let calls=0;const adapters=createUpstreamAdapters(settings(async()=>{calls++;return {status:200,body:walk()};}));
  const origin={location:[112.5,37.8],entranceVerified:false},destination={location:[112.51,37.81],entranceVerified:true};
  await assert.rejects(adapters.road({origin,destination,mode:'walk'}),e=>e.code==='ENTRANCE_UNKNOWN');assert.equal(calls,0);
  origin.entranceVerified=true;await assert.rejects(adapters.road({origin,destination,mode:'taxi'}),e=>e.code==='MODE');
  const result=await adapters.road({origin,destination,mode:'walk'});assert.deepEqual(result.minutes,[2,2]);assert.deepEqual(result.walkingMeters,[1234,1234]);assert.equal(result.geometry.length,1);
  const broken=walk();delete broken.route.paths[0].steps[0].polyline;const parsed=parseRoad(broken,'walk');assert.equal(parsed.geometryComplete,false);assert.equal(parsed.geometry.length,0);
});
test('公交只计总接驳步行一次，逐人票价缺失不置零，拒绝铁路',()=>{
  const response={status:'1',route:{transits:[{duration:'600',walking_distance:'800',cost:'2.50',segments:[{walking:{distance:'800',steps:[{polyline:'112.5,37.8;112.51,37.81'}]},bus:{buslines:[{polyline:'112.51,37.81;112.52,37.82'}]}}]}]}};
  const result=parseRoad(response,'transit');assert.deepEqual(result.walkingMeters,[800,800]);assert.deepEqual(result.fareCentsPerPerson,[250,250]);assert.equal(result.geometry.length,2);
  response.route.transits[0].cost=[];assert.equal(parseRoad(response,'transit').fareCentsPerPerson,null);
  response.route.transits[0].segments[0].railway={id:'synthetic'};assert.throws(()=>parseRoad(response,'transit'));
});
test('JS代理合同固定主机/路径并由服务端补安全密钥；拒绝任意URL、重复参数、回调和客户端安全密钥',()=>{
  const query='origin=112.5,37.8&destination=112.51,37.81&key=test-js';const result=buildJsProxyRequest('/v3/direction/walking',query,credentials);
  const url=new URL(result.url);assert.equal(url.origin,'https://restapi.amap.com');assert.equal(url.searchParams.get('jscode'),'test-security');assert.equal(result.redirect,'error');
  for(const suffix of ['&url=https://example.invalid','&jscode=evil','&callback=evil','&origin=112.6,37.9','&key=evil'])assert.throws(()=>buildJsProxyRequest('/v3/direction/walking',query+suffix,credentials));
  for(const path of ['/v3/../anything','https://example.invalid','/v3/direction/driving'])assert.throws(()=>buildJsProxyRequest(path,query,credentials));
});
function sdk() {
  const maps=[];
  class Map {constructor(){this.added=[];this.removed=[];maps.push(this);}add(items){this.added.push([...items]);}remove(items){this.removed.push([...items]);}setFitView(items){this.fit=[...items];}setCenter(point){this.center=point;}destroy(){this.destroyed=true;}}
  class Polyline {constructor(options){this.options=options;}}
  class Marker {constructor(options){this.options=options;}on(name,fn){this.click=fn;}getPosition(){return this.options.position;}}
  return {Map,Polyline,Marker,maps};
}
test('地图渲染离线SDK替身验证：只画已有道路段，保留缺口、切日清理、列表定位与点击交接',()=>{
  const AMap=sdk(),selected=[],view=createMapView({AMap,container:{},onSelect:id=>selected.push(id)});
  const geometry=[{mode:'walk',path:[[112.5,37.8],[112.51,37.81]]}];
  const state=view.showDay({legs:[{status:'available',source:'高德Web服务响应',geometry,geometryComplete:true},{status:'missing'}],activities:[{id:'a',name:'合成测试',location:[112.5,37.8],entranceVerified:true}]});
  assert.equal(state.complete,false);assert.equal(state.gaps,1);assert.equal(AMap.maps[0].added[0].filter(x=>x instanceof AMap.Polyline).length,1);
  assert.equal(view.focusActivity('a'),true);assert.deepEqual(selected,['a']);AMap.maps[0].added[0].find(x=>x instanceof AMap.Marker).click();assert.deepEqual(selected,['a','a']);
  view.showDay({legs:[],activities:[]});assert.equal(view.focusActivity('a'),false);assert.equal(AMap.maps[0].removed.length,1);view.destroy();assert.equal(AMap.maps[0].destroyed,true);
});
test('地图拒绝把替身道路、空几何和未核实活动当作完整结果',()=>{
  const AMap=sdk(),view=createMapView({AMap,container:{}});
  const state=view.showDay({legs:[{status:'available',source:'离线测试替身',geometry:[]},{status:'available',source:'高德Web服务响应',geometry:[],geometryComplete:true}],activities:[{id:'unknown',location:[112.5,37.8]}]});
  assert.equal(state.complete,false);assert.equal(state.gaps,3);assert.equal(AMap.maps[0].added[0].length,0);
});
