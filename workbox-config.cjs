module.exports = {
  globDirectory: "dist",
  globPatterns: [
    "**/*.{html,js,css,json,png,jpg,jpeg,svg,webp,ico,txt,woff,woff2}"
  ],
  swDest: "dist/sw.js",

  // Zorgt dat deep links (Expo Router) offline blijven werken
  navigateFallback: "/index.html",

  // Expo web bundles kunnen groot zijn
  maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,

  skipWaiting: true,
  clientsClaim: true,
};
