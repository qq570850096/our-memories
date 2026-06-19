"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  chinaFeatures,
  dashLineFeature,
  makePath,
  makeProjection,
  makeProjectionForFeature,
  provinceIdOf,
} from "@/lib/geo";
import {
  getLitCityIds,
  getLitProvinceIds,
  memoryStoreUpdatedEvent,
  type LocalMemoryStore,
} from "@/data/progress";
import { buildMemoryRoutePoints, curvedRoutePath } from "@/lib/memoryRoutes";
import { provinces } from "@/data/provinces";
import { apiFetch } from "@/lib/apiClient";
import Image from "next/image";
import { cities } from "@/data/cities";
import { memoryTime, type Memory } from "@/data/memories";
import { useIsMobile } from "@/lib/useIsMobile";

interface ChinaMapProps {
  width?: number;
  height?: number;
  className?: string;
}

const colors = {
  cream: "#FAFBF7",
  dim: "#D8DDD8",
  ink: "#5A6670",
  sakura: "#F5DCE0",
  bloom: "#E8B8C2",
  sky: "#A8C8DC",
};

const provinceById = new Map(provinces.map((province) => [province.id, province]));
const cityById = new Map(cities.map((city) => [city.id, city]));
const easyTapProvinceIds = new Set(["hongkong", "macau"]);
const maxZoom = 1.45;
const minZoom = 1;
const stableCoordinate = (value: number) => Number(value.toFixed(3));

