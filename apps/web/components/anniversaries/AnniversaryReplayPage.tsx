"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarHeart, ImagePlus, Send } from "lucide-react";
import { useMemo, useState } from "react";
import type { AnniversaryCard } from "@map-of-us/shared";
import type { Memory } from "@/data/memories";
import { cities } from "@/data/cities";
import { MemoryPageShell } from "@/components/MemoryNav";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { VoicePlayer } from "@/components/ui/VoicePlayer";
import { createMemory } from "@/lib/memoryApi";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

type ReplayPhoto = {
  id?: string;
  url?: string;
  mimeType?: string;
  mediaType?: string;
  sortOrder?: number;
};

type ReplayCard = AnniversaryCard & {
  voiceUrl?: string;
  photos?: ReplayPhoto[];
};

type ReplayMemory = Omit<Memory, "photos"> & {
  photos?: ReplayPhoto[] | string[];
};

type ReplayResponse = {
  card: ReplayCard;
  memories: ReplayMemory[];
};

function photoUrls(values?: ReplayPhoto[] | string[]) {
  return (values ?? []).flatMap((photo) => {
    if (typeof photo === "string") return photo ? [photo] : [];
    const mediaType = photo.mediaType?.toLowerCase();
    const mimeType = photo.mimeType?.toLowerCase();
    if (mediaType === "audio" || mimeType?.startsWith("audio/")) return [];
    return photo.url ? [photo.url] : [];
  });
}

export function AnniversaryReplayPage() {
  const searchParams = useSearchParams();
  const cardID = searchParams.get("id") ?? "";
  const canEdit = useContentEditAccess();
  const { data, error, mutate } = useApi<ReplayResponse>(cardID ? `/api/v1/anniversary-cards/${cardID}/replay` : null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const cardPhotos = useMemo(() => photoUrls(data?.card.photos), [data?.card.photos]);
  const heroPhoto = cardPhotos[0] ?? "";
  const memories = useMemo(() => data?.memories ?? [], [data?.memories]);
  const defaultCity = useMemo(() => {
    const memoryCityID = memories[0]?.cityId;
    return cities.find((city) => city.id === memoryCityID) ?? cities.find((city) => city.id === "shanghai") ?? cities[0];
  }, [memories]);

  const saveNote = async () => {
    const text = note.trim();
    if (!data?.card || !defaultCity || !text || saving || !canEdit) return;
    setSaving(true);
    setStatus("");
    try {
      await createMemory({
        id: `anniversary-note-${data.card.id}-${crypto.randomUUID()}`,
        cityId: defaultCity.id,
        city: defaultCity.name,
        cityEn: defaultCity.nameEn,
        title: `${data.card.title} · 今年补一句`,
        date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
        image: heroPhoto || defaultCity.sprite,
        photos: heroPhoto ? [heroPhoto] : [defaultCity.sprite],
        text,
        mood: "纪念",
        tags: ["纪念日", data.card.title],
        visibility: "both",
        placeName: defaultCity.landmark,
      });
      setNote("");
      setStatus("已存成新的回忆。");
      void mutate();
    } catch {
      setStatus("保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MemoryPageShell active="anniversaries">
      {error ? (
        <div className="rounded-[8px] border border-rose/30 bg-sakura/28 px-4 py-3 text-sm font-semibold text-rose">
          纪念日回放读取失败。
        </div>
      ) : !data?.card ? (
        <div className="grid min-h-[420px] place-items-center">
          <Spinner />
        </div>
      ) : (
        <div className="anniversary-replay-enter">
          <section className="relative min-h-[58vh] overflow-hidden rounded-[8px] bg-ink text-cream">
            {heroPhoto ? (
              <LocalPrivacyImg className="absolute inset-0 h-full w-full object-cover opacity-68" src={heroPhoto} alt={`${data.card.title} 回放照片`} />
            ) : (
              <div className="absolute inset-0 bg-bloom/55" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/34 to-transparent" />
            <div className="relative z-10 flex min-h-[58vh] flex-col justify-end p-5 sm:p-8">
              <Link className="mb-auto inline-flex w-fit items-center gap-2 rounded-[6px] border border-cream/22 bg-cream/10 px-3 py-2 text-sm font-semibold text-cream" href="/anniversaries">
                返回纪念日墙
              </Link>
              <CalendarHeart className="mb-4 h-8 w-8 fill-sakura text-sakura" />
              <p className="text-sm font-semibold text-cream/68">{data.card.date}</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-5xl">{data.card.title}</h1>
              {data.card.note && <p className="mt-4 max-w-2xl text-sm leading-7 text-cream/78">{data.card.note}</p>}
              <div className="mt-4 max-w-md">
                <VoicePlayer src={data.card.voiceUrl} label="纪念日语音" />
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-xl font-semibold text-ink">那几天的回忆</h2>
            {memories.length === 0 ? (
              <div className="mt-3 rounded-[8px] border border-dim/70 bg-cream/72 px-4 py-6 text-sm text-ink/58">
                还没有匹配到这个日期前后 3 天的回忆。
              </div>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {memories.map((memory) => {
                  const photos = photoUrls(memory.photos);
                  const image = memory.image || photos[0] || "";
                  return (
                    <article key={memory.id} className="grid grid-cols-[104px_1fr] gap-3 rounded-[8px] border border-dim/74 bg-cream/78 p-3">
                      <div className="relative aspect-square overflow-hidden rounded-[6px] bg-mist/38">
                        {image ? (
                          <LocalPrivacyImg className="h-full w-full object-cover" src={image} alt={`${memory.title || memory.city} 照片`} />
                        ) : (
                          <div className="grid h-full place-items-center text-ink/32">
                            <ImagePlus className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-ink">{memory.title || memory.city}</h3>
                        <p className="mt-1 text-xs font-semibold text-sky">{[memory.city, memory.date].filter(Boolean).join(" · ")}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink/66">{memory.text}</p>
                        <VoicePlayer src={memory.voiceTextUrl} label="回忆语音" compact />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-6 rounded-[8px] border border-sakura/70 bg-sakura/18 p-4">
            <h2 className="text-lg font-semibold text-ink">今年想补一句吗？</h2>
            <Textarea
              className="mt-3"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setStatus("");
              }}
              placeholder="写一句今年想留下的话..."
              disabled={!canEdit || saving}
            />
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={saveNote} disabled={!canEdit || !note.trim() || saving}>
                {saving ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
                存为新回忆
              </Button>
              {status && <p className="text-sm font-semibold text-ink/62">{status}</p>}
            </div>
          </section>
        </div>
      )}
    </MemoryPageShell>
  );
}
