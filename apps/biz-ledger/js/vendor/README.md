# vendor/

第三方库，随应用一起打包，运行时不发起任何外部网络请求。

## pdf.bundle.js / pdf-worker-src.js

来自 [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist)（Mozilla PDF.js，Apache-2.0，
见 `PDFJS-LICENSE`），用于「导入发票 PDF」功能里提取 PDF 文字。

pdfjs-dist v4 只发布 ES module 格式，而这个应用全是经典 `<script>`，且要在
`file://` 下双击打开也能用——ES module 在 `file://` 下无法用 `fetch()` 加载，
所以用 [esbuild](https://esbuild.github.io/) 转成经典脚本：

```bash
npm install pdfjs-dist@4 esbuild --no-save

# 主库：打包成经典 IIFE，挂到 window.pdfjsLib
npx esbuild node_modules/pdfjs-dist/build/pdf.min.mjs \
  --bundle --format=iife --global-name=pdfjsLib --outfile=pdf.bundle.js

# worker：pdf.js 在拿不到真正的 Worker 时会退化成「假 worker」（主线程内跑），
# 这条路径内部用 import() 加载 worker 模块，所以 worker 必须保留 ESM 格式导出
# WorkerMessageHandler，不能也打包成 IIFE。
npx esbuild node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
  --bundle --format=esm --outfile=pdf.worker.esm.js

# 再包一层：把 worker 源码整个当字符串塞进一个变量。
# 这么做是因为 file:// 下没法用 fetch() 去读取 worker 文件的内容再拼 Blob URL
# （fetch 本地文件会被 CORS 挡住），只有 <script src> 标签能在 file:// 下正常加载。
# 所以让这个文件『被加载执行』这件事本身，就是把字符串赋值给一个全局变量，
# 运行时再用这个字符串 new Blob(...) 拼出 Blob URL 交给 Worker/import()。
node -e "
  const fs = require('fs');
  const src = fs.readFileSync('pdf.worker.esm.js', 'utf8');
  fs.writeFileSync('pdf-worker-src.js', 'window.__PDF_WORKER_SRC__ = ' + JSON.stringify(src) + ';');
"
```

两个文件都是**懒加载**的：`app.js` 只在用户第一次点「导入发票 (PDF)」时才动态
插入 `<script>` 标签把它们加载进来，平时打开页面不会多下载这近 2.5MB。

升级版本时重新跑一遍上面的命令，用新版 `pdfjs-dist` 生成的文件整个替换掉。
