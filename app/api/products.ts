// app/api/products.ts (Expo) — FULL REPLACEMENT
// Changes:
// - getProducts default limit -> 200 (backend cap)
// - NEW getAllProducts() that pages through /products until all items are fetched

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://ideas4seasons-backend.onrender.com"
).replace(/\/$/, "");

/** Backend shape (as returned by your Node API) */
export type BackendProductRow = {
  itemcode: string;
  description_eng: string | null;
  ean: string | null;

  price: string | number | null;
  available_stock: string | number | null;

  outercarton?: string | number | null;
  OUTERCARTON?: string | number | null;

  innercarton?: string | number | null;
  INNERCARTON?: string | number | null;

  unit?: string | null;

  image_url?: string | null;
  image_urls?: string[] | null;

  expected_date?: string | null;

  [key: string]: unknown;
};

/** Normalized row used by the app mapping (safer types) */
export type NormalizedProductRow = Omit<
  BackendProductRow,
  "price" | "available_stock" | "outercarton" | "OUTERCARTON" | "innercarton" | "INNERCARTON" | "image_url" | "image_urls"
> & {
  price: number | null;
  available_stock: number | null;
  outercarton: number | null;
  innercarton: number | null;
  image_url: string | null;
  image_urls: string[];
};

type ProductsListResponse = {
  ok: boolean;
  limit: number;
  offset: number;
  count: number;
  data: BackendProductRow[];
  error?: string;
};

type SingleProductResponse = {
  ok: boolean;
  data: BackendProductRow;
  error?: string;
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // allow "10,88" just in case
    const normalized = s.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanUrl(u: unknown): string | null {
  if (u === null || u === undefined) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (s === "null" || s === "undefined") return null;
  return s;
}

function uniqKeepOrder(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function normalizeImageUrls(row: BackendProductRow): { image_url: string | null; image_urls: string[] } {
  const main = cleanUrl(row.image_url);
  const urlsRaw = Array.isArray(row.image_urls) ? row.image_urls : [];
  const cleaned = urlsRaw.map(cleanUrl).filter(Boolean) as string[];

  const combined = main ? [main, ...cleaned] : cleaned;
  const image_urls = uniqKeepOrder(combined);

  return {
    image_url: main ?? (image_urls[0] ?? null),
    image_urls,
  };
}

function normalizeRow(row: BackendProductRow): NormalizedProductRow {
  const outer = toNumber(row.outercarton ?? row.OUTERCARTON);
  const inner = toNumber(row.innercarton ?? row.INNERCARTON);

  const imgs = normalizeImageUrls(row);

  return {
    ...row,
    price: toNumber(row.price),
    available_stock: toNumber(row.available_stock),

    // force consistent keys for your mapping
    outercarton: outer,
    innercarton: inner,

    image_url: imgs.image_url,
    image_urls: imgs.image_urls,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) ${text}`);
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch ALL products by paging through limit/offset until the last page. */
async function fetchAllProductsPaged(pageSize = 200): Promise<NormalizedProductRow[]> {
  let offset = 0;
  const all: NormalizedProductRow[] = [];

  while (true) {
    const url = `${API_BASE}/products?limit=${pageSize}&offset=${offset}`;
    const json = await fetchJson<ProductsListResponse>(url);

    const rows = Array.isArray(json.data) ? json.data : [];
    all.push(...rows.map(normalizeRow));

    // last page when returned fewer than requested
    if (rows.length < pageSize) break;

    offset += pageSize;
  }

  return all;
}

/* =========================
   Exports
   ========================= */

export async function getProducts(limit = 200, offset = 0): Promise<NormalizedProductRow[]> {
  const url = `${API_BASE}/products?limit=${limit}&offset=${offset}`;
  const json = await fetchJson<ProductsListResponse>(url);

  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(normalizeRow);
}

/** Convenience: get the complete catalogue (~1200) */
export async function getAllProducts(): Promise<NormalizedProductRow[]> {
  return fetchAllProductsPaged(200);
}

export async function getProductByEan(ean: string): Promise<NormalizedProductRow | null> {
  try {
    const url = `${API_BASE}/products/by-ean/${encodeURIComponent(ean)}`;
    const json = await fetchJson<SingleProductResponse>(url);
    if (!json?.data) return null;
    return normalizeRow(json.data);
  } catch {
    return null;
  }
}

export async function getProductByItemcode(itemcode: string): Promise<NormalizedProductRow | null> {
  try {
    const url = `${API_BASE}/products/${encodeURIComponent(itemcode)}`;
    const json = await fetchJson<SingleProductResponse>(url);
    if (!json?.data) return null;
    return normalizeRow(json.data);
  } catch {
    return null;
  }
}
