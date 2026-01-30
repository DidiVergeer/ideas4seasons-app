// app/(tabs)/product/[id].tsx
// ✅ FULL REPLACEMENT
// ✅ Adds: stock badge under qty row (green/orange/red)
// ✅ Fixes: passes on_order + arrival_date + economic_stock into ProductAccordion
// ✅ Adds: PALLET under Item information (under outercarton)
// ✅ Keeps: swipeable carousel + clickable dots (no fullscreen)
// ✅ Keeps: jouw huidige data/mapping/buildSfeerImages logic
// ✅ NEW: uses resolved unit price from CartProvider (getUnitPrice)

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useCart } from "../../../components/cart";
import type { Product } from "../../../components/products/catalog";
import { mapAfasRowToProduct } from "../../../components/products/catalog";
import ProductAccordion from "../../../components/products/ProductAccordion";
import { getProductByItemcode, getProducts } from "../../api/products";
import { getCache } from "../../lib/offlineCache";

const BRAND_GREEN = "#16A34A";

const PAGE_SIZE = 500;
const MAX_ITEMS = 5000;

/**
 * Als jouw sfeer_1..5 soms relatieve paden zijn ("/files/.."),
 * zet dan EXPO_PUBLIC_API_URL naar je backend base url, bv:
 * EXPO_PUBLIC_API_URL=https://ideas4seasons-backend.onrender.com
 */
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/* =========================
   Small helpers
   ========================= */

