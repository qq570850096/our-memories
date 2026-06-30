"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Plus, Archive, Trash2, Edit, ImagePlus } from "lucide-react";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { VoicePlayer } from "@/components/ui/VoicePlayer";
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";
import { useConfirm } from "@/components/ui/use-confirm";
import { useToast } from "@/components/ui/toast";
import { ApiError, apiJson } from "@/lib/apiClient";
import { useAuth } from "@/lib/authContext";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useTransientStatus } from "@/lib/useTransientStatus";
import { useApi } from "@/lib/swr";
import { deleteUploaded, uploadImages } from "@/lib/upload";
import { photoPayload } from "@/lib/photoPayload";
import { daysUntil, getTodayString } from "@/lib/dateFormat";

type CapsulePhoto = {
  id?: string;
  url?: string;
  key?: string;
  mimeType?: string;
  sortOrder?: number;
};

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  voiceUrl?: string;
  openMode?: "single" | "together";
  openedByUserIds?: string[];
  revealedAt?: string;
  isOpened: boolean;
  createdById: string;
  createdAt: string;
  photos?: CapsulePhoto[];
};

const emptyForm = {
  title: "",
  openDate: "",
  content: "",
  voiceUrl: "",
  openMode: "single" as "single" | "together",
  photos: [] as string[],
};

