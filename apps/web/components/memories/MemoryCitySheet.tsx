"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { City } from "@/data/cities";
import { sortMemoriesByTime, type Memory } from "@/data/memories";
import { MemoryContentView, photosOfMemory } from "@/components/memories/MemoryContentView";
import { MemoryGallery } from "@/components/memories/MemoryGallery";
import { MemoryHistory } from "@/components/memories/MemoryHistory";
import { MobileMemoryImage } from "@/components/memories/MobileMemoryImage";
import { PhotoLightbox } from "@/components/memories/PhotoLightbox";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DatePicker } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/use-confirm";
import { apiFetch } from "@/lib/apiClient";
import { uploadImage, uploadImages, deleteUploaded } from "@/lib/upload";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { memoryPhotosPayload } from "@/lib/photoPayload";
import { computeMemoryEditAccess, useMemoryEditAccess } from "@/lib/useContentEditAccess";

export type MemoryPatchPayload = Omit<Partial<Memory>, "photos"> & {
  photos?: Array<{ url: string; key: string; mimeType: string }>;
};

type PhotoDraft = {
  previewUrl: string;
  name: string;
  file: File;
};
type MemoryPanelTab = "memory" | "gallery" | "history";

type MemoryCitySheetProps = {
  open: boolean;
  onClose: () => void;
  city: City;
  localMemories: Memory[];
  isLit: boolean;
  isAdmin: boolean;
  selectedMemoryId?: string | null;
  defaultMode?: "view" | "create";
  landmarkImage?: string;
  hasCustomLandmark?: boolean;
  onSave: (cityId: string, memory: Memory) => Promise<void>;
  onUpdate: (cityId: string, memoryId: string, memory: MemoryPatchPayload) => Promise<void>;
  onDelete: (cityId: string, memoryId: string) => Promise<void>;
  onSetCover?: (cityId: string, memoryId: string, coverImage: string) => Promise<void>;
  onSaveLandmark?: (cityId: string, image: string) => Promise<void>;
  onDeleteLandmark?: (cityId: string) => Promise<void>;
};

const memoryTextMaxLength = 80;
const maxPhotosPerMemory = 24;

const isObjectUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("blob:");

const revokeObjectUrl = (url?: string | null) => {
  if (isObjectUrl(url)) URL.revokeObjectURL(url);
};

const revokePhotoDrafts = (photos: PhotoDraft[]) => {
  photos.forEach((photo) => revokeObjectUrl(photo.previewUrl));
};

