// app/(tabs)/customers/[id].tsx — FULL REPLACEMENT
// ✅ FIX: detailpagina gebruikt scoped alleen als agentId bestaat, anders unscoped
// ✅ FAIL-OPEN: als scoped faalt -> fallback naar unscoped
// ✅ Prijs-fix blijft: we gebruiken ALTIJD params.id als customerNumber (price customerId)
// ✅ Contact persons matching blijft super-robust

import {
  fetchCustomersAddresses,
  fetchCustomersContacts,
  fetchCustomersCoreScoped,
  fetchCustomersCoreUnscoped, // ✅ nodig voor fallback
  parseSingleLineAddress,
  type CustomerAddressRow,
  type CustomerContactRow,
  type CustomerCoreRow,
} from "@/app/api/customers";
import { useCart } from "@/components/cart";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

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
  id: string;
  label?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  line1?: string;
};

type UiContactPerson = {
  id: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
};

type UiCustomer = {
  id: string; // route id (price customerId)
  customerNumber: string; // route id (price customerId)
  name: string;
  phone?: string | null;
  email?: string | null;

  address?: UiAddress;

  contactPersons?: UiContactPerson[];

  financial?: {
    accountManager?: string | null;
    priceList?: string | null;
    paymentTerms?: string | null;
  };
};

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function stripLeadingZeros(s: string): string {
  const x = safeStr(s);
  return x.replace(/^0+/, "") || "0";
}

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
}

function anyValueMatchesDebtor(row: any, debtorId: string): boolean {
  const a = stripLeadingZeros(debtorId);
  const b = safeStr(debtorId);

  if (!row || typeof row !== "object") return false;

  for (const [, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    const s = safeStr(v);
    if (!s) continue;

    if (s === b) return true;
    if (stripLeadingZeros(s) === a) return true;
  }
  return false;
}

function rowMatchesDebtor(row: CustomerContactRow, debtorId: string): boolean {
  const r: any = row as any;

  // 1) bekende velden
  const direct = firstNonEmpty(
    r.debiteur_number,
    r.debiteurNumber,
    r.Nummer_debiteur,
    r.Debiteur,
    r.Debiteurnummer,
    r.debiteur_nr,
    r.debiteurNr,
    r.debtor_number,
    r.debtorNumber
  );

  if (direct) {
    if (safeStr(direct) === safeStr(debtorId)) return true;
    if (stripLeadingZeros(direct) === stripLeadingZeros(debtorId)) return true;
  }

  // 2) fallback: scan alle values van de row
  return anyValueMatchesDebtor(r, debtorId);
}

async function getStoredAgentId(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem("agentId");
    return String(v ?? "").trim();
  } catch {
    return "";
  }
}

