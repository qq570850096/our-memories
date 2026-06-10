import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronUp,
  Heart,
  Map as MapIcon,
  MoreHorizontal,
  Route,
  Settings,
} from "lucide-react";
import ChinaMap, { SouthChinaSeaInset } from "@/components/ChinaMap";
import BackToLoginButton from "@/components/BackToLoginButton";
import { LegendProgress, ProgressBadge, StatsPanel, TogetherDaysBadge } from "@/components/HomeProgress";
import RandomPhotoCard from "@/components/RandomPhotoCard";

function BrandMark() {
  return (
    <svg className="h-8 w-8 shrink-0 pixelated sm:h-11 sm:w-11" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M5 3h4v2h2V3h4v2h2v6h-2v2h-2v2h-2v2H9v-2H7v-2H5v-2H3V5h2z"
        fill="#F5DCE0"
      />
      <path
        d="M5 3h4v2H5v6H3V5h2zm10 0v2h2v6h-2V5h-4V3zm0 8v2h-2v2h-2v2H9v-2H7v-2H5v-2h2v2h2v2h2v-2h2v-2z"
        fill="#E8B8C2"
      />
      <path d="M7 5h2v2H7zm8 2h-2V5h2z" fill="#FAFBF7" />
    </svg>
  );
}

function Cloud({
  src,
  className,
}: Readonly<{
  src: string;
  className: string;
}>) {
  return (
    <Image
      className={`pointer-events-none absolute pixelated opacity-24 ${className}`}
      src={src}
      alt=""
      width={132}
      height={54}
      priority
      unoptimized
    />
  );
}

function PixelSparkle({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={`pointer-events-none absolute h-4 w-4 opacity-75 ${className}`}
      aria-hidden="true"
    >
      <span className="absolute left-1.5 top-0 h-1.5 w-1.5 bg-[#D4E8D0]" />
      <span className="absolute left-1.5 bottom-0 h-1.5 w-1.5 bg-[#D4E8D0]" />
      <span className="absolute left-0 top-1.5 h-1.5 w-1.5 bg-[#D4E8D0]" />
      <span className="absolute right-0 top-1.5 h-1.5 w-1.5 bg-[#D4E8D0]" />
    </span>
  );
}

function Legend({ compact = false }: Readonly<{ compact?: boolean }>) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#5A6670]/72">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DDD8]/70 bg-white/46 px-2.5 py-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] border border-[#E8B8C2] bg-[#F5DCE0]" />
          已点亮
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DDD8]/70 bg-white/46 px-2.5 py-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] border border-[#C8CEC8] bg-[#D8DDD8]/55" />
          未点亮
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="w-fit rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/70 px-5 py-4 text-sm text-[#5A6670]/78 shadow-[0_10px_28px_rgba(90,102,112,0.08)] backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-[2px] border border-[#E8B8C2] bg-[#F5DCE0] shadow-[0_0_10px_rgba(232,184,194,0.42)]" />
          <span>已点亮</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-4 w-4 rounded-[2px] border border-[#C8CEC8] bg-[#D8DDD8]/55" />
          <span>未点亮</span>
        </div>
      </div>
      <LegendProgress />
    </div>
  );
}

function MobileMapDock() {
  return (
    <details className="group fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.6rem)] z-40 overflow-hidden rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/90 shadow-[0_18px_44px_rgba(90,102,112,0.14)] backdrop-blur-xl lg:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 pl-14 sm:pl-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#5A6670]">地图信息</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <LegendProgress compact />
          <span className="grid h-7 w-7 place-items-center rounded-full border border-[#D8DDD8]/70 bg-white/42 text-[#5A6670]/52 transition group-open:rotate-180">
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </span>
      </summary>
      <div className="grid max-h-[30dvh] grid-cols-[auto_minmax(0,1fr)] gap-2 overflow-y-auto border-t border-[#D8DDD8]/64 px-3 py-2">
        <SouthChinaSeaInset compact />
        <div className="min-w-0 self-center">
          <Legend compact />
        </div>
      </div>
    </details>
  );
}

