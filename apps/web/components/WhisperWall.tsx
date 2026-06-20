"use client";

import { useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { apiJson } from "@/lib/apiClient";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

type WhisperReply = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
};

type Whisper = {
  id: string;
  title: string;
  createdById: string;
  messages: WhisperReply[];
  updatedAt: string;
};

export function WhisperWall() {
  const [open, setOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState("");
  const [form, setForm] = useState({ title: "", content: "" });
  const [replyContent, setReplyContent] = useState("");
  const isAdmin = useContentEditAccess();
  const { data, mutate } = useApi<{ whispers: Whisper[] }>("/api/v1/whispers");
  const whispers = data?.whispers ?? [];

  const create = async () => {
    if (!form.title.trim()) return;
    await apiJson("/api/v1/whispers", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ title: "", content: "" });
    setOpen(false);
    void mutate();
  };

  const reply = async (whisperId: string) => {
    if (!replyContent.trim()) return;
    await apiJson(`/api/v1/whispers/${whisperId}/reply`, {
      method: "POST",
      body: JSON.stringify({ content: replyContent }),
    });
    setReplyContent("");
    setReplyOpen("");
    void mutate();
  };

  return (
    <MemoryPageShell active="whispers">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#273846]">💌 悄悄话</h1>
      </header>

      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-50 lg:bottom-6"
        onClick={() => setOpen(true)}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4 animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">新建悄悄话</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Textarea placeholder="第一条留言（可选）" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <Button className="w-full" onClick={create}>创建</Button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {whispers.length === 0 ? (
          <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="还没有悄悄话">
            创建第一条悄悄话，开始两人的私密对话。
          </EmptyState>
        ) : (
          whispers.map((w) => (
            <div
              key={w.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1"
            >
              <h3 className="font-semibold text-lg mb-3">{w.title}</h3>
              <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                {w.messages.map((msg) => (
                  <div key={msg.id} className="rounded bg-gray-50 p-2 text-sm">
                    <p>{msg.content}</p>
                    <span className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
              {replyOpen === w.id ? (
                <div className="flex gap-2">
                  <Input placeholder="回复..." value={replyContent} onChange={(e) => setReplyContent(e.target.value)} />
                  <Button onClick={() => reply(w.id)}>发送</Button>
                  <Button variant="ghost" onClick={() => setReplyOpen("")}>取消</Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setReplyOpen(w.id)} disabled={!isAdmin}>回复</Button>
              )}
            </div>
          ))
        )}
      </section>
    </MemoryPageShell>
  );
}
