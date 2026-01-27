// app.config.js — FULL REPLACEMENT (build-fix + crash-safe)
import "dotenv/config";

export default ({ config }) => {
  const rawBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const rawKey = process.env.EXPO_PUBLIC_SETUP_KEY;

  const safeBase = typeof rawBase === "string" ? rawBase.trim() : "";
  const safeKey = typeof rawKey === "string" ? rawKey.trim() : "";

  return {
    ...config,

    // ✅ REQUIRED by Reanimated in your setup
    newArchEnabled: false,

    // ✅ Keep this for stability testing (can revert to hermes later)
    jsEngine: "jsc",

    name: "Ideas4Seasons",
    slug: "ideas4seasons",
    scheme: "ideas4seasons",
    icon: "./assets/images/icon.png",

    plugins: [
      "expo-router",
      "expo-barcode-scanner",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: { backgroundColor: "#000000" },
        },
      ],
      // TEMP: leave sqlite plugin out until app launches stable
      // "expo-sqlite",
    ],

    ios: {
      ...(config.ios || {}),
      bundleIdentifier: "com.ideas4seasons.sales",
      buildNumber: config?.ios?.buildNumber ?? "1",
      supportsTablet: true,
      infoPlist: {
        ...(config?.ios?.infoPlist || {}),
        NSCameraUsageDescription:
          "We gebruiken de camera om barcodes te scannen tijdens het maken van orders.",
      },
    },

    android: {
      ...(config.android || {}),
      package: "com.ideas4seasons.sales",
      versionCode: config?.android?.versionCode ?? 1,
    },

    extra: {
      ...(config.extra || {}),
      EXPO_PUBLIC_API_BASE_URL: safeBase,
      EXPO_PUBLIC_SETUP_KEY: safeKey,
    },
  };
};
