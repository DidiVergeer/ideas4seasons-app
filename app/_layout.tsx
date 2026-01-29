// app/_layout.tsx — DEBUG SAFE BOOT (CartProvider AAN)

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Alert } from "react-native";
import "react-native-reanimated";

import { CartProvider } from "@/components/cart/CartProvider";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

// ✅ Zorg dat splash nooit kan blijven hangen
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // ✅ Bewijs dat JS draait
    Alert.alert("DEBUG", "App JS is gestart");

    // ✅ Splash altijd weg
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <CartProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="auto" />
      </CartProvider>
    </ThemeProvider>
  );
}
