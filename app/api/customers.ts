// app/api/customers.ts (Expo) — FULL REPLACEMENT
// Goals:
// - Same style as products.ts (timeout/abort, no hard crash on missing setup key)
// - Accepts both backend shapes: { rows: T[] } OR { data: T[] }
// - Makes contacts robust for debiteur_contacts_app (multiple possible column names)
// - Robust single-line address parser
//
// ✅ Agent scoping:
// - Default: if agentId exists -> send header x-agent-id
// - Core customers:
//    - fetchCustomersCore() = auto scoped if agentId exists
//    - fetchCustomersCoreScoped() = always scoped
//    - ✅ NEW: fetchCustomersCoreUnscoped() = ALWAYS unscoped + NO x-agent-id header
//      (dit is nodig als scoped kapot is / agentId verkeerd is, zodat je toch alle klanten ziet)

import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://ideas4seasons-backend.onrender.com"
).replace(/\/$/, "");

const SETUP_KEY = process.env.EXPO_PUBLIC_SETUP_KEY || "";

// Debug (1x bij load)
console.log("API_BASE", API_BASE || "MISSING");
console.log("SETUP_KEY", SETUP_KEY ? "OK" : "MISSING");

/* ---------- Types ---------- */

export type CustomerCoreRow = {
  Nummer_debiteur: string;
  Naam_debiteur: string;
  Telefoonnr_werk?: string | null;
  "E-mail_werk"?: string | null;
  Agent?: string | null;
  Betaaltermijn?: string | null;
  Voorkeur_prijslijst?: string | null;
  Volledig_blokkeren__niet_meer_zichtbaar?: boolean | null;

  [key: string]: unknown;
};

export type CustomerContactRow = {
  debiteur_number?: string | null;
  debiteurNumber?: string | null;
  Nummer_debiteur?: string | null;

  debiteur_name?: string | null;
  debiteurName?: string | null;
  Naam_debiteur?: string | null;

  contact_name?: string | null;
  contactName?: string | null;
  Naam_contactpersoon?: string | null;
  name?: string | null;

  email?: string | null;
  Email?: string | null;
  "E-mail"?: string | null;
  "E-mail_werk"?: string | null;

  phone?: string | null;
  Phone?: string | null;
  Telefoon?: string | null;
  Telefoonnr_werk?: string | null;
  Mobiel?: string | null;

  contact_type?: string | null;
  contactType?: string | null;
  Functie?: string | null;

  [key: string]: unknown;
};

export type CustomerAddressRow = {
  Nummer_debiteur: string;
  Naam_debiteur: string;
  Adresvoorbeeld_op_1_regel?: string | null;

  [key: string]: unknown;
};

type ApiListResponseRows<T> = {
  ok: boolean;
  connectorId?: string;
  skip?: number;
  take?: number;
  rowCount?: number;
  rows: T[];
  error?: string;
};

type ApiListResponseData<T> = {
  ok: boolean;
  limit?: number;
  offset?: number;
  count?: number;
  data: T[];
  error?: string;
};

function extractList<T>(json: any): T[] {
  if (!json) return [];
  if (Array.isArray(json.rows)) return json.rows as T[];
  if (Array.isArray(json.data)) return json.data as T[];
  return [];
}

/* ---------- Agent helper ---------- */

async function getStoredAgentId(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem("agentId");
    const id = String(v ?? "").trim();
    // ✅ demo/invalid agentId niet laten scopen
    if (!id) return "";
    if (id === "A100") return "";
    return id;
  } catch {
    return "";
  }
}

/* ---------- Fetch core ---------- */