// The South China Sea ten-dash line, drawn as a small standalone inset box so it
// is always visible and never overlapped by floating cards on the main map.
export function SouthChinaSeaInset({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const inset = useMemo(() => {
    if (!dashLineFeature) return null;

    const insetWidth = compact ? 70 : 116;
    const insetHeight = compact ? 96 : 162;
    const projection = makeProjectionForFeature(dashLineFeature, insetWidth, insetHeight, compact ? 8 : 12);
    const path = makePath(projection);

    return { width: insetWidth, height: insetHeight, d: path(dashLineFeature as never) ?? "" };
  }, [compact]);

  if (!inset || !inset.d) return null;

  return (
    <div className="w-fit shrink-0 rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 p-1 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur">
      <svg
        width={inset.width}
        height={inset.height}
        viewBox={`0 0 ${inset.width} ${inset.height}`}
        role="img"
        aria-label="南海诸岛"
      >
        <path
          d={inset.d}
          fill={colors.ink}
          fillOpacity="0.55"
          stroke={colors.ink}
          strokeOpacity="0.5"
          strokeWidth="0.8"
        />
        <text
          x={inset.width / 2}
          y={inset.height - 5}
          textAnchor="middle"
          fontSize={compact ? "7" : "9"}
          fontWeight="600"
          fill={colors.ink}
          fillOpacity="0.6"
        >
          南海诸岛
        </text>
      </svg>
    </div>
  );
}

export default function ChinaMap({ width = 1100, height = 860, className }: ChinaMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [localMemories, setLocalMemories] = useState<LocalMemoryStore>({});
  const [zoom, setZoom] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) setLocalMemories(detail);
    };

    async function loadLocalMemories() {
      const response = await apiFetch("/memories", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;

      const data = (await response.json().catch(() => null)) as
        | { memories?: LocalMemoryStore }
        | null;

      if (!cancelled && data?.memories) setLocalMemories(data.memories);
    }

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    loadLocalMemories();

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const provinceStats = useMemo(() => {
    const stats = new Map<string, { count: number; cities: Set<string>; latest?: Memory }>();
    Object.values(localMemories)
      .flat()
      .forEach((memory) => {
        const city = cityById.get(memory.cityId);
        if (!city) return;
        const entry = stats.get(city.provinceId) ?? { count: 0, cities: new Set<string>() };
        entry.count += 1;
        entry.cities.add(city.id);
        if (!entry.latest || memoryTime(memory) > memoryTime(entry.latest)) entry.latest = memory;
        stats.set(city.provinceId, entry);
      });
    return stats;
  }, [localMemories]);

  const litProvinceIds = useMemo(
    () => getLitProvinceIds(getLitCityIds(localMemories)),
    [localMemories],
  );

  const mapPaths = useMemo(() => {
    const projection = makeProjection(width, height, 24);
    const path = makePath(projection);

    return chinaFeatures.map((feature) => {
      const id = provinceIdOf(feature);
      const [cx, cy] = path.centroid(feature as never);

      return {
        id,
        d: path(feature as never) ?? "",
        x: stableCoordinate(cx),
        y: stableCoordinate(cy),
        province: provinceById.get(id),
      };
    });
  }, [height, width]);

  const route = useMemo(() => {
    const projection = makeProjection(width, height, 24);
    const points = buildMemoryRoutePoints(localMemories)
      .map((point) => {
        const projected = projection([point.city.lng, point.city.lat]);
        if (!projected) return null;

        return {
          ...point,
          x: stableCoordinate(projected[0]),
          y: stableCoordinate(projected[1]),
        };
      })
      .filter(Boolean) as Array<ReturnType<typeof buildMemoryRoutePoints>[number] & { x: number; y: number }>;

    return {
      points,
      d: curvedRoutePath(points),
    };
  }, [height, localMemories, width]);

  const activeId = selectedProvinceId ?? hoveredId;
  const activePath = activeId ? mapPaths.find((path) => path.id === activeId) : undefined;
  const activeStats = activeId ? provinceStats.get(activeId) : undefined;
  const activeCover = activeStats?.latest?.image || activeStats?.latest?.photos?.[0] || null;
  const previewFlip = activePath ? activePath.x > width * 0.58 : false;
  const zoomProgress = ((zoom - minZoom) / (maxZoom - minZoom)) * 100;
  const setClampedZoom = (nextZoom: number) => {
    setZoom(Math.min(Math.max(nextZoom, minZoom), maxZoom));
  };

  const goProvince = (id: string) => {
    router.push(`/province/${id}`);
  };

  const goProvinceCity = (provinceId: string, cityId: string) => {
    router.push(`/province/${provinceId}?city=${cityId}`);
  };

  // 桌面点击即进省（hover 已预览）；移动端先选中预览，再次点同省或点「进入」才跳转。
  const handleProvinceTap = (id: string) => {
    if (!isMobile || selectedProvinceId === id) {
      goProvince(id);
      return;
    }
    setSelectedProvinceId(id);
  };

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-[#D8DDD8]/85 bg-[#FAFBF7]/86 px-1.5 py-1.5 shadow-[0_12px_28px_rgba(90,102,112,0.1)] backdrop-blur sm:left-4 sm:right-auto sm:gap-2 sm:px-2 sm:py-3">
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-[#5A6670] transition hover:bg-[#D6E8F0]/42 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setClampedZoom(zoom + 0.15)}
          disabled={zoom >= maxZoom}
          aria-label="放大中国地图"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="hidden h-9 min-w-12 items-center justify-center px-1 sm:flex sm:min-h-28 sm:w-9 sm:min-w-0 sm:flex-col sm:gap-2 sm:px-0">
          <input
            className="map-zoom-slider hidden sm:block"
            type="range"
            min={minZoom}
            max={maxZoom}
            step="0.01"
            value={zoom}
            onChange={(event) => setClampedZoom(Number(event.target.value))}
            aria-label="拖动缩放中国地图"
            style={{ "--zoom-progress": `${zoomProgress}%` } as CSSProperties}
          />
          <span className="text-[10px] font-semibold leading-none text-[#5A6670]/58">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-[#5A6670] transition hover:bg-[#F5DCE0]/55 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setClampedZoom(zoom - 0.15)}
          disabled={zoom <= minZoom}
          aria-label="缩小中国地图"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-full text-[#5A6670] transition hover:bg-[#D4E8D0]/48 disabled:opacity-35 sm:h-9 sm:w-9"
          type="button"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
          aria-label="重置中国地图缩放"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <motion.div
        className="relative h-full w-full overflow-visible"
        animate={{ scale: zoom }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        style={{ transformOrigin: "55% 58%" }}
      >
        <div
          className="map-visual-scale relative h-full w-full overflow-visible"
          onClick={() => setSelectedProvinceId(null)}
        >
          <svg
            className="h-full w-full overflow-visible drop-shadow-[0_16px_26px_rgba(168,200,220,0.18)]"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="China map with visited provinces highlighted"
          >
            <defs>
              <filter id="visitedGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={colors.bloom} floodOpacity="0.42" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <pattern id="softPixelTexture" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M0 0h2v2H0z" fill={colors.cream} opacity="0.26" />
                <path d="M5 5h1.5v1.5H5z" fill={colors.sky} opacity="0.08" />
              </pattern>
              <linearGradient id="memoryRouteGradient" x1="0%" x2="100%" y1="15%" y2="85%">
                <stop offset="0%" stopColor={colors.bloom} stopOpacity="0.78" />
                <stop offset="48%" stopColor={colors.sky} stopOpacity="0.86" />
                <stop offset="100%" stopColor="#D4E8D0" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            <g shapeRendering="geometricPrecision">
              {mapPaths.map((path) => {
                const lit = litProvinceIds.has(path.id);

                return (
                  <path
                    key={`${path.id}-glow`}
                    d={path.d}
                    fill="none"
                    stroke={lit ? colors.bloom : "transparent"}
                    strokeWidth={lit ? 10 : 0}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={lit ? 0.18 : 0}
                    filter={lit ? "url(#visitedGlow)" : undefined}
                    pointerEvents="none"
                  />
                );
              })}

              {mapPaths.map((path) => {
                const isHovered = hoveredId === path.id;
                const lit = litProvinceIds.has(path.id);

                return (
                  <path
                    key={path.id}
                    d={path.d}
                    fill={lit ? colors.sakura : colors.dim}
                    fillOpacity={lit ? 0.68 : 0.34}
                    stroke={lit ? colors.bloom : colors.ink}
                    strokeOpacity={lit ? 0.95 : 0.24}
                    strokeWidth={lit ? 2.2 : 1.25}
                    strokeLinejoin="round"
                    className="cursor-pointer transition-all duration-300"
                    filter={lit || isHovered ? "url(#visitedGlow)" : undefined}
                    onMouseEnter={() => setHoveredId(path.id)}
                    onMouseLeave={() =>
                      setHoveredId((current) => (current === path.id ? null : current))
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      handleProvinceTap(path.id);
                    }}
                  />
                );
              })}

              {mapPaths
                .filter((path) => easyTapProvinceIds.has(path.id))
                .map((path) => (
                  <g key={`${path.id}-easy-tap`}>
                    <circle
                      cx={path.x}
                      cy={path.y}
                      r={path.id === "macau" ? 18 : 24}
                      fill={colors.sakura}
                      fillOpacity={hoveredId === path.id ? 0.22 : 0.08}
                      stroke={colors.bloom}
                      strokeOpacity={hoveredId === path.id ? 0.5 : 0.18}
                      strokeWidth="1.5"
                      className="cursor-pointer transition-all duration-300"
                      onMouseEnter={() => setHoveredId(path.id)}
                      onMouseLeave={() =>
                        setHoveredId((current) => (current === path.id ? null : current))
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleProvinceTap(path.id);
                      }}
                    />
                    <circle
                      cx={path.x}
                      cy={path.y}
                      r="3.5"
                      fill={colors.bloom}
                      opacity="0.55"
                      pointerEvents="none"
                    />
                  </g>
                ))}

              {mapPaths.map((path) =>
                litProvinceIds.has(path.id) ? (
                  <path
                    key={`${path.id}-inner`}
                    d={path.d}
                    fill="url(#softPixelTexture)"
                    stroke={colors.cream}
                    strokeOpacity="0.9"
                    strokeWidth="1"
                    pointerEvents="none"
                  />
                ) : null,
              )}

              {!reduceMotion && selectedProvinceId && activePath && (
                <motion.path
                  key={`${selectedProvinceId}-spark`}
                  d={activePath.d}
                  fill="none"
                  stroke={colors.bloom}
                  strokeWidth="2.5"
                  pointerEvents="none"
                  filter="url(#visitedGlow)"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  initial={{ opacity: 0.7, scale: 1 }}
                  animate={{ opacity: [0.7, 0], scale: [1, 1.06] }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              )}

              {route.d && (
                <motion.path
                  d={route.d}
                  fill="none"
                  stroke="url(#memoryRouteGradient)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="8 10"
                  strokeOpacity="0.76"
                  pointerEvents="none"
                  initial={{ pathLength: reduceMotion ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 1.15, ease: "easeInOut" }}
                />
              )}

              {route.points.map((point) => (
                <g key={`${point.memory.id}-china-route-node`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="14"
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      goProvinceCity(point.city.provinceId, point.city.id);
                    }}
                  >
                    <title>{`${point.city.name} · 第 ${point.order} 站`}</title>
                  </circle>
                  <circle cx={point.x} cy={point.y} r="7" fill={colors.cream} fillOpacity="0.92" pointerEvents="none" />
                  <circle cx={point.x} cy={point.y} r="3.6" fill={colors.bloom} fillOpacity="0.88" pointerEvents="none" />
                  {route.points.length <= 12 && (
                    <text
                      x={point.x}
                      y={point.y - 9}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={colors.ink}
                      fillOpacity="0.58"
                      pointerEvents="none"
                    >
                      {point.order}
                    </text>
                  )}
                </g>
              ))}
            </g>
          </svg>

          {activePath?.province && (
            <motion.div
              key={activePath.id}
              className={`absolute z-40 w-[212px] overflow-hidden rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/96 text-[#5A6670] shadow-[0_14px_32px_rgba(90,102,112,0.14)] backdrop-blur ${isMobile ? "" : "pointer-events-none"}`}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.16 }}
              style={{
                left: `${(activePath.x / width) * 100}%`,
                top: `${(activePath.y / height) * 100}%`,
                transform: previewFlip
                  ? "translate(calc(-100% - 14px), -50%)"
                  : "translate(14px, -50%)",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-2.5 p-2.5">
                {activeCover ? (
                  <Image
                    src={activeCover}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                    className="pixelated h-12 w-12 shrink-0 rounded-[6px] border border-[#D8DDD8] object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[6px] border border-[#D8DDD8] bg-[#D8DDD8]/40 text-[10px] font-medium text-[#5A6670]/45">
                    未点亮
                  </span>
                )}
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold text-[#5A6670]">
                      {activePath.province.name}
                    </span>
                    <span className="truncate text-[11px] text-[#5A6670]/55">
                      {activePath.province.nameEn}
                    </span>
                  </div>
                  {activeStats ? (
                    <>
                      <div className="mt-1 text-[11px] font-medium text-[#E8B8C2]">
                        {activeStats.count} 条回忆 · 点亮 {activeStats.cities.size} 城
                      </div>
                      {activeStats.latest && (
                        <div className="mt-0.5 truncate text-[11px] text-[#5A6670]/55">
                          {activeStats.latest.title || activeStats.latest.text || "最近的回忆"}
                          {activeStats.latest.date ? ` · ${activeStats.latest.date}` : ""}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 text-[11px] text-[#5A6670]/55">还没有回忆，去点亮 →</div>
                  )}
                </div>
              </div>
              {isMobile && (
                <button
                  type="button"
                  className="block w-full border-t border-[#D8DDD8]/64 bg-white/45 px-3 py-2 text-center text-[12px] font-semibold text-[#5A6670] transition hover:bg-[#F5DCE0]/45"
                  onClick={(event) => {
                    event.stopPropagation();
                    goProvince(activeId!);
                  }}
                >
                  进入 {activePath.province.name} →
                </button>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
