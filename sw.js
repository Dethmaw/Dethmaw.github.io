// Service worker: cache the app shell so the app installs and opens offline.
// Strategy: NETWORK-FIRST for GET — always use fresh code when online (updating the cache),
// fall back to cache only when offline. Cache-first was serving stale JS after code changes,
// so a bug fix in the source would not reach the running app until the cache was cleared.
const CACHE = "wa-stats-v10";
const ASSETS = [
  "./", "./index.html", "./privacy.html", "./guide.html", "./faq.html", "./styles.css", "./wrapped.css",
  "./app.js", "./parse.js", "./stats.js", "./render.js", "./share.js", "./history.js", "./wrapped.js",
  "./html2canvas.min.js", "./manifest.json", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
