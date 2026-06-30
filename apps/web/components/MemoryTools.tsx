"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bold,
  CalendarDays,
  Clock,
  FileText,
  Heart,
  History,
  List,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Quote,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cities } from "@/data/cities";
import { provinces } from "@/data/provinces";
import type { Memory } from "@/data/memories";
import { MemoryPageShell, type MemoryNavKey } from "@/components/MemoryNav";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/apiClient";
import { readSession } from "@/lib/authStore";
import { listMemories } from "@/lib/memoryApi";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useTransientStatus } from "@/lib/useTransientStatus";

type StoredItem = {
  id: string;
  title: string;
  date?: string;
  note: string;
  cityId?: string;
};
type AuxiliaryPayload = {
  items?: StoredItem[];
};

type DiaryHistoryEntry = {
  id: string;
  text: string;
  editedAt: string;
  editorName: string;
};

type DiaryPayload = {
  body: string;
  linkedMemoryId?: string;
  linkedMemoryTitle?: string;
  linkedMemoryDate?: string;
  history: DiaryHistoryEntry[];
};

type DiaryDraft = {
  title: string;
  date: string;
  body: string;
  cityId: string;
  linkedMemoryId: string;
};

type ToolConfig = {
  active: MemoryNavKey;
  icon: typeof Heart;
  title: string;
  subtitle: string;
  storageKey: string;
  kind: "diary" | "anniversary";
};

const configs = {
  diary: {
    active: "favorites",
    icon: NotebookPen,
    title: "双人日记",
    subtitle: "把还没归档成正式回忆的小片段，先一起补完整。",
    storageKey: "mapofus:couple-diary",
    kind: "diary",
  },
  anniversary: {
    active: "anniversaries",
    icon: CalendarDays,
    title: "纪念日",
    subtitle: "把重要的日子放在这里，慢慢倒数。",
    storageKey: "mapofus:anniversaries",
    kind: "anniversary",
  },
} satisfies Record<string, ToolConfig>;

const readItems = (key: string): StoredItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;

    return normalizeItems(parsed);
  } catch {
    return [];
  }
};

const todayLabel = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
};

const writeItems = (key: string, items: StoredItem[]) => {
  window.localStorage.setItem(key, JSON.stringify(items));
};

const normalizeItems = (value: unknown): StoredItem[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Partial<StoredItem>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return [];

    return [{
      id: candidate.id,
      title: candidate.title,
      date: typeof candidate.date === "string" ? candidate.date : undefined,
      note: typeof candidate.note === "string" ? candidate.note : "",
      cityId: typeof candidate.cityId === "string" ? candidate.cityId : undefined,
    }];
  });
};

const emptyDiaryPayload = (): DiaryPayload => ({
  body: "",
  history: [],
});

const parseDiaryPayload = (note: string): DiaryPayload => {
  if (!note.trim()) return emptyDiaryPayload();
  try {
    const parsed = JSON.parse(note) as Partial<DiaryPayload>;
    return {
      body: typeof parsed.body === "string" ? parsed.body : note,
      linkedMemoryId: typeof parsed.linkedMemoryId === "string" ? parsed.linkedMemoryId : undefined,
      linkedMemoryTitle: typeof parsed.linkedMemoryTitle === "string" ? parsed.linkedMemoryTitle : undefined,
      linkedMemoryDate: typeof parsed.linkedMemoryDate === "string" ? parsed.linkedMemoryDate : undefined,
      history: Array.isArray(parsed.history)
        ? parsed.history.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const candidate = entry as Partial<DiaryHistoryEntry>;
            if (typeof candidate.id !== "string" || typeof candidate.text !== "string") return [];
            return [{
              id: candidate.id,
              text: candidate.text,
              editedAt: typeof candidate.editedAt === "string" ? candidate.editedAt : "",
              editorName: typeof candidate.editorName === "string" ? candidate.editorName : "某个人",
            }];
          })
        : [],
    };
  } catch {
    return { body: note, history: [] };
  }
};

const stringifyDiaryPayload = (payload: DiaryPayload) => JSON.stringify(payload);

const applyDiaryFormat = (body: string, format: "bold" | "list" | "quote" | "divider") => {
  if (format === "divider") return body ? `${body}\n\n---\n` : "---\n";
  if (format === "list") return body ? `${body}\n- ` : "- ";
  if (format === "quote") return body ? `${body}\n> ` : "> ";
  return body ? `${body}**重点**` : "**重点**";
};

