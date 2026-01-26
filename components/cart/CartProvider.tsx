// components/cart/CartProvider.tsx — FULL REPLACEMENT
// ✅ Agent-scoped storage:
// - Cart wordt opgeslagen per agentId (zodat Renate nooit de cart van A100 ziet)
// - AgentId wordt gelezen uit agent_profile_v1 (en fallback naar "agentId")
//
// ✅ Verder: niets breken; pricing blijft intact.
// ✅ loadCartSnapshot(snapshot) blijft bestaan.

import { resolvePrices, type ResolvedPrice } from "@/app/api/prices";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

export type CartType = "order" | "offerte";

// 🔧 Zet op true tijdens debuggen (later weer false)
const DEBUG_PRICES = true;

export type CartCustomer = {
  customerNumber: string; // ✅ AFAS debiteurnummer
  name: string;
  prijslijstCode?: string;
  address?: {
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
  };
};

export type CartLine = {
  productId: string; // ✅ we treat this as itemcode key
  articleNumber?: string; // ✅ ideally itemcode
  name: string;
  price: number; // ✅ base price
  qty: number;
  imageUrl?: string;

  outerCartonQty?: number;

  stockStatus?: string | null;
  availableStock?: number | null;

  onOrder?: number | null;
  arrivalDate?: string | null;
  economicStock?: number | null;

  isSoldOut?: boolean;
};

export type Cart = {
  type: CartType;
  customer: CartCustomer | null;
  lines: CartLine[];

  reference?: string;
  remark?: string;
  deliveryDate?: string;
  warehouse?: string;
};

type AddItemPayload = {
  productId: string;
  articleNumber?: string;
  name: string;
  price: number;
  imageUrl?: string;

  outerCartonQty?: number;

  stockStatus?: string | null;
  availableStock?: number | null;

  onOrder?: number | null;
  arrivalDate?: string | null;
  economicStock?: number | null;

  isSoldOut?: boolean;
};

type CartAction =
  | { type: "HYDRATE"; payload: Cart }
  | { type: "SET_TYPE"; payload: CartType }
  | { type: "SET_CUSTOMER"; payload: CartCustomer | null }
  | { type: "SET_REFERENCE"; payload: string }
  | { type: "SET_REMARK"; payload: string }
  | { type: "SET_DELIVERY_DATE"; payload: string }
  | { type: "SET_WAREHOUSE"; payload: string }
  | { type: "ADD_ITEM"; payload: AddItemPayload; delta: number }
  | { type: "REMOVE_ITEM"; payload: { productId: string } }
  | { type: "CLEAR_LINES" }
  | { type: "RESET" };

const CART_KEY_BASE = "i4s_cart_v1";
const AGENT_PROFILE_KEY = "agent_profile_v1";
const AGENT_ID_FALLBACK_KEY = "agentId";

const initialCart: Cart = {
  type: "order",
  customer: null,
  lines: [],
  reference: "",
  remark: "",
  deliveryDate: "",
  warehouse: "01",
};

function toNumber(v: any): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.trim().replace(",", "."));
  return NaN;
}

function pickLineKey(l: any): string {
  return String(l?.articleNumber ?? l?.productId ?? "").trim();
}

function uniqStrings(arr: unknown[]): string[] {
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

function pickCustomerId(c: CartCustomer | null): string {
  return String(c?.customerNumber ?? "").trim();
}

function pickPrijslijstCode(c: CartCustomer | null): string {
  return String(
    (c as any)?.prijslijstCode ?? (c as any)?.voorkeur_prijslijst ?? ""
  ).trim();
}

async function getActiveAgentId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(AGENT_PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const id = String(p?.agentId ?? "").trim();
      if (id) return id;
    }
  } catch {}
  try {
    const v = await AsyncStorage.getItem(AGENT_ID_FALLBACK_KEY);
    return String(v ?? "").trim();
  } catch {
    return "";
  }
}

