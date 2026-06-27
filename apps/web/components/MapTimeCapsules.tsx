"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import { useApi } from "@/lib/swr";
import { daysUntil } from "@/lib/dateFormat";
import { useDeferredReady } from "@/lib/useDeferredReady";

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  createdAt: string;
};

export function MapTimeCapsules() {
  const ready = useDeferredReady(900);
  const { data } = useApi<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules", { enabled: ready });
  const capsules = useMemo(
    () =>
      (data?.timeCapsules ?? [])
        .filter((capsule) => daysUntil(capsule.openDate) > 0)
        .slice(0, 3),
    [data?.timeCapsules],
  );

  if (capsules.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] left-3 right-3 z-30 flex gap-2 overflow-x-auto pb-2 lg:hidden">
      {capsules.map((cap, index) => {
        const days = daysUntil(cap.openDate);
        return (
          <div
            key={cap.id}
            className="relative flex h-12 w-32 shrink-0 items-center justify-center rounded-full border-2 border-bloom bg-gradient-to-r from-sakura to-bloom px-4 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <Lock className="absolute left-3 h-4 w-4 text-white/80" />
            <div className="ml-2 text-center">
              <p className="text-xs font-bold text-white">{days}天</p>
              <p className="text-[10px] text-white/90">后开启</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