export function MemoryCitySheet({
  open,
  onClose,
  city,
  localMemories,
  isLit,
  isAdmin,
  selectedMemoryId,
  defaultMode = "view",
  landmarkImage,
  hasCustomLandmark = false,
  onSave,
  onUpdate,
  onDelete,
  onSetCover,
  onSaveLandmark,
  onDeleteLandmark,
}: Readonly<MemoryCitySheetProps>) {
  const resolvedLandmarkImage = landmarkImage ?? city.sprite;
  const memories = useMemo(
    () => sortMemoriesByTime(localMemories),
    [localMemories],
  );
  const localMemoryIds = useMemo(
    () => new Set(localMemories.map((item) => item.id)),
    [localMemories],
  );
  const { confirm, dialog: confirmDialog } = useConfirm();
  const memory = (selectedMemoryId ? memories.find((item) => item.id === selectedMemoryId) : undefined) ?? memories[0];
  const access = useMemoryEditAccess(memory);
  const canEditMemory = Boolean(memory && localMemoryIds.has(memory.id) && isAdmin && access.canEdit);
  const canAnnotateMemory = Boolean(
    memory && localMemoryIds.has(memory.id) && isAdmin && access.canAddNote && !access.canEdit,
  );
  const memoryPhotos = photosOfMemory(memory);
  const coverPhotoIndex = Math.max(0, memoryPhotos.findIndex((photo) => photo === memory?.image));
  const galleryPhotos = Array.from(new Set(memories.flatMap((item) => photosOfMemory(item))));
  const showLandmarkTools = Boolean(onSaveLandmark && onDeleteLandmark);
  const canSetCover = Boolean(memory && onSetCover && canEditMemory);

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [visibility, setVisibility] = useState<"both" | "me" | "her">("both");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [settingCover, setSettingCover] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [landmarkError, setLandmarkError] = useState("");
  const [landmarkSaving, setLandmarkSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<MemoryPanelTab>("memory");
  const [isSaving, setIsSaving] = useState(false);
  const [annotatingMemoryId, setAnnotatingMemoryId] = useState<string | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const photoDraftsRef = useRef<PhotoDraft[]>([]);
  const mountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const landmarkInputRef = useRef<HTMLInputElement>(null);
  const noteEditorRef = useRef<HTMLDivElement>(null);

  const editingAccess = computeMemoryEditAccess(editingMemory);
  const isCreating = editingMemory == null;
  const canEditFields = isAdmin && (isCreating || editingAccess.canEdit);
  const canAnnotate = isAdmin && !isCreating && editingAccess.canAddNote && !editingAccess.canEdit;
  const trimmedDate = date.trim();
  const trimmedText = text.trim();
  const normalizedDate = normalizeDottedDate(trimmedDate);
  const dateInvalid = trimmedDate.length > 0 && !normalizedDate;
  const canSave = isAdmin
    ? canEditFields
      ? Boolean(normalizedDate) &&
        trimmedText.length > 0 &&
        !photoError &&
        !isSaving
      : canAnnotate &&
        editingMemory != null &&
        partnerNote.trim().length > 0 &&
        !isSaving
    : false;
  const isEditing = Boolean(editingMemory);
  const showMemory = activeTab === "memory";
  const showGallery = activeTab === "gallery";
  const showHistory = activeTab === "history";
  const annotatingMemory = annotatingMemoryId
    ? memories.find((item) => item.id === annotatingMemoryId)
    : undefined;
  const noteOriginal = annotatingMemory?.partnerNote?.trim() ?? "";
  const noteText = noteDraft.trim();
  const canSaveNote = Boolean(
    annotatingMemory &&
      !noteSaving &&
      noteText !== noteOriginal &&
      (noteText.length > 0 || noteOriginal.length > 0),
  );

  const resetAnnotation = useCallback(() => {
    setAnnotatingMemoryId(null);
    setNoteDraft("");
    setNoteError("");
    setNoteSaving(false);
  }, []);

  const resetForm = useCallback(
    (revokePhoto: boolean) => {
      setTitle("");
      setPlaceName("");
      setDate("");
      setText("");
      setMood("");
      setTags("");
      setPartnerNote("");
      setVisibility("both");
      setPhotoError("");
      setPolishSuggestion("");
      setPolishError("");
      setPolishing(false);
      setSaveError("");
      setCoverError("");
      setDeleteError("");
      setEditingMemory(null);
      if (revokePhoto) revokePhotoDrafts(photoDraftsRef.current);
      photoDraftsRef.current = [];
      setPhotoDrafts([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [
      setCoverError,
      setDate,
      setDeleteError,
      setEditingMemory,
      setMood,
      setPartnerNote,
      setPhotoDrafts,
      setPhotoError,
      setPlaceName,
      setPolishError,
      setPolishSuggestion,
      setPolishing,
      setSaveError,
      setTags,
      setText,
      setTitle,
      setVisibility,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      revokePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) {
        resetForm(true);
        resetAnnotation();
        setFormOpen(false);
        setActiveTab("memory");
        setPreviewPhotoIndex(null);
        return;
      }

      resetForm(true);
      resetAnnotation();
      setActiveTab("memory");
      setPreviewPhotoIndex(null);
      setFormOpen(defaultMode === "create" && isAdmin);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [city.id, defaultMode, isAdmin, open, resetAnnotation, resetForm, selectedMemoryId]);

  useEffect(() => {
    if (!annotatingMemoryId) return;
    const timer = window.setTimeout(() => {
      noteEditorRef.current?.scrollIntoView({ block: "nearest" });
    }, 40);

    return () => window.clearTimeout(timer);
  }, [annotatingMemoryId]);

  const startCreate = () => {
    if (!isAdmin) return;
    resetForm(true);
    resetAnnotation();
    setActiveTab("memory");
    setFormOpen(true);
  };

  const startEdit = (record: Memory) => {
    const recordAccess = computeMemoryEditAccess(record);
    if (!isAdmin || !localMemoryIds.has(record.id) || !recordAccess.canEdit) return;

    revokePhotoDrafts(photoDraftsRef.current);
    resetAnnotation();
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTitle(record.title ?? "");
    setPlaceName(record.placeName ?? "");
    setDate(record.date);
    setText(record.text);
    setMood(record.mood ?? "");
    setTags(record.tags?.join("，") ?? "");
    setPartnerNote(record.partnerNote ?? "");
    setVisibility(record.visibility ?? "both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(record);
    setFormOpen(true);
    setActiveTab("memory");
  };

  const startAnnotate = (record: Memory) => {
    const recordAccess = computeMemoryEditAccess(record);
    if (!isAdmin || !localMemoryIds.has(record.id) || !recordAccess.canAddNote || recordAccess.canEdit) {
      setNoteError("只有另一位成员可以给这条回忆添加补充");
      return;
    }

    resetForm(true);
    setFormOpen(false);
    setAnnotatingMemoryId(record.id);
    setNoteDraft(record.partnerNote ?? "");
    setNoteError("");
  };

  const handleDelete = async (record: Memory) => {
    const recordAccess = computeMemoryEditAccess(record);
    if (!isAdmin || !localMemoryIds.has(record.id) || !recordAccess.canEdit) {
      setDeleteError("只有创建者可以删除这条回忆");
      return;
    }

    if (deletingMemoryId) return;
    if (!await confirm({ title: `确定删除 ${record.city} ${record.date} 的这条回忆吗？`, danger: true, confirmText: "删除" })) return;

    setDeletingMemoryId(record.id);
    setDeleteError("");

    try {
      await onDelete(city.id, record.id);
      if (editingMemory?.id === record.id) {
        resetForm(true);
        setFormOpen(false);
      }
      if (annotatingMemoryId === record.id) resetAnnotation();
    } catch {
      setDeleteError("删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setDeletingMemoryId("");
    }
  };

  const handleSaveNote = async (record: Memory) => {
    const recordAccess = computeMemoryEditAccess(record);
    if (!isAdmin || !localMemoryIds.has(record.id) || !recordAccess.canAddNote || recordAccess.canEdit) {
      setNoteError("只有另一位成员可以给这条回忆添加补充");
      return;
    }
    if (!canSaveNote) return;

    setNoteSaving(true);
    setNoteError("");

    try {
      await onUpdate(city.id, record.id, { partnerNote: noteText });
      if (mountedRef.current) {
        flushSync(() => resetAnnotation());
      }
    } catch {
      setNoteError("补充保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setNoteSaving(false);
    }
  };

  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !canEditFields) {
      event.target.value = "";
      setPhotoError("请先登录后再选择照片");
      return;
    }

    const files = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, maxPhotosPerMemory);
    if (files.length === 0) return;

    revokePhotoDrafts(photoDraftsRef.current);
    const nextPhotoDrafts = files.map((file) => ({
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      file,
    }));

    photoDraftsRef.current = nextPhotoDrafts;
    setPhotoDrafts(nextPhotoDrafts);
    setPhotoError("");
    setSaveError("");
  };

  const handlePolishMemory = async () => {
    if (!isAdmin || !canEditFields) {
      setPolishError("请先登录后再使用 AI 润色");
      return;
    }
    if (!trimmedText || polishing) return;

    setPolishing(true);
    setPolishError("");

    try {
      const response = await apiFetch("/ai/memory-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: trimmedText,
          cityId: city.id,
          city: city.name,
          date: normalizedDate ?? trimmedDate,
        }),
      });
      if (!response.ok) throw new Error("Polish failed");
      const data = (await response.json()) as { polishedText?: unknown };
      const nextText = typeof data.polishedText === "string" ? data.polishedText.trim().slice(0, memoryTextMaxLength) : "";
      if (!nextText) throw new Error("Empty polish result");
      setPolishSuggestion(nextText);
    } catch {
      setPolishError("润色失败，请稍后再试");
    } finally {
      if (mountedRef.current) setPolishing(false);
    }
  };

  const handlePickLandmark = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin || !onSaveLandmark) {
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
      setLandmarkError("请先登录后再保存地标图");
      return;
    }
    if (!file || !file.type.startsWith("image/") || landmarkSaving) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    let uploadedKey = "";
    try {
      const uploaded = await uploadImage(file, "city-assets");
      uploadedKey = uploaded.key;
      await onSaveLandmark(city.id, uploaded.url);
    } catch {
      await deleteUploaded([uploadedKey]);
      setLandmarkError("地标图片保存失败，请重新选择");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
      if (landmarkInputRef.current) landmarkInputRef.current.value = "";
    }
  };

  const handleDeleteLandmark = async () => {
    if (!isAdmin || !onDeleteLandmark) {
      setLandmarkError("请先登录后再删除地标图");
      return;
    }

    if (!hasCustomLandmark || landmarkSaving) return;
    if (!await confirm({ title: `确定删除 ${city.name} 的自定义地标图吗？`, danger: true, confirmText: "删除" })) return;

    setLandmarkSaving(true);
    setLandmarkError("");

    try {
      await onDeleteLandmark(city.id);
    } catch {
      setLandmarkError("地标图片删除失败，请稍后再试");
    } finally {
      if (mountedRef.current) setLandmarkSaving(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setSaveError("请先登录后再保存");
      return;
    }
    if (!canSave) return;
    if (canEditFields && !normalizedDate) return;
    setIsSaving(true);
    setSaveError("");

    let uploadedKeys: string[] = [];
    try {
      if (editingMemory && canAnnotate && !canEditFields) {
        await onUpdate(city.id, editingMemory.id, { partnerNote: partnerNote.trim() });
        resetForm(true);
        setFormOpen(false);
        return;
      }

      if (!normalizedDate) return;

      const uploaded = await uploadImages(photoDrafts.map((photo) => photo.file), "memories");
      uploadedKeys = uploaded.map((item) => item.key);
      const photos = uploaded.map((item) => item.url);
      const nextTags = Array.from(
        new Set(
          tags
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ).slice(0, 12);
      const nextPhotos = photos.length > 0 ? photos : editingMemory?.photos ?? [editingMemory?.image ?? resolvedLandmarkImage];
      const nextMemory: Memory = {
        id: editingMemory?.id ?? `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        date: normalizedDate,
        image: editingMemory && photos.length === 0 ? editingMemory.image : nextPhotos[0],
        photos: nextPhotos,
        text: trimmedText,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
        createdById: editingMemory?.createdById,
        createdAt: editingMemory?.createdAt,
      };

      if (editingMemory) {
        const patch: MemoryPatchPayload = {
          title: nextMemory.title,
          placeName: nextMemory.placeName,
          date: nextMemory.date,
          image: nextMemory.image,
          text: nextMemory.text,
          mood: nextMemory.mood,
          tags: nextMemory.tags,
          visibility: nextMemory.visibility,
        };
        if (uploaded.length > 0) {
          patch.photos = memoryPhotosPayload(nextMemory.photos ?? [nextMemory.image]);
        }
        await onUpdate(city.id, editingMemory.id, patch);
      } else {
        await onSave(city.id, {
          id: `${city.id}-local`,
          cityId: city.id,
          city: city.name,
          cityEn: city.nameEn,
          date: normalizedDate,
          image: photos[0] ?? resolvedLandmarkImage,
          photos: photos.length > 0 ? photos : [resolvedLandmarkImage],
          text: trimmedText,
          title: title.trim() || undefined,
          placeName: placeName.trim() || undefined,
          mood: mood.trim() || undefined,
          tags: nextTags,
          visibility,
        });
      }
      resetForm(true);
      setFormOpen(false);
    } catch {
      await deleteUploaded(uploadedKeys);
      setSaveError("保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const handleSetCover = async (photo: string) => {
    if (!memory || !onSetCover || !canSetCover) {
      setCoverError("只有创建者可以设置封面");
      return;
    }

    if (memory.image === photo || settingCover) return;
    setSettingCover(photo);
    setCoverError("");

    try {
      await onSetCover(city.id, memory.id, photo);
    } catch {
      setCoverError("封面保存失败，请稍后再试");
    } finally {
      if (mountedRef.current) setSettingCover("");
    }
  };

  const renderNoteEditor = (record: Memory) => (
    <div
      ref={noteEditorRef}
      className="rounded-[8px] border border-sakura/78 bg-sakura/22 p-3 shadow-[0_8px_20px_rgba(232,184,194,0.08)]"
    >
      <label className="block">
        <span className="flex items-center justify-between gap-3 text-xs font-semibold text-rose-ink">
          补充回忆
          <span className="font-normal text-ink/45">{noteDraft.length}/500</span>
        </span>
        <textarea
          className="mt-2 w-full resize-none rounded-[7px] border border-sakura bg-cream px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
          rows={3}
          value={noteDraft}
          onChange={(event) => {
            setNoteDraft(event.target.value);
            setNoteError("");
          }}
          placeholder="留给另一个人的一句补充..."
          maxLength={500}
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[7px] bg-slate px-4 text-sm font-semibold text-white transition hover:bg-rose disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          onClick={() => handleSaveNote(record)}
          disabled={!canSaveNote}
        >
          {noteSaving && <Spinner size="sm" />}
          {noteSaving ? "保存中" : record.partnerNote ? "保存修改" : "保存补充"}
        </button>
        <button
          className="min-h-10 rounded-[7px] border border-dim px-4 text-sm font-semibold text-ink/62 transition hover:border-sky hover:text-sky"
          type="button"
          onClick={resetAnnotation}
          disabled={noteSaving}
        >
          取消
        </button>
      </div>
      {noteError && <p className="mt-2 text-xs font-semibold text-rose">{noteError}</p>}
    </div>
  );

  const footer = formOpen ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] bg-slate px-4 text-sm font-semibold text-white transition hover:bg-rose disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          onClick={handleSave}
          disabled={!canSave}
        >
          {isSaving && <Spinner size="sm" />}
          {isSaving ? "保存中" : canAnnotate ? "保存补充" : isEditing ? "保存修改" : "保存回忆"}
        </button>
        <button
          className="min-h-11 rounded-[8px] border border-dim px-4 text-sm font-semibold text-ink/62 transition hover:border-sky hover:text-sky"
          type="button"
          disabled={isSaving}
          onClick={() => {
            resetForm(true);
            setFormOpen(false);
          }}
        >
          取消
        </button>
      </div>
      {saveError && <p className="text-xs font-semibold text-rose">{saveError}</p>}
    </div>
  ) : undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      snapPoints={[0.94]}
      initialSnap={0}
      contentClassName="px-4 sm:px-5"
      footer={footer}
      header={
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-lg font-semibold text-ink">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${isLit ? "bg-bloom" : "bg-dim"}`} />
              <span className="truncate">{city.name}</span>
              <span className="truncate text-xs font-medium text-ink/48">{city.nameEn}</span>
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium text-ink/52">
              {formOpen
                ? canAnnotate
                  ? "给这段回忆添加补充"
                  : isEditing
                    ? "编辑这段回忆"
                    : "添加新的城市回忆"
                : memory?.date ?? "添加回忆后点亮"}
            </p>
          </div>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] text-ink/62 transition hover:bg-dim/28 hover:text-ink"
            type="button"
            onClick={onClose}
            aria-label="关闭回忆弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2 text-ink">
        {!formOpen && (
          <div className="flex rounded-[8px] border border-dim/72 bg-cream/72 p-1 text-xs font-semibold text-ink/58">
            {([
              ["memory", "回忆"],
              ["gallery", "相册"],
              ["history", "历史"],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                className={`flex-1 rounded-[7px] px-3 py-2 text-center transition ${
                  activeTab === tab ? "bg-sakura text-bloom" : "hover:bg-mist/30"
                }`}
                type="button"
                onClick={() => {
                  resetAnnotation();
                  setActiveTab(tab);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {showMemory && !formOpen && (
          <div className="space-y-4">
            {showLandmarkTools && (
              <div className="rounded-[7px] border border-dim/72 bg-cream/72 p-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[6px] border border-dim bg-mist">
                    <MobileMemoryImage src={resolvedLandmarkImage} alt={`${city.name} 地标图`} dim={!isLit} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink/72">地图地标图</p>
                    <p className="mt-1 text-[11px] leading-4 text-ink/46">
                      上传后会显示在省份地图里，不需要先点亮城市。
                    </p>
                  </div>
                </div>
                <input
                  ref={landmarkInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={handlePickLandmark}
                  disabled={!isAdmin}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-sky px-3 py-2 text-xs font-semibold text-sky transition hover:bg-mist/34 disabled:opacity-45"
                    type="button"
                    onClick={() => landmarkInputRef.current?.click()}
                    disabled={landmarkSaving || !isAdmin}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {hasCustomLandmark ? "替换地标" : "上传地标"}
                  </button>
                  {hasCustomLandmark && (
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] border border-sakura text-bloom transition hover:bg-sakura/45 disabled:opacity-45"
                      type="button"
                      onClick={handleDeleteLandmark}
                      disabled={landmarkSaving || !isAdmin}
                      aria-label="删除自定义地标图"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {landmarkError && <p className="mt-2 text-xs text-bloom">{landmarkError}</p>}
              </div>
            )}

            <button
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-[8px] border border-dim bg-mist text-left transition hover:border-bloom focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky/70"
              type="button"
              onClick={() => memoryPhotos.length > 0 && setPreviewPhotoIndex(coverPhotoIndex)}
              aria-label={memoryPhotos.length > 0 ? `放大查看 ${city.name} 回忆照片` : `${city.name} 回忆图片`}
            >
              <MobileMemoryImage
                src={memory?.image ?? resolvedLandmarkImage}
                alt={`${city.name} memory`}
                dim={!isLit}
                fit={memory ? "cover" : "contain"}
              />
              {memoryPhotos.length > 1 && (
                <span className="absolute bottom-2 right-2 rounded-[6px] bg-cream/86 px-2 py-1 text-xs font-medium text-ink/78 shadow-[0_6px_14px_rgba(90,102,112,0.12)]">
                  {memoryPhotos.length} photos
                </span>
              )}
            </button>

            {memoryPhotos.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {memoryPhotos.map((photo, index) => {
                  const isCover = memory?.image === photo;

                  return (
                    <div
                      key={`${memory?.id ?? city.id}-mobile-photo-${index}`}
                      className={`group relative aspect-square overflow-hidden rounded-[5px] border bg-mist transition ${
                        isCover
                          ? "border-bloom shadow-[0_0_0_2px_rgba(245,220,224,0.75)]"
                          : "border-dim hover:border-bloom"
                      }`}
                    >
                      <button
                        className="relative h-full w-full"
                        type="button"
                        onClick={() => setPreviewPhotoIndex(index)}
                        aria-label={`放大查看第 ${index + 1} 张照片`}
                      >
                        <MobileMemoryImage src={photo} alt={`${city.name} memory photo ${index + 1}`} fit="cover" />
                      </button>
                      {canSetCover && (
                        <button
                          type="button"
                          className={`absolute inset-x-1 bottom-1 rounded-[4px] bg-cream/90 px-1.5 py-1 text-[10px] font-medium shadow-[0_4px_10px_rgba(90,102,112,0.10)] transition ${
                            isCover ? "text-bloom opacity-100" : "text-ink/68 opacity-0 group-hover:opacity-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isCover && !settingCover) void handleSetCover(photo);
                          }}
                          disabled={isCover || Boolean(settingCover)}
                        >
                          {isCover ? "封面" : settingCover === photo ? "保存中" : "设封面"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {coverError && <p className="text-xs text-bloom">{coverError}</p>}

            {memory && localMemoryIds.has(memory.id) && (
              <div className="flex gap-2">
                {canEditMemory ? (
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-dim px-3 py-2.5 text-xs font-semibold text-ink/70 transition hover:border-sky hover:text-sky"
                    type="button"
                    onClick={() => startEdit(memory)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </button>
                ) : canAnnotateMemory ? (
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-sakura px-3 py-2.5 text-xs font-semibold text-bloom transition hover:bg-sakura/55"
                    type="button"
                    onClick={() => startAnnotate(memory)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    添加补充
                  </button>
                ) : null}
                {canEditMemory && (
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-sakura px-3 py-2.5 text-xs font-semibold text-bloom transition hover:bg-sakura/55 disabled:opacity-45"
                    type="button"
                    onClick={() => handleDelete(memory)}
                    disabled={deletingMemoryId === memory.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingMemoryId === memory.id ? "删除中" : "删除"}
                  </button>
                )}
              </div>
            )}
            {deleteError && <p className="text-xs text-bloom">{deleteError}</p>}
            {memory && annotatingMemoryId === memory.id && renderNoteEditor(memory)}
            {noteError && !annotatingMemoryId && <p className="text-xs text-bloom">{noteError}</p>}

            {memory ? (
              <MemoryContentView memory={memory} cityName={city.name} showPhotos={false} showTitle />
            ) : (
              <div className="rounded-[8px] border border-dashed border-dim bg-cream/70 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-ink">这座城市还没有回忆</p>
                <p className="mt-2 text-xs leading-5 text-ink/52">
                  {isAdmin ? "写下第一段回忆后，这座城市会被点亮。" : "登录后可以添加第一段回忆。"}
                </p>
              </div>
            )}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-dim px-3 py-3 text-sm font-semibold text-ink/68 transition hover:border-sky hover:text-sky disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              onClick={startCreate}
              disabled={!isAdmin}
            >
              <Plus className="h-4 w-4" />
              {isLit ? "添加新回忆" : "添加回忆并点亮"}
            </button>
          </div>
        )}

        {showGallery && !formOpen && (
          <MemoryGallery city={city} photos={galleryPhotos} />
        )}

        {showHistory && !formOpen && (
          <MemoryHistory
            city={city}
            memories={memories}
            localMemoryIds={localMemoryIds}
            isAdmin={isAdmin}
            annotatingMemoryId={annotatingMemoryId}
            deletingMemoryId={deletingMemoryId}
            deleteError={deleteError}
            onEdit={startEdit}
            onAnnotate={startAnnotate}
            onDelete={handleDelete}
            renderNoteEditor={renderNoteEditor}
          />
        )}

        {formOpen && (
          <div className="space-y-3">
            {canEditFields && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-ink/70">标题</span>
                  <input
                    className="mt-1.5 w-full rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="例如：第一次一起看海"
                    maxLength={120}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-ink/70">具体地点</span>
                  <input
                    className="mt-1.5 w-full rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                    type="text"
                    value={placeName}
                    onChange={(event) => setPlaceName(event.target.value)}
                    placeholder={`${city.name} 的某条街、某家店、某个角落`}
                    maxLength={120}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-ink/70">日期</span>
                  <DatePicker
                    className="mt-1.5 w-full rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                    value={date}
                    onChange={setDate}
                    aria-invalid={dateInvalid}
                  />
                  {dateInvalid && (
                    <span className="mt-1.5 block text-xs text-bloom">
                      请使用 2024.05.20 或 2024.5.20 格式
                    </span>
                  )}
                </label>

                <label className="block">
                  <span className="flex items-center justify-between gap-3 text-xs font-medium text-ink/70">
                    一句话回忆
                    <span className="font-normal text-ink/45">{text.length}/{memoryTextMaxLength}</span>
                  </span>
                  <textarea
                    className="mt-1.5 w-full resize-none rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                    rows={3}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setPolishSuggestion("");
                      setPolishError("");
                    }}
                    placeholder="写下这一刻..."
                    maxLength={memoryTextMaxLength}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-ink/70">心情</span>
                    <input
                      className="mt-1.5 w-full rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      type="text"
                      value={mood}
                      onChange={(event) => setMood(event.target.value)}
                      placeholder="开心、想念、松弛..."
                      maxLength={40}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-ink/70">标签</span>
                    <input
                      className="mt-1.5 w-full rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                      type="text"
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="海边，夜景，第一次"
                      maxLength={120}
                    />
                  </label>
                </div>

                <div>
                  <span className="text-xs font-medium text-ink/70">可见性</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {[
                      ["both", "给我们看"],
                      ["me", "只给我"],
                      ["her", "只给她"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={`rounded-[7px] border px-2 py-2 text-xs font-semibold transition ${
                          visibility === value
                            ? "border-sakura bg-sakura/62 text-rose-ink"
                            : "border-dim bg-cream text-ink/58 hover:border-sky"
                        }`}
                        type="button"
                        onClick={() => setVisibility(value as "both" | "me" | "her")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-sakura bg-sakura/42 px-3 text-xs font-semibold text-bloom transition hover:bg-sakura/70 disabled:cursor-not-allowed disabled:opacity-45"
                    type="button"
                    onClick={handlePolishMemory}
                    disabled={!trimmedText || polishing}
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
                            setText(polishSuggestion.slice(0, memoryTextMaxLength));
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

                <div>
                  <span className="text-xs font-medium text-ink/70">照片</span>
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePickFile}
                  />
                  <button
                    className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-[7px] border border-dashed border-dim bg-cream px-3 py-3 text-sm text-ink/70 transition hover:border-bloom hover:text-bloom"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {photoDrafts.length > 0 ? (
                      <span className="relative w-full">
                        <span className="grid grid-cols-4 gap-2">
                          {photoDrafts.slice(0, 8).map((photo, index) => (
                            <span
                              key={`${photo.previewUrl}-${index}`}
                              className="relative aspect-square overflow-hidden rounded-[4px] bg-mist"
                            >
                              <LocalPrivacyImg
                                className="pixelated h-full w-full object-cover"
                                src={photo.previewUrl}
                                alt={photo.name || `照片预览 ${index + 1}`}
                              />
                            </span>
                          ))}
                        </span>
                        <span className="mt-2 block text-xs text-ink/58">
                          已选择 {photoDrafts.length} 张
                        </span>
                      </span>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4" />
                        选择本地图片，可多选
                      </>
                    )}
                  </button>
                  {photoError && <span className="mt-1.5 block text-xs text-bloom">{photoError}</span>}
                </div>
              </>
            )}

              {canAnnotate && (
                <label className="block">
                <span className="text-xs font-medium text-ink/70">补充回忆</span>
                <textarea
                  className="mt-1.5 w-full resize-none rounded-[7px] border border-dim bg-cream px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-ink/40 outline-none transition focus:border-bloom"
                  rows={4}
                  value={partnerNote}
                  onChange={(event) => setPartnerNote(event.target.value)}
                  placeholder="留给另一个人的一句补充..."
                  maxLength={500}
                />
              </label>
            )}
          </div>
        )}
      </div>
      <PhotoLightbox
        photos={memoryPhotos}
        index={previewPhotoIndex}
        title={`${city.name} 回忆照片`}
        onClose={() => setPreviewPhotoIndex(null)}
        onIndexChange={setPreviewPhotoIndex}
      />
      {confirmDialog}
    </BottomSheet>
  );
}
