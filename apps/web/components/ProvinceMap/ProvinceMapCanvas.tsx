"use client";

import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Province } from "@/data/provinces";
import {
  colors,
  getMarkerLayout,
  spring,
  type MapCamera,
  type ProvinceMapCity,
  type ProvinceMapGeometry,
  type ProvinceRoutePoint,
} from "./shared";
import { CityMarker } from "./CityMarker";
import { CityPreviewPopover } from "./CityPreviewPopover";
import { SignalLayer } from "./SignalLayer";

type ProvinceMapCanvasProps = {
  province: Province;
  width: number;
  height: number;
  frameScale: number;
  camera: MapCamera;
  mapGeometry: ProvinceMapGeometry;
  mapCities: ProvinceMapCity[];
  selectedCityId: string | null;
  nudgedCityId: string | null;
  sparkedCityId: string | null;
  previewCityId: string | null;
  travelRoute: string;
  routePoints: ProvinceRoutePoint[];
  signalCityIds: Set<string>;
  sentSignalCityId: string | null;
  setPreviewCityId: Dispatch<SetStateAction<string | null>>;
  handleSelectCity: (cityId: string, lit: boolean) => void;
  beginSignalPress: (cityId: string) => void;
  clearSignalPress: () => void;
  clearLongPressPreview: () => void;
  beginLongPressPreview: (cityId: string) => void;
};

export function ProvinceMapCanvas({
  province,
  width,
  height,
  frameScale,
  camera,
  mapGeometry,
  mapCities,
  selectedCityId,
  nudgedCityId,
  sparkedCityId,
  previewCityId,
  travelRoute,
  routePoints,
  signalCityIds,
  sentSignalCityId,
  setPreviewCityId,
  handleSelectCity,
  beginSignalPress,
  clearSignalPress,
  clearLongPressPreview,
  beginLongPressPreview,
}: Readonly<ProvinceMapCanvasProps>) {
  return (
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
              <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0.72" />
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
            const lit = mapCities.find((city) => city.id === region.city.id)?.lit ?? false;
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
                beginLongPressPreview(city.id);
                beginSignalPress(city.id);
              }}
              onPointerUp={() => {
                clearLongPressPreview();
                clearSignalPress();
              }}
              onPointerCancel={() => {
                clearLongPressPreview();
                clearSignalPress();
              }}
              onPointerLeave={() => {
                clearLongPressPreview();
                clearSignalPress();
              }}
              aria-label={`${city.lit ? "查看" : "添加"}${city.name}回忆`}
            >
              <CityMarker city={city} lit={city.lit} selected={selected} memoryCount={city.memoryCount} />
              <AnimatePresence>
                {previewOpen && (
                  <CityPreviewPopover city={city} memory={city.memory} memoryCount={city.memoryCount} />
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
        <SignalLayer activeCityIds={signalCityIds} sentCityId={sentSignalCityId} mapCities={mapCities} />
      </motion.div>
    </div>
  );
}
