import useSWR from "swr";
import type { SWRConfiguration } from "swr";
import { apiFetch, throwApiError } from "@/lib/apiClient";
import type { LocalMemoryStore } from "@/data/progress";

type ApiSWRConfiguration<T> = SWRConfiguration<T> & {
  enabled?: boolean;
};

const defaultFetcher = async (url: string) => {
  const response = await apiFetch(url);
  if (!response.ok) await throwApiError(response, url);
  return response.json();
};

export function useApi<T>(
  path: string | null,
  options?: ApiSWRConfiguration<T>
) {
  const { enabled = true, ...swrOptions } = options ?? {};

  return useSWR<T>(enabled ? path : null, defaultFetcher, {
    // 切页走缓存；切回标签页 / 重连时后台刷新（节流 5 分钟），软导航不会触发 focus。
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: false,
    dedupingInterval: 300000,
    focusThrottleInterval: 300000,
    keepPreviousData: true,
    ...swrOptions,
  });
}

export function useMemories() {
  return useApi<{ memories: LocalMemoryStore }>("/api/v1/memories", {
    revalidateIfStale: false,
  });
}