function DiaryBody({ body, compact = false }: Readonly<{ body: string; compact?: boolean }>) {
  const lines = body.split("\n");
  return (
    <div className={`space-y-1.5 whitespace-normal ${compact ? "line-clamp-4 text-sm leading-6" : "text-sm leading-7"}`}>
      {lines.map((line, index) => {
        const key = `${index}-${line}`;
        if (line.trim() === "---") return <hr key={key} className="my-2 border-dim/70" />;
        if (line.startsWith("> ")) {
          return (
            <p key={key} className="border-l-2 border-sakura pl-3 text-ink/58">
              {renderInlineDiaryText(line.slice(2))}
            </p>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={key} className="pl-4 text-ink/70 before:-ml-4 before:mr-2 before:content-['•']">
              {renderInlineDiaryText(line.slice(2))}
            </p>
          );
        }
        return <p key={key}>{renderInlineDiaryText(line || " ")}</p>;
      })}
    </div>
  );
}

function renderInlineDiaryText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

const auxiliaryEndpoint = (kind: ToolConfig["kind"]) =>
  `/api/v1/auxiliary-items?kind=${encodeURIComponent(kind)}`;

const auxiliaryMigrationKey = (kind: ToolConfig["kind"]) => `mapofus:${kind}:migrated-to-server-v1`;

const auxiliaryFingerprint = (item: StoredItem) =>
  `${item.title}|${item.date ?? ""}|${item.note}|${item.cityId ?? ""}`;

// 一次性把本地遗留条目迁移到服务端，返回是否真的发生了迁移（用于触发重新拉取）。
const migrateLocalAuxiliaryItems = async (config: ToolConfig, serverItems: StoredItem[]) => {
  const localItems = readItems(config.storageKey);
  const migrationKey = auxiliaryMigrationKey(config.kind);
  if (localItems.length === 0 || window.localStorage.getItem(migrationKey) === "1") return false;

  const existing = new Set(serverItems.map(auxiliaryFingerprint));
  const localOnly = localItems.filter((item) => !existing.has(auxiliaryFingerprint(item)));
  window.localStorage.setItem(migrationKey, "1");
  if (localOnly.length === 0) return false;

  await Promise.all(
    localOnly.map((item) =>
      apiFetch("/auxiliary-items", {
        method: "POST",
        body: JSON.stringify({ ...item, kind: config.kind }),
      }).catch(() => null),
    ),
  );
  return true;
};

