"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalMemoryStore } from "@/data/progress";
import type { Memory } from "@/data/memories";
import { apiFetch, apiJson } from "@/lib/apiClient";
import {
  createMemory,
  deleteMemory,
  setMemoryCover,
  updateMemory,
  type MemoryPatchPayload,
  type MemoryPhotoPayload,
} from "@/lib/memoryApi";
import { cityMemoriesApiKey, useMemoryCachePublisher, type MemoriesResponse } from "@/lib/memoryStore";
import { summaryToMemoryStore, useMemorySummary } from "@/lib/memorySummaryStore";
import { useApi } from "@/lib/swr";
import { loadCityRegionsOfProvince, type CityRegion } from "@/lib/cityGeo";
import { EMPTY_CITY_ASSETS, revokeObjectUrl, type CityAssetStore } from "./shared";

type UseProvinceMapDataOptions = {
  provinceId: string;
  isAdmin: boolean;
};

export function useProvinceMapData({ provinceId, isAdmin }: UseProvinceMapDataOptions) {
  const localMemoriesRef = useRef<LocalMemoryStore>({});
  const cityMemoryStoreRef = useRef<LocalMemoryStore>({});
  const { data: summaryData, mutate: mutateSummary } = useMemorySummary();
  const publishMemoryMutation = useMemoryCachePublisher();
  const [cityMemoryStore, setCityMemoryStore] = useState<LocalMemoryStore>({});
  const [cityRegionState, setCityRegionState] = useState<{ provinceId: string; regions: CityRegion[] }>({
    provinceId: "",
    regions: [],
  });
  const { data: cityAssetData, mutate: mutateCityAssets } = useApi<{ assets?: CityAssetStore }>(
    "/api/v1/city-assets",
  );

  const cityAssets = cityAssetData?.assets ?? EMPTY_CITY_ASSETS;
  const summaryMemories = useMemo(
    () => summaryToMemoryStore(summaryData?.summary ?? {}),
    [summaryData?.summary],
  );
  const localMemories = useMemo(
    () => ({ ...summaryMemories, ...cityMemoryStore }),
    [cityMemoryStore, summaryMemories],
  );
  const cityRegions = useMemo(
    () => (cityRegionState.provinceId === provinceId ? cityRegionState.regions : []),
    [cityRegionState.provinceId, cityRegionState.regions, provinceId],
  );

  useEffect(() => {
    localMemoriesRef.current = localMemories;
  }, [localMemories]);

  useEffect(() => {
    const controller = new AbortController();

    void loadCityRegionsOfProvince(provinceId, controller.signal)
      .then((regions) => setCityRegionState({ provinceId, regions }))
      .catch(() => {
        if (!controller.signal.aborted) setCityRegionState({ provinceId, regions: [] });
      });

    return () => controller.abort();
  }, [provinceId]);

  useEffect(() => {
    return () => {
      Object.values(localMemoriesRef.current).forEach((memories) => {
        memories.forEach((memory) => revokeObjectUrl(memory.image));
      });
    };
  }, []);

  const loadCityMemories = useCallback(async (cityId: string, force = false) => {
    if (!force && cityId in localMemoriesRef.current && cityId in cityMemoryStoreRef.current) return;

    const data = await apiJson<MemoriesResponse>(cityMemoriesApiKey(cityId));
    const cityMemories = data.memories[cityId] ?? [];
    cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [cityId]: cityMemories };
    setCityMemoryStore(cityMemoryStoreRef.current);
  }, []);

  const applyMemoryUpdate = useCallback((memories: LocalMemoryStore, selectedCityId: string | null) => {
    if (!selectedCityId) return;
    const selectedMemories = memories[selectedCityId];
    if (!selectedMemories) return;

    cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [selectedCityId]: selectedMemories };
    setCityMemoryStore(cityMemoryStoreRef.current);
  }, []);

  const refreshRemoteState = useCallback(
    (selectedCityId: string | null) => {
      void mutateCityAssets();
      void mutateSummary();
      if (selectedCityId) void loadCityMemories(selectedCityId, true);
    },
    [loadCityMemories, mutateCityAssets, mutateSummary],
  );

  const commitMemoryStore = useCallback(
    (memories: LocalMemoryStore, cityId: string) => {
      const cityMemories = memories[cityId] ?? [];
      cityMemoryStoreRef.current = { ...cityMemoryStoreRef.current, [cityId]: cityMemories };
      setCityMemoryStore(cityMemoryStoreRef.current);
      localMemoriesRef.current = { ...localMemoriesRef.current, [cityId]: cityMemories };
      publishMemoryMutation(memories, cityId);
    },
    [publishMemoryMutation],
  );

  const showPendingMemory = useCallback(
    (cityId: string, memory: Memory) => {
      const previousStore = cityMemoryStoreRef.current;
      const previousLocalStore = localMemoriesRef.current;
      const tempId = `pending-${cityId}-${Date.now()}`;
      const pendingMemory: Memory = {
        ...memory,
        id: tempId,
        pending: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const nextCityMemories = [pendingMemory, ...(localMemoriesRef.current[cityId] ?? [])];
      const optimisticStore = { ...localMemoriesRef.current, [cityId]: nextCityMemories };

      commitMemoryStore(optimisticStore, cityId);

      return () => {
        cityMemoryStoreRef.current = previousStore;
        setCityMemoryStore(previousStore);
        localMemoriesRef.current = previousLocalStore;
        publishMemoryMutation(previousLocalStore, cityId);
      };
    },
    [commitMemoryStore, publishMemoryMutation],
  );

  const optimisticCreateMemory = useCallback(
    async (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[], rollbackPending?: () => void) => {
      const rollback = rollbackPending ?? showPendingMemory(cityId, memory);

      try {
        const data = await createMemory(memory, photos);
        commitMemoryStore(data.memories, cityId);
      } catch (error) {
        rollback();
        throw error;
      }
    },
    [commitMemoryStore, showPendingMemory],
  );

  const optimisticUpdateMemory = useCallback(
    async (cityId: string, memoryId: string, patch: MemoryPatchPayload) => {
      const previousStore = cityMemoryStoreRef.current;
      const previousLocalStore = localMemoriesRef.current;
      const currentCityMemories = localMemoriesRef.current[cityId] ?? [];
      const nextCityMemories = currentCityMemories.map((item) =>
        item.id === memoryId
          ? {
              ...item,
              ...patch,
              image: patch.image ?? patch.coverImage ?? item.image,
              photos: patch.photos?.map((photo) => photo.url).filter(Boolean) ?? item.photos,
              pending: true,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      const optimisticStore = { ...localMemoriesRef.current, [cityId]: nextCityMemories };

      commitMemoryStore(optimisticStore, cityId);

      try {
        const data = await updateMemory(memoryId, patch);
        commitMemoryStore(data.memories, cityId);
      } catch (error) {
        cityMemoryStoreRef.current = previousStore;
        setCityMemoryStore(previousStore);
        localMemoriesRef.current = previousLocalStore;
        publishMemoryMutation(previousLocalStore, cityId);
        throw error;
      }
    },
    [commitMemoryStore, publishMemoryMutation],
  );

  const saveMemory = useCallback(
    async (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[], rollbackPending?: () => void) => {
      if (!isAdmin) throw new Error("Admin mode required");

      await optimisticCreateMemory(cityId, memory, photos, rollbackPending);
    },
    [isAdmin, optimisticCreateMemory],
  );

  const beginSaveMemory = useCallback(
    (cityId: string, memory: Memory) => {
      if (!isAdmin) throw new Error("Admin mode required");
      return showPendingMemory(cityId, memory);
    },
    [isAdmin, showPendingMemory],
  );

  const saveMemoryCover = useCallback(
    async (cityId: string, memoryId: string, coverImage: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await setMemoryCover(memoryId, coverImage);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const updateMemoryRecord = useCallback(
    async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
      if (!isAdmin) throw new Error("Admin mode required");

      await optimisticUpdateMemory(cityId, memoryId, memory);
    },
    [isAdmin, optimisticUpdateMemory],
  );

  const deleteMemoryRecord = useCallback(
    async (cityId: string, memoryId: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const data = await deleteMemory(memoryId);
      commitMemoryStore(data.memories, cityId);
    },
    [commitMemoryStore, isAdmin],
  );

  const saveCityAsset = useCallback(
    async (cityId: string, image: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const response = await apiFetch("/api/v1/city-assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId, image }),
      });

      if (!response.ok) throw new Error("Failed to save city asset");

      const data = (await response.json()) as { assets: CityAssetStore };
      void mutateCityAssets({ assets: data.assets }, { revalidate: false });
    },
    [isAdmin, mutateCityAssets],
  );

  const deleteCityAsset = useCallback(
    async (cityId: string) => {
      if (!isAdmin) throw new Error("Admin mode required");

      const response = await apiFetch("/api/v1/city-assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId }),
      });

      if (!response.ok) throw new Error("Failed to delete city asset");

      const data = (await response.json()) as { assets: CityAssetStore };
      void mutateCityAssets({ assets: data.assets }, { revalidate: false });
    },
    [isAdmin, mutateCityAssets],
  );

  return {
    localMemories,
    cityAssets,
    cityRegions,
    loadCityMemories,
    applyMemoryUpdate,
    refreshRemoteState,
    saveMemory,
    beginSaveMemory,
    saveMemoryCover,
    updateMemoryRecord,
    deleteMemoryRecord,
    saveCityAsset,
    deleteCityAsset,
  };
}
