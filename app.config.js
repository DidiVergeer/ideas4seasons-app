// app.config.js — FULL REPLACEMENT (build-fix + crash-safe)
import "dotenv/config";

export default ({ config }) => {
  const rawBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const rawKey = process.env.EXPO_PUBLIC_SETUP_KEY;

  const safeBase = typeof rawBase === "string" ? rawBase.trim() : "";
  const safeKey = typeof rawKey === "string" ? rawKey.trim() : "";

  return {
    ...config,

    // ✅ New Architecture AAN (nodig voor react-native-reanimated)
    newArchEnabled: true,

    // ✅ stabiel met expo-camera
    jsEngine: "jsc",

    name: "Ideas4Seasons",
    slug: "ideas4seasons",
    scheme: "ideas4seasons",
    icon: "./assets/images/icon.png",

    plugins: [
      "expo-router",
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
    ],

    ios: {
      ...(config.ios || {}),
      bundleIdentifier: "com.ideas4seasons.sales",

      // ❗️BUILD NUMBER OMHOOG (verplicht)
      buildNumber: "22",

      supportsTablet: true,

      // ✅ DIT IS DE CRUCIALE FIX
      infoPlist: {
        ...(config?.ios?.infoPlist || {}),
        NSCameraUsageDescription:
          "We gebruiken de camera om barcodes te scannen tijdens het maken van orders.",
      },
    },

    android: {
      ...(config.android || {}),
      package: "com.ideas4seasons.sales",
      versionCode: (config?.android?.versionCode ?? 1) + 1,
    },

        web: {
      ...(config.web || {}),
      name: "Ideas4Seasons",
      shortName: "I4S",
      display: "standalone",
      backgroundColor: "#ffffff",
      themeColor: "#ffffff",
      startUrl: "/",
      scope: "/",
      icon: "./assets/images/pwa-icon-512.png",
    },


    extra: {
      ...(config.extra || {}),

      // ✅ REQUIRED so EAS can link the project
      eas: {
        projectId: "18f45090-9b30-4290-b208-c02d1b974b29",
      },

      // public envs
      EXPO_PUBLIC_API_BASE_URL: safeBase,
      EXPO_PUBLIC_SETUP_KEY: safeKey,
    },
  };
};
