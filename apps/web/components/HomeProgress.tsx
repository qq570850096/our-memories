"use client";

import { useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { CalendarDays, Heart, Images, RefreshCw } from "lucide-react";
import { LocalPrivacyImage } from "@/components/LocalPrivacyImage";
import { cities } from "@/data/cities";
import {
  getLitCityIds,
  getLitProvinceIds,
} from "@/data/progress";
import { TOTAL_PROVINCES } from "@/data/provinces";
import { memoryTime } from "@/data/memories";
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
import TripGuidesCard from "@/components/TripGuidesCard";
import { summaryToMemoryStore, useMemorySummary } from "@/lib/memorySummaryStore";
import { pullRefreshEvent } from "@/lib/refresh";
import { useDeferredReady } from "@/lib/useDeferredReady";
import { useIsMobile } from "@/lib/useIsMobile";

const weatherFallbackTemp = 24;

// Reads the user's local settings and stays in sync when they change them
// from the settings page (same tab via custom event, other tabs via storage).
function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>({});
  const ready = useDeferredReady(900);

  useEffect(() => {
    const sync = () => setSettings(readAppSettings());
    const syncRemote = () => {
      void syncAppSettings().then(setSettings).catch(() => {});
    };
    sync();
    window.addEventListener(appSettingsUpdatedEvent, sync);
    window.addEventListener("storage", sync);
    window.addEventListener(pullRefreshEvent, syncRemote);

    return () => {
      window.removeEventListener(appSettingsUpdatedEvent, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(pullRefreshEvent, syncRemote);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void syncAppSettings().then(setSettings).catch(() => {});
  }, [ready]);

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
            <rect x="14" y="7" width="6" height="6" fill="var(--color-amber)" />
            <rect x="6" y="22" width="6" height="6" fill="var(--color-amber)" />
            <rect x="28" y="22" width="6" height="6" fill="var(--color-amber)" />
            <rect x="14" y="36" width="6" height="6" fill="var(--color-amber)" />
            <rect x="12" y="17" width="16" height="16" fill="var(--color-sunshine)" />
            <rect x="16" y="13" width="8" height="24" fill="var(--color-sunlit)" />
            <rect x="16" y="25" width="4" height="4" fill="var(--color-dusk)" />
            <rect x="24" y="25" width="4" height="4" fill="var(--color-dusk)" />
            <rect x="20" y="31" width="4" height="4" fill="var(--color-bloom)" />
          </>
        )}
        {isNight && (
          <>
            <rect x="14" y="11" width="24" height="24" fill="var(--color-lavender)" />
            <rect x="22" y="7" width="18" height="28" fill="var(--color-moon)" />
            <rect x="30" y="7" width="12" height="20" fill="var(--color-lavender)" />
            <rect x="10" y="10" width="4" height="4" fill="var(--color-marigold)" />
            <rect x="42" y="17" width="4" height="4" fill="var(--color-sakura)" />
            <rect x="18" y="32" width="4" height="4" fill="var(--color-bloom)" />
          </>
        )}
        {kind === "fog" && (
          <>
            <rect x="8" y="18" width="34" height="5" fill="var(--color-cloud-mid)" />
            <rect x="20" y="27" width="34" height="5" fill="var(--color-cloud)" />
            <rect x="8" y="36" width="40" height="5" fill="var(--color-cloud-light)" />
            <rect x="16" y="45" width="26" height="5" fill="var(--color-cloud)" />
            <rect x="49" y="13" width="4" height="4" fill="var(--color-petal)" />
            <rect x="53" y="17" width="4" height="4" fill="var(--color-petal)" />
          </>
        )}
        {kind === "wind" && (
          <>
            <rect x="10" y="22" width="31" height="4" fill="var(--color-wind)" />
            <rect x="10" y="34" width="23" height="4" fill="var(--color-wind)" />
            <rect x="18" y="46" width="32" height="4" fill="var(--color-wind)" />
            <rect x="41" y="18" width="9" height="4" fill="var(--color-wind-ink)" />
            <rect x="33" y="30" width="13" height="4" fill="var(--color-wind-ink)" />
            <rect x="50" y="42" width="5" height="4" fill="var(--color-wind-ink)" />
            <rect x="51" y="13" width="4" height="4" fill="var(--color-petal)" />
            <rect x="55" y="17" width="4" height="4" fill="var(--color-petal)" />
          </>
        )}
        {hasCloud && (
          <>
            <rect x="14" y="25" width="38" height="18" fill={kind === "cloudy" || kind === "thunder" ? "var(--color-storm)" : "var(--color-sky-light)"} />
            <rect x="20" y="17" width="24" height="12" fill={kind === "cloudy" || kind === "thunder" ? "var(--color-storm-light)" : "var(--color-sky-pale)"} />
            <rect x="10" y="31" width="46" height="12" fill={kind === "cloudy" || kind === "thunder" ? "var(--color-storm-deep)" : "var(--color-rain-mist)"} />
            <rect x="16" y="29" width="34" height="10" fill={kind === "cloudy" || kind === "thunder" ? "var(--color-storm-pale)" : "white"} />
            <rect x="11" y="41" width="44" height="4" fill="var(--color-rain)" opacity="0.65" />
          </>
        )}
        {Array.from({ length: rainDrops }).map((_, index) => (
          <rect
            key={`rain-${index}`}
            x={18 + (index % 3) * 12 + (index > 2 ? 4 : 0)}
            y={48 + Math.floor(index / 3) * 8}
            width="4"
            height="8"
            fill="var(--color-rain-bright)"
          />
        ))}
        {Array.from({ length: snowDrops }).map((_, index) => (
          <g key={`snow-${index}`} transform={`translate(${16 + (index % 3) * 14 + (index > 2 ? 3 : 0)} ${49 + Math.floor(index / 3) * 7})`}>
            <rect x="3" y="0" width="3" height="9" fill="var(--color-frost)" />
            <rect x="0" y="3" width="9" height="3" fill="var(--color-frost)" />
          </g>
        ))}
        {kind === "thunder" && (
          <>
            <rect x="31" y="43" width="7" height="11" fill="var(--color-amber)" />
            <rect x="25" y="52" width="13" height="5" fill="var(--color-amber)" />
            <rect x="29" y="57" width="5" height="7" fill="var(--color-ember)" />
          </>
        )}
      </g>
    </svg>
  );
}

