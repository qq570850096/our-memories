"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Heart,
  MapPin,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { cities } from "@/data/cities";
import { MemoryPageShell } from "@/components/MemoryNav";
import {
  sortMemoriesByTime,
  type Memory,
} from "@/data/memories";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { useIsMobile } from "@/lib/useIsMobile";
import { useTransientStatus } from "@/lib/useTransientStatus";
import { useMemoryCachePublisher, useMemoryStore } from "@/lib/memoryStore";
import {
  createMemory,
  deleteMemory,
  listMemories,
  searchMemoriesByIntent,
  setMemoryCover,
  updateMemory,
  type MemoryListFilters,
  type MemoryPatchPayload,
  type MemoryPhotoPayload,
  type MemorySearchIntent,
} from "@/lib/memoryApi";
import {
  getAgentSettings,
  ignoreAgentSuggestion,
  updateAgentSettings,
  type IgnoredAgentSuggestion,
} from "@/lib/agentApi";
import { AddMemoryPanel } from "@/components/memories/AddMemoryPanel";
import {
  MemoryArchiveCard as MemoryCard,
  type MemoryArchiveItem,
} from "@/components/memories/MemoryArchiveCard";
import { MemoryCitySheet } from "@/components/memories/MemoryCitySheet";

type ArchiveView = "city" | "timeline";
type MemoryItem = MemoryArchiveItem;
type ArchiveFilters = {
  q: string;
  cityId: string;
  tag: string;
  mood: string;
};

const memoryMonthLabel = (memory: Memory) => {
  const match = /^(\d{4})\.(\d{2})\.\d{2}$/.exec(memory.date);
  if (!match) return "未标日期";

  return `${match[1]}年 ${Number(match[2])}月`;
};

