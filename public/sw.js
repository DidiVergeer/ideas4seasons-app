// public/sw.js
const CACHE = "i4s-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "/", // start url
        "/index.html",
        "/manifest.json",
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first voor navigations (zodat online altijd wint, offline fallback naar cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Alleen GET
  if (req.method !== "GET") return;

  // Navigations: probeer netwerk, fallback cache
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached)
      );
    })
  );
});