function WeatherFrame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 128 8" aria-hidden="true" {...props}>
      <rect x="0" y="3" width="128" height="2" fill="var(--color-dim)" opacity="0.45" />
      <rect x="14" y="2" width="14" height="4" fill="var(--color-sakura)" opacity="0.72" />
      <rect x="88" y="2" width="8" height="4" fill="var(--color-mist)" opacity="0.82" />
    </svg>
  );
}

function WeatherCard() {
  const [weather, setWeather] = useState<Record<string, WeatherInfo>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const settings = useAppSettings();
  const isMobile = useIsMobile();
  const ready = useDeferredReady(1500);

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
    if (!ready || isMobile) return;
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
    window.addEventListener(pullRefreshEvent, loadWeather);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(pullRefreshEvent, loadWeather);
    };
  }, [isMobile, locationCities, ready]);

  if (isMobile) return null;

  return (
    <div className="mb-4 rounded-[8px] border border-dim/70 bg-cream/66 p-3 text-ink shadow-[0_10px_24px_rgba(90,102,112,0.05)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold text-ink/58">沿途天气</p>
          <p className="text-[11px] text-ink/42">
            {updatedAt ? `${formatClock(updatedAt)} 更新` : "正在匹配"}
          </p>
        </div>
        <RefreshCw className={`h-4 w-4 text-sky ${isLoading ? "animate-spin" : ""}`} />
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
              className="min-w-0 rounded-[8px] border border-dim/56 bg-white/36 px-2 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
            >
              <p className="truncate text-[11px] font-semibold leading-none text-ink/70">{city.name}</p>
              <WeatherPixelIcon kind={item.kind} className="mx-auto mt-1 h-10 w-10" />
              <div className="mt-1 flex items-end justify-center gap-0.5 leading-none">
                <span className="text-lg font-semibold text-ink">{item.temp}</span>
                <span className="pb-0.5 text-xs font-semibold text-ink/52">°</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-sky">{item.label}</p>
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
    <div className="mb-4 rounded-[8px] border border-dim/70 bg-cream/62 px-4 py-3 text-ink shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold leading-none text-ink/54">今天</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-sky">
            {now ? formatClock(now) : "--:--"}
          </p>
        </div>
        <div className="text-right">
          <CalendarDays className="ml-auto h-4 w-4 text-bloom" />
          <p className="mt-2 text-xs font-semibold text-ink/64">
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
    <div className="mt-3 rounded-[8px] border border-dim/70 bg-cream/62 px-4 py-3 text-ink shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink/58">纪念日</p>
          <p className="mt-1 text-sm font-semibold text-ink">{label}</p>
        </div>
        <div className="flex items-end gap-1.5">
          <span className="text-2xl font-semibold leading-none text-bloom">{days}</span>
          <span className="pb-0.5 text-sm font-semibold text-ink/56">天</span>
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-ink/45">从 {startDate} 开始</p>
    </div>
  );
}

