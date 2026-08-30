// Beacon 离线缓存。整个应用只有这一个 HTML 文件（图片已内嵌），
// 所以要缓存的东西很少：页面本身、manifest、图标。
//
// 修改 index.html 后，把下面的版本号加一，浏览器才会去换一份新的缓存，
// 不然装过的用户会一直吃旧版本。
const VERSION = "beacon-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 页面自身的导航请求和资源请求：缓存优先，后台悄悄去拿新版本更新缓存。
// 断网时 fetch 会失败，直接落回缓存，离线也能打开。
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 这个页面本来就不该有跨域请求

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
