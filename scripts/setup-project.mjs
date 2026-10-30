// Fresh setup: creates no provider request and never copies old private files.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {loadCredentials,validateApproval,createLedger,readApproval} from '../lib/runtime05b.mjs';
const root=new URL('../',import.meta.url),real=process.argv.includes('--real');
if(process.argv.includes('--production')){const path=new URL('.env',root);try{await access(path);}catch{await writeFile(path,await readFile(new URL('.env.example',root)),{mode:0o600});}const {status}=await loadCredentials(path);console.log({production:true,configurationPresent:status,ready:Object.values(status).every(Boolean),next:'在本机补齐配置后 npm start；无接口调用，不修改旧授权与账本'});process.exit(Object.values(status).every(Boolean)?0:1);}
if(!real){console.log('离线：npm run start:local-shell（普通准备）或 npm run start:offline-test（明确标注的固定替身）。无需密钥，没有真实调用。');process.exit(0);}
if(!process.argv.includes('--confirm-authorized'))throw Error('请先确认账号用途/权限和必要调用授权，再显式使用 --real --confirm-authorized；此命令不代表替你创建/购买账号。');
const envPath=new URL('.env',root);try{await access(envPath);}catch{await writeFile(envPath,await readFile(new URL('.env.example',root)),{mode:0o600});throw Error('已创建本地.env空模板，请在本机填写四项配置后重新运行；不要发送密钥到聊天。');}
const {status}=await loadCredentials(envPath);if(!Object.values(status).every(Boolean))throw Error('四项配置未齐（Web服务、模型、JS Key、安全密钥）；未调用，请本机补齐。');
const path=new URL('docs/private/05b-approval.json',root);await mkdir(new URL('docs/private/',root),{recursive:true});
try{await access(path);console.log('已有本机授权/版本/账本，未覆盖。按README续期或复核失败；启动 node server.mjs --real-preparation --case06');process.exit(0);}catch(e){if(e.code!=='ENOENT')throw e;}
const config=JSON.parse(await readFile(new URL('config/development08.json',root),'utf8'));
const a=validateApproval({version:1,id:'FRESH-LOCAL-'+Date.now(),policy:'development-05b',flow:'product-05b',stages:['task07','task08','task09'],enabled:true,termsConfirmed:true,accountCostBoundConfirmed:true,model:'deepseek-flash',expiresAt:new Date(Date.now()+23*3600000).toISOString(),budgetCents:null,caps:config.caps,reserveCents:{model:10,location:1,route:1,map:5}});
await writeFile(path,JSON.stringify(a,null,2),{mode:0o600});const ledger=createLedger(fileURLToPath(new URL('docs/private/05b-ledger.json',root)),a);const summary=await ledger.summary();
console.log({initialized:true,providerCalls:summary.counts,configurationPresent:status,privateVersion:1,message:'新账本/空位置，从普通正式入口逐点确认与选餐；不会自动加载SDK或生成。启动 node server.mjs --real-preparation --case06'});
