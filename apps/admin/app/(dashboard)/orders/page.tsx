"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiGet, apiPost } from "@/lib/api";
import { CheckCircle } from "lucide-react";

interface Order {
  id: string;
  spaceId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paidAt: string;
  createdAt: string;
  spaceCode: string;
  spaceName: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const { data, mutate } = useSWR<OrdersResponse>(
    `/api/v1/admin/orders?page=${page}&pageSize=20&status=${status}`,
    apiGet
  );

  const handleConfirmOrder = async (orderId: string) => {
    if (!confirm("确认标记此订单为已付款？")) return;
    try {
      await apiPost(`/api/v1/admin/orders/${orderId}/confirm`);
      mutate();
      alert("订单已确认");
    } catch (err) {
      alert("操作失败");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          订单管理
        </h1>
        <p className="text-[var(--muted-foreground)] mt-2">
          查看和处理付费订单
        </p>
      </div>

      {/* Filter */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="paid">已支付</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                订单号
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                空间
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                金额
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                状态
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                创建时间
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-[var(--foreground)]">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data?.orders.map((order) => (
              <tr key={order.id} className="hover:bg-[var(--muted)]">
                <td className="px-6 py-4 text-sm font-mono text-xs">
                  {order.id.substring(0, 12)}...
                </td>
                <td className="px-6 py-4 text-sm">
                  <div>
                    <div className="font-medium">{order.spaceName}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {order.spaceCode}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-semibold">
                  ¥{order.amount.toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      order.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : order.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {order.status === "paid"
                      ? "已支付"
                      : order.status === "pending"
                      ? "待处理"
                      : "已取消"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-[var(--muted-foreground)]">
                  {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                </td>
                <td className="px-6 py-4">
                  {order.status === "pending" && (
                    <button
                      onClick={() => handleConfirmOrder(order.id)}
                      className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
                    >
                      <CheckCircle size={16} />
                      确认支付
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <div className="text-sm text-[var(--muted-foreground)]">
              共 {data.total} 个订单
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
                disabled={!data || data.orders.length < data.pageSize}
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
