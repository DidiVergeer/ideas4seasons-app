// components/products/ProductCard.tsx — FULL REPLACEMENT
import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useCart } from "../cart";

type Props = {
  product?: any;
  item?: any;
};

function pickFirstString(...values: any[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return "";
}

function toNumber(v: any) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.trim().replace(",", "."));
  return NaN;
}

// "2026-07-27T00:00:00.000Z" -> "2026-07-27"
function dateOnly(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
}

type BadgeVariant = "in" | "expected" | "out";

export default function ProductCard(props: Props) {
  const router = useRouter();
  const { cart, addItem, getQty, prefetchPrices, getDisplayPrice } =
    useCart() as any;

  const p = (props.product ?? props.item) as any;

  // ✅ itemcode (moet matchen met backend /prices/resolve keys)
  // Tip: houd deze mapping exact gelijk aan wat jij in de rest van app gebruikt
  const itemcodeRaw = pickFirstString(
    p?.itemcode,
    p?.itemCode,
    p?.ItemCode,
    p?.item_code,
    p?.ARTICLECODE,
    p?.articleNumber,
    p?.article_number,
    p?.id
  );

  const itemcode = String(itemcodeRaw || "").trim();

  // ✅ cartKey = itemcode
  const cartKey = itemcode;
  const qtyUnits = cartKey ? Number(getQty(cartKey) || 0) : 0;

  const stepCandidate = toNumber(
    p?.outerCartonQty ?? p?.outercarton ?? p?.OUTERCARTON ?? p?.outer_carton_qty
  );
  const stepUnits =
    Number.isFinite(stepCandidate) && stepCandidate > 0 ? stepCandidate : 1;

  const canInc = true;
  const canDec = qtyUnits >= stepUnits;

  const basePrice = useMemo(() => {
    const n = toNumber(p?.price ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [p?.price]);

  // ✅ show resolved customer price if available, else base
  const displayPrice = useMemo(() => {
    if (!getDisplayPrice) return basePrice;
    const v = Number(getDisplayPrice(cartKey, basePrice) || 0);
    return Number.isFinite(v) ? v : basePrice;
  }, [getDisplayPrice, cartKey, basePrice]);

  // ✅ when customer selected: prefetch price for this card
  // Belangrijk: reageert op klantwissel + itemcode
  useEffect(() => {
    const customerId = String(cart?.customer?.customerNumber ?? "").trim();
    if (!customerId) return;
    if (!cartKey) return;

    // fetch customer price for this itemcode
    prefetchPrices?.([cartKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.customer?.customerNumber, cartKey]);

  const mainImageUrl: string | undefined =
    p?.image_url ??
    p?.imageUrl ??
    p?.imageURL ??
    p?.imageUrls?.[0] ??
    p?.images?.[0] ??
    undefined;

  const articleNumber = pickFirstString(
    p?.articleNumber,
    p?.article_number,
    p?.itemcode,
    p?.itemCode,
    p?.ItemCode,
    p?.item_code,
    cartKey
  );

  const name = pickFirstString(
    p?.description_eng,
    p?.Description_eng,
    p?.description,
    p?.Description,
    p?.name,
    p?.Name
  );

  // ✅ Stock velden uit /products (snake_case) + fallback camelCase
  const availableStock = toNumber(
    p?.available_stock ?? p?.availableStock ?? p?.stock
  );
  const onOrderQty = toNumber(p?.on_order ?? p?.onOrder ?? p?.onOrderQty);
  const arrivalDate = dateOnly(
    p?.arrival_date ?? p?.arrivalDate ?? p?.expectedDate
  );

  const badge = useMemo(() => {
    const hasStock = Number.isFinite(availableStock) && availableStock > 0;
    const hasIncoming =
      Number.isFinite(onOrderQty) && onOrderQty > 0 && !!arrivalDate;

    if (hasStock) {
      return {
        variant: "in" as BadgeVariant,
        text: "In stock",
        bgStyle: styles.badgeInStock,
        textStyle: styles.badgeTextInStock,
      };
    }

    if (hasIncoming) {
      return {
        variant: "expected" as BadgeVariant,
        text: `Expected on ${arrivalDate}`,
        bgStyle: styles.badgeExpected,
        textStyle: styles.badgeTextExpected,
      };
    }

    return {
      variant: "out" as BadgeVariant,
      text: "Not in stock",
      bgStyle: styles.badgeOutStock,
      textStyle: styles.badgeTextOutStock,
    };
  }, [availableStock, onOrderQty, arrivalDate]);

  const payload = {
    productId: cartKey, // ✅ itemcode key
    articleNumber: cartKey, // ✅ keep consistent
    name,
    price: basePrice, // ✅ store base in cart; UI uses resolved cache
    imageUrl: mainImageUrl,
    outerCartonQty: stepUnits,

    availableStock: Number.isFinite(availableStock) ? availableStock : null,
    onOrder: Number.isFinite(onOrderQty) ? onOrderQty : null,
    arrivalDate: arrivalDate || null,
  };

  const inc = () => addItem(payload as any, stepUnits);
  const dec = () => {
    if (!canDec) return;
    addItem(payload as any, -stepUnits);
  };

  const openDetail = () => {
    if (!itemcode) return;
    router.push(`/product/${encodeURIComponent(itemcode)}`);
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={openDetail}>
        <View style={styles.imageFrame}>
          {mainImageUrl ? (
            <Image
              source={{ uri: mainImageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.article} numberOfLines={1}>
            {articleNumber}
          </Text>

          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>

          <View style={styles.row}>
            <Text style={styles.price}>
              € {Number(displayPrice || 0).toFixed(2)}
            </Text>
            <Text style={styles.carton}>Doos {stepUnits}</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.badgeRow}>
        <View style={[styles.badgeBase, badge.bgStyle]}>
          <Text style={[styles.badgeTextBase, badge.textStyle]}>
            {badge.text}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={dec}
          disabled={!canDec}
          style={[styles.btn, !canDec && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>–</Text>
        </Pressable>

        <Text style={styles.qty}>{qtyUnits}</Text>

        <Pressable
          onPress={inc}
          disabled={!canInc}
          style={[styles.btn, styles.btnPlus, !canInc && styles.btnDisabled]}
        >
          <Text style={[styles.btnText, styles.btnPlusText]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e6e6e6",
  },

  imageFrame: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f2f2f2",
  },

  info: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },

  article: { fontSize: 11, color: "#6b7280" },

  name: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },

  row: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  price: { fontSize: 13, fontWeight: "800", color: "#047857" },
  carton: { fontSize: 11, color: "#6b7280" },

  badgeRow: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 2,
    alignItems: "flex-start",
    backgroundColor: "#fff",
  },
  badgeBase: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  badgeInStock: { backgroundColor: "#D1FAE5" },
  badgeExpected: { backgroundColor: "#FFEDD5" },
  badgeOutStock: { backgroundColor: "#FEE2E2" },

  badgeTextBase: { fontSize: 12, fontWeight: "800" },
  badgeTextInStock: { color: "#065F46" },
  badgeTextExpected: { color: "#9A3412" },
  badgeTextOutStock: { color: "#991B1B" },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6e6e6",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  btn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },

  btnPlus: { backgroundColor: "#A7F3D0" },
  btnDisabled: { opacity: 0.4 },

  btnText: { fontSize: 18, fontWeight: "900", color: "#374151" },
  btnPlusText: { color: "#065F46" },

  qty: {
    minWidth: 30,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },
});
