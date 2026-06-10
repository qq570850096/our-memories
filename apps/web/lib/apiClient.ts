import { clearSession, readSession, updateAccessToken, writeSession } from "@/lib/authStore";

const defaultApiBaseUrl = "http://localhost:8080";

export const apiBaseUrl = () => {
  const envValue = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envValue) return envValue.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { MAP_OF_US_API_BASE_URL?: string }).MAP_OF_US_API_BASE_URL;
    if (injected) return injected.replace(/\/$/, "");
  }
  return defaultApiBaseUrl;
};

type ApiOptions = RequestInit & {
  auth?: boolean;
  retry?: boolean;
};

function apiPath(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  if (path === "/health" || path.startsWith("/api/")) return path;
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function makeHeaders(headers?: HeadersInit, auth = true, body?: BodyInit | null) {
  const next = new Headers(headers);
  if (!next.has("Content-Type") && !(body instanceof FormData)) {
    next.set("Content-Type", "application/json");
  }
  const token = auth ? readSession()?.accessToken : null;
  if (token) next.set("Authorization", `Bearer ${token}`);
  return next;
}

async function refreshAccessToken() {
  const session = readSession();
  if (!session?.refreshToken) return false;
  const response = await fetch(`${apiBaseUrl()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => null);
  if (!response?.ok) return false;
  const data = (await response.json().catch(() => null)) as { accessToken?: string } | null;
  if (!data?.accessToken) return false;
  updateAccessToken(data.accessToken);
  return true;
}

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const { auth = true, retry = true, ...init } = options;
  const normalizedPath = apiPath(path);
  const url = /^https?:\/\//.test(normalizedPath) ? normalizedPath : `${apiBaseUrl()}${normalizedPath}`;
  const response = await fetch(url, {
    ...init,
    headers: makeHeaders(init.headers, auth, init.body),
    cache: init.cache ?? "no-store",
  });

  if (response.status === 401 && auth && retry && (await refreshAccessToken())) {
    return apiFetch(path, { ...options, retry: false });
  }

  if (response.status === 401) clearSession();
  return response;
}

export async function apiJson<T>(path: string, options: ApiOptions = {}) {
  const response = await apiFetch(path, options);
  if (!response.ok) throw new Error(`API ${path} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function login(spaceCode: string, password: string, userId = "me") {
  const response = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ spaceCode, password, userId }),
  });
  if (!response.ok) return false;
  const session = (await response.json().catch(() => null)) as Parameters<typeof writeSession>[0] | null;
  if (!session?.accessToken || !session.refreshToken) return false;
  writeSession(session);
  return true;
}

export async function logout() {
  await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
  clearSession();
}
