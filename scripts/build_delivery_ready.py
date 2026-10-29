"""Local final video/PDF assembly. No app changes, provider requests or upload."""
from pathlib import Path
import sys,json,subprocess,hashlib,ast,wave,datetime,re
from PIL import Image,ImageDraw,ImageFont
import pymupdf
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle,Flowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/private/final-delivery-2026-10-29';ASSET=OUT/'assets';ASSET.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'docs/private/material-runtime'))
import imageio_ffmpeg
FF=imageio_ffmpeg.get_ffmpeg_exe();VERSION='b0f63effc748bd2c0cac5acfcc42ff02fa7072c7';OLD=ROOT/'docs/private/final-materials-review/video-assets'
voice=[
'行程有解，是面向结伴旅行者的多角色协同规划与动态重排工作台。接下来展示太原真实测试案例，包含保留失败结果的完整产品主线。',
'三位同行者分别偏好历史展览、风景拍照和美食少走路。每人全程预算六百元。此次变更只将第二天步行上限改为四公里，同时把午餐锁定在十二点半到十三点半。',
'这是既有真实验收录像的节选。本次材料制作没有重新调用地图或模型。系统把工作台与地图来源分开，未知路段不补直线，测试落点也不冒充官方入口。',
'第一天交通链包括集合点、参观入口、活动、午餐和返回。这里展示实际取得的道路，完整交通链并不意味着旅行条件已经全部满足。',
'第二天原方案同样包含去程、活动、午餐和返回。地图与活动列表使用同一方案版本，午餐锁定是用户计划，不是预约或营业保证。',
'这是未采用的重排预览。程序保留午餐和内部步行估计，只比较有真实道路支持的接驳。第二区间上界仍超限，所以不能因为有地图就宣称达标。',
'需求协调、方案筛选、行程规划和行程审查，是四次独立请求。下游实际使用上游结构化产出与引用。程序另行核算时间、预算、步行和锁定。',
'任务七展示了减少步行的候选及时间费用代价。任务八则保留四公里条件和午餐锁定，即使不满足，也不会自动放宽或采用。不满足当前候选，不等于证明全局无解。',
'下面用两分十五秒回看真实开发证据。屏幕正在导航原始用户任务，不是在本轮重新输入提示词。事件编号对应完整脱敏轨迹，原始副本另有哈希记录。用户明确要求只修改第二天，并保留原方案。',
'接下来是实际失败输出。审查输入达到九千一百零九字节，触发发送前体积保护。这是输入合同问题，不是旅行无解。原始输出中不可读的编码仍保留，不能把它解释成没有证据支持的另一种故障。',
'这里回看另一项独立修复。模型保留了十三项未知，而旧合同仅允许十二项。修复保留未知、增加合理的有界容量，并继续验证；不能为了让测试通过，就把未知事实删除或把它当作已经满足。',
'现在打开真实提交中的代码差异。应用把必填输出键明确传给模型，强调上游引用不可省略。程序仍然严格拒绝缺失引用，并不代填模型的交接证据。这个差异可以在对应提交中独立核对。',
'最后是原始验证记录。程序检查、受控浏览器回归与真实接口验收分开报告。这段录屏只阅读已有开发轨迹和代码，没有重演错误，也没有再次请求模型。完整失败和修复上下文见随附轨迹。',
'回到正式工作台的真实历史录像。同一结果回放可以切日和定位，刷新不会重新规划。当前预览仍待确认，有冲突时接受按钮受程序保护。',
'保存不等于接受。拒绝预览不会撤回新的四公里条件。导出保留用户条件、锁定、自有活动结构和独立估计，不打包地图瓦片、道路几何或上游交通数值。',
'独立候选在无旧私有状态和空浏览器存档下，真实流程耗时七十六点九九二秒。该测试使用已准备的账号和运行环境，不含注册、权限办理、环境安装和人工操作时间。',
'已完成真实地图、交通链、角色交接、锁定重排、版本比较和保存导出。未来营业预约、等位和部分内部步行仍未知。不能把这些缺口、外网部署或实际账单说成已经验证。',
'交付产品版本为屏幕上的提交。源码、复现说明、技术文档和完整开发轨迹分别提供。作品是太原试点原型，不承诺全国覆盖或旅行必然可行。感谢观看。'
]
(ASSET/'narration.json').write_text(json.dumps(voice,ensure_ascii=False),encoding='utf8')
ps=r'''Add-Type -AssemblyName System.Speech
$v=New-Object System.Speech.Synthesis.SpeechSynthesizer
$v.SelectVoice('Microsoft Huihui Desktop');$v.Rate=1
$texts=Get-Content -LiteralPath $args[0] -Raw -Encoding UTF8 | ConvertFrom-Json
for($i=0;$i -lt $texts.Count;$i++){ $p=Join-Path $args[1] ('voice-{0:00}.wav' -f $i);$v.SetOutputToWaveFile($p);$v.Speak($texts[$i]);$v.SetOutputToNull() }
$v.Dispose()
'''
(ASSET/'narrate.ps1').write_text(ps,encoding='utf-8-sig')
subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ASSET/'narrate.ps1'),str(ASSET/'narration.json'),str(ASSET)],check=True)
print('local narration prepared',flush=True)
footer=Image.new('RGBA',(1920,1080),(0,0,0,0));d=ImageDraw.Draw(footer);d.rectangle((0,1005,1920,1080),fill='#edf3f5');d.text((65,1025),'行程有解 | 产品 b0f63ef | 真实历史材料，非本次重新生成 | 本机系统语音旁白',font=ImageFont.truetype('C:/Windows/Fonts/simhei.ttf',24),fill='#385364');footer.save(ASSET/'footer.png')
timeline=json.loads((ROOT/'docs/private/final-materials-review/视频时间轴.json').read_text(encoding='utf8'))
record=json.loads((OUT/'开发回放录制记录.json').read_text(encoding='utf8'))
segments=[]
for i,s in enumerate(timeline['segments']):
 src=OLD/f'segment-{i:02}.mp4';seek=0
 if 8<=i<=12:src=OUT/'真实开发记录导航-原始录屏.webm';seek=record['events'][i-8]['atMs']/1000
 dur=s['duration'];wav=ASSET/f'voice-{i:02}.wav'
 with wave.open(str(wav)) as w:audio_seconds=w.getnframes()/w.getframerate()
 speed=max(1,audio_seconds/(dur-.8));assert speed<1.8,(i,speed)
 target=ASSET/f'final-{i:02}.mp4'
 cmd=[FF,'-hide_banner','-loglevel','error','-y','-ss',str(seek),'-i',str(src),'-i',str(wav),'-loop','1','-i',str(ASSET/'footer.png'),'-filter_complex',f'[0:v]fps=15,scale=1920:1080,setsar=1[v];[v][2:v]overlay=0:0,format=yuv420p[vo];[1:a]atempo={speed:.5f},apad,atrim=duration={dur}[ao]','-map','[vo]','-map','[ao]','-t',str(dur),'-c:v','libx264','-preset','ultrafast','-crf','21','-threads','2','-c:a','aac','-b:a','128k','-ar','48000','-ac','2',str(target)]
 subprocess.run(cmd,check=True);segments.append(target);s['finalSource']='actual-history-viewer-recording' if 8<=i<=12 else 'existing-real-evidence';s['narrationSeconds']=round(audio_seconds,2);s['voiceSpeed']=round(speed,3);print('final segment',i,flush=True)
