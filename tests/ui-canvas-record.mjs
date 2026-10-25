// Real viewport screencast. CDP captures browser frames; MediaRecorder encodes
// those frames, without synthesizing application screens or requiring ffmpeg.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {createCanvasServer} from '../preview/travel-canvas/server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createCanvasServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),encoderContext=await browser.newContext();
const page=await context.newPage(),encoder=await encoderContext.newPage(),blocked=[],errors=[],actions=[];
await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){blocked.push('external');return r.abort();}return r.continue();});page.on('pageerror',e=>errors.push(e.message));
let session,busy=false,frames=0,started;
try{
  const mime=await encoder.evaluate(()=>{
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Browser MediaRecorder WebM unavailable');
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;document.body.append(canvas);const ctx=canvas.getContext('2d');ctx.fillStyle='#EFF7F5';ctx.fillRect(0,0,1440,900);
    window.__rec={canvas,ctx,chunks:[],last:null};window.__rec.recorder=new MediaRecorder(canvas.captureStream(15),{mimeType:mime,videoBitsPerSecond:2200000});
    window.__rec.recorder.ondataavailable=e=>{if(e.data.size)window.__rec.chunks.push(e.data);};
    window.__rec.refresh=setInterval(()=>{if(window.__rec.last)ctx.drawImage(window.__rec.last,0,0,1440,900);},1000/15);
    window.__rec.push=data=>new Promise(resolve=>{const image=new Image();image.onload=()=>{window.__rec.last=image;ctx.drawImage(image,0,0,1440,900);resolve();};image.onerror=resolve;image.src='data:image/jpeg;base64,'+data;});
    window.__rec.recorder.start(250);return mime;
  });
  started=Date.now();session=await context.newCDPSession(page);
  session.on('Page.screencastFrame',event=>{
    session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
    if(busy)return;busy=true;
    encoder.evaluate(data=>window.__rec.push(data),event.data).then(()=>frames++).catch(()=>{}).finally(()=>busy=false);
  });
  await session.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:1440,maxHeight:900,everyNthFrame:1});
  const at=async(seconds,name,fn)=>{const remaining=started+seconds*1000-Date.now();if(remaining>0)await new Promise(r=>setTimeout(r,remaining));await fn();actions.push({atSeconds:Number(((Date.now()-started)/1000).toFixed(2)),action:name});};
  await at(0,'打开独立设计预览',()=>page.goto(base+'/preview/travel-canvas/'));
  await at(3,'选择同行者2',()=>page.locator('#select-person-1').click());
  await at(5,'展开同行者2编辑面板',()=>page.locator('#edit-person-1').click());
  await at(6.5,'编辑需求原话',async()=>{await page.locator('#edit-preference').fill('');await page.locator('#edit-preference').pressSequentially('风景拍照，想在途中留出休息时间。',{delay:85});});
  await at(10.5,'修改本人预算为520元',()=>page.locator('#edit-budget').fill('520'));
  await at(12.5,'应用并关闭编辑',async()=>{await page.locator('#editor-form button[type=submit]').click();await page.locator('#editor').waitFor({state:'hidden'});});
  await at(15,'查看固定离线活动',()=>page.locator('#view-offline').click());
  await at(18,'切换第2天',()=>page.locator('#sample-day-1').click());
  await at(20.5,'切回第1天',()=>page.locator('#sample-day-0').click());
  await at(23,'返回预览需求概览',()=>page.locator('#view-overview').click());
  await at(25,'实际检查需求并转换摘要',()=>page.locator('#check-preview').click());
  await at(28,'暂存本次预览并显示真实反馈',()=>page.locator('#save-preview').click());
  await at(33,'结束视口录制',async()=>{});
  const wallSeconds=(Date.now()-started)/1000;await session.send('Page.stopScreencast');
  const base64=await encoder.evaluate(()=>new Promise(resolve=>{const rec=window.__rec;rec.recorder.onstop=()=>{clearInterval(rec.refresh);const blob=new Blob(rec.chunks,{type:rec.recorder.mimeType});const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);};rec.recorder.stop();}));
  const bytes=Buffer.from(base64,'base64');if(frames<10||bytes.length<10000||wallSeconds<20||wallSeconds>40||errors.length||blocked.length)throw Error('Recording verification failed');
  await writeFile('docs/verification/ui-canvas-operation.webm',bytes);
  const report={executedAt:new Date().toISOString(),method:'Actual Edge viewport CDP screencast + browser MediaRecorder; no fabricated application frames',wallSeconds:Number(wallSeconds.toFixed(2)),width:1440,height:900,mime,frames,bytes:bytes.length,actions,pageErrors:errors,externalRequests:blocked.length,realBusinessCalls:0,audio:false,cursorCaptured:false};
  await writeFile('docs/verification/ui-canvas-recording.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}catch(error){await writeFile('docs/verification/ui-canvas-recording-unavailable.json',JSON.stringify({executedAt:new Date().toISOString(),available:false,reason:error.message},null,2)+'\n');throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
