"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeClass: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /** 是否显示右上关闭按钮，默认显示。 */
  showClose?: boolean;
  /** 底部操作区（按钮等）。 */
  footer?: ReactNode;
  /** 点击遮罩是否关闭，默认 true。 */
  closeOnOverlay?: boolean;
  children: ReactNode;
}

/**
 * 居中模态框。framer-motion 淡入缩放，ESC 关闭，遮罩点击关闭，
 * 打开时锁定背景滚动。替代散落各页的手写 `fixed inset-0 z-50` 模态。
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  showClose = true,
  footer,
  closeOnOverlay = true,
  children,
}: Readonly<ModalProps>) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset);
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      setKeyboardInset(0);
    };
  }, [open]);

  const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("input, textarea, select")) return;
    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }, 80);
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center px-4"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: `max(1rem, calc(env(safe-area-inset-bottom) + ${keyboardInset}px))`,
          }}
        >
          <motion.div
            className="absolute inset-0 bg-ink/28 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeOnOverlay ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative w-full ${sizeClass[size]} max-h-[88dvh] overflow-y-auto rounded-[12px] border border-dim/80 bg-cream shadow-[var(--shadow-popover)]`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={handleFocusCapture}
          >
            {(title || showClose) && (
              <div className="flex items-start justify-between gap-3 border-b border-dim/70 px-5 py-4">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-lg font-semibold text-ink">{title}</h2>
                  )}
                  {description && (
                    <p className="mt-1 text-sm text-ink/60">{description}</p>
                  )}
                </div>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-[6px] p-1.5 text-ink/50 transition hover:bg-dim/30 hover:text-ink"
                    aria-label="关闭"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}

            <div className="px-5 py-4">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-dim/70 bg-cream/60 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
