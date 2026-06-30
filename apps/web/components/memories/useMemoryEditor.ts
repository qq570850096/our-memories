"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { City } from "@/data/cities";
import type { Memory } from "@/data/memories";
import { apiFetch } from "@/lib/apiClient";
import { normalizeDottedDate } from "@/lib/dateFormat";
import { type MemoryPatchPayload, type MemoryPhotoPayload } from "@/lib/memoryApi";
import { memoryPhotosPayload, uploadedPhotosPayload } from "@/lib/photoPayload";
import { computeMemoryEditAccess } from "@/lib/useContentEditAccess";
import { deleteUploaded, uploadImages } from "@/lib/upload";

export type PhotoDraft = {
  previewUrl: string;
  name: string;
  file: File;
};

export const memoryTextMaxLength = 80;
export const maxPhotosPerMemory = 24;

const isObjectUrl = (url?: string | null): url is string =>
  typeof url === "string" && url.startsWith("blob:");

const revokeObjectUrl = (url?: string | null) => {
  if (isObjectUrl(url)) URL.revokeObjectURL(url);
};

export const revokePhotoDrafts = (photos: PhotoDraft[]) => {
  photos.forEach((photo) => revokeObjectUrl(photo.previewUrl));
};

type AnnotationSaveMode = "nonempty" | "changed";

type UseMemoryEditorOptions = {
  city: City;
  fallbackImage: string;
  isAdmin: boolean;
  annotationSaveMode?: AnnotationSaveMode;
  onOptimisticSave?: (cityId: string, memory: Memory) => (() => void) | void;
  onSave: (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[], rollbackPending?: () => void) => Promise<void>;
  onUpdate: (cityId: string, memoryId: string, memory: MemoryPatchPayload) => Promise<void>;
};

