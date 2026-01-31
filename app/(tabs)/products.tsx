// app/products.tsx
//
// FULL REPLACEMENT
// - Alleen bij hoofdcategorie "All": direct naar de productlijst (geen subcategories)
// - Back knop vanuit "All" productlijst -> terug naar categories
// - New subcategorieën: All / Spring 2026 / Autumn 2026
// - Overige logica blijft hetzelfde
//
// ✅ Added: prefetchPrices voor zichtbare producten zodat klantprijzen direct zichtbaar zijn
// ✅ Layout: Op mobiel altijd 2 producten naast elkaar (iPad blijft bestaande kolom-logica)
// ✅ Layout: Op mobiel ook categorieën/subcategorieën 2 naast elkaar
//
// ✅ FIXES (belangrijk voor jouw probleem):
// 1) mapped moet WINNEN van raw row (anders overschrijf je categoryId/subcategoryId kapot)
// 2) subcategory filter ondersteunt extraSubcategoryIds (voor dubbel tonen zoals cork + empty-terrariums)

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import CategoryTile from "../../components/products/CategoryTile";
import ProductCard from "../../components/products/ProductCard";
import SubcategoryTile from "../../components/products/SubcategoryTile";
import { getSubcategoryCover } from "../../components/products/covers";
import { getCache, setCache } from "../lib/offlineCache";

import type { Category, Product, Subcategory } from "../../components/products/catalog";
import { mapAfasRowToProduct } from "../../components/products/catalog";

import { useCart } from "../../components/cart";
import { getAllProducts } from "../api/products";

type Step = "categories" | "subcategories" | "products";

