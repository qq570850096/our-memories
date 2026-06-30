"use client";

import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantConfig: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; accent: string }
> = {
  success: { icon: CheckCircle2, accent: "text-leaf" },
  error: { icon: XCircle, accent: "text-rose" },
  info: { icon: Info, accent: "text-sky" },
  warning: { icon: AlertCircle, accent: "text-rose-ink" },
};

/**
 * 全局 Toast Provider。在 layout.tsx 注入一次，子组件用 useToast() 触发通知。
 * 替代原生 alert() 与各页内联的临时状态浮层。
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 2600) => {
      const id = ++seq.current;
      setToasts((list) => [...list, { id, variant, message, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const cfg = variantConfig[t.variant];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex max-w-sm animate-[toast-enter_0.2s_ease-out] items-center gap-2.5 rounded-[8px] border border-dim/80 bg-cream px-4 py-3 shadow-[var(--shadow-card-strong)]"
            >
              <Icon className={`shrink-0 ${cfg.accent}`} size={18} />
              <span className="flex-1 text-sm text-ink">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-[6px] p-0.5 text-ink/40 transition hover:bg-dim/30 hover:text-ink"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** 触发全局 Toast 通知。必须在 ToastProvider 内使用。 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return ctx;
}
