import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, usePathname, type Href } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

const COLORS = {
  header: "#60715f",
  button: "#85c14c",
  footer: "#839384",
  text: "#3a3939",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#FFFFFF",
};

const NAV: Array<{
  href: Href;
  label: string;
  icon: "grid" | "scan" | "users" | "cart" | "settings";
}> = [
  { href: "/(tabs)/products", label: "Producten", icon: "grid" },
  { href: "/(tabs)/scanner", label: "Scanner", icon: "scan" },
  { href: "/(tabs)/customers", label: "Klanten", icon: "users" },
  { href: "/(tabs)/cart", label: "Winkelwagen", icon: "cart" },
  { href: "/(tabs)/settings", label: "Instellingen", icon: "settings" },
];

function normalize(path: string) {
  // Zorgt dat "/(tabs)/cart" en "/cart" gelijk behandeld worden
  return path.replace("/(tabs)", "");
}

function isActivePath(pathname: string, href: Href) {
  const target = normalize(String(href));

  // pathname kan soms "/(tabs)/cart" zijn, soms "/cart"
  const p1 = pathname;
  const p2 = normalize(pathname);

  return p1 === String(href) || p2 === target || p2.startsWith(target + "/"); // subroutes
}

function Icon({
  name,
  active,
}: {
  name: (typeof NAV)[number]["icon"];
  active: boolean;
}) {
  const color = active ? COLORS.header : COLORS.muted;

  switch (name) {
    case "grid":
      return <Feather name="grid" size={20} color={color} />;
    case "scan":
      return (
        <MaterialCommunityIcons name="barcode-scan" size={22} color={color} />
      );
    case "users":
      return <Feather name="users" size={20} color={color} />;
    case "cart":
      return <Feather name="shopping-cart" size={20} color={color} />;
    case "settings":
      return <Feather name="settings" size={20} color={color} />;
  }
}

export default function BottomNav() {
  const pathname = usePathname();

  // geen nav op login
  if (pathname === "/login" || pathname.endsWith("/login")) return null;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.bg,
        paddingTop: 10,
        paddingHorizontal: 8,
        paddingBottom: 14, // extra ruimte (web/native)
        zIndex: 999,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {NAV.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <Link key={String(item.href)} href={item.href} asChild>
              <Pressable
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 6,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: active ? "#E9EFE8" : "#F3F4F6",
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? COLORS.button : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 6,
                  }}
                >
                  <Icon name={item.icon} active={active} />
                </View>

                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: active ? "800" : "600",
                    color: active ? COLORS.header : COLORS.muted,
                  }}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}