concat=ASSET/'concat.txt';concat.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in segments),encoding='utf8')
video=OUT/'行程有解-演示视频-交付版.mp4'
subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(video)],check=True)
subprocess.run([FF,'-hide_banner','-loglevel','error','-i',str(video),'-f','null','-'],check=True)
for t in [5,60,100,180,210,240,270,295,330,365,390]:subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1',str(OUT/f'final-frame-{t}.png')],check=True)

# Rebuild the prose from actual reviewed source, not an invented architecture.
tree=ast.parse((ROOT/'scripts/build_final_materials.py').read_text(encoding='utf8'))
sections=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='sections' for t in n.targets))
pdfmetrics.registerFont(TTFont('CN','C:/Windows/Fonts/simhei.ttf'))
body=ParagraphStyle('b',fontName='CN',fontSize=11.5,leading=20,spaceAfter=11,wordWrap='CJK',textColor=colors.HexColor('#233746'));head=ParagraphStyle('h',parent=body,fontSize=23,leading=31,spaceAfter=18);sub=ParagraphStyle('s',parent=body,fontSize=14,leading=23,spaceBefore=10)
def p(s,style=body):return Paragraph(s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('\n','<br/>'),style)
story=[p('行程有解',head),p('多 Agent 协同的个性化旅行规划与动态重排看板',sub),Spacer(1,20),p('技术文档 · 交付版'),p('产品版本：'+VERSION),p('材料日期：2026-10-29'),p('真实四角色交接、地图道路、程序约束与锁定重排。当前4公里候选仍有风险，系统禁止采用；本文不把数据取得等同行程可行。'),p('独立复现候选与最终产品版本分别列明。材料使用历史证据，不冒充本轮接口调用或原开发时刻录像。'),p('许可文件与官方提交入口的核对状态见同目录交付清单。')]
for title,rows in sections:
 story.extend([PageBreak(),p(title,head)])
 for label,text in rows:
  text=text.replace('07回交漏引用','09回交漏引用').replace('完整会话脱敏副本还需人工复核；既有短WebM不是最终5—8分钟MP4。','完整会话已制作逐事件脱敏副本并附复核范围；6分40秒交付MP4含135秒实际记录导航录屏，原文与地图附件私有保存。').replace('另生成含真实地图原图的学习展示版','另附含真实地图原图的交付版本').replace('技术文档 · 审核版','技术文档 · 交付版')
  story.extend([p(label,sub),p(text)])