function cartStorageKey(agentId: string): string {
  const id = String(agentId ?? "").trim();
  return id ? `${CART_KEY_BASE}_${id}` : CART_KEY_BASE;
}

function reducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;

    case "SET_TYPE":
      return { ...state, type: action.payload };

    case "SET_CUSTOMER":
      return { ...state, customer: action.payload };

    case "SET_REFERENCE":
      return { ...state, reference: String(action.payload ?? "") };

    case "SET_REMARK":
      return { ...state, remark: String(action.payload ?? "") };

    case "SET_DELIVERY_DATE":
      return { ...state, deliveryDate: String(action.payload ?? "") };

    case "SET_WAREHOUSE":
      return { ...state, warehouse: String(action.payload ?? "") };

    case "ADD_ITEM": {
      const {
        productId,
        name,
        price,
        articleNumber,
        imageUrl,
        outerCartonQty,
        stockStatus,
        availableStock,
        onOrder,
        arrivalDate,
        economicStock,
        isSoldOut,
      } = action.payload;

      const delta = action.delta;
      if (!productId) return state;

      const existing = state.lines.find((l) => l.productId === productId);
      if (!existing && delta <= 0) return state;

      const step = toNumber(outerCartonQty);
      const hasStep = Number.isFinite(step) && step > 0;

      if (existing) {
        const newQty = (Number(existing.qty) || 0) + delta;

        if (newQty <= 0) {
          return {
            ...state,
            lines: state.lines.filter((l) => l.productId !== productId),
          };
        }

        return {
          ...state,
          lines: state.lines.map((l) => {
            if (l.productId !== productId) return l;
            return {
              ...l,
              qty: newQty,
              outerCartonQty: hasStep ? step : l.outerCartonQty,
              name: name ?? l.name,
              price: Number.isFinite(Number(price)) ? Number(price) : l.price,
              articleNumber: articleNumber ?? l.articleNumber,
              imageUrl: imageUrl ?? l.imageUrl,
              stockStatus:
                stockStatus !== undefined ? stockStatus : l.stockStatus,
              availableStock:
                availableStock !== undefined
                  ? availableStock
                  : l.availableStock,
              onOrder: onOrder !== undefined ? onOrder : l.onOrder,
              arrivalDate:
                arrivalDate !== undefined ? arrivalDate : l.arrivalDate,
              economicStock:
                economicStock !== undefined ? economicStock : l.economicStock,
              isSoldOut: isSoldOut !== undefined ? isSoldOut : l.isSoldOut,
            };
          }),
        };
      }

      return {
        ...state,
        lines: [
          ...state.lines,
          {
            productId,
            articleNumber,
            name,
            price: Number(price ?? 0),
            imageUrl,
            qty: Math.max(1, delta),
            outerCartonQty: hasStep ? step : undefined,

            stockStatus: stockStatus ?? null,
            availableStock: availableStock ?? null,

            onOrder: onOrder ?? null,
            arrivalDate: arrivalDate ?? null,
            economicStock: economicStock ?? null,

            isSoldOut: isSoldOut ?? false,
          },
        ],
      };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        lines: state.lines.filter(
          (l) => l.productId !== action.payload.productId
        ),
      };

    case "CLEAR_LINES":
      return { ...state, lines: [] };

    case "RESET":
      return initialCart;

    default:
      return state;
  }
}

