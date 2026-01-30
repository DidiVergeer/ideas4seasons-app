// lib/offlineCache.ts
import localforage from "localforage";

const store = localforage.createInstance({
  name: "i4s-sales-app",
  storeName: "offline_cache",
});

export type CachedPayload<T> = {
  data: T;
  savedAt: string; // ISO
};

export async function setCache<T>(key: string, data: T) {
  const payload: CachedPayload<T> = {
    data,
    savedAt: new Date().toISOString(),
  };
  await store.setItem(key, payload);
}

export async function getCache<T>(key: string): Promise<CachedPayload<T> | null> {
  const payload = await store.getItem<CachedPayload<T>>(key);
  return payload ?? null;
}

export async function removeCache(key: string) {
  await store.removeItem(key);
}
