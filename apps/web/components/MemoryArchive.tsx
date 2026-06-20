"use client";

import Link from "next/link";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Heart,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cities } from "@/data/cities";
import { provinces } from "@/data/provinces";
import { MemoryPageShell } from "@/components/MemoryNav";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import {
  recentTimelineMemories,
  sortMemoriesByTime,
  type Memory,
} from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";
import { LocalPrivacyImage, LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { apiFetch } from "@/lib/apiClient";
import { uploadImages, deleteUploaded } from "@/lib/upload";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { useContentEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { publishMemoryStore, useMemoryStore } from "@/lib/memoryStore";
import { MemoryCitySheet, type MemoryPatchPayload } from "@/components/memories/MemoryCitySheet";

type ArchiveView = "city" | "timeline";
type MemoryItem = {
  memory: Memory;
  city?: (typeof cities)[number];
};

const isBrowserImageUrl = (url: string) => url.startsWith("data:image/") || url.startsWith("https://");

const memoryMonthLabel = (memory: Memory) => {
  const match = /^(\d{4})\.(\d{2})\.\d{2}$/.exec(memory.date);
  if (!match) return "未标日期";

  return `${match[1]}年 ${Number(match[2])}月`;
};

type AddMemoryForm = {
  cityId: string;
  title: string;
  placeName: string;
  date: string;
  text: string;
  mood: string;
  tags: string;
  visibility: "both" | "me" | "her";
};

type PhotoDraft = {
  name: string;
  dataUrl: string;
  file: File;
};

const defaultAddMemoryForm = (): AddMemoryForm => ({
  cityId: "",
  title: "",
  placeName: "",
  date: "",
  text: "",
  mood: "",
  tags: "",
  visibility: "both",
});

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image read failed"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Image read failed")));
    reader.readAsDataURL(blob);
  });

const loadImageFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(imageUrl);
        resolve(image);
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("Image load failed"));
      },
      { once: true },
    );
    image.src = imageUrl;
  });

async function readCompressedImageDataUrl(file: File) {
  if (file.type === "image/svg+xml") return readBlobAsDataUrl(file);

  const image = await loadImageFile(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return readBlobAsDataUrl(file);

  context.fillStyle = "#FAFBF7";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });

  return blob ? readBlobAsDataUrl(blob) : readBlobAsDataUrl(file);
}

const memoryPhotosPayload = (photos: string[]) =>
  photos.filter(Boolean).map((url) => ({ url, key: "", mimeType: "image/jpeg" }));

