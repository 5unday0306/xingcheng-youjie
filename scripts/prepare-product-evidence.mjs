// Explicit evidence redaction only; never opens environment or session transcripts.
import {readdir,readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,relative} from 'node:path';
const root=resolve('.'),pub=resolve('docs/verification'),privateDir=resolve('docs/private/05b-product-originals');
if(relative(root,privateDir).startsWith('..'))throw Error('Evidence path outside workspace');await mkdir(privateDir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=[];
const safe=s=>s.replace(/https?:\/\/[^\s"'<>]+/g,u=>{try{const p=new URL(u);return p.origin+p.pathname+(p.search?'?[query omitted]':'');}catch{return '[url omitted]';}}).replace(/&[A-Za-z_][A-Za-z0-9_]*=[^\s"']+/g,'[query omitted]');
for(const name of await readdir(pub)){
 if(!name.startsWith('task05b-product-'))continue;
 if(name.endsWith('-report.json')||name.endsWith('-recording.json')){
  const path=resolve(pub,name),bytes=await readFile(path),digest=hash(bytes),copy=resolve(privateDir,name+'.'+digest.slice(0,12));await writeFile(copy,bytes);if(hash(await readFile(copy))!==digest)throw Error('Evidence copy hash mismatch');
  const r=JSON.parse(bytes);if(r.errors)r.errors=r.errors.map(e=>({...e,message:safe(e.message||'')}));r.redaction={scope:'URL query removal; original snapshot retained locally',originalSha256:digest};await writeFile(path,JSON.stringify(r,null,2)+'\n');manifest.push({name,sha256:digest,privateCopyHashVerified:true,kind:'original-json'});
 }
 // Intermediate diagnostic movies remain local pending full media review.
 if(name.endsWith('-operation.webm')&&!name.includes('-two-days-')&&!name.includes('-delivery-final-')&&!name.includes('-delivery-release-')){
  const source=resolve(pub,name),target=resolve(privateDir,name);if(relative(root,source).startsWith('..')||relative(root,target).startsWith('..'))throw Error('Unsafe evidence move');
  const digest=hash(await readFile(source));await rename(source,target);if(hash(await readFile(target))!==digest)throw Error('Movie hash mismatch');manifest.push({name,sha256:digest,privateCopyHashVerified:true,kind:'unreviewed-movie-local-only'});
 }
}
await writeFile(resolve(pub,'task05b-product-evidence-manifest.json'),JSON.stringify({at:new Date().toISOString(),scope:'Product validation media and diagnostic snapshots only; no chat export',manifest},null,2)+'\n');console.log({files:manifest.length,scope:'explicit product evidence only'});
