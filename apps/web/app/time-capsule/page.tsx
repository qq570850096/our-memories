"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Plus, X, Archive, Trash2, Edit, ImagePlus } from "lucide-react";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { apiJson } from "@/lib/apiClient";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { readSession } from "@/lib/authStore";
import { useApi } from "@/lib/swr";
import { deleteUploaded, uploadImages } from "@/lib/upload";

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
  isOpened: boolean;
  createdById: string;
  createdAt: string;
  photos?: CapsulePhoto[];
};

const emptyForm = { title: "", openDate: "", content: "", photos: [] as string[] };
const photoPayload = (photos: string[]) => photos.filter(Boolean).map((url) => ({ url, key: "", mimeType: "image/jpeg" }));

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// 获取今天日期字符串（用于min限制）
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

export default function TimeCapsule() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = useContentEditAccess();
  const session = readSession();
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
      setForm({ title: capsule.title, openDate: capsule.openDate, content: capsule.content, photos });
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
      setStatus("照片上传失败，请重新选择。");
    } finally {
      setWorking(false);
      event.target.value = "";
    }
  };

  const save = async () => {
    if (working) return;
    if (!form.title.trim() || !form.openDate || !form.content.trim()) {
      setStatus("请填写所有必填项。");
      return;
    }

    // 验证日期必须是今天之后
    const selectedDate = new Date(form.openDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate <= today) {
      setStatus("开启日期必须是今天之后。");
      return;
    }

    const payload: {
      title: string;
      openDate: string;
      content: string;
      photos?: ReturnType<typeof photoPayload>;
    } = {
      title: form.title.trim(),
      openDate: form.openDate,
      content: form.content.trim(),
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
      closeDialog();
      void mutate();
    } catch {
      await deleteUploaded(photoKeys);
      setStatus("保存失败，请稍后再试。");
    } finally {
      setWorking(false);
    }
  };

  const deleteCapsule = async (id: string) => {
    if (!confirm("确定删除这个时光胶囊吗？")) return;
    await apiJson(`/api/v1/time-capsules/${id}`, { method: "DELETE" });
    void mutate();
  };

  return (
    <MemoryPageShell active="capsule">
      <header>
        <h1 className="text-2xl font-bold text-[#273846]">📦 时光宝盒</h1>
        <p className="text-sm text-gray-500 mt-1">查看时光胶囊</p>
      </header>

      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-50 lg:bottom-6"
        onClick={() => openDialog()}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4 animate-in fade-in duration-200"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingId ? "编辑时光胶囊" : "埋下时光胶囊"}</h2>
              <button onClick={closeDialog}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="标题 *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-[#E8B8C2]"
              />
              <input
                type="date"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]"
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
                className="transition-all duration-200 focus:ring-2 focus:ring-[#E8B8C2]"
              />
              <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={pickPhotos} disabled={!isAdmin || working} />
              <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={!isAdmin || working}>
                <ImagePlus className="h-4 w-4" />
                {form.photos.length ? `已选择 ${form.photos.length} 张照片` : "选择照片"}
              </Button>
              {form.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.photos.map((photo, index) => (
                    <div key={`${photo}-${index}`} className="relative aspect-square overflow-hidden rounded-[6px] border border-[#D8DDD8] bg-[#D6E8F0]">
                      <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`时光胶囊照片 ${index + 1}`} />
                    </div>
                  ))}
                </div>
              )}
              {status && <p className="rounded-[7px] border border-[#D8DDD8]/70 bg-white/42 px-3 py-2 text-xs leading-5 text-[#5A6670]/66">{status}</p>}
              <Button className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]" onClick={save} disabled={!isAdmin || working}>
                {working ? "处理中" : editingId ? "保存" : "埋下胶囊"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          // 骨架屏
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </>
        ) : capsules.length === 0 ? (
          <EmptyState icon={<Archive className="h-7 w-7" />} title="还没有时光胶囊">
            创建第一个时光胶囊吧。
          </EmptyState>
        ) : (
          capsules.map((cap) => {
            const days = daysUntil(cap.openDate);
            const isLocked = days > 0;
            const canEdit = cap.createdById === session?.user?.id && isLocked; // 只有未开启时创建人可编辑
            const photos = (cap.photos ?? []).flatMap((photo) => (photo.url ? [photo.url] : []));

            return (
              <div
                key={cap.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{cap.title}</h3>
                  {canEdit && isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDialog(cap)}
                        className="text-gray-400 transition-all duration-200 hover:text-blue-500 hover:scale-110 active:scale-95"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteCapsule(cap.id)}
                        className="text-gray-400 transition-all duration-200 hover:text-red-500 hover:scale-110 active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">开启日期：{cap.openDate}</p>

                {isLocked ? (
                  <div className="rounded bg-blue-50 p-3 text-center border border-blue-200">
                    <p className="text-2xl font-bold text-blue-600">{days}</p>
                    <p className="text-xs text-gray-500">天后开启</p>
                  </div>
                ) : (
                  <div>
                    {photos.length > 0 && (
                      <div className="mb-2 grid grid-cols-3 gap-2">
                        {photos.map((photo, index) => (
                          <div key={`${cap.id}-photo-${index}`} className="relative aspect-square overflow-hidden rounded bg-[#D6E8F0]">
                            <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`${cap.title} 照片 ${index + 1}`} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="rounded bg-yellow-50 p-3 text-sm mb-2">
                      <p className="whitespace-pre-wrap">{cap.content}</p>
                    </div>
                    <p className="text-xs text-green-600 text-center">✓ 已打开</p>
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
