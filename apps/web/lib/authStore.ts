export type StoredSession = {
  accessToken?: string;
  refreshToken?: string;
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

export const sessionKey = "mapofus:session";
const tokenSessionKey = "mapofus:session-tokens";
export const authSessionUpdatedEvent = "mapofus:session-updated";
export const sessionScopeUpdatedEvent = "mapofus:session-scope-updated";

export type SessionScopeUpdateDetail = {
  previousScope: string;
  nextScope: string;
  clearPrevious: boolean;
};

function dispatchSessionUpdated(session: StoredSession | null) {
  window.dispatchEvent(new CustomEvent<StoredSession | null>(authSessionUpdatedEvent, { detail: session }));
}

function readTokenSession(): Pick<StoredSession, "accessToken" | "refreshToken"> {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(tokenSessionKey) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const tokens = parsed as Partial<StoredSession>;
    return {
      accessToken: typeof tokens.accessToken === "string" ? tokens.accessToken : undefined,
      refreshToken: typeof tokens.refreshToken === "string" ? tokens.refreshToken : undefined,
    };
  } catch {
    return {};
  }
}

function writeTokenSession(session: StoredSession) {
  const tokens = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
  if (tokens.accessToken || tokens.refreshToken) {
    window.sessionStorage.setItem(tokenSessionKey, JSON.stringify(tokens));
  } else {
    window.sessionStorage.removeItem(tokenSessionKey);
  }
}

function publicSession(session: StoredSession): StoredSession {
  const publicFields = { ...session };
  delete publicFields.accessToken;
  delete publicFields.refreshToken;
  return publicFields;
}

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(sessionKey) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const session = parsed as Partial<StoredSession>;
    if (!session.user && !session.space) return null;
    return { ...(session as StoredSession), ...readTokenSession() };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession) {
  const previousScope = sessionCacheScope();
  writeTokenSession(session);
  window.localStorage.setItem(sessionKey, JSON.stringify(publicSession(session)));
  if (session.membership?.role === "owner") {
    window.sessionStorage.setItem("mapofus:admin-unlocked", "true");
  } else {
    window.sessionStorage.removeItem("mapofus:admin-unlocked");
  }
  window.dispatchEvent(new CustomEvent<boolean>("mapofus:admin-mode-updated", {
    detail: session.membership?.role === "owner",
  }));
  dispatchSessionUpdated(session);
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
  window.sessionStorage.removeItem(tokenSessionKey);
  window.sessionStorage.removeItem("mapofus:admin-unlocked");
  window.dispatchEvent(new CustomEvent<boolean>("mapofus:admin-mode-updated", { detail: false }));
  dispatchSessionUpdated(null);
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
