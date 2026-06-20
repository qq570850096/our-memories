"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getSession } from "@/lib/api";
import { LayoutDashboard, Users, Package, DollarSign, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/spaces", label: "空间管理", icon: Package },
  { href: "/users", label: "用户管理", icon: Users },
  { href: "/orders", label: "订单管理", icon: DollarSign },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const nextSession = getSession();
    setSession(nextSession);
    setIsCheckingSession(false);
    if (!nextSession) router.push("/login");
  }, [router]);

  const handleLogout = () => {
    logout();
  };

  if (isCheckingSession || !session) return null;

  return (
    <div className="min-h-screen flex bg-[var(--muted)]">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col">
        <div className="p-6 border-b border-[var(--border)]">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Our Memories
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">管理后台</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? "bg-[var(--secondary)] text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                }`}
              >
                <Icon size={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="flex-1">
              <div className="font-medium text-[var(--foreground)]">
                {session.admin.displayName}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                @{session.admin.username}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition"
          >
            <LogOut size={20} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