function AddMemoryPanel({
  canEdit,
  onSaved,
}: Readonly<{
  canEdit: boolean;
  onSaved: (memories: LocalMemoryStore) => void;
}>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cityOptions = useMemo(
    () => [...cities].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    [],
  );

  // 按省份分组城市
  const provinceGroups = useMemo(() => {
    const groups = new Map<string, typeof cities>();
    cityOptions.forEach(city => {
      const list = groups.get(city.provinceId) || [];
      list.push(city);
      groups.set(city.provinceId, list);
    });
    return groups;
  }, [cityOptions]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddMemoryForm>(() => ({
    ...defaultAddMemoryForm(),
    cityId: cityOptions[0]?.id ?? "",
  }));
  const [selectedProvince, setSelectedProvince] = useState(cityOptions[0]?.provinceId || provinces[0]?.id || "");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);

  const selectedCity = cityOptions.find((city) => city.id === form.cityId) ?? cityOptions[0];
  const normalizedDate = normalizeDottedDate(form.date);
  const canSave = canEdit && Boolean(selectedCity) && Boolean(normalizedDate) && Boolean(form.text.trim()) && !isSaving;

  // 当前省份的城市列表
  const citiesInProvince = provinceGroups.get(selectedProvince) || [];

  // 省份变化时，自动选中该省第一个城市
  const handleProvinceChange = (provinceId: string) => {
    setSelectedProvince(provinceId);
    const cities = provinceGroups.get(provinceId) || [];
    if (cities.length > 0) {
      setForm({ ...form, cityId: cities[0].id });
    }
  };

  const resetForm = () => {
    setForm({
      ...defaultAddMemoryForm(),
      cityId: selectedCity?.id ?? cityOptions[0]?.id ?? "",
    });
    setPhotos([]);
    setError("");
    setPolishSuggestion("");
    setPolishError("");
  };

  const handlePolishMemory = async () => {
    if (!canEdit) {
      setPolishError("请先登录后再使用 AI 润色");
      return;
    }
    const trimmedText = form.text.trim();
    if (!trimmedText || polishing) return;

    setPolishing(true);
    setPolishError("");

    try {
      const response = await apiFetch("/ai/memory-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: trimmedText,
          cityId: selectedCity?.id ?? "",
          city: selectedCity?.name ?? "",
          date: normalizedDate ?? form.date,
        }),
      });
      if (!response.ok) throw new Error("Polish failed");
      const data = (await response.json()) as { polishedText?: unknown };
      const nextText = typeof data.polishedText === "string" ? data.polishedText.trim().slice(0, 500) : "";
      if (!nextText) throw new Error("Empty polish result");
      setPolishSuggestion(nextText);
    } catch {
      setPolishError("润色失败，请稍后再试");
    } finally {
      setPolishing(false);
    }
  };

  const handlePickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setIsReadingPhoto(true);
    setError("");

    try {
      const nextPhotos = await Promise.all(
        files.slice(0, 12).map(async (file) => ({
          name: file.name,
          dataUrl: await readCompressedImageDataUrl(file),
          file,
        })),
      );
      setPhotos(nextPhotos);
    } catch {
      setError("照片读取失败，请换一张图片重试。");
    } finally {
      setIsReadingPhoto(false);
      event.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      setError("请先登录后再保存。");
      return;
    }
    if (!selectedCity) {
      setError("请选择城市。");
      return;
    }
    if (!normalizedDate) {
      setError("请选择有效日期。");
      return;
    }
    if (!form.text.trim()) {
      setError("请写一句回忆。");
      return;
    }

    setIsSaving(true);
    setError("");
    setStatus("");

    let uploadedKeys: string[] = [];
    try {
      const tags = Array.from(
        new Set(
          form.tags
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);
      const fallbackPhoto = selectedCity.sprite;
      let photosPayload: ReturnType<typeof memoryPhotosPayload>;
      if (photos.length > 0) {
        const uploaded = await uploadImages(photos.map((photo) => photo.file), "memories");
        uploadedKeys = uploaded.map((item) => item.key);
        photosPayload = uploaded.map((item) => ({ url: item.url, key: item.key, mimeType: item.mimeType }));
      } else {
        photosPayload = memoryPhotosPayload([fallbackPhoto]);
      }
      const response = await apiFetch("/api/v1/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId: selectedCity.id,
          city: selectedCity.name,
          cityEn: selectedCity.nameEn,
          title: form.title.trim(),
          placeName: form.placeName.trim(),
          date: normalizedDate,
          text: form.text.trim(),
          mood: form.mood.trim(),
          tags,
          visibility: form.visibility,
          photos: photosPayload,
        }),
      });

      if (!response.ok) throw new Error("Failed to save memory");

      const data = (await response.json()) as { memories: LocalMemoryStore };
      onSaved(data.memories);
      resetForm();
      setOpen(false);
      setStatus("回忆已保存。");
    } catch {
      await deleteUploaded(uploadedKeys);
      setError("保存失败，请检查登录状态或稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* 浮动加号按钮 */}
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-[#D86F82] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={() => {
          // 同步省份选择
          const currentCity = cityOptions.find(c => c.id === form.cityId);
          if (currentCity) {
            setSelectedProvince(currentCity.provinceId);
          }
          setOpen(true);
          setError("");
          setStatus("");
        }}
        disabled={!canEdit}
        aria-label="新增回忆"
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
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_28px_90px_rgba(39,56,70,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D8DDD8] bg-white/90 px-5 py-4 backdrop-blur">
              <h2 className="text-lg font-semibold text-[#5A6670]">新增回忆</h2>
              <button
                className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              省份
              <select
                className="mt-1 min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-white/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC]"
                value={selectedProvince}
                onChange={(event) => handleProvinceChange(event.target.value)}
              >
                {provinces.map((province) => (
                  <option key={province.id} value={province.id}>
                    {province.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              城市
              <select
                className="mt-1 min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-white/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC]"
                value={form.cityId}
                onChange={(event) => setForm({ ...form, cityId: event.target.value })}
              >
                {citiesInProvince.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              日期
              <DatePicker className="mt-1 bg-white/70" value={form.date} onChange={(date) => setForm({ ...form, date })} />
            </label>
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              标题
              <Input
                className="mt-1 bg-white/70"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：第一次一起看海"
                maxLength={120}
              />
            </label>
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              具体地点
              <Input
                className="mt-1 bg-white/70"
                value={form.placeName}
                onChange={(event) => setForm({ ...form, placeName: event.target.value })}
                placeholder={selectedCity ? `${selectedCity.name} 的某家店、某条街` : "某个地点"}
                maxLength={120}
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-[#5A6670]/58">
            一句话回忆
            <Textarea
              className="mt-1 bg-white/70"
              value={form.text}
              onChange={(event) => {
                setForm({ ...form, text: event.target.value });
                setPolishSuggestion("");
                setPolishError("");
              }}
              placeholder="写下这一刻..."
              maxLength={500}
            />
          </label>

          {/* AI 润色 */}
          <div className="space-y-2">
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[#F5DCE0] bg-[#F5DCE0]/42 px-3 text-xs font-semibold text-[#E8B8C2] transition hover:bg-[#F5DCE0]/70 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              onClick={handlePolishMemory}
              disabled={!canEdit || !form.text.trim() || polishing}
            >
              {polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {polishing ? "润色中" : "AI 润色"}
            </button>
            {polishSuggestion && (
              <div className="rounded-[7px] border border-[#F5DCE0]/76 bg-white/54 p-3">
                <p className="text-xs leading-5 text-[#5A6670]/72">{polishSuggestion}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-[6px] bg-[#F5DCE0] px-3 py-1.5 text-xs font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7]"
                    type="button"
                    onClick={() => {
                      setForm({ ...form, text: polishSuggestion.slice(0, 500) });
                      setPolishSuggestion("");
                      setPolishError("");
                    }}
                  >
                    采用
                  </button>
                  <button
                    className="rounded-[6px] border border-[#D8DDD8] px-3 py-1.5 text-xs font-semibold text-[#5A6670]/66 transition hover:border-[#A8C8DC] hover:text-[#A8C8DC]"
                    type="button"
                    onClick={handlePolishMemory}
                    disabled={polishing}
                  >
                    重新润色
                  </button>
                  <button
                    className="rounded-[6px] px-3 py-1.5 text-xs font-semibold text-[#5A6670]/52 transition hover:bg-[#D8DDD8]/28"
                    type="button"
                    onClick={() => {
                      setPolishSuggestion("");
                      setPolishError("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
            {polishError && <p className="text-xs text-[#E8B8C2]">{polishError}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              心情
              <Input
                className="mt-1 bg-white/70"
                value={form.mood}
                onChange={(event) => setForm({ ...form, mood: event.target.value })}
                placeholder="开心、想念、松弛..."
                maxLength={40}
              />
            </label>
            <label className="block text-xs font-semibold text-[#5A6670]/58">
              标签
              <Input
                className="mt-1 bg-white/70"
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="海边，夜景，第一次"
                maxLength={120}
              />
            </label>
          </div>

          <div>
            <span className="text-xs font-semibold text-[#5A6670]/58">可见性</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ["both", "给我们看"],
                ["me", "只给我"],
                ["her", "只给她"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`rounded-[7px] border px-2 py-2 text-xs font-semibold transition ${
                    form.visibility === value
                      ? "border-[#F5DCE0] bg-[#F5DCE0]/62 text-[#B85D70]"
                      : "border-[#D8DDD8] bg-white/54 text-[#5A6670]/58 hover:border-[#A8C8DC]"
                  }`}
                  type="button"
                  onClick={() => setForm({ ...form, visibility: value as AddMemoryForm["visibility"] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-[#5A6670]/58">照片</span>
            <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handlePickFile} />
            <button
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-[7px] border border-dashed border-[#D8DDD8] bg-white/52 px-3 py-3 text-sm text-[#5A6670]/70 transition hover:border-[#E8B8C2] hover:text-[#E8B8C2]"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              {photos.length > 0 ? (
                <span className="w-full">
                  <span className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {photos.slice(0, 12).map((photo, index) => (
                      <span key={`${photo.name}-${index}`} className="relative aspect-square overflow-hidden rounded-[5px] bg-[#D6E8F0]">
                        <LocalPrivacyImg className="h-full w-full object-cover" src={photo.dataUrl} alt={photo.name || `照片 ${index + 1}`} />
                      </span>
                    ))}
                  </span>
                  <span className="mt-2 block text-xs text-[#5A6670]/58">
                    {isReadingPhoto ? "读取中" : `已选择 ${photos.length} 张，可重新选择`}
                  </span>
                </span>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  选择本地图片，可多选
                </>
              )}
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-[#D86F82]">{error}</p>}

          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-[#D8DDD8]/70 bg-[#FAFBF7]/96 px-5 py-3 backdrop-blur">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] bg-[#273846] px-4 text-sm font-semibold text-white transition hover:bg-[#D86F82] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              type="button"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? "保存中" : "保存回忆"}
            </button>
            <button
              className="min-h-11 rounded-[8px] border border-[#D8DDD8] px-4 text-sm font-semibold text-[#5A6670]/62 transition hover:border-[#A8C8DC] hover:text-[#A8C8DC]"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              清空
            </button>
          </div>
            </div>
          </div>
        </div>
      )}

    {/* 成功提示 */}
    {status && (
      <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-[#7DA88B]/70 bg-[#D4E8D0]/95 px-4 py-3 text-sm font-semibold text-[#4A7A5A] shadow-[0_8px_24px_rgba(90,102,112,0.2)] backdrop-blur">
        {status}
      </div>
    )}
  </>
  );
}

function MemoryImage({ memory }: Readonly<{ memory: Memory }>) {
  const className = "pixelated h-full w-full object-cover transition duration-300 group-hover:scale-105";

  if (isBrowserImageUrl(memory.image)) {
    return (
      <LocalPrivacyImg className={className} src={memory.image} alt={`${memory.city} memory`} />
    );
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

function MemoryCard({ item, compact = false, onDelete, onOpen }: Readonly<{ item: MemoryItem; compact?: boolean; onDelete?: (memoryId: string) => void; onOpen?: (item: MemoryItem) => void }>) {
  const { memory, city } = item;
  // 只有回忆的创建者才能删除（后端 DeleteMemory 对非创建者返回 403）。
  const access = useMemoryEditAccess(memory);
  const showDelete = Boolean(onDelete);
  const canDelete = showDelete && access.canEdit;
  // 移动端：整卡 button 原地展开详情；桌面端：Link 跳地图页。
  const href = city ? `/province/${city.provinceId}?city=${memory.cityId}` : "/";
  const cardInner = (
    <article className={compact ? "grid grid-cols-[92px_1fr] gap-3" : "grid grid-cols-[112px_1fr] gap-4"}>
      <div className="relative aspect-square overflow-hidden rounded-[6px] border border-[#D8DDD8] bg-[#D6E8F0]">
        <MemoryImage memory={memory} />
      </div>
      <div className="min-w-0 py-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-lg font-semibold text-[#5A6670]">{memory.title || memory.city}</h3>
          <span className="shrink-0 text-sm text-[#5A6670]/46">{memory.date}</span>
        </div>
        {(memory.title || memory.placeName) && (
          <p className="mt-1 truncate text-xs font-semibold text-[#A8C8DC]">
            {[memory.city, memory.placeName].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5A6670]/70">{memory.text}</p>
        {(memory.mood || memory.tags?.length) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {memory.mood && (
              <span className="rounded-full bg-[#D6E8F0]/42 px-2 py-0.5 text-[10px] font-semibold text-[#5A6670]/58">
                {memory.mood}
              </span>
            )}
            {memory.tags?.slice(0, 3).map((tag) => (
              <span
                key={`${memory.id}-archive-tag-${tag}`}
                className="rounded-full bg-[#FAFBF7]/80 px-2 py-0.5 text-[10px] font-semibold text-[#5A6670]/46"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#A8C8DC]">
          <MapPin className="h-3.5 w-3.5" />
          {onOpen ? "查看回忆" : "回到地图"}
        </p>
      </div>
    </article>
  );

  return (
    <div className="group relative block rounded-[8px] border border-[#D8DDD8]/74 bg-[#FAFBF7]/78 p-3 shadow-[0_12px_26px_rgba(90,102,112,0.055)] backdrop-blur transition hover:border-[#F5DCE0] hover:shadow-[0_16px_34px_rgba(90,102,112,0.10)]">
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
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-red-100 bg-[#FAFBF7]/95 px-2.5 py-2 text-xs font-semibold text-red-500 shadow-lg transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canDelete) return;
            if (confirm("确定要删除这条回忆吗？")) {
              onDelete?.(memory.id);
            }
          }}
          disabled={!canDelete}
          title="删除回忆"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">删除</span>
        </button>
      )}
    </div>
  );
}

export default function MemoryArchive() {
  const { data, mutate } = useMemoryStore();
  const [view, setView] = useState<ArchiveView>("city");
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const canEdit = useContentEditAccess();
  const isMobile = useIsMobile();
  // 移动端原地展开的回忆详情（不跳转到地图页）。
  const [selectedItem, setSelectedItem] = useState<MemoryItem | null>(null);

  const localMemories = useMemo(() => data?.memories ?? {}, [data?.memories]);

  const handleDeleteMemory = async (cityId: string, memoryId: string) => {
    if (!canEdit) return;

    const response = await apiFetch(`/memories/${memoryId}`, { method: "DELETE" });

    if (!response.ok) throw new Error("Failed to delete memory");

    const data = (await response.json()) as { memories: LocalMemoryStore };
    mutate({ memories: data.memories }, { revalidate: false });
    publishMemoryStore(data.memories);
    setSelectedItem((current) => (current?.memory.id === memoryId ? null : current));
  };

  const handleSaveMemory = async (cityId: string, memory: Memory) => {
    if (!canEdit) return;

    const response = await apiFetch("/api/v1/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...memory,
        photos: memoryPhotosPayload(memory.photos ?? [memory.image]),
      }),
    });

    if (!response.ok) throw new Error("Failed to save memory");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    mutate({ memories: data.memories }, { revalidate: false });
    publishMemoryStore(data.memories);
  };

  const handleUpdateMemory = async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
    if (!canEdit) return;

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });

    if (!response.ok) throw new Error("Failed to update memory");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    const nextMemories = data.memories;
    mutate({ memories: nextMemories }, { revalidate: false });
    publishMemoryStore(nextMemories);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? current.memory;

      return { ...current, memory: updatedMemory };
    });
  };

  const handleSetMemoryCover = async (cityId: string, memoryId: string, coverImage: string) => {
    if (!canEdit) return;

    const response = await apiFetch(`/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage }),
    });

    if (!response.ok) throw new Error("Failed to update memory cover");

    const data = (await response.json()) as { memory?: Memory; memories: LocalMemoryStore };
    const nextMemories = data.memories;
    mutate({ memories: nextMemories }, { revalidate: false });
    publishMemoryStore(nextMemories);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? {
          ...current.memory,
          image: coverImage,
        };

      return { ...current, memory: updatedMemory };
    });
  };

  const memoryItems = useMemo<MemoryItem[]>(() => {
    const localItems = Object.values(localMemories).flat();
    const byId = new Map<string, Memory>();

    [...recentTimelineMemories, ...localItems].forEach((memory) => {
      if (!memory.draft) byId.set(memory.id, memory);
    });

    return sortMemoriesByTime([...byId.values()]).map((memory) => ({
      memory,
      city: cities.find((city) => city.id === memory.cityId),
    }));
  }, [localMemories]);

  const cityGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const key = item.memory.cityId;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    return [...groups.entries()].map(([cityId, items]) => ({
      cityId,
      cityName: items[0]?.memory.city ?? cityId,
      memories: items,
    }));
  }, [memoryItems]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const label = memoryMonthLabel(item.memory);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    });

    return [...groups.entries()].map(([label, items]) => ({ label, memories: items }));
  }, [memoryItems]);

  const cityCount = cityGroups.length;

  const toggleCity = (cityId: string) => {
    setExpandedCities((current) => {
      const next = new Set(current);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);

      return next;
    });
  };

  return (
    <MemoryPageShell active="memories">
          <header className="flex flex-wrap items-start justify-between gap-4 sm:gap-5">
            <div>
              <div className="flex items-center gap-3">
                <Star className="h-6 w-6 fill-[#F5DCE0] text-[#E8B8C2] sm:h-8 sm:w-8" />
                <h1 className="text-2xl font-semibold leading-tight text-[#5A6670] sm:text-[34px]">回忆记录</h1>
              </div>
              <p className="mt-2 hidden text-sm font-medium text-[#5A6670]/58 sm:block">
                {view === "city" ? "按城市整理我们的足迹" : "按时间从新到旧排列"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72 px-4 py-2 text-sm font-semibold text-[#5A6670]/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
                {memoryItems.length} 条 · {cityCount} 城
              </div>
              <div className="flex rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72 p-1 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
                {(["city", "timeline"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${
                      view === mode
                        ? "bg-[#F5DCE0] text-[#E8B8C2]"
                        : "text-[#5A6670]/58 hover:bg-[#D6E8F0]/32"
                    }`}
                    type="button"
                    onClick={() => setView(mode)}
                  >
                    {mode === "city" ? "城市" : "时间线"}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <AddMemoryPanel
            canEdit={canEdit}
            onSaved={(memories) => {
              mutate({ memories }, { revalidate: false });
              publishMemoryStore(memories);
            }}
          />

          {memoryItems.length === 0 ? (
            <div className="mt-6 grid min-h-[420px] place-items-center rounded-[8px] border border-dashed border-[#D8DDD8] bg-[#FAFBF7]/58 px-6 py-14 text-center shadow-[0_14px_34px_rgba(90,102,112,0.045)] backdrop-blur sm:mt-8">
              <div className="max-w-[430px]">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-[#F5DCE0] bg-[#F5DCE0]/42">
                  <Heart className="h-8 w-8 fill-[#F5DCE0] text-[#E8B8C2]" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[#5A6670]">还没有回忆记录</h2>
                <p className="mt-3 text-sm leading-7 text-[#5A6670]/60">
                  可以直接点上方“新增回忆”添加城市、日期、照片和一句话回忆。保存后这里会自动按城市和时间整理。
                </p>
                <Link
                  className="mt-6 inline-flex items-center gap-2 rounded-[8px] border border-[#A8C8DC] bg-[#FAFBF7]/78 px-5 py-3 text-sm font-semibold text-[#A8C8DC] transition hover:bg-[#D6E8F0]/34"
                  href="/map"
                >
                  <MapPin className="h-4 w-4" />
                  回到地图
                </Link>
              </div>
            </div>
          ) : view === "city" ? (
            <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-9">
              {cityGroups.map((group) => {
                const expanded = expandedCities.has(group.cityId);
                const visibleMemories = expanded ? group.memories : group.memories.slice(0, 3);

                return (
                  <section key={group.cityId}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <MapPin className="h-5 w-5 fill-[#E8B8C2] text-[#E8B8C2]" />
                        <h2 className="text-2xl font-semibold text-[#5A6670]">{group.cityName}</h2>
                        <span className="text-sm text-[#5A6670]/48">
                          共 {group.memories.length} 条回忆
                        </span>
                      </div>
                      {group.memories.length > 3 && (
                        <button
                          className="flex items-center gap-1 text-sm font-semibold text-[#5A6670]/58 transition hover:text-[#E8B8C2]"
                          type="button"
                          onClick={() => toggleCity(group.cityId)}
                        >
                          {expanded ? "收起" : "查看全部"}
                          <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 xl:grid-cols-3">
                      {visibleMemories.map((item) => (
                        <MemoryCard
                          key={item.memory.id}
                          item={item}
                          compact
                          onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                          onOpen={isMobile ? setSelectedItem : undefined}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="relative mt-6 space-y-6 pl-9 sm:mt-10 sm:space-y-8">
              <div className="absolute bottom-0 left-3 top-0 w-px bg-[#E8B8C2]/58" aria-hidden="true" />
              {timelineGroups.map((group) => (
                <section key={group.label} className="relative">
                  <span className="absolute -left-[34px] top-1 grid h-6 w-6 place-items-center rounded-full border border-[#F5DCE0] bg-[#FAFBF7]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E8B8C2]" />
                  </span>
                  <h2 className="mb-4 text-2xl font-semibold text-[#5A6670]">{group.label}</h2>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.memories.map((item) => (
                      <MemoryCard
                        key={item.memory.id}
                        item={item}
                        onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                        onOpen={isMobile ? setSelectedItem : undefined}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

      {selectedItem?.city && (
        <MemoryCitySheet
          open={selectedItem != null}
          onClose={() => setSelectedItem(null)}
          city={selectedItem.city}
          localMemories={localMemories[selectedItem.memory.cityId] ?? []}
          selectedMemoryId={selectedItem.memory.id}
          isLit={Boolean(localMemories[selectedItem.memory.cityId]?.length)}
          isAdmin={canEdit}
          onSave={handleSaveMemory}
          onUpdate={handleUpdateMemory}
          onDelete={handleDeleteMemory}
          onSetCover={handleSetMemoryCover}
        />
      )}
    </MemoryPageShell>
  );
}
