// app/_layout.tsx — SAFE BOOT (PWA/iOS-proof)

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* ✅ Safe boot landing (altijd super licht) */}
        <Stack.Screen name="index" />

        {/* ✅ Login buiten tabs */}
        <Stack.Screen name="login" />

        {/* ✅ De rest van de app */}
        <Stack.Screen name="(tabs)" />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
