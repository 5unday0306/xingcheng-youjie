import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const bytes=await readFile('docs/verification/ui-canvas-operation.webm');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
try{
  await page.setContent('<style>body{margin:0;background:#eff7f5}video{display:block;width:1440px;height:900px}</style><video id="video" muted></video>');
  await page.evaluate(base64=>new Promise((resolve,reject)=>{const video=document.getElementById('video');video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Recorded video cannot decode'));video.src='data:video/webm;base64,'+base64;}),bytes.toString('base64'));
  const size=await page.evaluate(()=>({width:video.videoWidth,height:video.videoHeight,duration:Number.isFinite(video.duration)?video.duration:null}));
  if(size.width!==1440||size.height!==900)throw Error('Recorded dimensions mismatch');
  const decoded=[];
  for(const second of [2,8,19,26,30]){
    await page.evaluate(second=>new Promise((resolve,reject)=>{const v=document.getElementById('video');const timeout=setTimeout(()=>reject(Error('Video seek timed out')),8000);v.onseeked=()=>{clearTimeout(timeout);resolve();};v.currentTime=second;}),second);
    await page.screenshot({path:`docs/verification/ui-canvas-video-frame-${String(second).padStart(2,'0')}.png`});decoded.push(second);
  }
  const report={checkedAt:new Date().toISOString(),decoded:true,...size,decodedFrameSeconds:decoded,notice:'Frames decoded from actual operation recording; no application states synthesized. Container duration may be unspecified for MediaRecorder WebM; wall-clock duration recorded separately.'};
  await writeFile('docs/verification/ui-canvas-video-check.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();}
