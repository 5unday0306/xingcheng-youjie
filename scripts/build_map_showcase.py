"""Assemble a local map-inclusive PDF and subtitled evidence review video."""
from pathlib import Path
import sys,json,subprocess,hashlib,re
from PIL import Image,ImageDraw,ImageFont
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'docs/private/material-runtime'))
import imageio_ffmpeg
FF=imageio_ffmpeg.get_ffmpeg_exe()
PVT=ROOT/'docs/private/final-materials-review'; PVT.mkdir(exist_ok=True)
ASSETS=PVT/'video-assets'; ASSETS.mkdir(exist_ok=True)
PUB=ROOT/'docs/materials/final-review'
VERSION='b0f63effc748bd2c0cac5acfcc42ff02fa7072c7'
MAPS=[('第2天原方案 · 实际道路与锁定午餐','task09-main-verified-original-day2.png'),('第2天重排预览 · 尚未采用','task09-main-verified-preview-day2.png')]
base=pymupdf.open(PUB/'行程有解-技术文档-审核版.pdf')
for title,name in MAPS:
    p=base.new_page(width=841.89,height=595.28)
    p.insert_text((35,32),title,fontsize=17,fontname='china-s',color=(.09,.2,.28))
    p.insert_image(pymupdf.Rect(35,47,806,529),filename=str(ROOT/'docs/private'/name),keep_proportion=True)
    p.insert_text((35,549),'真实历史验收截图，保留地图出处。测试落点非官方入口；4公里上界未满足，预览禁止采用。',fontsize=10,fontname='china-s')
    p.insert_text((35,568),'产品版本 '+VERSION[:12]+' | 地图当前预测不保证旅行日通行 | 学习与展示审核版',fontsize=9,fontname='china-s')
