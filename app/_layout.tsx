// app/_layout.tsx — SAFE BOOT (PWA/iOS-proof + iOS homescreen icon)

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

export default function RootLayout() {
  const colorScheme = useColorScheme();

    useEffect(() => {
    if (Platform.OS !== "web") return;

    try {
      const s = document.createElement("script");
      s.src = "/register-sw.js";
      s.async = true;
      document.body.appendChild(s);
    } catch {
      // noop
    }
  }, []);
  return (
    <>
      {/* ✅ iOS gebruikt vaak apple-touch-icon i.p.v. manifest icon */}
      <Head>
        <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png" />
        {/* Optioneel: voorkomt iOS auto-detect van telefoonnummers */}
        <meta name="format-detection" content="telephone=no" />
         <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
         <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon.png" />
      </Head>

      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </>
  );
}
