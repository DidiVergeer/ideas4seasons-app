// app/(tabs)/customers/index.tsx — FULL REPLACEMENT
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  fetchCustomersAddresses,
  fetchCustomersContacts,
  fetchCustomersCoreScoped,
  parseSingleLineAddress,
  type CustomerAddressRow,
  type CustomerContactRow,
  type CustomerCoreRow,
} from "@/app/api/customers";

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://ideas4seasons-backend.onrender.com"
).replace(/\/$/, "");

const SETUP_KEY = process.env.EXPO_PUBLIC_SETUP_KEY || "";

const COLORS = {
  header: "#60715f",
  button: "#85c14c",
  footer: "#839384",
  text: "#3a3939",
  bg: "#F5F6F7",
  border: "#E5E7EB",
  white: "#FFFFFF",
  muted: "#6B7280",
  dangerBg: "#FEE2E2",
  dangerText: "#991B1B",
};

type UiAddress = {
  line1?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

type UiCustomer = {
  id: string;
  customerNumber: string;
  name: string;

  agent?: string | null;
  paymentTerm?: string | null;
  priceList?: string | null;
  blocked?: boolean | null;

  address?: UiAddress;
  contacts: CustomerContactRow[];
  addresses: CustomerAddressRow[];
};

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function formatFullAddress(a?: UiAddress): string {
  if (!a) return "-";

  const line1 = safeStr(a.line1);
  if (line1) return line1;

  const street = safeStr(a.street);
  const house = safeStr(a.houseNumber);
  const pc = safeStr(a.postalCode);
  const city = safeStr(a.city);
  const country = safeStr(a.country);

  const part1 = [street, house].filter(Boolean).join(" ");
  const part2 = [pc, city].filter(Boolean).join(" ");
  const full = [part1, part2, country].filter(Boolean).join(", ");

  return full || "-";
}

/** ✅ Belangrijk: unscoped core ophalen ZONDER x-agent-id header */
async function fetchCustomersCoreUnscopedNoAgent(take = 200, skip = 0): Promise<CustomerCoreRow[]> {
  const url = `${API_BASE}/customers/core?take=${take}&skip=${skip}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (SETUP_KEY) headers["x-setup-key"] = SETUP_KEY;

    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await res.text().catch(() => "");

    if (!res.ok) throw new Error(`Request failed (${res.status}) ${url}: ${text}`);

    const json = JSON.parse(text);
    if (Array.isArray(json?.rows)) return json.rows as CustomerCoreRow[];
    if (Array.isArray(json?.data)) return json.data as CustomerCoreRow[];
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function getDebtorFromContact(c: CustomerContactRow): string {
  return (
    safeStr((c as any).debiteur_number) ||
    safeStr((c as any).debiteurNumber) ||
    safeStr((c as any).Nummer_debiteur)
  );
}

export default function CustomersScreen() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [core, setCore] = useState<CustomerCoreRow[]>([]);
  const [contacts, setContacts] = useState<CustomerContactRow[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddressRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const storedAgentId = safeStr(await AsyncStorage.getItem("agentId"));
        console.log("[customers/index] stored agentId:", storedAgentId || "(none)");

        let coreRows: CustomerCoreRow[] = [];

        // ✅ Strategie:
        // - Als agentId bestaat: probeer scoped
        // - Als scoped faalt (zoals “Agent has no name configured”): force unscoped zónder agent header
        // - Als geen agentId: direct unscoped zónder agent header
        if (storedAgentId) {
          try {
            console.log("[customers/index] trying scoped core...");
            coreRows = await fetchCustomersCoreScoped(5000, 0);
            console.log("[customers/index] core source: scoped");
          } catch (e: any) {
            console.log("[customers/index] scoped failed -> force unscoped (no agent header):", e?.message ?? e);
            coreRows = await fetchCustomersCoreUnscopedNoAgent(5000, 0);
            console.log("[customers/index] core source: unscoped (forced)");
          }
        } else {
          console.log("[customers/index] no agentId -> unscoped (no agent header)");
          coreRows = await fetchCustomersCoreUnscopedNoAgent(5000, 0);
          console.log("[customers/index] core source: unscoped");
        }

        const [contactRows, addressRows] = await Promise.all([
          fetchCustomersContacts(5000, 0),
          fetchCustomersAddresses(5000, 0),
        ]);

        if (cancelled) return;

        setCore(Array.isArray(coreRows) ? coreRows : []);
        setContacts(Array.isArray(contactRows) ? contactRows : []);
        setAddresses(Array.isArray(addressRows) ? addressRows : []);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ? String(e.message) : "Onbekende fout bij laden klanten.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const customers: UiCustomer[] = useMemo(() => {
    const contactsByDebtor = new Map<string, CustomerContactRow[]>();
    for (const c of contacts) {
      const key = getDebtorFromContact(c);
      if (!key) continue;
      const arr = contactsByDebtor.get(key) ?? [];
      arr.push(c);
      contactsByDebtor.set(key, arr);
    }

    const addrByDebtor = new Map<string, CustomerAddressRow[]>();
    for (const a of addresses) {
      const key = safeStr(a.Nummer_debiteur);
      if (!key) continue;
      const arr = addrByDebtor.get(key) ?? [];
      arr.push(a);
      addrByDebtor.set(key, arr);
    }

    const out: UiCustomer[] = [];
    for (const c of core) {
      const debtor = safeStr(c.Nummer_debiteur);
      if (!debtor) continue;

      if ((c as any).Volledig_blokkeren__niet_meer_zichtbaar) continue;

      const cContacts = contactsByDebtor.get(debtor) ?? [];
      const cAddresses = addrByDebtor.get(debtor) ?? [];

      const firstLine =
        cAddresses.find((x) => safeStr(x.Adresvoorbeeld_op_1_regel))?.Adresvoorbeeld_op_1_regel ?? null;

      const parsed = parseSingleLineAddress(firstLine);

      out.push({
        id: debtor,
        customerNumber: debtor,
        name: safeStr(c.Naam_debiteur),
        agent: (c as any).Agent ?? null,
        paymentTerm: (c as any).Betaaltermijn ?? null,
        priceList: (c as any).Voorkeur_prijslijst ?? null,
        blocked: (c as any).Volledig_blokkeren__niet_meer_zichtbaar ?? null,
        address: {
          line1: firstLine ?? undefined,
          street: parsed.street,
          houseNumber: parsed.houseNumber,
          postalCode: parsed.postalCode,
          city: parsed.city,
          country: "",
        },
        contacts: cContacts,
        addresses: cAddresses,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [core, contacts, addresses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const nr = (c.customerNumber ?? "").toLowerCase();
      const city = (c.address?.city ?? "").toLowerCase();
      const addrLine = formatFullAddress(c.address).toLowerCase();
      return name.includes(q) || nr.includes(q) || city.includes(q) || addrLine.includes(q);
    });
  }, [customers, query]);

  const goToCustomer = (id: string) => {
    router.push({ pathname: "/customers/[id]", params: { id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ backgroundColor: COLORS.header, paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>Mijn klanten</Text>
      </View>

      <View style={{ flex: 1, padding: 16 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Zoek op naam, klantnummer of plaats..."
          placeholderTextColor="#9CA3AF"
          style={{
            backgroundColor: COLORS.white,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
            color: COLORS.text,
          }}
        />

        {err ? (
          <View
            style={{
              marginTop: 10,
              backgroundColor: COLORS.dangerBg,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text style={{ color: COLORS.dangerText, fontWeight: "800" }}>Let op</Text>
            <Text style={{ color: COLORS.dangerText, marginTop: 4 }}>{err}</Text>
          </View>
        ) : null}

        <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ gap: 10, paddingBottom: 90 }}>
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            filtered.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => goToCustomer(c.id)}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.white,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  padding: 14,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: COLORS.muted }}>{c.customerNumber}</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: COLORS.text, marginTop: 2 }}>
                      {c.name || "-"}
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4 }}>{formatFullAddress(c.address)}</Text>
                  </View>

                  <Text style={{ color: COLORS.muted, fontSize: 18 }}>›</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View
      style={{
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        padding: 14,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 120,
      }}
    >
      <ActivityIndicator />
      <Text style={{ color: COLORS.muted, marginTop: 10 }}>Klanten laden…</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View
      style={{
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ color: COLORS.muted }}>Geen klanten gevonden.</Text>
    </View>
  );
}
