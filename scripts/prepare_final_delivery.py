"""Prepare a separately versioned local deliverable from approved actual records.

No .env reads, no provider requests, no upload. Originals are never overwritten.
"""
from pathlib import Path
import json,re,hashlib,html,datetime,subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/private/final-delivery-2026-10-29'
OUT.mkdir(exist_ok=True)
SNAP=ROOT/'docs/private/final-delivery-source-snapshot-2026-10-29'
source=next((SNAP/'keep').glob('*.jsonl'))
manifest=json.loads((SNAP/'manifest.json').read_text(encoding='utf-8-sig'))[0]
assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['sha256']
counts={};changes=[];events=[];turns=[]
patterns=[
 ('private-key',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 ('token',r'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]{15,})'),
 ('authorization',r'(?i)Bearer\s+[A-Za-z0-9._~+-]{8,}'),
 ('url-query',r'''https?://[^\s<>"'\\]+\?[^\s<>"'\\]*'''),
 ('local-user',r'(?i)[A-Z]:[\\/]+Users[\\/]+[^\\/\s"<>]+'),
 ('email',r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
 ('mobile-number',r'(?<![A-Za-z0-9])1[3-9]\d{9}(?![A-Za-z0-9])'),
 ('identity-number',r'(?<!\w)\d{6}(?:19|20)\d{9}[\dXx](?!\w)'),
 # AMap keys/security codes can be bare 32-hex literals in nested tool outputs.
 ('32-hex-identifier',r'(?i)(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])'),
 ('credential-assignment',r'''(?i)(?:AMAP_\w*(?:KEY|CODE)|DEEPSEEK_\w*KEY|securityJsCode|jscode|api[_-]?key|access_token|password)\s*\\?["']?\s*[:=]\s*\\?["'][^"'\r\n]{4,}\\?["']'''),
]
def redact(s,line,path):
 for kind,pat in patterns:
  def replace(m):
   counts[kind]=counts.get(kind,0)+1
   changes.append({'eventLine':line,'field':path,'kind':kind})
   if kind=='url-query':return m[0].split('?')[0]+'?[REDACTED_QUERY]'
   return '[REDACTED_'+kind.upper()+']'
  s=re.sub(pat,replace,s)
 def binary(m):
  counts['binary-attachment']=counts.get('binary-attachment',0)+1
  changes.append({'eventLine':line,'field':path,'kind':'binary-attachment'})
  return '[REDACTED_BINARY_ATTACHMENT; original and attachment hash index remain private]'
 s=re.sub(r'data:(?:image|audio|video)/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+',binary,s)
 if len(s)>2000 and re.fullmatch(r'[A-Za-z0-9+/=\s]+',s):
  counts['binary-attachment']=counts.get('binary-attachment',0)+1
  changes.append({'eventLine':line,'field':path,'kind':'binary-attachment'})
  return '[REDACTED_BINARY_ATTACHMENT; original and attachment hash index remain private]'
 return s
def clean(x,line,path=''):
 if isinstance(x,str):return redact(x,line,path)
 if isinstance(x,list):return [clean(v,line,path+'/'+str(i)) for i,v in enumerate(x)]
 if isinstance(x,dict):return {k:clean(v,line,path+'/'+k) for k,v in x.items()}
 return x
with source.open(encoding='utf8') as f,(OUT/'完整开发轨迹-脱敏.jsonl').open('w',encoding='utf8') as g:
 for n,l in enumerate(f,1):
  e=json.loads(l);c=clean(e,n);events.append(c);g.write(json.dumps(c,ensure_ascii=False)+'\n')
  p=c.get('payload',{})
  if c.get('type')=='response_item' and p.get('type')=='message' and p.get('role') in ('user','assistant'):
   text='\n'.join(v.get('text','') for v in p.get('content',[]) if isinstance(v,dict) and v.get('text'))
   if text:turns.append((n,c.get('timestamp',''),p['role'],text))

STYLE='''body{margin:0;background:#edf3f5;color:#173247;font:19px/1.7 "Microsoft YaHei",sans-serif}header,main{max-width:1120px;margin:auto;padding:24px 40px}header{position:sticky;top:0;background:#edf3f5;border-bottom:1px solid #bdcdd5}a{color:#175976}article{padding:26px 0;border-bottom:1px solid #bdcdd5}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{color:#475d69}h1{font-size:30px}nav a{margin-right:24px}'''
with (OUT/'完整开发对话-阅读版.html').open('w',encoding='utf8') as f:
 f.write('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>行程有解 · 开发对话</title><style>'+STYLE+'</style><header><h1>完整开发对话 · 脱敏阅读版</h1><p>真实用户/助手消息顺序保留；全部工具事件见同目录JSONL。脱敏替换有标记，原始记录私有保存。当前是截至导出时点的快照。</p><nav><a href="#line-2107">05B 地图与草案</a><a href="#line-7717">07 多角色协作</a><a href="#line-8455">08 锁定重排</a><a href="#line-8625">09 收尾复现</a></nav></header><main>')
 for line,ts,role,t in turns:f.write(f'<article id="line-{line}"><small>事件{line} · {html.escape(ts)} · {role}</small><pre>{html.escape(t)}</pre></article>')
 f.write('</main></html>')

# A navigable source viewer for the screen recording: excerpts carry original
# event numbers; navigating this viewer does not replay a model/tool request.
def event_text(n):
 e=events[n-1];p=e.get('payload',{})
 if p.get('type')=='message':return '\n'.join(c.get('text','') for c in p.get('content',[]) if isinstance(c,dict))
 if p.get('type')=='function_call_output':return str(p.get('output',''))
 return json.dumps(p,ensure_ascii=False,indent=2)
diff=subprocess.check_output(['git','show','--format=fuller','--no-ext-diff','d88669e','--','lib/agent-review.mjs'],cwd=ROOT).decode('utf8')
diff=redact(diff,0,'git-diff')
chapters=[
 ('1 · 原始用户任务',8455,event_text(8455),'只改第2天4公里，保留午餐与原方案。以下是原始记录，不重新提交Prompt。'),
 ('2 · 真实失败输出',8838,event_text(8838),'审查输入9109字节触发保护；旅行无解与接口/格式失败不是同一结论。'),
 ('3 · 实际修复说明',8895,event_text(8895),'这是独立的未知项数量合同错误，不把两项错误混成同一根因。'),
 ('4 · 真实代码提交',0,diff,'实际Git差异：必填引用传给模型，但应用仍拒绝缺引用，绝不代填。'),
 ('5 · 实际验证与边界',9328,event_text(9328),'验证数量及范围来自原记录。替身检查与真实API验收分开。'),
]
cards=[]
for i,(title,line,text,note) in enumerate(chapters):
 # Tool output is shown in full; scroll within it rather than silently cutting it.
 cards.append(f'<section id="chapter-{i}"><h2>{html.escape(title)}</h2><p class="note">{html.escape(note)}</p><small>来源：{"原始会话事件 "+str(line) if line else "git show d88669e -- lib/agent-review.mjs"} · 原始时间戳与完整上下文见脱敏轨迹</small><pre>{html.escape(text)}</pre></section>')
viewer='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>真实AI开发记录回放</title><style>'''+STYLE+'''header{max-width:none;padding:20px 55px}h1{margin:0}main{max-width:1740px;padding:10px 55px}section{display:none}section.active{display:block}section pre{height:660px;overflow:auto;background:white;padding:28px;font:25px/1.6 "Microsoft YaHei",sans-serif;border-left:5px solid #b6663e}h2{font-size:34px;margin:12px 0}.note{margin:8px 0}button{font:20px "Microsoft YaHei";padding:10px 16px;margin:8px 10px 0 0;background:white;border:1px solid #75929f;color:#173247}small{font-size:18px}</style><header><h1>真实AI开发过程 · 历史记录复现</h1><small>本次录制仅导航、阅读真实开发记录与Git差异；没有重演故障，没有新模型调用，没有改写原始输出。</small><nav>'''+''.join(f'<button data-index="{i}">{i+1} / {len(chapters)}</button>' for i in range(len(chapters)))+'''</nav></header><main>'''+''.join(cards)+'''</main><script>document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));document.getElementById('chapter-'+b.dataset.index).classList.add('active')}));document.querySelector('button').click();</script></html>'''
(OUT/'开发证据回放台.html').write_text(viewer,encoding='utf8')
audit={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSHA256':manifest['sha256'],'sourceBytes':source.stat().st_size,'eventsPreserved':len(events),'readableMessages':len(turns),'redactions':counts,'replacements':changes,'originalUnchanged':True,'scope':'全量递归字符串规则及上下文风险复核，不冒充逐字人工校对；脱敏标记保留事件位置，附件二进制原件私有','candidateSHA256':hashlib.sha256((OUT/'完整开发轨迹-脱敏.jsonl').read_bytes()).hexdigest()}
(OUT/'脱敏变更与核对.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:audit[k] for k in ['eventsPreserved','readableMessages','redactions','candidateSHA256']},ensure_ascii=False))
