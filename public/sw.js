// public/sw.js
const CACHE = "i4s-shell-v3";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// install: app shell cachen
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// activate: oude caches opruimen
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("i4s-shell-") && k !== CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  // 🚨 BELANGRIJKSTE REGEL:
  // elke navigation → index.html (ook offline)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Expo static assets → cache-first
  if (req.url.includes("/_expo/static/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return (
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
            return res;
          })
        );
      })
    );
    return;
  }

  // overige requests
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