function formatEUR(v?: number | null) {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return `EUR ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function pickFirstString(...values: any[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return "";
}

/** normalize itemcode key (trim + optionally strip leading "I") */
function normalizeKey(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.startsWith("I") ? s.slice(1) : s;
}

/** string of object -> url string */
function extractUrl(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();

  if (typeof value === "object") {
    const candidate =
      value.url ??
      value.Url ??
      value.uri ??
      value.Uri ??
      value.imageUrl ??
      value.ImageUrl ??
      value.href ??
      value.Href ??
      value.full ??
      value.Full ??
      value.path ??
      value.Path;

    if (typeof candidate === "string") return candidate.trim();
  }
  return "";
}

/** maak eventueel relatieve URLs absoluut */
function toAbsoluteUrl(u: string): string {
  const url = (u ?? "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(data:|blob:)/i.test(url)) return url;

  if (!API_BASE) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}

function normalizeUrlList(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(extractUrl).filter(Boolean);
  const single = extractUrl(input);
  return single ? [single] : [];
}

function uniqueNonEmpty(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const u = String(raw || "").trim();
    if (!u) continue;
    const abs = toAbsoluteUrl(u);
    if (!abs) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** ISO date -> alleen datum (YYYY-MM-DD) */
function dateOnly(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ")) return s.split(" ")[0];
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

/** naar number (null/undefined -> 0) */
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ Belangrijk: bouw images als:
 * 1) hoofdfoto eerst
 * 2) sfeer_1..5
 * 3) daarna fallback arrays
 *
 * ✅ EXTRA FIX: support snake_case uit backend:
 * - image_url
 * - image_urls (array)
 */
function buildSfeerImages(product: any): string[] {
  const p = product ?? {};

  // 1) hoofdfoto eerst (camelCase + snake_case)
  const main = [
    extractUrl(p.imageUrl),
    extractUrl(p.image_url),
    extractUrl(p.ImageUrl),
    extractUrl(p.mainImage),
    extractUrl(p.thumbnail),
  ].filter(Boolean);

  // 2) sfeer in vaste volgorde
  const sfeer = [
    extractUrl(p.sfeer_1),
    extractUrl(p.sfeer_2),
    extractUrl(p.sfeer_3),
    extractUrl(p.sfeer_4),
    extractUrl(p.sfeer_5),
  ].filter(Boolean);

  // 3) fallback bronnen (camelCase + snake_case)
  const fallback = [
    ...normalizeUrlList(p.images),
    ...normalizeUrlList(p.pictures),
    ...normalizeUrlList(p.imageUrls),
    ...normalizeUrlList(p.image_urls),
    ...normalizeUrlList(p.Images),
    ...normalizeUrlList(p?.pictures?.items),
    ...normalizeUrlList(p?.images?.items),
    ...normalizeUrlList(p?.images?.data),
    ...normalizeUrlList(p?.pictures?.data),
  ];

  const combined = [...main, ...sfeer, ...fallback];
  const unique = uniqueNonEmpty(combined);

  // ✅ max 6: 1 main + tot 5 sfeer
  return unique.slice(0, 6);
}

/* =========================
   Inline swipe carousel
   ========================= */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type StockBadgeVariant = "in" | "expected" | "out";

function InlineImageCarousel({ images }: { images: string[] }) {
  const listRef = useRef<FlatList<string>>(null);
  const { width } = useWindowDimensions();

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (listRef.current && images.length > 0) {
      try {
        listRef.current.scrollToIndex({ index: 0, animated: false });
      } catch {}
    }
  }, [images]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = width > 0 ? Math.round(x / width) : 0;
    setIndex(clamp(next, 0, Math.max(0, images.length - 1)));
  };

  const goTo = (i: number) => {
    const next = clamp(i, 0, Math.max(0, images.length - 1));
    setIndex(next);
    try {
      listRef.current?.scrollToIndex({ index: next, animated: true });
    } catch {}
  };

  if (!images || images.length === 0) {
    return (
      <View style={[carouselStyles.frame, { width }]}>
        <View style={[carouselStyles.placeholder, { width, height: 260 }]} />
      </View>
    );
  }

  return (
    <View>
      <View style={[carouselStyles.frame, { width }]}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(u, i) => `${i}:${u}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => (
            <View style={[carouselStyles.slide, { width }]}>
              <Image
                source={{ uri: item }}
                style={carouselStyles.image}
                resizeMode="contain"
              />
            </View>
          )}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        />
      </View>

      {images.length > 1 && (
        <View style={carouselStyles.dotsRow}>
          {images.map((_, i) => {
            const active = i === index;
            return (
              <Pressable
                key={`dot-${i}`}
                onPress={() => goTo(i)}
                style={[
                  carouselStyles.dot,
                  active ? carouselStyles.dotActive : carouselStyles.dotInactive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`image ${i + 1} of ${images.length}`}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  frame: { backgroundColor: "#F9FAFB" },
  slide: {
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  image: { width: "100%", height: "100%" },
  placeholder: { backgroundColor: "#F3F4F6" },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  dotInactive: { backgroundColor: "#D1D5DB" },
  dotActive: { backgroundColor: "#111827" },
});

/* =========================
   Screen
   ========================= */

   const PRODUCTS_CACHE_KEY = "i4s_cache_products_v1";

function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function findInCachedProducts(cache: any, itemcode: string) {
  const list: any[] = cache?.data?.products ?? cache?.products ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;

  const target = String(itemcode ?? "").trim();
  if (!target) return null;

  return (
    list.find((p: any) => {
      const pid = pickFirstString(
        p?.id,
        p?.articleNumber,
        p?.itemcode,
        p?.ItemCode,
        p?.ARTICLECODE
      );
      return String(pid ?? "").trim() === target;
    }) ?? null
  );
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // ✅ NEW: getUnitPrice from CartProvider
  const { addItem, getQty, getUnitPrice } = useCart() as any;

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemcode = String(Array.isArray(id) ? id[0] : id ?? "").trim();

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);
        setProduct(null);

        if (!itemcode) throw new Error("Product not found");

        // 1) detail endpoint
        const row = await withTimeout(getProductByItemcode(itemcode), 4000, "offline-or-timeout");

        if (row) {
          const p = mapAfasRowToProduct(row as any);
          const merged = { ...(p as any), ...(row as any) };
          if (alive) setProduct(merged as any);
          return;
        }

        // 2) fallback scan
        let offset = 0;
        let found: any = null;
        let foundRow: any = null;

        while (offset < MAX_ITEMS) {
          const page = await getProducts(PAGE_SIZE, offset);
          if (!page || page.length === 0) break;

          for (const r of page) {
            try {
              const p = mapAfasRowToProduct(r as any);

              const pItemcode = pickFirstString(
                (p as any)?.id,
                (p as any)?.articleNumber,
                (p as any)?.itemcode,
                (p as any)?.ItemCode,
                (r as any)?.itemcode,
                (r as any)?.ItemCode
              );

              if (String(pItemcode).trim() === itemcode) {
                found = p;
                foundRow = r;
                break;
              }
            } catch {}
          }

          if (found) break;

          offset += page.length;
          if (page.length < PAGE_SIZE) break;
        }

        if (!found) throw new Error("Product not found");

        const merged = { ...(found as any), ...(foundRow as any) };
        if (alive) setProduct(merged as any);
      } catch (e: any) {
  try {
    // ✅ OFFLINE FALLBACK: pak uit cached products
    const cached = await getCache<{ products: any[]; dataBugs: string[] }>(PRODUCTS_CACHE_KEY);
    const cachedProduct = findInCachedProducts(cached, itemcode);

    if (alive && cachedProduct) {
      // we hebben al gemapte producten in cache (uit products.tsx)
      setError(null);
      setProduct(cachedProduct as any);
      return;
    }
  } catch {
    // ignore cache errors
  }

  if (alive) setError(e?.message ?? "Failed to load product");
}
    })();

    return () => {
      alive = false;
    };
  }, [itemcode]);

  const qtyUnits = itemcode ? getQty(itemcode) : 0;

  const stepUnits = useMemo(() => {
    if (!product) return 1;
    const n = Number(
      (product as any).outerCartonQty ?? (product as any).outercarton
    );
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [product]);

  const cartons = stepUnits > 0 ? Math.floor(qtyUnits / stepUnits) : 0;

  const images = useMemo(() => buildSfeerImages(product as any), [product]);

  // ✅ key for pricing: articleNumber -> fallback itemcode, normalized
  const priceKey = useMemo(() => {
    const raw = (product as any)?.articleNumber ?? itemcode;
    return normalizeKey(raw);
  }, [product, itemcode]);

  // ✅ resolved unit price (fallback base)
  const resolvedUnitPrice = useMemo(() => {
    const base = Number((product as any)?.price ?? 0);
    const resolved =
      typeof getUnitPrice === "function"
        ? Number(getUnitPrice(priceKey) ?? 0)
        : NaN;

    return Number.isFinite(resolved) && resolved > 0 ? resolved : base;
  }, [getUnitPrice, priceKey, product]);

  const payload = useMemo(() => {
    if (!product) return null;
    return {
      productId: itemcode,
      articleNumber: (product as any).articleNumber,
      name: (product as any).name,
      price: Number((product as any).price ?? 0), // ✅ keep base price in cart state
      imageUrl: images[0] ?? undefined,
      outerCartonQty: stepUnits,
    };
  }, [product, stepUnits, itemcode, images]);

  const inc = () => {
    if (!payload) return;
    addItem(payload as any, stepUnits);
  };

  const dec = () => {
    if (!payload) return;
    addItem(payload as any, -stepUnits);
  };

  // ✅ stock values from backend (snake_case) + safe fallbacks
  const availableStock = useMemo(() => {
    if (!product) return 0;
    return toNum(
      (product as any).available_stock ?? (product as any).availableStock
    );
  }, [product]);

  const onOrderQty = useMemo(() => {
    if (!product) return 0;
    return toNum((product as any).on_order ?? (product as any).onOrderQty);
  }, [product]);

  const economicStock = useMemo(() => {
    if (!product) return 0;
    return toNum(
      (product as any).economic_stock ?? (product as any).economicStock
    );
  }, [product]);

  const arrivalDate = useMemo(() => {
    if (!product) return "";
    const raw =
      (product as any).arrival_date ??
      (product as any).expected_date ??
      (product as any).expectedDate;
    return dateOnly(raw);
  }, [product]);

  // ✅ PALLET value
  const palletQty = useMemo(() => {
    if (!product) return "";
    const raw =
      (product as any).PALLET ??
      (product as any).pallet ??
      (product as any).Pallet ??
      (product as any).pallet_qty ??
      (product as any).palletQty;
    return String(raw ?? "").trim();
  }, [product]);

  // ✅ status badge logic
  const stockBadge = useMemo(() => {
    if (availableStock > 0) {
      return {
        text: "In stock",
        variant: "in" as const,
        style: styles.badgeInStock,
      };
    }

    if (onOrderQty > 0 && arrivalDate) {
      return {
        text: `Expected on ${arrivalDate}`,
        variant: "expected" as const,
        style: styles.badgeExpected,
      };
    }

    return {
      text: "Not in stock",
      variant: "out" as const,
      style: styles.badgeOutStock,
    };
  }, [availableStock, onOrderQty, arrivalDate]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorText}>{error}</Text>

        <Pressable
          onPress={() => router.push("/products")}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: BRAND_GREEN, fontWeight: "800" }}>
            ← Back to products
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/products")} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
      </View>

      <View style={styles.carouselWrap}>
        <InlineImageCarousel images={images} />
      </View>

      <Text style={styles.itemCode}>{(product as any).articleNumber}</Text>
      <Text style={styles.description}>{(product as any).name}</Text>

      {/* ✅ show resolved price (per customer) */}
      <Text style={styles.price}>{formatEUR(resolvedUnitPrice)}</Text>

      <View style={styles.qtyRow}>
        <Pressable
          style={[styles.qtyBtn, qtyUnits <= 0 && styles.qtyBtnDisabled]}
          onPress={dec}
          disabled={qtyUnits <= 0}
        >
          <Text style={styles.qtyBtnText}>−</Text>
        </Pressable>

        <View style={styles.qtyValueBox}>
          <Text style={styles.qtyValue}>{qtyUnits}</Text>
          <Text style={styles.qtyHint}>
            outercarton: {stepUnits} • cartons: {cartons}
          </Text>
        </View>

        <Pressable style={styles.qtyBtn} onPress={inc}>
          <Text style={styles.qtyBtnText}>+</Text>
        </Pressable>
      </View>

      {/* ✅ stock status label under -/+ */}
      <View style={styles.badgeRow}>
        <View style={[styles.badgeBase, stockBadge.style]}>
          <Text
            style={[
              styles.badgeText,
              stockBadge.variant === "in" && styles.badgeTextInStock,
              stockBadge.variant === "expected" && styles.badgeTextExpected,
              stockBadge.variant === "out" && styles.badgeTextOutStock,
            ]}
          >
            {stockBadge.text}
          </Text>
        </View>
      </View>

      <ProductAccordion
        itemInformation={{
          unit: (product as any).unit ?? "PCS",
          innerCarton:
            (product as any).innerCartonQty ?? (product as any).innercarton,
          outerCarton:
            (product as any).outerCartonQty ?? (product as any).outercarton,
          // ✅ PALLET under outercarton
          pallet: palletQty || "-",
        }}
        stockInformation={{
          availableStock: availableStock,
          onOrderQty: onOrderQty,
          expectedDate: arrivalDate || undefined,
          economicStock: economicStock,
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { paddingBottom: 24 },

  center: { flex: 1, justifyContent: "center", padding: 16 },
  errorTitle: { fontWeight: "800", marginBottom: 8, fontSize: 16 },
  errorText: { color: "#111827" },

  header: { position: "absolute", top: 8, left: 8, zIndex: 20 },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backText: { fontSize: 20, fontWeight: "800" },

  carouselWrap: { marginTop: 0 },

  itemCode: {
    fontSize: 20,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  description: {
    fontSize: 14,
    color: "#374151",
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  price: {
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  qtyRow: {
    marginTop: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qtyBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnDisabled: { backgroundColor: "#9CA3AF" },
  qtyBtnText: { color: "#fff", fontSize: 22, fontWeight: "800" },
  qtyValueBox: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { fontSize: 18, fontWeight: "800" },
  qtyHint: { fontSize: 11, color: "#6B7280" },

  // badge styles
  badgeRow: {
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  badgeBase: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  badgeInStock: { backgroundColor: "#D1FAE5" },
  badgeExpected: { backgroundColor: "#FFEDD5" },
  badgeOutStock: { backgroundColor: "#FEE2E2" },
  badgeTextInStock: { color: "#166534" },
  badgeTextExpected: { color: "#C2410C" },
  badgeTextOutStock: { color: "#B91C1C" },
});
