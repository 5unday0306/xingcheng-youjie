"""Build local review materials; never reads .env or calls business APIs."""
from pathlib import Path
import json, re, hashlib, html
from datetime import datetime, timezone
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
import pymupdf

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/materials/final-review'
PRIVATE=ROOT/'docs/private/final-materials-review'
OUT.mkdir(parents=True,exist_ok=True); PRIVATE.mkdir(parents=True,exist_ok=True)
VERSION='b0f63effc748bd2c0cac5acfcc42ff02fa7072c7'
FONT='ProjectCN'
pdfmetrics.registerFont(TTFont(FONT,'C:/Windows/Fonts/simhei.ttf'))
BLUE=colors.HexColor('#173247')
body=ParagraphStyle('Body',fontName=FONT,fontSize=11,leading=19,spaceAfter=10,wordWrap='CJK',textColor=colors.HexColor('#273746'))
head=ParagraphStyle('Head',parent=body,fontSize=23,leading=31,spaceAfter=18,textColor=BLUE)
sub=ParagraphStyle('Sub',parent=body,fontSize=14,leading=22,spaceBefore=12,spaceAfter=9,textColor=BLUE)
small=ParagraphStyle('Small',parent=body,fontSize=9,leading=15)
sections=[
('01 问题、目标与实际范围',[
('真实问题','结伴旅行者的兴趣、预算、可用时间和体力并不相同。单纯列出景点，无法说明每个人的限制是否被满足；重新生成整份攻略，也可能移动已经确定的午餐，或改变原本无需修改的安排。项目将多人条件整理、地图路线、程序核查和修订预览连接起来。'),
('测试场景','真实验收以太原三人、2026年11月7日至8日为例。每天09:00—18:00包含返回集合点；每人全程预算600元，不含住宿与往返太原的大交通。初始每日步行上限6公里，包含道路、交通接驳和场馆内部步行。三人偏好分别为历史展览、风景拍照、美食且少走路。'),
('变更场景','用户将11月8日午餐锁定在老太原菜馆钟楼街店，计划12:30—13:30；只把第2天三人的步行上限改为4公里。第1天条件与预算保持。锁定是用户计划，不是餐厅预约或营业保证。'),
('支持范围','输入支持1—6人、1—3天；完整真实验收范围是上述太原固定案例。输入范围不能等同于所有人数、城市和天数组合均已验证。暂不提供跨城、订票代付、多人实时编辑或任意拖拽编排。')]),
('02 系统架构与数据流',[
('职责划分','浏览器负责需求编辑、地图/活动展示、角色过程、版本比较和用户确认；Node.js服务负责输入与结构检查、模型编排、道路适配、核算、调用记录及停止。模型不充当票价、营业、坐标或距离的事实来源。应用运行代码没有外部业务框架依赖；浏览器自动化与材料工具属于验证/制作环境。'),
('主流程','需求快照 → 带来源的候选资料 → 模型草案 → 结构检查 → 地点/道路工具 → 时间、个人费用、逐日步行核查 → 地图与结果。修订复用这一流程，并增加上游引用、锁定校验和版本预览。'),
('地图边界','真实地图在独立来源的自有子页运行；主工作台保留严格脚本策略。子页按已批准范围配置高德所需资源与字符串编译能力，仍限制脚本来源、导航、弹窗等。iframe本身不是安全保证，来源、消息和服务端限制共同生效。'),
('消息与接口','父子消息核对origin、source、结构、运行ID和序号。地图只取得必要地点、几何与选中状态，不接收个人需求原话、预算或服务端安全密钥。服务端代理固定上游及初始化合同，不提供任意URL转发。模型和道路请求继续受服务端控制。')]),
('03 Agent职责与Prompt意图控制',[
('需求协调','独立模型请求接收匿名逐人条件、程序问题ID和历史冲突，整理硬约束、偏好和风险。程序核对完整约束ID集合，不允许模型悄悄改写预算、步行上限或锁定。'),
('方案筛选与规划','筛选角色实际使用协调产出及SHA256引用，提出受控候选；规划角色使用筛选产出引用，只选择已经给出的候选ID/关系及理由，不生成坐标、票价或道路事实。角色不是同一次回答的四个标题。'),
('行程审查','程序先取得受影响道路并重新核算，再将规划引用、结果和问题交给独立审查请求。审查可提出有限回交，但不能覆盖程序判定；次数、超时和并发均有保护，失败不伪造成功事件。'),
('交接可检查','界面展示角色实际开始、完成或失败，允许查看结构化输入输出、引用和简要依据。角色原始Prompt、响应和usage私有留档。只展示外部可检查的决策依据，不提供或编造模型内部思考。产品Agent日志不代替选手使用AI开发的完整聊天。'),
('意图约束','Prompt明确字段、候选范围、禁止新增事实、必填引用和失败输出；程序对结果独立校验。曾有回交漏screenRef而被拒绝，修复是强化必填提示，不由程序替模型补造引用。')]),
('04 事实、估计与核算口径',[
('资料状态','地点、开放、停入、票价、停留、内部步行、餐饮等分别记录来源、取得时间和适用范围。用户确认测试落点不等于官方入口；地图当前交通预测不保证旅行日期通行。未知值保留null与原因，不自动置零。'),
('逐人及逐日','个人全程预算分别检查，不能相互抵销。步行逐日累计道路、公交接驳与内部活动；相同路段发生在不同时间需要分别计入，只有明确重叠范围才去重。若公交返回总步行已经包含分段，不能再次累计。'),
('区间与冲突','估计下界超过上限，说明已计入部分存在估计冲突；上界超过上限不能宣称达标。已知估计上界不超过限制，也不能消除未核实总量。结构有效、已知估计未超、资料不足、明确冲突和接口失败分别表达。'),
('时间与费用','每日检查包含去程、活动、用餐、相邻交通和返程。等待和营业未知需传播影响，不制造精确到离保证。全程费用包含餐饮、门票和市内交通；已有费用小于预算不代表余款可自由支配。风险预留是程序记账，不是供应商实际扣费。')]),
('05 锁定、变更与动态重排',[
('稳定锁定','锁定关联活动ID、日期、餐厅身份、用户点位引用和计划起止。输出后程序再次核对，不能换名、换点或另建午餐绕过锁定。早到需要安排等待，晚于锁定起点构成已支持时间检查的问题；未知等位仍不能当成事实。'),
('版本关系','需求版本、原采用方案、修订预览和当前采用引用分别管理。修改第2天条件后，原方案明确不适配新条件；拒绝预览不把4公里自动恢复为6公里。保存不等于采用，查看某一版本也不等于采用。'),
('候选与道路','候选包括保留顺序、交换未锁定街区顺序、取消食品街等。改变偏好满足度的取舍必须可见，实际采用由用户决定。删除活动后重查前后交通，未变路段复用有效结果；道路缺几何不补直线。'),
('程序阻止不合格采用','采用前再次检查锁定、步行上界、时间和预算冲突。任务08/09真实预览第2天步行上界仍大于4公里，因此禁止采用，原方案保留。这证明本次候选未满足条件，不证明所有可能路线全局无解。'),
('执行保护','运行中变更通过需求revision、runId和取消信号拒绝迟到覆盖。有限回交与轮次耗尽均可结束；正常关闭、用户取消、上游失败分别记录。')]),
('06 真实结果与结论边界',[
('任务06：交通链完整','两天共10条物理路段取得真实几何：第1天6条，第2天4条，含用餐与返回。该次第1天步行估计6154—7854米，超过6公里；第2天和时间、费用仍有未知。完整道路不等于旅行可行。'),
('任务07：真实协作修订','最终a5一轮4次模型、4次候选道路请求。第1天已计入步行6151—7851米降为3880—5580米，已计入时间384增至404分钟，每人已计入费用150—258元增至151—259元。内部步行区间没有调低；总量仍未知，结论为资料不足。'),
('任务08/09：不满足仍保留限制','锁定午餐12:30—13:30、只变更第2天4公里的真实角色与道路流程已执行。最终正式轮四角色分别完成，使用4次模型与2条受影响道路，预览仍不满足步行上界，禁止采用。未自动解锁、放宽或宣称全局无解。'),
('不能推导的结论','本项目未完成统一样本的单模型/多Agent对照实验，不能据此声称多Agent更优、更省钱或全局最优。交通取得时间不同导致预测变化，不能把全部差值归因于算法。没有实际访谈统计或满意度调查，不提供模型自评效果分数。')]),
('07 工程演进与真实失败修复',[
('地图兼容','早期主脚本加载并不代表底图成功。初始化JSONP代理、动态脚本来源、SDK字符串执行、Worker瓦片来源分别出现阻塞；逐项定位后采用独立来源地图和已批准资源合同。保留灰底、超时与旧失败，不把新诊断倒推成旧失败根因。'),
('结构与数据','公交响应空铁路信封曾被拒绝，补充仅空值兼容并保留实际铁路数据拒绝。模型输出不符合严格结构时停止；07回交漏引用和08输入9109字节保护等失败保留原记录。压缩重复上下文、以字典表达未知和加强字段提示，不取消保护或编造引用。'),
('收尾问题','09出现导出控件重复接线、原生tar中文路径失败和4190端口被fetch拒绝。改为独立git clone、正常端口和单一接线，未修改浏览器安全设置。最终小修使恢复道路后提示不再错误覆盖为旧结构状态。'),
('过程追溯','主要提交：05B核心d31fb58；06核算7904fc4；07核心0115688与修复3ca7f61；08为98f40ee；09主体fb39953、独立复现ded7b1f、交接提示d88669e，最终b0f63ef。完整原始会话及附件哈希另行私有保存，摘要不能替代原始Prompt链。')]),
('08 验证、复现与保存导出',[
('自动化与真实分开','最终167项程序检查、30项协作/保存导出浏览器检查、53项原UI回归通过。浏览器受控上游验证合同与异常，不冒充真实接口。真实地图、角色和道路另有记录与私有实际录屏。1人1天、6人3天验证输入，不代表完整真实行程覆盖。'),
('独立复现','候选ded7b1f在无旧私有文件与空浏览器目录实测76.992秒，含无Key离线、真实地图/草案/道路、07/08、保存导出、刷新重启。使用预备账号、凭据及本机运行环境，不含注册、权限办理、Node/浏览器安装、人工阅读点选时间，不是新手完整上手耗时。'),
('版本与可重复','该独立测试使用ded7b1f；最终提示与字段小修另经167+30+53及正式真实流程验证，不能称最终SHA已从零完整重跑。固定替身结果可确定重复；真实模型和交通不保证逐字逐值一致。'),
('恢复与导出','结构保存关联需求、锁定、采用引用与历史状态；刷新重启不自动调用。道路仅服务内存保留，超过30分钟不直接用于新重排/采用，重启需手动重新取得。HTML/JSON正向导出自有结构与说明，不含地图、瓦片、坐标、道路或上游交通数值。')]),
('09 局限、材料与证据索引',[
('仍待核实','未来开放、预约、门票、餐厅营业/等位、完整餐饮与部分内部步行边界尚缺。真实手机、其他浏览器、外部部署、实际账单与地图许可文件未完成核对。正文采用自有文字及结构；按用户要求，另生成含真实地图原图的学习展示版，保留出处和未采用说明。'),
('材料对应','本文对应产品b0f63effc748bd2c0cac5acfcc42ff02fa7072c7，编制日期2026-10-29。角色运行日志与选手AI开发聊天不是同一种证据。完整会话脱敏副本还需人工复核；既有短WebM不是最终5—8分钟MP4。'),
('主要本地依据','docs/05B-产品联调交付.md；docs/06-每日路线交付与验收.md；docs/07-多Agent修订预览交付.md；docs/08-锁定与重排验收.md；docs/09-产品收尾与最终验收.md；docs/prompts/任务08-09锁定重排与收尾索引.md；各文档引用的独立JSON/TAP与附件哈希。'),
('公开参考','高德安全密钥及serviceHost：https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode；高德路径规划：https://developer.amap.com/api/webservice/guide/api/direction；MDN iframe：https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe。资料核查日期和使用范围以项目原记录为准，本文没有新增接口调用或重新核验未来条件。'),
('最终口径','这是已完成主线验收、保留未知与不达标结果的太原试点原型，不是经过现实旅行验证的服务，不是全国规划覆盖或获奖承诺。官方赛事规则仍应按最终通知核对，根目录TXT未经过官网验证。')])]

