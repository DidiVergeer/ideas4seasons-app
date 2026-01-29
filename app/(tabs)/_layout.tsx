import { Tabs } from "expo-router";
import React from "react";

import { CartProvider } from "@/components/cart/CartProvider";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <CartProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
          headerShown: false,
          tabBarButton: HapticTab,
        }}
      >
        {/* jouw screens 그대로 */}
        <Tabs.Screen name="products" options={{ title: "Products", tabBarIcon: ({ color }) => <IconSymbol size={28} name="square.grid.2x2.fill" color={color} /> }} />
        <Tabs.Screen name="scanner"  options={{ title: "Scanner",  tabBarIcon: ({ color }) => <IconSymbol size={28} name="barcode.viewfinder" color={color} /> }} />
        <Tabs.Screen name="cart"     options={{ title: "Cart",     tabBarIcon: ({ color }) => <IconSymbol size={28} name="cart.fill" color={color} /> }} />
        <Tabs.Screen name="customers" options={{ title: "Customers", tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} /> }} />

        {/* verberg template routes */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="home" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="product" options={{ href: null }} />
        <Tabs.Screen name="customers.disabled" options={{ href: null }} />
        <Tabs.Screen name="_customers.disabled" options={{ href: null }} />
        <Tabs.Screen name="debug" options={{ href: null }} />
      </Tabs>
    </CartProvider>
  );
}
