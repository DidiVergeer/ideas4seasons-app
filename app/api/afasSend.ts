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

export type SendLine = { itemcode: string; qty: number; price?: number | null };

export type SendPayload = {
  customerId: string;
  reference?: string;
  remark?: string;
  warehouse?: string;
  deliveryDate?: string;
  lines: SendLine[];
};

export function sendQuote(payload: SendPayload) {
  return postJson("/quotes/send", payload);
}

export function sendOrder(payload: SendPayload) {
  return postJson("/orders/send", payload);
}
