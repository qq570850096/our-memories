"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { ImagePlus, Lock, LockOpen, Plus, X } from "lucide-react";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { apiJson } from "@/lib/apiClient";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { deleteUploaded, uploadImages } from "@/lib/upload";

type CapsulePhoto = {
  id?: string;
  url?: string;
};

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  isOpened: boolean;
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

export function TimeCapsuleGrid() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = useContentEditAccess();
  const { data, mutate } = useApi<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules");
  const capsules = data?.timeCapsules ?? [];

  const closeDialog = () => {
    setOpen(false);
    setForm(emptyForm);
    setPhotoKeys([]);
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
      if (previousKeys.length > 0) void deleteUploaded(previousKeys);
      setStatus("");
    } catch {
      setStatus("照片上传失败，请重新选择。");
    } finally {
      setWorking(false);
      event.target.value = "";
    }
  };

  const create = async () => {
    if (working) return;
    if (!form.title.trim() || !form.openDate || !form.content.trim()) {
      setStatus("请填写所有必填项。");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      await apiJson("/api/v1/time-capsules", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          openDate: form.openDate,
          content: form.content.trim(),
          photos: photoPayload(form.photos),
        }),
      });
      closeDialog();
      void mutate();
    } catch {
      await deleteUploaded(photoKeys);
      setStatus("保存失败，请稍后再试。");
    } finally {
      setWorking(false);
    }
  };

  const openCapsule = async (id: string) => {
    await apiJson(`/api/v1/time-capsules/${id}/open`, { method: "POST" });
    void mutate();
  };

  return (
    <div className="space-y-6">
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-lg transition hover:scale-105 disabled:opacity-50 lg:bottom-6"
        onClick={() => setOpen(true)}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4" onClick={closeDialog}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">埋下时光胶囊</h2>
              <button onClick={closeDialog}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input
                className="min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/76 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white disabled:opacity-50"
                type="date"
                value={form.openDate}
                onChange={(event) => setForm({ ...form, openDate: event.target.value })}
              />
              <Textarea placeholder="写给未来的话..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
              <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={pickPhotos} disabled={!isAdmin || working} />
              <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={!isAdmin || working}>
                <ImagePlus className="h-4 w-4" />
                {form.photos.length ? `已选择 ${form.photos.length} 张照片` : "选择照片"}
              </Button>
              {form.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.photos.map((photo, index) => (
                    <div key={`${photo}-${index}`} className="relative aspect-square overflow-hidden rounded bg-[#D6E8F0]">
                      <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`时光胶囊照片 ${index + 1}`} />
                    </div>
                  ))}
                </div>
              )}
              {status && <p className="rounded border border-[#D8DDD8]/70 bg-white/70 px-3 py-2 text-xs text-[#5A6670]/66">{status}</p>}
              <Button className="w-full" onClick={create} disabled={!isAdmin || working}>{working ? "处理中" : "埋下"}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capsules.map((cap) => {
          const days = daysUntil(cap.openDate);
          const canOpen = days <= 0;
          const photos = (cap.photos ?? []).flatMap((photo) => (photo.url ? [photo.url] : []));
          return (
            <div key={cap.id} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
              <div className="absolute top-3 right-3">
                {canOpen ? <LockOpen className="h-5 w-5 text-green-500" /> : <Lock className="h-5 w-5 text-gray-400" />}
              </div>
              <h3 className="font-semibold text-lg mb-2">{cap.title}</h3>
              <p className="text-sm text-gray-500 mb-3">开启日期：{cap.openDate}</p>
              {canOpen ? (
                cap.content ? (
                  <>
                    {photos.length > 0 && (
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {photos.map((photo, index) => (
                          <div key={`${cap.id}-photo-${index}`} className="relative aspect-square overflow-hidden rounded bg-[#D6E8F0]">
                            <LocalPrivacyImg className="h-full w-full object-cover" src={photo} alt={`${cap.title} 照片 ${index + 1}`} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="rounded bg-yellow-50 p-3 text-sm mb-3">
                      <p className="whitespace-pre-wrap">{cap.content}</p>
                    </div>
                  </>
                ) : (
                  <Button onClick={() => openCapsule(cap.id)}>打开胶囊</Button>
                )
              ) : (
                <div className="rounded bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{days}</p>
                  <p className="text-xs text-gray-500">天后开启</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
