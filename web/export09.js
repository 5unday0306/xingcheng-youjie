const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function addExportControls({section,post,refresh}){
 const box=el('section');box.className='exportControls';box.id='export09';box.append(el('h3','保存与导出'));const status=el('p','保存不代表接受修订。导出保留用户条件、锁定、活动结构与独立估计，不打包地图或交通原始数据。');status.id='exportStatus09';status.setAttribute('role','status');
 const kind=el('select');kind.id='exportKind09';kind.setAttribute('aria-label','选择导出方案');for(const [v,t] of [['adopted','当前采用方案'],['preview','修订预览（不代表采用）']]){const o=el('option',t);o.value=v;kind.append(o);}
 const save=el('button','保存当前需求、锁定与方案状态');save.id='saveScheme09';save.type='button';save.onclick=async()=>{save.disabled=true;try{await post('save');await refresh();status.textContent='已保存结构、锁定和采用状态。重启后地图需手动取得，未自动接受预览。';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 box.append(status,save,kind);
 for(const [format,label] of [['html','导出可读方案 HTML'],['json','导出允许的数据 JSON']]){const b=el('button',label);b.id='export'+format.toUpperCase()+'09';b.type='button';b.onclick=async()=>{b.disabled=true;try{const d=await post('export',{kind:kind.value});const text=format==='html'?d.html:JSON.stringify(d.data,null,2);const blob=new Blob([text],{type:format==='html'?'text/html;charset=utf-8':'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='行程有解-'+kind.value+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已导出自有结构记录；地图、道路及上游交通数值未导出，可读HTML可用浏览器打印。';}catch(e){status.textContent='未导出：'+e.message;}finally{b.disabled=false;}};box.append(b);}
 section.append(box);
}