export default function TimeCapsule() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [status, setStatus] = useTransientStatus();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = useContentEditAccess();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { session } = useAuth();
  const { data, isLoading, mutate } = useApi<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules");
  const capsules = data?.timeCapsules ?? [];

  const openDialog = (capsule?: TimeCapsule) => {
    setStatus("");
    setPhotoKeys([]);
    setPhotosDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (capsule) {
      const photos = (capsule.photos ?? []).flatMap((photo) => (photo.url ? [photo.url] : []));
      setEditingId(capsule.id);
      setForm({
        title: capsule.title,
        openDate: capsule.openDate,
        content: capsule.content,
        voiceUrl: capsule.voiceUrl ?? "",
        openMode: capsule.openMode ?? "single",
        photos,
      });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setSealed(false);
    setPhotoKeys([]);
    setPhotosDirty(false);
    setStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (files.length === 0) return;
    const previousKeys = photoKeys;
    setWorking(true);
    setStatus("正在上传照片...");
    try {
      const uploaded = await uploadImages(files, "time-capsules");
      setForm((current) => ({ ...current, photos: uploaded.map((item) => item.url) }));
      setPhotoKeys(uploaded.map((item) => item.key));
      setPhotosDirty(true);
      if (previousKeys.length > 0) void deleteUploaded(previousKeys);
      setStatus("");
    } catch {
      setStatus("照片上传失败，请重新选择。", { autoClear: true });
    } finally {
      setWorking(false);
      event.target.value = "";
    }
  };

  const save = async () => {
    if (working) return;
    if (!form.title.trim() || !form.openDate || !form.content.trim()) {
      setStatus("请填写所有必填项。", { autoClear: true });
      return;
    }

    // 验证日期必须是今天之后
    const [sy, sm, sd] = form.openDate.split("-").map(Number);
    const selectedDate = new Date(sy, sm - 1, sd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate <= today) {
      setStatus("开启日期必须是今天之后。", { autoClear: true });
      return;
    }

    const payload: {
      title: string;
      openDate: string;
      content: string;
      voiceUrl?: string;
      openMode: "single" | "together";
      photos?: ReturnType<typeof photoPayload>;
    } = {
      title: form.title.trim(),
      openDate: form.openDate,
      content: form.content.trim(),
      voiceUrl: form.voiceUrl,
      openMode: form.openMode,
    };
    if (!editingId || photosDirty) payload.photos = photoPayload(form.photos);

    setWorking(true);
    setStatus("");
    try {
      if (editingId) {
        await apiJson(`/api/v1/time-capsules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiJson("/api/v1/time-capsules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      if (!editingId) {
        setSealed(true);
        window.setTimeout(() => {
          closeDialog();
          setSealed(false);
        }, 820);
      } else {
        closeDialog();
      }
      void mutate();
    } catch (error) {
      await deleteUploaded(photoKeys);
      setStatus(error instanceof ApiError ? error.message : "保存失败，请稍后再试。", { autoClear: true });
    } finally {
      setWorking(false);
    }
  };

  const deleteCapsule = async (id: string) => {
    if (!await confirm({ title: "确定删除这个时光胶囊吗？", danger: true, confirmText: "删除" })) return;
    if (deletingId) return;
    setDeletingId(id);
    try {
      await apiJson(`/api/v1/time-capsules/${id}`, { method: "DELETE" });
      void mutate();
      toast("时光胶囊已删除", "success");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "删除失败，请稍后再试", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const openCapsule = async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    try {
      await apiJson(`/api/v1/time-capsules/${id}/open`, { method: "POST" });
      void mutate();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "开启失败，请稍后再试", "error");
    } finally {
      setOpeningId("");
    }
  };

  return (
    <MemoryPageShell active="capsule">
      <header>
        <h1 className="text-2xl font-bold text-slate">📦 时光宝盒</h1>
        <p className="text-sm text-ink/60 mt-1">查看时光胶囊</p>
      </header>

      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-bloom text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-50 lg:bottom-6"
        onClick={() => openDialog()}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      <Modal
        open={open}
        onClose={() => { if (!working) closeDialog(); }}
        title={editingId ? "编辑时光胶囊" : "埋下时光胶囊"}
        closeOnOverlay={!working}
      >
        <div className="relative space-y-3 overflow-hidden">
          <Input
            placeholder="标题 *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <input
            type="date"
            className="min-h-10 w-full rounded-[7px] border border-dim/80 bg-cream/76 px-3 text-sm text-ink outline-none transition focus:border-sky focus:bg-white"
            value={form.openDate}
            min={getTodayString()}
            onChange={(e) => setForm({ ...form, openDate: e.target.value })}
            required
          />
          <Textarea
            placeholder="写给未来的话... *"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={5}
            required
          />
          <VoiceRecorder
            folder="time-capsules"
            value={form.voiceUrl}
            disabled={!isAdmin || working}
            onChange={(voiceUrl) => setForm((current) => ({ ...current, voiceUrl }))}
            onError={(message) => setStatus(message, { autoClear: true })}
          />
          <div className="grid grid-cols-2 gap-2">
            {(["single", "together"] as const).map((mode) => (
              <button
                key={mode}
                className={`min-h-10 rounded-[7px] border px-3 text-sm font-semibold transition ${
                  form.openMode === mode
                    ? "border-bloom bg-sakura/50 text-bloom"
                    : "border-dim bg-cream/72 text-ink/58 hover:border-sky"
                }`}
                type="button"
                onClick={() => setForm((current) => ({ ...current, openMode: mode }))}
                disabled={!isAdmin || working}
              >
                {mode === "single" ? "到期可打开" : "一起打开"}
              </button>
            ))}
          </div>
          <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={pickPhotos} disabled={!isAdmin || working} />
          <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={!isAdmin || working}>
            <ImagePlus className="h-4 w-4" />
            {form.photos.length ? `已选择 ${form.photos.length} 张照片` : "选择照片"}
          </Button>
          {form.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {form.photos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="relative aspect-square overflow-hidden rounded-[6px] border border-dim bg-mist/36">
                  <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`时光胶囊照片 ${index + 1}`} />
                </div>
              ))}
            </div>
          )}
          {status && <p className="rounded-[7px] border border-dim/70 bg-white/42 px-3 py-2 text-xs leading-5 text-ink/66">{status}</p>}
          <Button className="w-full" onClick={save} disabled={!isAdmin || working}>
            {working ? <Spinner size="sm" /> : editingId ? "保存" : "埋下胶囊"}
          </Button>
          {sealed && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden rounded-[8px] bg-bloom/8">
              <div className="time-capsule-seal absolute inset-x-0 bottom-0 bg-bloom/88" />
              <div className="relative z-10 rounded-[7px] border border-cream/70 bg-sakura px-4 py-2 text-sm font-semibold text-bloom shadow-lg">
                已封存 · {form.openDate}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {confirmDialog}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-[8px] border border-dim/80 bg-cream p-5 shadow-[var(--shadow-card)]">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-3 h-20 w-full" />
              </div>
            ))}
          </div>
        ) : capsules.length === 0 ? (
          <EmptyState icon={<Archive className="h-7 w-7" />} title="还没有时光胶囊">
            创建第一个时光胶囊吧。
          </EmptyState>
        ) : (
          capsules.map((cap) => {
            const days = daysUntil(cap.openDate);
            const isLocked = days > 0;
            const isReady = Boolean(session?.user?.id && cap.openedByUserIds?.includes(session.user.id));
            const isTogetherWaiting = !isLocked && cap.openMode === "together" && !cap.isOpened && isReady;
            const canEdit = cap.createdById === session?.user?.id && isLocked; // 只有未开启时创建人可编辑
            const photos = (cap.photos ?? []).flatMap((photo) => (photo.url ? [photo.url] : []));

            return (
              <div
                key={cap.id}
                className="rounded-[8px] border border-dim/80 bg-cream p-5 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-card-strong)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg text-ink">{cap.title}</h3>
                  {canEdit && isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDialog(cap)}
                        className="text-ink/40 transition hover:text-sky"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteCapsule(cap.id)}
                        disabled={deletingId === cap.id}
                        className="text-ink/40 transition hover:text-rose disabled:opacity-50"
                      >
                        {deletingId === cap.id ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-ink/50 mb-3">开启日期：{cap.openDate}</p>

                {isLocked ? (
                  <div className="rounded-[7px] border border-mist/80 bg-mist/28 p-3 text-center">
                    <p className="text-2xl font-bold text-sky">{days}</p>
                    <p className="text-xs text-ink/60">天后开启</p>
                  </div>
                ) : !cap.isOpened ? (
                  <div className="rounded-[7px] border border-sakura/70 bg-sakura/18 p-3 text-center">
                    <p className="text-sm font-semibold text-bloom">
                      {isTogetherWaiting ? "已准备好，等 TA 一起打开" : cap.openMode === "together" ? "到期了，一起打开" : "到期了，可以打开"}
                    </p>
                    <Button
                      className="mt-3 w-full"
                      onClick={() => openCapsule(cap.id)}
                      disabled={!isAdmin || openingId === cap.id}
                    >
                      {openingId === cap.id ? <Spinner size="sm" /> : cap.openMode === "together" ? isReady ? "再等等 TA" : "我准备好了" : "打开胶囊"}
                    </Button>
                  </div>
                ) : (
                  <div className="time-capsule-reveal">
                    {photos.length > 0 && (
                      <div className="mb-2 grid grid-cols-3 gap-2">
                        {photos.map((photo, index) => (
                          <div key={`${cap.id}-photo-${index}`} className="time-capsule-photo relative aspect-square overflow-hidden rounded-[6px] bg-mist/36">
                            <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`${cap.title} 照片 ${index + 1}`} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="time-capsule-content rounded-[7px] border border-bloom/30 bg-sakura/18 p-3 text-sm mb-2">
                      <p className="whitespace-pre-wrap text-ink/80">{cap.content}</p>
                      <div className="time-capsule-voice mt-2">
                        <VoicePlayer src={cap.voiceUrl} label="胶囊语音" />
                      </div>
                    </div>
                    <p className="text-xs text-leaf text-center">✓ 已打开</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </MemoryPageShell>
  );
}
