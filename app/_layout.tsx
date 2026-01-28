// app/_layout.tsx — FULL REPLACEMENT

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import * as Sentry from "@sentry/react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";

// ✅ BELANGRIJK: import direct uit CartProvider file (niet via index.ts)
import { CartProvider } from "@/components/cart/CartProvider";

export const unstable_settings = {
  anchor: "(tabs)",
};

// ✅ Init Sentry 1x bij app start
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableAutoSessionTracking: true,
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <CartProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="auto" />
      </CartProvider>
    </ThemeProvider>
  );
}