const daysUntil = (value?: string) => {
  if (!value || !/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split(".").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

function MemoryToolPage({ config }: Readonly<{ config: ToolConfig }>) {
  const Icon = config.icon;
  const canEdit = useContentEditAccess();
  const { toast } = useToast();
  const { data: auxiliaryData, mutate } = useApi<AuxiliaryPayload>(auxiliaryEndpoint(config.kind));
  const [items, setItems] = useState<StoredItem[]>(() => readItems(config.storageKey));
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useTransientStatus();
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!auxiliaryData) return;
    let cancelled = false;

    const serverItems = normalizeItems(auxiliaryData.items ?? []);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setItems(serverItems);
      writeItems(config.storageKey, serverItems);

      void migrateLocalAuxiliaryItems(config, serverItems).then((migrated) => {
        if (migrated && !cancelled) void mutate();
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [auxiliaryData, config, mutate]);

  const cityOptions = useMemo(() => cities.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), []);
  const canSave = title.trim().length > 0;
  const isDiary = config.kind === "diary";
  const latestItem = items[0];
  const datedCount = items.filter((item) => item.date).length;
  const cityCount = new Set(items.flatMap((item) => (item.cityId ? [item.cityId] : []))).size;

  const resetForm = () => {
    setTitle(isDiary ? "今天的小记" : "");
    setDate(isDiary ? todayLabel() : "");
    setNote("");
    setEditingId("");
    setOpen(false);
  };

  const save = async () => {
    if (!canEdit) {
      setStatus("请先登录后再保存。", { autoClear: true });
      return;
    }
    if (!canSave) return;

    setIsWorking(true);
    setStatus("");

    try {
      if (editingId) {
        // 更新现有项
        const item = {
          id: editingId,
          title: title.trim(),
          date: date.trim(),
          note: note.trim(),
          cityId: isDiary ? cityId : undefined,
        };

        const response = await apiFetch(`/api/v1/auxiliary-items/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...item, kind: config.kind }),
        });
        if (!response.ok) throw new Error("Update failed");

        const nextItems = items.map((current) => (current.id === editingId ? item : current));
        setItems(nextItems);
        writeItems(config.storageKey, nextItems);
        resetForm();
        setStatus("已保存修改。", { autoClear: true });
      toast("已保存修改", "success");
      } else {
        // 创建新项
        const item = {
          id: `${config.kind}-${Date.now()}`,
          title: title.trim(),
          date: date.trim(),
          note: note.trim(),
          cityId: isDiary ? cityId : undefined,
        };

        const response = await apiFetch("/api/v1/auxiliary-items", {
          method: "POST",
          body: JSON.stringify({ ...item, kind: config.kind }),
        });
        if (!response.ok) throw new Error("Create failed");

        const nextItems = [item, ...items];
        setItems(nextItems);
        writeItems(config.storageKey, nextItems);
        resetForm();
        setStatus("已保存。", { autoClear: true });
      }

      // 刷新缓存
      void mutate();
    } catch {
      setStatus("保存失败，请确认网络和登录状态后重试。", { autoClear: true });
    } finally {
      setIsWorking(false);
    }
  };

  const startEdit = (item: StoredItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setTitle(item.title);
    setDate(item.date ?? "");
    setNote(item.note);
    if (item.cityId) setCityId(item.cityId);
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!canEdit) {
      setStatus("请先登录后再删除。", { autoClear: true });
      return;
    }
    setIsWorking(true);
    setStatus("");

    try {
      const response = await apiFetch(`/api/v1/auxiliary-items/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");

      const nextItems = items.filter((item) => item.id !== id);
      setItems(nextItems);
      writeItems(config.storageKey, nextItems);
      if (editingId === id) resetForm();
      setStatus("已删除。", { autoClear: true });
      void mutate();
    } catch {
      setStatus("删除失败，请稍后再试。", { autoClear: true });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <MemoryPageShell active={config.active}>
      <header className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="rounded-[8px] border border-dim/72 bg-cream/72 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.055)] backdrop-blur sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-sakura bg-sakura/48 text-bloom">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[34px]">{config.title}</h1>
              <p className="mt-2 text-sm font-medium leading-6 text-ink/62">{config.subtitle}</p>
            </div>
          </div>
          {isDiary && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[8px] border border-dim/62 bg-white/42 px-2 py-2">
                <p className="text-lg font-semibold leading-none text-bloom">{items.length}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink/48">小记</p>
              </div>
              <div className="rounded-[8px] border border-dim/62 bg-white/42 px-2 py-2">
                <p className="text-lg font-semibold leading-none text-sky">{cityCount}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink/48">城市</p>
              </div>
              <div className="rounded-[8px] border border-dim/62 bg-white/42 px-2 py-2">
                <p className="text-lg font-semibold leading-none text-ink">{datedCount}</p>
                <p className="mt-1 text-[11px] font-semibold text-ink/48">日期</p>
              </div>
            </div>
          )}
        </div>

        {isDiary && (
          <aside className="rounded-[8px] border border-dim/72 bg-cream/72 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.055)] backdrop-blur">
            <p className="text-xs font-semibold text-ink/50">共同完善</p>
            <p className="mt-2 text-sm leading-6 text-ink/68">
              像 Between 一样保持私密，像 Day One 一样快速记录。每条先写一个片段，之后两个人再补地点、日期和细节。
            </p>
            {latestItem && (
              <div className="mt-3 rounded-[8px] border border-sakura/60 bg-sakura/22 px-3 py-2">
                <p className="truncate text-xs font-semibold text-rose-ink">最近：{latestItem.title}</p>
              </div>
            )}
          </aside>
        )}
      </header>

      <section className="mt-6 sm:mt-10">
        <div className={isDiary ? "space-y-3" : "grid gap-4 md:grid-cols-2"}>
          {items.map((item) => {
            const city = cities.find((candidate) => candidate.id === item.cityId);
            const leftDays = daysUntil(item.date);

            return (
              <article
                key={item.id}
                className="rounded-[8px] border border-dim/78 bg-cream/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{item.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/52">
                      {city && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-mist bg-mist/34 px-2 py-1 text-sky">
                          <MapPin className="h-3 w-3" />
                          {city.name}
                        </span>
                      )}
                      {item.date && (
                        <span className="rounded-full border border-dim/70 bg-white/42 px-2 py-1">
                          {item.date}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-ink/42 transition hover:bg-mist/34 hover:text-sky"
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label="编辑"
                      disabled={!canEdit || isWorking}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-ink/42 transition hover:bg-sakura/45 hover:text-bloom"
                      type="button"
                      onClick={() => void remove(item.id)}
                      aria-label="删除"
                      disabled={!canEdit || isWorking}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {leftDays !== null && (
                  <p className={`mt-3 text-sm font-semibold text-bloom ${isDiary ? "hidden" : ""}`}>
                    {leftDays >= 0 ? `还有 ${leftDays} 天` : `已经过去 ${Math.abs(leftDays)} 天`}
                  </p>
                )}
                {item.note && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/68">{item.note}</p>
                )}
              </article>
            );
          })}
          {items.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-dim bg-cream/48 px-6 py-12 text-center text-sm text-ink/54 md:col-span-2">
              {isDiary ? "还没有双人日记。先写下今天最想留住的一句话。" : "这里还空着，先放下第一条吧。"}
            </div>
          )}
        </div>
      </section>

      {/* 浮动添加按钮 */}
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-bloom text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-rose active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={() => {
          resetForm();
          if (isDiary) {
            setTitle("今天的小记");
            setDate(todayLabel());
          }
          setOpen(true);
        }}
        disabled={!canEdit}
        aria-label={`新增${config.title}`}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* 弹窗表单 */}
      <Modal
        open={open}
        onClose={() => { if (!isWorking) resetForm(); }}
        title={editingId ? "编辑" : "新增"}
        size="md"
        closeOnOverlay={!isWorking}
      >
        <div className="space-y-4">
              <label className="block text-xs font-semibold text-ink/58">
                {isDiary ? "标题" : "标题"}
                <input
                  className="mt-1 w-full rounded-[7px] border border-dim bg-white px-3 py-2 text-sm outline-none transition focus:border-bloom"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={isDiary ? "例如：今天想记住的瞬间" : "标题"}
                  disabled={isWorking}
                />
              </label>

              {isDiary && (
                <label className="block text-xs font-semibold text-ink/58">
                  关联城市
                  <select
                    className="mt-1 w-full rounded-[7px] border border-dim bg-white px-3 py-2 text-sm outline-none transition focus:border-bloom"
                    value={cityId}
                    onChange={(event) => setCityId(event.target.value)}
                    disabled={isWorking}
                  >
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block text-xs font-semibold text-ink/58">
                日期
                <DatePicker
                  className="mt-1 border-dim bg-white focus:border-bloom"
                  value={date}
                  onChange={setDate}
                  disabled={isWorking}
                />
              </label>

              {!isDiary && (
                <label className="block text-xs font-semibold text-ink/58">
                  倒数说明
                  <input
                    className="mt-1 w-full rounded-[7px] border border-dim bg-white px-3 py-2 text-sm outline-none transition focus:border-bloom"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="写一点备注……"
                    disabled={isWorking}
                  />
                </label>
              )}

              {isDiary && (
                <label className="block text-xs font-semibold text-ink/58">
                  两个人一起补充
                  <textarea
                    className="mt-1 w-full resize-none rounded-[7px] border border-dim bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-bloom"
                    rows={6}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={"我：今天最想记住的是……\n她：我想补充……"}
                    disabled={isWorking}
                  />
                </label>
              )}

              <button
                className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-bloom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose disabled:opacity-50"
                type="button"
                onClick={() => void save()}
                disabled={!canSave || isWorking}
              >
                {isWorking ? "保存中" : editingId ? "保存修改" : "保存"}
              </button>
            </div>
      </Modal>

      {status && (
        <p className="mt-5 rounded-[8px] border border-dim/78 bg-cream/72 px-4 py-3 text-sm text-ink/66">
          {status}
        </p>
      )}
    </MemoryPageShell>
  );
}

function CoupleDiaryPage() {
  const canEdit = useContentEditAccess();
  const { toast } = useToast();
  const { data: auxiliaryData, mutate } = useApi<AuxiliaryPayload>(auxiliaryEndpoint("diary"));
  const [items, setItems] = useState<StoredItem[]>(() => readItems(configs.diary.storageKey));
  const [memories, setMemories] = useState<Memory[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState<DiaryDraft>(() => ({
    title: "",
    date: todayLabel(),
    body: "",
    cityId: cities[0]?.id ?? "",
    linkedMemoryId: "",
  }));
  const [selectedProvince, setSelectedProvince] = useState(cities[0]?.provinceId ?? provinces[0]?.id ?? "");
  const [status, setStatus] = useTransientStatus();
  const [isSaving, setIsSaving] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!auxiliaryData) return;
    const serverItems = normalizeItems(auxiliaryData.items ?? []);
    setItems(serverItems);
    writeItems(configs.diary.storageKey, serverItems);
  }, [auxiliaryData]);

  useEffect(() => {
    let cancelled = false;
    void listMemories({ limit: 40 })
      .then((page) => {
        if (!cancelled) setMemories(page.items);
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provinceOptions = provinces;
  const cityOptions = useMemo(() => cities.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), []);
  const citiesInProvince = useMemo(
    () => cityOptions.filter((city) => city.provinceId === selectedProvince),
    [cityOptions, selectedProvince],
  );
  const parsedItems = useMemo(
    () => items.map((item) => ({ item, payload: parseDiaryPayload(item.note) })),
    [items],
  );
  const selectedMemory = memories.find((memory) => memory.id === draft.linkedMemoryId);
  const editingItem = items.find((item) => item.id === editingId);
  const editingPayload = editingItem ? parseDiaryPayload(editingItem.note) : emptyDiaryPayload();
  const canSave = canEdit && draft.title.trim().length > 0 && draft.body.trim().length > 0 && !isSaving;

  const resetDraft = () => {
    const firstCity = citiesInProvince[0] ?? cityOptions[0];
    setDraft({
      title: "",
      date: todayLabel(),
      body: "",
      cityId: firstCity?.id ?? "",
      linkedMemoryId: "",
    });
    setEditingId("");
    setShowHistory(false);
  };

  const startCreate = () => {
    resetDraft();
    setSetupOpen(true);
  };

  const enterEditorFromSetup = () => {
    const memory = memories.find((item) => item.id === draft.linkedMemoryId);
    if (memory) {
      setDraft((current) => ({
        ...current,
        cityId: memory.cityId,
        date: memory.date || current.date,
        title: current.title.trim() || `${memory.city}的小记`,
      }));
    }
    setSetupOpen(false);
    setEditorOpen(true);
  };

  const startEdit = useCallback((item: StoredItem) => {
    const payload = parseDiaryPayload(item.note);
    const city = item.cityId ? cities.find((candidate) => candidate.id === item.cityId) : undefined;
    if (city) setSelectedProvince(city.provinceId);
    setEditingId(item.id);
    setDraft({
      title: item.title,
      date: item.date || todayLabel(),
      body: payload.body,
      cityId: item.cityId || cityOptions[0]?.id || "",
      linkedMemoryId: payload.linkedMemoryId || "",
    });
    setShowHistory(false);
    setEditorOpen(true);
  }, [cityOptions]);

  useEffect(() => {
    if (items.length === 0 || editorOpen || setupOpen) return;
    const diaryId = new URLSearchParams(window.location.search).get("diary");
    if (!diaryId) return;
    const item = items.find((candidate) => candidate.id === diaryId);
    if (item) startEdit(item);
    window.history.replaceState(null, "", "/favorites");
  }, [editorOpen, items, setupOpen, startEdit]);

  const updateProvince = (provinceId: string) => {
    setSelectedProvince(provinceId);
    const firstCity = cityOptions.find((city) => city.provinceId === provinceId);
    if (firstCity) setDraft((current) => ({ ...current, cityId: firstCity.id }));
  };

  const polishDraft = async () => {
    if (!draft.body.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const city = cities.find((candidate) => candidate.id === draft.cityId);
      const response = await apiFetch("/ai/memory-polish", {
        method: "POST",
        body: JSON.stringify({
          sourceText: draft.body.trim(),
          cityId: city?.id ?? "",
          city: city?.name ?? "",
          date: draft.date,
        }),
      });
      if (!response.ok) throw new Error("Polish failed");
      const data = (await response.json()) as { polishedText?: unknown };
      const polishedText = typeof data.polishedText === "string" ? data.polishedText.trim() : "";
      if (!polishedText) throw new Error("Empty polish result");
      setDraft((current) => ({ ...current, body: polishedText.slice(0, 1200) }));
      toast("已润色文本", "success");
    } catch {
      setStatus("AI 润色失败，请稍后再试。", { autoClear: true });
    } finally {
      setIsPolishing(false);
    }
  };

  const saveDiary = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setStatus("");
    const session = readSession();
    const editorName = session?.user?.displayName || session?.user?.username || "某个人";
    const linkedMemory = memories.find((memory) => memory.id === draft.linkedMemoryId);
    const previousPayload = editingItem ? parseDiaryPayload(editingItem.note) : emptyDiaryPayload();
    const nextHistory =
      editingItem && previousPayload.body.trim() && previousPayload.body !== draft.body
        ? [
            {
              id: `history-${Date.now()}`,
              text: previousPayload.body,
              editedAt: new Date().toISOString(),
              editorName,
            },
            ...previousPayload.history,
          ].slice(0, 12)
        : previousPayload.history;
    const payload: DiaryPayload = {
      body: draft.body.trim(),
      linkedMemoryId: linkedMemory?.id,
      linkedMemoryTitle: linkedMemory?.title || linkedMemory?.text?.slice(0, 24),
      linkedMemoryDate: linkedMemory?.date,
      history: nextHistory,
    };
    const item: StoredItem = {
      id: editingId || `diary-${Date.now()}`,
      title: draft.title.trim(),
      date: draft.date,
      note: stringifyDiaryPayload(payload),
      cityId: linkedMemory?.cityId || draft.cityId,
    };

    try {
      const response = editingId
        ? await apiFetch(`/api/v1/auxiliary-items/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...item, kind: "diary" }),
          })
        : await apiFetch("/api/v1/auxiliary-items", {
            method: "POST",
            body: JSON.stringify({ ...item, kind: "diary" }),
          });
      if (!response.ok) throw new Error("Save failed");

      setItems((current) => {
        const next = editingId
          ? current.map((candidate) => (candidate.id === editingId ? item : candidate))
          : [item, ...current];
        writeItems(configs.diary.storageKey, next);
        return next;
      });
      setEditorOpen(false);
      resetDraft();
      toast(editingId ? "日记已更新" : "日记已保存", "success");
      void mutate();
    } catch {
      setStatus("保存失败，请确认网络和登录状态后重试。", { autoClear: true });
    } finally {
      setIsSaving(false);
    }
  };

  const removeDiary = async (id: string) => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await apiFetch(`/api/v1/auxiliary-items/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setItems((current) => {
        const next = current.filter((item) => item.id !== id);
        writeItems(configs.diary.storageKey, next);
        return next;
      });
      void mutate();
      toast("日记已删除", "success");
    } catch {
      setStatus("删除失败，请稍后再试。", { autoClear: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MemoryPageShell active="favorites">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <NotebookPen className="h-6 w-6 text-bloom" />
            <h1 className="truncate text-2xl font-semibold leading-tight text-ink sm:text-[34px]">双人日记</h1>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-ink/52">
            <span>{items.length} 篇</span>
            <span>{new Set(items.flatMap((item) => (item.cityId ? [item.cityId] : []))).size} 城</span>
            <span>{parsedItems.reduce((total, item) => total + item.payload.history.length, 0)} 次共写</span>
          </div>
        </div>
        <button
          className="hidden min-h-11 shrink-0 items-center gap-2 rounded-[8px] bg-bloom px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(232,184,194,0.34)] transition hover:bg-rose disabled:opacity-50 sm:inline-flex"
          type="button"
          onClick={startCreate}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          新日记
        </button>
      </header>

      <section className="mt-5 space-y-3 sm:mt-6">
        {parsedItems.map(({ item, payload }) => {
          const city = cities.find((candidate) => candidate.id === item.cityId);
          return (
            <article
              key={item.id}
              className="rounded-[8px] border border-dim/78 bg-cream/78 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur transition hover:border-sakura/80 sm:p-5"
            >
              <button
                className="block w-full text-left"
                type="button"
                onClick={() => startEdit(item)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-ink">{item.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/52">
                      {payload.linkedMemoryTitle && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sakura/70 bg-sakura/28 px-2 py-1 text-rose-ink">
                          <FileText className="h-3 w-3" />
                          关联回忆
                        </span>
                      )}
                      {city && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-mist bg-mist/34 px-2 py-1 text-sky">
                          <MapPin className="h-3 w-3" />
                          {city.name}
                        </span>
                      )}
                      {item.date && (
                        <span className="rounded-full border border-dim/70 bg-white/42 px-2 py-1">
                          {item.date}
                        </span>
                      )}
                      {payload.history.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dim/70 bg-white/42 px-2 py-1">
                          <History className="h-3 w-3" />
                          {payload.history.length} 次变动
                        </span>
                      )}
                    </div>
                  </div>
                  <Pencil className="mt-1 h-4 w-4 shrink-0 text-ink/38" />
                </div>
                {payload.body ? (
                  <div className="mt-3 text-ink/68">
                    <DiaryBody body={payload.body} compact />
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-ink/48">还没有正文，点开一起补完。</p>
                )}
              </button>
              <div className="mt-3 flex justify-end">
                <button
                  className="grid h-9 w-9 place-items-center rounded-[6px] text-ink/40 transition hover:bg-sakura/45 hover:text-bloom"
                  type="button"
                  onClick={() => void removeDiary(item.id)}
                  aria-label="删除日记"
                  disabled={!canEdit || isSaving}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
        {items.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-dim bg-cream/48 px-6 py-12 text-center text-sm text-ink/54">
            还没有双人日记。先创建一个标题，再一起慢慢补完。
          </div>
        )}
      </section>

      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-bloom text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-rose active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={startCreate}
        disabled={!canEdit}
        aria-label="新增双人日记"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Modal
        open={setupOpen}
        onClose={() => {
          resetDraft();
          setSetupOpen(false);
        }}
        title="新建双人日记"
        description="先确定标题和关联方式，正文会在下一步编辑。"
        size="lg"
      >
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-ink/58">
            标题
            <Input
              className="mt-1 bg-white/70"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="例如：那天晚上我们聊了很久"
            />
          </label>

          <label className="block text-xs font-semibold text-ink/58">
            关联回忆
            <select
              className="mt-1 min-h-10 w-full rounded-[7px] border border-dim/80 bg-white/70 px-3 text-sm text-ink outline-none transition focus:border-sky"
              value={draft.linkedMemoryId}
              onChange={(event) => {
                const memory = memories.find((item) => item.id === event.target.value);
                setDraft((current) => ({
                  ...current,
                  linkedMemoryId: event.target.value,
                  cityId: memory?.cityId ?? current.cityId,
                  date: memory?.date ?? current.date,
                  title: current.title || (memory ? `${memory.city}的小记` : ""),
                }));
                if (memory) {
                  const city = cities.find((candidate) => candidate.id === memory.cityId);
                  if (city) setSelectedProvince(city.provinceId);
                }
              }}
            >
              <option value="">不关联回忆，手动选择城市</option>
              {memories.map((memory) => (
                <option key={memory.id} value={memory.id}>
                  {memory.city} · {memory.title || memory.text.slice(0, 18)}
                </option>
              ))}
            </select>
          </label>

          {!draft.linkedMemoryId && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-ink/58">
                省份
                <select
                  className="mt-1 min-h-10 w-full rounded-[7px] border border-dim/80 bg-white/70 px-3 text-sm text-ink outline-none transition focus:border-sky"
                  value={selectedProvince}
                  onChange={(event) => updateProvince(event.target.value)}
                >
                  {provinceOptions.map((province) => (
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
                  value={draft.cityId}
                  onChange={(event) => setDraft((current) => ({ ...current, cityId: event.target.value }))}
                >
                  {citiesInProvince.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <button
            className="flex min-h-11 w-full items-center justify-center rounded-[8px] bg-slate px-4 text-sm font-semibold text-white transition hover:bg-rose disabled:opacity-45"
            type="button"
            onClick={enterEditorFromSetup}
            disabled={!draft.title.trim()}
          >
            进入编辑器
          </button>
        </div>
      </Modal>

      <Modal
        open={editorOpen}
        onClose={() => {
          if (!isSaving && !isPolishing) {
            setEditorOpen(false);
            resetDraft();
          }
        }}
        title={editingId ? "编辑双人日记" : "写双人日记"}
        description={selectedMemory ? `关联回忆：${selectedMemory.city} · ${selectedMemory.date}` : "没有关联回忆，可作为独立日记保存。"}
        size="xl"
        closeOnOverlay={!isSaving && !isPolishing}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <label className="block text-xs font-semibold text-ink/58">
              标题
              <Input
                className="mt-1 bg-white/70"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="block text-xs font-semibold text-ink/58">
              日期
              <DatePicker
                className="mt-1 bg-white/70"
                value={draft.date}
                onChange={(date) => setDraft((current) => ({ ...current, date }))}
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-ink/58">
            正文
            <div className="mt-1 flex flex-wrap gap-1 rounded-t-[8px] border border-b-0 border-dim/80 bg-white/58 p-1">
              {[
                { key: "bold", label: "加粗", icon: Bold },
                { key: "list", label: "清单", icon: List },
                { key: "quote", label: "引用", icon: Quote },
                { key: "divider", label: "分隔", icon: FileText },
              ].map((tool) => {
                const ToolIcon = tool.icon;
                return (
                  <button
                    key={tool.key}
                    className="inline-flex min-h-8 items-center gap-1 rounded-[6px] px-2 text-xs font-semibold text-ink/58 transition hover:bg-sakura/40 hover:text-bloom"
                    type="button"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      body: applyDiaryFormat(current.body, tool.key as "bold" | "list" | "quote" | "divider"),
                    }))}
                    disabled={isSaving}
                  >
                    <ToolIcon className="h-3.5 w-3.5" />
                    {tool.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              className="min-h-[220px] rounded-t-none bg-white/70"
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              placeholder={"我：今天最想记住的是……\n她：我想补充……"}
              maxLength={1200}
            />
          </label>
          {draft.body.trim() && (
            <div className="rounded-[8px] border border-dim/70 bg-white/38 p-3 text-ink/72">
              <p className="mb-2 text-xs font-semibold text-ink/42">预览</p>
              <DiaryBody body={draft.body} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-[7px] border border-sakura bg-sakura/42 px-3 text-sm font-semibold text-bloom transition hover:bg-sakura/70 disabled:opacity-45"
              type="button"
              onClick={() => void polishDraft()}
              disabled={!draft.body.trim() || isPolishing || isSaving}
            >
              {isPolishing ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
              {isPolishing ? "润色中" : "AI 润色"}
            </button>
            {editingPayload.history.length > 0 && (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-[7px] border border-dim bg-white/48 px-3 text-sm font-semibold text-ink/62 transition hover:border-sky hover:text-sky"
                type="button"
                onClick={() => setShowHistory((current) => !current)}
              >
                <History className="h-4 w-4" />
                {showHistory ? "收起历史" : `查看历史 ${editingPayload.history.length}`}
              </button>
            )}
          </div>

          {showHistory && editingPayload.history.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-[8px] border border-dim/70 bg-white/42 p-3">
              {editingPayload.history.map((entry) => (
                <div key={entry.id} className="rounded-[7px] border border-dim/60 bg-cream/70 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/48">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{entry.editorName}</span>
                    <span>{entry.editedAt ? new Date(entry.editedAt).toLocaleString("zh-CN") : "未知时间"}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink/64">{entry.text}</p>
                </div>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-dim/70 bg-cream/96 px-5 py-3 backdrop-blur">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[8px] bg-slate px-4 text-sm font-semibold text-white transition hover:bg-rose disabled:opacity-45"
              type="button"
              onClick={() => void saveDiary()}
              disabled={!canSave}
            >
              {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
              {isSaving ? "保存中" : "保存日记"}
            </button>
          </div>
        </div>
      </Modal>

      {status && (
        <p className="mt-5 rounded-[8px] border border-dim/78 bg-cream/72 px-4 py-3 text-sm text-ink/66">
          {status}
        </p>
      )}
    </MemoryPageShell>
  );
}

export function FavoritesPage() {
  return <CoupleDiaryPage />;
}

export function AnniversariesPage() {
  return <MemoryToolPage config={configs.anniversary} />;
}
