// app/(tabs)/cart.tsx
// FULL REPLACEMENT
// ✅ Alleen aangepast wat nodig is zodat:
// - “Order opslaan” werkt zonder errors
// - openSaved via params werkt (order openen vanuit Settings)
// - geen undefined functies meer (clearCart / loadCartSnapshot)
// - rest van layout/UX blijft hetzelfde

import { useCart } from "@/components/cart";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

/* =========================================================
   ✅ NEW: API helpers (inline, zodat je geen extra file nodig hebt)
   - gebruikt EXPO_PUBLIC_API_BASE_URL + EXPO_PUBLIC_SETUP_KEY
   - post naar /quotes/send of /orders/send
   ========================================================= */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const SETUP_KEY = process.env.EXPO_PUBLIC_SETUP_KEY;

function withKey(url: string) {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}key=${encodeURIComponent(String(SETUP_KEY || ""))}`;
}

async function postJson<T>(path: string, body: any): Promise<T> {
  if (!API_BASE) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
  if (!SETUP_KEY) throw new Error("Missing EXPO_PUBLIC_SETUP_KEY");

  const base = String(API_BASE).replace(/\/$/, "");
  const url = withKey(`${base}${path}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-setup-key": String(SETUP_KEY),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

type SendLine = { itemcode: string; qty: number; price?: number | null };
type SendPayload = {
  customerId: string;
  reference?: string;
  remark?: string;
  warehouse?: string;
  deliveryDate?: string;
  lines: SendLine[];
};

type SendResponse = {
  ok: boolean;
  requestId?: string;
  usedWarehouseField?: string;
  afas?: any;
  error?: string;
  afasStatus?: number;
  afasBody?: string;
  afasUrl?: string;
};

async function sendQuote(payload: SendPayload) {
  return postJson<SendResponse>("/quotes/send", payload);
}
async function sendOrder(payload: SendPayload) {
  return postJson<SendResponse>("/orders/send", payload);
}

const LS_SAVED_ORDERS = "i4s_saved_orders_v1";
const LS_SENT_ORDERS = "i4s_sent_orders_v1";

type SentOrderLog = {
  id: string; // unique key (requestId of local fallback)
  sentAt: string; // ISO datetime
  type: "order" | "offerte";
  customerNumber: string;
  customerName: string;
  deliveryDate?: string;
  totalAmount: number;
  requestId?: string;
  afasNumber?: string;
};

