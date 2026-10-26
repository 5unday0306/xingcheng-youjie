// Offline decoder only. Never opens the live application or loads SDK resources.
import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const prefix=process.argv[2]||'docs/verification/task05b-m3-real',bytes=await readFile(prefix+'-operation.webm');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.route('**/*',r=>r.abort());
 await page.setContent('<style>body{margin:0}video{display:block;width:1440px;height:900px}</style><video id="video" muted></video>');
 await page.evaluate(base64=>new Promise((resolve,reject)=>{const v=document.getElementById('video');v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('录屏解码失败'));v.src='data:video/webm;base64,'+base64;}),bytes.toString('base64'));
 const size=await page.evaluate(()=>({width:video.videoWidth,height:video.videoHeight}));if(size.width!==1440||size.height!==900)throw Error('录屏尺寸不符');
 const seconds=[2,8,14];for(const second of seconds){await page.evaluate(t=>new Promise((resolve,reject)=>{const v=document.getElementById('video'),timer=setTimeout(()=>reject(Error('录屏定位超时')),8000);v.onseeked=()=>{clearTimeout(timer);resolve();};v.currentTime=t;}),second);await page.screenshot({path:prefix+`-frame-${second}.png`});}
 const report={checkedAt:new Date().toISOString(),decoded:true,...size,frameSeconds:seconds,bytes:bytes.length,scope:'真实录屏离线解码，未重新加载应用或SDK；取帧不代表全部视频逐帧复核'};
 await writeFile(prefix+'-video-check.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();}