export function TogetherDaysBadge({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const { days, label } = useTogetherDays();

  return (
    <div
      className={`flex w-fit max-w-full items-center gap-1.5 rounded-full border border-dim/80 bg-cream/78 text-ink/78 shadow-[0_8px_22px_rgba(90,102,112,0.08)] backdrop-blur ${
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      <CalendarDays className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-sky`} />
      <span className="min-w-0 truncate">
        {compact ? "在一起" : label}
        <strong className="mx-1 font-semibold text-bloom">{days}</strong>
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
      className="group mt-3 block rounded-[8px] border border-dim/70 bg-cream/62 px-4 py-3 text-ink shadow-[0_10px_24px_rgba(90,102,112,0.05)] transition hover:-translate-y-0.5 hover:border-sakura hover:bg-white/72"
      href="/memories"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-sakura/80 bg-sakura/42 text-bloom transition group-hover:bg-sakura/68">
            <Images className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">回忆相册</span>
            <span className="mt-0.5 block truncate text-xs text-ink/48">看全部照片</span>
          </span>
        </span>
        <span className="text-lg leading-none text-ink/34 transition group-hover:translate-x-0.5 group-hover:text-bloom">
          →
        </span>
      </div>

      <div className="mt-4 border-t border-dim/54 pt-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">我们的进度</p>
            <p className="mt-0.5 text-xs text-ink/52">我们的回忆</p>
          </div>
          <Heart className="h-5 w-5 fill-sakura text-bloom" />
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="text-sm text-ink/68">已点亮省份</div>
              <div className="text-sm font-semibold text-ink">
                <span className="text-xl text-bloom">{progress.provinceCount}</span>
                <span className="ml-1 text-ink/46">/ {TOTAL_PROVINCES}</span>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-dim/48">
              <div
                className="h-full rounded-full bg-bloom shadow-[0_0_12px_rgba(232,184,194,0.45)]"
                style={{ width: `${provincePercent}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="text-sm text-ink/68">已留下回忆城市</div>
              <div className="text-sm font-semibold text-ink">
                <span className="text-xl text-sky">{progress.cityCount}</span>
                <span className="ml-1 text-ink/46">/ {cities.length}</span>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-dim/48">
              <div
                className="h-full rounded-full bg-sky shadow-[0_0_12px_rgba(168,200,220,0.45)]"
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
          className="absolute left-[15%] top-[23%] h-[42%] w-[31%] rounded-full outline-none transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-sky/70 active:scale-[1.08]"
          type="button"
          aria-label="放大左边头像"
          onClick={() => popHead("left")}
        />
        <button
          className="absolute right-[11%] top-[21%] h-[45%] w-[34%] rounded-full outline-none transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-bloom/70 active:scale-[1.08]"
          type="button"
          aria-label="放大右边头像"
          onClick={() => popHead("right")}
        />
      </div>
    </div>
  );
}

function useProgress() {
  const { data } = useMemorySummary();

  return useMemo(() => {
    const localMemories = summaryToMemoryStore(data?.summary ?? {});
    const litCityIds = getLitCityIds(localMemories);
    const litProvinceIds = getLitProvinceIds(litCityIds);

    return {
      cityCount: litCityIds.size,
      provinceCount: litProvinceIds.size,
    };
  }, [data?.summary]);
}

function useMapRitualStats() {
  const { days } = useTogetherDays();
  const { data } = useMemorySummary();

  return useMemo(() => {
    const summaryItems = Object.values(data?.summary ?? {});
    const localMemories = summaryToMemoryStore(data?.summary ?? {});
    const litCityIds = getLitCityIds(localMemories);
    const litProvinceIds = getLitProvinceIds(litCityIds);
    const latestMemory = summaryItems
      .flatMap((item) => (item.latest ? [item.latest] : []))
      .sort((a, b) => memoryTime(b) - memoryTime(a))[0];

    return {
      days,
      cityCount: litCityIds.size,
      provinceCount: litProvinceIds.size,
      memoryCount: summaryItems.reduce((total, item) => total + item.count, 0),
      latestCity: latestMemory?.city ?? "等待点亮",
      latestDate: latestMemory?.date ?? "第一站",
    };
  }, [data?.summary, days]);
}

export function MobileRitualStats() {
  const stats = useMapRitualStats();
  const badges = [
    { label: "在一起", value: stats.days, unit: "天", accent: "text-bloom" },
    { label: "省份", value: stats.provinceCount, unit: "枚", accent: "text-sky" },
    { label: "城市", value: stats.cityCount, unit: "座", accent: "text-ink" },
    { label: "回忆", value: stats.memoryCount, unit: "条", accent: "text-bloom" },
  ];

  return (
    <section className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+9rem)] z-30 lg:hidden">
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-2">
          {badges.map((badge, index) => (
            <div
              key={badge.label}
              className="relative min-w-0 border-2 border-ink/18 bg-cream/88 px-1.5 pb-2 pt-1.5 text-center shadow-[3px_3px_0_rgba(90,102,112,0.16)] backdrop-blur"
            >
              <span className="absolute -right-1 -top-1 h-2 w-2 border border-ink/15 bg-white/72" />
              <PixelFlower className="mx-auto" variant={index} />
              <p className="mt-1 truncate text-[10px] font-semibold leading-none text-ink/48">{badge.label}</p>
              <p className={`mt-1 truncate text-lg font-semibold leading-none ${badge.accent}`}>
                {badge.value}
                <span className="ml-0.5 text-[10px] font-semibold text-ink/42">{badge.unit}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="flex min-h-8 items-center justify-between gap-2 border-2 border-dim/70 bg-cream/86 px-3 text-[11px] font-semibold text-ink/58 shadow-[3px_3px_0_rgba(90,102,112,0.12)] backdrop-blur">
          <span className="shrink-0 text-bloom">最近一站</span>
          <span className="min-w-0 truncate text-right text-ink/70">
            {stats.latestCity} · {stats.latestDate}
          </span>
        </div>
      </div>
    </section>
  );
}

function PixelFlower({
  className,
  variant,
}: Readonly<{
  className?: string;
  variant: number;
}>) {
  const palette = [
    {
      petal: "var(--color-sakura)",
      petalDeep: "var(--color-bloom)",
      core: "var(--color-marigold)",
      leaf: "var(--color-mint)",
      leafDeep: "var(--color-leaf)",
    },
    {
      petal: "var(--color-sky-pale)",
      petalDeep: "var(--color-sky)",
      core: "var(--color-sunshine)",
      leaf: "var(--color-mint)",
      leafDeep: "var(--color-leaf)",
    },
    {
      petal: "var(--color-lavender)",
      petalDeep: "var(--color-dusk)",
      core: "var(--color-sakura)",
      leaf: "var(--color-mint)",
      leafDeep: "var(--color-leaf)",
    },
    {
      petal: "var(--color-sunlit)",
      petalDeep: "var(--color-ember)",
      core: "var(--color-bloom)",
      leaf: "var(--color-mint)",
      leafDeep: "var(--color-leaf)",
    },
  ][variant % 4];

  return (
    <svg
      className={`pixelated h-8 w-8 ${className ?? ""}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect x="6" y="25" width="20" height="3" fill="var(--color-dim)" opacity="0.5" />
      <rect x="15" y="17" width="3" height="9" fill={palette.leafDeep} />
      <rect x="11" y="22" width="5" height="3" fill={palette.leaf} />
      <rect x="18" y="20" width="5" height="3" fill={palette.leaf} />
      {variant % 4 === 0 && (
        <>
          <rect x="12" y="5" width="8" height="5" fill={palette.petal} />
          <rect x="8" y="10" width="6" height="7" fill={palette.petalDeep} />
          <rect x="18" y="10" width="6" height="7" fill={palette.petalDeep} />
          <rect x="12" y="17" width="8" height="5" fill={palette.petal} />
        </>
      )}
      {variant % 4 === 1 && (
        <>
          <rect x="13" y="4" width="6" height="6" fill={palette.petalDeep} />
          <rect x="7" y="9" width="6" height="6" fill={palette.petal} />
          <rect x="19" y="9" width="6" height="6" fill={palette.petal} />
          <rect x="10" y="16" width="5" height="5" fill={palette.petalDeep} />
          <rect x="17" y="16" width="5" height="5" fill={palette.petalDeep} />
        </>
      )}
      {variant % 4 === 2 && (
        <>
          <rect x="10" y="5" width="5" height="7" fill={palette.petal} />
          <rect x="17" y="5" width="5" height="7" fill={palette.petal} />
          <rect x="7" y="12" width="6" height="6" fill={palette.petalDeep} />
          <rect x="19" y="12" width="6" height="6" fill={palette.petalDeep} />
          <rect x="13" y="17" width="6" height="5" fill={palette.petal} />
        </>
      )}
      {variant % 4 === 3 && (
        <>
          <rect x="11" y="4" width="10" height="4" fill={palette.petalDeep} />
          <rect x="8" y="8" width="16" height="5" fill={palette.petal} />
          <rect x="7" y="13" width="18" height="5" fill={palette.petalDeep} />
          <rect x="11" y="18" width="10" height="4" fill={palette.petal} />
        </>
      )}
      <rect x="13" y="11" width="6" height="6" fill={palette.core} />
      <rect x="15" y="13" width="2" height="2" fill="var(--color-ink)" opacity="0.35" />
      <rect x="6" y="6" width="2" height="2" fill="white" opacity="0.72" />
      <rect x="24" y="7" width="2" height="2" fill="white" opacity="0.55" />
    </svg>
  );
}

export function ProgressBadge() {
  const progress = useProgress();

  return (
    <div className="ml-5 hidden items-center gap-2 rounded-[8px] border border-dim/90 bg-cream/70 px-4 py-2.5 text-sm text-ink/76 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur sm:flex">
      <Heart className="h-4 w-4 fill-sakura text-bloom" />
      <span>已点亮</span>
      <strong className="font-semibold text-bloom">{progress.provinceCount}</strong>
      <span>/ {TOTAL_PROVINCES} 省份</span>
    </div>
  );
}

export function LegendProgress({ compact = false }: Readonly<{ compact?: boolean }> = {}) {
  const progress = useProgress();

  return (
    <div
      className={`flex w-fit items-center border border-dim/80 bg-cream/70 text-sm text-ink/80 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur ${
        compact ? "gap-1.5 rounded-full px-2.5 py-1.5 text-xs" : "gap-3 rounded-[8px] px-5 py-3"
      }`}
    >
      <Heart className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} fill-sakura text-bloom`} />
      {compact ? (
        <span className="whitespace-nowrap">
          <strong className="font-semibold text-ink">{progress.provinceCount}</strong> / {TOTAL_PROVINCES}
        </span>
      ) : (
        <span>
          <strong className="font-semibold text-ink">{progress.provinceCount}</strong> /{" "}
          {TOTAL_PROVINCES} provinces explored
        </span>
      )}
    </div>
  );
}

export function StatsPanel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <aside className="hidden h-full w-[310px] shrink-0 flex-col overflow-y-auto border-l border-dashed border-dim px-7 py-7 lg:flex">
      <DateTimeCard />
      <WeatherCard />
      <TripGuidesCard />
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
  const { data } = useMemorySummary();

  const count = useMemo(() => {
    const localMemories = summaryToMemoryStore(data?.summary ?? {});
    const litCityIds = getLitCityIds(localMemories);

    return cities.filter((city) => city.provinceId === provinceId && litCityIds.has(city.id))
      .length;
  }, [data?.summary, provinceId]);

  return (
    <div className="hidden items-center gap-2 rounded-[8px] border border-dim/90 bg-cream/70 px-4 py-2.5 text-sm text-ink/76 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur sm:flex">
      <Heart className="h-4 w-4 fill-sakura text-bloom" />
      <strong className="font-semibold text-bloom">{count}</strong>
      <span>/ {total} cities</span>
    </div>
  );
}
