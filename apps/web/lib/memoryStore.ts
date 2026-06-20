"use client";

import { useEffect } from "react";
import { memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import { useApi } from "@/lib/swr";

export const memoriesApiKey = "/api/v1/memories";

export type MemoriesResponse = {
  memories: LocalMemoryStore;
};

export function publishMemoryStore(memories: LocalMemoryStore) {
  window.dispatchEvent(new CustomEvent(memoryStoreUpdatedEvent, { detail: memories }));
}

export function useMemoryStore() {
  const swr = useApi<MemoriesResponse>(memoriesApiKey);

  useEffect(() => {
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) void swr.mutate({ memories: detail }, { revalidate: false });
    };

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    return () => window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
  }, [swr]);

  return swr;
}
