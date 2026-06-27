"use client";

import { useState } from "react";
import type { City } from "@/data/cities";
import { MobileMemoryImage } from "@/components/memories/MobileMemoryImage";
import { PhotoLightbox } from "@/components/memories/PhotoLightbox";

export function MemoryGallery({
  city,
  photos,
}: Readonly<{
  city: City;
  photos: string[];
}>) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <p className="rounded-[7px] border border-dashed border-dim px-4 py-6 text-center text-sm text-ink/56">
        还没有照片，添加第一段回忆后会出现在这里。
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <button
            key={`${city.id}-mobile-gallery-photo-${index}`}
            className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist transition hover:border-bloom focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky/70"
            type="button"
            onClick={() => setPreviewIndex(index)}
            aria-label={`放大查看 ${city.name} 相册照片 ${index + 1}`}
          >
            <MobileMemoryImage src={photo} alt={`${city.name} gallery photo ${index + 1}`} fit="cover" />
          </button>
        ))}
      </div>
      <PhotoLightbox
        photos={photos}
        index={previewIndex}
        title={`${city.name} 相册`}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}
