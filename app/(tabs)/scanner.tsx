// app/(tabs)/scanner.tsx
// ✅ FULL FILE — only necessary changes:
// - Keep Expo CameraView for native
// - For web/PWA: use Expo onBarcodeScanned ONLY if BarcodeDetector exists
// - Otherwise fallback to @zxing/browser (video-based) so scans fire again
// - Keep your existing product lookup + offline queue logic intact

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

// ✅ detect BarcodeDetector support (cruciaal voor Expo web scanning)
function hasBarcodeDetector(): boolean {
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined") return false;
  return "BarcodeDetector" in window;
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

  // ✅ keep scanning on
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

  // ✅ Bluetooth / toetsenbord scanner (werkt ook zonder scanner)
useEffect(() => {
  let buffer = "";
  let lastKeyTime = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    const now = Date.now();

    // reset buffer als er "normaal" getypt wordt
    if (now - lastKeyTime > 300) {
      buffer = "";
    }
    lastKeyTime = now;

    // Enter = einde barcode
    if (e.key === "Enter") {
      if (buffer.length >= 8) {
        void processCode(buffer);
      }
      buffer = "";
      return;
    }

    // alleen cijfers accepteren
    if (/^\d$/.test(e.key)) {
      buffer += e.key;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);

  // ✅ Online processing
  const processOnlineCode = async (code: string) => {
    setLastScanned(code);
    setError(null);

    try {
      let row: any | null = null;

      // ✅ 1) FAST endpoint
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

  // ✅ Main entry
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

    saveOfflineQueue([]);
    refreshOfflineCount();

    showToast(`Sync: ${q.length} scan(s)`);
    for (const code of q) {
      if (!acceptWithCooldown(code)) continue;
      await processOnlineCode(code);
    }

    refreshOfflineCount();
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onOnline = () => {
      refreshOfflineCount();
      void syncOfflineQueue();
    };
    const onOffline = () => refreshOfflineCount();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

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

  const canInc = !!foundProduct && hasValidStep;
  const canDec = !!foundProduct && hasValidStep && foundQty >= stepUnits;

  // ✅ Badge logic
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

    // ✅ Native: use expo permissions
    if (Platform.OS !== "web") {
      const p = permission?.granted ? permission : await requestPermission();
      if (!p?.granted) {
        setCameraActive(false);
        setCameraError("Geen camera-permissie. Sta camera toe in instellingen.");
        return;
      }
      setCameraActive(true);
      return;
    }

    // ✅ Web: camera view/video will request permission when starting stream
    setCameraActive(true);
  }

  async function stopCamera() {
    setCameraError(null);
    setCameraActive(false);
  }

  // ✅ Expo scan callback (native + web only when BarcodeDetector exists)
  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (!scanEnabled) return;
    const raw = String(result?.data ?? "");
    const code = digitsOnly(raw);
    if (!/^\d{8,14}$/.test(code)) return;
    void processCode(code);
  };

  // -------------------------
  // ✅ ZXing fallback for web
  // -------------------------
  const videoRef = useRef<any>(null);
  const zxingControlsRef = useRef<any>(null);

  const webUsesExpoDetector = Platform.OS === "web" && hasBarcodeDetector();
  const webNeedsZxing = Platform.OS === "web" && !hasBarcodeDetector();

  useEffect(() => {
    // Only start ZXing on web when cameraActive + scanning enabled
    if (!webNeedsZxing) return;
    if (!cameraActive) return;
    if (!scanEnabled) return;

    let cancelled = false;

    const startZxing = async () => {
      try {
        // dynamic import (so native bundle doesn't care)
        const mod = await import("@zxing/browser");
        const { BrowserMultiFormatReader } = mod;

        if (cancelled) return;
        if (!videoRef.current) return;

        const reader = new BrowserMultiFormatReader();

        // decodeFromConstraints returns controls with stop()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result: any, err: any) => {
            if (cancelled) return;
            if (!scanEnabled) return;

            if (result) {
              const text =
                typeof result.getText === "function" ? result.getText() : String(result);
              const code = digitsOnly(text);
              if (!/^\d{8,14}$/.test(code)) return;
              void processCode(code);
            }
          }
        );

        zxingControlsRef.current = controls;
      } catch (e: any) {
        setCameraError(
          `Web scan fallback faalt. Controleer @zxing/browser install. (${e?.message ?? "unknown"})`
        );
      }
    };

    void startZxing();

    return () => {
      cancelled = true;
      try {
        // stop ZXing
        if (zxingControlsRef.current?.stop) zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;

      // stop camera stream tracks
      try {
        const v = videoRef.current;
        const stream = v?.srcObject as MediaStream | null;
        stream?.getTracks?.().forEach((t) => t.stop());
        if (v) v.srcObject = null;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, scanEnabled, webNeedsZxing]);

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

              {Platform.OS === "web" ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                  Status:{" "}
                  <Text style={{ fontWeight: "900", color: isWebOnline() ? "#047857" : "#B91C1C" }}>
                    {isWebOnline() ? "Online" : "Offline"}
                  </Text>
                  {"  "}• Web scan:{" "}
                  <Text style={{ fontWeight: "900", color: "#111827" }}>
                    {webUsesExpoDetector ? "Expo(BarcodeDetector)" : "ZXing fallback"}
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
              Platform.OS === "web" && webNeedsZxing ? (
                // ✅ Web fallback video for ZXing
                <View style={{ flex: 1 }}>
                  {/* @ts-ignore - DOM element only on web */}
                  <video
                    ref={(el : any) => (videoRef.current = el)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted
                    playsInline
                    autoPlay
                  />
                </View>
              ) : (
                // ✅ Native + web when BarcodeDetector exists
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  onBarcodeScanned={scanEnabled ? onBarcodeScanned : undefined}
                  barcodeScannerSettings={{
                    barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
                  }}
                />
              )
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

                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, ...(badge.bg as any) }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", ...(badge.color as any) }}>
                    {badge.text}
                  </Text>
                </View>
              </View>

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

          <View style={{ marginTop: 12, alignItems: "flex-end" }}>
            <Text style={{ fontWeight: "900", color: "#111827" }}>
              Totaal: €{total.toFixed(2)}
            </Text>
          </View>

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
