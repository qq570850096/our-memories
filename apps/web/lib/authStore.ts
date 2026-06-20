type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
  };
  space?: {
    id: string;
    name: string;
    spaceCode?: string;
    slug: string;
  };
  membership?: {
    role: "owner" | "member";
  };
};

const sessionKey = "mapofus:session";
export const sessionScopeUpdatedEvent = "mapofus:session-scope-updated";

export type SessionScopeUpdateDetail = {
  previousScope: string;
  nextScope: string;
  clearPrevious: boolean;
};

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(sessionKey) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const session = parsed as Partial<StoredSession>;
    if (typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") return null;
    return session as StoredSession;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession) {
  const previousScope = sessionCacheScope();
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
  if (session.membership?.role === "owner") {
    window.sessionStorage.setItem("mapofus:admin-unlocked", "true");
  } else {
    window.sessionStorage.removeItem("mapofus:admin-unlocked");
  }
  window.dispatchEvent(new CustomEvent<boolean>("mapofus:admin-mode-updated", {
    detail: session.membership?.role === "owner",
  }));
  const nextScope = sessionCacheScope();
  if (previousScope !== nextScope) {
    window.dispatchEvent(new CustomEvent<SessionScopeUpdateDetail>(sessionScopeUpdatedEvent, {
      detail: { previousScope, nextScope, clearPrevious: false },
    }));
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  const previousScope = sessionCacheScope();
  window.localStorage.removeItem(sessionKey);
  window.sessionStorage.removeItem("mapofus:admin-unlocked");
  const nextScope = sessionCacheScope();
  if (previousScope !== nextScope) {
    window.dispatchEvent(new CustomEvent<SessionScopeUpdateDetail>(sessionScopeUpdatedEvent, {
      detail: { previousScope, nextScope, clearPrevious: true },
    }));
  }
}

export function updateAccessToken(accessToken: string) {
  const session = readSession();
  if (!session) return;
  writeSession({ ...session, accessToken });
}

export function hasOwnerRole() {
  return readSession()?.membership?.role === "owner";
}

export function sessionCacheScope() {
  const session = readSession();
  const spaceID = session?.space?.id ?? session?.space?.spaceCode ?? session?.space?.slug;
  const userID = session?.user?.id ?? session?.user?.username;
  if (!spaceID || !userID) return "anonymous";
  return `${spaceID}:${userID}`;
}
