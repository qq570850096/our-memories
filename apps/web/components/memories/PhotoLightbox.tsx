"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { MobileMemoryImage } from "@/components/memories/MobileMemoryImage";

const swipeThreshold = 42;

export function PhotoLightbox({
  photos,
  index,
  title,
  onClose,
  onIndexChange,
}: Readonly<{
  photos: string[];
  index: number | null;
  title: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}>) {
  const photo = index == null ? null : photos[index];
  const canStep = photos.length > 1 && index != null;
  const touchStartXRef = useRef<number | null>(null);

  const showPrevious = () => {
    if (!canStep || index == null) return;
    onIndexChange((index - 1 + photos.length) % photos.length);
  };

  const showNext = () => {
    if (!canStep || index == null) return;
    onIndexChange((index + 1) % photos.length);
  };

  useEffect(() => {
    if (!photo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal open={Boolean(photo)} onClose={onClose} size="xl" showClose={false}>
      {photo && index != null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-ink">
              {title}
              <span className="ml-2 text-xs font-medium text-ink/46">
                {index + 1} / {photos.length}
              </span>
            </p>
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] text-ink/58 transition hover:bg-dim/28 hover:text-ink"
              type="button"
              onClick={onClose}
              aria-label="关闭照片预览"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="relative h-[min(68dvh,720px)] touch-pan-y overflow-hidden rounded-[8px] border border-dim bg-mist"
            onTouchStart={(event) => {
              touchStartXRef.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartXRef.current;
              touchStartXRef.current = null;
              const endX = event.changedTouches[0]?.clientX;
              if (startX == null || endX == null || !canStep) return;
              const deltaX = endX - startX;
              if (Math.abs(deltaX) < swipeThreshold) return;
              if (deltaX > 0) showPrevious();
              else showNext();
            }}
          >
            <MobileMemoryImage src={photo} alt={`${title} ${index + 1}`} fit="contain" />
            {canStep && (
              <>
                <button
                  className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-dim/70 bg-cream/86 text-ink shadow-[0_8px_24px_rgba(90,102,112,0.16)] backdrop-blur transition hover:bg-sakura"
                  type="button"
                  onClick={showPrevious}
                  aria-label="上一张照片"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-dim/70 bg-cream/86 text-ink shadow-[0_8px_24px_rgba(90,102,112,0.16)] backdrop-blur transition hover:bg-sakura"
                  type="button"
                  onClick={showNext}
                  aria-label="下一张照片"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