function MobilePrimaryNav() {
  const items = [
    { label: "地图", icon: MapIcon, href: "/map", active: true },
    { label: "回忆", icon: BookOpen, href: "/memories", active: false },
    { label: "攻略", icon: Route, href: "/trips", active: false },
    { label: "纪念日", icon: CalendarDays, href: "/anniversaries", active: false },
  ];
  const moreItems = [
    { label: "收藏", icon: Heart, href: "/favorites" },
    { label: "宝盒", icon: Archive, href: "/time-capsule", active: false },
    { label: "设置", icon: Settings, href: "/settings", active: false },
  ];

  return (
    <nav className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.65rem)] z-40 grid grid-cols-5 gap-1 rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/92 p-2 shadow-[0_18px_44px_rgba(90,102,112,0.14)] backdrop-blur-xl lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            className={`grid min-h-14 place-items-center rounded-[8px] px-1 py-1.5 text-[11px] font-semibold leading-none transition ${
              item.active
                ? "bg-[#F5DCE0] text-[#B85D70]"
                : "text-[#5A6670]/58 hover:bg-white/58 hover:text-[#5A6670]"
            }`}
            href={item.href}
            aria-label={item.label}
          >
            <Icon className="h-5 w-5" />
            <span className="mt-1 block max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
      <details className="group">
        <summary className="grid min-h-14 cursor-pointer list-none place-items-center rounded-[8px] px-1 py-1.5 text-[11px] font-semibold leading-none text-[#5A6670]/58 transition hover:bg-white/58 hover:text-[#5A6670] [&::-webkit-details-marker]:hidden">
          <MoreHorizontal className="h-5 w-5" />
          <span className="mt-1 block max-w-full truncate">更多</span>
        </summary>
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.65rem)] grid grid-cols-3 gap-2 rounded-[8px] border border-[#D8DDD8]/85 bg-[#FAFBF7]/94 p-2 shadow-[0_18px_44px_rgba(90,102,112,0.14)] backdrop-blur-xl">
          {moreItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                className="grid min-h-12 place-items-center rounded-[8px] px-2 py-2 text-xs font-semibold text-[#5A6670]/64 transition hover:bg-white/60 hover:text-[#5A6670]"
                href={item.href}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 block max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </details>
    </nav>
  );
}

export default function MapPage() {
  return (
    <main className="relative h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#FAFBF7] text-[#5A6670]">
      <div className="map-mist-band" aria-hidden="true" />
      <Cloud src="/sprites/decorations/cloud-medium.png" className="left-[18%] top-[12%] w-28" />
      <Cloud src="/sprites/decorations/cloud-large.png" className="left-[43%] top-[11%] w-36" />
      <Cloud src="/sprites/decorations/cloud-small.png" className="left-[7%] top-[61%] w-24" />
      <Cloud src="/sprites/decorations/cloud-small.png" className="right-[25%] top-[55%] w-24" />
      <Cloud src="/sprites/decorations/cloud-medium.png" className="bottom-[8%] right-[28%] w-24" />
      <PixelSparkle className="left-[7%] top-[22%]" />
      <PixelSparkle className="left-[19%] bottom-[16%]" />
      <PixelSparkle className="right-[24%] top-[42%]" />
      <span className="absolute left-[28%] bottom-[7%] h-2 w-2 bg-[#D4E8D0]" aria-hidden="true" />
      <span className="absolute right-[11%] top-[19%] h-2 w-2 bg-[#D6E8F0]" aria-hidden="true" />

      <div className="relative z-10 flex h-full">
        <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-9 sm:py-7">
          <header className="flex shrink-0 items-center justify-between gap-2 sm:items-start sm:gap-5">
            <div className="flex min-w-0 items-center gap-2.5 sm:items-start sm:gap-4">
              <BrandMark />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-tight tracking-normal text-[#5A6670] sm:text-[28px]">
                  我们的回忆
                </h1>
                <div className="mt-1 sm:hidden">
                  <TogetherDaysBadge compact />
                </div>
                <p className="mt-0.5 hidden text-sm font-medium text-[#5A6670]/62 sm:mt-1 sm:block sm:text-base">
                  我们的地图
                </p>
              </div>
              <ProgressBadge />
            </div>
            <BackToLoginButton />
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center pb-[10.5rem] pt-0 sm:pb-20 lg:pb-6">
            <ChinaMap
              className="mobile-map-shell -translate-y-8 sm:translate-y-0"
              width={1100}
              height={860}
            />
          </div>

          <RandomPhotoCard />

          <div className="absolute bottom-7 left-6 hidden flex-col gap-4 sm:left-9 lg:flex">
            <SouthChinaSeaInset />
            <Legend />
          </div>
          <MobileMapDock />
          <MobilePrimaryNav />
        </section>
        <StatsPanel>{null}</StatsPanel>
      </div>
    </main>
  );
}
