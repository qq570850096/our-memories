import useSWR from "swr";
import type { SWRConfiguration } from "swr";
import { apiFetch } from "@/lib/apiClient";
import type { LocalMemoryStore } from "@/data/progress";

const defaultFetcher = async (url: string) => {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
};

export function useApi<T>(
  path: string | null,
  options?: SWRConfiguration<T>
) {
  return useSWR<T>(path, defaultFetcher, {
    // 切页走缓存；切回标签页 / 重连时后台刷新（节流 5 分钟），软导航不会触发 focus。
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: false,
    dedupingInterval: 300000,
    focusThrottleInterval: 300000,
    keepPreviousData: true,
    ...options,
  });
}

export function useMemories() {
  return useApi<{ memories: LocalMemoryStore }>("/api/v1/memories", {
    revalidateIfStale: false,
  });
}