class Architecture(Flowable):
 def __init__(self):Flowable.__init__(self);self.width=495;self.height=330
 def draw(self):
  c=self.canv;c.setFont('CN',11)
  boxes=[(0,248,225,58,'主工作台：需求 / 版本 / 核查'),(270,248,225,58,'独立来源地图：必要点线与定位'),(0,140,495,65,'Node服务：合同校验 / 四角色编排 / 预算步行时间核算'),(0,22,225,62,'受控上游：DeepSeek / 高德道路'),(270,22,225,62,'私有账本、原文与自有结构状态')]
  for x,y,w,h,t in boxes:c.setStrokeColor(colors.HexColor('#7f9ea9'));c.setFillColor(colors.HexColor('#eef4f6'));c.roundRect(x,y,w,h,7,fill=1);c.setFillColor(colors.HexColor('#173247'));c.drawCentredString(x+w/2,y+h/2,t)
  for x1,y1,x2,y2 in [(225,277,270,277),(112,248,112,205),(382,248,382,205),(112,140,112,84),(382,140,382,84)]:c.line(x1,y1,x2,y2)
story.extend([PageBreak(),p('10 架构与人工控制点',head),Architecture(),p('工作台与地图消息检查origin、window source、runId、序号及数据结构；地图消息不能绕过服务端授权。模型只提出受控候选，程序校验在各角色之间独立执行。'),p('用户在地图确认测试落点、选择午餐与锁定时刻；预览是否采用由用户决定。上游失败、超时、需求变更和轮次耗尽均有明确终止，刷新不重新发起业务请求。')])
run=json.loads((ROOT/'docs/private/task09-main-verified-replan.json').read_text(encoding='utf8'))
story.extend([PageBreak(),p('11 实际交接与版本证据',head),p('真实运行：'+run['id']),p('以下为实际运行的外部结构化字段节选，省略项仅为篇幅，不是完整Prompt替代。四节点分别请求，引用对应上游产出。')])
for n in run['nodes'][:4]:
 output=n.get('output',{});ref=output.get('coordinationRef') or output.get('screenRef') or output.get('planningRef') or n.get('ref','')
 story.extend([p(n['role']+' · '+n['status'],sub),p('上游/产出引用：'+ref),p('字段：'+', '.join(output.keys()))])
story.append(p('完整输入、输出、原始响应、调用和失败另见私有运行日志及脱敏开发轨迹。角色日志与AI辅助开发聊天不是同一种证据。'))
def page(c,d):c.setFont('CN',8);c.setFillColor(colors.HexColor('#526477'));c.drawString(45,30,'行程有解 | 技术文档 | 产品 '+VERSION[:7]);c.drawRightString(550,30,str(d.page))
tmp=OUT/'技术正文.pdf';SimpleDocTemplate(str(tmp),pagesize=(595.276,841.89),leftMargin=48,rightMargin=48,topMargin=48,bottomMargin=58,title='行程有解：技术文档',author='行程有解项目').build(story,onFirstPage=page,onLaterPages=page)
doc=pymupdf.open(tmp)
for label,name in [('第2天原方案','task09-main-verified-original-day2.png'),('第2天未采用重排预览','task09-main-verified-preview-day2.png')]:
 q=doc.new_page(width=841.89,height=595.28);q.insert_text((32,30),label,fontsize=18,fontname='china-s');q.insert_image(pymupdf.Rect(32,46,810,533),filename=str(ROOT/'docs/private'/name),keep_proportion=True);q.insert_text((32,556),'真实验收历史截图，保留高德出处。测试落点非官方入口，4公里上界仍未满足，预览禁止采用。',fontname='china-s',fontsize=10)
pdf=OUT/'行程有解-技术文档-交付版.pdf';doc.save(pdf,garbage=4,deflate=True);assert len(doc)<=30
renders=OUT/'pdf-pages';renders.mkdir(exist_ok=True)
for i,q in enumerate(doc):q.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(renders/f'page-{i+1:02}.png')
report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productRevision':VERSION,'video':video.name,'durationSeconds':400,'resolution':[1920,1080],'fps':15,'audio':'AAC 48kHz双声道，本机Microsoft Huihui系统语音；非真人录音，无音乐','fullDecodePassed':True,'developmentEvidenceSeconds':135,'developmentEvidence':'连续浏览器导航/滚动真实开发记录与Git差异，原始事件和来源另列；不是原开发时刻录像，不重新调用模型','videoSHA256':hashlib.sha256(video.read_bytes()).hexdigest(),'pdf':pdf.name,'pdfPages':len(doc),'pdfTextCharacters':[len(q.get_text()) for q in doc],'pdfSHA256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'publication':'仅本地交付，未提交赛事/上传地图或原始对话；许可文件仍待定位核对'}
(OUT/'最终成品检查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');(OUT/'最终视频时间轴.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False),flush=True)
