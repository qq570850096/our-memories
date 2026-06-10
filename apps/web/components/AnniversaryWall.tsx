"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { CalendarHeart, ImagePlus, Pencil, Pin, Trash2 } from "lucide-react";
import { anniversaryDisplayState, type AnniversaryCard } from "@map-of-us/shared";
import { MemoryPageShell } from "@/components/MemoryNav";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { apiJson } from "@/lib/apiClient";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

const emptyForm = {
  title: "",
  date: "",
  note: "",
  repeatYearly: true,
  pinned: false,
  photos: [] as string[],
};

const isBrowserImageUrl = (url: string) => url.startsWith("data:image/") || url.startsWith("https://");

function AnniversaryImage({ src, alt }: Readonly<{ src: string; alt: string }>) {
  if (isBrowserImageUrl(src)) {
    return <LocalPrivacyImg className="h-full w-full object-cover" src={src} alt={alt} />;
  }

  return <LocalPrivacyImage className="object-cover" src={src} alt={alt} fill sizes="(max-width: 768px) 90vw, 360px" />;
}

function fileToImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Invalid image"));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.addEventListener("load", () => {
      const maxSize = 1600;
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image read failed"));
    });
    image.src = url;
  });
}

export default function AnniversaryWall() {
  const [cards, setCards] = useState<AnniversaryCard[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const isAdmin = useContentEditAccess();
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiJson<{ cards: AnniversaryCard[] }>("/anniversary-cards")
      .then((data) => setCards(data.cards))
      .catch(() => setStatus("纪念日墙读取失败，请稍后再试。"));
  }, []);

  const stats = useMemo(() => {
    const next = cards
      .map((card) => anniversaryDisplayState(card))
      .filter((state) => state.valid)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      count: cards.length,
      nearest: next[0],
    };
  }, [cards]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (files.length === 0) return;
    setWorking(true);
    setStatus("正在读取照片...");
    try {
      const photos = await Promise.all(files.map(fileToImageDataUrl));
      setForm((current) => ({ ...current, photos }));
      setStatus("");
    } catch {
      setStatus("照片读取失败，请重新选择。");
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!isAdmin) {
      setStatus("请先登录后再保存。");
      return;
    }
    if (working) return;
    if (!form.title.trim() || !form.date.trim()) {
      setStatus("请填写标题和日期。");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      const payload = {
        card: {
          title: form.title.trim(),
          date: form.date.trim(),
          note: form.note.trim(),
          repeatYearly: form.repeatYearly,
          pinned: form.pinned,
          photos: form.photos,
        },
      };
      const data = editingId
        ? await apiJson<{ cards: AnniversaryCard[] }>(`/anniversary-cards/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiJson<{ cards: AnniversaryCard[] }>("/anniversary-cards", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      setCards(data.cards);
      resetForm();
      setStatus(editingId ? "纪念日已更新。" : "纪念日已添加。");
    } catch {
      setStatus("保存失败，请检查日期格式。");
    } finally {
      setWorking(false);
    }
  };

  const startEdit = (card: AnniversaryCard) => {
    if (!isAdmin) return;
    setEditingId(card.id);
    setForm({
      title: card.title,
      date: card.date,
      note: card.note,
      repeatYearly: card.repeatYearly,
      pinned: card.pinned,
      photos: [],
    });
    setStatus("正在编辑，未重新选择照片时会保留原照片。");
  };

  const remove = async (card: AnniversaryCard) => {
    if (!isAdmin) {
      setStatus("请先登录后再删除。");
      return;
    }
    if (working) return;
    const confirmed = window.confirm(`确定删除「${card.title}」吗？`);
    if (!confirmed) return;
    setWorking(true);
    try {
      const data = await apiJson<{ cards: AnniversaryCard[] }>(`/anniversary-cards/${card.id}`, { method: "DELETE" });
      setCards(data.cards);
      setStatus("纪念日已删除。");
    } catch {
      setStatus("删除失败，请稍后再试。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <MemoryPageShell active="anniversaries">
      <header className="flex flex-wrap items-start justify-between gap-4 sm:gap-5">
        <div>
          <div className="flex items-center gap-3">
            <CalendarHeart className="h-7 w-7 fill-[#F5DCE0] text-[#B85D70] sm:h-8 sm:w-8" />
            <h1 className="text-2xl font-semibold leading-tight text-[#5A6670] sm:text-[34px]">纪念日墙</h1>
          </div>
          <p className="mt-2 hidden text-sm font-medium text-[#5A6670]/58 sm:block">
            把重要的日子做成照片卡，看看它已经陪我们走了多久。
          </p>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72 px-4 py-2 text-sm font-semibold text-[#5A6670]/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
          {stats.count} 个纪念日{stats.nearest?.valid ? ` · ${stats.nearest.label}` : ""}
        </div>
      </header>

      <section className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="h-fit rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#5A6670]">{editingId ? "编辑纪念日" : "新增纪念日"}</p>
            {!isAdmin && <span className="text-xs font-semibold text-[#5A6670]/42">登录后可编辑</span>}
          </div>
          <div className="mt-4 grid gap-3">
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：第一次见面" disabled={!isAdmin} />
            <Input value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} placeholder="2025.12.23" inputMode="numeric" maxLength={10} disabled={!isAdmin} />
            <Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="写一点那天的细节..." disabled={!isAdmin} />
            <div className="grid gap-2 rounded-[7px] border border-[#D8DDD8]/70 bg-white/36 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#5A6670]/72">
                <input type="checkbox" checked={form.repeatYearly} onChange={(event) => setForm({ ...form, repeatYearly: event.target.checked })} disabled={!isAdmin} />
                每年重复计算下一次纪念日
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-[#5A6670]/72">
                <input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} disabled={!isAdmin} />
                置顶在纪念日墙前面
              </label>
            </div>
            <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={pickPhotos} disabled={!isAdmin || working} />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!isAdmin || working}>
              <ImagePlus className="h-4 w-4" />
              {form.photos.length ? `已选择 ${form.photos.length} 张照片` : "选择照片"}
            </Button>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={save} disabled={!isAdmin || working}>
                {working ? "处理中" : editingId ? "保存修改" : "添加到墙上"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm} disabled={working}>
                  取消
                </Button>
              )}
            </div>
          </div>
          {status && <p className="mt-3 rounded-[7px] border border-[#D8DDD8]/70 bg-white/42 px-3 py-2 text-xs leading-5 text-[#5A6670]/66">{status}</p>}
        </aside>

        {cards.length === 0 ? (
          <EmptyState icon={<CalendarHeart className="h-7 w-7" />} title="还没有纪念日卡片">
            先放下第一个重要日子，之后这里会自动计算它已经陪我们走过多少天。
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const state = anniversaryDisplayState(card);
              return (
                <article key={card.id} className="overflow-hidden rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/80 shadow-[0_14px_30px_rgba(90,102,112,0.07)] backdrop-blur">
                  <div className="relative aspect-[4/3] bg-[#D6E8F0]/36">
                    {card.image ? (
                      <AnniversaryImage src={card.image} alt={`${card.title} 纪念日照片`} />
                    ) : (
                      <div className="grid h-full place-items-center text-[#5A6670]/34">
                        <CalendarHeart className="h-12 w-12" />
                      </div>
                    )}
                    {card.pinned && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/70 bg-[#FAFBF7]/82 px-2.5 py-1 text-xs font-semibold text-[#B85D70] backdrop-blur">
                        <Pin className="h-3.5 w-3.5" />
                        置顶
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold text-[#5A6670]">{card.title}</h2>
                        <p className="mt-1 text-sm font-medium text-[#5A6670]/52">{card.date}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/46 transition hover:bg-[#D6E8F0]/34 hover:text-[#A8C8DC] disabled:opacity-35" type="button" onClick={() => startEdit(card)} disabled={!isAdmin}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/46 transition hover:bg-[#F5DCE0]/45 hover:text-[#B85D70] disabled:opacity-35" type="button" onClick={() => void remove(card)} disabled={!isAdmin || working}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {state.valid && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-[7px] border border-[#F5DCE0]/70 bg-[#F5DCE0]/30 px-3 py-2">
                          <p className="text-[11px] font-semibold text-[#5A6670]/46">距今</p>
                          <p className="mt-1 text-lg font-semibold text-[#B85D70]">{state.sinceLabel}</p>
                        </div>
                        <div className="rounded-[7px] border border-[#D6E8F0]/80 bg-[#D6E8F0]/28 px-3 py-2">
                          <p className="text-[11px] font-semibold text-[#5A6670]/46">下一次</p>
                          <p className="mt-1 text-lg font-semibold text-[#5A6670]">{state.label}</p>
                        </div>
                      </div>
                    )}
                    {card.note && <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#5A6670]/68">{card.note}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </MemoryPageShell>
  );
}
