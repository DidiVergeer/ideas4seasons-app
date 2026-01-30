// workbox-config.cjs
module.exports = {
  globDirectory: "dist",
  globPatterns: [
    "**/*.{html,js,css,json,png,jpg,jpeg,svg,gif,ico,webp,txt,woff,woff2,map}",
  ],
  swDest: "dist/sw.js",

  // SPA fallback
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [
    /^\/_expo\//,
    /^\/api\//,
    /^\/assets\//,
  ],

  // iOS vriendelijk: snel iets uit cache tonen
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: ({ request }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "worker",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "assets",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
};
