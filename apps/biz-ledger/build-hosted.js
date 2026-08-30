/**
 * 把多文件的本地版组装成一个自包含的 HTML，用于发布成链接。
 *
 * 业务逻辑（core.js）和界面逻辑（app.js）两版共用，这里只换掉存储层：
 * storage.js -> hosted-store.js。所以修 bug 只需要改一处。
 *
 *   node build-hosted.js
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

const html = read('index.html');
const start = html.indexOf('<!-- shell:start -->');
const end = html.indexOf('<!-- shell:end -->');
if (start === -1 || end === -1) throw new Error('index.html 里找不到 shell 标记');
const shell = html.slice(start + '<!-- shell:start -->'.length, end).trim();

const css = read('styles.css');
const core = read('js/core.js');
const store = read('js/hosted-store.js');
const app = read('js/app.js');
const pdfLib = read('js/vendor/pdf.bundle.js');
const pdfWorker = read('js/vendor/pdf-worker-src.js');

for (const [name, text] of [
  ['core.js', core], ['hosted-store.js', store], ['app.js', app],
  ['vendor/pdf.bundle.js', pdfLib], ['vendor/pdf-worker-src.js', pdfWorker]
]) {
  if (/<\/script/i.test(text)) throw new Error(`${name} 里有字面量 </script，会截断文档`);
}
if (/<\/style/i.test(css)) throw new Error('styles.css 里有字面量 </style');
if (/<script|<\/script/i.test(shell)) throw new Error('shell 区间里不该有 script 标签');

const boot = `
/* ---- 启动顺序 ---- */
(function () {
  'use strict';
  var tpl = document.getElementById('app-shell');
  var root = document.getElementById('app');
  if (tpl && root && !root.firstChild) root.appendChild(tpl.content.cloneNode(true));
})();
`;

const after = `
/* ---- 接上云端，并把重载前正在填的内容放回去 ---- */
(function () {
  'use strict';
  if (!window.LedgerHosted) return;
  window.LedgerHosted.connect();
  window.LedgerHosted.restoreDraft();
})();
`;

const script = [core, store, boot, app, after].join('\n');

const out = `<title>记账报税助手</title>
<style id="app-css">
${css}
</style>

<template id="app-shell">
${shell}
</template>

<div id="app"></div>

<script type="application/json" id="app-data">{"version":1,"records":[],"settings":null}</script>

<!--
  导入发票用的 pdf.js。这里是单文件的托管版，没有旁边的 js/vendor/ 目录可以
  <script src> 引用，只能把内容整段塞进这个文档里——这将近 2.5MB 跟着文档
  一起下载，省不掉。但 type="text/plain" 让浏览器只把它当普通文本存着，不会
  当 JS 解析执行；只有用户第一次点「导入发票 (PDF)」时，app.js 的
  ensurePdfJs() 才会把内容取出来真正执行，平时打开链接不用付这个解析/执行
  的代价（本地版/Pages 版用的是独立文件，那边是真的懒加载，连下载都省了）。
-->
<script type="text/plain" id="pdf-lib-src-data">${pdfLib}</script>
<script type="text/plain" id="pdf-worker-src-data">${pdfWorker}</script>

<script id="app-js">
${script}
</script>
`;

const target = path.join(dir, 'hosted.html');
fs.writeFileSync(target, out, 'utf8');
console.log(`已生成 ${path.relative(process.cwd(), target)}  ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`);
