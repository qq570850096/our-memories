"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { CalendarHeart, ImagePlus, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { anniversaryDisplayState, type AnniversaryCard } from "@map-of-us/shared";
import { MemoryPageShell } from "@/components/MemoryNav";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import { apiJson } from "@/lib/apiClient";
import { uploadImages, deleteUploaded } from "@/lib/upload";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

const emptyForm = {
  title: "",
  date: "",
  note: "",
  repeatYearly: true,
  pinned: false,
  photos: [] as string[],
};

type ServerPhoto = {
  id?: string;
  url?: string;
  key?: string;
  mimeType?: string;
  sortOrder?: number;
};

type ServerAnniversaryCard = Omit<AnniversaryCard, "image" | "photos" | "photoItems"> & {
  coverPhotoId?: string;
  photos?: ServerPhoto[];
};

const normalizeCardsResponse = (data: {
  cards?: AnniversaryCard[];
  anniversaryCards?: ServerAnniversaryCard[];
}) => {
  if (data.cards) return data.cards;

  return (data.anniversaryCards ?? []).map((card) => {
    const photoItems = (card.photos ?? []).flatMap((photo, index) => {
      if (!photo.url) return [];
      return [{
        id: photo.id ?? `${card.id}-photo-${index}`,
        url: photo.url,
        key: photo.key,
        mimeType: photo.mimeType,
        sortOrder: photo.sortOrder ?? index,
      }];
    });

    return {
      ...card,
      image: photoItems[0]?.url,
      photos: photoItems.map((photo) => photo.url),
      photoItems,
    } satisfies AnniversaryCard;
  });
};

const photoPayload = (photos: string[]) => photos.filter(Boolean).map((url) => ({ url, key: "", mimeType: "image/jpeg" }));

const isBrowserImageUrl = (url: string) => url.startsWith("data:image/") || url.startsWith("https://");

function AnniversaryImage({ src, alt }: Readonly<{ src: string; alt: string }>) {
  if (isBrowserImageUrl(src)) {
    return <LocalPrivacyImg className="h-full w-full object-cover" src={src} alt={alt} />;
  }

  return <LocalPrivacyImage className="object-cover" src={src} alt={alt} fill sizes="(max-width: 768px) 90vw, 360px" />;
}

export default function AnniversaryWall() {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const isAdmin = useContentEditAccess();
  const [working, setWorking] = useState(false);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: cardsData, error: cardsError, mutate: mutateCards } =
    useApi<{ cards?: AnniversaryCard[]; anniversaryCards?: ServerAnniversaryCard[] }>("/api/v1/anniversary-cards");
  const cards = useMemo(() => normalizeCardsResponse(cardsData ?? {}), [cardsData]);

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
    setOpen(false);
    setPhotoKeys([]);
    setPhotosDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (files.length === 0) return;
    setWorking(true);
    setStatus("正在上传照片...");
    try {
      const uploaded = await uploadImages(files, "anniversaries");
      setForm((current) => ({ ...current, photos: uploaded.map((item) => item.url) }));
      setPhotoKeys(uploaded.map((item) => item.key));
      setPhotosDirty(true);
      setStatus("");
    } catch {
      setStatus("照片上传失败，请重新选择。");
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
      const payload: {
        title: string;
        date: string;
        note: string;
        repeatYearly: boolean;
        pinned: boolean;
        photos?: ReturnType<typeof photoPayload>;
      } = {
        title: form.title.trim(),
        date: form.date.trim(),
        note: form.note.trim(),
        repeatYearly: form.repeatYearly,
        pinned: form.pinned,
      };
      if (!editingId || photosDirty) payload.photos = photoPayload(form.photos);
      if (editingId) {
        await apiJson<{ ok: true }>(`/anniversary-cards/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        });
      } else {
        await apiJson<{ id: string }>("/api/v1/anniversary-cards", {
            method: "POST",
            body: JSON.stringify(payload),
        });
      }
      await mutateCards();
      resetForm();
      setStatus(editingId ? "纪念日已更新。" : "纪念日已添加。");
    } catch {
      await deleteUploaded(photoKeys);
      setStatus("保存失败，请检查日期格式。");
    } finally {
      setWorking(false);
    }
  };

  const startEdit = (card: AnniversaryCard) => {
    if (!isAdmin) return;
    const photos = card.photos?.length ? card.photos : card.image ? [card.image] : [];
    setEditingId(card.id);
    setForm({
      title: card.title,
      date: card.date,
      note: card.note,
      repeatYearly: card.repeatYearly,
      pinned: card.pinned,
      photos,
    });
    setPhotoKeys([]);
    setPhotosDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOpen(true);
    setStatus(photos.length > 0 ? "正在编辑，可重新选择照片替换原照片。" : "正在编辑，可选择照片。");
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
      await apiJson<{ ok: true }>(`/anniversary-cards/${card.id}`, { method: "DELETE" });
      await mutateCards();
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
      {cardsError && (
        <div className="mt-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          纪念日墙读取失败，请稍后再试。
        </div>
      )}

      {/* 悬浮FAB按钮 */}
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-[#D86F82] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={() => setOpen(true)}
        disabled={!isAdmin}
        aria-label="新增纪念日"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* 弹窗表单 */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#273846]/32 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_28px_90px_rgba(39,56,70,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D8DDD8] bg-white/90 px-5 py-4 backdrop-blur">
              <h2 className="text-lg font-semibold text-[#5A6670]">{editingId ? "编辑纪念日" : "新增纪念日"}</h2>
              <button
                className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：第一次见面" disabled={!isAdmin} />
              <DatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} disabled={!isAdmin} />
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
              {status && <p className="rounded-[7px] border border-[#D8DDD8]/70 bg-white/42 px-3 py-2 text-xs leading-5 text-[#5A6670]/66">{status}</p>}
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
          </div>
        </div>
      )}

      <section className="mt-6">

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