def P(t,style=body): return Paragraph(html.escape(t).replace('\n','<br/>'),style)
story=[Spacer(1,60),P('行程有解',ParagraphStyle('Cover',parent=head,fontSize=38,leading=48)),P('多 Agent 协同的个性化旅行规划\n与动态重排看板',head),Spacer(1,25),P('技术文档 · 本地审核版',sub),P('产品版本  '+VERSION[:12]),P('编制日期  2026年10月29日'),Spacer(1,30),P('核心结论',sub),P('真实地图、完整交通链、四角色交接、锁定与动态重排、保存导出已经完成本轮验收。当前4公里候选仍未满足上界，程序拒绝采用；资料不足与未来条件继续明确保留。'),P('本文件由AI辅助整理，依据真实代码、验收与开发记录。未使用真实地图图面；不把测试通过写成旅行可行或获奖保证。'),Spacer(1,25),P('阅读导航',sub),P('问题与范围 / 架构 / 意图控制 / 核算 / 锁定重排 / 结果 / 失败修复 / 复现与导出 / 局限与索引')]
source=['# 行程有解 技术文档\n\n产品版本：'+VERSION+'\n']
for title,paras in sections:
    story.append(PageBreak());story.append(P(title,head));source.append('\n## '+title+'\n')
    for label,text in paras:
        story.extend([P(label,sub),P(text)]);source.extend(['\n### '+label+'\n',text+'\n'])
