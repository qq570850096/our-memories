"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Download,
  Heart,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
} from "lucide-react";
import { cities } from "@/data/cities";
import { MemoryPageShell, type MemoryNavKey } from "@/components/MemoryNav";
import {
  memoryStoreUpdatedEvent,
  type LocalMemoryStore,
} from "@/data/progress";
import {
  readAppSettings,
  writeAppSettings,
  syncAppSettings,
  defaultAnniversaryDate,
  defaultAnniversaryLabel,
  defaultCoupleLogo,
  defaultWeatherCityIds,
  maxWeatherCities,
  type AppSettings,
  type LoginPhotoText,
} from "@/data/appSettings";
import {
  deleteLoginPhotoText,
  deleteLoginPhoto,
  loginPhotosUpdatedEvent,
  readLoginPhotoTexts,
  readLoginPhotos,
  writeLoginPhotoText,
  writeLoginPhoto,
} from "@/data/loginPhotoStore";
import {
  adminModeUpdatedEvent,
  readAdminMode,
  writeAdminMode,
} from "@/data/adminMode";
import { LocalPrivacyImage } from "@/components/LocalPrivacyImage";
import { apiFetch } from "@/lib/apiClient";
import { readSession } from "@/lib/authStore";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

type StoredItem = {
  id: string;
  title: string;
  date?: string;
  note: string;
  cityId?: string;
};
type CityAssetStore = Record<string, string>;
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
    title: "时光宝盒",
    subtitle: "存放不一定属于某座城市的小秘密。",
    storageKey: "mapofus:capsules",
    kind: "capsule",
  },
} satisfies Record<string, ToolConfig>;

const auxiliaryStorageKeys = ["mapofus:favorites", "mapofus:anniversaries", "mapofus:capsules"] as const;
const loginPhotoVersion = "placeholder-20260601";
const loginPhotoFallback = (fileName: string) => `/photos/login/${fileName}.jpg?v=${loginPhotoVersion}`;

const loginPhotoSlots = [
  { id: "hangzhou", city: "杭州", label: "春日湖畔", fallback: loginPhotoFallback("hangzhou") },
  { id: "shanghai", city: "上海", label: "外滩傍晚", fallback: loginPhotoFallback("shanghai") },
  { id: "macau", city: "澳门", label: "旧城花影", fallback: loginPhotoFallback("macau") },
  { id: "hongkong", city: "香港", label: "夜色亮起", fallback: loginPhotoFallback("hongkong") },
  { id: "qingdao", city: "青岛", label: "海风经过", fallback: loginPhotoFallback("qingdao") },
  { id: "zhengzhou", city: "郑州", label: "见面那天", fallback: loginPhotoFallback("zhengzhou") },
  { id: "zhuhai", city: "珠海", label: "海边散步", fallback: loginPhotoFallback("zhuhai") },
  { id: "guangzhou", city: "广州", label: "旧街热气", fallback: loginPhotoFallback("guangzhou") },
  { id: "jinan", city: "济南", label: "泉边小记", fallback: loginPhotoFallback("jinan") },
] as const;

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
  kind === "favorite" ? "/favorites" : kind === "anniversary" ? "/anniversaries" : "/capsules";

const auxiliaryStorageKeyByKind = {
  favorite: "mapofus:favorites",
  anniversary: "mapofus:anniversaries",
  capsule: "mapofus:capsules",
} satisfies Record<ToolConfig["kind"], (typeof auxiliaryStorageKeys)[number]>;

const auxiliaryMigrationKey = (kind: ToolConfig["kind"]) => `mapofus:${kind}:migrated-to-server-v1`;