target=PVT/'行程有解-技术文档-含真实地图.pdf'
base.save(target,garbage=4,deflate=True)
assert len(base)<=30
renders=PVT/'map-pdf-pages';renders.mkdir(exist_ok=True)
for i,p in enumerate(base):p.get_pixmap(matrix=pymupdf.Matrix(1,1)).save(renders/f'page-{i+1:02}.png')
thumbs=[]
for i in range(len(base)):
    im=Image.open(renders/f'page-{i+1:02}.png').convert('RGB');im.thumbnail((300,400))
    tile=Image.new('RGB',(320,430),'#e5edf2');tile.paste(im,((320-im.width)//2,15));ImageDraw.Draw(tile).text((15,413),str(i+1),fill='black');thumbs.append(tile)
sheet=Image.new('RGB',(1280,430*((len(thumbs)+3)//4)),'white')
for i,im in enumerate(thumbs):sheet.paste(im,((i%4)*320,(i//4)*430))
sheet.save(PVT/'PDF全页检查.png')

FONT='C:/Windows/Fonts/simhei.ttf'
def wrap(text,font,width):
    lines=[]
    for para in text.split('\n'):
        line=''
        for ch in para:
            if font.getlength(line+ch)>width and line:lines.append(line);line=ch
            else:line+=ch
        lines.append(line)
    return lines
def card(name,title,text,footer='行程有解 · 学习与展示审核版',size=34):
    im=Image.new('RGB',(1920,1080),'#f4f7fa');d=ImageDraw.Draw(im)
    d.rectangle((0,0,1920,15),fill='#b65c31')
    d.text((100,80),title,font=ImageFont.truetype(FONT,56),fill='#173247')
    f=ImageFont.truetype(FONT,size);y=200
    lines=wrap(text,f,1720)
    for l in lines:
        if y+size>975:break
        d.text((100,y),l,font=f,fill='#233746');y+=int(size*1.6)
    d.line((100,1004,1820,1004),fill='#ccd8df',width=2)
    d.text((100,1022),footer,font=ImageFont.truetype(FONT,23),fill='#526477')
    path=ASSETS/(name+'.png');im.save(path);return path

# Exact original record excerpts. The full ordered redacted candidate is kept separately.
events={}
with (PVT/'开发完整记录-脱敏候选.jsonl').open(encoding='utf8') as f:
    for n,l in enumerate(f,1):
        if n in (8455,8838,8895,9328):events[n]=json.loads(l)
def msg(n):
    p=events[n]['payload'];return '\n'.join(c.get('text','') for c in p.get('content',[]) if isinstance(c,dict) and c.get('text'))
task=msg(8455).split('## My request:\n')[-1].strip()
raw=str(events[8838]['payload'].get('output',''))
pos=raw.find('audit 9109')
failure=raw[pos:raw.find('PROMPT_LIMIT',pos)+len('PROMPT_LIMIT')]+" …\n[只节选错误码；该行其余内容含编码异常，原样保留于完整记录]"
diffraw=subprocess.run(['git','show','--format=','--no-ext-diff','d88669e','--','lib/agent-review.mjs'],cwd=ROOT,capture_output=True,encoding='utf8',errors='replace').stdout
added=[l for l in diffraw.splitlines() if l.startswith('+') and not l.startswith('+++')]
assert added
diff='实际提交 d88669e · lib/agent-review.mjs\n\n实际新增代码（原文）：\n\n'+added[0]+'\n\n修复解释：把输出必填键明确传给模型，强调上游引用不可省略。\n应用仍严格拒绝漏引用，不替模型补造screenRef或planningRef。'

shots=[]
def still(name,title,text,seconds,footer=None,size=34):
    p=card(name,title,text,footer or '产品版本 '+VERSION[:12]+' · 学习与展示审核版',size);shots.append({'kind':'image','path':str(p),'duration':seconds,'title':title})
still('01','行程有解', '多 Agent 协同的个性化旅行规划与动态重排看板\n\n太原三人两天真实案例\n地图、程序核查、真实角色交接、锁定与修订预览\n\n实际候选未满足4公里，系统拒绝采用。',15)
still('02','先说清楚每个人的条件','历史展览 / 风景拍照 / 美食与少走路\n每人全程600元；初始每天6公里；每日09:00—18:00\n\n变更：仅第2天改4公里\n锁定午餐：11月8日12:30—13:30，地点保持\n\n测试落点由用户确认，不是官方入口或预约保证。',20)
shots.append({'kind':'video','path':str(ROOT/'docs/private/task09-main-verified-operation.webm'),'start':35,'duration':40,'title':'真实验收录像节选 · 加载及地图操作（历史回放）'})
for name,title in [('task09-main-verified-original-day1.png','第1天原方案 · 真实道路'),('task09-main-verified-original-day2.png','第2天原方案 · 午餐锁定12:30—13:30'),('task09-main-verified-preview-day2.png','第2天重排预览 · 保留锁定，尚未采用')]:
    shots.append({'kind':'image','path':str(ROOT/'docs/private'/name),'duration':20 if 'day2' in name else 15,'title':title,'framed':True})
still('06','四个角色，分别执行与交接','需求协调：逐人条件、硬限制与历史冲突\n方案筛选：使用协调产出，提出受控候选\n行程规划：使用筛选引用，选择候选安排\n行程审查：实际接收规划与程序核算结果\n\n道路、步行、预算和锁定由程序检查。\n节点状态来自运行事件，不是演示动画。',20)
still('07','修订不是自动采用','任务07：第1天已计入步行约6.15～7.85公里\n修订预览约3.88～5.58公里；时间增加20分钟、费用估计增加1元\n\n任务08/09：午餐锁定保持，第2天4公里上界仍未满足\n程序禁止采用，原方案保留，新的4公里条件不撤回\n\n未知项保留；不宣称全局无解或旅行可行。',20)
still('08','真实AI开发过程回看 1/5 · 用户任务',task,27,'原始会话8c63 · 事件行8455 · 原文节选；非现场新调用',30)
still('09','真实AI开发过程回看 2/5 · 保护触发','原始工具输出节选：\n\n'+failure+'\n\n解释：审查输入达到9109字节，触发发送前体积保护。\n这属于输入合同失败，不是旅行条件无解。\n失败与后续修复保留在同一完整开发会话中。',27,'原始会话8c63 · 事件行8838 · 解释文字与原始输出分开',32)
still('10','真实AI开发过程回看 3/5 · 另一处合同修复','以下是另一项独立错误的修复，不是9109字节错误的根因：\n\n'+msg(8895),27,'原始会话8c63 · 事件行8895 · 助手原文；不是新增回答',34)
still('11','真实AI开发过程回看 4/5 · 实际Git差异',diff,27,'实际提交d88669e · 保留必填交接引用；仅截取部分差异',26)
still('12','真实AI开发过程回看 5/5 · 重新验证',msg(9328)+'\n\n以上为原始助手记录。独立验收范围与耗时在下一节说明。',27,'原始会话8c63 · 事件行9328 · 回看不是重演失败',36)
shots.append({'kind':'video','path':str(ROOT/'docs/private/task09-ui-final-operation.webm'),'start':1,'duration':20,'title':'真实验收录像节选 · 同一结果回放，不重新规划'})
still('14','保存、恢复与导出','保存不等于接受修订；拒绝不撤销新的4公里条件。\n刷新与重启不自动调用模型、道路或SDK。\n重启恢复结构与锁定，实际道路需手动重新取得。\n\nHTML/JSON导出自有结构、估计和核查说明，\n不打包地图瓦片、原始道路或上游交通数值。',15)
still('15','复现：说明条件，再给出数字','独立目录真实流程：76.992秒（候选ded7b1f）\n无旧私有状态与旧浏览器存档\n9次模型、18次道路、1次SDK；刷新重启不自动增加调用\n\n使用已准备账号、Key及运行环境；不含注册、安装、\n权限办理与人工操作时间，不能理解为新手77秒上手。\n最终提示小修另经正式真实验证与回归。',20)
still('16','目前已完成与仍待核实','已完成：真实地图、完整交通链、角色交接、锁定重排、\n版本预览、禁止不合格采用、保存恢复、HTML/JSON导出。\n\n仍未知：未来开放预约、票价、等位、部分内部步行。\n未验证：真实手机、全部浏览器、外网部署、实际账单。\n不提供获奖、未来通行或所有方案均可行的保证。',20)
still('17','交付版本与使用方式','产品版本：'+VERSION+'\n\n正式工作台：http://127.0.0.1:4177/\n代码仓库：https://github.com/5unday0306/xingcheng-youjie\n\n按README准备账号与配置；密钥不发聊天、不进仓库。\n本视频含真实地图及真实开发记录回看，未新增业务调用。',20)

timeline=[];at=0
for i,s in enumerate(shots):
    s['index']=i;s['startAt']=at;at+=s['duration'];timeline.append(s)
(PVT/'视频时间轴.json').write_text(json.dumps({'duration':at,'developmentHistorySeconds':135,'productRevision':VERSION,'scope':'含真实地图和原始AI开发历史回看；无配音字幕审核版，未上传','segments':timeline},ensure_ascii=False,indent=2),encoding='utf8')
segments=[]
for i,s in enumerate(shots):
    out=ASSETS/f'segment-{i:02}.mp4'
    if out.exists() and out.stat().st_size>1000:segments.append(out);continue
    cmd=[FF,'-hide_banner','-loglevel','error','-y']
    if s['kind']=='video':cmd+=['-ss',str(s.get('start',0)),'-i',s['path']]
    elif s.get('framed'):cmd+=['-loop','1','-framerate','15','-i',s['path']]
    else:cmd+=['-loop','1','-framerate','15','-i',s['path']]
    if s['kind']=='video' or s.get('framed'):
        label=card(f'label-{i}',s['title'],'','真实历史验收材料 · 非本次重新生成 · 保留地图出处',size=30)
        # Build a 1080p frame with native screenshot/video proportions and readable attribution.
        frame=Image.open(label).convert('RGB');dr=ImageDraw.Draw(frame);dr.rectangle((0,150,1920,1005),fill='#edf2f5')
        overlay=ASSETS/f'overlay-{i}.png';frame.save(overlay)
        cmd+=['-loop','1','-framerate','15','-i',str(overlay),'-filter_complex','[0:v]fps=15,scale=1368:854:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1368:854:(ow-iw)/2:(oh-ih)/2:color=0xedf2f5[content];[1:v][content]overlay=276:150,format=yuv420p[v]','-map','[v]']
    else:cmd+=['-vf','fps=15,format=yuv420p']
    cmd+=['-t',str(s['duration']),'-an','-c:v','libx264','-preset','ultrafast','-crf','22','-r','15','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',str(out)]
    r=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',errors='replace')
    if r.returncode:raise RuntimeError(r.stderr[-1500:])
    segments.append(out);print('encoded',i,flush=True)
concat=ASSETS/'concat.txt';concat.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in segments),encoding='utf8')
video=PVT/'行程有解-真实地图与开发过程-字幕审核版.mp4'
subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(video)],check=True)
# Decode the entire file, not only its container metadata.
r=subprocess.run([FF,'-hide_banner','-v','error','-i',str(video),'-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace')
assert r.returncode==0,r.stderr[-1000:]
for t in [5,60,100,160,180,210,240,270,295,330,365]:
    subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1',str(PVT/f'video-check-{t}.png')],check=True)
audit={'video':str(video.relative_to(ROOT)),'durationSeconds':at,'resolution':[1920,1080],'fps':15,'developmentHistorySeconds':135,'audio':'无配音；含文字说明和真实记录回看','fullDecodePassed':True,'keyframesExtracted':11,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'mapPdfPages':len(base),'mapPdfSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'visualReview':'pending','publication':'未上传或提交；本地学习展示审核版本'}
(PVT/'材料编码校验.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'seconds':at,'video':str(video),'pdf':str(target)},ensure_ascii=False),flush=True)