export function useMemoryEditor({
  city,
  fallbackImage,
  isAdmin,
  annotationSaveMode = "nonempty",
  onOptimisticSave,
  onSave,
  onUpdate,
}: UseMemoryEditorOptions) {
  const [title, setTitle] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [voiceTextUrl, setVoiceTextUrl] = useState("");
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState("");
  const [partnerNote, setPartnerNote] = useState("");
  const [partnerVoiceUrl, setPartnerVoiceUrl] = useState("");
  const [visibility, setVisibility] = useState<"both" | "me" | "her">("both");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState("");
  const [polishError, setPolishError] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const photoDraftsRef = useRef<PhotoDraft[]>([]);
  const mountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editingAccess = computeMemoryEditAccess(editingMemory);
  const isCreating = editingMemory == null;
  const canEditFields = isAdmin && (isCreating || editingAccess.canEdit);
  const canAnnotate = isAdmin && !isCreating && editingAccess.canAddNote && !editingAccess.canEdit;
  const trimmedDate = date.trim();
  const trimmedText = text.trim();
  const normalizedDate = normalizeDottedDate(trimmedDate);
  const dateInvalid = trimmedDate.length > 0 && !normalizedDate;
  const trimmedPartnerNote = partnerNote.trim();
  const originalPartnerNote = editingMemory?.partnerNote?.trim() ?? "";
  const originalPartnerVoiceUrl = editingMemory?.partnerVoiceUrl ?? "";
  const canSaveAnnotation =
    annotationSaveMode === "changed"
      ? (trimmedPartnerNote !== originalPartnerNote || partnerVoiceUrl !== originalPartnerVoiceUrl) &&
        (trimmedPartnerNote.length > 0 || originalPartnerNote.length > 0 || partnerVoiceUrl.length > 0 || originalPartnerVoiceUrl.length > 0)
      : trimmedPartnerNote.length > 0 || partnerVoiceUrl.length > 0;
  const canSave = isAdmin
    ? canEditFields
      ? Boolean(normalizedDate) &&
        trimmedText.length > 0 &&
        !photoError &&
        !isSaving
      : canAnnotate &&
        editingMemory != null &&
        canSaveAnnotation &&
        !isSaving
    : false;
  const isEditing = Boolean(editingMemory);

  const resetForm = useCallback((revokePhoto: boolean) => {
    setTitle("");
    setPlaceName("");
    setDate("");
    setText("");
    setVoiceTextUrl("");
    setMood("");
    setTags("");
    setPartnerNote("");
    setPartnerVoiceUrl("");
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
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      revokePhotoDrafts(photoDraftsRef.current);
    };
  }, []);

  const startEdit = useCallback((record: Memory) => {
    revokePhotoDrafts(photoDraftsRef.current);
    photoDraftsRef.current = [];
    setPhotoDrafts([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTitle(record.title ?? "");
    setPlaceName(record.placeName ?? "");
    setDate(record.date);
    setText(record.text);
    setVoiceTextUrl(record.voiceTextUrl ?? "");
    setMood(record.mood ?? "");
    setTags(record.tags?.join("，") ?? "");
    setPartnerNote(record.partnerNote ?? "");
    setPartnerVoiceUrl(record.partnerVoiceUrl ?? "");
    setVisibility(record.visibility ?? "both");
    setPhotoError("");
    setPolishSuggestion("");
    setPolishError("");
    setPolishing(false);
    setSaveError("");
    setCoverError("");
    setDeleteError("");
    setEditingMemory(record);
  }, []);

  const handlePickFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
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
    },
    [canEditFields, isAdmin],
  );

  const handlePolishMemory = useCallback(async () => {
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
  }, [canEditFields, city.id, city.name, isAdmin, normalizedDate, polishing, trimmedDate, trimmedText]);

  const acceptPolishSuggestion = useCallback(() => {
    setText(polishSuggestion.slice(0, memoryTextMaxLength));
    setPolishSuggestion("");
    setPolishError("");
  }, [polishSuggestion]);

  const clearPolishSuggestion = useCallback(() => {
    setPolishSuggestion("");
    setPolishError("");
  }, []);

  const handleTextChange = useCallback((nextText: string) => {
    setText(nextText);
    setPolishSuggestion("");
    setPolishError("");
  }, []);

  const save = useCallback(async () => {
    if (!isAdmin) {
      setSaveError("请先登录后再保存");
      return false;
    }
    if (!canSave) return false;
    if (canEditFields && !normalizedDate) return false;
    setIsSaving(true);
    setSaveError("");

    let uploadedKeys: string[] = [];
      const memoryBeingEdited = editingMemory;
      const draftsToUpload = photoDraftsRef.current;
      try {
        if (memoryBeingEdited && canAnnotate && !canEditFields) {
        await onUpdate(city.id, memoryBeingEdited.id, { partnerNote: trimmedPartnerNote, partnerVoiceUrl });
        resetForm(true);
        return true;
      }

      if (!normalizedDate) return false;

      const nextTags = Array.from(
        new Set(
          tags
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
          .filter(Boolean),
        ),
      ).slice(0, 12);
      const previewPhotos = draftsToUpload.length > 0
        ? draftsToUpload.map((photo) => photo.previewUrl)
        : memoryBeingEdited?.photos ?? [memoryBeingEdited?.image ?? fallbackImage];
      const previewImage = memoryBeingEdited && draftsToUpload.length === 0 ? memoryBeingEdited.image : previewPhotos[0];
      const baseMemory: Memory = {
        id: memoryBeingEdited?.id ?? `${city.id}-local`,
        cityId: city.id,
        city: city.name,
        cityEn: city.nameEn,
        title: title.trim() || undefined,
        placeName: placeName.trim() || undefined,
        date: normalizedDate,
        image: previewImage,
        photos: previewPhotos,
        text: trimmedText,
        voiceTextUrl,
        partnerVoiceUrl,
        mood: mood.trim() || undefined,
        tags: nextTags,
        visibility,
        createdById: memoryBeingEdited?.createdById,
        createdAt: memoryBeingEdited?.createdAt,
      };

      const rollbackPending = !memoryBeingEdited ? onOptimisticSave?.(city.id, baseMemory) : undefined;
      const rollback = typeof rollbackPending === "function" ? rollbackPending : undefined;
      resetForm(false);

      const uploaded = await uploadImages(draftsToUpload.map((photo) => photo.file), "memories");
      uploadedKeys = uploaded.map((item) => item.key);
      const uploadedPhotoPayload = uploadedPhotosPayload(uploaded);
      const photos = uploadedPhotoPayload.map((item) => item.url);
      const nextPhotos = photos.length > 0 ? photos : memoryBeingEdited?.photos ?? [memoryBeingEdited?.image ?? fallbackImage];
      const nextMemory: Memory = {
        ...baseMemory,
        image: memoryBeingEdited && photos.length === 0 ? memoryBeingEdited.image : nextPhotos[0],
        photos: nextPhotos,
      };

      if (memoryBeingEdited) {
        const patch: MemoryPatchPayload = {
          title: nextMemory.title,
          placeName: nextMemory.placeName,
          date: nextMemory.date,
          image: nextMemory.image,
          text: nextMemory.text,
          voiceTextUrl: nextMemory.voiceTextUrl,
          partnerVoiceUrl: nextMemory.partnerVoiceUrl,
          mood: nextMemory.mood,
          tags: nextMemory.tags,
          visibility: nextMemory.visibility,
        };
        if (uploaded.length > 0) {
          patch.coverImage = nextMemory.image;
          patch.photos = uploadedPhotoPayload;
        }
        await onUpdate(city.id, memoryBeingEdited.id, patch);
      } else {
        const createPhotosPayload =
          uploadedPhotoPayload.length > 0 ? uploadedPhotoPayload : memoryPhotosPayload([fallbackImage]);
        await onSave(city.id, {
          ...baseMemory,
          image: photos[0] ?? fallbackImage,
          photos: photos.length > 0 ? photos : [fallbackImage],
        }, createPhotosPayload, rollback);
      }
      revokePhotoDrafts(draftsToUpload);
      return true;
    } catch {
      await deleteUploaded(uploadedKeys);
      revokePhotoDrafts(draftsToUpload);
      if (!memoryBeingEdited) resetForm(true);
      setSaveError("保存失败，请稍后再试");
      return false;
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [
    canAnnotate,
    canEditFields,
    canSave,
    city.id,
    city.name,
    city.nameEn,
    editingMemory,
    fallbackImage,
    isAdmin,
    mood,
    normalizedDate,
    onOptimisticSave,
    onSave,
    onUpdate,
    placeName,
    resetForm,
    tags,
    title,
    trimmedPartnerNote,
    trimmedText,
    visibility,
    voiceTextUrl,
    partnerVoiceUrl,
  ]);

  return {
    title,
    setTitle,
    placeName,
    setPlaceName,
    date,
    setDate,
    text,
    setText: handleTextChange,
    voiceTextUrl,
    setVoiceTextUrl,
    mood,
    setMood,
    tags,
    setTags,
    partnerNote,
    setPartnerNote,
    partnerVoiceUrl,
    setPartnerVoiceUrl,
    visibility,
    setVisibility,
    photoDrafts,
    photoError,
    polishSuggestion,
    setPolishSuggestion,
    polishError,
    setPolishError,
    polishing,
    saveError,
    setSaveError,
    coverError,
    setCoverError,
    editingMemory,
    deleteError,
    setDeleteError,
    isSaving,
    fileInputRef,
    canEditFields,
    canAnnotate,
    trimmedText,
    normalizedDate,
    dateInvalid,
    canSave,
    isEditing,
    resetForm,
    startEdit,
    handlePickFile,
    handlePolishMemory,
    acceptPolishSuggestion,
    clearPolishSuggestion,
    save,
  };
}
