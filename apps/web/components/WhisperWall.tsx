"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { VoicePlayer } from "@/components/ui/VoicePlayer";
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";
import { apiJson } from "@/lib/apiClient";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { sendRealtimeEvent, useRealtimeEvents } from "@/lib/useWebSocket";

type WhisperReply = {
  id: string;
  userId: string;
  content: string;
  voiceUrl?: string;
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
  const [form, setForm] = useState({ title: "", content: "", voiceUrl: "" });
  const [replyContent, setReplyContent] = useState("");
  const [replyVoiceUrl, setReplyVoiceUrl] = useState("");
  const [typingWhispers, setTypingWhispers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [replyingId, setReplyingId] = useState("");
  const typingTimersRef = useRef<Record<string, number>>({});
  const lastTypingSentRef = useRef<Record<string, number>>({});
  const { toast } = useToast();
  const isAdmin = useContentEditAccess();
  const { data, mutate } = useApi<{ whispers: Whisper[] }>("/api/v1/whispers");
  const whispers = data?.whispers ?? [];

  useRealtimeEvents((event) => {
    if (event.type !== "whisper.typing" || !event.targetId) return;
    const whisperId = event.targetId;
    const typing = event.metadata?.typing !== false;
    window.clearTimeout(typingTimersRef.current[whisperId]);
    if (!typing) {
      setTypingWhispers((current) => ({ ...current, [whisperId]: false }));
      return;
    }
    setTypingWhispers((current) => ({ ...current, [whisperId]: true }));
    typingTimersRef.current[whisperId] = window.setTimeout(() => {
      setTypingWhispers((current) => ({ ...current, [whisperId]: false }));
    }, 2600);
  });

  useEffect(() => {
    const timers = typingTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const sendTyping = (whisperId: string, typing: boolean) => {
    if (!isAdmin) return;
    sendRealtimeEvent({
      type: "whisper.typing",
      targetId: whisperId,
      metadata: { typing },
    });
  };

  const emitTyping = (whisperId: string, value: string, timestamp: number) => {
    if (!value.trim()) {
      sendTyping(whisperId, false);
      return;
    }
    if (timestamp - (lastTypingSentRef.current[whisperId] ?? 0) < 1200) return;
    lastTypingSentRef.current[whisperId] = timestamp;
    sendTyping(whisperId, true);
  };

  const closeDialog = () => {
    setOpen(false);
    setForm({ title: "", content: "", voiceUrl: "" });
  };

  const create = async () => {
    if (!form.title.trim()) {
      toast("请填写标题", "warning");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await apiJson("/api/v1/whispers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ title: "", content: "", voiceUrl: "" });
      setOpen(false);
      void mutate();
    } catch {
      toast("创建失败，请稍后再试", "error");
    } finally {
      setSaving(false);
    }
  };

  const reply = async (whisperId: string) => {
    if (!replyContent.trim() && !replyVoiceUrl) {
      toast("回复内容或语音不能为空", "warning");
      return;
    }
    if (replyingId) return;
    setReplyingId(whisperId);
    try {
      await apiJson(`/api/v1/whispers/${whisperId}/reply`, {
        method: "POST",
        body: JSON.stringify({ content: replyContent, voiceUrl: replyVoiceUrl }),
      });
      setReplyContent("");
      setReplyVoiceUrl("");
      sendTyping(whisperId, false);
      setReplyOpen("");
      void mutate();
    } catch {
      toast("回复失败，请稍后再试", "error");
    } finally {
      setReplyingId("");
    }
  };

  const cancelReply = () => {
    if (replyOpen) sendTyping(replyOpen, false);
    setReplyOpen("");
    setReplyContent("");
    setReplyVoiceUrl("");
  };

  return (
    <MemoryPageShell active="whispers">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate">💌 悄悄话</h1>
      </header>

      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-bloom text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-50 lg:bottom-6"
        onClick={() => setOpen(true)}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      <Modal
        open={open}
        onClose={() => { if (!saving) closeDialog(); }}
        title="新建悄悄话"
        closeOnOverlay={!saving}
      >
        <div className="space-y-3">
          <Input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={saving} />
          <Textarea placeholder="第一条留言（可选）" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} disabled={saving} />
          <VoiceRecorder
            folder="whispers"
            value={form.voiceUrl}
            disabled={saving}
            onChange={(voiceUrl) => setForm((current) => ({ ...current, voiceUrl }))}
            onError={(message) => toast(message, "error")}
          />
          <Button className="w-full" onClick={create} disabled={!isAdmin || saving}>
            {saving ? <Spinner size="sm" /> : "创建"}
          </Button>
        </div>
      </Modal>

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
                    {msg.content && <p>{msg.content}</p>}
                    <div className={msg.content ? "mt-2" : ""}>
                    <VoicePlayer src={msg.voiceUrl} label="悄悄话语音" compact />
                    </div>
                    <span className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
                {typingWhispers[w.id] && (
                  <div className="flex items-center gap-2 rounded bg-mist/36 px-2 py-1.5 text-xs font-semibold text-sky">
                    <span>TA 正在写</span>
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky [animation-delay:240ms]" />
                    </span>
                  </div>
                )}
              </div>
              {replyOpen === w.id ? (
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      placeholder="回复..."
                      value={replyContent}
                      onChange={(e) => {
                        setReplyContent(e.target.value);
                        emitTyping(w.id, e.target.value, e.timeStamp);
                      }}
                      disabled={!!replyingId}
                    />
                    <VoiceRecorder
                      folder="whispers"
                      value={replyVoiceUrl}
                      disabled={!!replyingId}
                      onChange={setReplyVoiceUrl}
                      onError={(message) => toast(message, "error")}
                    />
                  </div>
                  <Button onClick={() => reply(w.id)} disabled={!!replyingId}>
                    {replyingId === w.id ? <Spinner size="sm" /> : "发送"}
                  </Button>
                  <Button variant="ghost" onClick={cancelReply} disabled={!!replyingId}>取消</Button>
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
