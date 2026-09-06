/* LOGITEC CORE WMS · service worker mínimo · shell PWA solamente */
const SHELL_CACHE = "logitec-demo-shell-v16.2.7";
const SHELL_ASSETS = [
  "/logitec-role-demo.html",
  "/logitec-role-demo.css",
  "/logitec-role-demo.js",
  "/manifest.webmanifest",
  "/icons/logitec-wms-192.png",
  "/icons/logitec-wms-512.png",
  "/icons/logitec-wms-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/login")) return;
  if (!SHELL_ASSETS.includes(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
