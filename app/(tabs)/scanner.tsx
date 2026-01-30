// app/(tabs)/scanner.tsx
// ✅ FULL FILE — only necessary changes:
// - Use Expo CameraView for BOTH web (PWA) + native (no ZXing/video)
// - Fix stale-closure risk by NOT using useCallback([]) for processCode
// - Keep scanning enabled (no auto-pause after 1 scan)
// - Add offline scan queue (localStorage) + auto-sync when online

import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useCart } from "../../components/cart/CartProvider";

type FoundProduct = {
  id: string; // itemcode
  articleNumber: string; // itemcode
  name: string;
  price: number;
  imageUrl?: string;

  // ✅ stock velden (voor badge)
  availableStock: number | null;
  onOrderQty: number | null;
  arrivalDate: string | null; // YYYY-MM-DD

  // ✅ essentieel voor bestellen
  outerCartonQty: number; // must be > 0 to allow ordering
};

type RecentScanned = {
  id: string;
  articleNumber: string;
  name: string;
  price: number;
  ts: number;

  // ✅ nodig voor +/- per doos
  outerCartonQty: number;

  // (optioneel) handig als cart/badge later gebruikt
  availableStock?: number | null;
  onOrderQty?: number | null;
  arrivalDate?: string | null;
};

const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://ideas4seasons-backend.onrender.com").replace(/\/$/, "");

// ✅ Offline queue storage key (web/PWA only)
const OFFLINE_QUEUE_KEY = "i4s_scan_queue_v1";

function digitsOnly(raw: string) {
  return String(raw ?? "").trim().replace(/[^\d]/g, "");
}

function parseNumber(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    const n = Number(s);
    return n;
  }
  return NaN;
}

// "2026-07-27T00:00:00.000Z" -> "2026-07-27"
function dateOnly(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.split("T")[0];
}

/**
 * ✅ OUTERCARTON uit backend row halen:
 * - row.outercarton (zoals jouw /products)
 * - fallback: row.raw.OUTERCARTON
 */
function readOuterCarton(row: any): number {
  const raw = row?.outercarton ?? row?.raw?.OUTERCARTON ?? row?.OUTERCARTON;
  const n = parseNumber(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * ✅ Stock velden uit backend row halen (snake_case + camelCase fallback)
 */
function readStock(row: any): {
  availableStock: number | null;
  onOrderQty: number | null;
  arrivalDate: string | null;
} {
  const available = parseNumber(
    row?.available_stock ?? row?.availableStock ?? row?.stock
  );
  const onOrder = parseNumber(row?.on_order ?? row?.onOrder ?? row?.onOrderQty);
  const arrival = dateOnly(
    row?.arrival_date ?? row?.arrivalDate ?? row?.expectedDate
  );

  return {
    availableStock: Number.isFinite(available) ? available : null,
    onOrderQty: Number.isFinite(onOrder) ? onOrder : null,
    arrivalDate: arrival ? arrival : null,
  };
}

/**
 * ✅ EAN varianten proberen (12/13/14 + leading zero)
 */
function buildEanCandidates(code: string): string[] {
  const c = digitsOnly(code);
  if (!c) return [];
  const set = new Set<string>();
  set.add(c);

  if (c.length === 12) set.add("0" + c); // UPC-A → EAN-13
  if (c.length === 13) set.add("0" + c); // soms opgeslagen als 14
  if (c.length === 14 && c.startsWith("0")) set.add(c.slice(1)); // 14 → 13

  return Array.from(set);
}

/**
 * ✅ FAST endpoint: /products/by-ean/:ean
 * Backend geeft: { ok: true, data: {...}|null }
 */
async function getProductByEanFast(scanned: string): Promise<any | null> {
  const tried = buildEanCandidates(scanned);
  if (!tried.length) return null;

  for (const ean of tried) {
    const url = `${API_BASE}/products/by-ean/${encodeURIComponent(ean)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === "object" && "data" in json) {
        const data = (json as any).data;
        if (data) return data;
        continue;
      }
      if (json) return json;
      continue;
    }

    // route bestaat bij jou, maar als ooit stuk is: fallback
    throw new Error(`FAST_EAN_${res.status}`);
  }

  return null;
}

/**
 * ✅ Haal één pagina producten op
 * /products geeft: { ok, limit, offset, count, data: [...] }
 */
async function fetchProductsPage(offset: number, limit = 200): Promise<any[]> {
  const url = `${API_BASE}/products?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`API ${res.status} bij ${url}\n${body?.slice(0, 200) ?? ""}`);
  }

  const json = await res.json();
  const data =
    json && typeof json === "object" && "data" in json ? (json as any).data : json;

  if (Array.isArray(data)) return data;
  return [];
}

/**
 * ✅ Zoek product by EAN door pagina's heen (fallback)
 */
async function findProductByEanPaged(
  scanned: string
): Promise<{ row: any | null; tried: string[] }> {
  const tried = buildEanCandidates(scanned);
  if (tried.length === 0) return { row: null, tried: [] };

  const LIMIT = 200;
  const MAX_PAGES = 60; // 60*200=12.000 producten max doorzoeken

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * LIMIT;
    const rows = await fetchProductsPage(offset, LIMIT);

    if (!rows.length) break;

    for (const row of rows) {
      const ean =
        digitsOnly(row?.ean) ||
        digitsOnly(row?.barcode) ||
        digitsOnly(row?.raw?.EAN) ||
        digitsOnly(row?.EAN);

      if (!ean) continue;
      if (tried.includes(ean)) return { row, tried };
    }
  }

  return { row: null, tried };
}

