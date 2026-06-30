"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarDays,
  Heart,
  NotebookPen,
  Map as MapIcon,
  MessageCircle,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

const githubUrl = "https://github.com/qq570850096/our-memories";

export type MemoryNavKey = "map" | "memories" | "favorites" | "anniversaries" | "capsule" | "whispers";

const navItems = [
  { key: "map", label: "地图", icon: MapIcon, href: "/map" },
  { key: "memories", label: "回忆记录", icon: BookOpen, href: "/memories" },
  { key: "anniversaries", label: "纪念日", icon: CalendarDays, href: "/anniversaries" },
  { key: "favorites", label: "双人日记", icon: NotebookPen, href: "/favorites" },
  { key: "whispers", label: "悄悄话", icon: MessageCircle, href: "/whispers" },
  { key: "capsule", label: "时光宝盒", icon: Archive, href: "/time-capsule" },
] satisfies Array<{
  key: MemoryNavKey;
  label: string;
  icon: typeof MapIcon;
  href: string;
}>;

const mainNavKeys: MemoryNavKey[] = ["map", "memories", "anniversaries"];
const moreNavKeys: MemoryNavKey[] = ["whispers", "favorites", "capsule"];

function MobileBottomNav({
  active,
  moreOpen,
  onToggleMore,
  onCloseMore,
}: Readonly<{
  active: MemoryNavKey;
  moreOpen: boolean;
  onToggleMore: () => void;
  onCloseMore: () => void;
}>) {
  const mainItems = navItems.filter((item) => mainNavKeys.includes(item.key));
  const moreItems = navItems.filter((item) => moreNavKeys.includes(item.key));
  const moreSelected = moreItems.some((item) => item.key === active);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-dim/72 bg-cream/96 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-16px_36px_rgba(90,102,112,0.12)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 items-end gap-1">
        {mainItems.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;

          return (
            <Link
              key={item.key}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] px-2 text-[11px] font-semibold transition active:scale-[0.98] ${
                selected
                  ? "bg-sakura/72 text-rose-ink"
                  : "text-ink/58 hover:bg-white/58 focus-visible:bg-white/70"
              }`}
              href={item.href}
              onClick={onCloseMore}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label === "回忆记录" ? "回忆" : item.label}</span>
            </Link>
          );
        })}

        <button
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] px-2 text-[11px] font-semibold transition active:scale-[0.98] ${
            moreOpen || moreSelected
              ? "bg-sakura/72 text-rose-ink"
              : "text-ink/58 hover:bg-white/58 focus-visible:bg-white/70"
          }`}
          type="button"
          onClick={onToggleMore}
          aria-expanded={moreOpen}
          aria-controls="memory-mobile-more"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>更多</span>
        </button>
      </div>

      {moreOpen && (
        <>
          <button
            className="fixed inset-0 z-0 cursor-default"
            type="button"
            onClick={onCloseMore}
            aria-label="关闭更多导航"
          />
          <div
            id="memory-mobile-more"
            className="absolute bottom-[calc(100%+0.5rem)] left-3 right-3 z-10 mx-auto grid max-w-md grid-cols-2 gap-2 rounded-[8px] border border-dim/82 bg-cream/97 p-2 shadow-[0_18px_44px_rgba(90,102,112,0.16)] backdrop-blur-xl"
          >
            {moreItems.map((item) => {
              const Icon = item.icon;
              const selected = item.key === active;

              return (
                <Link
                  key={item.key}
                  className={`flex min-h-12 items-center gap-3 rounded-[8px] px-3 text-sm font-semibold transition active:scale-[0.99] ${
                    selected
                      ? "bg-sakura/72 text-rose-ink"
                      : "text-ink/68 hover:bg-white/60"
                  }`}
                  href={item.href}
                  onClick={onCloseMore}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}

export function MemorySidebar({ active }: Readonly<{ active: MemoryNavKey }>) {
  return (
    <aside className="hidden min-h-screen w-[260px] shrink-0 border-r border-dim/78 bg-cream/78 px-5 py-8 shadow-[12px_0_34px_rgba(90,102,112,0.04)] backdrop-blur lg:block">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center">
          <Heart className="h-10 w-10 fill-sakura text-bloom" />
        </div>
        <p className="mt-2 text-lg font-semibold text-ink">我们的回忆</p>
        <p className="mt-1 text-xs text-ink/52">只属于两个人的回忆</p>
      </div>

      <nav className="mt-10 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = item.key === active;

          return (
            <Link
              key={item.key}
              className={`flex w-full items-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-medium transition ${
                selected
                  ? "border-sakura bg-sakura/52 text-bloom"
                  : "border-transparent text-ink/72 hover:border-dim hover:bg-cream"
              }`}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-10 rounded-[8px] border border-dim/72 bg-cream/72 p-4 text-sm leading-7 text-ink/62 shadow-[0_12px_26px_rgba(90,102,112,0.05)]">
        在线优先版本会把回忆、照片和 AI 草稿保存到你的后端空间。
        <Heart className="ml-1 inline h-3.5 w-3.5 fill-sakura text-bloom" />
      </div>

      <div className="mt-4 rounded-[8px] border border-dim/72 bg-cream/72 p-4 shadow-[0_12px_26px_rgba(90,102,112,0.05)]">
        <div className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 fill-sakura text-bloom" />
          <p className="text-xs font-semibold text-ink">关于这份地图</p>
        </div>
        <p className="mt-2 text-xs leading-6 text-ink/60">
          一期为私密双人空间，后续可用开通码扩展给其它情侣。
        </p>

        <div className="mt-3 border-t border-dim/54 pt-3">
          <p className="text-[11px] font-semibold text-ink/48">开源项目</p>
          <a
            className="mt-1.5 flex items-center justify-center gap-1.5 rounded-[7px] border border-sakura bg-sakura/40 px-3 py-2 text-xs font-semibold text-bloom transition hover:bg-sakura/70"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Star className="h-3.5 w-3.5" />
            GitHub
          </a>
          <p className="mt-1.5 select-text text-[11px] leading-5 text-ink/55">
            github.com/qq570850096/our-memories
          </p>
        </div>
      </div>
    </aside>
  );
}

export function MemoryPageShell({
  active,
  children,
}: Readonly<{
  active: MemoryNavKey;
  children: ReactNode;
}>) {
  const navRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // 滚动到选中的导航项
    if (navRef.current) {
      const selectedItem = navRef.current.querySelector('[data-selected="true"]');
      if (selectedItem) {
        selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [active]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream text-ink">
      <div className="map-mist-band" aria-hidden="true" />
      <span className="absolute left-[38%] top-[9%] h-2 w-2 bg-sakura" aria-hidden="true" />
      <span className="absolute right-[17%] top-[15%] h-2 w-2 bg-mist" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen">
        <MemorySidebar active={active} />
        <section className="memory-page-content min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-10 sm:py-8 lg:pb-8">
          <PageTransition>
            {children}
          </PageTransition>
        </section>
      </div>

      <MobileBottomNav
        active={active}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((current) => !current)}
        onCloseMore={() => setMoreOpen(false)}
      />
    </main>
  );
}

export function MapPageShell({ children }: Readonly<{ children: ReactNode }>) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {children}

      <MobileBottomNav
        active="map"
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((current) => !current)}
        onCloseMore={() => setMoreOpen(false)}
      />
    </>
  );
}