const loadAuxiliaryItems = async (config: ToolConfig) => {
  const localItems = readItems(config.storageKey);
  const response = await apiFetch(auxiliaryEndpoint(config.kind), { cache: "no-store" }).catch(() => null);

  if (!response?.ok) return localItems;

  const data = (await response.json().catch(() => null)) as AuxiliaryPayload | null;
  let serverItems = normalizeItems(data?.items ?? []);
  const migrationKey = auxiliaryMigrationKey(config.kind);
  const shouldMigrate = localItems.length > 0 && window.localStorage.getItem(migrationKey) !== "1";

  if (shouldMigrate) {
    const existingFingerprints = new Set(
      serverItems.map((item) => `${item.title}|${item.date ?? ""}|${item.note}|${item.cityId ?? ""}`),
    );
    const localOnlyItems = localItems.filter(
      (item) => !existingFingerprints.has(`${item.title}|${item.date ?? ""}|${item.note}|${item.cityId ?? ""}`),
    );

    await Promise.all(
      localOnlyItems.map((item) =>
        apiFetch("/auxiliary-items", {
          method: "PUT",
          body: JSON.stringify({ ...item, kind: config.kind }),
        }).catch(() => null),
      ),
    );
    window.localStorage.setItem(migrationKey, "1");

    const migratedResponse = await apiFetch(auxiliaryEndpoint(config.kind), { cache: "no-store" }).catch(() => null);
    const migratedData = (await migratedResponse?.json().catch(() => null)) as AuxiliaryPayload | null;
    serverItems = normalizeItems(migratedData?.items ?? serverItems);
  }

  writeItems(config.storageKey, serverItems);
  return serverItems;
};

const readAuxiliaryBackup = async () => {
  const localBackup = Object.fromEntries(auxiliaryStorageKeys.map((key) => [key, readJsonArray(key)]));
  const response = await apiFetch("/auxiliary-items", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return localBackup;

  const data = (await response.json().catch(() => null)) as
    | { items?: Array<StoredItem & { kind?: ToolConfig["kind"] }> }
    | null;
  const grouped: Record<(typeof auxiliaryStorageKeys)[number], StoredItem[]> = {
    "mapofus:favorites": [],
    "mapofus:anniversaries": [],
    "mapofus:capsules": [],
  };

  for (const item of data?.items ?? []) {
    if (!item.kind || !(item.kind in auxiliaryStorageKeyByKind)) continue;
    grouped[auxiliaryStorageKeyByKind[item.kind]].push({
      id: item.id,
      title: item.title,
      date: item.date,
      note: item.note,
      cityId: item.cityId,
    });
  }

  return grouped;
};

const useAdminMode = () => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsAdmin(readAdminMode()), 0);
    const handleAdminMode = (event: Event) => {
      setIsAdmin(Boolean((event as CustomEvent<boolean>).detail));
    };

    window.addEventListener(adminModeUpdatedEvent, handleAdminMode);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(adminModeUpdatedEvent, handleAdminMode);
    };
  }, []);

  return isAdmin;
};

const readJsonArray = (key: string) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const imageFileToSettingImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Invalid image"));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new window.Image();

    image.addEventListener("load", () => {
      const maxSize = 1800;
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      URL.revokeObjectURL(url);

      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image read failed"));
    });

    image.src = url;
  });

const normalizeAppSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const settings = value as AppSettings & { loginCoverImage?: string };
  const loginPhotos =
    settings.loginPhotos && typeof settings.loginPhotos === "object" && !Array.isArray(settings.loginPhotos)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotos).filter(
            ([key, photo]) =>
              loginPhotoSlots.some((slot) => slot.id === key) &&
              typeof photo === "string" &&
              photo.startsWith("data:image/"),
          ),
        )
      : {};
  const loginPhotoTexts =
    settings.loginPhotoTexts && typeof settings.loginPhotoTexts === "object" && !Array.isArray(settings.loginPhotoTexts)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotoTexts)
            .filter(([key]) => loginPhotoSlots.some((slot) => slot.id === key))
            .map(([key, value]) => {
              if (typeof value !== "object" || value === null || Array.isArray(value)) return [key, {}];
              const item = value as LoginPhotoText;

              return [
                key,
                {
                  city: typeof item.city === "string" ? item.city : undefined,
                  label: typeof item.label === "string" ? item.label : undefined,
                },
              ];
            }),
        )
      : {};

  if (
    Object.keys(loginPhotos).length === 0 &&
    typeof settings.loginCoverImage === "string" &&
    settings.loginCoverImage.startsWith("data:image/")
  ) {
    return { loginPhotos: { hangzhou: settings.loginCoverImage }, loginPhotoTexts };
  }

  return { loginPhotos, loginPhotoTexts };
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
  const [items, setItems] = useState<StoredItem[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadAuxiliaryItems(config)
        .then((nextItems) => {
          if (!cancelled) setItems(nextItems);
        })
        .catch(() => {
          if (!cancelled) {
            setItems(readItems(config.storageKey));
            setStatus("读取在线内容失败，已显示本地缓存。");
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config]);

  const cityOptions = useMemo(() => cities.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), []);
  const canSave = title.trim().length > 0;

  const resetForm = () => {
    setTitle("");
    setDate("");
    setNote("");
    setEditingId("");
  };

  const save = async () => {
    if (!canEdit) {
      setStatus("请先登录后再保存。");
      return;
    }
    if (!canSave) return;

    const item = {
      id: editingId || `${config.kind}-${Date.now()}`,
      title: title.trim(),
      date: date.trim(),
      note: note.trim(),
      cityId: config.kind === "favorite" ? cityId : undefined,
    };
    const nextItems = editingId
      ? items.map((current) => (current.id === editingId ? item : current))
      : [item, ...items];

    setIsWorking(true);
    setStatus("");

    try {
      const response = await apiFetch("/auxiliary-items", {
        method: "PUT",
        body: JSON.stringify({ ...item, kind: config.kind }),
      });
      if (!response.ok) throw new Error("Save failed");

      setItems(nextItems);
      writeItems(config.storageKey, nextItems);
      resetForm();
      const refreshedItems = await loadAuxiliaryItems(config);
      setItems(refreshedItems);
      setStatus(editingId ? "已保存修改。" : "已保存。");
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
  };

  const remove = async (id: string) => {
    if (!canEdit) {
      setStatus("请先登录后再删除。");
      return;
    }
    setIsWorking(true);
    setStatus("");

    try {
      const response = await apiFetch(`/auxiliary-items/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");

      const nextItems = items.filter((item) => item.id !== id);
      setItems(nextItems);
      writeItems(config.storageKey, nextItems);
      if (editingId === id) resetForm();
      setStatus("已删除。");
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

      <section className="mt-6 grid gap-4 sm:mt-10 sm:gap-5 lg:grid-cols-[340px_1fr]">
        <div className="h-fit rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#5A6670]">{editingId ? "编辑" : "新增"}</p>
            {!canEdit && <span className="text-xs font-semibold text-[#5A6670]/42">登录后可编辑</span>}
          </div>
          <input
            className="mt-4 w-full rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={config.kind === "favorite" ? "想去的地方" : "标题"}
            disabled={!canEdit || isWorking}
          />
          {config.kind === "favorite" && (
            <select
              className="mt-3 w-full rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
              disabled={!canEdit || isWorking}
            >
              {cityOptions.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          )}
          {config.kind !== "favorite" && (
            <input
              className="mt-3 w-full rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              placeholder="2026.05.20"
              maxLength={10}
              disabled={!canEdit || isWorking}
            />
          )}
          <textarea
            className="mt-3 w-full resize-none rounded-[7px] border border-[#D8DDD8] bg-[#FAFBF7] px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#E8B8C2]"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="写一点备注……"
            disabled={!canEdit || isWorking}
          />
          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#F5DCE0] px-4 py-2.5 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:opacity-45"
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || !canSave || isWorking}
          >
            <Plus className="h-4 w-4" />
            {isWorking ? "保存中" : editingId ? "保存修改" : "保存"}
          </button>
          {editingId && (
            <button
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-[7px] px-4 py-2 text-sm font-semibold text-[#5A6670]/56 transition hover:bg-[#D8DDD8]/28 hover:text-[#5A6670]"
              type="button"
              onClick={resetForm}
            >
              取消编辑
            </button>
          )}
        </div>

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

export function SettingsPage() {
  const isAdmin = useAdminMode();
  const [memoryCount, setMemoryCount] = useState(0);
  const [appSettings, setAppSettings] = useState<AppSettings>({});
  const [loginPhotos, setLoginPhotos] = useState<Record<string, string>>({});
  const [adminCode, setAdminCode] = useState("");
  const [adminError, setAdminError] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [newEntryPassword, setNewEntryPassword] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadMemoryCount = async () => {
    const response = await apiFetch("/memories", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return {};
    const data = (await response.json().catch(() => null)) as { memories?: LocalMemoryStore } | null;
    const memories = data?.memories ?? {};
    setMemoryCount(Object.values(memories).flat().length);

    return memories;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMemoryCount();
      const settings = readAppSettings();
      void syncAppSettings().then(setAppSettings).catch(() => {});
      const legacyPhotos = settings.loginPhotos ?? {};
      const nextSettings = { ...settings, loginPhotos: undefined };

      setAppSettings(nextSettings);
      void Promise.all(Object.entries(legacyPhotos).map(([slotId, image]) => writeLoginPhoto(slotId, image)))
        .then(async () => {
          if (Object.keys(legacyPhotos).length > 0) writeAppSettings(nextSettings);
          setLoginPhotos(await readLoginPhotos());
          const loginPhotoTexts = await readLoginPhotoTexts();
          setAppSettings((current) => ({ ...current, loginPhotoTexts }));
        })
        .catch(() => {
          setLoginPhotos(legacyPhotos);
        });
    }, 0);

    const handleLoginPhotosUpdate = () => {
      void readLoginPhotos().then(setLoginPhotos).catch(() => setLoginPhotos({}));
      void readLoginPhotoTexts()
        .then((texts) => setAppSettings((current) => ({ ...current, loginPhotoTexts: texts })))
        .catch(() => {});
    };

    window.addEventListener(loginPhotosUpdatedEvent, handleLoginPhotosUpdate);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(loginPhotosUpdatedEvent, handleLoginPhotosUpdate);
    };
  }, []);

  const updateLoginPhoto = async (slotId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      event.target.value = "";
      return;
    }
    if (!file || isWorking) return;

    setIsWorking(true);
    setStatus("");

    try {
      const image = await imageFileToSettingImage(file);
      await writeLoginPhoto(slotId, image);
      setLoginPhotos(await readLoginPhotos());
      setStatus("登录照片已更新");
    } catch {
      setStatus("登录照片更新失败，请选择一张图片");
    } finally {
      setIsWorking(false);
      event.target.value = "";
    }
  };

  const resetLoginPhoto = (slotId: string) => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    void deleteLoginPhoto(slotId)
      .then(async () => {
        setLoginPhotos(await readLoginPhotos());
        setStatus("登录照片已恢复默认");
      })
      .catch(() => setStatus("登录照片恢复失败，请稍后再试"));
  };

  const updateLoginPhotoText = (slotId: string, field: keyof LoginPhotoText, value: string) => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    const nextText = {
      ...(appSettings.loginPhotoTexts?.[slotId] ?? {}),
      [field]: value,
    };
    const nextSettings = {
      ...appSettings,
      loginPhotoTexts: {
        ...(appSettings.loginPhotoTexts ?? {}),
        [slotId]: nextText,
      },
    };

    setAppSettings(nextSettings);
    void writeLoginPhotoText(slotId, nextText)
      .then(() => setStatus("登录文字已更新"))
      .catch(() => setStatus("登录文字更新失败，请稍后再试"));
  };

  const resetLoginPhotoText = (slotId: string) => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    const nextTexts = { ...(appSettings.loginPhotoTexts ?? {}) };
    delete nextTexts[slotId];

    setAppSettings({ ...appSettings, loginPhotoTexts: nextTexts });
    void deleteLoginPhotoText(slotId)
      .then(() => setStatus("登录文字已恢复默认"))
      .catch(() => setStatus("登录文字恢复失败，请稍后再试"));
  };

  const anniversaryDate = appSettings.anniversaryDate ?? "";
  const anniversaryLabel = appSettings.anniversaryLabel ?? "";
  const weatherCityIds = appSettings.weatherCityIds ?? defaultWeatherCityIds;

  const updateBasicSetting = (patch: Partial<AppSettings>) => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    const next = { ...appSettings, ...patch };
    setAppSettings(next);
    writeAppSettings(next);
    setStatus("基础设置已更新");
  };

  const updateWeatherCity = (index: number, cityId: string) => {
    const nextIds = Array.from({ length: maxWeatherCities }, (_, i) =>
      i === index ? cityId : weatherCityIds[i] ?? defaultWeatherCityIds[i],
    );
    updateBasicSetting({ weatherCityIds: nextIds });
  };

  const coupleLogo = appSettings.coupleLogo ?? defaultCoupleLogo;

  const updateCoupleLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      event.target.value = "";
      return;
    }
    if (!file || isWorking) return;

    setIsWorking(true);
    setStatus("");

    try {
      const image = await imageFileToSettingImage(file);
      updateBasicSetting({ coupleLogo: image });
      setStatus("头像 logo 已更新");
    } catch {
      setStatus("头像 logo 更新失败，请选择一张图片");
    } finally {
      setIsWorking(false);
      event.target.value = "";
    }
  };

  const resetCoupleLogo = () => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }
    updateBasicSetting({ coupleLogo: undefined });
    setStatus("头像 logo 已恢复默认");
  };

  const savePassword = async (target: "site" | "admin", value: string) => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setStatus("请输入新密码");
      return;
    }
    if (target === "site" && !/^\d{4,8}$/.test(trimmed)) {
      setStatus("进入密码请用 4-8 位数字（你们在一起的日期，如 1223）");
      return;
    }

    setIsWorking(true);
    const response = await apiFetch("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, newPassword: trimmed }),
    }).catch(() => null);
    setIsWorking(false);

    if (response?.ok) {
      setStatus(target === "site" ? "进入密码已修改" : "管理员密码已修改");
      if (target === "site") setNewEntryPassword("");
      else setNewAdminPassword("");
    } else {
      setStatus("密码修改失败，请重试");
    }
  };

  const exportLocalData = async () => {
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      return;
    }

    setIsWorking(true);
    setStatus("");

    const memories = await loadMemoryCount();
    const assetResponse = await apiFetch("/city-assets", { cache: "no-store" }).catch(() => null);
    const assetData = (await assetResponse?.json().catch(() => null)) as { assets?: CityAssetStore } | null;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      memories,
      cityAssets: assetData?.assets ?? {},
      auxiliary: await readAuxiliaryBackup(),
      settings: {
        ...readAppSettings(),
        loginPhotos: await readLoginPhotos(),
        loginPhotoTexts: await readLoginPhotoTexts(),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `our-memories-backup-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("已导出完整备份");
    setIsWorking(false);
  };

  const importLocalData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!isAdmin) {
      setStatus("请先进入管理员模式");
      if (importInputRef.current) importInputRef.current.value = "";
      return;
    }
    if (!file || isWorking) return;

    setIsWorking(true);
    setStatus("");

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Invalid backup");
      }

      const payload = parsed as {
        memories?: unknown;
        cityAssets?: unknown;
        auxiliary?: Record<string, unknown>;
        settings?: unknown;
      };
      const importResponse = await apiFetch("/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!importResponse.ok) throw new Error("Import failed");

      const data = (await importResponse.json()) as { memories: LocalMemoryStore };
      auxiliaryStorageKeys.forEach((key) => {
        const value = payload.auxiliary?.[key];
        if (Array.isArray(value)) window.localStorage.setItem(key, JSON.stringify(value));
      });
      if (payload.settings) {
        const nextSettings = normalizeAppSettings(payload.settings);
        await Promise.all(
          Object.entries(nextSettings.loginPhotos ?? {}).map(([slotId, image]) => writeLoginPhoto(slotId, image)),
        );
        await Promise.all(
          Object.entries(nextSettings.loginPhotoTexts ?? {}).map(([slotId, text]) => writeLoginPhotoText(slotId, text)),
        );
        const settingsWithoutPhotos = { ...nextSettings, loginPhotos: undefined };
        writeAppSettings(settingsWithoutPhotos);
        setAppSettings(settingsWithoutPhotos);
        setLoginPhotos(await readLoginPhotos());
      }
      window.dispatchEvent(new CustomEvent(memoryStoreUpdatedEvent, { detail: data.memories }));
      setMemoryCount(Object.values(data.memories).flat().length);
      setStatus("导入完成，地图和回忆记录已刷新");
    } catch {
      setStatus("导入失败，请确认选择的是我们的回忆备份文件");
    } finally {
      setIsWorking(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const unlockAdmin = async () => {
    const session = readSession();
    const username = session?.user?.username;
    if (!username) {
      setAdminError("未找到当前用户信息");
      return;
    }

    const response = await apiFetch("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ username, password: adminCode }),
    }).catch(() => null);

    if (response?.ok) {
      writeAdminMode(true);
      setAdminCode("");
      setAdminError("");
      setStatus("管理员模式已开启");
      return;
    }

    setAdminError(response?.status === 503 ? "管理员认证未配置" : "密码不对");
  };

  const lockAdmin = () => {
    void apiFetch("/auth/login", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "admin" }),
    }).catch(() => null);
    writeAdminMode(false);
    setAdminCode("");
    setAdminError("");
    setStatus("管理员模式已关闭");
  };

  const generateActivationCode = async () => {
    if (!isAdmin || isWorking) return;
    setIsWorking(true);
    setActivationCode("");
    setStatus("");

    try {
      const response = await apiFetch("/activation-codes", {
        method: "POST",
        body: JSON.stringify({ plan: "private" }),
      });
      if (!response.ok) throw new Error("Activation code failed");
      const data = (await response.json()) as { activationCode?: { code?: unknown } };
      const code = typeof data.activationCode?.code === "string" ? data.activationCode.code : "";
      if (!code) throw new Error("Activation code missing");
      setActivationCode(code);
      setStatus("开通码已生成，请只在用户完成付款后发送给对方");
    } catch {
      setStatus("开通码生成失败，请确认当前账号是空间 owner");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <MemoryPageShell active="settings">
      <header>
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-[#A8C8DC] sm:h-8 sm:w-8" />
          <h1 className="text-2xl font-semibold leading-tight text-[#5A6670] sm:text-[34px]">设置</h1>
        </div>
        <p className="mt-2 hidden text-sm font-medium text-[#5A6670]/58 sm:block">管理本地数据和当前项目状态。</p>
      </header>

      <section className="mt-6 grid gap-4 sm:mt-10 md:grid-cols-2">
        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <ShieldCheck className="h-6 w-6 text-[#A8C8DC]" />
              ) : (
                <ShieldOff className="h-6 w-6 text-[#E8B8C2]" />
              )}
              <div>
                <p className="text-sm font-semibold text-[#5A6670]">管理员模式</p>
                <p className="mt-1 text-xs text-[#5A6670]/52">
                  {isAdmin ? "已开启，可以编辑和导入数据。" : "未开启，设置改动和删除操作已锁定。"}
                </p>
              </div>
            </div>

            {isAdmin ? (
              <button
                className="rounded-[7px] border border-[#D8DDD8] px-4 py-2 text-sm font-semibold text-[#5A6670]/64 transition hover:bg-white/60"
                type="button"
                onClick={lockAdmin}
              >
                退出管理员
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-h-10 w-36 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                  value={adminCode}
                  onChange={(event) => {
                    setAdminCode(event.target.value);
                    setAdminError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void unlockAdmin();
                  }}
                  placeholder="管理员密码"
                  type="password"
                />
                <button
                  className="rounded-[7px] bg-[#F5DCE0] px-4 py-2 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7]"
                  type="button"
                  onClick={() => void unlockAdmin()}
                >
                  开启
                </button>
                {adminError && <span className="text-xs font-semibold text-[#E8B8C2]">{adminError}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5 md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#5A6670]">开通码</p>
              <p className="mt-2 max-w-[680px] text-sm leading-6 text-[#5A6670]/62">
                用户完成付款后，生成一次性开通码发给对方。对方可在 Web 或小程序里自主创建情侣空间、两个账号和四位密码。
              </p>
            </div>
            <button
              className="rounded-[7px] border border-[#A8C8DC] px-4 py-2 text-sm font-semibold text-[#A8C8DC] transition hover:bg-[#D6E8F0]/36 disabled:opacity-45"
              type="button"
              onClick={() => void generateActivationCode()}
              disabled={!isAdmin || isWorking}
            >
              生成开通码
            </button>
          </div>
          {activationCode && (
            <div className="mt-4 rounded-[8px] border border-[#F5DCE0]/78 bg-[#F5DCE0]/28 p-4">
              <p className="text-xs font-semibold text-[#5A6670]/48">一次性开通码</p>
              <p className="mt-2 select-all break-all text-2xl font-semibold tracking-normal text-[#B85D70]">{activationCode}</p>
            </div>
          )}
        </div>

        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5 md:col-span-2">
          <div>
            <p className="text-sm font-semibold text-[#5A6670]">密码设置</p>
            <p className="mt-2 text-sm leading-6 text-[#5A6670]/62">
              修改打开应用的进入密码和管理员密码。修改后立即生效，下次打开也用新密码。需要先开启管理员模式。
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#5A6670]/48">进入密码（你们在一起的日期，如 1223）</span>
              <div className="flex gap-2">
                <input
                  className="min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white disabled:opacity-50"
                  value={newEntryPassword}
                  onChange={(event) => setNewEntryPassword(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  placeholder="如 1223"
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-[7px] bg-[#F5DCE0] px-4 py-2 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:opacity-50"
                  onClick={() => void savePassword("site", newEntryPassword)}
                  disabled={!isAdmin || isWorking}
                >
                  保存
                </button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-[#5A6670]/48">管理员密码（自己设置）</span>
              <div className="flex gap-2">
                <input
                  className="min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white disabled:opacity-50"
                  value={newAdminPassword}
                  onChange={(event) => setNewAdminPassword(event.target.value)}
                  type="password"
                  placeholder="新的管理员密码"
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-[7px] bg-[#F5DCE0] px-4 py-2 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#E8B8C2] hover:text-[#FAFBF7] disabled:opacity-50"
                  onClick={() => void savePassword("admin", newAdminPassword)}
                  disabled={!isAdmin || isWorking}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5 md:col-span-2">
          <div>
            <p className="text-sm font-semibold text-[#5A6670]">基础设置</p>
            <p className="mt-2 text-sm leading-6 text-[#5A6670]/62">
              标题、纪念日，以及首页“沿途天气”显示的城市，都可以在这里改成你自己的。
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-[#5A6670]/48">纪念日名称</span>
              <input
                className="min-h-10 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                value={anniversaryLabel}
                placeholder={defaultAnniversaryLabel}
                onChange={(event) => updateBasicSetting({ anniversaryLabel: event.target.value })}
                disabled={!isAdmin}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-[#5A6670]/48">纪念日开始日期（如 2026.03.20 或 2026年3月20日）</span>
              <input
                className="min-h-10 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                value={anniversaryDate}
                placeholder={defaultAnniversaryDate}
                onChange={(event) => updateBasicSetting({ anniversaryDate: event.target.value })}
                disabled={!isAdmin}
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold text-[#5A6670]/48">沿途天气城市（最多 {maxWeatherCities} 个）</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: maxWeatherCities }).map((_, index) => (
                <select
                  key={`weather-slot-${index}`}
                  className="min-h-10 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                  value={weatherCityIds[index] ?? ""}
                  onChange={(event) => updateWeatherCity(index, event.target.value)}
                  disabled={!isAdmin}
                >
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold text-[#5A6670]/48">右下角头像 logo</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[7px] border border-[#D8DDD8]/70 bg-white/40">
                <LocalPrivacyImage
                  src={coupleLogo}
                  alt="头像 logo 预览"
                  fill
                  sizes="80px"
                  className="object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`cursor-pointer rounded-[7px] border border-[#D8DDD8] px-4 py-2 text-sm font-semibold text-[#5A6670]/72 transition hover:bg-white/60 ${
                    isAdmin ? "" : "pointer-events-none opacity-50"
                  }`}
                >
                  上传图片
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={updateCoupleLogo}
                    disabled={!isAdmin}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-[7px] border border-[#D8DDD8] px-4 py-2 text-sm font-semibold text-[#5A6670]/64 transition hover:bg-white/60 disabled:opacity-50"
                  onClick={resetCoupleLogo}
                  disabled={!isAdmin}
                >
                  恢复默认
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5 md:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#5A6670]">登录照片</p>
              <p className="mt-2 text-sm leading-6 text-[#5A6670]/62">
                对应登录界面底部的 9 张照片。替换某一格后，大背景、相框和缩略图都会同步使用这一张。
              </p>
            </div>
            <p className="text-xs font-semibold text-[#5A6670]/42">
              已自定义 {Object.keys(loginPhotos).length} / {loginPhotoSlots.length}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {loginPhotoSlots.map((slot) => {
              const customPhoto = loginPhotos[slot.id];
              const customText = appSettings.loginPhotoTexts?.[slot.id];
              const src = customPhoto ?? slot.fallback;
              const titleValue = customText?.city ?? slot.city;
              const labelValue = customText?.label ?? slot.label;

              return (
                <div
                  className="rounded-[8px] border border-[#D8DDD8]/70 bg-white/34 p-3"
                  key={slot.id}
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[7px] bg-[#D6E8F0]/24">
                    <LocalPrivacyImage
                      className="h-full w-full object-cover"
                      src={src}
                      alt={`${slot.city} 登录照片预览`}
                      fill
                      sizes="(max-width: 768px) 50vw, 260px"
                    />
                  </div>
                  <div className="mt-3 grid gap-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-[#5A6670]/48">标题</span>
                      <input
                        className="min-h-10 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm font-semibold text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                        value={titleValue}
                        onChange={(event) => updateLoginPhotoText(slot.id, "city", event.target.value)}
                        disabled={!isAdmin}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-[#5A6670]/48">副标题</span>
                      <input
                        className="min-h-10 rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-3 text-sm text-[#5A6670] outline-none transition focus:border-[#A8C8DC] focus:bg-white"
                        value={labelValue}
                        onChange={(event) => updateLoginPhotoText(slot.id, "label", event.target.value)}
                        disabled={!isAdmin}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-[#5A6670]/44">
                      {customPhoto || customText ? "已自定义" : "默认内容"}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <label
                        className={`grid h-9 w-9 place-items-center rounded-[7px] border border-[#A8C8DC] text-[#A8C8DC] transition hover:bg-[#D6E8F0]/36 ${
                          isWorking || !isAdmin ? "pointer-events-none opacity-45" : ""
                        }`}
                        title={`更换${slot.city}登录照片`}
                      >
                        <Upload className="h-4 w-4" />
                        <input
                          className="hidden"
                          type="file"
                          accept="image/*"
                          onChange={(event) => updateLoginPhoto(slot.id, event)}
                          disabled={isWorking || !isAdmin}
                        />
                      </label>
                      <button
                        className="grid h-9 w-9 place-items-center rounded-[7px] border border-[#D8DDD8] text-[#5A6670]/58 transition hover:bg-white/68 disabled:opacity-35"
                        type="button"
                        onClick={() => resetLoginPhoto(slot.id)}
                        disabled={isWorking || !isAdmin || !customPhoto}
                        title={`恢复${slot.city}默认照片`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-[7px] border border-[#D8DDD8] px-3 text-xs font-semibold text-[#5A6670]/58 transition hover:bg-white/68 disabled:opacity-35"
                        type="button"
                        onClick={() => resetLoginPhotoText(slot.id)}
                        disabled={isWorking || !isAdmin || !customText}
                      >
                        文字
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5">
          <p className="text-sm font-semibold text-[#5A6670]">本地回忆</p>
          <p className="mt-2 text-3xl font-semibold text-[#E8B8C2]">{memoryCount}</p>
          <p className="mt-2 text-sm text-[#5A6670]/58">网页里新增的城市回忆数量。</p>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5">
          <p className="text-sm font-semibold text-[#5A6670]">完整备份</p>
          <p className="mt-2 text-sm leading-6 text-[#5A6670]/62">
            导出城市回忆、城市地标图、地点收藏、纪念日和时光宝盒。换电脑前先备份一下。
          </p>
          <button
            className="mt-4 flex items-center gap-2 rounded-[7px] border border-[#A8C8DC] px-4 py-2 text-sm font-semibold text-[#A8C8DC] transition hover:bg-[#D6E8F0]/36"
            type="button"
            onClick={exportLocalData}
            disabled={isWorking || !isAdmin}
          >
            <Download className="h-4 w-4" />
            导出备份
          </button>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] sm:p-5">
          <p className="text-sm font-semibold text-[#5A6670]">导入恢复</p>
          <p className="mt-2 text-sm leading-6 text-[#5A6670]/62">
            选择之前导出的备份文件，会覆盖当前城市回忆，并恢复辅助页面数据。
          </p>
          <input
            ref={importInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={importLocalData}
            disabled={!isAdmin}
          />
          <button
            className="mt-4 flex items-center gap-2 rounded-[7px] border border-[#E8B8C2] px-4 py-2 text-sm font-semibold text-[#E8B8C2] transition hover:bg-[#F5DCE0]/42 disabled:opacity-45"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isWorking || !isAdmin}
          >
            <Upload className="h-4 w-4" />
            导入备份
          </button>
        </div>
      </section>
      {status && (
        <p className="mt-5 rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/72 px-4 py-3 text-sm text-[#5A6670]/66">
          {status}
        </p>
      )}
    </MemoryPageShell>
  );
}
