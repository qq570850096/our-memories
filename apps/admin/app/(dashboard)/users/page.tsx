"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiGet } from "@/lib/api";
import { Search } from "lucide-react";

interface User {
  id: string;
  spaceId: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  spaceCode: string;
  spaceName: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data } = useSWR<UsersResponse>(
    `/api/v1/admin/users?page=${page}&pageSize=20&search=${search}`,
    apiGet
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          用户管理
        </h1>
        <p className="text-[var(--muted-foreground)] mt-2">
          查看和管理所有用户
        </p>
      </div>

      {/* Search */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            size={18}
          />
          <input
            type="text"
            placeholder="搜索用户名、显示名或空间码..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                用户名
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                显示名
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                角色
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                所属空间
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                创建时间
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.users.map((user) => (
              <tr key={user.id} className="hover:bg-[var(--muted)]">
                <td className="px-6 py-4 text-sm">{user.username}</td>
                <td className="px-6 py-4 text-sm">{user.displayName}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      user.role === "owner"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {user.role === "owner" ? "拥有者" : "成员"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <div>
                    <div className="font-medium">{user.spaceName}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {user.spaceCode}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-[var(--muted-foreground)]">
                  {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <div className="text-sm text-[var(--muted-foreground)]">
              共 {data.total} 个用户
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
                disabled={!data || data.users.length < data.pageSize}
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
