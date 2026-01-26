// app/api/prices.ts — FULL REPLACEMENT (hard debug + web/native safe)
import Constants from "expo-constants";

const DEBUG = true;

function readExtra(): any {
  return (
    (Constants.expoConfig?.extra as any) ||
    (Constants.manifest2 as any)?.extra ||
    (Constants.manifest as any)?.extra ||
    {}
  );
}

function getApiBase(): string {
  const extra = readExtra();
  const v =
    (process.env.EXPO_PUBLIC_API_BASE_URL as string) ||
    (extra?.EXPO_PUBLIC_API_BASE_URL as string) ||
    "https://ideas4seasons-backend.onrender.com";

  return String(v).replace(/\/$/, "");
}

function getSetupKey(): string {
  const extra = readExtra();
  const v =
    (process.env.EXPO_PUBLIC_SETUP_KEY as string) ||
    (extra?.EXPO_PUBLIC_SETUP_KEY as string) ||
    "";
  return String(v || "").trim();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const extra = readExtra();
  const API_BASE = getApiBase();
  const SETUP_KEY = getSetupKey();

  if (DEBUG) {
    console.log("PRICES DEBUG CONSTANTS:", {
      expoConfigExtraKeys: Object.keys(Constants.expoConfig?.extra || {}),
      manifestExtraKeys: Object.keys((Constants.manifest as any)?.extra || {}),
      manifest2ExtraKeys: Object.keys((Constants.manifest2 as any)?.extra || {}),
      extraKeys: Object.keys(extra || {}),
      envHasKey: Boolean(process.env.EXPO_PUBLIC_SETUP_KEY),
      extraHasKey: Boolean(extra?.EXPO_PUBLIC_SETUP_KEY),
      hasSetupKey: Boolean(SETUP_KEY),
      apiBase: API_BASE,
    });
  }

  const url = `${API_BASE}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (SETUP_KEY) headers["x-setup-key"] = SETUP_KEY;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`API ${res.status}: ${text}`);

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type ResolvedPriceSource = "debiteur" | "prijslijst" | "basis" | "none";

export type ResolvedPrice = {
  price: number | null;
  source: ResolvedPriceSource;
};

export type ResolvePricesResponse = {
  ok: boolean;
  customerId: string;
  prijslijstCode: string | null;
  prices: Record<string, ResolvedPrice>;
  error?: string;
};

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

export async function resolvePrices(
  customerId: string,
  itemcodes: string[]
): Promise<ResolvePricesResponse> {
  const cust = String(customerId ?? "").trim();
  const clean = uniqStrings(Array.isArray(itemcodes) ? itemcodes : []);

  if (!cust || clean.length === 0) {
    return { ok: true, customerId: cust, prijslijstCode: null, prices: {} };
  }

  const SETUP_KEY = getSetupKey();
  if (!SETUP_KEY) {
    return {
      ok: false,
      customerId: cust,
      prijslijstCode: null,
      prices: {},
      error: "Missing EXPO_PUBLIC_SETUP_KEY (frontend)",
    };
  }

  try {
    return await postJson<ResolvePricesResponse>("/prices/resolve", {
      customerId: cust,
      itemcodes: clean,
    });
  } catch (e: any) {
    return {
      ok: false,
      customerId: cust,
      prijslijstCode: null,
      prices: {},
      error: String(e?.message ?? e),
    };
  }
}
