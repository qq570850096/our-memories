"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Heart,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cities } from "@/data/cities";
import { MemoryPageShell, type MemoryNavKey } from "@/components/MemoryNav";
import { DatePicker } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiClient";
import { useApi } from "@/lib/swr";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

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

type ToolConfig = {
  active: MemoryNavKey;
  icon: typeof Heart;
  title: string;
  subtitle: string;
  storageKey: string;
  kind: "favorite" | "anniversary" | "capsule";
};

const configs = {
  favorite: {
    active: "favorites",
    icon: Heart,
    title: "地点收藏",
    subtitle: "先收好想一起去的地方，不点亮地图。",
    storageKey: "mapofus:favorites",
    kind: "favorite",
  },
  anniversary: {
    active: "anniversaries",
    icon: CalendarDays,
    title: "纪念日",
    subtitle: "把重要的日子放在这里，慢慢倒数。",
    storageKey: "mapofus:anniversaries",
    kind: "anniversary",
  },
  capsule: {
    active: "capsule",
    icon: Archive,
    title: "悄悄话",
    subtitle: "只属于我们的对话，记录彼此的心里话。",
    storageKey: "mapofus:capsules",
    kind: "capsule",
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
  const { data: auxiliaryData, mutate } = useApi<AuxiliaryPayload>(auxiliaryEndpoint(config.kind));
  const [items, setItems] = useState<StoredItem[]>(() => readItems(config.storageKey));
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
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

  const resetForm = () => {
    setTitle("");
    setDate("");
    setNote("");
    setEditingId("");
    setOpen(false);
  };

  const save = async () => {
    if (!canEdit) {
      setStatus("请先登录后再保存。");
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
          cityId: config.kind === "favorite" ? cityId : undefined,
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
        setStatus("已保存修改。");
      } else {
        // 创建新项
        const item = {
          id: `${config.kind}-${Date.now()}`,
          title: title.trim(),
          date: date.trim(),
          note: note.trim(),
          cityId: config.kind === "favorite" ? cityId : undefined,
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
        setStatus("已保存。");
      }

      // 刷新缓存
      void mutate();
    } catch {
      setStatus("保存失败，请确认网络和登录状态后重试。");
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
      setStatus("请先登录后再删除。");
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
      setStatus("已删除。");
      void mutate();
    } catch {
      setStatus("删除失败，请稍后再试。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <MemoryPageShell active={config.active}>
      <header className="flex flex-wrap items-start justify-between gap-4 sm:gap-5">
        <div>
          <div className="flex items-center gap-3">
            <Icon className="h-6 w-6 fill-[#F5DCE0] text-[#E8B8C2] sm:h-8 sm:w-8" />
            <h1 className="text-2xl font-semibold leading-tight text-[#5A6670] sm:text-[34px]">{config.title}</h1>
          </div>
          <p className="mt-2 hidden text-sm font-medium text-[#5A6670]/58 sm:block">{config.subtitle}</p>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72 px-4 py-2 text-sm font-semibold text-[#5A6670]/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
          {items.length} 条
        </div>
      </header>

      <section className="mt-6 sm:mt-10">
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const city = cities.find((candidate) => candidate.id === item.cityId);
            const leftDays = daysUntil(item.date);

            return (
              <article
                key={item.id}
                className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#5A6670]">{item.title}</h2>
                    {city && <p className="mt-1 text-sm text-[#A8C8DC]">{city.name}</p>}
                    {item.date && <p className="mt-1 text-sm text-[#5A6670]/54">{item.date}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/42 transition hover:bg-[#D6E8F0]/34 hover:text-[#A8C8DC]"
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label="编辑"
                      disabled={!canEdit || isWorking}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/42 transition hover:bg-[#F5DCE0]/45 hover:text-[#E8B8C2]"
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
                  <p className="mt-3 text-sm font-semibold text-[#E8B8C2]">
                    {leftDays >= 0 ? `还有 ${leftDays} 天` : `已经过去 ${Math.abs(leftDays)} 天`}
                  </p>
                )}
                {item.note && <p className="mt-3 text-sm leading-6 text-[#5A6670]/68">{item.note}</p>}
              </article>
            );
          })}
          {items.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-[#D8DDD8] px-6 py-12 text-center text-sm text-[#5A6670]/54 md:col-span-2">
              这里还空着，先放下第一条吧。
            </div>
          )}
        </div>
      </section>

      {/* 浮动添加按钮 */}
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-[#D86F82] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        disabled={!canEdit}
        aria-label={`新增${config.title}`}
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
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_28px_90px_rgba(39,56,70,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D8DDD8] bg-white/90 px-5 py-4 backdrop-blur">
              <h2 className="text-lg font-semibold text-[#5A6670]">{editingId ? "编辑" : "新增"}</h2>
              <button
                className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block text-xs font-semibold text-[#5A6670]/58">
                {config.kind === "favorite" ? "地点" : "标题"}
                <input
                  className="mt-1 w-full rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={config.kind === "favorite" ? "想去的地方" : "标题"}
                  disabled={isWorking}
                />
              </label>

              {config.kind === "favorite" && (
                <label className="block text-xs font-semibold text-[#5A6670]/58">
                  城市
                  <select
                    className="mt-1 w-full rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
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

              {config.kind !== "favorite" && (
                <label className="block text-xs font-semibold text-[#5A6670]/58">
                  日期
                  <DatePicker
                    className="mt-1 border-[#D8DDD8] bg-white focus:border-[#E8B8C2]"
                    value={date}
                    onChange={setDate}
                    disabled={isWorking}
                  />
                </label>
              )}

              <label className="block text-xs font-semibold text-[#5A6670]/58">
                备注
                <textarea
                  className="mt-1 w-full resize-none rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#E8B8C2]"
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="写一点备注……"
                  disabled={isWorking}
                />
              </label>

              <button
                className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#E8B8C2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D86F82] disabled:opacity-50"
                type="button"
                onClick={() => void save()}
                disabled={!canSave || isWorking}
              >
                {isWorking ? "保存中" : editingId ? "保存修改" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <p className="mt-5 rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/72 px-4 py-3 text-sm text-[#5A6670]/66">
          {status}
        </p>
      )}
    </MemoryPageShell>
  );
}

export function FavoritesPage() {
  return <MemoryToolPage config={configs.favorite} />;
}

export function AnniversariesPage() {
  return <MemoryToolPage config={configs.anniversary} />;
}

export function TimeCapsulePage() {
  return <MemoryToolPage config={configs.capsule} />;
}