async function fetchJson<T>(
  url: string,
  opts?: { includeAgentHeader?: boolean }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (SETUP_KEY) headers["x-setup-key"] = SETUP_KEY;

    const includeAgentHeader = opts?.includeAgentHeader !== false;

    // ✅ add x-agent-id only if allowed + present
    if (includeAgentHeader) {
      const agentId = await getStoredAgentId();
      if (agentId) headers["x-agent-id"] = agentId;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) ${url}: ${text}`);
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/* ---------- Fetchers ---------- */

// Scoped core: always /customers/core-scoped
export async function fetchCustomersCoreScoped(
  take = 200,
  skip = 0
): Promise<CustomerCoreRow[]> {
  const url = `${API_BASE}/customers/core-scoped?take=${take}&skip=${skip}`;
  const json = await fetchJson<
    ApiListResponseRows<CustomerCoreRow> | ApiListResponseData<CustomerCoreRow>
  >(url, { includeAgentHeader: true });
  return extractList<CustomerCoreRow>(json);
}

// ✅ NEW: Unscoped core: always /customers/core AND never sends x-agent-id
export async function fetchCustomersCoreUnscoped(
  take = 200,
  skip = 0
): Promise<CustomerCoreRow[]> {
  const url = `${API_BASE}/customers/core?take=${take}&skip=${skip}`;
  const json = await fetchJson<
    ApiListResponseRows<CustomerCoreRow> | ApiListResponseData<CustomerCoreRow>
  >(url, { includeAgentHeader: false });
  return extractList<CustomerCoreRow>(json);
}

// Existing name kept — auto-switches to scoped if agentId exists
export async function fetchCustomersCore(
  take = 200,
  skip = 0
): Promise<CustomerCoreRow[]> {
  const agentId = await getStoredAgentId();

  const url = agentId
    ? `${API_BASE}/customers/core-scoped?take=${take}&skip=${skip}`
    : `${API_BASE}/customers/core?take=${take}&skip=${skip}`;

  const json = await fetchJson<
    ApiListResponseRows<CustomerCoreRow> | ApiListResponseData<CustomerCoreRow>
  >(url, { includeAgentHeader: true });

  return extractList<CustomerCoreRow>(json);
}

export async function fetchCustomersContacts(
  take = 500,
  skip = 0
): Promise<CustomerContactRow[]> {
  const url = `${API_BASE}/customers/contacts?take=${take}&skip=${skip}`;
  const json = await fetchJson<
    ApiListResponseRows<CustomerContactRow> | ApiListResponseData<CustomerContactRow>
  >(url, { includeAgentHeader: true });
  return extractList<CustomerContactRow>(json);
}

export async function fetchCustomersAddresses(
  take = 500,
  skip = 0
): Promise<CustomerAddressRow[]> {
  const url = `${API_BASE}/customers/addresses?take=${take}&skip=${skip}`;
  const json = await fetchJson<
    ApiListResponseRows<CustomerAddressRow> | ApiListResponseData<CustomerAddressRow>
  >(url, { includeAgentHeader: true });
  return extractList<CustomerAddressRow>(json);
}

/* ---------- Helpers ---------- */

export function parseSingleLineAddress(line?: string | null) {
  const raw = String(line || "").trim();
  if (!raw) return { street: "", houseNumber: "", postalCode: "", city: "", country: "" };

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);

  const left = parts[0] ?? "";
  const right = parts[1] ?? "";

  const leftParts = left.split(" ").filter(Boolean);
  const houseNumber = leftParts.length ? leftParts[leftParts.length - 1] : "";
  const street = leftParts.slice(0, -1).join(" ");

  const rightParts = right.split(" ").filter(Boolean);
  const postalCode = rightParts.slice(0, 2).join(" ");
  const city = rightParts.slice(2).join(" ");

  return { street, houseNumber, postalCode, city, country: "" };
}

export function getDebtorNumberFromCore(c: CustomerCoreRow): string {
  return String(c.Nummer_debiteur ?? "").trim();
}

export function getDebtorNumberFromContact(c: CustomerContactRow): string {
  return (
    String(c.debiteur_number ?? "").trim() ||
    String(c.debiteurNumber ?? "").trim() ||
    String(c.Nummer_debiteur ?? "").trim()
  );
}

export function getDebtorNumberFromAddress(a: CustomerAddressRow): string {
  return String(a.Nummer_debiteur ?? "").trim();
}
