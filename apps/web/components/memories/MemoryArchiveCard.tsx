"use client";

import Link from "next/link";
import { MapPin, Trash2 } from "lucide-react";
import type { City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/use-confirm";
import { isBrowserImageUrl } from "@/lib/image";
import { useMemoryEditAccess } from "@/lib/useContentEditAccess";

export type MemoryArchiveItem = {
  memory: Memory;
  city?: City;
};

function MemoryImage({ memory }: Readonly<{ memory: Memory }>) {
  const className = "pixelated h-full w-full object-cover transition duration-300 group-hover:scale-105";

  if (isBrowserImageUrl(memory.image)) {
    return <LocalPrivacyImg className={className} src={memory.image} alt={`${memory.city} memory`} />;
  }

  return (
    <LocalPrivacyImage
      className="pixelated object-cover transition duration-300 group-hover:scale-105"
      src={memory.image}
      alt={`${memory.city} memory`}
      fill
      sizes="(min-width: 1024px) 180px, 40vw"
    />
  );
}

export function MemoryArchiveCard({
  item,
  compact = false,
  onDelete,
  onOpen,
  deleting = false,
}: Readonly<{
  item: MemoryArchiveItem;
  compact?: boolean;
  onDelete?: (memoryId: string) => void;
  onOpen?: (item: MemoryArchiveItem) => void;
  deleting?: boolean;
}>) {
  const { memory, city } = item;
  const access = useMemoryEditAccess(memory);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const showDelete = Boolean(onDelete);
  const canDelete = showDelete && access.canEdit && !deleting;
  const href = city ? `/province/${city.provinceId}?city=${memory.cityId}` : "/";
  const cardInner = (
    <article className={compact ? "grid grid-cols-[92px_1fr] gap-3" : "grid grid-cols-[112px_1fr] gap-4"}>
      <div className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist">
        <MemoryImage memory={memory} />
      </div>
      <div className="min-w-0 py-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-lg font-semibold text-ink">{memory.title || memory.city}</h3>
          <span className="shrink-0 text-sm text-ink/46">{memory.date}</span>
        </div>
        {(memory.title || memory.placeName) && (
          <p className="mt-1 truncate text-xs font-semibold text-sky">
            {[memory.city, memory.placeName].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink/70">{memory.text}</p>
        {(memory.mood || memory.tags?.length) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {memory.mood && (
              <span className="rounded-full bg-mist/42 px-2 py-0.5 text-[10px] font-semibold text-ink/58">
                {memory.mood}
              </span>
            )}
            {memory.tags?.slice(0, 3).map((tag) => (
              <span
                key={`${memory.id}-archive-tag-${tag}`}
                className="rounded-full bg-cream/80 px-2 py-0.5 text-[10px] font-semibold text-ink/46"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-sky">
          <MapPin className="h-3.5 w-3.5" />
          {onOpen ? "查看回忆" : "回到地图"}
        </p>
      </div>
    </article>
  );

  return (
    <div className="group relative block rounded-[8px] border border-dim/74 bg-cream/78 p-3 shadow-[0_12px_26px_rgba(90,102,112,0.055)] backdrop-blur transition hover:border-sakura hover:shadow-[0_16px_34px_rgba(90,102,112,0.10)]">
      {onOpen ? (
        <button className="block w-full text-left" type="button" onClick={() => onOpen(item)}>
          {cardInner}
        </button>
      ) : (
        <Link className="block" href={href}>
          {cardInner}
        </Link>
      )}
      {showDelete && (
        <button
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-rose/20 bg-cream/95 px-2.5 py-2 text-xs font-semibold text-rose shadow-lg transition hover:bg-rose/10 disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          onClick={async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!canDelete) return;
            if (await confirm({ title: "确定要删除这条回忆吗？", danger: true, confirmText: "删除" })) {
              onDelete?.(memory.id);
            }
          }}
          disabled={!canDelete}
          title="删除回忆"
        >
          {deleting ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{deleting ? "删除中" : "删除"}</span>
        </button>
      )}
      {confirmDialog}
    </div>
  );
}
