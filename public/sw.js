// public/sw.js
const CACHE = "i4s-shell-v2";

// bestanden die we sowieso willen hebben voor "app opent altijd"
const CORE_ASSETS = [
  "/", // start url
  "/index.html",
  "/manifest.json",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // opruimen oude caches
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

// Network-first voor navigations (zodat online altijd wint, offline fallback)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Alleen GET
  if (req.method !== "GET") return;

  // Navigations: probeer netwerk, fallback naar offline.html (nooit dino/zwart)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Assets + overige GET: cache-first met runtime caching
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // alleen succesvolle responses cachen
          if (!res || res.status !== 200) return res;

          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
