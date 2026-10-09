import NodeCache from "node-cache";

const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60,
});

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCached<T>(key: string, value: T, ttlSeconds = 300): void {
  cache.set(key, value, ttlSeconds);
}

export function getCacheMeta(key: string): { updatedAt?: string; isCached: boolean } {
  const data = cache.get<{ updatedAt: string }>(key);
  return {
    updatedAt: data?.updatedAt,
    isCached: !!data,
  };
}

export function clearCache(): void {
  cache.flushAll();
}