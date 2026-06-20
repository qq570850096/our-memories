"use client";

import Link from "next/link";
import { Calendar, Circle, Route } from "lucide-react";
import { useApi } from "@/lib/swr";

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
  const { data } = useApi<{ guides: TripGuide[] }>("/api/v1/trip-guides");
  const guides = (data?.guides ?? []).slice(0, 2); // 只显示最近2个

  if (guides.length === 0) return null;

  return (
    <div className="mt-3 rounded-[8px] border border-[#D8DDD8]/70 bg-[#FAFBF7]/62 p-3 text-[#5A6670] shadow-[0_10px_24px_rgba(90,102,112,0.05)]">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-[#A8C8DC]" />
          <h3 className="text-sm font-semibold">旅行攻略</h3>
        </div>
        <Link
          href="/trips"
          className="text-xs text-[#5A6670]/48 transition hover:text-[#A8C8DC]"
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
              className="group block rounded-[7px] border border-[#D8DDD8]/60 bg-white/48 p-3 transition hover:border-[#F5DCE0] hover:bg-white/80"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="flex-1 truncate text-sm font-semibold leading-tight text-[#5A6670] group-hover:text-[#E8B8C2]">
                  {guide.payload.title}
                </h4>
                <span className="text-xs text-[#5A6670]/48">
                  {guide.payload.days}天
                </span>
              </div>

              {guide.payload.startDate && guide.payload.endDate && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#5A6670]/58">
                  <Calendar className="h-3 w-3 text-[#A8C8DC]" />
                  <span className="truncate">
                    {guide.payload.startDate} - {guide.payload.endDate}
                  </span>
                </div>
              )}

              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#5A6670]/62">
                <Circle className="h-3 w-3 text-[#D8DDD8]" />
                <span className="truncate">
                  {guide.payload.origin} → {guide.payload.destination}
                </span>
              </div>

              {totalCheckpoints > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#D8DDD8]/48">
                    <div
                      className="h-full rounded-full bg-[#A8C8DC]"
                      style={{ width: "0%" }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-[#5A6670]/48">
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
