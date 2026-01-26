import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { theme } from "../shared/theme";

export default function DashboardHeader({
  agentId,
}: {
  agentId: string | null;
}) {
  const router = useRouter();

  function handleLogout() {
    // later: token verwijderen (SecureStore)
    router.replace("/login");
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.header,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Ideas4Seasons
        </Text>
        {agentId ? (
          <Text style={{ color: "white", opacity: 0.8, marginTop: 2 }}>
            Agent: {agentId}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={handleLogout}
        style={{
          backgroundColor: "rgba(255,255,255,0.12)",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Logout</Text>
      </Pressable>
    </View>
  );
}