def page(c,d):
    w,h=d.pagesize;c.setStrokeColor(colors.HexColor('#D8E2E8'));c.line(48,49,w-48,49)
    c.setFont(FONT,8);c.setFillColor(BLUE);c.drawString(48,34,'行程有解 | 技术文档 · 审核版 | '+VERSION[:7]);c.drawRightString(w-48,34,str(d.page))
pdf=OUT/'行程有解-技术文档-审核版.pdf'
SimpleDocTemplate(str(pdf),pagesize=(595.276,841.89),leftMargin=48,rightMargin=48,topMargin=47,bottomMargin=65,title='行程有解：技术文档',author='行程有解项目').build(story,onFirstPage=page,onLaterPages=page)
(OUT/'技术文档正文.md').write_text('\n'.join(source),encoding='utf-8')
doc=pymupdf.open(pdf); texts=[p.get_text() for p in doc]
assert len(doc)<=30
renders=PRIVATE/'pdf-pages';renders.mkdir(exist_ok=True)
for i,p in enumerate(doc): p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(renders/f'page-{i+1:02}.png')
(OUT/'PDF校验.json').write_text(json.dumps({'productRevision':VERSION,'pages':len(doc),'charactersByPage':[len(t) for t in texts],'allPagesTextExtractable':all(len(t)>80 for t in texts),'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'visualReview':'pending'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pdfPages':len(doc),'pdf':str(pdf)},ensure_ascii=False))

