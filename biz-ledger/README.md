# 记账报税助手

中国大陆小微企业记账与增值税/企业所得税测算工具。纯静态页面，没有构建步骤，
没有依赖，没有后端。

- **在线使用**：[echo844883.github.io/skills/biz-ledger/](https://echo844883.github.io/skills/biz-ledger/)
- **本地使用**：下载这个目录，双击 `index.html`

数据保存在浏览器的 `localStorage` 里，跟着「设备 + 浏览器」走，不会上传到
任何地方——换设备或清缓存前，记得用页面顶部的「导出 CSV」备份。

## 这不是官方报税系统

这是记账 + 税额测算工具，帮你按增值税、企业所得税、附加税的规则算出应纳税额，
不对接电子税务局、不自动申报。所有税率、起征点、扣除比例都是页面里可编辑的
示例值，不代表当前有效政策——请核实最新政策后修改。正式申报请交给会计，或者
自己去电子税务局核对后申报。完整说明见 [`apps/biz-ledger/README.md`](../apps/biz-ledger/README.md)。

## 这份代码和源码的关系

这个目录是从仓库的 [`apps/biz-ledger/`](../apps/biz-ledger/) 复制出来、专门给
GitHub Pages 用的部署版（`index.html`/`styles.css`/`js/core.js`/`js/storage.js`/
`js/app.js`，跟本地直接打开用的是同一份代码）。改功能请去 `apps/biz-ledger/`
改，改完重新复制这五个文件过来即可；`apps/biz-ledger/` 里多出的 `hosted.html`
（连 Claude Artifact 云同步的版本）和它的测试不需要带到这里。

## 许可

MIT，与本仓库一致。
