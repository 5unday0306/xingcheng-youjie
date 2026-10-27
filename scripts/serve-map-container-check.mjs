// Full workbench, read-only real stop history, no .env and no HTTP sender.
import {createServer} from '../server.mjs';import {createMapContainerServer} from '../lib/map-container-server.mjs';
import {readApproval,createLedger} from '../lib/runtime05b.mjs';import {createLivePlanning} from '../lib/live-planning.mjs';import {fileURLToPath} from 'node:url';
import {createFrameMapSession} from '../lib/frame-map-session.mjs';
const a=await readApproval(new URL('../docs/private/05b-approval.json',import.meta.url),{allowExpired:true}),ledger=createLedger(fileURLToPath(new URL('../docs/private/05b-ledger.json',import.meta.url)),a),summary=await ledger.summary();
if(summary.stopped?.code!=='SDK_FAILED')throw Error('检查服务要求保留既有SDK_FAILED，不恢复运行');
const live=createLivePlanning({ledger,initialStop:summary.stopped.code});
const origins={parentOrigin:'http://127.0.0.1:4178',mapOrigin:'http://127.0.0.2:4184'};
const mapSession=createFrameMapSession({live});
const child=createMapContainerServer({getOrigins:()=>origins,mapSession}),main=createServer({planning:live,live,mapFrameOrigin:origins.mapOrigin,mapFrameSession:mapSession});
await new Promise((resolve,reject)=>{child.once('error',reject);child.listen(4184,'127.0.0.2',resolve);});
await new Promise((resolve,reject)=>{main.once('error',reject);main.listen(4178,'127.0.0.1',resolve);});
console.log('正式工作台隔离检查：http://127.0.0.1:4178/；不读取.env，保留停止，真实SDK加载和代理不可用。');
process.on('SIGINT',()=>{main.closeAllConnections();child.closeAllConnections();main.close();child.close();});