type BadgeVariant = "in" | "expected" | "out";

// ✅ web/PWA helpers for offline queue
function isWebOnline(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof navigator === "undefined") return true;
  // navigator.onLine is not perfect, but good enough for queue decision
  return navigator.onLine !== false;
}

function loadOfflineQueue(): string[] {
  if (Platform.OS !== "web") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((x) => digitsOnly(String(x))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(q: string[]) {
  if (Platform.OS !== "web") return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

export default function ScannerScreen() {
  const router = useRouter();
  const { cart, addItem, getQty } = useCart();

  const lines = (cart?.lines ?? []) as Array<{
    productId: string;
    articleNumber: string;
    name: string;
    price: number;
    qty: number;
    imageUrl?: string;
  }>;

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // scan state
  const [lastScanned, setLastScanned] = useState("");
  const [foundProduct, setFoundProduct] = useState<FoundProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ keep scanning on; you can still toggle if you want
  const [scanEnabled, setScanEnabled] = useState(true);

  // ✅ recent gescand (blijft zichtbaar in sessie)
  const [recentScanned, setRecentScanned] = useState<RecentScanned[]>([]);

  const upsertRecent = (p: FoundProduct) => {
    const entry: RecentScanned = {
      id: p.id,
      articleNumber: p.articleNumber,
      name: p.name,
      price: p.price,
      ts: Date.now(),

      outerCartonQty: Number(p.outerCartonQty || 0),

      availableStock: p.availableStock,
      onOrderQty: p.onOrderQty,
      arrivalDate: p.arrivalDate,
    };

    setRecentScanned((prev) => {
      const next = [entry, ...prev.filter((x) => x.id !== entry.id)];
      return next.slice(0, 12);
    });
  };

  // cooldown tegen dubbele scans
  const lastAcceptedRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });
  const COOLDOWN_MS = 1200;

  const acceptWithCooldown = (code: string) => {
    const now = Date.now();
    const prev = lastAcceptedRef.current;
    if (prev.code === code && now - prev.ts < COOLDOWN_MS) return false;
    lastAcceptedRef.current = { code, ts: now };
    return true;
  };

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  // ✅ Offline queue state (web only)
  const [offlineCount, setOfflineCount] = useState<number>(() => loadOfflineQueue().length);

  const refreshOfflineCount = () => {
    setOfflineCount(loadOfflineQueue().length);
  };

  // ✅ Online processing (fetch → build product → setFoundProduct → recent → toast)
  const processOnlineCode = async (code: string) => {
    setLastScanned(code);
    setError(null);

    try {
      let row: any | null = null;

      // ✅ 1) FAST endpoint (beurs-proof)
      try {
        row = await getProductByEanFast(code);
      } catch {
        row = null;
      }

      // ✅ 2) fallback (paged)
      if (!row) {
        const r = await findProductByEanPaged(code);
        row = r.row;
      }

      if (!row) {
        setFoundProduct(null);
        setError(`Geen product gevonden voor barcode: ${code}`);
        return;
      }

      const outerCartonQty = readOuterCarton(row);
      const stock = readStock(row);

      const p: FoundProduct = {
        id: String(row.itemcode ?? ""),
        articleNumber: String(row.itemcode ?? ""),
        name: String(row.description_eng ?? row.itemcode ?? code),
        price: Number(parseNumber(row.price) || 0),
        imageUrl: undefined,

        availableStock: stock.availableStock,
        onOrderQty: stock.onOrderQty,
        arrivalDate: stock.arrivalDate,

        outerCartonQty: Number.isFinite(outerCartonQty) ? outerCartonQty : 0,
      };

      setFoundProduct(p);
      upsertRecent(p);

      if (!p.outerCartonQty) {
        setError(
          `OUTERCARTON ontbreekt voor artikel ${p.articleNumber}. Scanner kan niet per doos bestellen.`
        );
      } else {
        showToast(`Gevonden: ${p.name}`);
      }
    } catch (e: any) {
      setFoundProduct(null);
      setError(e?.message || `Fout bij ophalen product voor barcode: ${code}`);
    }
  };

  // ✅ Main entry: accepts raw scan, queues offline on web, otherwise processes online
  const processCode = async (raw: string) => {
    const code = digitsOnly(raw);
    if (!code) return;

    if (!/^\d{8,14}$/.test(code)) {
      setError(`Onbekende code (geen barcode): ${code}`);
      setFoundProduct(null);
      setLastScanned(code);
      return;
    }

    if (!acceptWithCooldown(code)) return;

    // ✅ Offline mode (web/PWA): queue the scan
    if (Platform.OS === "web" && !isWebOnline()) {
      const q = loadOfflineQueue();
      q.push(code);
      saveOfflineQueue(q);
      setLastScanned(code);
      showToast(`Offline opgeslagen: ${code}`);
      refreshOfflineCount();
      return;
    }

    // ✅ Online: normal flow
    await processOnlineCode(code);
  };

  // ✅ Auto-sync offline queue when coming online (web)
  const syncOfflineQueue = async () => {
    if (Platform.OS !== "web") return;
    if (!isWebOnline()) {
      showToast("Nog offline — kan niet syncen");
      return;
    }

    const q = loadOfflineQueue();
    if (!q.length) {
      showToast("Geen offline scans");
      refreshOfflineCount();
      return;
    }

    // clear first to prevent infinite loops if fetch fails mid-way
    saveOfflineQueue([]);
    refreshOfflineCount();

    showToast(`Sync: ${q.length} scan(s)`);
    for (const code of q) {
      // For queued items we still apply cooldown (prevents double add)
      if (!acceptWithCooldown(code)) continue;
      await processOnlineCode(code);
    }

    refreshOfflineCount();
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onOnline = () => {
      refreshOfflineCount();
      // auto sync when we regain internet (beurs-friendly)
      void syncOfflineQueue();
    };
    const onOffline = () => refreshOfflineCount();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // initial
    refreshOfflineCount();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ qty in units
  const foundQty = foundProduct ? getQty(foundProduct.id) : 0;

  // ✅ stapgrootte (OUTERCARTON)
  const stepUnits = foundProduct?.outerCartonQty ?? 0;
  const hasValidStep = Number.isFinite(stepUnits) && stepUnits > 0;

  const cartons = hasValidStep ? Math.floor(foundQty / stepUnits) : 0;

  // ✅ BELANGRIJK: ook "Not in stock" mag je toevoegen → dus niet blokkeren op voorraad
  const canInc = !!foundProduct && hasValidStep;
  const canDec = !!foundProduct && hasValidStep && foundQty >= stepUnits;

  // ✅ Badge logic exact zoals ProductCard
  const badge = useMemo(() => {
    const availableStock = foundProduct?.availableStock;
    const onOrderQty = foundProduct?.onOrderQty;
    const arrivalDate = foundProduct?.arrivalDate;

    const hasStock =
      Number.isFinite(Number(availableStock)) && Number(availableStock) > 0;
    const hasIncoming =
      Number.isFinite(Number(onOrderQty)) && Number(onOrderQty) > 0 && !!arrivalDate;

    if (hasStock) {
      return {
        variant: "in" as BadgeVariant,
        text: "In stock",
        bg: { backgroundColor: "#D1FAE5" },
        color: { color: "#065F46" },
      };
    }

    if (hasIncoming) {
      return {
        variant: "expected" as BadgeVariant,
        text: `Expected on ${arrivalDate}`,
        bg: { backgroundColor: "#FFEDD5" },
        color: { color: "#9A3412" },
      };
    }

    return {
      variant: "out" as BadgeVariant,
      text: "Not in stock",
      bg: { backgroundColor: "#FEE2E2" },
      color: { color: "#991B1B" },
    };
  }, [foundProduct?.availableStock, foundProduct?.onOrderQty, foundProduct?.arrivalDate]);

  const payload = useMemo(() => {
    if (!foundProduct) return null;
    return {
      productId: foundProduct.id,
      articleNumber: foundProduct.articleNumber,
      name: foundProduct.name,
      price: foundProduct.price,
      imageUrl: foundProduct.imageUrl,

      // (optioneel) handig als cart later ook badge wil tonen
      availableStock: foundProduct.availableStock,
      onOrder: foundProduct.onOrderQty,
      arrivalDate: foundProduct.arrivalDate,
      outerCartonQty: stepUnits,
    };
  }, [foundProduct, stepUnits]);

  const incFound = () => {
    if (!foundProduct || !payload) return;
    if (!canInc) return;

    addItem(payload as any, +stepUnits);
    showToast(`+${stepUnits} (1 doos) ${foundProduct.name}`);
  };

  const decFound = () => {
    if (!foundProduct || !payload) return;
    if (!canDec) return;

    addItem(payload as any, -stepUnits);
  };

  // ✅ +/- per doos vanuit Recent gescand
  const incRecent = (p: RecentScanned) => {
    const step = Number(p.outerCartonQty || 0);
    if (!Number.isFinite(step) || step <= 0) return;

    addItem(
      {
        productId: p.id,
        articleNumber: p.articleNumber,
        name: p.name,
        price: p.price,
        imageUrl: undefined,

        availableStock: p.availableStock ?? null,
        onOrder: p.onOrderQty ?? null,
        arrivalDate: p.arrivalDate ?? null,
        outerCartonQty: step,
      } as any,
      +step
    );

    showToast(`+${step} (1 doos) ${p.name}`);
  };

  const decRecent = (p: RecentScanned) => {
    const step = Number(p.outerCartonQty || 0);
    if (!Number.isFinite(step) || step <= 0) return;

    const qty = getQty(p.id) || 0;
    if (qty < step) return;

    addItem(
      {
        productId: p.id,
        articleNumber: p.articleNumber,
        name: p.name,
        price: p.price,
        imageUrl: undefined,

        availableStock: p.availableStock ?? null,
        onOrder: p.onOrderQty ?? null,
        arrivalDate: p.arrivalDate ?? null,
        outerCartonQty: step,
      } as any,
      -step
    );
  };

  const total = useMemo(() => {
    return lines.reduce((sum, l) => sum + Number(l.price || 0) * Number(l.qty || 0), 0);
  }, [lines]);

  const hint = useMemo(() => "Scan EAN-13 (13 cijfers) zoals 8717568350035", []);

  async function startCamera() {
    setCameraError(null);

    const p = permission?.granted ? permission : await requestPermission();
    if (!p?.granted) {
      setCameraActive(false);
      setCameraError("Geen camera-permissie. Sta camera toe in instellingen.");
      return;
    }

    setCameraActive(true);
  }

  async function stopCamera() {
    setCameraError(null);
    setCameraActive(false);
  }

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
  console.log("BARCODE EVENT FIRED", result?.type, result?.data);
  showToast("BARCODE EVENT");
  if (!scanEnabled) return;
  const raw = String(result?.data ?? "");
  const code = digitsOnly(raw);
  if (!/^\d{8,14}$/.test(code)) return;
  void processCode(code);
};


  function Card({ children }: { children: React.ReactNode }) {
    return (
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          padding: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
        }}
      >
        {children}
      </View>
    );
  }

  const resetForNextScan = async () => {
    setError(null);
    setLastScanned("");
    setFoundProduct(null);
    setScanEnabled(true);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F3F4F6" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      {toast ? (
        <View
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            zIndex: 9999,
            backgroundColor: "#059669",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800" }}>{toast}</Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 22, fontWeight: "900", color: "#60715f" }}>
        Scanner
      </Text>

      <View style={{ marginTop: 12 }}>
        <Card>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontWeight: "800", color: "#111827" }}>
                Camera scan
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                {hint}
              </Text>

              {/* ✅ Offline indicator (web/PWA) */}
              {Platform.OS === "web" ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                  Status:{" "}
                  <Text style={{ fontWeight: "900", color: isWebOnline() ? "#047857" : "#B91C1C" }}>
                    {isWebOnline() ? "Online" : "Offline"}
                  </Text>
                  {offlineCount ? (
                    <>
                      {" "}
                      • Offline scans:{" "}
                      <Text style={{ fontWeight: "900", color: "#111827" }}>
                        {offlineCount}
                      </Text>
                    </>
                  ) : null}
                </Text>
              ) : null}

              {!scanEnabled ? (
                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: "900",
                    color: "#92400E",
                  }}
                >
                  Scannen gepauzeerd
                </Text>
              ) : null}
            </View>

            {!cameraActive ? (
              <Pressable
                onPress={startCamera}
                style={{
                  backgroundColor: "#059669",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Start</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={stopCamera}
                style={{
                  backgroundColor: "#111827",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Stop</Text>
              </Pressable>
            )}
          </View>

          {/* ✅ Manual sync button (web) */}
          {Platform.OS === "web" && offlineCount > 0 ? (
            <Pressable
              onPress={() => void syncOfflineQueue()}
              style={{
                marginTop: 10,
                backgroundColor: "#111827",
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
                opacity: isWebOnline() ? 1 : 0.5,
              }}
              disabled={!isWebOnline()}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>
                Sync offline scans ({offlineCount})
              </Text>
            </Pressable>
          ) : null}

          {cameraError ? (
            <View
              style={{
                marginTop: 10,
                backgroundColor: "#FEF2F2",
                borderRadius: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}
            >
              <Text style={{ color: "#B91C1C" }}>{cameraError}</Text>
            </View>
          ) : null}

          <View
            style={{
              marginTop: 10,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              backgroundColor: "#000",
              height: 220,
              position: "relative",
            }}
          >
            {cameraActive ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                onBarcodeScanned={scanEnabled ? onBarcodeScanned : undefined}
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
                }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#9CA3AF" }}>Camera staat uit</Text>
              </View>
            )}
          </View>

          {!scanEnabled ? (
            <Pressable
              onPress={resetForNextScan}
              style={{
                marginTop: 12,
                backgroundColor: "#111827",
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>
                Scan opnieuw
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <View style={{ height: 12 }} />

        <Card>
          {lastScanned ? (
            <Text style={{ marginBottom: 10, color: "#6B7280" }}>
              Laatst gescand: <Text style={{ fontWeight: "900" }}>{lastScanned}</Text>
            </Text>
          ) : null}

          {error ? (
            <View
              style={{
                marginBottom: 10,
                backgroundColor: "#FEF2F2",
                borderRadius: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}
            >
              <Text style={{ color: "#B91C1C" }}>{error}</Text>
            </View>
          ) : null}

          {foundProduct ? (
            <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, padding: 12 }}>
              <Text style={{ fontSize: 12, color: "#6B7280" }}>{foundProduct.articleNumber}</Text>
              <Text style={{ marginTop: 4, fontSize: 16, fontWeight: "900", color: "#111827" }}>
                {foundProduct.name}
              </Text>

              <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "900", color: "#047857" }}>
                  €{foundProduct.price.toFixed(2)}
                </Text>

                {/* ✅ Badge zoals ProductCard */}
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, ...(badge.bg as any) }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", ...(badge.color as any) }}>
                    {badge.text}
                  </Text>
                </View>
              </View>

              {/* (optioneel) extra duidelijkheid voor agent */}
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: "#6B7280", fontSize: 12 }}>
                  Available:{" "}
                  <Text style={{ fontWeight: "900", color: "#111827" }}>
                    {foundProduct.availableStock ?? "—"}
                  </Text>{" "}
                  • On order:{" "}
                  <Text style={{ fontWeight: "900", color: "#111827" }}>
                    {foundProduct.onOrderQty ?? "—"}
                  </Text>
                  {foundProduct.arrivalDate ? (
                    <>
                      {" "}
                      • Arrival:{" "}
                      <Text style={{ fontWeight: "900", color: "#111827" }}>
                        {foundProduct.arrivalDate}
                      </Text>
                    </>
                  ) : null}
                </Text>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#6B7280", fontSize: 12 }}>
                  OUTERCARTON:{" "}
                  <Text style={{ fontWeight: "900", color: "#111827" }}>
                    {hasValidStep ? stepUnits : "—"}
                  </Text>
                </Text>
                <Text style={{ color: "#6B7280", fontSize: 12 }}>
                  cartons: <Text style={{ fontWeight: "900", color: "#111827" }}>{cartons}</Text>
                </Text>
              </View>

              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                <Pressable
                  onPress={decFound}
                  disabled={!canDec}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: "#E5E7EB",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: canDec ? 1 : 0.4,
                    marginRight: 10,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", color: "#374151" }}>–</Text>
                </Pressable>

                <View style={{ minWidth: 50, alignItems: "center", marginRight: 10 }}>
                  <Text style={{ fontWeight: "900", color: "#374151" }}>{foundQty}</Text>
                </View>

                <Pressable
                  onPress={incFound}
                  disabled={!canInc}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: "#D1FAE5",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: canInc ? 1 : 0.4,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", color: "#047857" }}>+</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, padding: 12 }}>
              <Text style={{ color: "#6B7280" }}>Scan een barcode om een product te tonen.</Text>
            </View>
          )}

          {/* ✅ Recent gescand lijst (blijft zichtbaar in sessie) + doos +/- */}
          {recentScanned.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontWeight: "900", color: "#111827", marginBottom: 8 }}>
                Recent gescand
              </Text>

              <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, overflow: "hidden" }}>
                {recentScanned.map((p, idx) => {
                  const qty = getQty(p.id) || 0;
                  const isLast = idx === recentScanned.length - 1;

                  const step = Number(p.outerCartonQty || 0);
                  const stepOk = Number.isFinite(step) && step > 0;
                  const canDecRow = stepOk && qty >= step;

                  return (
                    <View
                      key={p.id}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: "#E5E7EB",
                        backgroundColor: "white",
                      }}
                    >
                      <Text style={{ fontSize: 12, color: "#6B7280" }}>{p.articleNumber}</Text>

                      <View
                        style={{
                          marginTop: 2,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontWeight: "800", color: "#111827" }} numberOfLines={1}>
                            {p.name}
                          </Text>

                          <Text style={{ marginTop: 2, fontSize: 12, color: "#6B7280" }}>
                            OUTERCARTON:{" "}
                            <Text style={{ fontWeight: "900", color: "#111827" }}>
                              {stepOk ? step : "—"}
                            </Text>
                          </Text>
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Pressable
                            onPress={() => decRecent(p)}
                            disabled={!canDecRow}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              backgroundColor: "#E5E7EB",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: canDecRow ? 1 : 0.4,
                              marginRight: 8,
                            }}
                          >
                            <Text style={{ fontSize: 18, fontWeight: "900", color: "#374151" }}>–</Text>
                          </Pressable>

                          <View style={{ minWidth: 32, alignItems: "center", marginRight: 8 }}>
                            <Text style={{ fontWeight: "900", color: "#111827" }}>{qty}</Text>
                          </View>

                          <Pressable
                            onPress={() => incRecent(p)}
                            disabled={!stepOk}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              backgroundColor: "#D1FAE5",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: stepOk ? 1 : 0.4,
                            }}
                          >
                            <Text style={{ fontSize: 18, fontWeight: "900", color: "#047857" }}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* ✅ Alleen totaal (geen Clear winkelwagen) */}
          <View style={{ marginTop: 12, alignItems: "flex-end" }}>
            <Text style={{ fontWeight: "900", color: "#111827" }}>
              Totaal: €{total.toFixed(2)}
            </Text>
          </View>

          {/* ✅ 1 brede knop: Naar winkelwagen */}
          <View style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => router.push("/(tabs)/cart")}
              style={{
                backgroundColor: "#111827",
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Naar winkelwagen</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