function pickItemcode(p: any): string {
  return String(
    p?.itemcode ??
      p?.itemCode ??
      p?.ItemCode ??
      p?.item_code ??
      p?.ARTICLECODE ??
      p?.articleNumber ??
      p?.article_number ??
      p?.id ??
      ""
  ).trim();
}

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export default function ProductsScreen() {
  const { width } = useWindowDimensions();
  const isPhone = width < 768;

  const [step, setStep] = useState<Step>("categories");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [dataBugs, setDataBugs] = useState<string[]>([]);

  const PRODUCTS_CACHE_KEY = "i4s_cache_products_v1";

const [offlineProductsInfo, setOfflineProductsInfo] = useState<{
  savedAt?: string;
} | null>(null);

  // Search (alleen in products step)
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  const { cart, prefetchPrices } = useCart() as any;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (step !== "products") {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [step]);

  const categories: Category[] = useMemo(
    () =>
      [
        { id: "all", name: "All" },

        { id: "new", name: "New" },
        { id: "glass", name: "Glass" },
        { id: "vases", name: "Vases" },
        { id: "pottery", name: "Pottery" },
        { id: "aroma", name: "Aroma" },
        { id: "candles", name: "Candles" },
        { id: "led-candles", name: "LED candles" },
        { id: "gift-box", name: "Gift box" },
        { id: "various", name: "Various" },
        { id: "sale", name: "Sale" },
        { id: "terrarium", name: "Terrarium" },
      ] as Category[],
    []
  );

  const subcategoriesByCategory: Record<string, Subcategory[]> = useMemo(
    () => ({
      all: [{ id: "all", name: "Alle artikelen", categoryId: "all" }],

      new: [
        { id: "all", name: "All New", categoryId: "new" },
        { id: "spring-2026", name: "Spring 2026", categoryId: "new" },
        { id: "autumn-2026", name: "Autumn 2026", categoryId: "new" },
      ],

      glass: [
        { id: "new", name: "New", categoryId: "glass" },
        { id: "all", name: "Alle artikelen", categoryId: "glass" },

        { id: "bell-jar", name: "Bell jar", categoryId: "glass" },
        { id: "lamp-dishes", name: "Lamp & dishes", categoryId: "glass" },

        { id: "with-wood", name: "With wood", categoryId: "glass" },
        { id: "machine-made", name: "Machine made", categoryId: "glass" },

        { id: "with-cement", name: "With cement", categoryId: "glass" },
        { id: "with-hole", name: "With hole", categoryId: "glass" },
        { id: "with-cork", name: "With cork", categoryId: "glass" },

        { id: "glass-mirror-plates", name: "Glass / Mirror plates", categoryId: "glass" },
        { id: "clear-bottles", name: "Clear bottles", categoryId: "glass" },

        { id: "empty-terrariums", name: "Empty terrariums", categoryId: "glass" },
        { id: "various", name: "Various", categoryId: "glass" },
      ],

      vases: [
    { id: "new", name: "New", categoryId: "vases" },
    { id: "all", name: "Alle artikelen", categoryId: "vases" },

    { id: "ceramic", name: "Ceramic", categoryId: "vases" },
    { id: "stoneware", name: "Stoneware", categoryId: "vases" },
    { id: "handmade-heavy-glass", name: "Handmade heavy glass", categoryId: "vases" },
    { id: "machine-made", name: "Machine made", categoryId: "vases" },
  ],
      pottery: [
        { id: "all", name: "Alle artikelen", categoryId: "pottery" },
        { id: "indoor", name: "Indoor", categoryId: "pottery" },
        { id: "outdoor", name: "Outdoor", categoryId: "pottery" },
        { id: "sets", name: "Sets", categoryId: "pottery" },
      ],
      aroma: [
  { id: "all", name: "Alle artikelen", categoryId: "aroma" },
  { id: "accessories", name: "Accessories", categoryId: "aroma" },
  { id: "cubes", name: "Cubes", categoryId: "aroma" },
  { id: "giftbox", name: "Aroma gift box", categoryId: "aroma" },
  { id: "shapes", name: "Shapes", categoryId: "aroma" },
  { id: "bowl", name: "Bowl", categoryId: "aroma" },
  { id: "diffusers", name: "Diffusers", categoryId: "aroma" },
],
      candles: [
  { id: "new", name: "New", categoryId: "candles" },
  { id: "all", name: "Alle artikelen", categoryId: "candles" },
  { id: "candle-holders", name: "Candle holders", categoryId: "candles" },
  { id: "bliss", name: "Bliss dinner", categoryId: "candles" },
  { id: "pearlsand", name: "Pearlsand", categoryId: "candles" },
  { id: "pimped", name: "Pimped", categoryId: "candles" },
  { id: "pencil", name: "Pencil", categoryId: "candles" },
  { id: "taper", name: "Taper", categoryId: "candles" },
  { id: "gold-spray", name: "Dinner gold spray", categoryId: "candles" },
  { id: "dip-dye", name: "Dip Dye", categoryId: "candles" },
  { id: "tree", name: "Tree", categoryId: "candles" },
],

      "led-candles": [
  { id: "new", name: "New", categoryId: "led-candles" },
  { id: "all", name: "Alle artikelen", categoryId: "led-candles" },
  { id: "cannelure", name: "Cannelure", categoryId: "led-candles" },
  { id: "wood", name: "Wood", categoryId: "led-candles" },
  { id: "tracy", name: "Tracy", categoryId: "led-candles" },
  { id: "wax-shape", name: "Wax shape", categoryId: "led-candles" },
  { id: "pillar", name: "Pillar", categoryId: "led-candles" },
  { id: "pencil", name: "Pencil", categoryId: "led-candles" },
  { id: "honeycomb", name: "Honeycomb", categoryId: "led-candles" },
  { id: "dinner", name: "Dinner", categoryId: "led-candles" },
  { id: "floating", name: "Floating", categoryId: "led-candles" },
  { id: "oil-lamp", name: "Oil lamp", categoryId: "led-candles" },
  { id: "chargeable", name: "Chargeable", categoryId: "led-candles" },
  { id: "various", name: "Various", categoryId: "led-candles" },
],

      "gift-box": [{ id: "all", name: "Alle artikelen", categoryId: "gift-box" }],
      various: [
        { id: "all", name: "Alle artikelen", categoryId: "various" },
        { id: "accessories", name: "Accessories", categoryId: "various" },
        { id: "decor", name: "Decor", categoryId: "various" },
        { id: "other", name: "Other", categoryId: "various" },
      ],
      sale: [{ id: "all", name: "Alle artikelen", categoryId: "sale" }],
      terrarium: [{ id: "all", name: "Alle artikelen", categoryId: "terrarium" }],
    }),
    []
  );

  const currentCategory: Category | null = useMemo(() => {
    if (!selectedCategoryId) return null;
    return categories.find((c) => c.id === selectedCategoryId) ?? null;
  }, [categories, selectedCategoryId]);

  const subcategories: Subcategory[] = useMemo(() => {
    if (!selectedCategoryId) return [];
    const list = subcategoriesByCategory[selectedCategoryId] ?? [];
    if (list.length > 0) return list;
    return [{ id: "all", name: "Alle artikelen", categoryId: selectedCategoryId } as Subcategory];
  }, [selectedCategoryId, subcategoriesByCategory]);

  const currentSubcategory: Subcategory | null = useMemo(() => {
    if (!selectedCategoryId || !selectedSubcategoryId) return null;
    return (
      (subcategoriesByCategory[selectedCategoryId] ?? []).find((s) => s.id === selectedSubcategoryId) ?? null
    );
  }, [selectedCategoryId, selectedSubcategoryId, subcategoriesByCategory]);

  useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      setLoading(true);
      setError(null);
      setDataBugs([]);
      setOfflineProductsInfo(null);

      const ok: Product[] = [];
      const bad: string[] = [];

      // 1) Probeer online (API)
      const rows = await getAllProducts();

      for (const r of rows) {
        try {
          const mapped = mapAfasRowToProduct(r as any);

          // ✅ BELANGRIJK: mapped wint, anders raak je categoryId/subcategoryId kwijt
          ok.push({ ...(r as any), ...(mapped as any) } as any);
        } catch {
          bad.push(String((r as any)?.itemcode ?? "?"));
        }
      }

      if (cancelled) return;

      setAllProducts(ok);
      setDataBugs(bad);

      // 2) Sla succesvolle resultaat op in cache
      await setCache(PRODUCTS_CACHE_KEY, { products: ok, dataBugs: bad });

      if (!selectedCategoryId) setSelectedCategoryId("all");
      if (!selectedSubcategoryId) setSelectedSubcategoryId("all");
    } catch (e: any) {
      // 3) Online faalt -> probeer cache
      const cached = await getCache<{ products: Product[]; dataBugs: string[] }>(PRODUCTS_CACHE_KEY);

      if (cancelled) return;

      if (cached?.data?.products?.length) {
        setAllProducts(cached.data.products);
        setDataBugs(Array.isArray(cached.data.dataBugs) ? cached.data.dataBugs : []);
        setOfflineProductsInfo({ savedAt: cached.savedAt });

        if (!selectedCategoryId) setSelectedCategoryId("all");
        if (!selectedSubcategoryId) setSelectedSubcategoryId("all");

        // Geen error tonen als we uit cache kunnen laden
        setError(null);
      } else {
        // Geen cache -> echte error
        setError(e?.message ?? "Failed to load products");
      }
    } finally {
      if (cancelled) return;
      setLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const baseProducts = useMemo(() => {
    if (!selectedCategoryId || !selectedSubcategoryId) return [];

    const byCat =
      selectedCategoryId === "all"
        ? allProducts
        : allProducts.filter((p: any) => p.categoryId === selectedCategoryId);

    if (selectedSubcategoryId === "all") return byCat;

    // ✅ FIX: support "extraSubcategoryIds" (voor dubbel tonen)
    return byCat.filter((p: any) => {
      if (p.subcategoryId === selectedSubcategoryId) return true;
      const extras: string[] = Array.isArray(p.extraSubcategoryIds) ? p.extraSubcategoryIds : [];
      return extras.includes(selectedSubcategoryId);
    });
  }, [allProducts, selectedCategoryId, selectedSubcategoryId]);

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return baseProducts;

    return baseProducts.filter((p: any) => {
      const article = String(p?.articleNumber ?? "").toLowerCase();
      const name = String(p?.name ?? "").toLowerCase();
      const id = String(p?.id ?? "").toLowerCase();
      return article.includes(q) || name.includes(q) || id.includes(q);
    });
  }, [baseProducts, debouncedQuery]);

  // ✅ ADDED: prefetch resolved prices for currently visible product list
  const visibleItemcodesSignature = useMemo(() => {
    const codes = filteredProducts.map((p: any) => pickItemcode(p)).filter(Boolean);
    return `${filteredProducts.length}:${codes.slice(0, 50).join(",")}`;
  }, [filteredProducts]);

  useEffect(() => {
    if (step !== "products") return;

    const customerId = String(cart?.customer?.customerNumber ?? "").trim();
    if (!customerId) return;

    const codes = uniq(filteredProducts.map((p: any) => pickItemcode(p)).filter(Boolean));
    if (!codes.length) return;

    const CHUNK = 250;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const part = codes.slice(i, i + CHUNK);
      prefetchPrices?.(part);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cart?.customer?.customerNumber, visibleItemcodesSignature]);

  const DIRECT_CATEGORIES = new Set(categories.map((c) => c.id));

  const headerTitle =
    step === "categories"
      ? "Lookbooks"
      : step === "subcategories"
        ? currentCategory?.name ?? "Category"
        : "Products";

  const back = () => {
  if (step === "products" || step === "subcategories") {
    setStep("categories");
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    return;
  }
};

  const GRID_GAP = 10;
  const GRID_PADDING = 12;

  // ✅ CHANGE: mobiel 2 kolommen voor categorieën/subcategorieën
  const CATEGORY_COLUMNS = isPhone ? 2 : 4;

  const MIN_PRODUCT_TILE = 74;

  // ✅ Layout: mobiel altijd 2 kolommen; iPad behoudt jouw bestaande logica (5-6)
  const productColumns = useMemo(() => {
    if (isPhone) return 2;

    const usableWidth = width - GRID_PADDING * 2;
    const cols = Math.floor((usableWidth + GRID_GAP) / (MIN_PRODUCT_TILE + GRID_GAP));
    return Math.max(5, Math.min(6, cols));
  }, [width, isPhone]);

  const productKey = (item: any) => String(item?.id ?? item?.articleNumber ?? item?.itemcode ?? Math.random());

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER */}
      <View style={styles.header}>
        {step !== "categories" ? (
          <Pressable onPress={back} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtnPlaceholder} />
        )}

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
        </View>

        <View style={styles.headerRight} />
      </View>

      {/* SEARCH BAR (alleen in products step) */}
      {!loading && !error && step === "products" && (
        <View style={styles.searchBarWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek op artikelnummer of omschrijving…"
            placeholderTextColor="#6B7280"
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>×</Text>
            </Pressable>
          )}
        </View>
      )}

      {loading && (
        <View style={styles.stateWrap}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading products…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: "#B91C1C" }]}>{error}</Text>
        </View>
      )}

    {!loading && !error && offlineProductsInfo?.savedAt && (
  <View style={styles.offlineBanner}>
    <Text style={styles.offlineBannerTitle}>Offline productlijst</Text>
    <Text style={styles.offlineBannerText}>
      Laatste update: {new Date(offlineProductsInfo.savedAt).toLocaleString()}
    </Text>
  </View>
)}

      {!loading && !error && dataBugs.length > 0 && (
        <View style={styles.dataBugBanner}>
          <Text style={styles.dataBugText}>
            ⚠️ {dataBugs.length} producten konden niet gemapt worden (bijv. {dataBugs.slice(0, 5).join(", ")})
          </Text>
        </View>
      )}

      {!loading && !error && step === "categories" && (
        <FlatList
          key={`categories-cols-${CATEGORY_COLUMNS}`}
          contentContainerStyle={[styles.list, { gap: GRID_GAP }]}
          data={categories}
          keyExtractor={(item) => item.id}
          numColumns={CATEGORY_COLUMNS}
          columnWrapperStyle={CATEGORY_COLUMNS > 1 ? { gap: GRID_GAP } : undefined}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <CategoryTile
                item={item}
                onPress={() => {
  setSelectedCategoryId(item.id);

  // ✅ ALTIJD direct naar productlijst (geen subcategorie-scherm)
  setSelectedSubcategoryId("all");
  setStep("products");
}}
              />
            </View>
          )}
        />
      )}

      {!loading && !error && step === "subcategories" && (
        <FlatList
          key={`subcategories-cols-${CATEGORY_COLUMNS}`}
          contentContainerStyle={[styles.list, { gap: GRID_GAP }]}
          data={subcategories}
          keyExtractor={(item) => `${item.categoryId}:${item.id}`}
          numColumns={CATEGORY_COLUMNS}
          columnWrapperStyle={CATEGORY_COLUMNS > 1 ? { gap: GRID_GAP } : undefined}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <SubcategoryTile
                item={{
                  ...item,
                  imageUrl: getSubcategoryCover(item.categoryId, item.id),
                }}
                onPress={() => {
                  setSelectedSubcategoryId(item.id);
                  setStep("products");
                }}
              />
            </View>
          )}
        />
      )}

      {!loading && !error && step === "products" && (
        <FlatList
          key={`products-cols-${productColumns}`}
          contentContainerStyle={[styles.list, { gap: GRID_GAP }]}
          data={filteredProducts}
          keyExtractor={productKey}
          numColumns={productColumns}
          columnWrapperStyle={productColumns > 1 ? { gap: GRID_GAP } : undefined}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ProductCard product={item} />
            </View>
          )}
          ListHeaderComponent={
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.breadcrumb}>
                {debouncedQuery
                  ? `Zoekresultaten voor: "${debouncedQuery}" (${filteredProducts.length})`
                  : `${currentCategory?.name ?? ""} / ${currentSubcategory?.name ?? selectedSubcategoryId ?? ""}`}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f4f6" },

  header: {
    height: 56,
    backgroundColor: "#5b6b5d",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backBtnPlaceholder: { width: 44, height: 44 },
  backTxt: { fontSize: 28, color: "#fff", fontWeight: "800" },

  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700" },
  headerRight: { width: 44, height: 44 },

  searchBarWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    paddingVertical: 0,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  clearBtnText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#374151",
    lineHeight: 18,
    marginTop: -1,
  },

  list: { padding: 12, paddingBottom: 24 },

  breadcrumb: { color: "#111827", fontSize: 12, fontWeight: "800" },

  stateWrap: { padding: 16, alignItems: "center", gap: 10 },
  stateText: { fontSize: 13, color: "#374151", fontWeight: "600" },

  dataBugBanner: {
    margin: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  dataBugText: { color: "#92400E", fontWeight: "800", fontSize: 12 },

  offlineBanner: {
  marginHorizontal: 12,
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  backgroundColor: "#FFEDD5",
  borderWidth: 1,
  borderColor: "#FB923C",
},
offlineBannerTitle: { color: "#9A3412", fontWeight: "900", fontSize: 12 },
offlineBannerText: { color: "#9A3412", fontWeight: "700", fontSize: 12, marginTop: 4 },
});
