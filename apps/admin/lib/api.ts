const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const ADMIN_BASE_PATH = "/admin";
const adminUrl = (path: string) => `${ADMIN_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;

export interface AdminSession {
  token?: string;
  admin: {
    id: string;
    username: string;
    displayName: string;
  };
}

const SESSION_KEY = "admin_session";
const TOKEN_SESSION_KEY = "admin_session_token";

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AdminSession>;
  const admin = session.admin;
  return (
    !!admin &&
    typeof admin.id === "string" &&
    typeof admin.username === "string" &&
    typeof admin.displayName === "string"
  );
}

export function getSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored);
    if (isAdminSession(session)) {
      const token = sessionStorage.getItem(TOKEN_SESSION_KEY) || undefined;
      return { ...session, token };
    }
    clearSession();
    return null;
  } catch {
    clearSession();
    return null;
  }
}

export function setSession(session: AdminSession): void {
  if (session.token) {
    sessionStorage.setItem(TOKEN_SESSION_KEY, session.token);
  } else {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
  }
  const publicSession = { ...session };
  delete publicSession.token;
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicSession));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const session = getSession();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
  });

  if (response.status === 401) {
    clearSession();
    window.location.href = adminUrl("/login");
    throw new Error("Unauthorized");
  }

  return response;
}

export async function login(username: string, password: string): Promise<void> {
  const response = await apiFetch("/api/v1/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  const data = await response.json();
  setSession(data);
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/admin/logout", { method: "POST" }).catch(() => null);
  clearSession();
  window.location.href = adminUrl("/login");
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function apiDownload(
  path: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || "our-memories-backup.json",
  };
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await apiFetch(path, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
