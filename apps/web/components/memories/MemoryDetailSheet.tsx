"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil } from "lucide-react";
import { featureOfProvince, makePath, makeProjectionForProvince } from "@/lib/geo";
import type { City } from "@/data/cities";
import { provinces } from "@/data/provinces";
import type { Memory } from "@/data/memories";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MemoryContentView } from "@/components/memories/MemoryContentView";
import { Spinner } from "@/components/ui/spinner";
import { relatedMemories } from "@/lib/memoryApi";
import { useContentEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";

type MemoryDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  memory: Memory | null;
  city?: City;
  onUpdatePartnerNote?: (memory: Memory, partnerNote: string) => Promise<void>;
  onOpenMemory?: (memory: Memory) => void;
};

const MINI_MAP_WIDTH = 320;
const MINI_MAP_HEIGHT = 180;

/**
 * 移动端回忆详情抽屉：原地展开（不跳转），含迷你地图定位 + 回忆阅读视图。
 * 替代「点击卡片跳转到省份地图浮动卡片」这一不手机友好的旧交互。
 */
export function MemoryDetailSheet({
  open,
  onClose,
  memory,
  city,
  onUpdatePartnerNote,
  onOpenMemory,
}: Readonly<MemoryDetailSheetProps>) {
  const canUseEditSurface = useContentEditAccess();
  const access = useMemoryEditAccess(memory);
  const canAddNote = Boolean(canUseEditSurface && access.canAddNote && !access.canEdit && memory && onUpdatePartnerNote);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [relatedItems, setRelatedItems] = useState<Memory[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) {
        setNoteOpen(false);
        setNoteError("");
        return;
      }
      setNote(memory?.partnerNote ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [memory, open]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!open || !memory) {
        setRelatedItems([]);
        setRelatedLoading(false);
        setRelatedError("");
        return;
      }

      setRelatedLoading(true);
      setRelatedError("");
      relatedMemories(memory.id)
        .then((items) => {
          if (!cancelled) setRelatedItems(items);
        })
        .catch(() => {
          if (!cancelled) {
            setRelatedItems([]);
            setRelatedError("相关回忆读取失败");
          }
        })
        .finally(() => {
          if (!cancelled) setRelatedLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [memory, open]);

  const province = useMemo(
    () => (city ? provinces.find((item) => item.id === city.provinceId) : undefined),
    [city],
  );

  // 迷你地图：省份轮廓 + 高亮该城市点（同一投影）。
  const miniMap = useMemo(() => {
    if (!city || !province) return null;
    const feature = featureOfProvince(province.id);
    const projection = makeProjectionForProvince(province.id, MINI_MAP_WIDTH, MINI_MAP_HEIGHT, 24);
    const pathBuilder = makePath(projection);
    const outlineD = feature ? pathBuilder(feature as never) : "";
    const point = projection([city.lng, city.lat]);
    if (!point) return null;
    return { outlineD, point };
  }, [city, province]);

  const trimmedNote = note.trim();
  const originalNote = (memory?.partnerNote ?? "").trim();
  const canSaveNote = canAddNote && trimmedNote !== originalNote && (trimmedNote.length > 0 || originalNote.length > 0) && !savingNote;

  const handleSaveNote = async () => {
    if (!memory || !onUpdatePartnerNote || !canSaveNote) return;
    setSavingNote(true);
    setNoteError("");
    try {
      await onUpdatePartnerNote(memory, trimmedNote);
      setNoteOpen(false);
    } catch {
      setNoteError("补充保存失败，请稍后再试");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      snapPoints={[0.5, 0.92]}
      initialSnap={0}
      header={
        memory ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink">
                {memory.title || memory.city}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-ink/52">
                {[memory.city, memory.date].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ) : null
      }
    >
      {memory && (
        <div className="space-y-4 pb-2">
          {/* 迷你地图定位 */}
          {miniMap && (
            <div className="overflow-hidden rounded-[10px] border border-dim/80 bg-cream/72">
              <svg viewBox={`0 0 ${MINI_MAP_WIDTH} ${MINI_MAP_HEIGHT}`} className="h-auto w-full" role="img" aria-label={`${memory.city} 在${province?.name ?? ""}的位置`}>
                {miniMap.outlineD && (
                  <path
                    d={miniMap.outlineD}
                    fill={"var(--color-sakura)"}
                    fillOpacity={0.32}
                    stroke={"var(--color-bloom)"}
                    strokeOpacity={0.7}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                  />
                )}
                <circle cx={miniMap.point[0]} cy={miniMap.point[1]} r={14} fill={"var(--color-bloom)"} fillOpacity={0.28} />
                <circle cx={miniMap.point[0]} cy={miniMap.point[1]} r={5} fill={"var(--color-bloom)"} stroke={"var(--color-cream)"} strokeWidth={2} />
              </svg>
            </div>
          )}

          <MemoryContentView memory={memory} cityName={city?.name} />

          {(relatedLoading || relatedError || relatedItems.length > 0) && (
            <section className="rounded-[7px] border border-dim/80 bg-white/54 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-bloom" />
                  <h3 className="text-sm font-semibold text-ink">那年同一天</h3>
                </div>
                {relatedLoading && <Spinner size="sm" />}
              </div>
              {relatedError && <p className="mt-3 text-xs font-semibold text-rose">{relatedError}</p>}
              {relatedItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {relatedItems.map((item) => {
                    const body = (
                      <>
                        <div className="flex items-baseline justify-between gap-3">
                          <h4 className="truncate text-sm font-semibold text-ink">{item.title || item.city}</h4>
                          <span className="shrink-0 text-xs font-semibold text-ink/42">{item.date}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-sky">
                          {[item.city, item.placeName].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/62">{item.text}</p>
                      </>
                    );

                    return onOpenMemory ? (
                      <button
                        key={item.id}
                        className="w-full rounded-[6px] border border-dim/70 bg-cream/64 px-3 py-2 text-left transition hover:border-sakura hover:bg-sakura/24"
                        type="button"
                        onClick={() => onOpenMemory(item)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={item.id} className="rounded-[6px] border border-dim/70 bg-cream/64 px-3 py-2">
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {canAddNote && (
            <div className="rounded-[7px] border border-sakura/70 bg-cream/72 p-3">
              <button
                className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-bloom"
                type="button"
                onClick={() => setNoteOpen((value) => !value)}
              >
                <span>{memory.partnerNote ? "修改补充" : "添加补充"}</span>
                <Pencil className="h-4 w-4" />
              </button>
              {noteOpen && (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="min-h-[88px] w-full resize-none rounded-[6px] border border-dim bg-white/70 px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-bloom"
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setNoteError("");
                    }}
                    maxLength={500}
                    placeholder="写给对方的一句补充..."
                  />
                  {noteError && <p className="text-xs font-semibold text-rose">{noteError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[6px] bg-sakura px-3 text-sm font-semibold text-bloom transition hover:bg-bloom hover:text-cream disabled:cursor-not-allowed disabled:opacity-45"
                      type="button"
                      onClick={handleSaveNote}
                      disabled={!canSaveNote}
                    >
                      {savingNote && <Spinner size="sm" />}
                      {savingNote ? "保存中" : "保存补充"}
                    </button>
                    <button
                      className="min-h-9 rounded-[6px] px-3 text-sm font-semibold text-ink/58 transition hover:bg-dim/28"
                      type="button"
                      onClick={() => {
                        setNote(memory.partnerNote ?? "");
                        setNoteOpen(false);
                        setNoteError("");
                      }}
                      disabled={savingNote}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
