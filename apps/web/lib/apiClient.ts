import { clearSession, readSession, updateAccessToken, writeSession } from "@/lib/authStore";
import { clearApiCache } from "@/lib/apiCacheStorage";

const localApiBaseUrl = "http://localhost:8080";

export const apiBaseUrl = () => {
  const envValue = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envValue) return envValue.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { MAP_OF_US_API_BASE_URL?: string }).MAP_OF_US_API_BASE_URL;
    if (injected) return injected.replace(/\/$/, "");
    if (window.location.protocol === "http:" && /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)) {
      return localApiBaseUrl;
    }
  }
  return "";
};

type ApiOptions = RequestInit & {
  auth?: boolean;
  retry?: boolean;
};

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "PAYMENT_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "HTTP_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly path: string;

  constructor({
    code,
    status,
    path,
    message,
  }: {
    code: ApiErrorCode | string;
    status: number;
    path: string;
    message: string;
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.path = path;
  }
}

function apiPath(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  if (path === "/health" || path.startsWith("/api/")) return path;
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function apiCodeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 402) return "PAYMENT_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "SERVER_ERROR";
  return "HTTP_ERROR";
}

async function readApiErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.clone().json().catch(() => null)) as { error?: string; message?: string; code?: string } | null;
  }

  const text = await response.clone().text().catch(() => "");
  return text ? { error: text } : null;
}

export async function apiErrorFromResponse(response: Response, path: string) {
  const payload = await readApiErrorPayload(response);
  const message = payload?.error || payload?.message || `API ${path} failed (${response.status})`;

  return new ApiError({
    code: payload?.code ?? apiCodeForStatus(response.status),
    status: response.status,
    path,
    message,
  });
}

export async function throwApiError(response: Response, path: string): Promise<never> {
  throw await apiErrorFromResponse(response, path);
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

export async function refreshAccessToken() {
  const session = readSession();
  if (!session) return false;
  const response = await fetch(`${apiBaseUrl()}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: session.refreshToken ? JSON.stringify({ refreshToken: session.refreshToken }) : "{}",
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
    credentials: init.credentials ?? "include",
    headers: makeHeaders(init.headers, auth, init.body),
  }).catch(() => {
    throw new ApiError({
      code: "NETWORK_ERROR",
      status: 0,
      path,
      message: "网络连接失败，请稍后再试。",
    });
  });

  if (response.status === 401 && auth && retry && (await refreshAccessToken())) {
    return apiFetch(path, { ...options, retry: false });
  }

  if (response.status === 401) clearSession();
  return response;
}

export async function apiJson<T>(path: string, options: ApiOptions = {}) {
  const response = await apiFetch(path, options);
  if (!response.ok) await throwApiError(response, path);
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
  if (!session?.user || !session.space) return false;
  writeSession(session);
  return true;
}

export async function logout() {
  await apiFetch("/api/v1/auth/logout", { method: "POST", auth: false }).catch(() => null);
  clearApiCache();
  clearSession();
}
