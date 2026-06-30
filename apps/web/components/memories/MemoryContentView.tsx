"use client";

import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { VoicePlayer } from "@/components/ui/VoicePlayer";
import type { Memory } from "@/data/memories";
import { isBrowserImageUrl } from "@/lib/image";
import { memorySupplementLabel } from "@/lib/memorySupplement";

export const photosOfMemory = (memory?: Pick<Memory, "image" | "photos"> | null) => {
  if (!memory) return [];
  return memory.photos?.length ? memory.photos : memory.image ? [memory.image] : [];
};

export function MemoryThumb({
  src,
  alt,
  className = "pixelated h-full w-full object-cover",
}: Readonly<{
  src: string;
  alt: string;
  className?: string;
}>) {
  if (isBrowserImageUrl(src)) {
    return <LocalPrivacyImg className={className} src={src} alt={alt} />;
  }

  return (
    <LocalPrivacyImage
      className={className}
      src={src}
      alt={alt}
      fill
      sizes="(min-width: 1024px) 292px, 30vw"
    />
  );
}

export function MemoryContentView({
  memory,
  cityName,
  photoLimit = 9,
  showPhotos = true,
  showTitle = false,
}: Readonly<{
  memory: Memory;
  cityName?: string;
  photoLimit?: number;
  showPhotos?: boolean;
  showTitle?: boolean;
}>) {
  const photos = photosOfMemory(memory);

  return (
    <div className="space-y-4">
      {showPhotos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.slice(0, photoLimit).map((photo, index) => (
            <div
              key={`${memory.id}-content-photo-${index}`}
              className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist"
            >
              <MemoryThumb src={photo} alt={`${cityName ?? memory.city} 回忆照片 ${index + 1}`} />
            </div>
          ))}
        </div>
      )}

      {showTitle && memory.title && (
        <h3 className="text-lg font-semibold leading-tight text-ink">{memory.title}</h3>
      )}

      {memory.placeName && (
        <p className="text-xs font-semibold text-sky">{memory.placeName}</p>
      )}

      <p className="text-sm leading-7 text-ink/82">{memory.text}</p>
      <VoicePlayer src={memory.voiceTextUrl} label="回忆语音" />

      {(memory.partnerNote || memory.partnerVoiceUrl) && (
        <div className="rounded-[7px] border border-sakura/70 bg-sakura/24 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-bloom/80">
            {memorySupplementLabel(memory)}
          </p>
          {memory.partnerNote && <p className="text-xs leading-5 text-ink/70">{memory.partnerNote}</p>}
          <div className={memory.partnerNote ? "mt-2" : ""}>
            <VoicePlayer src={memory.partnerVoiceUrl} label="补充语音" compact />
          </div>
        </div>
      )}

      {(memory.mood || memory.tags?.length) && (
        <div className="flex flex-wrap gap-1.5">
          {memory.mood && (
            <span className="rounded-full border border-mist bg-mist/36 px-2 py-1 text-[11px] font-semibold text-ink/66">
              {memory.mood}
            </span>
          )}
          {memory.tags?.map((tag) => (
            <span
              key={`${memory.id}-content-tag-${tag}`}
              className="rounded-full border border-dim bg-cream/78 px-2 py-1 text-[11px] font-semibold text-ink/54"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
