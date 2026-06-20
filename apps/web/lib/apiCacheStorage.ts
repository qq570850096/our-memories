import {
  sessionCacheScope,
  type SessionScopeUpdateDetail,
} from "@/lib/authStore";

export const legacyCacheStorageKey = "mapofus:swr-cache:v1";
export const cacheStoragePrefix = "mapofus:swr-cache:v2:";

export function scopedCacheStorageKey(scope = sessionCacheScope()) {
  return `${cacheStoragePrefix}${scope}`;
}

export function clearApiCache(scope = sessionCacheScope()) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(scopedCacheStorageKey(scope));
}

export function clearLegacyApiCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(legacyCacheStorageKey);
}

export type { SessionScopeUpdateDetail };
