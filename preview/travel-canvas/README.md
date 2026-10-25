# 沉浸式旅行画布动态预览

在项目根目录执行：

```powershell
node preview/travel-canvas/server.mjs
```

打开http://127.0.0.1:4176/preview/travel-canvas/ 。Ctrl+C停止。本预览与4173/4174正式服务及4175旧设计预览独立，旧文件和存档不变。

可体验四种状态：

1. 需求概览：原创山形、城市剪影与票签，一次分层进入；选择同行者查看其需求。
2. 个人编辑：点编辑或编辑旅行条件展开面板。输入节点不重建。应用并关闭先做现有规则检查；关闭面板或Esc保留本页编辑并还原焦点。错误显示在面板及对应字段，允许继续修正。
3. 需求摘要：点检查需求，复用正式core纯函数校验；有效时过渡到摘要，无效时打开错误字段。通过仅表示输入结构与格式，不是行程可行。
4. 固定离线活动：独立三人两天样例，可切日；不根据本页编辑重新生成，所有到离时间、道路及其他缺口保持未知。

“暂存本页”只复制当前有效需求到本次预览的内存快照，反馈刷新/关闭后清空；不调用浏览器存储，没有正式保存或恢复能力。不接入模型/地图，不读取.env。缩小到手机后使用底部操作与底部编辑面板，关闭入口始终可达。

全部动效有有限时长，首次分层只播放一次，后续过渡由操作触发。尊重prefers-reduced-motion。图形是本轮原创SVG/CSS艺术意象，非实景、地图或道路；无第三方图片、外部字体或应用依赖。

验证与录屏（使用本机已提供的Playwright/Edge工具环境）：

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node tests/ui-canvas-preview.mjs
node tests/ui-canvas-record.mjs
node tests/ui-canvas-video-check.mjs
```

三个脚本各自启动本机服务或解码已有视频，不访问外网或用户正式存档。截图/report使用ui-canvas前缀；录屏为实际浏览器视口自动化操作，无声音/鼠标指针，CDP采集真实画面后由浏览器MediaRecorder编码，不生成应用画面来冒充录屏。