# Preserve the approved snapshot event order. Candidate only, not cleared for sharing.
snap=ROOT/'docs/private/task09-session-snapshot-2026-10-29'
manifest=json.loads((snap/'manifest.json').read_text(encoding='utf-8-sig'))[0]
source_path=next((snap/'keep').glob('*.jsonl'))
assert hashlib.sha256(source_path.read_bytes()).hexdigest()==manifest['sha256']
counts={};turns=[]
patterns=[('token',r'\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]{15,})'),('auth',r'(?i)Bearer\s+[A-Za-z0-9._~-]{12,}'),('assignment',r'''(?i)(?:["']?(?:AMAP_\w*(?:KEY|CODE)|DEEPSEEK_\w*KEY|api_key|apikey|securityJsCode|jscode|access_token|password)["']?\s*[:=]\s*)["'][^"'\r\n]{8,}["']'''),('url_query',r'''https?://[^\s<>"']+\?[^\s<>"']*'''),('local_user',r'(?i)[A-Z]:[\\/]+Users[\\/]+[^\\/\s"<>]+')]
def scrubstr(s):
    for kind,pat in patterns:
        def sub(m):
            counts[kind]=counts.get(kind,0)+1
            if kind=='url_query': return m.group(0).split('?')[0]+'?[REDACTED_QUERY]'
            if kind=='local_user':return 'C:/Users/[REDACTED_USER]'
            return '[REDACTED_'+kind.upper()+']'
        s=re.sub(pat,sub,s)
    if len(s)>2000 and (s.startswith('data:image/') or re.fullmatch(r'[A-Za-z0-9+/=\s]+',s)):
        counts['binary']=counts.get('binary',0)+1;return '[REDACTED_BINARY_ATTACHMENT; see private original]'
    return s
