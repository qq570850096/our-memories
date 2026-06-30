"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cityRegionPath } from "@/lib/cityGeo";
import { chinaFeatures, makePath, makeProjectionForProvince, provinceIdOf } from "@/lib/geo";
import { buildMemoryRoutePoints, curvedRoutePath } from "@/lib/memoryRoutes";
import { getCitiesByProvince, type City } from "@/data/cities";
import { getLitCityIds, memoryStoreUpdatedEvent, type LocalMemoryStore } from "@/data/progress";
import type { Province } from "@/data/provinces";
import { adminModeUpdatedEvent } from "@/data/adminMode";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { createSignal } from "@/lib/signals";
import { useApi } from "@/lib/swr";
import { useToast } from "@/components/ui/toast";
import {
  type CardAnchor,
  cityListPanelWidth,
  memoryCardGap,
  memoryCardMaxHeight,
  memoryCardWidth,
  stableCoordinate,
  type ProvinceRoutePoint,
} from "./ProvinceMap/shared";
import { CityListPanel } from "./ProvinceMap/CityListPanel";
import { ProvinceMapCanvas } from "./ProvinceMap/ProvinceMapCanvas";
import { ProvinceMapOverlay } from "./ProvinceMap/ProvinceMapOverlay";
import { useCitySelection } from "./ProvinceMap/useCitySelection";
import { useMapCamera } from "./ProvinceMap/useMapCamera";
import { useProvinceMapData } from "./ProvinceMap/useProvinceMapData";

interface ProvinceMapProps {
  province: Province;
  width?: number;
  height?: number;
}

