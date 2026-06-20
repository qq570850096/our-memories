"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Camera, MapPin, RefreshCw } from "lucide-react";
import { cities } from "@/data/cities";
import { memories, type Memory } from "@/data/memories";
import {
  type LocalMemoryStore,
} from "@/data/progress";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { useMemoryStore } from "@/lib/memoryStore";

interface RandomPhoto {
  id: string;
  src: string;
  city: string;
  cityId: string;
  date: string;
  text: string;
}

const isBrowserImageUrl = (url: string) => url.startsWith("data:image/") || url.startsWith("https://");

function collectMemories(localMemories: LocalMemoryStore) {
  const localItems = Object.values(localMemories).flat();
  const byId = new Map<string, Memory>();

  [...memories, ...localItems].forEach((memory) => {
    if (!memory.draft) byId.set(memory.id, memory);
  });

  return [...byId.values()];
}

function PhotoImage({ photo }: Readonly<{ photo: RandomPhoto }>) {
  const className = "h-full w-full object-cover";

  if (isBrowserImageUrl(photo.src)) {
    return (
      <LocalPrivacyImg className={className} src={photo.src} alt={`${photo.city} 的随机照片`} />
    );
  }

  return (
    <LocalPrivacyImage
      className={className}
      src={photo.src}
      alt={`${photo.city} 的随机照片`}
      fill
      sizes="190px"
    />
  );
}

export default function RandomPhotoCard() {
  const [initialPhotoSeed] = useState(() => Math.random());
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const { data } = useMemoryStore();

  const photos = useMemo(
    () =>
      collectMemories(data?.memories ?? {}).flatMap((memory) =>
        (memory.photos?.length ? memory.photos : [memory.image]).map((src, photoIndex) => ({
          id: `${memory.id}-${photoIndex}`,
          src,
          city: memory.city,
          cityId: memory.cityId,
          date: memory.date,
          text: memory.text,
        })),
      ),
    [data?.memories],
  );

  const photo = useMemo(() => {
    if (photos.length === 0) return null;
    return photos.find((candidate) => candidate.id === selectedPhotoId) ?? photos[Math.floor(initialPhotoSeed * photos.length)];
  }, [initialPhotoSeed, photos, selectedPhotoId]);

  const href = useMemo(() => {
    if (!photo) return "/memories";
    const city = cities.find((candidate) => candidate.id === photo.cityId);
    return city ? `/province/${city.provinceId}?city=${photo.cityId}` : "/memories";
  }, [photo]);

  const shufflePhoto = () => {
    if (!photo) return;
    if (photos.length === 0) return;
    const candidates = photos.filter((candidate) => candidate.id !== photo.id);
    const source = candidates.length > 0 ? candidates : photos;
    setSelectedPhotoId(source[Math.floor(Math.random() * source.length)].id);
  };

  return (
    <aside className="absolute bottom-[4.75rem] right-[2.5rem] z-30 hidden w-[248px] rotate-[-1.5deg] xl:block">
      <div className="rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/86 p-3 shadow-[0_22px_58px_rgba(90,102,112,0.15)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:border-[#F5DCE0]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-[#F5DCE0] bg-[#F5DCE0]/62 text-[#E8B8C2] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <Camera className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#5A6670]">随机相框</p>
              <p className="truncate text-xs font-medium text-[#5A6670]/48">点照片回到那座城</p>
            </div>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#A8C8DC] transition hover:bg-[#D6E8F0]/48 hover:text-[#5A6670]"
            type="button"
            onClick={shufflePhoto}
            disabled={!photo}
            aria-label="换一张随机照片"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {photo ? (
          <Link
            className="group block"
            href={href}
            aria-label={`查看${photo.city} ${photo.date} 的随机照片`}
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-[6px] border border-[#D8DDD8]/80 bg-[#D6E8F0]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <PhotoImage photo={photo} />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#344451]/42 to-transparent opacity-80 transition group-hover:opacity-55" />
            </div>
            <div className="mt-3 flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-[#D6E8F0] bg-[#D6E8F0]/48 text-[#A8C8DC]">
                <MapPin className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-5 text-[#5A6670]">
                  {photo.city}
                  <span className="ml-1.5 text-xs font-normal text-[#5A6670]/48">{photo.date}</span>
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[#5A6670]/58">{photo.text}</p>
              </div>
            </div>
          </Link>
        ) : (
          <div className="rounded-[6px] border border-dashed border-[#D8DDD8]/90 bg-[#FAFBF7]/72 p-3">
            <div className="grid aspect-[4/3] place-items-center rounded-[5px] bg-[#D6E8F0]/34 text-center">
              <div>
                <Camera className="mx-auto h-7 w-7 text-[#E8B8C2]" />
                <p className="mt-2 text-sm font-semibold text-[#5A6670]">相框在等照片</p>
                <p className="mt-1 text-xs leading-5 text-[#5A6670]/52">点一座城市写回忆后，这里会随机展示。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
