import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";

const COLORS = {
  header: "#60715f",
  button: "#85c14c",
  footer: "#839384",
  text: "#3a3939",
  bg: "#F5F6F7",
  border: "#E5E7EB",
  white: "#FFFFFF",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
};

const TOKEN_KEY = "token";

// Offline cache keys
const LS_PRODUCTS = "i4s_products_cache_v1";
const LS_CUSTOMERS = "i4s_customers_cache_v1";
const LS_IMAGES = "i4s_images_cache_v1";
const LS_LAST_SYNC = "i4s_last_sync_v1";

// Saved orders
const LS_SAVED_ORDERS = "i4s_saved_orders_v1";

// ✅ NEW: sent orders log
const LS_SENT_ORDERS = "i4s_sent_orders_v1";

// Backend health
const DEFAULT_API_BASE = "https://ideas4seasons-backend.onrender.com";
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;

type SavedOrder = {
  id: string;
  createdAt: string;
  type?: "order" | "offerte";
  cart: any; // snapshot
  totalQty: number;
  totalAmount: number;
};

type SentOrderLog = {
  id: string; // local id (uuid uit cart of requestId)
  sentAt: string; // ISO
  type: "order" | "offerte";
  customerNumber: string;
  customerName: string;
  deliveryDate?: string; // YYYY-MM-DD
  totalAmount: number;

  // optioneel:
  requestId?: string;
  afasNumber?: string;
};

async function storageGet(key: string): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    if (v !== null) return v;
  } catch {}
  try {
    // @ts-ignore
    if (typeof window !== "undefined" && window?.localStorage)
      return localStorage.getItem(key);
  } catch {}
  return null;
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
    return;
  } catch {}
  try {
    // @ts-ignore
    if (typeof window !== "undefined" && window?.localStorage)
      localStorage.setItem(key, value);
  } catch {}
}

async function storageRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
    return;
  } catch {}
  try {
    // @ts-ignore
    if (typeof window !== "undefined" && window?.localStorage)
      localStorage.removeItem(key);
  } catch {}
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function countArrayInStorage(key: string) {
  const raw = await storageGet(key);
  const data = safeJsonParse<any[]>(raw);
  return Array.isArray(data) ? data.length : 0;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);

    // @ts-ignore
    const atobFn = typeof atob !== "undefined" ? atob : null;
    if (!atobFn) return null;

    const json = atobFn(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function formatEUR(n: number) {
  return `EUR ${Number(n || 0).toFixed(2)}`;
}

async function getSavedOrders(): Promise<SavedOrder[]> {
  const raw = await storageGet(LS_SAVED_ORDERS);
  const list = safeJsonParse<SavedOrder[]>(raw);
  return Array.isArray(list) ? list : [];
}

async function setSavedOrders(list: SavedOrder[]): Promise<void> {
  await storageSet(LS_SAVED_ORDERS, JSON.stringify(list));
}

async function getSentOrders(): Promise<SentOrderLog[]> {
  const raw = await storageGet(LS_SENT_ORDERS);
  const list = safeJsonParse<SentOrderLog[]>(raw);
  return Array.isArray(list) ? list : [];
}

function dateOnly(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ")) return s.split(" ")[0];
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** ✅ FIX: confirm werkt ook op web (Alert.alert doet vaak niets zichtbaar op web) */
function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    // @ts-ignore
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : true);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annuleren", style: "cancel", onPress: () => resolve(false) },
      { text: "Doorgaan", style: "default", onPress: () => resolve(true) },
    ]);
  });
}