type CartContextValue = {
  cart: Cart;
  hydrated: boolean;

  setType: (type: CartType) => void;
  setCustomer: (customer: CartCustomer | null) => void;

  setReference: (v: string) => void;
  setRemark: (v: string) => void;
  setDeliveryDate: (v: string) => void;
  setWarehouse: (v: string) => void;

  addItem: (item: AddItemPayload, delta?: number) => void;
  removeItem: (productId: string) => void;

  clearCart: (mode?: "lines" | "all") => void;
  clearLines: () => void;
  resetCart: () => void;

  loadCartSnapshot: (snapshot: Cart) => void;

  getQty: (itemcode: string) => number;

  resolvedPricesByItemcode: Record<string, ResolvedPrice>;
  getUnitPrice: (itemcode: string) => number;
  getDisplayPrice: (itemcode: string, basePrice?: number) => number;
  prefetchPrices: (
    itemcodes: string[],
    opts?: { force?: boolean }
  ) => Promise<void>;

  totalQty: number;
  totalAmount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function safeCart(parsed: any): Cart {
  const type: CartType = parsed?.type === "offerte" ? "offerte" : "order";

  const customer: CartCustomer | null =
    parsed?.customer && typeof parsed.customer === "object"
      ? {
          customerNumber: String(parsed.customer.customerNumber ?? ""),
          name: String(parsed.customer.name ?? ""),
          prijslijstCode: parsed.customer.prijslijstCode
            ? String(parsed.customer.prijslijstCode)
            : undefined,
          address: parsed.customer.address ?? undefined,
        }
      : null;

  const lines: CartLine[] = Array.isArray(parsed?.lines)
    ? (parsed.lines
        .map((l: any) => {
          const productId = String(l?.productId ?? "").trim();
          if (!productId) return null;

          const step = toNumber(
            l?.outerCartonQty ??
              l?.outercarton ??
              l?.OUTERCARTON ??
              l?.outer_carton_qty
          );
          const outerCartonQty =
            Number.isFinite(step) && step > 0 ? step : undefined;

          const stockStatus = l?.stockStatus ?? l?.stock_status ?? null;

          const availableStockRaw =
            l?.availableStock ?? l?.available_stock ?? l?.stock;
          const availableStock = Number.isFinite(toNumber(availableStockRaw))
            ? toNumber(availableStockRaw)
            : null;

          const onOrderRaw = l?.onOrder ?? l?.on_order ?? l?.onOrderQty;
          const onOrder = Number.isFinite(toNumber(onOrderRaw))
            ? toNumber(onOrderRaw)
            : null;

          const arrivalDate =
            l?.arrivalDate ??
            l?.arrival_date ??
            l?.expectedDate ??
            l?.expected_date ??
            null;

          const econRaw = l?.economicStock ?? l?.economic_stock;
          const economicStock = Number.isFinite(toNumber(econRaw))
            ? toNumber(econRaw)
            : null;

          const isSoldOut =
            typeof l?.isSoldOut === "boolean"
              ? l.isSoldOut
              : typeof l?.is_sold_out === "boolean"
              ? l.is_sold_out
              : undefined;

          return {
            productId,
            articleNumber: l.articleNumber ? String(l.articleNumber) : undefined,
            name: String(l.name ?? ""),
            price: Number(l.price ?? 0),
            qty: Number(l.qty ?? 0),
            imageUrl: l.imageUrl ? String(l.imageUrl) : undefined,
            outerCartonQty,

            stockStatus,
            availableStock,

            onOrder,
            arrivalDate: arrivalDate ? String(arrivalDate) : null,
            economicStock,

            isSoldOut: isSoldOut ?? false,
          } as CartLine;
        })
        .filter(Boolean) as CartLine[])
    : [];

  const reference = String(parsed?.reference ?? "");
  const remark = String(parsed?.remark ?? "");
  const deliveryDate = String(parsed?.deliveryDate ?? "");
  const warehouse = String(parsed?.warehouse ?? "01");

  return { type, customer, lines, reference, remark, deliveryDate, warehouse };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, dispatch] = useReducer(reducer, initialCart);
  const [hydrated, setHydrated] = useState(false);

  const [resolvedPricesByItemcode, setResolvedPricesByItemcode] = useState<
    Record<string, ResolvedPrice>
  >({});

  const resolvedRef = useRef<Record<string, ResolvedPrice>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const customerIdRef = useRef<string>("");

  // ✅ NEW: keep active agentId in memory for storage key
  const agentIdRef = useRef<string>("");
  const storageKeyRef = useRef<string>(CART_KEY_BASE);

  useEffect(() => {
    resolvedRef.current = resolvedPricesByItemcode || {};
  }, [resolvedPricesByItemcode]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const agentId = await getActiveAgentId();
        agentIdRef.current = agentId;
        storageKeyRef.current = cartStorageKey(agentId);

        const raw = await AsyncStorage.getItem(storageKeyRef.current);
        if (!raw) {
          if (mounted) setHydrated(true);
          return;
        }
        const parsed = JSON.parse(raw);
        const safe = safeCart(parsed);
        if (mounted) dispatch({ type: "HYDRATE", payload: safe });
      } catch {
        // ignore
      } finally {
        if (mounted) setHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        // ✅ Always re-check agentId quickly (covers switching accounts without full reload)
        const agentId = await getActiveAgentId();
        const key = cartStorageKey(agentId);
        storageKeyRef.current = key;

        await AsyncStorage.setItem(key, JSON.stringify(cart));
      } catch {
        // ignore
      }
    })();
  }, [cart, hydrated]);

  const lineIdsSignature = useMemo(() => {
    return (cart.lines || [])
      .map((l) => pickLineKey(l))
      .filter(Boolean)
      .sort()
      .join("|");
  }, [cart.lines]);

  const prefetchPrices = async (
    itemcodes: string[],
    opts?: { force?: boolean }
  ) => {
    const customerId = pickCustomerId(cart.customer);
    const bodyPrijslijstCode = pickPrijslijstCode(cart.customer);

    if (!customerId) {
      if (DEBUG_PRICES) {
        console.log("PREFETCH SKIP: no customerId", {
          customer: cart.customer,
        });
      }
      return;
    }

    const clean = uniqStrings(itemcodes);
    if (!clean.length) {
      if (DEBUG_PRICES) console.log("PREFETCH SKIP: no itemcodes");
      return;
    }

    const force = Boolean(opts?.force);

    const cache = resolvedRef.current || {};
    const needed = clean.filter((code) => {
      if (!force && cache?.[code]) return false;
      if (inFlightRef.current.has(code)) return false;
      return true;
    });

    if (!needed.length) {
      if (DEBUG_PRICES) {
        console.log("PREFETCH SKIP: needed empty", {
          customerId,
          cleanCount: clean.length,
          force,
          cachedCount: Object.keys(cache || {}).length,
          inflightCount: inFlightRef.current.size,
        });
      }
      return;
    }

    if (DEBUG_PRICES) {
      console.log("RESOLVE IN:", {
        customerId,
        itemcodes: needed,
        bodyPrijslijstCode,
      });
    }

    needed.forEach((c) => inFlightRef.current.add(c));

    try {
      const r = await resolvePrices(customerId, needed);

      if (DEBUG_PRICES) {
        console.log("RESOLVE OUT:", {
          ok: r?.ok,
          customerId,
          count: r?.prices ? Object.keys(r.prices).length : 0,
          sample: r?.prices
            ? (() => {
                const k = Object.keys(r.prices)[0];
                return k ? { [k]: r.prices[k] } : null;
              })()
            : null,
          error: (r as any)?.error,
        });
      }

      if (r?.ok && r.prices) {
        setResolvedPricesByItemcode((prev) => ({
          ...(prev || {}),
          ...r.prices,
        }));
      }
    } catch (e) {
      if (DEBUG_PRICES) {
        console.log("RESOLVE ERROR:", String((e as any)?.message ?? e), {
          customerId,
          neededCount: needed.length,
        });
      }
    } finally {
      needed.forEach((c) => inFlightRef.current.delete(c));
    }
  };

  useEffect(() => {
    if (!hydrated) return;

    const customerId = pickCustomerId(cart.customer);
    const prev = customerIdRef.current;
    const changed = prev !== customerId;
    customerIdRef.current = customerId;

    if (!customerId) {
      if (DEBUG_PRICES) console.log("CUSTOMER CLEARED: wipe price cache");
      setResolvedPricesByItemcode({});
      resolvedRef.current = {};
      inFlightRef.current.clear();
      return;
    }

    if (changed) {
      if (DEBUG_PRICES) {
        console.log("CUSTOMER CHANGED:", { prev, next: customerId }, "-> wipe cache");
      }
      setResolvedPricesByItemcode({});
      resolvedRef.current = {};
      inFlightRef.current.clear();
    }

    const ids = uniqStrings((cart.lines || []).map((l) => pickLineKey(l)));
    if (DEBUG_PRICES) {
      console.log("CART IDS:", { customerId, idsCount: ids.length, changed });
    }

    if (ids.length) {
      prefetchPrices(ids, { force: changed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cart.customer?.customerNumber, lineIdsSignature]);

  const value = useMemo<CartContextValue>(() => {
    const getQty = (itemcode: string) => {
      const key = String(itemcode ?? "").trim();
      if (!key) return 0;
      return cart.lines.find((l) => pickLineKey(l) === key)?.qty ?? 0;
    };

    const getUnitPrice = (itemcode: string) => {
      const key = String(itemcode ?? "").trim();
      if (!key) return 0;

      const base = cart.lines.find((l) => pickLineKey(l) === key)?.price ?? 0;
      const rp = resolvedPricesByItemcode?.[key]?.price;
      return typeof rp === "number" && Number.isFinite(rp) ? rp : base;
    };

    const getDisplayPrice = (itemcode: string, basePrice: number = 0) => {
      const key = String(itemcode ?? "").trim();
      if (!key) return basePrice || 0;

      const rp = resolvedPricesByItemcode?.[key]?.price;
      return typeof rp === "number" && Number.isFinite(rp) ? rp : basePrice || 0;
    };

    const totalQty = cart.lines.reduce((sum, l) => sum + (l.qty ?? 0), 0);

    const totalAmount = cart.lines.reduce((sum, l) => {
      const key = pickLineKey(l);
      const unit = getUnitPrice(key);
      return sum + (l.qty ?? 0) * (unit ?? 0);
    }, 0);

    const clearCart = (mode: "lines" | "all" = "lines") => {
      if (mode === "all") dispatch({ type: "RESET" });
      else dispatch({ type: "CLEAR_LINES" });
    };

    const loadCartSnapshot = (snapshot: Cart) => {
      const safe = safeCart(snapshot);
      dispatch({ type: "HYDRATE", payload: safe });
    };

    return {
      cart,
      hydrated,

      setType: (type) => dispatch({ type: "SET_TYPE", payload: type }),
      setCustomer: (customer) => dispatch({ type: "SET_CUSTOMER", payload: customer }),

      setReference: (v) => dispatch({ type: "SET_REFERENCE", payload: v }),
      setRemark: (v) => dispatch({ type: "SET_REMARK", payload: v }),
      setDeliveryDate: (v) => dispatch({ type: "SET_DELIVERY_DATE", payload: v }),
      setWarehouse: (v) => dispatch({ type: "SET_WAREHOUSE", payload: v }),

      addItem: (item, delta = 1) => dispatch({ type: "ADD_ITEM", payload: item, delta }),
      removeItem: (productId) => dispatch({ type: "REMOVE_ITEM", payload: { productId } }),

      clearCart,
      clearLines: () => dispatch({ type: "CLEAR_LINES" }),
      resetCart: () => dispatch({ type: "RESET" }),

      loadCartSnapshot,

      getQty,

      resolvedPricesByItemcode,
      getUnitPrice,
      getDisplayPrice,
      prefetchPrices,

      totalQty,
      totalAmount,
    };
  }, [cart, hydrated, resolvedPricesByItemcode]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
