"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { apiBaseUrl, refreshAccessToken } from "@/lib/apiClient";
import { useAuth } from "@/lib/authContext";
import { readSession } from "@/lib/authStore";

export type RealtimeEvent = {
  type: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
};

type RealtimeEventHandler = (event: RealtimeEvent) => void;
type RealtimeOutgoingEvent = Pick<RealtimeEvent, "type" | "targetId" | "metadata">;

let activeSocket: WebSocket | null = null;
const realtimeListeners = new Set<RealtimeEventHandler>();

function wsBaseUrl() {
  const base = apiBaseUrl();
  if (!base && typeof window !== "undefined") {
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  }
  return base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function shouldRefreshMemories(event: RealtimeEvent) {
  return event.type.startsWith("memory.") || event.targetType === "memory";
}

function shouldRefreshTimeCapsules(event: RealtimeEvent) {
  return event.type.startsWith("time_capsule.") || event.targetType === "time_capsule";
}

function shouldRefreshAnniversaries(event: RealtimeEvent) {
  return event.type.startsWith("anniversary.") || event.targetType === "anniversary";
}

function shouldRefreshSignals(event: RealtimeEvent) {
  return event.type.startsWith("signal.") || event.targetType === "signal";
}

function tokenExpiresSoon(token: string) {
  try {
    const encoded = token.split(".")[1] ?? "";
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 - Date.now() < 60_000;
  } catch {
    return true;
  }
}

export function sendRealtimeEvent(event: RealtimeOutgoingEvent) {
  if (typeof WebSocket === "undefined" || activeSocket?.readyState !== WebSocket.OPEN) {
    return false;
  }
  activeSocket.send(JSON.stringify(event));
  return true;
}

export function useRealtimeEvents(handler: RealtimeEventHandler) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: RealtimeEvent) => handlerRef.current(event);
    realtimeListeners.add(listener);
    return () => {
      realtimeListeners.delete(listener);
    };
  }, []);
}

export function useWebSocket() {
  const { session } = useAuth();
  const { mutate } = useSWRConfig();
  const retryRef = useRef(0);

  useEffect(() => {
    if (!session?.accessToken || typeof window === "undefined") return;

    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;

    const connect = async () => {
      if (closed) return;
      if (tokenExpiresSoon(readSession()?.accessToken ?? session.accessToken)) {
        await refreshAccessToken();
      }
      const token = readSession()?.accessToken ?? session.accessToken;
      if (!token || closed) return;
      const url = `${wsBaseUrl()}/api/v1/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        activeSocket = socket;
        retryRef.current = 0;
      };

      socket.onmessage = (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(message.data || "{}")) as RealtimeEvent;
        } catch {
          return;
        }
        realtimeListeners.forEach((listener) => listener(event));
        void mutate("/notifications");
        if (shouldRefreshMemories(event)) {
          void mutate((key) => typeof key === "string" && key.startsWith("/memories"));
        }
        if (shouldRefreshTimeCapsules(event)) {
          void mutate((key) => typeof key === "string" && key.startsWith("/time-capsules"));
        }
        if (shouldRefreshAnniversaries(event)) {
          void mutate("/anniversary-cards");
        }
        if (shouldRefreshSignals(event)) {
          void mutate("/signals");
        }
      };

      socket.onclose = () => {
        if (activeSocket === socket) activeSocket = null;
        if (closed) return;
        const attempt = Math.min(retryRef.current + 1, 6);
        retryRef.current = attempt;
        retryTimer = window.setTimeout(connect, Math.min(30000, 750 * 2 ** attempt));
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (activeSocket === socket) activeSocket = null;
      socket?.close();
    };
  }, [mutate, session?.accessToken]);
}