export default function ProvinceMap({ province, width = 1120, height = 760 }: ProvinceMapProps) {
  const isAdmin = useContentEditAccess();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const signalPressTimerRef = useRef<ReturnType<Window["setTimeout"]> | null>(null);
  const sentSignalTimerRef = useRef<ReturnType<Window["setTimeout"]> | null>(null);
  const [sentSignalCityId, setSentSignalCityId] = useState<string | null>(null);
  const { data: signalData, mutate: refreshSignals } = useApi<{
    signals: Array<{ id: string; cityId: string; expiresAt: string }>;
  }>("/signals");
  const {
    frameRef,
    camera,
    cameraRef,
    dragging,
    frameScale,
    setCamera,
    zoomFromCenter,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    consumeDragMoved,
    resetCamera: resetCameraPosition,
  } = useMapCamera({ width });
  const {
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
  } = useProvinceMapData({ provinceId: province.id, isAdmin });
  const provinceCities = useMemo(() => getCitiesByProvince(province.id), [province.id]);
  const litCityIds = useMemo(() => getLitCityIds(localMemories), [localMemories]);
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

  const mapGeometry = useMemo(() => {
    const projection = makeProjectionForProvince(province.id, width, height, 88);
    const path = makePath(projection);
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
  }, [cityRegions, height, province.id, provinceCities, width]);

  const focusCity = useCallback(
    (city: Pick<City, "id">) => {
      const point = mapGeometry.cities.find((candidate) => candidate.city.id === city.id);
      if (!point) return;

      const scale = Math.max(cameraRef.current.scale, 1.62);
      setCamera({
        scale,
        x: width / 2 - point.x * scale - 150,
        y: height / 2 - point.y * scale + 12,
      });
    },
    [cameraRef, height, mapGeometry.cities, setCamera, width],
  );

  const {
    selectedCity,
    selectedCityId,
    setSelectedCityId,
    nudgedCityId,
    sparkedCityId,
    previewCityId,
    setPreviewCityId,
    mobileSheetMode,
    handleSelectCity,
    clearSelection,
    clearLongPressPreview,
    beginLongPressPreview,
  } = useCitySelection({
    provinceCities,
    litCityIds,
    isAdmin,
    loadCityMemories,
    focusCity,
  });

  useEffect(() => {
    let cancelled = false;
    const handleMemoryUpdate = (event: Event) => {
      if (cancelled) return;
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) applyMemoryUpdate(detail, selectedCityId);
    };
    const reloadRemoteState = () => refreshRemoteState(selectedCityId);

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
  }, [applyMemoryUpdate, refreshRemoteState, selectedCityId]);

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
          memory: localMemory,
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
  const signalCityIds = useMemo(() => {
    return new Set(
      (signalData?.signals ?? [])
        .map((signal) => signal.cityId),
    );
  }, [signalData?.signals]);

  const routePoints = useMemo(() => {
    const pointByCityId = new Map(mapCities.map((city) => [city.id, { x: city.x, y: city.y }]));

    return buildMemoryRoutePoints(localMemories, province.id)
      .map((point) => {
        const projected = pointByCityId.get(point.city.id);
        return projected ? { ...point, ...projected } : null;
      })
      .filter(Boolean) as ProvinceRoutePoint[];
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

  const resetCamera = useCallback(() => {
    clearSelection();
    resetCameraPosition();
  }, [clearSelection, resetCameraPosition]);

  const clearSignalPress = useCallback(() => {
    if (signalPressTimerRef.current) {
      window.clearTimeout(signalPressTimerRef.current);
      signalPressTimerRef.current = null;
    }
  }, []);

  const sendSignal = useCallback(
    async (cityId: string) => {
      clearSignalPress();
      try {
        await createSignal(cityId);
        setSentSignalCityId(cityId);
        void refreshSignals();
        toast("已发送想你信号", "success", 1600);
        if (sentSignalTimerRef.current) window.clearTimeout(sentSignalTimerRef.current);
        sentSignalTimerRef.current = window.setTimeout(() => setSentSignalCityId(null), 1800);
      } catch {
        toast("信号发送失败", "error", 1800);
      }
    },
    [clearSignalPress, refreshSignals, toast],
  );

  const beginSignalPress = useCallback(
    (cityId: string) => {
      clearSignalPress();
      signalPressTimerRef.current = window.setTimeout(() => {
        void sendSignal(cityId);
      }, 720);
    },
    [clearSignalPress, sendSignal],
  );

  useEffect(() => {
    return () => {
      clearSignalPress();
      if (sentSignalTimerRef.current) window.clearTimeout(sentSignalTimerRef.current);
    };
  }, [clearSignalPress]);

  useEffect(() => {
    const cityId = new URLSearchParams(window.location.search).get("city");
    const city = provinceCities.find((candidate) => candidate.id === cityId);
    if (!city) return;

    const timer = window.setTimeout(() => {
      handleSelectCity(city.id, litCityIds.has(city.id));
    }, 0);

    return () => window.clearTimeout(timer);
    // Run after city coordinates are projected so deep links can focus the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province.id]);

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
        if (consumeDragMoved()) return;
        const target = event.target as HTMLElement;
        if (!target.closest("button, article")) clearSelection();
      }}
    >
      <ProvinceMapCanvas
        province={province}
        width={width}
        height={height}
        frameScale={frameScale}
        camera={camera}
        mapGeometry={mapGeometry}
        mapCities={mapCities}
        selectedCityId={selectedCityId}
        nudgedCityId={nudgedCityId}
        sparkedCityId={sparkedCityId}
        previewCityId={previewCityId}
        travelRoute={travelRoute}
        routePoints={routePoints}
        signalCityIds={signalCityIds}
        sentSignalCityId={sentSignalCityId}
        setPreviewCityId={setPreviewCityId}
        handleSelectCity={handleSelectCity}
        beginSignalPress={beginSignalPress}
        clearSignalPress={clearSignalPress}
        clearLongPressPreview={clearLongPressPreview}
        beginLongPressPreview={beginLongPressPreview}
      />

      <CityListPanel
        provinceName={province.name}
        cityCount={provinceCities.length}
        cities={cityList}
        litCityIds={litCityIds}
        selectedCityId={selectedCityId}
        onSelectCity={handleSelectCity}
      />

      <ProvinceMapOverlay
        selectedCity={selectedCity}
        isMobile={isMobile}
        isAdmin={isAdmin}
        cameraScale={camera.scale}
        localMemories={localMemories}
        litCityIds={litCityIds}
        cityAssets={cityAssets}
        cardAnchor={cardAnchor}
        mobileSheetMode={mobileSheetMode}
        onZoomOut={() => zoomFromCenter(0.88)}
        onZoomIn={() => zoomFromCenter(1.12)}
        onResetCamera={resetCamera}
        onCloseCity={() => setSelectedCityId(null)}
        onSave={saveMemory}
        onOptimisticSave={beginSaveMemory}
        onSetCover={saveMemoryCover}
        onUpdate={updateMemoryRecord}
        onDelete={deleteMemoryRecord}
        onSaveLandmark={saveCityAsset}
        onDeleteLandmark={deleteCityAsset}
      />
    </div>
  );
}
