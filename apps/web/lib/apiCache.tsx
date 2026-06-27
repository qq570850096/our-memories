"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import type { Cache, State } from "swr";
import {
  type SessionScopeUpdateDetail,
  clearApiCache,
  clearLegacyApiCache,
  scopedCacheStorageKey,
} from "@/lib/apiCacheStorage";
import {
  sessionCacheScope,
  sessionScopeUpdatedEvent,
} from "@/lib/authStore";

const cacheMaxAgeMs = 1000 * 60 * 60 * 6;
const maxPersistedEntryBytes = 750 * 1024;

const persistentKeys = new Set([
  "/api/v1/memories",
  "/api/v1/city-assets",
  "/api/v1/anniversary-cards",
  "/api/v1/time-capsules",
  "/api/v1/auxiliary-items",
  "/api/v1/trip-guides",
]);

type PersistedCacheEntry = [
  string,
  {
    state: State<unknown, unknown>;
    updatedAt: number;
  },
];

function isPersistentKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const [pathname] = key.split("?");
  return persistentKeys.has(pathname);
}

function cacheContainsDataUrl(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("data:image/");
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(cacheContainsDataUrl);
  return Object.values(value).some(cacheContainsDataUrl);
}

function canPersistState(state: State<unknown, unknown>) {
  if (cacheContainsDataUrl(state.data)) return false;
  try {
    return JSON.stringify(state).length <= maxPersistedEntryBytes;
  } catch {
    return false;
  }
}

function replaceCache(cache: Map<string, State<unknown, unknown>>, next: Map<string, State<unknown, unknown>>) {
  cache.clear();
  next.forEach((value, key) => cache.set(key, value));
}

function reviveCache(scope = sessionCacheScope()) {
  if (typeof window === "undefined") return new Map<string, State<unknown, unknown>>();

  clearLegacyApiCache();
  const raw = window.localStorage.getItem(scopedCacheStorageKey(scope));
  if (!raw) return new Map<string, State<unknown, unknown>>();

  try {
    const parsed = JSON.parse(raw) as PersistedCacheEntry[];
    const now = Date.now();
    return new Map(
      parsed
        .filter(([key, entry]) => isPersistentKey(key) && now - entry.updatedAt < cacheMaxAgeMs)
        .map(([key, entry]) => [key, entry.state]),
    );
  } catch {
    window.localStorage.removeItem(scopedCacheStorageKey(scope));
    return new Map<string, State<unknown, unknown>>();
  }
}

function persistCache(cache: Cache, scope = sessionCacheScope()) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const entries = Array.from(cache.keys()).flatMap((key): PersistedCacheEntry[] => {
    if (!isPersistentKey(key)) return [];
    const state = cache.get(key);
    if (!state || state.data === undefined) return [];
    if (!canPersistState(state)) return [];
    return [[key, { state, updatedAt: now }]];
  });

  try {
    window.localStorage.setItem(scopedCacheStorageKey(scope), JSON.stringify(entries));
  } catch {
    // Large data URLs can exceed storage quota. Keeping memory cache still improves route switches.
  }
}

export function ApiCacheProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [cache] = useState(() => reviveCache());

  useEffect(() => {
    const save = () => persistCache(cache);
    const handleSessionScopeUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SessionScopeUpdateDetail>).detail;
      if (detail?.clearPrevious) {
        clearApiCache(detail.previousScope);
        cache.clear();
        return;
      }

      if (detail?.previousScope) {
        persistCache(cache, detail.previousScope);
      }
      replaceCache(cache, reviveCache(detail?.nextScope));
    };

    window.addEventListener("pagehide", save);
    window.addEventListener(sessionScopeUpdatedEvent, handleSessionScopeUpdate);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      window.removeEventListener(sessionScopeUpdatedEvent, handleSessionScopeUpdate);
    };
  }, [cache]);

  return (
    <SWRConfig
      value={{
        provider: () => cache,
        // 切页走缓存（revalidateIfStale:false → 软导航不重拉，彻底解决"每次切换都请求"）；
        // 新鲜度来自"切回标签页/网络重连"时的后台刷新，软导航不会触发 focus，所以导航仍零请求。
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        revalidateIfStale: false,
        dedupingInterval: 1000 * 60 * 5,
        focusThrottleInterval: 1000 * 60 * 5,
        keepPreviousData: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
