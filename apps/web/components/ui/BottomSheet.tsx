"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** 占视口高度比例的吸附档位，默认半屏 + 全屏两档。 */
  snapPoints?: number[];
  /** 初始吸附档位索引，默认 0（半屏）。 */
  initialSnap?: number;
  /** 顶部标题栏内容（可选，渲染在手柄下方）。 */
  header?: ReactNode;
  /** 固定在底部的操作区，适合保存/取消等按钮。 */
  footer?: ReactNode;
  /** 内容滚动区的附加样式。 */
  contentClassName?: string;
  /** 抽屉容器的附加样式。 */
  sheetClassName?: string;
  children: ReactNode;
};

const DEFAULT_SNAP_POINTS = [0.48, 0.92];

/** 下拽超过该距离，或拖拽速度超过该阈值，即关闭。 */
const CLOSE_DRAG_PX = 80;
const CLOSE_VELOCITY = 500;

/**
 * 移动端底部抽屉。两档吸附（半屏 / 全屏），拖拽手柄发起，
 * 内容区原生滚动不与拖拽打架；下拽超阈值关闭。
 * 仅在移动端交互场景使用，桌面端不应渲染（由调用方用 useIsMobile 决定）。
 */
export function BottomSheet({
  open,
  onClose,
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = 0,
  header,
  footer,
  contentClassName = "",
  sheetClassName = "",
  children,
}: Readonly<BottomSheetProps>) {
  const dragControls = useDragControls();
  const [snapIndex, setSnapIndex] = useState(initialSnap);
  const sheetRef = useRef<HTMLDivElement>(null);

  // 每次打开重置到初始档位。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setSnapIndex(initialSnap), 0);
    return () => window.clearTimeout(timer);
  }, [open, initialSnap]);

  // ESC 关闭。
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 打开时锁定背景滚动。
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const snapHeight = snapPoints[snapIndex] ?? snapPoints[0];
  const snapVh = `${snapHeight * 100}dvh`;

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩：点击关闭 */}
          <motion.div
            className="fixed inset-0 z-[60] bg-ink/28 backdrop-blur-[2px] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.div
            ref={sheetRef}
            data-pull-refresh-ignore="true"
            className={`fixed inset-x-0 bottom-0 z-[60] flex max-h-[96dvh] flex-col rounded-t-[16px] border border-dim bg-cream shadow-[0_-18px_44px_rgba(90,102,112,0.18)] lg:hidden ${sheetClassName}`}
            style={{ height: snapVh, paddingBottom: "env(safe-area-inset-bottom)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_event, info) => {
              const viewport = window.innerHeight;
              // 下拽超阈值或速度够快 → 关闭。
              if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > CLOSE_VELOCITY) {
                onClose();
                return;
              }
              // 否则按拖拽方向吸附到相邻档位。
              if (info.offset.y < -viewport * 0.08 && snapIndex < snapPoints.length - 1) {
                setSnapIndex((index) => Math.min(index + 1, snapPoints.length - 1));
              } else if (info.offset.y > viewport * 0.08 && snapIndex > 0) {
                setSnapIndex((index) => Math.max(index - 1, 0));
              }
            }}
            // 隔离下方地图的 pan/zoom 手势。
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            {/* 拖拽手柄：仅此区域发起拖拽 */}
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
            >
              <span className="h-1.5 w-10 rounded-full bg-dim" />
            </div>

            {header && (
              <div className="shrink-0 px-5 pb-2 pt-1">
                {header}
              </div>
            )}

            {/* 内容区原生滚动 */}
            <div className={`min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 ${footer ? "pb-4" : "pb-[calc(env(safe-area-inset-bottom)+2rem)]"} ${contentClassName}`}>
              {children}
            </div>

            {footer && (
              <div className="shrink-0 border-t border-dim/70 bg-cream/96 px-5 py-3 shadow-[0_-10px_22px_rgba(250,251,247,0.86)] backdrop-blur">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}
