"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiGet, apiPut } from "@/lib/api";
import { Search, Filter } from "lucide-react";

interface Space {
  id: string;
  spaceCode: string;
  name: string;
  status: string;
  tier: string;
  storageUsedBytes: number;
  createdAt: string;
}

interface SpacesResponse {
  spaces: Space[];
  total: number;
  page: number;
  pageSize: number;
}

export default function SpacesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const { data, error, mutate } = useSWR<SpacesResponse>(
    `/api/v1/admin/spaces?page=${page}&pageSize=20&search=${search}&status=${status}`,
    apiGet
  );

  const handleStatusChange = async (spaceId: string, newStatus: string) => {
    if (!confirm(`确认将空间状态改为 ${newStatus}？`)) return;
    try {
      await apiPut(`/api/v1/admin/spaces/${spaceId}/status`, { status: newStatus });
      mutate();
    } catch (err) {
      alert("操作失败");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          空间管理
        </h1>
        <p className="text-[var(--muted-foreground)] mt-2">
          管理所有用户空间
        </p>
      </div>

      {/* Filters */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
              size={18}
            />
            <input
              type="text"
              placeholder="搜索空间码或名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="">全部状态</option>
            <option value="active">活跃</option>
            <option value="suspended">已暂停</option>
            <option value="deleted">已删除</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                空间码
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                名称
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                状态
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                套餐
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                存储
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.spaces.map((space) => (
              <tr key={space.id} className="hover:bg-[var(--muted)]">
                <td className="px-6 py-4 text-sm">{space.spaceCode}</td>
                <td className="px-6 py-4 text-sm">{space.name}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      space.status === "active"
                        ? "bg-green-100 text-green-700"
                        : space.status === "suspended"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {space.status === "active"
                      ? "活跃"
                      : space.status === "suspended"
                      ? "暂停"
                      : "删除"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {space.tier === "lifetime" ? "终身版" : "免费版"}
                </td>
                <td className="px-6 py-4 text-sm">
                  {formatBytes(space.storageUsedBytes)}
                </td>
                <td className="px-6 py-4 text-sm">
                  <select
                    value={space.status}
                    onChange={(e) => handleStatusChange(space.id, e.target.value)}
                    className="text-xs px-2 py-1 border border-[var(--border)] rounded"
                  >
                    <option value="active">活跃</option>
                    <option value="suspended">暂停</option>
                    <option value="deleted">删除</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <div className="text-sm text-[var(--muted-foreground)]">
              共 {data.total} 个空间
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)] disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data || data.spaces.length < data.pageSize}
                className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)] disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
