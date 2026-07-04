"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, X } from "lucide-react";
import { useApi } from "@/lib/swr";
import { useAuth } from "@/lib/authContext";
import {
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notifications";

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function NotificationBell() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useApi<{ notifications: NotificationItem[] }>("/notifications", {
    enabled: Boolean(session),
    refreshInterval: open ? 15000 : 0,
  });
  const notifications = useMemo(() => data?.notifications ?? [], [data?.notifications]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);
  if (!session) return null;

  const markRead = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markNotificationRead(item.id);
      await mutate();
    }
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await mutate();
  };

  return (
    <>
      <button
        type="button"
        className="fixed right-4 top-4 z-[70] grid h-11 w-11 place-items-center rounded-[8px] border border-dim/80 bg-cream/92 text-ink shadow-[var(--shadow-card)] backdrop-blur transition hover:border-sky hover:text-sky"
        aria-label="通知"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose shadow-[0_0_0_4px_rgba(216,111,130,0.14)]" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[75] bg-slate/18 backdrop-blur-[2px]"
              aria-label="关闭通知"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="fixed bottom-0 right-0 top-auto z-[80] max-h-[78vh] w-full overflow-hidden rounded-t-[8px] border border-dim/80 bg-cream shadow-[var(--shadow-sheet)] sm:bottom-auto sm:right-4 sm:top-16 sm:max-h-[min(620px,calc(100vh-5rem))] sm:w-[360px] sm:rounded-[8px] sm:shadow-[var(--shadow-popover)]"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between border-b border-dim/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">通知</p>
                  <p className="mt-0.5 text-xs text-ink/52">{unreadCount > 0 ? `${unreadCount} 条未读` : "没有未读"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-[7px] text-ink/56 transition hover:bg-dim/36 hover:text-ink disabled:opacity-35"
                    aria-label="全部已读"
                    disabled={unreadCount === 0}
                    onClick={markAllRead}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-[7px] text-ink/56 transition hover:bg-dim/36 hover:text-ink"
                    aria-label="关闭"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(78vh-64px)] overflow-y-auto p-2 sm:max-h-[calc(min(620px,100vh-5rem)-64px)]">
                {notifications.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-ink/52">暂无通知</div>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`mb-1 w-full rounded-[8px] border px-3 py-3 text-left transition ${
                        item.isRead
                          ? "border-transparent text-ink/62 hover:bg-dim/22"
                          : "border-sakura/80 bg-sakura/24 text-ink hover:bg-sakura/34"
                      }`}
                      onClick={() => markRead(item)}
                    >
                      <div className="flex items-start gap-2">
                        {!item.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.title}</p>
                          {item.body && <p className="mt-1 text-xs leading-5 text-ink/58">{item.body}</p>}
                          <p className="mt-2 text-[11px] text-ink/42">{formatNotificationTime(item.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