export default function CustomerProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();

  // ✅ Dit is de ID die prijzen moeten gebruiken (bijv. 400134)
  const customerId = safeStr(params.id);

  const { setCustomer, setType } = useCart() as any;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [core, setCore] = useState<CustomerCoreRow | null>(null);
  const [contacts, setContacts] = useState<CustomerContactRow[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddressRow[]>([]);

  const [openContacts, setOpenContacts] = useState(false);
  const [openFinancial, setOpenFinancial] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        if (!customerId) throw new Error("Geen klant-id in de URL.");

        const agentId = await getStoredAgentId();

        // ✅ Core: scoped alleen als agentId bestaat, anders unscoped
        // ✅ Fail-open: scoped faalt -> unscoped
        let coreRows: CustomerCoreRow[] = [];
        try {
          if (agentId) {
            coreRows = await fetchCustomersCoreScoped(5000, 0);
            console.log("[customers/[id]] core: scoped (agentId)", agentId);
          } else {
            throw new Error("No agentId -> use unscoped");
          }
        } catch (e: any) {
          coreRows = await fetchCustomersCoreUnscoped(5000, 0);
          console.log("[customers/[id]] core: unscoped fallback", e?.message ?? e);
        }

        const [contactRows, addressRows] = await Promise.all([
          fetchCustomersContacts(5000, 0),
          fetchCustomersAddresses(5000, 0),
        ]);

        if (cancelled) return;

        // Core match op route id (400134)
        const c =
          (coreRows || []).find((x) => safeStr((x as any).Nummer_debiteur) === customerId) ?? null;
        setCore(c);

        const allContacts = contactRows || [];
        const matchedContacts = allContacts.filter((x) => rowMatchesDebtor(x, customerId));
        setContacts(matchedContacts);

        const cAddrs = (addressRows || []).filter(
          (x) => safeStr((x as any).Nummer_debiteur) === customerId
        );
        setAddresses(cAddrs);

        // ✅ Debug
        console.log("[customers/[id]] route customerId (PRICE):", customerId);
        console.log("[customers/[id]] agentId:", agentId || "(none)");
        console.log("[customers/[id]] core match found:", !!c);
        if (c) {
          console.log("[customers/[id]] core.Nummer_debiteur:", (c as any).Nummer_debiteur);
          console.log("[customers/[id]] core.Voorkeur_prijslijst:", (c as any).Voorkeur_prijslijst);
        }
        console.log("[customers/[id]] contacts total:", allContacts.length);
        console.log("[customers/[id]] contacts matched:", matchedContacts.length);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ? String(e.message) : "Onbekende fout bij laden klant.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const customer: UiCustomer | null = useMemo(() => {
    if (!core) return null;

    const firstLine =
      addresses.find((x) => safeStr((x as any).Adresvoorbeeld_op_1_regel))?.Adresvoorbeeld_op_1_regel ??
      null;

    const parsed = parseSingleLineAddress(firstLine);

    const mainAddress: UiAddress = {
      id: "main",
      label: "Hoofdadres",
      line1: firstLine ?? undefined,
      street: parsed.street,
      houseNumber: parsed.houseNumber,
      postalCode: parsed.postalCode,
      city: parsed.city,
      country: "",
    };

    const contactPersons: UiContactPerson[] = (contacts || [])
      .map((p: CustomerContactRow, idx: number) => {
        const r: any = p as any;

        const name =
          firstNonEmpty(
            r.contact_name,
            r.contactName,
            r.Naam_contactpersoon,
            r.Naam,
            r.name,
            r.Contactpersoon
          ) || "";

        const email =
          firstNonEmpty(
            r.email,
            r.Email,
            r["E-mail"],
            r["E-mail_werk"],
            r.Mail,
            r.email_address,
            r.emailAddress
          ) || "";

        const phone =
          firstNonEmpty(
            r.phone,
            r.Phone,
            r.Telefoon,
            r.Telefoonnr_werk,
            r.Mobiel,
            r.mobile,
            r.mobilePhone
          ) || "";

        const role = firstNonEmpty(r.contact_type, r.contactType, r.Functie, r.Role) || "";

        if (!name && !email && !phone) return null;

        return {
          id: `${customerId}-cp-${idx}`,
          name: name || "-",
          role: role || null,
          phone: phone || null,
          email: email || null,
        } as UiContactPerson;
      })
      .filter(Boolean) as UiContactPerson[];

    return {
      id: customerId,
      customerNumber: customerId, // ✅ prijs-customerId
      name: safeStr((core as any).Naam_debiteur) || "-",
      phone: ((core as any).Telefoonnr_werk as any) ?? null,
      email: ((core as any)["E-mail_werk"] as any) ?? null,
      address: mainAddress,
      contactPersons,
      financial: {
        accountManager: ((core as any).Agent as any) ?? null,
        priceList: ((core as any).Voorkeur_prijslijst as any) ?? null,
        paymentTerms: ((core as any).Betaaltermijn as any) ?? null,
      },
    };
  }, [core, contacts, addresses, customerId]);

  const startDoc = (type: "order" | "offerte") => {
    if (!customer) return;

    setType?.(type);

    const a = customer.address;

    // ✅ ALTIJD de route-id gebruiken voor prijzen (customerId = 400134)
    const debiteurNummer = customer.customerNumber;

    console.log("STARTDOC setCustomerNumber (PRICE ID):", debiteurNummer);
    console.log("[customers/[id]] core.Nummer_debiteur (AFAS):", (core as any)?.Nummer_debiteur);

    setCustomer?.({
      customerNumber: debiteurNummer,
      name: customer.name,
      address: {
        street: a?.street ?? "",
        houseNumber: a?.houseNumber ?? "",
        postalCode: a?.postalCode ?? "",
        city: a?.city ?? "",
      },
    });

    console.log("[customers/[id]] setCustomer customerNumber:", debiteurNummer);

    router.push({
      pathname: "/(tabs)/cart",
      params: { type },
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: 16, justifyContent: "center" }}>
        <View
          style={{
            backgroundColor: COLORS.white,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 16,
            padding: 16,
            alignItems: "center",
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted, marginTop: 10 }}>Klant laden…</Text>
        </View>
      </View>
    );
  }

  if (err) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: 16 }}>
        <View
          style={{
            backgroundColor: COLORS.dangerBg,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Text style={{ color: COLORS.dangerText, fontWeight: "900" }}>Fout</Text>
          <Text style={{ color: COLORS.dangerText, marginTop: 6 }}>{err}</Text>
        </View>

        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: COLORS.header, fontWeight: "800" }}>Terug</Text>
        </Pressable>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: 16 }}>
        <Text style={{ color: COLORS.text }}>Klant niet gevonden.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 10 }}>
          <Text style={{ color: COLORS.header, fontWeight: "800" }}>Terug</Text>
        </Pressable>
      </View>
    );
  }

  const a = customer.address;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: COLORS.header, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: "white", opacity: 0.9, fontSize: 12 }}>{customer.customerNumber}</Text>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>{customer.name}</Text>
          </View>

          <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
            <Text style={{ color: "white", fontWeight: "900" }}>Terug</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90, gap: 12 }}>
        {/* Debiteur blok (naam + nummer + adres) */}
        <Card>
          <Text style={{ fontSize: 16, fontWeight: "900", color: COLORS.text }}>{customer.name}</Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.muted, fontWeight: "600" }}>
            {customer.customerNumber}
          </Text>

          <Text style={{ color: COLORS.text, lineHeight: 20, marginTop: 10 }}>
            {(a?.street ?? "-") + " " + (a?.houseNumber ?? "")}
            {"\n"}
            {(a?.postalCode ?? "-") + " " + (a?.city ?? "-")}
          </Text>
        </Card>

        {/* Start order/offerte */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PrimaryButton label="Start order" onPress={() => startDoc("order")} />
          <DarkButton label="Start offerte" onPress={() => startDoc("offerte")} />
        </View>

        {/* Contact info */}
        <Card title="Contact">
          <Line label="Telefoon" value={(customer.phone as any) ?? "-"} />
          <Line label="Email" value={(customer.email as any) ?? "-"} />
        </Card>

        {/* Contact persons accordion */}
        <Accordion title="Contact persons" open={openContacts} onToggle={() => setOpenContacts((v) => !v)}>
          {(customer.contactPersons ?? []).length === 0 ? (
            <Text style={{ color: COLORS.muted }}>Geen contactpersonen.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {customer.contactPersons!.map((p) => (
                <View
                  key={p.id}
                  style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12 }}
                >
                  <Text style={{ fontWeight: "900", color: COLORS.text }}>{p.name}</Text>

                  {p.role ? <Text style={{ color: COLORS.muted, marginTop: 2 }}>{p.role}</Text> : null}

                  <Text style={{ color: COLORS.text, marginTop: 6 }}>Tel: {p.phone ?? "-"}</Text>
                  <Text style={{ color: COLORS.text }}>Email: {p.email ?? "-"}</Text>
                </View>
              ))}
            </View>
          )}
        </Accordion>

        {/* Financial accordion */}
        <Accordion title="Financial information" open={openFinancial} onToggle={() => setOpenFinancial((v) => !v)}>
          <Line label="Accountmanager" value={(customer.financial?.accountManager as any) ?? "-"} />
          <Line label="Prijslijst" value={(customer.financial?.priceList as any) ?? "-"} />
          <Line label="Betaalregeling" value={(customer.financial?.paymentTerms as any) ?? "-"} />
        </Accordion>
      </ScrollView>
    </View>
  );
}

/* ---------- UI helpers ---------- */

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
        <Text style={{ fontSize: 16, fontWeight: "900", color: COLORS.text, marginBottom: 10 }}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: COLORS.muted }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: COLORS.button,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function DarkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: "#111827",
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
      <Pressable onPress={onToggle} style={{ padding: 14, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "900", color: COLORS.text }}>{title}</Text>
        <Text style={{ fontWeight: "900", color: COLORS.muted }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? <View style={{ padding: 14, paddingTop: 0 }}>{children}</View> : null}
    </View>
  );
}
