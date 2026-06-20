"use client";

import useSWR from "swr";
import { apiGet } from "@/lib/api";
import { Activity, Users, Package, DollarSign } from "lucide-react";

interface Stats {
  totalSpaces: number;
  activeSpaces: number;
  lifetimeSpaces: number;
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
}

export default function DashboardPage() {
  const { data: stats, error } = useSWR<Stats>("/api/v1/admin/stats", apiGet);

  if (error) {
    return (
      <div className="text-center py-12 text-[var(--muted-foreground)]">
        加载失败
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-[var(--muted-foreground)]">
        加载中...
      </div>
    );
  }

  const cards = [
    {
      title: "总空间数",
      value: stats.totalSpaces,
      icon: Package,
      color: "text-blue-600",
    },
    {
      title: "活跃空间",
      value: stats.activeSpaces,
      icon: Activity,
      color: "text-green-600",
    },
    {
      title: "付费用户",
      value: stats.lifetimeSpaces,
      icon: DollarSign,
      color: "text-[var(--primary)]",
    },
    {
      title: "总用户数",
      value: stats.totalUsers,
      icon: Users,
      color: "text-purple-600",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          仪表盘
        </h1>
        <p className="text-[var(--muted-foreground)] mt-2">
          Our Memories 运营数据总览
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--muted-foreground)]">
                  {card.title}
                </span>
                <Icon className={card.color} size={20} />
              </div>
              <div className="text-3xl font-semibold text-[var(--foreground)]">
                {card.value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            收入统计
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted-foreground)]">
                总订单数
              </span>
              <span className="text-lg font-semibold">
                {stats.totalOrders}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted-foreground)]">
                总收入
              </span>
              <span className="text-lg font-semibold text-[var(--primary)]">
                ¥{stats.totalRevenue.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted-foreground)]">
                付费转化率
              </span>
              <span className="text-lg font-semibold">
                {stats.totalSpaces > 0
                  ? ((stats.lifetimeSpaces / stats.totalSpaces) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            快速操作
          </h2>
          <div className="space-y-3">
            <a
              href="/spaces"
              className="block px-4 py-3 bg-[var(--muted)] rounded-lg hover:bg-[var(--secondary)] transition text-sm"
            >
              查看所有空间
            </a>
            <a
              href="/users"
              className="block px-4 py-3 bg-[var(--muted)] rounded-lg hover:bg-[var(--secondary)] transition text-sm"
            >
              管理用户
            </a>
            <a
              href="/orders"
              className="block px-4 py-3 bg-[var(--muted)] rounded-lg hover:bg-[var(--secondary)] transition text-sm"
            >
              处理订单
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