async function getSentOrders(): Promise<SentOrderLog[]> {
  try {
    const raw = await AsyncStorage.getItem(LS_SENT_ORDERS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function setSentOrders(list: SentOrderLog[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LS_SENT_ORDERS, JSON.stringify(list));
  } catch {}
}

async function appendSentOrderLog(entry: SentOrderLog): Promise<void> {
  const list = await getSentOrders();

  // ✅ voorkom dubbele logs (bij dubbel klikken / retries)
  const key = String(entry.id || "").trim();
  const exists = list.some((x) => String(x.id) === key);
  if (exists) return;

  await setSentOrders([entry, ...list]);
}


type SavedOrder = {
  id: string;
  createdAt: string; // ISO
  cart: any; // snapshot van CartProvider.Cart (of subset)
  totalQty: number;
  totalAmount: number;
};

async function getSavedOrders(): Promise<SavedOrder[]> {
  try {
    const raw = await AsyncStorage.getItem(LS_SAVED_ORDERS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function setSavedOrders(list: SavedOrder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LS_SAVED_ORDERS, JSON.stringify(list));
  } catch {}
}

function uuid(): string {
  // voldoende voor local id
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ========================================================= */

const COLORS = {
  header: "#60715f",
  button: "#85c14c",
  footer: "#839384",
  text: "#3a3939",
  bg: "#F5F6F7",
  border: "#E5E7EB",
  white: "#FFFFFF",
  danger: "#B91C1C",
};

function formatEUR(n: number) {
  return `EUR ${Number(n || 0).toFixed(2)}`;
}

function toNumber(v: any) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.trim().replace(",", "."));
  return NaN;
}

// ✅ normalize itemcode (trim + optionally strip leading "I")
function normalizeKey(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.startsWith("I") ? s.slice(1) : s;
}

// "2026-07-27T00:00:00.000Z" -> "2026-07-27"
function dateOnly(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ")) return s.split(" ")[0];
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function getStepUnitsFromLine(line: any): number {
  const raw =
    line?.outerCartonQty ??
    line?.outercarton ??
    line?.OUTERCARTON ??
    line?.outer_carton_qty;

  const n = toNumber(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** ✅ Stock badge rules: In stock > Expected > Not in stock */
function getStockBadge(line: any) {
  const available =
    Number(line?.availableStock ?? line?.available_stock ?? line?.stock ?? 0) ||
    0;
  const onOrder =
    Number(line?.onOrder ?? line?.on_order ?? line?.onOrderQty ?? 0) || 0;
  const arrival = dateOnly(
    line?.arrivalDate ??
      line?.arrival_date ??
      line?.expectedDate ??
      line?.expected_date
  );

  if (available > 0) return { text: "In stock", bg: "#D1FAE5", fg: "#065F46" };
  if (available <= 0 && onOrder > 0 && arrival) {
    return { text: `Expected on ${arrival}`, bg: "#FFEDD5", fg: "#9A3412" };
  }
  return { text: "Not in stock", bg: "#FEE2E2", fg: "#991B1B" };
}

/* ----------------- Fake date picker helpers ----------------- */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYMD(ymd: string): Date | null {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, dd] = s.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, dd);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== dd)
    return null;
  return dt;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Monday = 0 ... Sunday = 6
function mondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

function monthTitleShort(d: Date) {
  const months = [
    "Jan",
    "Feb",
    "Mrt",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function CartScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isPhone = width < 768;

  // ✅ FIX: useLocalSearchParams maar 1x correct gebruiken
  const params = useLocalSearchParams<{
    type?: string | string[];
    openSaved?: string | string[];
  }>();

  const paramType = Array.isArray(params?.type) ? params.type[0] : params?.type;
  const openSavedId = Array.isArray(params?.openSaved)
    ? params.openSaved[0]
    : params?.openSaved;

  // ✅ getUnitPrice comes from CartProvider (resolved > base)
  // ✅ FIX: ook clearCart/loadCartSnapshot destructuren zodat TS niet faalt
  const {
    cart,
    setType,
    addItem,
    getUnitPrice,
    clearLines,
    clearCart, // kan bestaan of niet; we checken met optional chaining
    loadCartSnapshot, // kan bestaan of niet; we checken met optional chaining
  } = useCart() as any;

  const appliedInitialParam = useRef(false);

  // ✅ Referentie panel (toggle)
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  // ✅ Delivery date (fake picker)
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  // ✅ NEW: send state + result modal
  const [sending, setSending] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultTitle, setResultTitle] = useState("");
  const [resultBody, setResultBody] = useState("");

  useEffect(() => {
    if (appliedInitialParam.current) return;

    if (paramType === "order" || paramType === "offerte") {
      setType?.(paramType);
    }

    appliedInitialParam.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramType]);

  // ✅ FIX: openSaved laden + PAS NA succes verwijderen uit LS_SAVED_ORDERS
  useEffect(() => {
    if (!openSavedId) return;

    (async () => {
      const id = String(openSavedId || "").trim();
      if (!id) return;

      const list = await getSavedOrders();
      const found = list.find((o) => o.id === id);

      if (!found) {
        setResultTitle("Niet gevonden");
        setResultBody("Deze opgeslagen order bestaat niet (meer).");
        setResultOpen(true);
        // @ts-ignore
        router.setParams?.({ openSaved: undefined });
        return;
      }

      if (typeof loadCartSnapshot !== "function") {
        setResultTitle("Kan order niet openen");
        setResultBody(
          "loadCartSnapshot bestaat niet in CartProvider. Voeg die functie toe of geef aan hoe we een cart snapshot moeten herstellen."
        );
        setResultOpen(true);
        // @ts-ignore
        router.setParams?.({ openSaved: undefined });
        return;
      }

      try {
        // ✅ 1) eerst laden
        await Promise.resolve(loadCartSnapshot(found.cart));

        // ✅ 2) pas daarna verwijderen (nooit dubbel)
        const next = list.filter((x) => x.id !== id);
        await setSavedOrders(next);

        setResultTitle("Order geopend");
        setResultBody("De order staat nu weer in de winkelwagen.");
        setResultOpen(true);
      } catch (e: any) {
        setResultTitle("Openen mislukt");
        setResultBody(String(e?.message || e));
        setResultOpen(true);
      } finally {
        // @ts-ignore
        router.setParams?.({ openSaved: undefined });
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSavedId]);


  const customerName = cart.customer?.name ?? "Geen klant geselecteerd";
  const customerSub = cart.customer?.customerNumber
    ? `Klantnr: ${cart.customer.customerNumber}`
    : "Selecteer eerst een klant";

  const totals = useMemo(() => {
    const lines = Array.isArray(cart.lines) ? cart.lines : [];

    const totalQty = lines.reduce(
      (sum: number, l: any) => sum + (Number(l.qty) || 0),
      0
    );

    const totalAmount = lines.reduce((sum: number, l: any) => {
      const qty = Number(l.qty) || 0;
      const key = normalizeKey(l.articleNumber ?? l.productId);
      const unit =
        typeof getUnitPrice === "function"
          ? Number(getUnitPrice(key) ?? 0)
          : Number(l.price ?? 0);

      return sum + qty * (Number.isFinite(unit) ? unit : 0);
    }, 0);

    return { totalQty, totalAmount };
  }, [cart.lines, getUnitPrice]);

  const canSend = !!cart.customer && (cart.lines?.length ?? 0) > 0;

  const switchType = (t: "order" | "offerte") => {
    setType?.(t);
    // @ts-ignore
    router.setParams?.({ type: t });
  };

  // ✅ preserve stock fields bij +/- en remove
  const buildLinePayload = (line: any, step?: number) => ({
    productId: line.productId,
    articleNumber: line.articleNumber ?? line.productId,
    name: line.name,
    price: Number(line.price ?? 0), // base price
    imageUrl: line.imageUrl,
    outerCartonQty: step,

    stockStatus: line.stockStatus ?? line.stock_status ?? null,
    availableStock: line.availableStock ?? line.available_stock ?? null,
    isSoldOut: line.isSoldOut ?? null,

    onOrder: line.onOrder ?? line.on_order ?? null,
    arrivalDate: line.arrivalDate ?? line.arrival_date ?? null,
    economicStock: line.economicStock ?? line.economic_stock ?? null,
  });

  const incLine = (line: any) => {
    const step = getStepUnitsFromLine(line);
    if (!Number.isFinite(step)) return;
    addItem(buildLinePayload(line, step), +step);
  };

  const decLine = (line: any) => {
    const step = getStepUnitsFromLine(line);
    if (!Number.isFinite(step)) return;
    const qty = Number(line.qty ?? 0);
    if (qty < step) return;
    addItem(buildLinePayload(line, step), -step);
  };

  const removeLine = (line: any) => {
    const qty = Number(line.qty ?? 0);
    if (qty <= 0) return;
    addItem(buildLinePayload(line), -qty);
  };

  const openDatePicker = () => {
    const base = deliveryDate ? parseYMD(deliveryDate) : null;
    const start = base ?? new Date();
    setViewMonthDate(startOfMonth(start));
    if (!deliveryDate) setDeliveryDate(toYMD(new Date())); // default today
    setDatePickerOpen(true);
  };

  const goPrevMonth = () => {
    setViewMonthDate((d) =>
      startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    );
  };

  const goNextMonth = () => {
    setViewMonthDate((d) =>
      startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    );
  };

  const selectDay = (day: number) => {
    const d = new Date(
      viewMonthDate.getFullYear(),
      viewMonthDate.getMonth(),
      day
    );
    setDeliveryDate(toYMD(d));
    setDatePickerOpen(false);
  };

  const renderCalendarGrid = () => {
    const first = startOfMonth(viewMonthDate);
    const dim = daysInMonth(viewMonthDate);
    const offset = mondayIndex(first.getDay());
    const totalCells = Math.ceil((offset + dim) / 7) * 7;

    const cells = Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - offset + 1;
      return dayNum >= 1 && dayNum <= dim ? dayNum : null;
    });

    const selected = deliveryDate ? parseYMD(deliveryDate) : null;
    const isSameMonthSelected =
      selected &&
      selected.getFullYear() === viewMonthDate.getFullYear() &&
      selected.getMonth() === viewMonthDate.getMonth();
    const selD = selected?.getDate();

    return (
      <View>
        <View style={styles.calendarWeekHeaderSmall}>
          {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((w) => (
            <Text key={w} style={styles.calendarWeekLabelSmall}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGridSmall}>
          {cells.map((day, idx) => {
            const isSelected = !!day && isSameMonthSelected && selD === day;
            return (
              <Pressable
                key={idx}
                disabled={!day}
                onPress={() => day && selectDay(day)}
                style={[
                  styles.calendarCellSmall,
                  !day && { opacity: 0.0 },
                  isSelected && styles.calendarCellSmallSelected,
                ]}
              >
                {!!day && (
                  <Text
                    style={[
                      styles.calendarCellTextSmall,
                      isSelected && styles.calendarCellTextSmallSelected,
                    ]}
                  >
                    {day}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const showKlantWijzigen = !!cart.customer;

  /* =========================================================
     ✅ NEW: build payload + send
     ========================================================= */

  function getCustomerId(): string {
    // verwacht: cart.customer.customerNumber
    const v = cart?.customer?.customerNumber ?? cart?.customer?.id ?? "";
    return String(v || "").trim();
  }

  function buildSendLines(): SendLine[] {
    const lines = Array.isArray(cart.lines) ? cart.lines : [];
    return lines
      .map((l: any) => {
        const itemcode = normalizeKey(l.articleNumber ?? l.productId);
        const qty = Number(l.qty ?? 0);
        const unit =
          typeof getUnitPrice === "function"
            ? Number(getUnitPrice(itemcode) ?? 0)
            : Number(l.price ?? 0);

        const price = Number.isFinite(unit) ? unit : null;

        return { itemcode, qty, price };
      })
      .filter(
        (l: SendLine) => !!l.itemcode && Number.isFinite(l.qty) && l.qty > 0
      );
  }

  async function handleSend() {
    if (!canSend) return;

    const customerId = getCustomerId();
    if (!customerId) {
      setResultTitle("Geen klantnummer");
      setResultBody("Deze klant heeft geen debiteurnummer (customerNumber).");
      setResultOpen(true);
      return;
    }

    const lines = buildSendLines();
    if (!lines.length) {
      setResultTitle("Geen regels");
      setResultBody("Er zijn geen geldige orderregels (qty/itemcode).");
      setResultOpen(true);
      return;
    }

    // Warehouse: default 01 (zoals backend ook doet)
    const warehouse = "01";

    const dd = String(deliveryDate || "").trim();

    if (cart.type === "order" && !dd) {
      setResultTitle("Leverdatum ontbreekt");
      setResultBody("Kies een leverdatum voordat je een order verstuurt.");
      setResultOpen(true);
      return;
    }

    const payload: SendPayload = {
      customerId,
      reference: String(reference || "").trim() || undefined,
      remark: String(note || "").trim() || undefined,
      deliveryDate: dd || undefined,
      warehouse,
      lines,
    };

    setSending(true);
    try {
      const resp =
        cart.type === "order"
          ? await sendOrder(payload)
          : await sendQuote(payload);

      if (resp?.ok) {
  const requestId = String(resp?.requestId ?? "").trim();

  // klantinfo uit cart
  const customerNumber = String(cart?.customer?.customerNumber ?? customerId).trim();
  const customerNameLog = String(cart?.customer?.name ?? "").trim() || "—";

  // probeer AFAS nummer te pakken als backend ooit iets teruggeeft
  const afasNumber =
    String(
      resp?.afas?.orderNumber ??
        resp?.afas?.offerteNumber ??
        resp?.afas?.nummer ??
        resp?.afas?.Ordernummer ??
        resp?.afas?.Offertenummer ??
        ""
    ).trim() || undefined;

  const logId = requestId || `local-${Date.now()}`;

  // ✅ 1) Result modal
  setResultTitle(cart.type === "order" ? "Order verzonden" : "Offerte verzonden");
  setResultBody(
    [
      `RequestId: ${requestId || "-"}`,
      `AFAS nr: ${afasNumber || "-"}`,
      "",
      "AFAS heeft de aanvraag geaccepteerd.",
    ].join("\n")
  );
  setResultOpen(true);

  // ✅ 2) log voor Settings → Verzonden orders
  await appendSentOrderLog({
    id: logId,
    sentAt: new Date().toISOString(),
    type: cart.type === "order" ? "order" : "offerte",
    customerNumber,
    customerName: customerNameLog,
    deliveryDate: dd || undefined,
    totalAmount: totals.totalAmount,
    requestId: requestId || undefined,
    afasNumber,
  });

  // ✅ 3) leegmaken na succes
  clearLines?.();
  setReference("");
  setNote("");
  setDeliveryDate("");
  setReferenceOpen(false);

  return;
}


      // fallback (zou normaal niet gebeuren omdat backend ok=true returned)
      setResultTitle("Niet gelukt");
      setResultBody(JSON.stringify(resp ?? {}, null, 2));
      setResultOpen(true);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setResultTitle("Fout bij verzenden");
      setResultBody(msg);
      setResultOpen(true);
    } finally {
      setSending(false);
    }
  }

  // ✅ FIX: async handler apart, zodat TS geen Promise->void gedoe geeft
  const handleSaveOrder = async () => {
    const hasCustomer = !!cart.customer;
    const hasLines = (cart.lines?.length ?? 0) > 0;

    if (!hasCustomer || !hasLines) {
      setResultTitle("Kan niet opslaan");
      setResultBody("Selecteer een klant en voeg minimaal 1 artikel toe.");
      setResultOpen(true);
      return;
    }

    // ✅ snapshot gebruikt de statevelden uit dit scherm
    const snapshot = {
      type: cart.type,
      customer: cart.customer,
      lines: cart.lines,
      reference: String(reference || ""),
      remark: String(note || ""),
      deliveryDate: String(deliveryDate || ""),
      warehouse: "01",
    };

    const saved: SavedOrder = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      cart: snapshot,
      totalQty: totals.totalQty,
      totalAmount: totals.totalAmount,
    };

    const list = await getSavedOrders();
    await setSavedOrders([saved, ...list]);

    // ✅ winkelwagen leeg (probeer clearCart als die bestaat, anders clearLines)
    if (typeof clearCart === "function") {
      clearCart("all");
    } else {
      clearLines?.();
    }

    // ook de lokale velden resetten (netjes)
    setReference("");
    setNote("");
    setDeliveryDate("");
    setReferenceOpen(false);

    setResultTitle("Order opgeslagen");
    setResultBody("Je vindt deze terug bij Settings → Opgeslagen orders.");
    setResultOpen(true);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ paddingRight: 140 }}>
        <Text style={styles.headerType}>
          {cart.type === "order" ? "ORDER" : "OFFERTE"}
        </Text>

        <Text style={styles.headerName}>{customerName}</Text>
        <Text style={styles.headerSub}>{customerSub}</Text>

        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => router.push("/customers")}
            style={styles.klantWijzigenChip}
          >
            <Text style={styles.klantWijzigenText}>
              {showKlantWijzigen ? "Klant wijzigen" : "Naar klanten"}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", marginTop: 14 }}>
          <View style={{ marginRight: 8 }}>
            <SegmentButton
              label="Order"
              active={cart.type === "order"}
              onPress={() => switchType("order")}
            />
          </View>
          <SegmentButton
            label="Offerte"
            active={cart.type === "offerte"}
            onPress={() => switchType("offerte")}
          />
        </View>
      </View>

      <View style={styles.rightStackWrap}>
        <ActionButton
          label="Order opslaan"
          onPress={() => {
            void handleSaveOrder();
          }}
        />

        <View style={{ height: 8 }} />

        <ActionButton
          label="Referentie"
          onPress={() => setReferenceOpen((v) => !v)}
          active={referenceOpen}
        />

        <View style={{ height: 8 }} />

        <Pressable onPress={openDatePicker} style={styles.deliveryMiniBtn}>
          <Text style={styles.deliveryMiniLabel}>Leverdatum</Text>
          <Text style={styles.deliveryMiniValue}>
            {deliveryDate ? deliveryDate : "—"}
          </Text>
        </Pressable>
      </View>

      {referenceOpen && (
        <View style={styles.notePanel}>
          <Text style={styles.noteLabel}>Referentie</Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="Bijv. PO / klantreferentie"
            placeholderTextColor="#9CA3AF"
            style={styles.noteInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.noteLabel, { marginTop: 10 }]}>Opmerking</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Opmerking voor AFAS (intern)"
            placeholderTextColor="#9CA3AF"
            style={[styles.noteInput, styles.noteTextarea]}
            multiline
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );

  const renderDatePicker = () => (
    <Modal
      visible={datePickerOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setDatePickerOpen(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setDatePickerOpen(false)}
      >
        <Pressable style={styles.modalCardSmall} onPress={() => {}}>
          <View style={styles.modalHeaderSmall}>
            <Pressable onPress={goPrevMonth} style={styles.navBtnSmall}>
              <Text style={styles.navBtnTextSmall}>‹</Text>
            </Pressable>

            <Text style={styles.modalTitleSmall}>
              {monthTitleShort(viewMonthDate)}
            </Text>

            <Pressable onPress={goNextMonth} style={styles.navBtnSmall}>
              <Text style={styles.navBtnTextSmall}>›</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 8 }}>{renderCalendarGrid()}</View>

          <View style={styles.modalFooterSmall}>
            <Pressable
              onPress={() => {
                setDeliveryDate(toYMD(new Date()));
                setViewMonthDate(startOfMonth(new Date()));
              }}
              style={styles.modalTinyBtn}
            >
              <Text style={styles.modalTinyBtnText}>Vandaag</Text>
            </Pressable>

            <Pressable
              onPress={() => setDatePickerOpen(false)}
              style={[styles.modalTinyBtn, { marginLeft: 8 }]}
            >
              <Text style={styles.modalTinyBtnText}>Sluiten</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderResultModal = () => (
    <Modal
      visible={resultOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setResultOpen(false)}
    >
      <Pressable
        style={styles.modalBackdropCenter}
        onPress={() => setResultOpen(false)}
      >
        <Pressable style={styles.resultCard} onPress={() => {}}>
          <Text style={styles.resultTitle}>{resultTitle}</Text>
          <ScrollView style={{ maxHeight: 320, marginTop: 10 }}>
            <Text style={styles.resultBody}>{resultBody}</Text>
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <Pressable
              onPress={() => setResultOpen(false)}
              style={styles.resultBtn}
            >
              <Text style={styles.resultBtnText}>Sluiten</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderMobileLines = () => {
    if ((cart.lines?.length ?? 0) === 0) {
      return (
        <View style={{ padding: 12 }}>
          <Text style={{ color: COLORS.text, opacity: 0.7 }}>
            Nog geen artikelen toegevoegd.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={styles.mobileListCard}>
          <View style={styles.mobileTitleRow}>
            <Text style={{ fontWeight: "700", color: COLORS.text }}>
              Order ({cart.lines.length})
            </Text>
            <Text style={{ color: COLORS.text, fontSize: 12, opacity: 0.7 }}>
              {totals.totalQty} units
            </Text>
          </View>

          {cart.lines.map((line: any, idx: number) => {
            const qty = Number(line.qty ?? 0);

            const key = normalizeKey(line.articleNumber ?? line.productId);
            const price =
              typeof getUnitPrice === "function"
                ? Number(getUnitPrice(key) ?? 0)
                : Number(line.price ?? 0);

            const safePrice = Number.isFinite(price) ? price : 0;
            const lineTotal = qty * safePrice;

            const step = getStepUnitsFromLine(line);
            const hasStep = Number.isFinite(step) && step > 0;

            const canInc = hasStep;
            const canDec = hasStep && qty >= step;

            const badge = getStockBadge(line);

            return (
              <View
                key={line.productId ?? idx}
                style={[
                  styles.mobileLineRow,
                  idx === cart.lines.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.mobileThumbWrap}>
                  <View style={styles.thumbFrameMobile}>
                    {line.imageUrl ? (
                      <Image
                        source={{ uri: line.imageUrl }}
                        style={styles.thumbImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder} />
                    )}
                  </View>
                </View>

                <View style={styles.mobileInfo}>
                  <View style={styles.mobileTopRow}>
                    <Text style={styles.mobileCode}>
                      {line.articleNumber ?? line.productId}
                    </Text>

                    <View
                      style={[
                        styles.stockPillInline,
                        { backgroundColor: badge.bg },
                      ]}
                      pointerEvents="none"
                    >
                      <Text style={[styles.stockPillText, { color: badge.fg }]}>
                        {badge.text}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.mobileName} numberOfLines={2}>
                    {line.name}
                  </Text>

                  {!hasStep ? (
                    <Text style={styles.outerMissing}>OUTERCARTON ontbreekt</Text>
                  ) : (
                    <Text style={styles.outerOk}>Doos: {step}</Text>
                  )}

                  <View style={styles.mobileQtyRow}>
                    <Pressable
                      onPress={() => decLine(line)}
                      disabled={!canDec}
                      style={[
                        styles.qtyBtnMobile,
                        { opacity: canDec ? 1 : 0.35, marginRight: 10 },
                      ]}
                    >
                      <Text style={styles.qtyBtnText}>–</Text>
                    </Pressable>

                    <View style={styles.mobileQtyValue}>
                      <Text style={styles.mobileQtyText}>{qty}</Text>
                    </View>

                    <Pressable
                      onPress={() => incLine(line)}
                      disabled={!canInc}
                      style={[
                        styles.qtyBtnMobile,
                        styles.qtyBtnMobilePlus,
                        { opacity: canInc ? 1 : 0.35, marginLeft: 10 },
                      ]}
                    >
                      <Text style={[styles.qtyBtnText, { color: "#047857" }]}>
                        +
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => removeLine(line)}
                      style={{ marginLeft: 14 }}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.mobileTotalsCol}>
                  <Text style={styles.mobileUnitPrice}>
                    {formatEUR(safePrice)}
                  </Text>
                  <Text style={styles.mobileLineTotal}>
                    {formatEUR(lineTotal)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderMobileFooter = () => (
    <View style={styles.mobileFooter}>
      <View style={styles.mobileTotalsBox}>
        <Row label="Aantal" value={`${totals.totalQty}`} />
        <Row label="Totaal" value={`${formatEUR(totals.totalAmount)}`} bold />

        <View style={{ marginTop: 12 }}>
          <Pressable
            disabled={!canSend || sending}
            onPress={handleSend}
            style={[
              styles.sendBtn,
              (!canSend || sending) && {
                backgroundColor: "rgba(255,255,255,0.45)",
              },
            ]}
          >
            {sending ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator />
                <View style={{ width: 10 }} />
                <Text style={{ fontWeight: "900", color: COLORS.text }}>
                  Verzenden…
                </Text>
              </View>
            ) : (
              <Text
                style={{
                  fontWeight: "900",
                  color: canSend ? "white" : COLORS.text,
                }}
              >
                Send
              </Text>
            )}
          </Pressable>
        </View>

        {!cart.customer && (
          <Text style={styles.needCustomerText}>
            Selecteer eerst een klant om te kunnen verzenden.
          </Text>
        )}
      </View>
    </View>
  );

  if (isPhone) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: COLORS.bg }}
          contentContainerStyle={{ paddingBottom: 190 }}
          keyboardShouldPersistTaps="handled"
        >
          {renderHeader()}
          {renderDatePicker()}
          {renderMobileLines()}
        </ScrollView>

        {renderMobileFooter()}
        {renderResultModal()}
      </View>
    );
  }

  // iPad/Desktop
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {renderHeader()}
      {renderDatePicker()}
      {renderResultModal()}

      <View style={{ padding: 16 }}>
        <View style={styles.tableCard}>
          <View style={styles.titleRow}>
            <Text style={{ fontWeight: "700", color: COLORS.text }}>
              Order information
            </Text>
            <Text style={{ color: COLORS.text, fontSize: 12, opacity: 0.7 }}>
              {totals.totalQty} units
            </Text>
          </View>

          <View style={styles.columnHeaderRow}>
            <Text style={[styles.th, { width: 44 }]} />
            <Text style={[styles.th, { width: 90 }]}>Item code</Text>
            <Text style={[styles.th, { flex: 1 }]}>Description</Text>
            <Text style={[styles.th, { width: 150, textAlign: "center" }]}>
              Quantity
            </Text>
            <Text style={[styles.th, { width: 110, textAlign: "right" }]}>
              Price
            </Text>
            <Text style={[styles.th, { width: 110, textAlign: "right" }]}>
              Total
            </Text>
          </View>

          {(cart.lines?.length ?? 0) === 0 ? (
            <View style={{ padding: 12 }}>
              <Text style={{ color: COLORS.text, opacity: 0.7 }}>
                Nog geen artikelen toegevoegd.
              </Text>
            </View>
          ) : (
            <View>
              {cart.lines.map((line: any, idx: number) => {
                const qty = Number(line.qty ?? 0);

                const key = normalizeKey(line.articleNumber ?? line.productId);
                const price =
                  typeof getUnitPrice === "function"
                    ? Number(getUnitPrice(key) ?? 0)
                    : Number(line.price ?? 0);

                const safePrice = Number.isFinite(price) ? price : 0;
                const lineTotal = qty * safePrice;

                const step = getStepUnitsFromLine(line);
                const hasStep = Number.isFinite(step) && step > 0;

                const canInc = hasStep;
                const canDec = hasStep && qty >= step;

                const badge = getStockBadge(line);

                return (
                  <View
                    key={line.productId ?? idx}
                    style={[
                      styles.lineRow,
                      idx === cart.lines.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={{ width: 44 }}>
                      <View style={styles.thumbFrame}>
                        {line.imageUrl ? (
                          <Image
                            source={{ uri: line.imageUrl }}
                            style={styles.thumbImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={styles.thumbPlaceholder} />
                        )}
                      </View>
                    </View>

                    <View style={{ width: 90 }}>
                      <Text style={styles.codeText}>
                        {line.articleNumber ?? line.productId}
                      </Text>
                    </View>

                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={styles.descRow}>
                        <Text style={styles.descName} numberOfLines={2}>
                          {line.name}
                        </Text>

                        <View
                          style={[
                            styles.stockPillInline,
                            { backgroundColor: badge.bg },
                          ]}
                          pointerEvents="none"
                        >
                          <Text
                            style={[styles.stockPillText, { color: badge.fg }]}
                          >
                            {badge.text}
                          </Text>
                        </View>
                      </View>

                      {!hasStep ? (
                        <Text style={styles.outerMissing}>
                          OUTERCARTON ontbreekt
                        </Text>
                      ) : (
                        <Text style={styles.outerOk}>Doos: {step}</Text>
                      )}
                    </View>

                    <View style={{ width: 150, alignItems: "center" }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Pressable
                          onPress={() => decLine(line)}
                          disabled={!canDec}
                          style={[
                            styles.qtyBtn,
                            {
                              backgroundColor: "#E5E7EB",
                              opacity: canDec ? 1 : 0.35,
                              marginRight: 8,
                            },
                          ]}
                        >
                          <Text style={styles.qtyBtnText}>–</Text>
                        </Pressable>

                        <View
                          style={{
                            minWidth: 44,
                            alignItems: "center",
                            marginRight: 8,
                          }}
                        >
                          <Text style={{ fontWeight: "900", color: COLORS.text }}>
                            {qty}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => incLine(line)}
                          disabled={!canInc}
                          style={[
                            styles.qtyBtn,
                            {
                              backgroundColor: "#D1FAE5",
                              opacity: canInc ? 1 : 0.35,
                            },
                          ]}
                        >
                          <Text
                            style={[styles.qtyBtnText, { color: "#047857" }]}
                          >
                            +
                          </Text>
                        </Pressable>
                      </View>

                      <Pressable
                        onPress={() => removeLine(line)}
                        style={{ marginTop: 6 }}
                      >
                        <Text style={styles.removeText}>Remove</Text>
                      </Pressable>
                    </View>

                    <View style={{ width: 110, alignItems: "flex-end" }}>
                      <Text style={{ fontWeight: "800", color: COLORS.text }}>
                        {formatEUR(safePrice)}
                      </Text>
                    </View>

                    <View style={{ width: 110, alignItems: "flex-end" }}>
                      <Text style={{ fontWeight: "900", color: COLORS.text }}>
                        {formatEUR(lineTotal)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.totalsCard}>
          <Row label="Aantal" value={`${totals.totalQty}`} />
          <Row label="Totaal" value={`${formatEUR(totals.totalAmount)}`} bold />

          <View style={{ marginTop: 12 }}>
            <Pressable
              disabled={!canSend || sending}
              onPress={handleSend}
              style={[
                styles.sendBtn,
                (!canSend || sending) && {
                  backgroundColor: "rgba(255,255,255,0.45)",
                },
              ]}
            >
              {sending ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ActivityIndicator />
                  <View style={{ width: 10 }} />
                  <Text style={{ fontWeight: "900", color: COLORS.text }}>
                    Verzenden…
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontWeight: "900",
                    color: canSend ? "white" : COLORS.text,
                  }}
                >
                  Send
                </Text>
              )}
            </Pressable>
          </View>

          {!cart.customer && (
            <Text style={styles.needCustomerText}>
              Selecteer eerst een klant om te kunnen verzenden.
            </Text>
          )}

          {cart.type === "order" && !deliveryDate && canSend && (
            <Text style={[styles.needCustomerText, { marginTop: 8 }]}>
              Kies een leverdatum voordat je een order verstuurt.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.header, padding: 16, paddingTop: 24 },
  headerType: { color: "white", fontSize: 12, opacity: 0.9 },
  headerName: { color: "white", fontSize: 20, fontWeight: "700", marginTop: 4 },
  headerSub: { color: "white", opacity: 0.9, marginTop: 4 },

  th: { color: "white", fontWeight: "800" as const, fontSize: 12 },

  tableCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: "#F7F7F7",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  columnHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#5b6b5d",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lineRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },

  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 18, fontWeight: "900" as const, color: "#374151" },

  thumbFrame: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFrameMobile: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  thumbImage: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e5e7eb",
  },

  codeText: { fontWeight: "900" as const, color: COLORS.text, fontSize: 12 },

  descRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  descName: {
    fontWeight: "700" as const,
    color: COLORS.text,
    marginRight: 8,
    flexShrink: 1,
  },

  stockPillInline: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  stockPillText: { fontWeight: "900" as const, fontSize: 11 },

  outerMissing: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "900" as const,
    color: COLORS.danger,
  },
  outerOk: {
    marginTop: 3,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700" as const,
  },

  removeText: {
    color: "#6B7280",
    textDecorationLine: "underline",
    fontWeight: "700" as const,
  },

  klantWijzigenChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  klantWijzigenText: {
    color: "white",
    fontWeight: "900" as const,
    fontSize: 12,
  },

  rightStackWrap: {
    position: "absolute",
    right: 16,
    top: 52,
    alignItems: "flex-end",
  },

  notePanel: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 12,
    padding: 12,
  },
  noteLabel: { color: "white", fontWeight: "900" as const, marginBottom: 6 },
  noteInput: {
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    color: COLORS.text,
    fontWeight: "700" as const,
  },
  noteTextarea: { height: 110 },

  deliveryMiniBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 108,
  },
  deliveryMiniLabel: {
    color: "white",
    fontWeight: "900" as const,
    fontSize: 11,
    opacity: 0.95,
  },
  deliveryMiniValue: {
    color: "white",
    fontWeight: "900" as const,
    marginTop: 1,
    fontSize: 12,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 18,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  modalCardSmall: {
    width: 280,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalHeaderSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitleSmall: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 14,
  },
  navBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnTextSmall: {
    fontWeight: "900" as const,
    fontSize: 16,
    color: COLORS.text,
  },

  calendarWeekHeaderSmall: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  calendarWeekLabelSmall: {
    width: "14.285%",
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "800" as const,
    fontSize: 11,
  },
  calendarGridSmall: { flexDirection: "row", flexWrap: "wrap" },
  calendarCellSmall: {
    width: "14.285%",
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginVertical: 1,
  },
  calendarCellSmallSelected: { backgroundColor: "#D1FAE5" },
  calendarCellTextSmall: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 12,
  },
  calendarCellTextSmallSelected: { color: "#065F46" },

  modalFooterSmall: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalTinyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  modalTinyBtnText: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 12,
  },

  totalsCard: {
    backgroundColor: COLORS.footer,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  sendBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.button,
    alignItems: "center",
  },
  needCustomerText: {
    marginTop: 8,
    fontSize: 12,
    color: "white",
    opacity: 0.9,
  },

  mobileListCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  mobileTitleRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: "#F7F7F7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileLineRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "flex-start",
  },
  mobileThumbWrap: { width: 54, paddingTop: 2 },
  mobileInfo: { flex: 1, paddingRight: 10, minWidth: 0 },
  mobileTotalsCol: { width: 92, alignItems: "flex-end" },

  mobileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  mobileCode: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 13,
  },
  mobileName: {
    marginTop: 3,
    color: COLORS.text,
    fontWeight: "700" as const,
    fontSize: 12,
  },

  mobileQtyRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  qtyBtnMobile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnMobilePlus: { backgroundColor: "#D1FAE5" },
  mobileQtyValue: { minWidth: 32, alignItems: "center" },
  mobileQtyText: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 14,
  },

  mobileUnitPrice: {
    fontWeight: "800" as const,
    color: COLORS.text,
    fontSize: 12,
  },
  mobileLineTotal: {
    marginTop: 6,
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 13,
  },

  mobileFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "rgba(245,246,247,0.96)",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mobileTotalsBox: {
    backgroundColor: COLORS.footer,
    borderRadius: 14,
    padding: 12,
  },

  // ✅ NEW: result modal styles
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  resultCard: {
    width: 520,
    maxWidth: "100%",
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  resultTitle: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 16,
  },
  resultBody: {
    fontFamily: "System",
    color: "#111827",
    fontSize: 12,
    lineHeight: 18,
  },
  resultBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  resultBtnText: {
    fontWeight: "900" as const,
    color: COLORS.text,
    fontSize: 12,
  },
});

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: "white", opacity: 0.9 }}>{label}</Text>
      <Text style={{ color: "white", fontWeight: (bold ? "900" : "800") as any }}>
        {value}
      </Text>
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? "white" : "rgba(255,255,255,0.15)",
        borderWidth: 1,
        borderColor: active
          ? "rgba(255,255,255,0.0)"
          : "rgba(255,255,255,0.25)",
      }}
    >
      <Text style={{ fontWeight: "800", color: active ? COLORS.header : "white" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active
          ? "rgba(255,255,255,0.55)"
          : "rgba(255,255,255,0.3)",
        backgroundColor: active ? "rgba(255,255,255,0.12)" : "transparent",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