export default function SettingsScreen() {
  const router = useRouter();

  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [productsCached, setProductsCached] = useState(0);
  const [customersCached, setCustomersCached] = useState(0);
  const [imagesCached, setImagesCached] = useState(0);
  const [lastSync, setLastSync] = useState<string>("Never");

  const agentNameFallback = useMemo(() => "—", []);
  const [agent, setAgent] = useState("—");
  const brandName = "Ideas4Seasons";

  const [savedOrders, setSavedOrdersState] = useState<SavedOrder[]>([]);
  const [sentOrders, setSentOrdersState] = useState<SentOrderLog[]>([]);

  const refreshCounts = async () => {
    setProductsCached(await countArrayInStorage(LS_PRODUCTS));
    setCustomersCached(await countArrayInStorage(LS_CUSTOMERS));
    setImagesCached(await countArrayInStorage(LS_IMAGES));

    const ls = await storageGet(LS_LAST_SYNC);
    setLastSync(ls || "Never");
  };

  const loadAgent = async () => {
    const token = await storageGet(TOKEN_KEY);
    if (!token) {
      setAgent("—");
      return;
    }
    const payload = decodeJwtPayload(token);
    const name =
      payload?.name ||
      payload?.username ||
      payload?.user?.name ||
      payload?.user?.username ||
      "—";
    setAgent(name);
  };

  const refreshSavedOrders = async () => {
    const list = await getSavedOrders();
    const sorted = [...list].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
    setSavedOrdersState(sorted);
  };

  const refreshSentOrders = async () => {
    const list = await getSentOrders();
    const sorted = [...list].sort((a, b) =>
      String(b.sentAt).localeCompare(String(a.sentAt))
    );
    setSentOrdersState(sorted);
  };

  const checkOnline = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/health`, { method: "GET" }).catch(
        () => null
      );
      if (res && res.ok) {
        setOnline(true);
        return;
      }
      const res2 = await fetch(API_BASE, { method: "GET" }).catch(() => null);
      setOnline(!!(res2 && res2.ok));
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    refreshCounts();
    checkOnline();
    loadAgent();
    refreshSavedOrders();
    refreshSentOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCounts();
      loadAgent();
      refreshSavedOrders();
      refreshSentOrders();
      checkOnline();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const handleSyncProductsCustomers = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const now = new Date().toLocaleString("nl-NL");
      await storageSet(LS_LAST_SYNC, now);
      await refreshCounts();
      setMessage("✅ Sync gestart (placeholder). Later koppelen we dit aan AFAS/back-end.");
    } catch {
      setMessage("❌ Sync kon niet starten (storage permissions?).");
    } finally {
      setSyncing(false);
    }
  };

  const handlePreDownloadImages = async () => {
    setPrefetching(true);
    setMessage(null);
    try {
      setMessage("🟣 Pre-download images (placeholder). Later bouwen we dit met echte product-images.");
    } catch {
      setMessage("❌ Pre-download kon niet starten.");
    } finally {
      setPrefetching(false);
    }
  };

  const handleLogout = async () => {
    try {
      await storageRemove(TOKEN_KEY);
    } catch {}
    router.replace("/login");
  };

  const statusIsOffline = online === false;

  /**
   * ✅ Openen:
   * - Settings navigeert alleen
   * - Verwijderen gebeurt straks in cart.tsx na succes
   */
  const openSavedOrder = async (id: string) => {
    const ok = await confirmDialog(
      "Order openen",
      "Deze order wordt geopend in de winkelwagen. Na succesvol laden wordt hij automatisch uit 'Opgeslagen orders' verwijderd."
    );
    if (!ok) return;

    router.push({
      pathname: "/(tabs)/cart",
      params: { openSaved: id },
    } as any);
  };

  /**
   * ✅ Annuleren:
   * - direct verwijderen uit LS_SAVED_ORDERS
   */
  const cancelSavedOrder = async (id: string) => {
    const ok = await confirmDialog(
      "Opgeslagen order annuleren",
      "Weet je zeker dat je deze opgeslagen order wilt verwijderen?"
    );
    if (!ok) return;

    const list = await getSavedOrders();
    const next = list.filter((x) => x.id !== id);
    await setSavedOrders(next);
    setSavedOrdersState(
      [...next].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    );
  };

  const clearSentLog = () => {
    Alert.alert(
      "Verzonden orders wissen",
      "Weet je zeker dat je de lijst met verzonden orders wilt leegmaken?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Wissen",
          style: "destructive",
          onPress: async () => {
            await storageSet(LS_SENT_ORDERS, JSON.stringify([]));
            await refreshSentOrders();
            setMessage("✅ Verzonden orders lijst is geleegd.");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: COLORS.header, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "800" }}>Settings</Text>
            <Text style={{ color: "white", opacity: 0.9, fontSize: 12 }}>
              {agent !== "—" ? agent : agentNameFallback}
            </Text>
          </View>

          <Pressable onPress={handleLogout} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
            <Text style={{ color: "white", fontWeight: "800" }}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
        {/* Online status */}
        <View
          style={{
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: statusIsOffline ? COLORS.redBorder : COLORS.greenBorder,
            backgroundColor: statusIsOffline ? COLORS.redBg : COLORS.greenBg,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: statusIsOffline ? "#EF4444" : "#10B981",
                  }}
                />
                <Text style={{ fontWeight: "800", color: COLORS.text }}>
                  {statusIsOffline ? "Offline" : "Online"}
                </Text>
              </View>
              <Text style={{ marginTop: 4, color: COLORS.text, opacity: 0.75 }}>
                {statusIsOffline ? "Not connected to server" : "Connected to server"}
              </Text>
            </View>

            <Pressable
              onPress={checkOnline}
              disabled={checking}
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "white",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                opacity: checking ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: "800", color: COLORS.text }}>
                {checking ? "Checking..." : "Re-check"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Opgeslagen orders (openen + annuleren) */}
        <Card title="Opgeslagen orders">
          <GridRow label="Aantal opgeslagen:" value={`${savedOrders.length}`} />
          <View style={{ marginTop: 10, gap: 10 }}>
            {savedOrders.length === 0 ? (
              <Text style={{ color: COLORS.text, opacity: 0.7 }}>Geen opgeslagen orders.</Text>
            ) : (
              savedOrders.map((o) => {
                const c = o.cart?.customer;
                const customerLabel = c?.name ? `${c.name} (${c.customerNumber || "—"})` : "—";

                const typeRaw = o.type || o.cart?.type || o.cart?.orderType || o.cart?.mode || "order";
                const type =
                  String(typeRaw).toLowerCase() === "offerte" || String(typeRaw).toLowerCase() === "quote"
                    ? "Offerte"
                    : "Order";

                const dt = o.createdAt ? new Date(o.createdAt).toLocaleString("nl-NL") : "—";

                return (
                  <View
                    key={o.id}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 14,
                      padding: 12,
                      backgroundColor: "#fff",
                    }}
                  >
                    <Text style={{ fontWeight: "900", color: COLORS.text }}>
                      {type} • {customerLabel}
                    </Text>
                    <Text style={{ marginTop: 4, color: COLORS.text, opacity: 0.7, fontSize: 12 }}>
                      {dt} • {o.totalQty} units • {formatEUR(o.totalAmount)}
                    </Text>

                    <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
                      <Pressable
                        onPress={() => {
                          void openSavedOrder(o.id);
                        }}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: "center",
                          backgroundColor: "#F3F4F6",
                          borderWidth: 1,
                          borderColor: COLORS.border,
                        }}
                      >
                        <Text style={{ fontWeight: "900", color: COLORS.text }}>Openen</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          void cancelSavedOrder(o.id);
                        }}
                        style={{
                          borderRadius: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          alignItems: "center",
                          backgroundColor: "#FEF2F2",
                          borderWidth: 1,
                          borderColor: "#FECACA",
                        }}
                      >
                        <Text style={{ fontWeight: "900", color: "#B91C1C" }}>Annuleren</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Card>

        {/* Verzonden orders */}
        <Card title="Verzonden orders">
          <GridRow label="Aantal verzonden:" value={`${sentOrders.length}`} />

          {sentOrders.length > 0 ? (
            <Pressable
              onPress={clearSentLog}
              style={{
                marginTop: 8,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: "#F3F4F6",
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontWeight: "900", color: COLORS.text }}>Lijst wissen</Text>
            </Pressable>
          ) : null}

          <View style={{ marginTop: 10, gap: 10 }}>
            {sentOrders.length === 0 ? (
              <Text style={{ color: COLORS.text, opacity: 0.7 }}>
                Nog geen verzonden orders. (Deze lijst vult zich zodra we in de winkelwagen na succes loggen.)
              </Text>
            ) : (
              sentOrders.map((o) => (
                <View
                  key={o.id}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: "#fff",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: COLORS.text }}>
                    {o.type.toUpperCase()} • {o.customerName} ({o.customerNumber})
                  </Text>

                  <Text style={{ marginTop: 4, color: COLORS.text, opacity: 0.7, fontSize: 12 }}>
                    Verzonden: {o.sentAt ? new Date(o.sentAt).toLocaleString("nl-NL") : "—"}
                  </Text>

                  <View style={{ marginTop: 10, gap: 6 }}>
                    <InfoRow label="Leverdatum" value={o.deliveryDate ? dateOnly(o.deliveryDate) : "—"} />
                    <InfoRow label="Totaal" value={formatEUR(o.totalAmount)} />
                  </View>
                </View>
              ))
            )}
          </View>
        </Card>

        {/* Offline Data */}
        <Card title="Offline Data">
          <GridRow label="Products cached:" value={`${productsCached}`} />
          <GridRow label="Images cached:" value={`${imagesCached}`} />
          <GridRow label="Customers cached:" value={`${customersCached}`} />
          <GridRow label="Last sync:" value={`${lastSync}`} />

          <View style={{ marginTop: 12, gap: 10 }}>
            <PrimaryFullButton
              label={syncing ? "Syncing..." : "🧩 Sync Products & Customers"}
              onPress={handleSyncProductsCustomers}
              disabled={syncing}
            />
            <Text style={{ textAlign: "center", fontSize: 12, color: COLORS.text, opacity: 0.6 }}>
              Downloads product data and customers for offline browsing (later AFAS).
            </Text>

            <Pressable
              onPress={handlePreDownloadImages}
              disabled={prefetching}
              style={{
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                backgroundColor: "#7C3AED",
                opacity: prefetching ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>
                {prefetching ? "Downloading..." : "🖼️ Pre-Download All Images"}
              </Text>
            </Pressable>

            <Text style={{ textAlign: "center", fontSize: 12, color: COLORS.text, opacity: 0.6 }}>
              Optional: Later preload images for faster browsing.
            </Text>
          </View>
        </Card>

        {/* Account */}
        <Card title="Account">
          <GridRow label="Agent:" value={agent !== "—" ? agent : "—"} />
          <GridRow label="Brands:" value={brandName} />

          <View style={{ marginTop: 12, gap: 10 }}>
            <PrimaryFullButton label="🔒 Change PIN" onPress={() => setMessage("🔒 Change PIN (placeholder).")} />
            <Pressable
              onPress={() => {
                Alert.alert("Log Out", "Weet je zeker dat je wilt uitloggen?", [
                  { text: "Annuleren", style: "cancel" },
                  { text: "Log Out", style: "destructive", onPress: () => handleLogout() },
                ]);
              }}
              style={{
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                backgroundColor: "#F3F4F6",
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontWeight: "800", color: COLORS.text }}>Log Out</Text>
            </Pressable>
          </View>
        </Card>

        {/* Message */}
        {message ? (
          <Card>
            <Text style={{ color: COLORS.text, fontSize: 14 }}>{message}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 14,
      }}
    >
      {title ? (
        <Text style={{ fontSize: 18, fontWeight: "900", color: COLORS.text, marginBottom: 10 }}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: COLORS.text, opacity: 0.7 }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: COLORS.text, opacity: 0.7 }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function PrimaryFullButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
        backgroundColor: COLORS.button,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: "white", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}
