import { apiJson } from "@/lib/apiClient";

export type NotificationItem = {
  id: string;
  spaceId: string;
  userId: string;
  type: string;
  targetType?: string;
  targetId?: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export async function fetchNotifications() {
  const response = await apiJson<{ notifications: NotificationItem[] }>("/notifications");
  return response.notifications ?? [];
}

export async function markNotificationRead(id: string) {
  await apiJson<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  await apiJson<{ ok: boolean }>("/notifications/read-all", { method: "PATCH" });
}