def scrub(x,key=''):
    if isinstance(x,str):
        if key in ('data','image_url') and (len(x)>2000 or x.startswith('data:')):
            counts['binary']=counts.get('binary',0)+1;return '[REDACTED_BINARY_ATTACHMENT]'
        return scrubstr(x)
    if isinstance(x,list):return [scrub(a) for a in x]
    if isinstance(x,dict):return {k:scrub(v,k) for k,v in x.items()}
    return x
red=PRIVATE/'开发完整记录-脱敏候选.jsonl'
with source_path.open(encoding='utf-8') as f,red.open('w',encoding='utf-8') as g:
    n=0
    for n,line in enumerate(f,1):
        obj=scrub(json.loads(line));g.write(json.dumps(obj,ensure_ascii=False)+'\n')
        payload=obj.get('payload',{})
        if obj.get('type')=='response_item' and payload.get('type')=='message' and payload.get('role') in ('user','assistant'):
            text='\n'.join(c.get('text','') for c in payload.get('content',[]) if isinstance(c,dict) and c.get('text'))
            if text: turns.append((n,obj.get('timestamp',''),payload['role'],text))
with (PRIVATE/'开发对话阅读版.html').open('w',encoding='utf-8') as f:
    f.write('<!doctype html><meta charset="utf-8"><title>完整开发对话 · 脱敏候选待复核</title><style>body{max-width:1100px;margin:40px auto;font:16px/1.8 "Microsoft YaHei",sans-serif;color:#173247}article{border-top:1px solid #ccd8df;padding:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:28px}</style><h1>完整开发对话阅读版 · 脱敏候选</h1><p>原始快照的用户与助手消息按顺序呈现；工具调用及输出完整保留于同目录JSONL。当前并非已审核对外材料，不替代私有原文；空白二进制附件需核查索引。</p>')
    for line,ts,role,t in turns:f.write(f'<article id="line-{line}"><b>事件行{line} · {html.escape(ts)} · {role}</b><pre>{html.escape(t)}</pre></article>')
audit={'status':'脱敏候选，仅私有；逐项人工复核未完成，禁止当作已审核材料上传','sourceSha256':manifest['sha256'],'snapshotBytes':source_path.stat().st_size,'eventsPreserved':n,'messageTurns':len(turns),'redactions':counts,'candidateSha256':hashlib.sha256(red.read_bytes()).hexdigest(),'note':'不删除事件，不筛掉失败；URL参数/疑似凭据/本机用户名/二进制替换有标记。规则审查可能误报漏报，完整原文不改。'}
(PRIVATE/'脱敏处理记录.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'events':n,'turns':len(turns),'redactions':counts},ensure_ascii=False))
