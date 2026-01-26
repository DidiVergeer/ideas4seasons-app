// app/login.tsx — FULL REPLACEMENT
// ✅ Fix: agent correct opslaan + oude (globale) data wissen bij wisselen van agent
// ✅ Demo login blijft, maar doet nu óók opslag + reset bij agent switch
// ✅ Bewaart agent in: agent_profile_v1 (zoals app/api/agentAuth.ts)
// ✅ Zet ook "agentId" key (customers.ts gebruikt dit)
// ✅ Wist DE JUISTE keys: i4s_cart_v1 / i4s_saved_orders_v1 / i4s_sent_orders_v1

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://ideas4seasons-backend.onrender.com";

// --- Storage keys (moeten matchen met de rest van je app) ---
const STORAGE_PROFILE = "agent_profile_v1"; // ✅ primary (agentAuth.ts)
const STORAGE_AGENTID_LEGACY = "agentId"; // ✅ legacy/compat (customers.ts gebruikt dit)

// ✅ JOUW ECHTE keys (zoals in Settings + CartProvider)
const LS_CART = "i4s_cart_v1";
const LS_SAVED_ORDERS = "i4s_saved_orders_v1";
const LS_SENT_ORDERS = "i4s_sent_orders_v1";

// Optioneel: als je ooit selected customer opslaat, zet dan hier de echte key
// const LS_SELECTED_CUSTOMER = "i4s_selected_customer_v1";

async function clearGlobalAgentData() {
  await AsyncStorage.multiRemove([
    LS_CART,
    LS_SAVED_ORDERS,
    LS_SENT_ORDERS,
    // LS_SELECTED_CUSTOMER,
  ]);
}

async function setAgentSession(params: {
  agentId: string;
  language: string;
  email?: string | null;
}) {
  const cleanAgentId = String(params.agentId || "").trim();
  const cleanLang = String(params.language || "nl").trim() || "nl";

  // ✅ agent profile opslaan (primary)
  await AsyncStorage.setItem(
    STORAGE_PROFILE,
    JSON.stringify({
      agentId: cleanAgentId,
      language: cleanLang,
      email: params.email ?? null,
    })
  );

  // ✅ legacy key zetten zodat bestaande code (customers.ts) scoped kan werken
  await AsyncStorage.setItem(STORAGE_AGENTID_LEGACY, cleanAgentId);
}

export default function LoginScreen() {
  const router = useRouter();

  const [agentId, setAgentId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");

    const cleanAgentId = agentId.trim();
    const cleanPin = pin.trim();

    if (!cleanAgentId || !cleanPin) {
      setError("Vul Agent ID en PIN in.");
      return;
    }

    setLoading(true);
    try {
      console.log("API_BASE:", API_BASE);

      // ✅ check vorige agentId (zodat we alleen wissen bij switch)
      const prevAgentId =
        (await AsyncStorage.getItem(STORAGE_AGENTID_LEGACY))?.trim() ?? "";

      // ✅ DEMO login (tijdelijk om flow te testen)
      if (cleanAgentId === "A100" && cleanPin === "1234") {
  // als je van agent wisselt -> oude data weg
  if (prevAgentId && prevAgentId !== "") {
    await clearGlobalAgentData();
  }

  // ✅ Demo: NIET scopen -> dus legacy agentId leegmaken
  await AsyncStorage.removeItem("agentId");

  // wel profile opslaan (voor later), maar agentId is demo
  await AsyncStorage.setItem(
    "agent_profile_v1",
    JSON.stringify({ agentId: "A100", language: "nl", email: null })
  );

  router.replace("/(tabs)/products");
  return;
}

      // ✅ echte login
      const res = await fetch(`${API_BASE}/auth/agent-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ agentId: cleanAgentId, pin: cleanPin }),
      });

      console.log("login status:", res.status);

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? data?.message ?? "Inloggen mislukt.");
        return;
      }

      // verwacht: { ok:true, agent:{ agentId, email, language } }
      const loggedAgentId = String(data?.agent?.agentId ?? cleanAgentId).trim();
      const language = String(data?.agent?.language ?? "nl").trim() || "nl";
      const email = data?.agent?.email ?? null;

      // ✅ alleen wissen als agentId veranderd is
      if (prevAgentId && prevAgentId !== loggedAgentId) {
        await clearGlobalAgentData();
      }

      await setAgentSession({ agentId: loggedAgentId, language, email });

      router.replace("/(tabs)/products");
    } catch (e) {
      setError("Kan geen verbinding maken met de server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#f5f5f5",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 20,
          maxWidth: 420,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 14,
            color: "#2f3b2f",
          }}
        >
          Sales Agent Login
        </Text>

        <TextInput
          placeholder="Agent ID"
          value={agentId}
          onChangeText={setAgentId}
          autoCapitalize="none"
          style={{
            borderWidth: 1,
            borderColor: "#d6d6d6",
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          }}
        />

        <TextInput
          placeholder="PIN"
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: "#d6d6d6",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        />

        {error ? (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              padding: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#B91C1C" }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={{
            backgroundColor: "#7CB342",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color="white" />
              <Text style={{ color: "white", fontWeight: "700" }}>Bezig...</Text>
            </View>
          ) : (
            <Text style={{ color: "white", fontWeight: "700" }}>Login</Text>
          )}
        </Pressable>

        <Text style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Demo login: Agent ID A100 • PIN 1234
        </Text>
      </View>
    </View>
  );
}