export default function MemoryArchive() {
  const { data } = useMemoryStore();
  const publishMemoryMutation = useMemoryCachePublisher();
  const [view, setView] = useState<ArchiveView>("city");
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const canEdit = useContentEditAccess();
  const isMobile = useIsMobile();
  // 移动端原地展开的回忆详情（不跳转到地图页）。
  const [selectedItem, setSelectedItem] = useState<MemoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archiveStatus, setArchiveStatus] = useTransientStatus();
  const [filters, setFilters] = useState<ArchiveFilters>({ q: "", cityId: "", tag: "", mood: "" });
  const [query, setQuery] = useState("");
  const [pagedItems, setPagedItems] = useState<Memory[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState("");
  const [searchIntent, setSearchIntent] = useState<MemorySearchIntent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<IgnoredAgentSuggestion[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const loadingPageRef = useRef(false);

  const localMemories = useMemo(() => data?.memories ?? {}, [data?.memories]);
  const effectiveFilters = useMemo(() => ({ ...filters, q: query }), [filters, query]);
  const filterKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(filters.q.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const loadPage = useCallback(
    async (cursor = "", replace = false) => {
      if (loadingPageRef.current) return;
      loadingPageRef.current = true;
      setLoadingPage(true);
      setPageError("");
      try {
        const useIntentSearch = Boolean(
          !cursor &&
            effectiveFilters.q &&
            !effectiveFilters.cityId &&
            !effectiveFilters.tag &&
            !effectiveFilters.mood,
        );
        if (useIntentSearch) {
          const page = await searchMemoriesByIntent(effectiveFilters.q, 20);
          setPagedItems(page.items);
          setNextCursor("");
          setHasMore(false);
          setSearchIntent(page.intent);
          return;
        }
        const request: MemoryListFilters = {
          limit: 20,
          cursor,
          cityId: effectiveFilters.cityId || undefined,
          tags: effectiveFilters.tag ? [effectiveFilters.tag] : undefined,
          mood: effectiveFilters.mood || undefined,
          q: effectiveFilters.q || undefined,
        };
        const page = await listMemories(request);
        setPagedItems((current) => (cursor && !replace ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor ?? "");
        setHasMore(page.hasMore);
        setSearchIntent(null);
      } catch {
        setPageError("回忆列表读取失败，请稍后再试。");
        setSearchIntent(null);
      } finally {
        loadingPageRef.current = false;
        setLoadingPage(false);
      }
    },
    [effectiveFilters.cityId, effectiveFilters.mood, effectiveFilters.q, effectiveFilters.tag],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage("", true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filterKey, loadPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      getAgentSettings()
        .then((data) => {
          setAgentEnabled(data.settings.enabled);
          setIgnoredSuggestions(data.ignored);
        })
        .catch(() => null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const agentSuggestionTarget = useMemo(() => {
    if (!searchIntent) return "";
    return [
      searchIntent.cityId ?? "",
      searchIntent.tags?.join(",") ?? "",
      searchIntent.mood ?? "",
      searchIntent.query ?? "",
    ].join("|");
  }, [searchIntent]);
  const agentSuggestionIgnored = ignoredSuggestions.some(
    (item) => item.agent === "memory_search_intent" && item.targetId === agentSuggestionTarget,
  );

  const toggleAgent = async () => {
    if (agentBusy) return;
    const next = !agentEnabled;
    setAgentBusy(true);
    setAgentEnabled(next);
    try {
      const data = await updateAgentSettings({ enabled: next });
      setAgentEnabled(data.settings.enabled);
    } catch {
      setAgentEnabled(!next);
    } finally {
      setAgentBusy(false);
    }
  };

  const ignoreCurrentAgentSuggestion = async () => {
    if (!agentSuggestionTarget || agentBusy) return;
    setAgentBusy(true);
    try {
      const data = await ignoreAgentSuggestion("memory_search_intent", agentSuggestionTarget, "dismissed");
      setIgnoredSuggestions(data.ignored);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleDeleteMemory = async (cityId: string, memoryId: string) => {
    if (!canEdit) return;
    if (deletingId) return;
    setDeletingId(memoryId);
    try {
      const data = await deleteMemory(memoryId);
      publishMemoryMutation(data.memories, cityId);
      setSelectedItem((current) => (current?.memory.id === memoryId ? null : current));
      setArchiveStatus("回忆已删除。", { autoClear: true });
    } catch {
      setArchiveStatus("删除失败，请稍后再试。", { autoClear: true });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveMemory = async (cityId: string, memory: Memory, photos?: MemoryPhotoPayload[]) => {
    if (!canEdit) return;

    const data = await createMemory(memory, photos);
    publishMemoryMutation(data.memories, cityId);
    void loadPage("", true);
  };

  const handleUpdateMemory = async (cityId: string, memoryId: string, memory: MemoryPatchPayload) => {
    if (!canEdit) return;

    const data = await updateMemory(memoryId, memory);
    const nextMemories = data.memories;
    publishMemoryMutation(nextMemories, cityId);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? current.memory;

      return { ...current, memory: updatedMemory };
    });
    void loadPage("", true);
  };

  const handleSetMemoryCover = async (cityId: string, memoryId: string, coverImage: string) => {
    if (!canEdit) return;

    const data = await setMemoryCover(memoryId, coverImage);
    const nextMemories = data.memories;
    publishMemoryMutation(nextMemories, cityId);
    setSelectedItem((current) => {
      if (!current || current.memory.id !== memoryId) return current;
      const updatedMemory =
        (Object.values(nextMemories) as Memory[][])
          .flat()
          .find((candidate) => candidate.id === memoryId) ?? data.memory ?? {
          ...current.memory,
          image: coverImage,
        };

      return { ...current, memory: updatedMemory };
    });
  };

  const allLocalItems = useMemo(() => Object.values(localMemories).flat(), [localMemories]);
  const filterOptions = useMemo(() => {
    const tags = new Set<string>();
    const moods = new Set<string>();
    const cityIds = new Set<string>();
    allLocalItems.forEach((memory) => {
      memory.tags?.forEach((tag) => tags.add(tag));
      if (memory.mood) moods.add(memory.mood);
      if (memory.cityId) cityIds.add(memory.cityId);
    });
    return {
      tags: [...tags].slice(0, 12),
      moods: [...moods].slice(0, 10),
      cities: [...cityIds].flatMap((cityId) => {
        const city = cities.find((candidate) => candidate.id === cityId);
        return city ? [{ id: city.id, name: city.name }] : [];
      }),
    };
  }, [allLocalItems]);
  const activeFilterCount = [filters.q, filters.cityId, filters.tag, filters.mood].filter(Boolean).length;

  const memoryItems = useMemo<MemoryItem[]>(() => {
    const localItems = pagedItems.length > 0 || activeFilterCount > 0 || pageError ? pagedItems : allLocalItems;
    const byId = new Map<string, Memory>();

    localItems.forEach((memory) => {
      if (!memory.draft) byId.set(memory.id, memory);
    });

    return sortMemoriesByTime([...byId.values()]).map((memory) => ({
      memory,
      city: cities.find((city) => city.id === memory.cityId),
    }));
  }, [activeFilterCount, allLocalItems, pageError, pagedItems]);

  const cityGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const key = item.memory.cityId;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    return [...groups.entries()].map(([cityId, items]) => ({
      cityId,
      cityName: items[0]?.memory.city ?? cityId,
      memories: items,
    }));
  }, [memoryItems]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, MemoryItem[]>();

    memoryItems.forEach((item) => {
      const label = memoryMonthLabel(item.memory);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    });

    return [...groups.entries()].map(([label, items]) => ({ label, memories: items }));
  }, [memoryItems]);

  const cityCount = cityGroups.length;
  const showSearchPanel = searchOpen || activeFilterCount > 0 || Boolean(filters.q.trim());

  const toggleCity = (cityId: string) => {
    setExpandedCities((current) => {
      const next = new Set(current);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);

      return next;
    });
  };

  return (
    <MemoryPageShell active="memories">
          <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-5">
            <div>
              <div className="flex items-center gap-3">
                <Star className="h-6 w-6 fill-sakura text-bloom sm:h-8 sm:w-8" />
                <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[34px]">回忆</h1>
              </div>
              <p className="mt-2 text-sm font-medium text-ink/58">
                {view === "city" ? "按城市整理我们的足迹" : "按时间从新到旧排列"}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <div className="rounded-[8px] border border-dim/80 bg-cream/72 px-3 py-2 text-sm font-semibold text-ink/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur sm:px-4">
                {memoryItems.length} 条 · {cityCount} 城
              </div>
              <button
                className={`grid h-11 w-11 place-items-center rounded-[8px] border shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur transition ${
                  showSearchPanel
                    ? "border-sakura bg-sakura/58 text-bloom"
                    : "border-dim/80 bg-cream/72 text-ink/58 hover:border-sky hover:text-sky"
                }`}
                type="button"
                onClick={() => setSearchOpen((current) => !current)}
                aria-label={showSearchPanel ? "收起搜索" : "搜索回忆"}
              >
                {showSearchPanel ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </button>
              <div className="flex rounded-[8px] border border-dim/80 bg-cream/72 p-1 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
                {(["city", "timeline"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`min-h-9 rounded-[7px] px-3 text-sm font-semibold transition sm:px-4 ${
                      view === mode
                        ? "bg-sakura text-bloom"
                        : "text-ink/58 hover:bg-mist/32"
                    }`}
                    type="button"
                    onClick={() => setView(mode)}
                  >
                    {mode === "city" ? "城市" : "时间线"}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <AddMemoryPanel
            canEdit={canEdit}
            onSaved={(memories) => {
              publishMemoryMutation(memories);
              void loadPage();
            }}
          />

          {showSearchPanel && (
          <section className="mt-5 rounded-[8px] border border-dim/76 bg-cream/68 p-3 shadow-[0_10px_28px_rgba(90,102,112,0.055)] backdrop-blur sm:mt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <input
                className="min-h-10 rounded-[7px] border border-dim/80 bg-white/62 px-3 text-sm font-medium text-ink outline-none transition placeholder:text-ink/38 focus:border-sky"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="搜索回忆、地点、城市"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className={activeFilterCount === 0 ? "rounded-full border border-sakura bg-sakura/62 px-3 py-1.5 text-xs font-semibold text-bloom" : "rounded-full border border-dim bg-white/42 px-3 py-1.5 text-xs font-semibold text-ink/54"}
                  type="button"
                  onClick={() => setFilters({ q: "", cityId: "", tag: "", mood: "" })}
                >
                  全部
                </button>
                {filterOptions.cities.slice(0, 8).map((city) => (
                  <button
                    key={city.id}
                    className={filters.cityId === city.id ? "rounded-full border border-sky bg-mist px-3 py-1.5 text-xs font-semibold text-sky" : "rounded-full border border-dim bg-white/42 px-3 py-1.5 text-xs font-semibold text-ink/54"}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, cityId: current.cityId === city.id ? "" : city.id }))}
                  >
                    {city.name}
                  </button>
                ))}
                {filterOptions.tags.slice(0, 8).map((tag) => (
                  <button
                    key={tag}
                    className={filters.tag === tag ? "rounded-full border border-rose bg-sakura/54 px-3 py-1.5 text-xs font-semibold text-rose-ink" : "rounded-full border border-dim bg-white/42 px-3 py-1.5 text-xs font-semibold text-ink/54"}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, tag: current.tag === tag ? "" : tag }))}
                  >
                    #{tag}
                  </button>
                ))}
                {filterOptions.moods.slice(0, 6).map((mood) => (
                  <button
                    key={mood}
                    className={filters.mood === mood ? "rounded-full border border-leaf bg-mint/72 px-3 py-1.5 text-xs font-semibold text-success-ink" : "rounded-full border border-dim bg-white/42 px-3 py-1.5 text-xs font-semibold text-ink/54"}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, mood: current.mood === mood ? "" : mood }))}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>
            {searchIntent && (
              <p className="mt-2 text-xs font-semibold text-sky">
                已识别为
                {searchIntent.cityId ? ` 城市：${filterOptions.cities.find((city) => city.id === searchIntent.cityId)?.name ?? searchIntent.cityId}` : ""}
                {searchIntent.tags?.length ? ` 暗号：${searchIntent.tags.map((tag) => `#${tag}`).join(" ")}` : ""}
                {searchIntent.mood ? ` 心情：${searchIntent.mood}` : ""}
              </p>
            )}
            <div className="mt-3 hidden flex-wrap items-center gap-2 border-t border-dim/58 pt-3 sm:flex">
              <button
                className={`inline-flex min-h-9 items-center gap-2 rounded-[7px] border px-3 text-xs font-semibold transition ${
                  agentEnabled
                    ? "border-bloom bg-sakura/46 text-bloom"
                    : "border-dim bg-white/42 text-ink/54 hover:border-sky"
                }`}
                type="button"
                onClick={toggleAgent}
                disabled={agentBusy}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Agent {agentEnabled ? "已开启" : "默认关闭"}
              </button>
              {agentEnabled && searchIntent && !agentSuggestionIgnored && (
                <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-sakura/70 bg-sakura/22 px-3 py-2 text-xs font-semibold text-ink/66">
                  <span>可按这组条件继续整理回忆</span>
                  <button className="text-bloom underline-offset-2 hover:underline" type="button" onClick={ignoreCurrentAgentSuggestion} disabled={agentBusy}>
                    忽略
                  </button>
                </div>
              )}
            </div>
            {pageError && <p className="mt-2 text-xs font-semibold text-rose">{pageError}</p>}
          </section>
          )}

          {memoryItems.length === 0 ? (
            <div className="mt-6 grid min-h-[420px] place-items-center rounded-[8px] border border-dashed border-dim bg-cream/58 px-6 py-14 text-center shadow-[0_14px_34px_rgba(90,102,112,0.045)] backdrop-blur sm:mt-8">
              <div className="max-w-[430px]">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[8px] border border-sakura bg-sakura/42">
                  <Heart className="h-8 w-8 fill-sakura text-bloom" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-ink">还没有回忆记录</h2>
                <p className="mt-3 text-sm leading-7 text-ink/60">
                  可以直接点上方“新增回忆”添加城市、日期、照片和一句话回忆。保存后这里会自动按城市和时间整理。
                </p>
                <Link
                  className="mt-6 inline-flex items-center gap-2 rounded-[8px] border border-sky bg-cream/78 px-5 py-3 text-sm font-semibold text-sky transition hover:bg-mist/34"
                  href="/map"
                >
                  <MapPin className="h-4 w-4" />
                  回到地图
                </Link>
              </div>
            </div>
          ) : view === "city" ? (
            <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-9">
              {cityGroups.map((group) => {
                const expanded = expandedCities.has(group.cityId);
                const visibleMemories = expanded ? group.memories : group.memories.slice(0, 3);

                return (
                  <section key={group.cityId}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <MapPin className="h-5 w-5 fill-bloom text-bloom" />
                        <h2 className="text-2xl font-semibold text-ink">{group.cityName}</h2>
                        <span className="text-sm text-ink/48">
                          共 {group.memories.length} 条回忆
                        </span>
                      </div>
                      {group.memories.length > 3 && (
                        <button
                          className="flex items-center gap-1 text-sm font-semibold text-ink/58 transition hover:text-bloom"
                          type="button"
                          onClick={() => toggleCity(group.cityId)}
                        >
                          {expanded ? "收起" : "查看全部"}
                          <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 xl:grid-cols-3">
                      {visibleMemories.map((item) => (
                        <MemoryCard
                          key={item.memory.id}
                          item={item}
                          compact
                          onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                          onOpen={isMobile ? setSelectedItem : undefined}
                          deleting={deletingId === item.memory.id}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="relative mt-6 space-y-6 pl-9 sm:mt-10 sm:space-y-8">
              <div className="absolute bottom-0 left-3 top-0 w-px bg-bloom/58" aria-hidden="true" />
              {timelineGroups.map((group) => (
                <section key={group.label} className="relative">
                  <span className="absolute -left-[34px] top-1 grid h-6 w-6 place-items-center rounded-full border border-sakura bg-cream">
                    <span className="h-2.5 w-2.5 rounded-full bg-bloom" />
                  </span>
                  <h2 className="mb-4 text-2xl font-semibold text-ink">{group.label}</h2>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.memories.map((item) => (
                      <MemoryCard
                        key={item.memory.id}
                        item={item}
                        onDelete={canEdit ? (memoryId) => handleDeleteMemory(item.memory.cityId, memoryId) : undefined}
                        onOpen={isMobile ? setSelectedItem : undefined}
                        deleting={deletingId === item.memory.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {memoryItems.length > 0 && (hasMore || loadingPage) && (
            <div className="mt-8 flex justify-center">
              <button
                className="min-h-11 rounded-[8px] border border-dim bg-cream/78 px-5 text-sm font-semibold text-ink/62 transition hover:border-sky hover:text-sky disabled:opacity-45"
                type="button"
                onClick={() => void loadPage(nextCursor)}
                disabled={!hasMore || loadingPage}
              >
                {loadingPage ? "加载中" : "加载更多"}
              </button>
            </div>
          )}

      {selectedItem?.city && (
        <MemoryCitySheet
          open={selectedItem != null}
          onClose={() => setSelectedItem(null)}
          city={selectedItem.city}
          localMemories={memoryItems
            .filter((item) => item.memory.cityId === selectedItem.memory.cityId)
            .map((item) => item.memory)}
          selectedMemoryId={selectedItem.memory.id}
          isLit={memoryItems.some((item) => item.memory.cityId === selectedItem.memory.cityId)}
          isAdmin={canEdit}
          onSave={handleSaveMemory}
          onUpdate={handleUpdateMemory}
          onDelete={handleDeleteMemory}
          onSetCover={handleSetMemoryCover}
        />
      )}

      {archiveStatus && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-[8px] border border-success/70 bg-mint/95 px-4 py-3 text-sm font-semibold text-success-ink shadow-[0_8px_24px_rgba(90,102,112,0.2)] backdrop-blur">
          {archiveStatus}
        </div>
      )}
    </MemoryPageShell>
  );
}
