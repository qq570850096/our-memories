"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { chinaFeatures, makePath, makeProjectionForProvince, provinceIdOf } from "@/lib/geo";
import { cityRegionPath, cityRegionsOfProvince } from "@/lib/cityGeo";
import { cityFallbackSprite, getCitiesByProvince, type City } from "@/data/cities";
import { getLatestMemory, sortMemoriesByTime, type Memory } from "@/data/memories";
import { getLitCityIds, memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import { buildMemoryRoutePoints, curvedRoutePath } from "@/lib/memoryRoutes";
import type { Province } from "@/data/provinces";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { MemoryContentView, MemoryThumb, photosOfMemory } from "@/components/memories/MemoryContentView";
import { MemoryCitySheet, type MemoryPatchPayload } from "@/components/memories/MemoryCitySheet";
import { DatePicker } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiClient";
import { adminModeUpdatedEvent } from "@/data/adminMode";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { computeMemoryEditAccess, useContentEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { publishMemoryStore, useMemoryStore } from "@/lib/memoryStore";
import { useApi } from "@/lib/swr";
import { uploadImage, uploadImages, deleteUploaded } from "@/lib/upload";

interface ProvinceMapProps {
  province: Province;
  width?: number;
  height?: number;
}

type BrowserTimeout = ReturnType<Window["setTimeout"]>;
type PhotoDraft = {
  previewUrl: string;
  name: string;
  file: File;
};
type CardAnchor = {
  x: number;
  y: number;
  side: "left" | "right";
};
type MapCamera = {
  scale: number;
  x: number;
  y: number;
};
type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCamera: MapCamera;
};
type MemoryPanelTab = "memory" | "gallery" | "history";
type CityAssetStore = Record<string, string>;
const EMPTY_CITY_ASSETS: CityAssetStore = {};

const colors = {
  cream: "#FAFBF7",
  dim: "#D8DDD8",
  ink: "#5A6670",
  sakura: "#F5DCE0",
  bloom: "#E8B8C2",
  mist: "#D6E8F0",
  sky: "#A8C8DC",
};

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };
const memoryTextMaxLength = 80;
const maxPhotosPerMemory = 24;
const memoryCardWidth = 292;
const memoryCardGap = 26;
const memoryCardMaxHeight = 620;
const cityListPanelWidth = 250;

const isObjectUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("blob:");

const revokeObjectUrl = (url?: string | null) => {
  if (isObjectUrl(url)) URL.revokeObjectURL(url);
};

const isDataImageUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("data:image/");

const isBrowserImageUrl = (url?: string | null): url is string =>
  typeof url === "string" && (url.startsWith("data:image/") || url.startsWith("https://"));

const markerLayoutByCity: Record<
  string,
  {
    width: number;
    height: number;
    iconSize: number;
    iconX: number;
    iconY: number;
    labelX: number;
    labelY: number;
  }
> = {
  zhengzhou: {
    width: 214,
    height: 156,
    iconSize: 112,
    iconX: -56,
    iconY: -116,
    labelX: -34,
    labelY: -22,
  },
  jinan: {
    width: 208,
    height: 142,
    iconSize: 102,
    iconX: -52,
    iconY: -106,
    labelX: -28,
    labelY: -18,
  },
  qingdao: {
    width: 208,
    height: 142,
    iconSize: 102,
    iconX: -52,
    iconY: -106,
    labelX: -28,
    labelY: -18,
  },
  shanghai: {
    width: 214,
    height: 156,
    iconSize: 114,
    iconX: -57,
    iconY: -116,
    labelX: -34,
    labelY: -22,
  },
  hangzhou: {
    width: 208,
    height: 144,
    iconSize: 104,
    iconX: -52,
    iconY: -108,
    labelX: -30,
    labelY: -18,
  },
  guangzhou: {
    width: 214,
    height: 150,
    iconSize: 106,
    iconX: -42,
    iconY: -104,
    labelX: -16,
    labelY: -34,
  },
  zhuhai: {
    width: 214,
    height: 142,
    iconSize: 110,
    iconX: -48,
    iconY: -76,
    labelX: -6,
    labelY: 4,
  },
  hongkong: {
    width: 236,
    height: 142,
    iconSize: 124,
    iconX: -62,
    iconY: -94,
    labelX: -28,
    labelY: -10,
  },
  macau: {
    width: 214,
    height: 146,
    iconSize: 102,
    iconX: -51,
    iconY: -98,
    labelX: -26,
    labelY: -10,
  },
};

const defaultMarkerLayout = {
  width: 192,
  height: 140,
  iconSize: 96,
  iconX: -48,
  iconY: -104,
  labelX: -50,
  labelY: -18,
};

const compactMarkerLayout = {
  width: 86,
  height: 54,
  iconSize: 18,
  iconX: -9,
  iconY: -9,
  labelX: 8,
  labelY: -15,
};

const previewMarkerLayout = {
  width: 92,
  height: 86,
  iconSize: 46,
  iconX: -23,
  iconY: -43,
  labelX: -30,
  labelY: 12,
};

const getMarkerLayout = (city: City, selected: boolean) => {
  if (city.sprite === cityFallbackSprite) return compactMarkerLayout;
  if (!selected) return previewMarkerLayout;

  return markerLayoutByCity[city.id] ?? defaultMarkerLayout;
};

const stableCoordinate = (value: number) => Number(value.toFixed(3));

const clampZoom = (value: number) => Math.min(Math.max(value, 1), 2.4);

const revokePhotoDrafts = (photos: PhotoDraft[]) => {
  photos.forEach((photo) => revokeObjectUrl(photo.previewUrl));
};

const memoryPhotosPayload = (photos: string[]) =>
  photos.filter(Boolean).map((url) => ({ url, key: "", mimeType: "image/jpeg" }));

