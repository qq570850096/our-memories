"use client";

import Link from "next/link";
import { Calendar, Circle, Route } from "lucide-react";
import { useApi } from "@/lib/swr";
import { useDeferredReady } from "@/lib/useDeferredReady";

type TripGuide = {
  id: string;
  payload: {
    title: string;
    origin: string;
    destination: string;
    days: number;
    startDate?: string;
    endDate?: string;
    daysPlan: Array<{
      day: number;
      checkpoints: Array<{ name: string }>;
    }>;
  };
};

export default function TripGuidesCard() {
  const ready = useDeferredReady(1200);
  const { data } = useApi<{ guides: TripGuide[] }>("/api/v1/trip-guides", { enabled: ready });
  const guides = (data?.guides ?? []).slice(0, 2); // 只显示最近2个

  if (guides.length === 0) return null;

  return (
    <div className="mt-3 rounded-[8px] border border-dim/70 bg-cream/62 p-3 text-ink shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-sky" />
          <h3 className="text-sm font-semibold">旅行攻略</h3>
        </div>
        <Link
          href="/trips"
          className="text-xs text-ink/48 transition hover:text-sky"
        >
          查看全部 →
        </Link>
      </div>

      <div className="space-y-2">
        {guides.map((guide) => {
          const allCheckpoints = guide.payload.daysPlan.flatMap((day) => day.checkpoints);
          const totalCheckpoints = allCheckpoints.filter((cp) => cp.name).length;

          return (
            <Link
              key={guide.id}
              href={`/trips?id=${guide.id}`}
              className="group block rounded-[7px] border border-dim/60 bg-white/48 p-3 transition hover:border-sakura hover:bg-white/80"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="flex-1 truncate text-sm font-semibold leading-tight text-ink group-hover:text-bloom">
                  {guide.payload.title}
                </h4>
                <span className="text-xs text-ink/48">
                  {guide.payload.days}天
                </span>
              </div>

              {guide.payload.startDate && guide.payload.endDate && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-ink/58">
                  <Calendar className="h-3 w-3 text-sky" />
                  <span className="truncate">
                    {guide.payload.startDate} - {guide.payload.endDate}
                  </span>
                </div>
              )}

              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink/62">
                <Circle className="h-3 w-3 text-dim" />
                <span className="truncate">
                  {guide.payload.origin} → {guide.payload.destination}
                </span>
              </div>

              {totalCheckpoints > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dim/48">
                    <div
                      className="h-full rounded-full bg-sky"
                      style={{ width: "0%" }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-ink/48">
                    0/{totalCheckpoints}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
