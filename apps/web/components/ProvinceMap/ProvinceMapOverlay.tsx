"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import type { City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";
import { MemoryCitySheet } from "@/components/memories/MemoryCitySheet";
import type { MemoryPatchPayload, MemoryPhotoPayload } from "@/lib/memoryApi";
import { MemoryCard } from "./MemoryCard";
import type { CardAnchor, CityAssetStore } from "./shared";

type ProvinceMapOverlayProps = {
  selectedCity: City | null;
  isMobile: boolean;
  isAdmin: boolean;
  cameraScale: number;
  localMemories: LocalMemoryStore;
  litCityIds: Set<string>;
  cityAssets: CityAssetStore;
  cardAnchor: CardAnchor | null;
  mobileSheetMode: "view" | "create";
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetCamera: () => void;
  onCloseCity: () => void;
  onSave: (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[], rollbackPending?: () => void) => Promise<void>;
  onOptimisticSave: (cityId: string, memory: Memory) => (() => void) | void;
  onSetCover: (cityId: string, memoryId: string, coverImage: string) => Promise<void>;
  onUpdate: (cityId: string, memoryId: string, memory: MemoryPatchPayload) => Promise<void>;
  onDelete: (cityId: string, memoryId: string) => Promise<void>;
  onSaveLandmark: (cityId: string, image: string) => Promise<void>;
  onDeleteLandmark: (cityId: string) => Promise<void>;
};

export function ProvinceMapOverlay({
  selectedCity,
  isMobile,
  isAdmin,
  cameraScale,
  localMemories,
  litCityIds,
  cityAssets,
  cardAnchor,
  mobileSheetMode,
  onZoomOut,
  onZoomIn,
  onResetCamera,
  onCloseCity,
  onSave,
  onOptimisticSave,
  onSetCover,
  onUpdate,
  onDelete,
  onSaveLandmark,
  onDeleteLandmark,
}: Readonly<ProvinceMapOverlayProps>) {
  return (
    <>
      <div
        className="absolute left-3 top-3 z-40 hidden items-center gap-2 rounded-[8px] border border-dim/85 bg-cream/86 p-2 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur lg:flex"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-mist/45"
          type="button"
          onClick={onZoomOut}
          aria-label="缩小地图"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-semibold text-ink/70">
          {Math.round(cameraScale * 100)}%
        </span>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-sakura/55"
          type="button"
          onClick={onZoomIn}
          aria-label="放大地图"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-[7px] text-ink transition hover:bg-mint/55"
          type="button"
          onClick={onResetCamera}
          aria-label="重置地图视角"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {selectedCity && !isMobile && (
        <MemoryCard
          key={selectedCity.id}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          anchor={cardAnchor}
          isAdmin={isAdmin}
          onClose={onCloseCity}
          onSave={onSave}
          onOptimisticSave={onOptimisticSave}
          onSetCover={onSetCover}
          onUpdate={onUpdate}
          onDelete={onDelete}
          landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
          hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
          onSaveLandmark={onSaveLandmark}
          onDeleteLandmark={onDeleteLandmark}
        />
      )}

      {selectedCity && isMobile && (
        <MemoryCitySheet
          key={`${selectedCity.id}-mobile-sheet`}
          open={selectedCity != null}
          onClose={onCloseCity}
          city={selectedCity}
          localMemories={localMemories[selectedCity.id] ?? []}
          isLit={litCityIds.has(selectedCity.id)}
          isAdmin={isAdmin}
          defaultMode={mobileSheetMode}
          landmarkImage={cityAssets[selectedCity.id] ?? selectedCity.sprite}
          hasCustomLandmark={Boolean(cityAssets[selectedCity.id])}
          onSave={onSave}
          onOptimisticSave={onOptimisticSave}
          onSetCover={onSetCover}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSaveLandmark={onSaveLandmark}
          onDeleteLandmark={onDeleteLandmark}
        />
      )}
    </>
  );
}
