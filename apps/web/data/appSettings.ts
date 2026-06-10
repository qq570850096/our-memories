import { apiJson } from "@/lib/apiClient";
import { readSession } from "@/lib/authStore";

export const appSettingsStorageKey = "mapofus:settings";
export const appSettingsUpdatedEvent = "mapofus:settings-updated";

export type AppSettings = {
  loginPhotos?: Record<string, string>;
  loginPhotoTexts?: Record<string, LoginPhotoText>;
  anniversaryDate?: string;
  anniversaryLabel?: string;
  weatherCityIds?: string[];
  coupleLogo?: string;
};

export type LoginPhotoText = {
  city?: string;
  label?: string;
};

export const defaultAnniversaryDate = "2026.03.20";
export const defaultAnniversaryLabel = "我们在一起";
export const defaultWeatherCityIds = ["beijing", "shanghai", "guangzhou"];
export const maxWeatherCities = 3;
export const defaultCoupleLogo = "/logo/couple-logo-placeholder.svg";

const datePattern = /^(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})\s*日?$/;

const isValidLogo = (value: unknown): value is string =>
  typeof value === "string" && (value.startsWith("data:image/") || value.startsWith("/") || value.startsWith("https://"));

const cleanString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

export const normalizeAnniversaryDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = datePattern.exec(value.trim());
  if (!match) return undefined;

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) return undefined;

  return `${rawYear}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
};

export const normalizeAppSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const settings = value as AppSettings;
  const loginPhotos =
    settings.loginPhotos && typeof settings.loginPhotos === "object" && !Array.isArray(settings.loginPhotos)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotos).filter(([, photo]) => typeof photo === "string" && photo.length > 0),
        )
      : undefined;
  const loginPhotoTexts =
    settings.loginPhotoTexts && typeof settings.loginPhotoTexts === "object" && !Array.isArray(settings.loginPhotoTexts)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotoTexts).map(([key, value]) => {
            if (typeof value !== "object" || value === null || Array.isArray(value)) return [key, {}];
            const item = value as LoginPhotoText;
            return [
              key,
              {
                city: cleanString(item.city, 40),
                label: cleanString(item.label, 60),
              },
            ];
          }),
        )
      : undefined;
  const anniversaryDate = normalizeAnniversaryDate(settings.anniversaryDate);
  const weatherCityIds = Array.isArray(settings.weatherCityIds)
    ? settings.weatherCityIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, maxWeatherCities)
    : undefined;

  return {
    loginPhotos,
    loginPhotoTexts,
    anniversaryDate,
    anniversaryLabel: cleanString(settings.anniversaryLabel, 40),
    weatherCityIds: weatherCityIds && weatherCityIds.length > 0 ? weatherCityIds : undefined,
    coupleLogo: isValidLogo(settings.coupleLogo) ? settings.coupleLogo : undefined,
  };
};

export const readAppSettings = (): AppSettings => {
  if (typeof window === "undefined") return {};
  try {
    return normalizeAppSettings(JSON.parse(window.localStorage.getItem(appSettingsStorageKey) ?? "{}"));
  } catch {
    return {};
  }
};

export const writeAppSettings = (settings: AppSettings) => {
  const normalized = normalizeAppSettings(settings);
  window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<AppSettings>(appSettingsUpdatedEvent, { detail: normalized }));
  if (!readSession()) return;
  void apiJson<{ settings: AppSettings }>("/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: normalized }),
  }).catch(() => {});
};

export const syncAppSettings = async () => {
  if (!readSession()) return readAppSettings();

  const data = await apiJson<{ settings: AppSettings }>("/settings");
  const normalized = normalizeAppSettings(data.settings);
  window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<AppSettings>(appSettingsUpdatedEvent, { detail: normalized }));
  return normalized;
};