export default function ProvinceMap({ province, width = 1120, height = 760 }: ProvinceMapProps) {
  const isAdmin = useContentEditAccess();
  const isMobile = useIsMobile();
  const frameRef = useRef<HTMLDivElement>(null);
  const nudgeTimeoutRef = useRef<BrowserTimeout | null>(null);
  const longPressTimeoutRef = useRef<BrowserTimeout | null>(null);
  const previousLitCityIdsRef = useRef<Set<string> | null>(null);
  const localMemoriesRef = useRef<LocalMemoryStore>({});
  const { data: memoryData, mutate: mutateMemories } = useMemoryStore();
  const cameraRef = useRef<MapCamera>({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const emptyMemories = useMemo<LocalMemoryStore>(() => ({}), []);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [nudgedCityId, setNudgedCityId] = useState<string | null>(null);
  const [sparkedCityId, setSparkedCityId] = useState<string | null>(null);
  const [previewCityId, setPreviewCityId] = useState<string | null>(null);
  const [mobileSheetMode, setMobileSheetMode] = useState<"view" | "create">("view");
  const [dragging, setDragging] = useState(false);
  const [frameScale, setFrameScale] = useState(1);
  const { data: cityAssetData, mutate: mutateCityAssets } = useApi<{ assets?: CityAssetStore }>(
    "/api/v1/city-assets",
  );
  const cityAssets = cityAssetData?.assets ?? EMPTY_CITY_ASSETS;
  const [camera, setCameraState] = useState<MapCamera>({ scale: 1, x: 0, y: 0 });
  const localMemories = memoryData?.memories ?? emptyMemories;
  const provinceCities = useMemo(() => getCitiesByProvince(province.id), [province.id]);
  const litCityIds = useMemo(() => getLitCityIds(localMemories), [localMemories]);
  const selectedCity = provinceCities.find((city) => city.id === selectedCityId) ?? null;
  const cityList = useMemo(
    () =>
      [...provinceCities].sort((a, b) => {
        const aLit = litCityIds.has(a.id);
        const bLit = litCityIds.has(b.id);
        if (aLit !== bLit) return aLit ? -1 : 1;

        return a.name.localeCompare(b.name, "zh-Hans-CN");
      }),
    [litCityIds, provinceCities],
  );

  const setCamera = (nextCamera: MapCamera | ((current: MapCamera) => MapCamera)) => {
    setCameraState((current) => {
      const resolved = typeof nextCamera === "function" ? nextCamera(current) : nextCamera;
      const clamped = {
        ...resolved,
        scale: clampZoom(resolved.scale),
      };
      cameraRef.current = clamped;

      return clamped;
    });
  };

  const commitMemoryStore = useCallback((memories: LocalMemoryStore) => {
    localMemoriesRef.current = memories;
    void mutateMemories({ memories }, { revalidate: false });
    publishMemoryStore(memories);
  }, [mutateMemories]);

  useEffect(() => {
    return () => {
      if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
      if (longPressTimeoutRef.current) window.clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const clearLongPressPreview = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const previous = previousLitCityIdsRef.current;
    if (!previous) {
      previousLitCityIdsRef.current = new Set(litCityIds);
      return;
    }

    const newlyLitCityId = [...litCityIds].find((cityId) => !previous.has(cityId));
    previousLitCityIdsRef.current = new Set(litCityIds);
    if (!newlyLitCityId) return;

    setSparkedCityId(newlyLitCityId);
    const timer = window.setTimeout(() => setSparkedCityId(null), 900);
    return () => window.clearTimeout(timer);
  }, [litCityIds]);

  useEffect(() => {
    localMemoriesRef.current = localMemories;
  }, [localMemories]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    return () => {
      Object.values(localMemoriesRef.current).forEach((memories) => {
        memories.forEach((memory) => revokeObjectUrl(memory.image));
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyMemories = (memories: LocalMemoryStore) => {
      if (cancelled) return;
      localMemoriesRef.current = memories;
      void mutateMemories({ memories }, { revalidate: false });
    };
    const reloadRemoteState = () => {
      void mutateCityAssets();
      void mutateMemories();
    };
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) applyMemories(detail);
    };

    // 进入页面走缓存（不强制重拉）；仅在管理模式切换 / 跨标签页 storage 变化时刷新，
    // 常规新鲜度由 SWR 的 focus/reconnect 后台刷新负责。
    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    window.addEventListener(adminModeUpdatedEvent, reloadRemoteState);
    window.addEventListener("storage", reloadRemoteState);

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
      window.removeEventListener(adminModeUpdatedEvent, reloadRemoteState);
      window.removeEventListener("storage", reloadRemoteState);
    };
  }, [mutateCityAssets, mutateMemories]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const { width: renderedWidth } = frame.getBoundingClientRect();
      setFrameScale(renderedWidth / width);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [width]);

  const mapGeometry = useMemo(() => {
    const projection = makeProjectionForProvince(province.id, width, height, 88);
    const path = makePath(projection);
    const cityRegions = cityRegionsOfProvince(province.id);
    const cityPoint = (city: Pick<City, "lng" | "lat">) => {
      const [x, y] = projection([city.lng, city.lat]) ?? [width / 2, height / 2];

      return [stableCoordinate(x), stableCoordinate(y)] as const;
    };

    return {
      paths: chinaFeatures.map((feature) => ({
        id: provinceIdOf(feature),
        d: path(feature as never) ?? "",
        active: provinceIdOf(feature) === province.id,
      })),
      cities: provinceCities.map((city) => {
        const [x, y] = cityPoint(city);

        return {
          city,
          x,
          y,
        };
      }),
      cityRegions: cityRegions.map((region) => ({
        city: region.city,
        wholeProvince: region.wholeProvince,
        d: cityRegionPath(region, projection),
      })),
    };
  }, [height, province.id, provinceCities, width]);

  const mapCities = useMemo(
    () =>
      mapGeometry.cities.map(({ city, x, y }) => {
        const cityMemories = localMemories[city.id] ?? [];
        const localMemory = cityMemories[0];
        const lit = litCityIds.has(city.id);
        const customSprite = cityAssets[city.id];

        return {
          ...city,
          sprite: customSprite ?? city.sprite,
          customSprite,
          x,
          y,
          lit,
          memory: localMemory ?? (lit ? getLatestMemory(city.id) : undefined),
          // 该城回忆数量（用于徽标）与最早回忆日期（用于轨迹连线排序）。
          memoryCount: cityMemories.length,
          earliestDate: cityMemories.reduce<string | undefined>((earliest, memory) => {
            if (!memory.date) return earliest;
            return !earliest || memory.date < earliest ? memory.date : earliest;
          }, undefined),
        };
      }),
    [cityAssets, litCityIds, localMemories, mapGeometry.cities],
  );

  const routePoints = useMemo(() => {
    const pointByCityId = new Map(mapCities.map((city) => [city.id, { x: city.x, y: city.y }]));

    return buildMemoryRoutePoints(localMemories, province.id)
      .map((point) => {
        const projected = pointByCityId.get(point.city.id);
        return projected ? { ...point, ...projected } : null;
      })
      .filter(Boolean) as Array<ReturnType<typeof buildMemoryRoutePoints>[number] & { x: number; y: number }>;
  }, [localMemories, mapCities, province.id]);

  const travelRoute = useMemo(() => curvedRoutePath(routePoints), [routePoints]);

  const selectedPoint = mapCities.find((city) => city.id === selectedCityId);
  const cardAnchor = selectedPoint
    ? (() => {
        const renderedWidth = width * frameScale;
        const renderedHeight = height * frameScale;
        const rightLimit = Math.max(memoryCardWidth + 24, renderedWidth - cityListPanelWidth);
        const anchorX = (selectedPoint.x * camera.scale + camera.x) * frameScale;
        const anchorY = (selectedPoint.y * camera.scale + camera.y) * frameScale;
        const side = anchorX + memoryCardGap + memoryCardWidth > rightLimit ? "left" : "right";
        const x =
          side === "right"
            ? Math.min(anchorX + memoryCardGap, rightLimit - memoryCardWidth - 12)
            : Math.max(anchorX - memoryCardGap - memoryCardWidth, 12);
        const y = Math.min(
          Math.max(anchorY - 170, 82),
          Math.max(82, renderedHeight - memoryCardMaxHeight),
        );

        return { x, y, side } satisfies CardAnchor;
      })()
    : null;

  const handleSaveMemory = async (cityId: string, memory: Memory) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...memory,
        photos: memoryPhotosPayload(memory.photos ?? [memory.image]),
      }),
    });

    if (!response.ok) throw new Error("Failed to save memory");

    const data = (await response.json()) as { memories: LocalMemoryStore };
    commitMemoryStore(data.memories);
  };

  const handleSetMemoryCover = async (cityId: string, memoryId: string, coverImage: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage }),
    });

    if (!response.ok) throw new Error("Failed to update memory cover");

    const data = (await response.json()) as { memory: Memory; memories: LocalMemoryStore };
    commitMemoryStore(data.memories);
  };

  const handleUpdateMemory = async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });

    if (!response.ok) throw new Error("Failed to update memory");

    const data = (await response.json()) as { memory: Memory; memories: LocalMemoryStore };
    commitMemoryStore(data.memories);
  };

  const handleDeleteMemory = async (cityId: string, memoryId: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("Failed to delete memory");

    const data = (await response.json()) as { memories: LocalMemoryStore };
    commitMemoryStore(data.memories);
  };

  const handleSaveCityAsset = async (cityId: string, image: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/city-assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId, image }),
    });

    if (!response.ok) throw new Error("Failed to save city asset");

    const data = (await response.json()) as { assets: CityAssetStore };
    void mutateCityAssets({ assets: data.assets }, { revalidate: false });
  };

  const handleDeleteCityAsset = async (cityId: string) => {
    if (!isAdmin) throw new Error("Admin mode required");

    const response = await apiFetch("/api/v1/city-assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId }),
    });

    if (!response.ok) throw new Error("Failed to delete city asset");

    const data = (await response.json()) as { assets: CityAssetStore };
    void mutateCityAssets({ assets: data.assets }, { revalidate: false });
  };

  const focusCity = (city: Pick<City, "id">) => {
    const point = mapGeometry.cities.find((candidate) => candidate.city.id === city.id);
    if (!point) return;

    const scale = clampZoom(Math.max(cameraRef.current.scale, 1.62));
    setCamera({
      scale,
      x: width / 2 - point.x * scale - 150,
      y: height / 2 - point.y * scale + 12,
    });
  };

  const handleSelectCity = (cityId: string, lit: boolean) => {
    const city = provinceCities.find((candidate) => candidate.id === cityId);
    setSelectedCityId(cityId);
    setMobileSheetMode(!lit && isAdmin ? "create" : "view");
    if (city) focusCity(city);
    if (!lit) {
      setNudgedCityId(cityId);
      if (nudgeTimeoutRef.current) window.clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = window.setTimeout(() => setNudgedCityId(null), 520);
    }
  };

  const resetCamera = () => {
    setSelectedCityId(null);
    setCamera({ scale: 1, x: 0, y: 0 });
  };

  useEffect(() => {
    const cityId = new URLSearchParams(window.location.search).get("city");
    const city = provinceCities.find((candidate) => candidate.id === cityId);
    if (!city) return;

    const timer = window.setTimeout(() => {
      setSelectedCityId(city.id);
      focusCity(city);
    }, 0);

    return () => window.clearTimeout(timer);
    // Run after city coordinates are projected so deep links can focus the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapGeometry.cities, provinceCities]);

  const zoomAt = (clientX: number, clientY: number, delta: number) => {
    const frame = frameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const pointerX = (clientX - rect.left) / frameScale;
    const pointerY = (clientY - rect.top) / frameScale;

    setCamera((current) => {
      const nextScale = clampZoom(current.scale * delta);
      const mapX = (pointerX - current.x) / current.scale;
      const mapY = (pointerY - current.y) / current.scale;

      return {
        scale: nextScale,
        x: pointerX - mapX * nextScale,
        y: pointerY - mapY * nextScale,
      };
    });
  };

  const zoomFromCenter = (delta: number) => {
    const frame = frameRef.current;
    const rect = frame?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : 0;
    const centerY = rect ? rect.top + rect.height / 2 : 0;

    zoomAt(centerX, centerY, delta);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.12 : 0.88;
    zoomAt(event.clientX, event.clientY, delta);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, article, aside")) return;

    dragMovedRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCamera: cameraRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const dx = (event.clientX - dragState.startClientX) / frameScale;
    const dy = (event.clientY - dragState.startClientY) / frameScale;

    if (Math.abs(dx) + Math.abs(dy) > 3) dragMovedRef.current = true;

    setCamera({
      ...dragState.startCamera,
      x: dragState.startCamera.x + dx,
      y: dragState.startCamera.y + dy,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      setDragging(false);
    }
  };

  return (
    <div
      ref={frameRef}
      className={`relative mx-auto aspect-[1120/760] w-[min(100%,1120px)] touch-none overflow-visible ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => {
        if (dragMovedRef.current) {
          dragMovedRef.current = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (!target.closest("button, article")) setSelectedCityId(null);
      }}
    >
      <div
        className="absolute left-0 top-0 z-0 origin-top-left"
        style={{
          width,
          height,
          transformOrigin: "0 0",
          transform: `scale(${frameScale})`,
        }}
      >
        <motion.div
          className="absolute left-0 top-0 origin-top-left"
          animate={{ scale: camera.scale, x: camera.x, y: camera.y }}
          transition={spring}
          style={{
            width,
            height,
            transformOrigin: "0 0",
          }}
        >
          <svg
            className="h-full w-full overflow-visible drop-shadow-[0_18px_30px_rgba(168,200,220,0.16)]"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${province.name} province map`}
          >
            <defs>
              <filter id="provinceGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={colors.bloom} floodOpacity="0.36" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="cityRegionGlow" x="-18%" y="-18%" width="136%" height="136%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor={colors.sky} floodOpacity="0.34" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id={`provinceRouteGradient-${province.id}`} x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor={colors.bloom} stopOpacity="0.74" />
                <stop offset="54%" stopColor={colors.sky} stopOpacity="0.82" />
                <stop offset="100%" stopColor="#D4E8D0" stopOpacity="0.72" />
              </linearGradient>
            </defs>

            {mapGeometry.paths.map((path) => (
              <path
                key={path.id}
                d={path.d}
                fill={path.active ? colors.sakura : colors.dim}
                fillOpacity={path.active ? 0.44 : 0.12}
                stroke={path.active ? colors.bloom : colors.dim}
                strokeOpacity={path.active ? 0.86 : 0.45}
                strokeWidth={path.active ? 2.4 : 1.2}
                strokeLinejoin="round"
                filter={path.active ? "url(#provinceGlow)" : undefined}
              />
            ))}

            {mapGeometry.cityRegions.map((region) => {
              if (!region.d) return null;
              const lit = litCityIds.has(region.city.id);
              const selected = selectedCityId === region.city.id;
              const hovered = previewCityId === region.city.id;

              return (
                <motion.path
                  key={`${region.city.id}-region`}
                  d={region.d}
                  fill={lit ? colors.sakura : colors.cream}
                  fillOpacity={selected ? 0.74 : lit ? 0.58 : 0.28}
                  stroke={selected ? colors.bloom : lit ? colors.bloom : colors.ink}
                  strokeOpacity={selected ? 0.96 : lit ? 0.64 : 0.16}
                  strokeWidth={selected ? 2.8 : hovered ? 2.2 : 1.05}
                  strokeLinejoin="round"
                  className="cursor-pointer outline-none transition duration-300"
                  filter={selected || hovered ? "url(#cityRegionGlow)" : undefined}
                  whileHover={{ fillOpacity: lit ? 0.7 : 0.42 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${region.city.name}城市区块，${lit ? "查看回忆" : "添加回忆"}`}
                  onMouseEnter={() => setPreviewCityId(region.city.id)}
                  onMouseLeave={() => setPreviewCityId((current) => (current === region.city.id ? null : current))}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectCity(region.city.id, lit);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleSelectCity(region.city.id, lit);
                  }}
                />
              );
            })}

            {travelRoute && (
              <motion.path
                d={travelRoute}
                fill="none"
                stroke={`url(#provinceRouteGradient-${province.id})`}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 10"
                strokeOpacity={0.72}
                pointerEvents="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.05, ease: "easeInOut" }}
              />
            )}

            {routePoints.map((point) => (
              <g key={`${point.memory.id}-route-node`} pointerEvents="none">
                <circle cx={point.x} cy={point.y} r={8.5} fill={colors.cream} fillOpacity="0.92" />
                <circle cx={point.x} cy={point.y} r={4.2} fill={colors.bloom} fillOpacity="0.88" />
                {routePoints.length <= 9 && (
                  <text
                    x={point.x}
                    y={point.y - 11}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={colors.ink}
                    fillOpacity="0.58"
                  >
                    {point.order}
                  </text>
                )}
              </g>
            ))}

          </svg>

          {mapCities.map((city) => {
            const selected = city.id === selectedCityId;
            const faded = selectedCityId && !selected;
            const nudged = nudgedCityId === city.id;
            const sparked = sparkedCityId === city.id;
            const previewOpen = previewCityId === city.id && city.memoryCount > 0;
            const layout = getMarkerLayout(city, selected);

	            return (
	              <motion.button
	                key={city.id}
	                className="group pointer-events-none absolute text-left transition duration-300 lg:pointer-events-auto"
                initial={false}
                animate={{
                  x: nudged ? [0, -3, 3, -2, 0] : 0,
                  scale: sparked ? [1, 1.24, 1] : 1,
                }}
                transition={{ duration: sparked ? 0.72 : nudged ? 0.42 : 0.24 }}
                style={{
                  left: city.x - layout.width / 2,
                  top: city.y - layout.height / 2,
                  width: layout.width,
                  height: layout.height,
                  opacity: faded ? 0.28 : 1,
                }}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleSelectCity(city.id, city.lit);
                }}
                onHoverStart={() => {
                  clearLongPressPreview();
                  setPreviewCityId(city.id);
                }}
                onHoverEnd={() => setPreviewCityId((current) => (current === city.id ? null : current))}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse") return;
                  clearLongPressPreview();
                  longPressTimeoutRef.current = window.setTimeout(() => setPreviewCityId(city.id), 400);
                }}
                onPointerUp={clearLongPressPreview}
                onPointerCancel={clearLongPressPreview}
                onPointerLeave={clearLongPressPreview}
                aria-label={`${city.lit ? "查看" : "添加"}${city.name}回忆`}
              >
                <CityMarker city={city} lit={city.lit} selected={selected} memoryCount={city.memoryCount} />
                <AnimatePresence>
                  {previewOpen && (
                    <CityPreviewPopover
                      city={city}
                      memory={city.memory}
                      memoryCount={city.memoryCount}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <div
        className="absolute left-3 top-3 z-40 hidden items-center gap-2 rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/86 p-2 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur lg:flex"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-[#5A6670] transition hover:bg-[#D6E8F0]/45"
          type="button"
          onClick={() => zoomFromCenter(0.88)}
          aria-label="缩小地图"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-semibold text-[#5A6670]/70">
          {Math.round(camera.scale * 100)}%
        </span>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-[#5A6670] transition hover:bg-[#F5DCE0]/55"
          type="button"
          onClick={() => zoomFromCenter(1.12)}
          aria-label="放大地图"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-[#5A6670] transition hover:bg-[#D4E8D0]/55"
          type="button"
          onClick={resetCamera}
          aria-label="重置地图视角"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <aside
        className="absolute right-0 top-3 z-40 hidden w-[230px] rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/90 p-3 shadow-[0_16px_34px_rgba(90,102,112,0.10)] backdrop-blur lg:block"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        aria-label={`${province.name}城市列表`}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#5A6670]">城市</h2>
          <span className="text-xs font-medium text-[#5A6670]/54">{provinceCities.length}</span>
        </div>
        <div className="max-h-[430px] space-y-1 overflow-y-auto pr-1">
          {cityList.map((city) => {
            const lit = litCityIds.has(city.id);
            const selected = city.id === selectedCityId;

            return (
              <button
                key={city.id}
                className={`flex w-full items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "bg-[#F5DCE0] text-[#E8B8C2] shadow-[0_8px_18px_rgba(232,184,194,0.16)]"
                    : "text-[#5A6670]/78 hover:bg-[#D6E8F0]/34"
                }`}
                type="button"
                onClick={() => handleSelectCity(city.id, lit)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#FAFBF7] ${
                      lit ? "bg-[#E8B8C2] shadow-[0_0_10px_rgba(232,184,194,0.55)]" : "bg-[#D8DDD8]"
                    }`}
                  />
                  <span className="truncate font-semibold">{city.name}</span>
                </span>
                <span className={`shrink-0 text-[11px] ${lit ? "text-[#E8B8C2]/80" : "text-[#5A6670]/40"}`}>
                  {lit ? "已去过" : "未去过"}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {selectedCity && !isMobile && (
        <MemoryCard
          key={selectedCity.id}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          anchor={cardAnchor}
          isAdmin={isAdmin}
          onClose={() => setSelectedCityId(null)}
          onSave={handleSaveMemory}
        onSetCover={handleSetMemoryCover}
        onUpdate={handleUpdateMemory}
        onDelete={handleDeleteMemory}
        landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
        hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
        onSaveLandmark={handleSaveCityAsset}
        onDeleteLandmark={handleDeleteCityAsset}
      />
      )}

      {selectedCity && isMobile && (
        <MemoryCitySheet
          key={`${selectedCity.id}-mobile-sheet`}
          open={selectedCity != null}
          onClose={() => setSelectedCityId(null)}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          isAdmin={isAdmin}
          defaultMode={mobileSheetMode}
          landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
          hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
          onSave={handleSaveMemory}
          onSetCover={handleSetMemoryCover}
          onUpdate={handleUpdateMemory}
          onDelete={handleDeleteMemory}
          onSaveLandmark={handleSaveCityAsset}
          onDeleteLandmark={handleDeleteCityAsset}
        />
      )}
    </div>
  );
}

function CityMarker({ city, lit, selected, memoryCount }: Readonly<{ city: City; lit: boolean; selected: boolean; memoryCount?: number }>) {
  const isFallbackCity = city.sprite === cityFallbackSprite;
  const layout = getMarkerLayout(city, selected);
  const showBadge = memoryCount != null && memoryCount > 0;

  if (isFallbackCity) {
    return (
      <span className="relative block h-full w-full">
        <motion.span
          className="absolute block rounded-full border-2 border-[#FAFBF7]"
          animate={{
            backgroundColor: lit ? "#E8B8C2" : "#D8DDD8",
            boxShadow: lit
              ? "0 0 12px rgba(232,184,194,0.7)"
              : "0 4px 10px rgba(90,102,112,0.08)",
            scale: lit ? 1 : 0.9,
          }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          style={{
            left: `calc(50% + ${layout.iconX}px)`,
            top: `calc(50% + ${layout.iconY}px)`,
            width: layout.iconSize,
            height: layout.iconSize,
          }}
        >
          {showBadge && (
            <span className="absolute -right-1.5 -top-1.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full border border-[#FAFBF7] bg-[#E8B8C2] px-1 text-[9px] font-bold leading-none text-[#FAFBF7] shadow-[0_2px_6px_rgba(232,184,194,0.55)]">
              {memoryCount}
            </span>
          )}
        </motion.span>
        <span
          className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FAFBF7]/92 px-3 py-1.5 text-xs font-semibold shadow-[0_8px_18px_rgba(90,102,112,0.10)] backdrop-blur transition duration-200 ${
            lit
              ? "text-[#E8B8C2] opacity-100"
              : "text-[#5A6670]/62 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
          style={{
            left: `calc(50% + ${layout.labelX}px)`,
            top: `calc(50% + ${layout.labelY}px)`,
          }}
        >
          {city.name}
        </span>
      </span>
    );
  }

  const compactLandmark = !selected;

  return (
    <span className="relative block h-full w-full">
      <span
        className="absolute block"
        style={{
          left: `calc(50% + ${layout.iconX}px)`,
          top: `calc(50% + ${layout.iconY}px)`,
          width: layout.iconSize,
          height: layout.iconSize,
        }}
      >
        <LandmarkSprite city={city} lit={lit} />
      </span>
      <span
        className={`absolute flex items-center whitespace-nowrap rounded-full bg-[#FAFBF7]/88 font-semibold shadow-[0_8px_18px_rgba(90,102,112,0.10)] backdrop-blur transition duration-200 ${
          compactLandmark ? "gap-1.5 px-3 py-1.5 text-xs" : "gap-2 px-4 py-2 text-sm"
        } ${
          compactLandmark && !lit ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
        } ${lit ? "text-[#E8B8C2]" : "text-[#5A6670]/58"}
        }`}
        style={{
          left: `calc(50% + ${layout.labelX}px)`,
          top: `calc(50% + ${layout.labelY}px)`,
        }}
      >
        <span
          className={`rounded-full border-2 border-[#FAFBF7] ${
            compactLandmark ? "h-2 w-2" : "h-2.5 w-2.5"
          } ${
            lit
              ? "bg-[#E8B8C2] shadow-[0_0_10px_rgba(232,184,194,0.65)]"
              : "bg-[#D8DDD8]"
          }`}
        />
        {city.name}
        {city.nameEn !== city.name && (
          <span className={lit ? "font-normal text-[#E8B8C2]/80" : "font-normal text-[#5A6670]/42"}>
            {city.nameEn}
          </span>
        )}
        {showBadge && (
          <span className="ml-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full border border-[#FAFBF7] bg-[#E8B8C2] px-1 text-[9px] font-bold leading-none text-[#FAFBF7] shadow-[0_2px_6px_rgba(232,184,194,0.55)]">
            {memoryCount}
          </span>
        )}
      </span>
    </span>
  );
}

function CityPreviewPopover({
  city,
  memory,
  memoryCount,
}: Readonly<{
  city: City;
  memory?: Memory;
  memoryCount: number;
}>) {
  const photos = photosOfMemory(memory);
  const cover = photos[0] ?? city.sprite;

  return (
    <motion.span
      className="pointer-events-none absolute left-1/2 top-0 z-40 w-[184px] -translate-x-1/2 -translate-y-[calc(100%+10px)] overflow-hidden rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/96 text-[#5A6670] shadow-[0_14px_32px_rgba(90,102,112,0.14)] backdrop-blur"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.16 }}
    >
      <span className="grid grid-cols-[58px_1fr] gap-2 p-2">
        <span className="relative aspect-square overflow-hidden rounded-[6px] border border-[#D8DDD8] bg-[#D6E8F0]">
          <MemoryThumb
            className={`pixelated h-full w-full object-cover ${memory ? "" : "opacity-50 grayscale"}`}
            src={cover}
            alt={`${city.name} preview`}
          />
        </span>
        <span className="min-w-0 py-0.5">
          <span className="block truncate text-sm font-semibold text-[#5A6670]">{city.name}</span>
          <span className="mt-1 block text-[11px] font-medium text-[#E8B8C2]">
            {memoryCount} 条回忆
          </span>
          <span className="mt-1 block truncate text-[11px] text-[#5A6670]/52">
            {memory?.date ?? "还没有本地回忆"}
          </span>
        </span>
      </span>
    </motion.span>
  );
}

function MemoryCard({
  city,
  localMemories,
  isLit,
  anchor,
  isAdmin,
  onClose,
  onSave,
  onSetCover,
  onUpdate,
  onDelete,
  landmarkImage,
  hasCustomLandmark,
  onSaveLandmark,
  onDeleteLandmark,
}: Readonly<{
  city: City;
  localMemories: Memory[];
  isLit: boolean;
  anchor: CardAnchor | null;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (cityId: string, memory: Memory) => Promise<void>;
  onSetCover: (cityId: string, memoryId: string, coverImage: string) => Promise<void>;
  onUpdate: (cityId: string, memoryId: string, memory: MemoryPatchPayload) => Promise<void>;
  onDelete: (cityId: string, memoryId: string) => Promise<void>;
  landmarkImage: string;
  hasCustomLandmark: boolean;
  onSaveLandmark: (cityId: string, image: string) => Promise<void>;
  onDeleteLandmark: (cityId: string) => Promise<void>;
}>) {
  const defaultMemory = isLit ? getLatestMemory(city.id) : undefined;
  const memories = sortMemoriesByTime(
    [
      ...localMemories,
      ...(defaultMemory && !localMemories.some((item) => item.id === defaultMemory.id)
        ? [defaultMemory]
        : []),
    ],
  );
  const memory = memories[0];
  // 卡片级权限：基于「最新回忆」判断，决定卡片上显示「编辑/添加补充/删除」哪个按钮。
  // useMemoryEditAccess 比较 memory.createdById === session.user.id（两者均为 UUID）。
  const access = useMemoryEditAccess(memory);
  const canEditMemory = isAdmin && access.canEdit;
  const canAnnotateMemory = isAdmin && access.canAddNote && !access.canEdit;
  const memoryPhotos = photosOfMemory(memory);
  const galleryPhotos = Array.from(new Set(memories.flatMap((item) => photosOfMemory(item))));
  const localMemoryIds = useMemo(
    () => new Set(localMemories.map((item) => item.id)),
    [localMemories],
  );
  const [formOpen, setFormOpen] = useState(!isLit && isAdmin);
  const [title, setTitle] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [visibility, setVisibility] = useState<"both" | "me" | "her">("both");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [settingCover, setSettingCover] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [landmarkError, setLandmarkError] = useState("");
  const [landmarkSaving, setLandmarkSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryPanelTab>("memory");
  const [isSaving, setIsSaving] = useState(false);
  const photoDraftsRef = useRef<PhotoDraft[]>([]);
  const mountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const landmarkInputRef = useRef<HTMLInputElement>(null);

  // 表单级权限：基于「正在编辑的记录」editingMemory 判断，而非最新回忆。
  // 这样编辑较旧记录、或在最新回忆属对方时新建回忆，都能得到正确权限。
  // 用同步的 computeMemoryEditAccess（而非 hook）：编辑中途登录态变化无意义，
  // 同步计算可避免 startEdit 切换 editingMemory 后 1 帧的陈旧权限窗口。
  const editingAccess = computeMemoryEditAccess(editingMemory);
  // 新建模式（editingMemory 为 null）：任何登录者都可编辑全部字段（任何人都能创建新回忆并成为作者）。
  // 编辑模式：创建者可编辑全部字段，非创建者只能添加补充回忆。
  const isCreating = editingMemory == null;
  const canEditFields = isAdmin && (isCreating || editingAccess.canEdit);
  const canAnnotate = isAdmin && !isCreating && editingAccess.canAddNote && !editingAccess.canEdit;

  const trimmedDate = date.trim();
  const trimmedText = text.trim();
  const normalizedDate = normalizeDottedDate(trimmedDate);
  const dateInvalid = trimmedDate.length > 0 && !normalizedDate;
  // 创建者/新建：保存完整回忆（需日期+正文）；非创建者：仅保存补充回忆。
  const canSave = isAdmin
    ? canEditFields
      ? Boolean(normalizedDate) &&
        trimmedText.length > 0 &&
        !photoError &&
        !isSaving
      : canAnnotate &&
        editingMemory != null &&
        partnerNote.trim() !== (editingMemory.partnerNote ?? "").trim() &&
        (partnerNote.trim().length > 0 || Boolean(editingMemory.partnerNote?.trim())) &&
        !isSaving
    : false;
  const isEditing = Boolean(editingMemory);
  const showMemory = !expanded || activeTab === "memory";
  const showGallery = expanded && activeTab === "gallery";
  const showHistory = (!expanded || activeTab === "history") && memories.length > 0;

  const resetForm = (revokePhoto: boolean) => {
    setTitle("");
    setPlaceName("");
    setDate("");
    setText("");
    setMood("");
    setTags("");
    setPartnerNote("");
    setVisibility("both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(null);
    if (revokePhoto) revokePhotoDrafts(photoDraftsRef.current);
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (record: Memory) => {
    if (!isAdmin) return;

    revokePhotoDrafts(photoDraftsRef.current);
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTitle(record.title ?? "");
    setPlaceName(record.placeName ?? "");
    setDate(record.date);
    setText(record.text);
    setMood(record.mood ?? "");
    setTags(record.tags?.join("，") ?? "");
    setPartnerNote(record.partnerNote ?? "");
    setVisibility(record.visibility ?? "both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(record);
    setFormOpen(true);
    setActiveTab("memory");
  };

  const handleDelete = async (record: Memory) => {
    if (!isAdmin) {
      setDeleteError("请先登录后再删除");
      return;
    }

    if (deletingMemoryId) return;
    const confirmed = window.confirm(`确定删除 ${record.city} ${record.date} 的这条回忆吗？`);
    if (!confirmed) return;

    setDeletingMemoryId(record.id);
    setDeleteError("");

    try {
      await onDelete(city.id, record.id);
      if (editingMemory?.id === record.id) resetForm(true);
    } catch {
      setDeleteError("删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setDeletingMemoryId("");
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      revokePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      event.target.value = "";
      setPhotoError("请先登录后再选择照片");
      return;
    }

    const files = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, maxPhotosPerMemory);
    if (files.length === 0) return;

    revokePhotoDrafts(photoDraftsRef.current);
    const nextPhotoDrafts = files.map((file) => ({
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      file,
    }));

    photoDraftsRef.current = nextPhotoDrafts;
    setPhotoDrafts(nextPhotoDrafts);
    setPhotoError("");
    setSaveError("");
  };

  const handlePolishMemory = async () => {
    if (!isAdmin) {
      setPolishError("请先登录后再使用 AI 润色");
      return;
    }
    if (!trimmedText || polishing) return;

    setPolishing(true);
    setPolishError("");

    try {
      const response = await apiFetch("/ai/memory-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: trimmedText,
          cityId: city.id,
          city: city.name,
          date: normalizedDate ?? trimmedDate,
        }),
      });
      if (!response.ok) throw new Error("Polish failed");
      const data = (await response.json()) as { polishedText?: unknown };
      const nextText = typeof data.polishedText === "string" ? data.polishedText.trim().slice(0, memoryTextMaxLength) : "";
      if (!nextText) throw new Error("Empty polish result");
      setPolishSuggestion(nextText);
    } catch {
      setPolishError("润色失败，请稍后再试");
    } finally {
      if (mountedRef.current) setPolishing(false);
    }
  };

  const handlePickLandmark = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin) {
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
      setLandmarkError("请先登录后再保存地标图");
      return;
    }
    if (!file || !file.type.startsWith("image/") || landmarkSaving) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    let uploadedKey = "";
    try {
      const uploaded = await uploadImage(file, "city-assets");
      uploadedKey = uploaded.key;
      await onSaveLandmark(city.id, uploaded.url);
    } catch {
      await deleteUploaded([uploadedKey]);
      setLandmarkError("地标图片保存失败，请重新选择");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
    }
  };

  const handleDeleteLandmark = async () => {
    if (!isAdmin) {
      setLandmarkError("请先登录后再删除地标图");
      return;
    }

    if (!hasCustomLandmark || landmarkSaving) return;
    const confirmed = window.confirm(`确定删除 ${city.name} 的自定义地标图吗？`);
    if (!confirmed) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    try {
      await onDeleteLandmark(city.id);
    } catch {
      setLandmarkError("地标图片删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setSaveError("请先登录后再保存");
      return;
    }
    if (!canSave) return;
    // 非创建者只保存补充回忆；创建者/新建保存完整回忆（需日期）。
    if (canEditFields && !normalizedDate) return;
    setIsSaving(true);
    setSaveError("");

    let uploadedKeys: string[] = [];
    try {
      if (editingMemory && canAnnotate && !canEditFields) {
        await onUpdate(city.id, editingMemory.id, { partnerNote: partnerNote.trim() });
        resetForm(true);
        setFormOpen(false);
        return;
      }

      if (!normalizedDate) return;

      const uploaded = await uploadImages(photoDrafts.map((photo) => photo.file), "memories");
      uploadedKeys = uploaded.map((item) => item.key);
      const photos = uploaded.map((item) => item.url);
      const nextTags = Array.from(
        new Set(
          tags
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);

      const nextPhotos = photos.length > 0 ? photos : editingMemory?.photos ?? [editingMemory?.image ?? landmarkImage];
      const nextMemory: Memory = {
        id: editingMemory?.id ?? `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        date: normalizedDate,
        image: editingMemory && photos.length === 0 ? editingMemory.image : nextPhotos[0],
        photos: nextPhotos,
        text: trimmedText,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
        createdById: editingMemory?.createdById,
        createdAt: editingMemory?.createdAt,
      };

      if (editingMemory) {
        const patch: MemoryPatchPayload = {
          title: nextMemory.title,
          placeName: nextMemory.placeName,
          date: nextMemory.date,
          image: nextMemory.image,
          text: nextMemory.text,
          mood: nextMemory.mood,
          tags: nextMemory.tags,
          visibility: nextMemory.visibility,
        };
        if (uploaded.length > 0) {
          patch.photos = memoryPhotosPayload(nextMemory.photos ?? [nextMemory.image]);
        }
        await onUpdate(city.id, editingMemory.id, patch);
      }
      else await onSave(city.id, {
        id: `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        date: normalizedDate,
        image: photos[0] ?? landmarkImage,
        photos: photos.length > 0 ? photos : [landmarkImage],
        text: trimmedText,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
      });
      resetForm(true);
      setFormOpen(false);
    } catch {
      await deleteUploaded(uploadedKeys);
      setSaveError("保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const handleSetCover = async (photo: string) => {
    if (!isAdmin) {
      setCoverError("请先登录后再设置封面");
      return;
    }

    if (!memory || memory.image === photo || settingCover) return;
    setSettingCover(photo);
    setCoverError("");

    try {
      await onSetCover(city.id, memory.id, photo);
    } catch {
      setCoverError("封面保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setSettingCover("");
    }
  };

  return (
    <motion.article
      className={`absolute z-50 overflow-y-auto rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7]/94 text-[#5A6670] shadow-[0_18px_42px_rgba(90,102,112,0.18)] backdrop-blur ${
        expanded
          ? "max-h-[min(720px,calc(100vh-92px))] w-[390px] p-6"
          : "max-h-[min(620px,calc(100vh-110px))] w-[292px] p-5"
      }`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      style={
        expanded
          ? { right: 0, top: 12 }
          : {
              left: anchor ? anchor.x : 24,
              top: anchor ? anchor.y : "50%",
            }
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <span className={`h-3 w-3 rounded-sm ${isLit ? "bg-[#E8B8C2]" : "bg-[#D8DDD8]"}`} />
            {city.name}
            <span className="text-sm font-normal text-[#5A6670]/62">{city.nameEn}</span>
          </h2>
          <p className="mt-3 text-sm text-[#5A6670]/76">
            {memory?.date ?? "添加回忆后点亮"}
          </p>
          {!isAdmin && (
            <p className="mt-2 text-xs font-semibold text-[#5A6670]/42">登录后可以修改回忆</p>
          )}
          {isAdmin && memory && !access.canEdit && (
            <p className="mt-2 text-xs font-semibold text-[#5A6670]/42">这是对方写的回忆，你可以添加补充</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D6E8F0]/32 hover:text-[#A8C8DC]"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收起城市记录面板" : "展开城市记录面板"}
            type="button"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28 hover:text-[#5A6670]"
            onClick={onClose}
            aria-label="关闭回忆卡片"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex rounded-[8px] border border-[#D8DDD8]/72 bg-[#FAFBF7]/72 p-1 text-xs font-semibold text-[#5A6670]/58">
          {([
            ["memory", "回忆"],
            ["gallery", "相册"],
            ["history", "历史"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              className={`flex-1 rounded-[7px] px-3 py-2 text-center transition ${
                activeTab === tab ? "bg-[#F5DCE0] text-[#E8B8C2]" : "hover:bg-[#D6E8F0]/30"
              }`}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showMemory && (
        <>
          <div className="mt-4 rounded-[7px] border border-[#D8DDD8]/72 bg-[#FAFBF7]/72 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[6px] border border-[#D8DDD8] bg-[#D6E8F0]">
                <MemoryImage src={landmarkImage} alt={`${city.name} 地标图`} dim={!isLit} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#5A6670]/72">地图地标图</p>
                <p className="mt-1 text-[11px] leading-4 text-[#5A6670]/46">
                  上传后会显示在省份地图里，不需要先点亮城市。
                </p>
              </div>
            </div>
            <input
              ref={landmarkInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={handlePickLandmark}
              disabled={!isAdmin}
            />
            <div className="mt-3 flex gap-2">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#A8C8DC] px-3 py-2 text-xs font-semibold text-[#A8C8DC] transition hover:bg-[#D6E8F0]/34 disabled:opacity-45"
                type="button"
                onClick={() => landmarkInputRef.current?.click()}
                disabled={landmarkSaving || !isAdmin}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {hasCustomLandmark ? "替换地标" : "上传地标"}
              </button>
              {hasCustomLandmark && (
                <button
                  className="grid h-8 w-8 place-items-center rounded-[6px] border border-[#F5DCE0] text-[#E8B8C2] transition hover:bg-[#F5DCE0]/45 disabled:opacity-45"
                  type="button"
                  onClick={handleDeleteLandmark}
                  disabled={landmarkSaving || !isAdmin}
                  aria-label="删除自定义地标图"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {landmarkError && <p className="mt-2 text-xs text-[#E8B8C2]">{landmarkError}</p>}
          </div>

          <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-[6px] border border-[#D8DDD8] bg-[#D6E8F0]">
            <MemoryImage
              src={memory?.image ?? landmarkImage}
              alt={`${city.name} memory`}
              dim={!isLit}
              fit={memory ? "cover" : "contain"}
            />
            {memoryPhotos.length > 1 && (
              <span className="absolute bottom-2 right-2 rounded-[6px] bg-[#FAFBF7]/86 px-2 py-1 text-xs font-medium text-[#5A6670]/78 shadow-[0_6px_14px_rgba(90,102,112,0.12)]">
                {memoryPhotos.length} photos
              </span>
            )}
          </div>

          {memoryPhotos.length > 1 && (
            <div className={`mt-3 grid gap-2 ${expanded ? "grid-cols-5" : "grid-cols-4"}`}>
              {memoryPhotos.map((photo, index) => {
                const isCover = memory?.image === photo;

                return (
                  <button
                    key={`${memory?.id ?? city.id}-photo-${index}`}
                    className={`group relative aspect-square overflow-hidden rounded-[4px] border bg-[#D6E8F0] transition ${
                      isCover
                        ? "border-[#E8B8C2] shadow-[0_0_0_2px_rgba(245,220,224,0.75)]"
                        : "border-[#D8DDD8] hover:border-[#E8B8C2]"
                    }`}
                    type="button"
                    onClick={() => handleSetCover(photo)}
                    aria-label={isCover ? "当前封面" : `将第 ${index + 1} 张照片设为封面`}
                    disabled={!isAdmin || isCover || Boolean(settingCover)}
                  >
                    <MemoryImage src={photo} alt={`${city.name} memory photo ${index + 1}`} fit="cover" />
                    <span
                      className={`absolute inset-x-1 bottom-1 rounded-[4px] bg-[#FAFBF7]/90 px-1.5 py-1 text-[10px] font-medium shadow-[0_4px_10px_rgba(90,102,112,0.10)] transition ${
                        isCover
                          ? "text-[#E8B8C2] opacity-100"
                          : "text-[#5A6670]/68 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isCover ? "封面" : settingCover === photo ? "保存中" : "设封面"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {coverError && <p className="mt-2 text-xs text-[#E8B8C2]">{coverError}</p>}

          {memory ? (
            <div className="mt-4">
              <MemoryContentView memory={memory} cityName={city.name} showPhotos={false} showTitle />
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#5A6670]/82">
              写下第一段回忆后，这座城市会被点亮。
            </p>
          )}
          {memory && localMemoryIds.has(memory.id) && (
            <div className="mt-4 flex gap-2">
              {canEditMemory ? (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#D8DDD8] px-3 py-2 text-xs font-medium text-[#5A6670]/70 transition hover:border-[#A8C8DC] hover:text-[#A8C8DC]"
                  type="button"
                  onClick={() => startEdit(memory)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
              ) : canAnnotateMemory ? (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#F5DCE0] px-3 py-2 text-xs font-medium text-[#E8B8C2] transition hover:bg-[#F5DCE0]/55"
                  type="button"
                  onClick={() => startEdit(memory)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  添加补充
                </button>
              ) : null}
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#F5DCE0] px-3 py-2 text-xs font-medium text-[#E8B8C2] transition hover:bg-[#F5DCE0]/55 disabled:opacity-45"
                type="button"
                onClick={() => handleDelete(memory)}
                disabled={!canEditMemory || deletingMemoryId === memory.id}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingMemoryId === memory.id ? "删除中" : "删除"}
              </button>
            </div>
          )}
          {deleteError && <p className="mt-2 text-xs text-[#E8B8C2]">{deleteError}</p>}
        </>
      )}

      {showGallery && (
        <div className="mt-4">
          {galleryPhotos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {galleryPhotos.map((photo, index) => (
                <span
                  key={`${city.id}-gallery-photo-${index}`}
                  className="relative aspect-square overflow-hidden rounded-[5px] border border-[#D8DDD8] bg-[#D6E8F0]"
                >
                  <MemoryImage src={photo} alt={`${city.name} gallery photo ${index + 1}`} fit="cover" />
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-[7px] border border-dashed border-[#D8DDD8] px-4 py-6 text-center text-sm text-[#5A6670]/56">
              还没有照片，添加第一段回忆后会出现在这里。
            </p>
          )}
        </div>
      )}

      {showHistory && (
        <div className="mt-4 border-t border-dashed border-[#D8DDD8] pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold text-[#5A6670]/70">历史记录</p>
            <span className="text-[11px] text-[#5A6670]/42">{memories.length} 条</span>
          </div>
          <div className={`mt-3 ${expanded ? "space-y-4" : "space-y-3"}`}>
            {memories.map((record, recordIndex) => {
              const recordPhotos = photosOfMemory(record);
              const editable = localMemoryIds.has(record.id);
              // 按每条记录的作者判断权限（历史里各条可能由不同人创建）。
              const recordAccess = computeMemoryEditAccess(record);
              const canEditRecord = editable && isAdmin && recordAccess.canEdit;
              const canAnnotateRecord = editable && isAdmin && recordAccess.canAddNote && !recordAccess.canEdit;

              return (
                <article
                  key={record.id}
                  className="rounded-[7px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/72 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#5A6670]/70">{record.date}</p>
                    <div className="flex items-center gap-1.5">
                      {recordIndex === 0 && (
                        <span className="rounded-full bg-[#F5DCE0]/82 px-2 py-0.5 text-[10px] font-medium text-[#E8B8C2]">
                          最新
                        </span>
                      )}
                      {editable ? (
                        <>
                          {canEditRecord && (
                            <button
                              className="grid h-6 w-6 place-items-center rounded-[5px] text-[#5A6670]/46 transition hover:bg-[#D6E8F0]/34 hover:text-[#A8C8DC]"
                              type="button"
                              onClick={() => startEdit(record)}
                              aria-label={`编辑 ${record.city} ${record.date} 回忆`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canAnnotateRecord && (
                            <button
                              className="grid h-6 w-6 place-items-center rounded-[5px] text-[#E8B8C2]/70 transition hover:bg-[#F5DCE0]/46 hover:text-[#E8B8C2]"
                              type="button"
                              onClick={() => startEdit(record)}
                              aria-label={`给 ${record.city} ${record.date} 回忆添加补充`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            className="grid h-6 w-6 place-items-center rounded-[5px] text-[#5A6670]/46 transition hover:bg-[#F5DCE0]/46 hover:text-[#E8B8C2] disabled:opacity-40"
                            type="button"
                            onClick={() => handleDelete(record)}
                            disabled={!canEditRecord || deletingMemoryId === record.id}
                            aria-label={`删除 ${record.city} ${record.date} 回忆`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-[#5A6670]/36">示例</span>
                      )}
                    </div>
                  </div>
                  {record.title && <p className="mt-2 text-sm font-semibold text-[#5A6670]">{record.title}</p>}
                  <p className="mt-2 text-xs leading-5 text-[#5A6670]/72">{record.text}</p>
                  {(record.mood || record.tags?.length) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {record.mood && (
                        <span className="rounded-full bg-[#D6E8F0]/42 px-2 py-0.5 text-[10px] font-semibold text-[#5A6670]/58">
                          {record.mood}
                        </span>
                      )}
                      {record.tags?.slice(0, 4).map((tag) => (
                        <span
                          key={`${record.id}-history-tag-${tag}`}
                          className="rounded-full bg-[#FAFBF7]/80 px-2 py-0.5 text-[10px] font-semibold text-[#5A6670]/46"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {recordPhotos.length > 0 && (
                    <div className={`mt-3 grid gap-1.5 ${expanded ? "grid-cols-6" : "grid-cols-5"}`}>
                      {recordPhotos.slice(0, expanded ? 12 : 10).map((photo, photoIndex) => (
                        <span
                          key={`${record.id}-timeline-photo-${photoIndex}`}
                          className="relative aspect-square overflow-hidden rounded-[4px] border border-[#D8DDD8] bg-[#D6E8F0]"
                        >
                          <MemoryImage
                            src={photo}
                            alt={`${city.name} history photo ${photoIndex + 1}`}
                            fit="cover"
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {showMemory && !formOpen && (
        <button
          className="mt-4 flex w-full items-center gap-2 border-t border-dashed border-[#D8DDD8] pt-4 text-sm font-medium text-[#5A6670]/78 transition hover:text-[#A8C8DC]"
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={!isAdmin}
        >
          <Plus className="h-4 w-4" />
          {isLit ? "Add memory" : "Add memory to light"}
        </button>
      )}

      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div
            key="memory-form"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
          >
            <div className="mt-4 space-y-3 border-t border-dashed border-[#D8DDD8] pt-4">
              {canEditFields && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-[#5A6670]/70">标题</span>
                    <input
                      className="mt-1.5 w-full rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="例如：第一次一起看海"
                      maxLength={120}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-[#5A6670]/70">具体地点</span>
                    <input
                      className="mt-1.5 w-full rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                      type="text"
                      value={placeName}
                      onChange={(event) => setPlaceName(event.target.value)}
                      placeholder={`${city.name} 的某条街、某家店、某个角落`}
                      maxLength={120}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-[#5A6670]/70">日期</span>
                    <DatePicker
                      className="mt-1.5 w-full rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                      value={date}
                      onChange={setDate}
                      aria-invalid={dateInvalid}
                    />
                    {dateInvalid && (
                      <span className="mt-1.5 block text-xs text-[#E8B8C2]">
                        请使用 2024.05.20 或 2024.5.20 格式
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="flex items-center justify-between gap-3 text-xs font-medium text-[#5A6670]/70">
                      一句话回忆
                      <span className="font-normal text-[#5A6670]/45">
                        {text.length}/{memoryTextMaxLength}
                      </span>
                    </span>
                    <textarea
                      className="mt-1.5 w-full resize-none rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm leading-6 text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                      rows={3}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        setPolishSuggestion("");
                        setPolishError("");
                      }}
                      placeholder="写下这一刻……"
                      maxLength={memoryTextMaxLength}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-[#5A6670]/70">心情</span>
                      <input
                        className="mt-1.5 w-full rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                        type="text"
                        value={mood}
                        onChange={(event) => setMood(event.target.value)}
                        placeholder="开心、想念、松弛..."
                        maxLength={40}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[#5A6670]/70">标签</span>
                      <input
                        className="mt-1.5 w-full rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                        type="text"
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="海边，夜景，第一次"
                        maxLength={120}
                      />
                    </label>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-[#5A6670]/70">可见性</span>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {[
                        ["both", "给我们看"],
                        ["me", "只给我"],
                        ["her", "只给她"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={`rounded-[6px] border px-2 py-2 text-xs font-semibold transition ${
                            visibility === value
                              ? "border-[#F5DCE0] bg-[#F5DCE0]/62 text-[#B85D70]"
                              : "border-[#D8DDD8] bg-[#FAFBF7] text-[#5A6670]/58 hover:border-[#A8C8DC]"
                          }`}
                          type="button"
                          onClick={() => setVisibility(value as "both" | "me" | "her")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[#F5DCE0] bg-[#F5DCE0]/42 px-3 text-xs font-semibold text-[#E8B8C2] transition hover:bg-[#F5DCE0]/70 disabled:cursor-not-allowed disabled:opacity-45"
                      type="button"
                      onClick={handlePolishMemory}
                      disabled={!trimmedText || polishing}
                    >
                      {polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {polishing ? "润色中" : "AI 润色"}
                    </button>
                    {polishSuggestion && (
                      <div className="rounded-[7px] border border-[#F5DCE0]/76 bg-white/54 p-3">
                        <p className="text-xs leading-5 text-[#5A6670]/72">{polishSuggestion}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="rounded-[6px] bg-[#F5DCE0] px-3 py-1.5 text-xs font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7]"
                            type="button"
                            onClick={() => {
                              setText(polishSuggestion.slice(0, memoryTextMaxLength));
                              setPolishSuggestion("");
                              setPolishError("");
                            }}
                          >
                            采用
                          </button>
                          <button
                            className="rounded-[6px] border border-[#D8DDD8] px-3 py-1.5 text-xs font-semibold text-[#5A6670]/66 transition hover:border-[#A8C8DC] hover:text-[#A8C8DC]"
                            type="button"
                            onClick={handlePolishMemory}
                            disabled={polishing}
                          >
                            重新润色
                          </button>
                          <button
                            className="rounded-[6px] px-3 py-1.5 text-xs font-semibold text-[#5A6670]/52 transition hover:bg-[#D8DDD8]/28"
                            type="button"
                            onClick={() => {
                              setPolishSuggestion("");
                              setPolishError("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {polishError && <p className="text-xs text-[#E8B8C2]">{polishError}</p>}
                  </div>

                  <div>
                    <span className="text-xs font-medium text-[#5A6670]/70">照片</span>
                    <input
                      ref={fileInputRef}
                      className="hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePickFile}
                    />
                    <button
                      className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-[#D8DDD8] bg-[#FAFBF7] px-3 py-3 text-sm text-[#5A6670]/70 transition hover:border-[#E8B8C2] hover:text-[#E8B8C2]"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {photoDrafts.length > 0 ? (
                        <span className="relative w-full">
                          <span className="grid grid-cols-4 gap-2">
                            {photoDrafts.slice(0, 8).map((photo, index) => (
                              <span
                                key={`${photo.previewUrl}-${index}`}
                                className="relative aspect-square overflow-hidden rounded-[4px] bg-[#D6E8F0]"
                              >
                                <LocalPrivacyImg
                                  className="pixelated h-full w-full object-cover"
                                  src={photo.previewUrl}
                                  alt={photo.name || `照片预览 ${index + 1}`}
                                />
                              </span>
                            ))}
                          </span>
                          <span className="mt-2 block text-xs text-[#5A6670]/58">
                            已选择 {photoDrafts.length} 张
                          </span>
                        </span>
                      ) : (
                        <>
                          <ImagePlus className="h-4 w-4" />
                          选择本地图片，可多选
                        </>
                      )}
                    </button>
                    {photoError && (
                      <span className="mt-1.5 block text-xs text-[#E8B8C2]">{photoError}</span>
                    )}
                  </div>
                </>
              )}

              {canAnnotate && (
                <label className="block">
                  <span className="text-xs font-medium text-[#5A6670]/70">补充回忆</span>
                  <textarea
                    className="mt-1.5 w-full resize-none rounded-[6px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm leading-6 text-[#5A6670] placeholder:text-[#5A6670]/40 outline-none transition focus:border-[#E8B8C2]"
                    rows={4}
                    value={partnerNote}
                    onChange={(event) => setPartnerNote(event.target.value)}
                    placeholder="留给另一个人的一句补充..."
                    maxLength={500}
                  />
                </label>
              )}

              <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-[#D8DDD8]/70 bg-[#FAFBF7]/96 px-5 pb-1 pt-3 shadow-[0_-10px_18px_rgba(250,251,247,0.88)] backdrop-blur">
                <button
                  className="flex-1 rounded-[6px] bg-[#F5DCE0] px-3 py-2 text-sm font-medium text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:cursor-not-allowed disabled:opacity-45"
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isSaving ? "保存中" : canAnnotate ? "保存补充" : isEditing ? "保存修改" : "保存回忆"}
                </button>
                <button
                  className="rounded-[6px] px-3 py-2 text-sm text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28 hover:text-[#5A6670]"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    resetForm(true);
                    setFormOpen(false);
                  }}
                >
                  取消
                </button>
              </div>
              {saveError && <p className="text-xs text-[#E8B8C2]">{saveError}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function MemoryImage({
  src,
  alt,
  dim = false,
  fit = "contain",
}: Readonly<{ src: string; alt: string; dim?: boolean; fit?: "contain" | "cover" }>) {
  const objectClass = fit === "cover" ? "object-cover" : "object-contain";
  const className = `pixelated h-full w-full ${objectClass} ${dim ? "opacity-50 grayscale" : ""}`;

  if (isBrowserImageUrl(src)) {
    return (
      <LocalPrivacyImg className={className} src={src} alt={alt} />
    );
  }

  return (
    <LocalPrivacyImage
      className={`pixelated ${objectClass} ${dim ? "opacity-50 grayscale" : ""}`}
      src={src}
      alt={alt}
      fill
      sizes="292px"
    />
  );
}

function LandmarkSprite({ city, lit }: Readonly<{ city: City; lit: boolean }>) {
  const className = `pixelated h-full w-full object-contain transition duration-500 ${
    lit
      ? "drop-shadow-[0_10px_18px_rgba(90,102,112,0.14)]"
      : "opacity-50 grayscale drop-shadow-[0_8px_14px_rgba(90,102,112,0.08)]"
  }`;

  if (isDataImageUrl(city.sprite)) {
    return (
      <LocalPrivacyImg className={className} src={city.sprite} alt={city.landmark} />
    );
  }

  return (
    <Image
      className={className}
      src={city.sprite}
      alt={city.landmark}
      fill
      loading="eager"
      sizes="112px"
      unoptimized
    />
  );
}
