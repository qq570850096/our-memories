"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { RefreshCw } from "lucide-react";
import { pullRefreshEvent } from "@/lib/refresh";

const threshold = 72;
const maxPull = 104;

export function PullToRefresh() {
  const { mutate } = useSWRConfig();
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const canStartFrom = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.closest("[data-pull-refresh-ignore='true']")) return false;
      if (target.closest("input, textarea, select")) return false;
      return window.scrollY <= 0;
    };

    const finishRefresh = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      window.dispatchEvent(new CustomEvent(pullRefreshEvent));
      try {
        await mutate((key) => typeof key === "string");
      } finally {
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          pullRef.current = 0;
          setPull(0);
        }, 360);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || !canStartFrom(event.target)) return;
      startYRef.current = event.touches[0]?.clientY ?? null;
      pullRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current == null || window.scrollY > 0) return;
      const y = event.touches[0]?.clientY;
      if (y == null) return;
      const distance = y - startYRef.current;
      if (distance <= 0) return;

      if (distance > 8) event.preventDefault();
      const nextPull = Math.min(maxPull, distance * 0.52);
      pullRef.current = nextPull;
      setPull(nextPull);
    };

    const onTouchEnd = () => {
      startYRef.current = null;
      if (pullRef.current >= threshold) {
        void finishRefresh();
        return;
      }
      pullRef.current = 0;
      setPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mutate]);

  const visible = pull > 0 || refreshing;
  const armed = pull >= threshold;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border border-dim/80 bg-cream/95 px-3 py-2 text-xs font-semibold text-ink shadow-[0_10px_28px_rgba(90,102,112,0.16)] backdrop-blur transition ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ transform: `translate(-50%, ${Math.max(0, pull - 28)}px)` }}
      aria-hidden={!visible}
    >
      <RefreshCw className={`h-4 w-4 text-sky ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "刷新中" : armed ? "释放刷新" : "下拉刷新"}
    </div>
  );
}
