"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Sparkles } from "lucide-react";
import { cities } from "@/data/cities";
import { provinces } from "@/data/provinces";
import type { LocalMemoryStore } from "@/data/progress";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/apiClient";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { memoryPhotosPayload, uploadedPhotosPayload } from "@/lib/photoPayload";
import { deleteUploaded, uploadImages } from "@/lib/upload";

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

function readThemeColor(token: string) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
}

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

  context.fillStyle = readThemeColor("cream") || "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });

  return blob ? readBlobAsDataUrl(blob) : readBlobAsDataUrl(file);
}

export function AddMemoryPanel({
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

  const provinceGroups = useMemo(() => {
    const groups = new Map<string, typeof cities>();
    cityOptions.forEach((city) => {
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
  const { toast } = useToast();
  const [error, setError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);

  const selectedCity = cityOptions.find((city) => city.id === form.cityId) ?? cityOptions[0];
  const normalizedDate = normalizeDottedDate(form.date);
  const canSave = canEdit && Boolean(selectedCity) && Boolean(normalizedDate) && Boolean(form.text.trim()) && !isSaving;
  const citiesInProvince = provinceGroups.get(selectedProvince) || [];

  const openPanel = () => {
    const currentCity = cityOptions.find((city) => city.id === form.cityId);
    if (currentCity) {
      setSelectedProvince(currentCity.provinceId);
    }
    resetForm();
    setOpen(true);
  };

  useEffect(() => {
    if (!canEdit || window.location.search !== "?add=1") return;
    openPanel();
    window.history.replaceState(null, "", "/memories");
  }, [canEdit]);

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
        photosPayload = uploadedPhotosPayload(uploaded);
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
      toast("回忆已保存", "success");
    } catch {
      await deleteUploaded(uploadedKeys);
      setError("保存失败，请检查登录状态或稍后再试。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        className="fixed bottom-6 right-6 z-50 hidden h-14 w-14 place-items-center rounded-full bg-bloom text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-rose active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:grid"
        type="button"
        onClick={openPanel}
        disabled={!canEdit}
        aria-label="新增回忆"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!isSaving) {
            resetForm();
            setOpen(false);
          }
        }}
        title="新增回忆"
        size="xl"
        closeOnOverlay={!isSaving}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-ink/58">
              省份
              <select
                className="mt-1 min-h-10 w-full rounded-[7px] border border-dim/80 bg-white/70 px-3 text-sm text-ink outline-none transition focus:border-sky"
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
            <label className="block text-xs font-semibold text-ink/58">
              城市
              <select
                className="mt-1 min-h-10 w-full rounded-[7px] border border-dim/80 bg-white/70 px-3 text-sm text-ink outline-none transition focus:border-sky"
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
            <label className="block text-xs font-semibold text-ink/58">
              日期
              <DatePicker className="mt-1 bg-white/70" value={form.date} onChange={(date) => setForm({ ...form, date })} />
            </label>
            <label className="block text-xs font-semibold text-ink/58">
              标题
              <Input
                className="mt-1 bg-white/70"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：第一次一起看海"
                maxLength={120}
              />
            </label>
            <label className="block text-xs font-semibold text-ink/58">
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

          <label className="block text-xs font-semibold text-ink/58">
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

          <div className="space-y-2">
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-sakura bg-sakura/42 px-3 text-xs font-semibold text-bloom transition hover:bg-sakura/70 disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              onClick={handlePolishMemory}
              disabled={!canEdit || !form.text.trim() || polishing}
            >
              {polishing ? <Spinner size="sm" /> : <Sparkles className="h-3.5 w-3.5" />}
              {polishing ? "润色中" : "AI 润色"}
            </button>
            {polishSuggestion && (
              <div className="rounded-[7px] border border-sakura/76 bg-white/54 p-3">
                <p className="text-xs leading-5 text-ink/72">{polishSuggestion}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-[6px] bg-sakura px-3 py-1.5 text-xs font-semibold text-bloom transition hover:bg-bloom hover:text-cream"
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
                    className="rounded-[6px] border border-dim px-3 py-1.5 text-xs font-semibold text-ink/66 transition hover:border-sky hover:text-sky"
                    type="button"
                    onClick={handlePolishMemory}
                    disabled={polishing}
                  >
                    重新润色
                  </button>
                  <button
                    className="rounded-[6px] px-3 py-1.5 text-xs font-semibold text-ink/52 transition hover:bg-dim/28"
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
            {polishError && <p className="text-xs text-bloom">{polishError}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-ink/58">
              心情
              <Input
                className="mt-1 bg-white/70"
                value={form.mood}
                onChange={(event) => setForm({ ...form, mood: event.target.value })}
                placeholder="开心、想念、松弛..."
                maxLength={40}
              />
            </label>
            <label className="block text-xs font-semibold text-ink/58">
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
            <span className="text-xs font-semibold text-ink/58">可见性</span>
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
                      ? "border-sakura bg-sakura/62 text-rose-ink"
                      : "border-dim bg-white/54 text-ink/58 hover:border-sky"
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
            <span className="text-xs font-semibold text-ink/58">照片</span>
            <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handlePickFile} />
            <button
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-[7px] border border-dashed border-dim bg-white/52 px-3 py-3 text-sm text-ink/70 transition hover:border-bloom hover:text-bloom"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              {photos.length > 0 ? (
                <span className="w-full">
                  <span className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {photos.slice(0, 12).map((photo, index) => (
                      <span key={`${photo.name}-${index}`} className="relative aspect-square overflow-hidden rounded-[5px] bg-mist">
                        <LocalPrivacyImg className="h-full w-full object-cover" src={photo.dataUrl} alt={photo.name || `照片 ${index + 1}`} />
                      </span>
                    ))}
                  </span>
                  <span className="mt-2 block text-xs text-ink/58">
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

          {error && <p className="text-xs font-semibold text-rose">{error}</p>}

          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-dim/70 bg-cream/96 px-5 py-3 backdrop-blur">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] bg-slate px-4 text-sm font-semibold text-white transition hover:bg-rose disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              type="button"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving && <Spinner size="sm" />}
              {isSaving ? "保存中" : "保存回忆"}
            </button>
            <button
              className="min-h-11 rounded-[8px] border border-dim px-4 text-sm font-semibold text-ink/62 transition hover:border-sky hover:text-sky"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              清空
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
