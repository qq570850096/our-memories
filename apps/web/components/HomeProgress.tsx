"use client";

import { useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { CalendarDays, Heart, Images, RefreshCw } from "lucide-react";
import { LocalPrivacyImage } from "@/components/LocalPrivacyImage";
import { cities } from "@/data/cities";
import {
  getLitCityIds,
  getLitProvinceIds,
  memoryStoreUpdatedEvent,
  type LocalMemoryStore,
} from "@/data/progress";
import { TOTAL_PROVINCES } from "@/data/provinces";
import {
  appSettingsUpdatedEvent,
  defaultAnniversaryDate,
  defaultAnniversaryLabel,
  defaultCoupleLogo,
  defaultWeatherCityIds,
  normalizeAnniversaryDate,
  readAppSettings,
  syncAppSettings,
  type AppSettings,
} from "@/data/appSettings";
import { apiFetch } from "@/lib/apiClient";

const weatherFallbackTemp = 24;

// Reads the user's local settings and stays in sync when they change them
// from the settings page (same tab via custom event, other tabs via storage).
function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>({});

  useEffect(() => {
    const sync = () => setSettings(readAppSettings());
    sync();
    void syncAppSettings().then(setSettings).catch(() => {});
    window.addEventListener(appSettingsUpdatedEvent, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(appSettingsUpdatedEvent, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return settings;
}

type WeatherKind =
  | "sunny"
  | "partly"
  | "cloudy"
  | "rain"
  | "light-rain"
  | "moderate-rain"
  | "heavy-rain"
  | "thunder"
  | "snow"
  | "moderate-snow"
  | "heavy-snow"
  | "sleet"
  | "fog"
  | "wind"
  | "night-clear"
  | "night-partly";

type WeatherInfo = {
  cityId: string;
  temp: number;
  kind: WeatherKind;
  label: string;
};

type OpenMeteoCurrent = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
};

const daysTogether = (date?: string) => {
  const normalizedDate = normalizeAnniversaryDate(date);
  if (!normalizedDate) return null;

  const [year, month, day] = normalizedDate.split(".").map(Number);
  const start = new Date(year, month - 1, day);
  const today = new Date();

  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
};

const formatClock = (value: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(value);

const formatWeekday = (value: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(value);

function useTogetherDays() {
  const settings = useAppSettings();
  const startDate = normalizeAnniversaryDate(settings.anniversaryDate) ?? defaultAnniversaryDate;
  const label = settings.anniversaryLabel ?? defaultAnniversaryLabel;
  const days = daysTogether(startDate) ?? 0;

  return { days, label, startDate };
}

function getWeatherKind(code: number, windSpeed: number, isDay: boolean): { kind: WeatherKind; label: string } {
  if (windSpeed >= 38) return { kind: "wind", label: "大风" };
  if (code === 0) return isDay ? { kind: "sunny", label: "晴" } : { kind: "night-clear", label: "夜晴" };
  if (code === 1 || code === 2) {
    return isDay ? { kind: "partly", label: "多云" } : { kind: "night-partly", label: "夜多云" };
  }
  if (code === 3) return { kind: "cloudy", label: "阴" };
  if (code === 45 || code === 48) return { kind: "fog", label: "大雾" };
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    return { kind: "light-rain", label: "小雨" };
  }
  if (code === 61) return { kind: "light-rain", label: "小雨" };
  if (code === 63) return { kind: "moderate-rain", label: "中雨" };
  if (code === 65) return { kind: "heavy-rain", label: "大雨" };
  if (code === 66 || code === 67) return { kind: "sleet", label: "雨夹雪" };
  if (code === 71 || code === 77) return { kind: "snow", label: "小雪" };
  if (code === 73) return { kind: "moderate-snow", label: "中雪" };
  if (code === 75) return { kind: "heavy-snow", label: "大雪" };
  if (code === 80) return { kind: "light-rain", label: "小雨" };
  if (code === 81) return { kind: "moderate-rain", label: "中雨" };
  if (code === 82) return { kind: "heavy-rain", label: "大雨" };
  if (code === 85) return { kind: "snow", label: "小雪" };
  if (code === 86) return { kind: "heavy-snow", label: "大雪" };
  if (code === 95 || code === 96 || code === 99) return { kind: "thunder", label: "雷雨" };

  return { kind: "rain", label: "阵雨" };
}

function buildWeatherUrl(lat: number, lng: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,weather_code,wind_speed_10m,is_day",
    timezone: "Asia/Shanghai",
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function WeatherPixelIcon({
  kind,
  className,
}: Readonly<{ kind: WeatherKind; className?: string }>) {
  const isNight = kind === "night-clear" || kind === "night-partly";
  const hasSun = kind === "sunny" || kind === "partly";
  const hasCloud = !["sunny", "night-clear", "fog", "wind"].includes(kind);
  const hasRain = ["rain", "light-rain", "moderate-rain", "heavy-rain", "thunder", "sleet"].includes(kind);
  const hasSnow = ["snow", "moderate-snow", "heavy-snow", "sleet"].includes(kind);
  const rainDrops = kind === "heavy-rain" ? 6 : kind === "moderate-rain" ? 5 : hasRain ? 3 : 0;
  const snowDrops = kind === "heavy-snow" ? 6 : kind === "moderate-snow" ? 5 : hasSnow ? 3 : 0;

  return (
    <svg className={`pixelated ${className ?? ""}`} viewBox="0 0 64 64" aria-hidden="true" shapeRendering="crispEdges">
      <g>
        {hasSun && (
          <>
            <rect x="14" y="7" width="6" height="6" fill="#FFB24A" />
            <rect x="6" y="22" width="6" height="6" fill="#FFB24A" />
            <rect x="28" y="22" width="6" height="6" fill="#FFB24A" />
            <rect x="14" y="36" width="6" height="6" fill="#FFB24A" />
            <rect x="12" y="17" width="16" height="16" fill="#FFCC63" />
            <rect x="16" y="13" width="8" height="24" fill="#FFE6A1" />
            <rect x="16" y="25" width="4" height="4" fill="#6D7382" />
            <rect x="24" y="25" width="4" height="4" fill="#6D7382" />
            <rect x="20" y="31" width="4" height="4" fill="#E8B8C2" />
          </>
        )}
        {isNight && (
          <>
            <rect x="14" y="11" width="24" height="24" fill="#828BC4" />
            <rect x="22" y="7" width="18" height="28" fill="#FFE08B" />
            <rect x="30" y="7" width="12" height="20" fill="#828BC4" />
            <rect x="10" y="10" width="4" height="4" fill="#FFD37A" />
            <rect x="42" y="17" width="4" height="4" fill="#F5DCE0" />
            <rect x="18" y="32" width="4" height="4" fill="#E8B8C2" />
          </>
        )}
        {kind === "fog" && (
          <>
            <rect x="8" y="18" width="34" height="5" fill="#CFD6E1" />
            <rect x="20" y="27" width="34" height="5" fill="#BAC5D4" />
            <rect x="8" y="36" width="40" height="5" fill="#D8DEE8" />
            <rect x="16" y="45" width="26" height="5" fill="#BAC5D4" />
            <rect x="49" y="13" width="4" height="4" fill="#F2A6C0" />
            <rect x="53" y="17" width="4" height="4" fill="#F2A6C0" />
          </>
        )}
        {kind === "wind" && (
          <>
            <rect x="10" y="22" width="31" height="4" fill="#AFC4EA" />
            <rect x="10" y="34" width="23" height="4" fill="#AFC4EA" />
            <rect x="18" y="46" width="32" height="4" fill="#AFC4EA" />
            <rect x="41" y="18" width="9" height="4" fill="#7A8FC5" />
            <rect x="33" y="30" width="13" height="4" fill="#7A8FC5" />
            <rect x="50" y="42" width="5" height="4" fill="#7A8FC5" />
            <rect x="51" y="13" width="4" height="4" fill="#F2A6C0" />
            <rect x="55" y="17" width="4" height="4" fill="#F2A6C0" />
          </>
        )}
        {hasCloud && (
          <>
            <rect x="14" y="25" width="38" height="18" fill={kind === "cloudy" || kind === "thunder" ? "#B9C1D3" : "#E9F3FF"} />
            <rect x="20" y="17" width="24" height="12" fill={kind === "cloudy" || kind === "thunder" ? "#C9D0DF" : "#F7FBFF"} />
            <rect x="10" y="31" width="46" height="12" fill={kind === "cloudy" || kind === "thunder" ? "#AEB7CB" : "#CFE4FF"} />
            <rect x="16" y="29" width="34" height="10" fill={kind === "cloudy" || kind === "thunder" ? "#D3D8E5" : "#FFFFFF"} />
            <rect x="11" y="41" width="44" height="4" fill="#5F82C3" opacity="0.65" />
          </>
        )}
        {Array.from({ length: rainDrops }).map((_, index) => (
          <rect
            key={`rain-${index}`}
            x={18 + (index % 3) * 12 + (index > 2 ? 4 : 0)}
            y={48 + Math.floor(index / 3) * 8}
            width="4"
            height="8"
            fill="#4D8ED8"
          />
        ))}
        {Array.from({ length: snowDrops }).map((_, index) => (
          <g key={`snow-${index}`} transform={`translate(${16 + (index % 3) * 14 + (index > 2 ? 3 : 0)} ${49 + Math.floor(index / 3) * 7})`}>
            <rect x="3" y="0" width="3" height="9" fill="#7FA4D8" />
            <rect x="0" y="3" width="9" height="3" fill="#7FA4D8" />
          </g>
        ))}
        {kind === "thunder" && (
          <>
            <rect x="31" y="43" width="7" height="11" fill="#FFB24A" />
            <rect x="25" y="52" width="13" height="5" fill="#FFB24A" />
            <rect x="29" y="57" width="5" height="7" fill="#D8663D" />
          </>
        )}
      </g>
    </svg>
  );
}

function WeatherFrame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 128 8" aria-hidden="true" {...props}>
      <rect x="0" y="3" width="128" height="2" fill="#D8DDD8" opacity="0.45" />
      <rect x="14" y="2" width="14" height="4" fill="#F5DCE0" opacity="0.72" />
      <rect x="88" y="2" width="8" height="4" fill="#D6E8F0" opacity="0.82" />
    </svg>
  );
}

function WeatherCard() {
  const [weather, setWeather] = useState<Record<string, WeatherInfo>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const settings = useAppSettings();

  const locationCities = useMemo(
    () =>
      (settings.weatherCityIds ?? defaultWeatherCityIds)
        .map((cityId) => {
          const city = cities.find((item) => item.id === cityId);
          return city ? { cityId, fallbackTemp: weatherFallbackTemp, city } : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [settings.weatherCityIds],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      setIsLoading(true);
      const entries = await Promise.all(
        locationCities.map(async ({ city, fallbackTemp }) => {
          const response = await fetch(buildWeatherUrl(city.lat, city.lng)).catch(() => null);
          const data = response?.ok ? ((await response.json().catch(() => null)) as OpenMeteoCurrent | null) : null;
          const current = data?.current;
          const temp = Math.round(current?.temperature_2m ?? fallbackTemp);
          const weatherCode = current?.weather_code ?? 0;
          const windSpeed = current?.wind_speed_10m ?? 0;
          const mapped = getWeatherKind(weatherCode, windSpeed, (current?.is_day ?? 1) === 1);

          return [
            city.id,
            {
              cityId: city.id,
              temp,
              ...mapped,
            },
          ] as const;
        }),
      );

      if (!cancelled) {
        setWeather(Object.fromEntries(entries));
        setUpdatedAt(new Date());
        setIsLoading(false);
      }
    }

    loadWeather();
    const interval = window.setInterval(loadWeather, 30 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [locationCities]);

  return (
    <div className="mb-4 rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/66 p-3 text-[#5A6670] shadow-[0_10px_24px_rgba(90,102,112,0.05)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold text-[#5A6670]/58">沿途天气</p>
          <p className="text-[11px] text-[#5A6670]/42">
            {updatedAt ? `${formatClock(updatedAt)} 更新` : "正在匹配"}
          </p>
        </div>
        <RefreshCw className={`h-4 w-4 text-[#A8C8DC] ${isLoading ? "animate-spin" : ""}`} />
      </div>
      <WeatherFrame className="mb-2 h-2 w-full" />
      <div className="grid grid-cols-3 gap-2">
        {locationCities.map(({ city, fallbackTemp }) => {
          const item = weather[city.id] ?? {
            cityId: city.id,
            temp: fallbackTemp,
            kind: "partly" as const,
            label: "多云",
          };

          return (
            <div
              key={city.id}
              className="min-w-0 rounded-[8px] border border-[#D8DDD8]/56 bg-white/36 px-2 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
            >
              <p className="truncate text-[11px] font-semibold leading-none text-[#5A6670]/70">{city.name}</p>
              <WeatherPixelIcon kind={item.kind} className="mx-auto mt-1 h-10 w-10" />
              <div className="mt-1 flex items-end justify-center gap-0.5 leading-none">
                <span className="text-lg font-semibold text-[#5A6670]">{item.temp}</span>
                <span className="pb-0.5 text-xs font-semibold text-[#5A6670]/52">°</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-[#A8C8DC]">{item.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateTimeCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const firstTick = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30_000);

    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="mb-4 rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/62 px-4 py-3 text-[#5A6670] shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold leading-none text-[#5A6670]/54">今天</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-[#A8C8DC]">
            {now ? formatClock(now) : "--:--"}
          </p>
        </div>
        <div className="text-right">
          <CalendarDays className="ml-auto h-4 w-4 text-[#E8B8C2]" />
          <p className="mt-2 text-xs font-semibold text-[#5A6670]/64">
            {now ? `${formatDate(now)} ${formatWeekday(now)}` : "加载中"}
          </p>
        </div>
      </div>
    </div>
  );
}

function TogetherDaysCard() {
  const { days, label, startDate } = useTogetherDays();

  return (
    <div className="mt-3 rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/62 px-4 py-3 text-[#5A6670] shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#5A6670]/58">纪念日</p>
          <p className="mt-1 text-sm font-semibold text-[#5A6670]">{label}</p>
        </div>
        <div className="flex items-end gap-1.5">
          <span className="text-2xl font-semibold leading-none text-[#E8B8C2]">{days}</span>
          <span className="pb-0.5 text-sm font-semibold text-[#5A6670]/56">天</span>
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-[#5A6670]/45">从 {startDate} 开始</p>
    </div>
  );
}

export function TogetherDaysBadge({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const { days, label } = useTogetherDays();

  return (
    <div
      className={`flex w-fit max-w-full items-center gap-1.5 rounded-full border border-[#D8DDD8]/80 bg-[#FAFBF7]/78 text-[#5A6670]/78 shadow-[0_8px_22px_rgba(90,102,112,0.08)] backdrop-blur ${
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      <CalendarDays className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-[#A8C8DC]`} />
      <span className="min-w-0 truncate">
        {compact ? "在一起" : label}
        <strong className="mx-1 font-semibold text-[#E8B8C2]">{days}</strong>
        天
      </span>
    </div>
  );
}

function AlbumProgressCard() {
  const progress = useProgress();
  const provincePercent = Math.round((progress.provinceCount / TOTAL_PROVINCES) * 100);
  const cityPercent = Math.round((progress.cityCount / cities.length) * 100);

  return (
    <Link
      className="group mt-3 block rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/62 px-4 py-3 text-[#5A6670] shadow-[0_10px_24px_rgba(90,102,112,0.05)] transition hover:-translate-y-0.5 hover:border-[#F5DCE0] hover:bg-white/72"
      href="/memories"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[#F5DCE0]/80 bg-[#F5DCE0]/42 text-[#E8B8C2] transition group-hover:bg-[#F5DCE0]/68">
            <Images className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">回忆相册</span>
            <span className="mt-0.5 block truncate text-xs text-[#5A6670]/48">看全部照片</span>
          </span>
        </span>
        <span className="text-lg leading-none text-[#5A6670]/34 transition group-hover:translate-x-0.5 group-hover:text-[#E8B8C2]">
          →
        </span>
      </div>

      <div className="mt-4 border-t border-[#D8DDD8]/54 pt-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#5A6670]">我们的进度</p>
            <p className="mt-0.5 text-xs text-[#5A6670]/52">我们的回忆</p>
          </div>
          <Heart className="h-5 w-5 fill-[#F5DCE0] text-[#E8B8C2]" />
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="text-sm text-[#5A6670]/68">已点亮省份</div>
              <div className="text-sm font-semibold text-[#5A6670]">
                <span className="text-xl text-[#E8B8C2]">{progress.provinceCount}</span>
                <span className="ml-1 text-[#5A6670]/46">/ {TOTAL_PROVINCES}</span>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D8DDD8]/48">
              <div
                className="h-full rounded-full bg-[#E8B8C2] shadow-[0_0_12px_rgba(232,184,194,0.45)]"
                style={{ width: `${provincePercent}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="text-sm text-[#5A6670]/68">已留下回忆城市</div>
              <div className="text-sm font-semibold text-[#5A6670]">
                <span className="text-xl text-[#A8C8DC]">{progress.cityCount}</span>
                <span className="ml-1 text-[#5A6670]/46">/ {cities.length}</span>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D8DDD8]/48">
              <div
                className="h-full rounded-full bg-[#A8C8DC] shadow-[0_0_12px_rgba(168,200,220,0.45)]"
                style={{ width: `${cityPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CoupleLogo() {
  const [activeHead, setActiveHead] = useState<"left" | "right" | null>(null);
  const settings = useAppSettings();
  const logoSrc = settings.coupleLogo ?? defaultCoupleLogo;

  const popHead = (side: "left" | "right") => {
    setActiveHead(side);
    window.setTimeout(() => setActiveHead(null), 260);
  };

  return (
    <div className="mt-auto flex justify-center">
      <div className="relative aspect-[1106/849] w-52">
        <LocalPrivacyImage
          src={logoSrc}
          alt="我们的拼图头像 logo"
          fill
          sizes="208px"
          className={`object-contain transition-transform duration-300 ease-out ${
            activeHead === "left"
              ? "scale-[1.08] origin-[33%_47%]"
              : activeHead === "right"
                ? "scale-[1.08] origin-[69%_45%]"
                : "scale-100"
          }`}
        />
        <button
          className="absolute left-[15%] top-[23%] h-[42%] w-[31%] rounded-full outline-none transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-[#A8C8DC]/70 active:scale-[1.08]"
          type="button"
          aria-label="放大左边头像"
          onClick={() => popHead("left")}
        />
        <button
          className="absolute right-[11%] top-[21%] h-[45%] w-[34%] rounded-full outline-none transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-[#E8B8C2]/70 active:scale-[1.08]"
          type="button"
          aria-label="放大右边头像"
          onClick={() => popHead("right")}
        />
      </div>
    </div>
  );
}

function useProgress() {
  const [localMemories, setLocalMemories] = useState<LocalMemoryStore>({});

  useEffect(() => {
    let cancelled = false;
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) setLocalMemories(detail);
    };

    async function loadLocalMemories() {
      const response = await apiFetch("/memories", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;

      const data = (await response.json().catch(() => null)) as
        | { memories?: LocalMemoryStore }
        | null;

      if (!cancelled && data?.memories) setLocalMemories(data.memories);
    }

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    loadLocalMemories();

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    };
  }, []);

  return useMemo(() => {
    const litCityIds = getLitCityIds(localMemories);
    const litProvinceIds = getLitProvinceIds(litCityIds);

    return {
      cityCount: litCityIds.size,
      provinceCount: litProvinceIds.size,
    };
  }, [localMemories]);
}

export function ProgressBadge() {
  const progress = useProgress();

  return (
    <div className="ml-5 hidden items-center gap-2 rounded-[8px] border border-[#D8DDD8]/90 bg-[#FAFBF7]/70 px-4 py-2.5 text-sm text-[#5A6670]/76 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur sm:flex">
      <Heart className="h-4 w-4 fill-[#F5DCE0] text-[#E8B8C2]" />
      <span>已点亮</span>
      <strong className="font-semibold text-[#E8B8C2]">{progress.provinceCount}</strong>
      <span>/ {TOTAL_PROVINCES} 省份</span>
    </div>
  );
}

export function LegendProgress({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const progress = useProgress();

  return (
    <div
      className={`flex w-fit items-center border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 text-sm text-[#5A6670]/80 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur ${
        compact ? "gap-1.5 rounded-full px-2.5 py-1.5 text-xs" : "gap-3 rounded-[8px] px-5 py-3"
      }`}
    >
      <Heart className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} fill-[#F5DCE0] text-[#E8B8C2]`} />
      {compact ? (
        <span className="whitespace-nowrap">
          <strong className="font-semibold text-[#5A6670]">{progress.provinceCount}</strong> / {TOTAL_PROVINCES}
        </span>
      ) : (
        <span>
          <strong className="font-semibold text-[#5A6670]">{progress.provinceCount}</strong> /{" "}
          {TOTAL_PROVINCES} provinces explored
        </span>
      )}
    </div>
  );
}

export function StatsPanel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <aside className="hidden h-full w-[310px] shrink-0 flex-col overflow-y-auto border-l border-dashed border-[#D8DDD8] px-7 py-7 lg:flex">
      <DateTimeCard />
      <WeatherCard />
      {children}
      <TogetherDaysCard />
      <AlbumProgressCard />
      <CoupleLogo />
    </aside>
  );
}

export function ProvinceProgressBadge({
  provinceId,
  total,
}: Readonly<{
  provinceId: string;
  total: number;
}>) {
  const [localMemories, setLocalMemories] = useState<LocalMemoryStore>({});

  useEffect(() => {
    let cancelled = false;
    const handleMemoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LocalMemoryStore>).detail;
      if (detail) setLocalMemories(detail);
    };

    async function loadLocalMemories() {
      const response = await apiFetch("/memories", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;

      const data = (await response.json().catch(() => null)) as
        | { memories?: LocalMemoryStore }
        | null;

      if (!cancelled && data?.memories) setLocalMemories(data.memories);
    }

    window.addEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    loadLocalMemories();

    return () => {
      cancelled = true;
      window.removeEventListener(memoryStoreUpdatedEvent, handleMemoryUpdate);
    };
  }, []);

  const count = useMemo(() => {
    const litCityIds = getLitCityIds(localMemories);

    return cities.filter((city) => city.provinceId === provinceId && litCityIds.has(city.id))
      .length;
  }, [localMemories, provinceId]);

  return (
    <div className="hidden items-center gap-2 rounded-[8px] border border-[#D8DDD8]/90 bg-[#FAFBF7]/70 px-4 py-2.5 text-sm text-[#5A6670]/76 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur sm:flex">
      <Heart className="h-4 w-4 fill-[#F5DCE0] text-[#E8B8C2]" />
      <strong className="font-semibold text-[#E8B8C2]">{count}</strong>
      <span>/ {total} cities</span>
    </div>
  );
}
