# 旅行策划台设计预览

仅独立视觉预览，等待用户确认；不替换正式页面、不提供完整业务功能。

在项目根目录运行：

```powershell
node preview/planning-desk/server.mjs
```

打开http://127.0.0.1:4175/preview/planning-desk/ 。终端Ctrl+C停止。端口4173/4174的正式需求入口和离线测试服务不需要重启。

“需求编辑”可在本页内改日期、时段、原话、预算与逐日步行；这些编辑只在内存。“固定离线样例”展示独立的太原三人两天样例，切日可看安排与当天核查；不响应你的编辑，也不调用接口。切回编辑仍可找到本页修改。“还原预览内容”重置本页示例及展开/滚动状态，不动正式存档。

手机通过需求清单、每日安排、核查信息切换区域。所有页面标为设计预览，结果标为固定离线样例，到离时间、交通、预约与餐饮缺口明确。没有真实生成、保存、恢复、分享或导出按钮；这些正式功能保持在原应用，确认视觉后再集成并回归。

复核命令（需本机已提供的Playwright及Edge，非应用依赖）：

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node tests/ui-desk-preview.mjs
```

脚本自动启动临时预览服务，使用独立浏览器上下文，写入ui-desk-preview前缀证据。详见docs/旅行策划台-预览实施记录.md。
