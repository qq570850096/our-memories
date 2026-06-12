# 移动端地图页回忆展示优化方案

## 背景（Context）

这是一个情侣回忆记录应用（Next.js 16 静态导出 + React 19 + Tailwind v4 + framer-motion + d3-geo 自绘 SVG 地图）。移动端（手机浏览器 / Capacitor APK）100% 复用 `apps/web` 的响应式页面。

用户痛点：**从回忆卡片跳转到地图（`/province/[id]?city=xxx`）后，移动端布局过于局促**。地图 UI 最初为桌面设计，经核实根因如下：

| # | 问题 | 位置 |
|---|------|------|
| 1 | 回忆浮动卡片固定 `w-[292px]`（展开 390px），在 375px 手机屏占 78%+，展开态比部分手机还宽 | `ProvinceMap.tsx:78, 1435-1454` |
| 2 | 城市列表侧边栏固定 `w-[230px]` 绝对定位 `right-0`，无响应式断点，小屏与卡片重叠 | `ProvinceMap.tsx:881-924` |
| 3 | 卡片左右翻转定位逻辑 `rightLimit` 在屏宽 <522px 时失效，卡片被挤出/遮挡 | `ProvinceMap.tsx:483-502` |
| 4 | `focusCity` 固定 `x -150px` 偏移是给桌面右侧卡片留位的，移动端把城市推偏 | `ProvinceMap.tsx:622-632` |
| 5 | 9 字段编辑表单塞在浮动小卡片里，移动端滚动/输入体验差 | `ProvinceMap.tsx` MemoryCard 内 |
| 6 | 地图容器 `aspect-[1120/760]` 横向比例，竖屏手机上地图只占屏幕上部一小条，大量竖向空间浪费 | `ProvinceMap.tsx:742` |

**结论：浮动锚定卡片这一交互范式在手机上根本不成立**，纯响应式修补（动态卡片宽度）治标不治本。采用移动端业界标准交互——**底部抽屉（BottomSheet）**重构移动端展示层，桌面端（≥lg）保持现状完全不变。不需要更激进的独立移动路由（会导致代码分叉、深链分裂，过度设计）。

## 总体交互设计（移动端 < lg / 1024px）

```
┌─────────────────────┐
│ ← 返回   省份名      │  头部不变
│                     │
│     SVG 省份地图     │  地图占上半屏，点击城市标记：
│    （可拖拽缩放）     │  focusCity 将城市定位到「上半屏中心」
│         ◉guangzhou  │  （水平居中，垂直上移，而非桌面的左移）
├══ ▬▬ (拖拽手柄) ═════┤
│ 广州 Guangzhou  ✕   │  BottomSheet 两档吸附：
│ 2024.05.20          │  · 半屏档 snap ≈ 48dvh：照片+标题+日期+文字
│ [封面照片]           │  · 全屏档 snap ≈ 92dvh：回忆/相册/历史 tabs、
│ 回忆文字…            │    编辑表单（字段全宽纵向排列）
└─────────────────────┘  · 下拽超阈值 → 关闭
```

- **城市列表侧边栏**：`<lg` 隐藏；移动端右上角改为「城市 N」chip 按钮，点开一个轻量下拉面板（复用现有列表项 UI），选中即 focusCity + 打开 sheet。
- **深链 `?city=xxx`**（回忆卡片跳转入口）：移动端聚焦城市到上半屏 + BottomSheet 以半屏档打开，落地即见回忆。
- **编辑表单**：在 sheet 全屏档内展开，字段全宽、原生滚动。
- 桌面端：原浮动卡片、侧边栏、focusCity 偏移全部不动。

## 实现步骤

### 第 0 步：阅读 Next.js 16 文档（项目 AGENTS.md 强制要求）
写代码前查 `node_modules/next/dist/docs/` 中 client components / hooks / 静态导出相关指南，确认与训练数据的差异。

### 第 1 步：基础设施 — 断点 Hook + BottomSheet 组件

**新建 `apps/web/lib/useIsMobile.ts`**：
```tsx
"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 1023px)"; // 与 Tailwind lg 断点对齐
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
// SSR/静态导出快照返回 false（按桌面渲染），水合后立刻校正；
// 回忆卡片仅在用户点击后渲染（纯客户端状态），不存在水合不匹配
export const useIsMobile = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
```
注意：**静态可见性差异（如侧边栏隐藏）一律用 CSS 类 `hidden lg:block` 实现**，不用 JS，从源头规避水合不匹配；JS hook 只用于「点击后才出现」的交互分支（卡片 vs sheet、focusCity 偏移）。

**新建 `apps/web/components/ui/BottomSheet.tsx`**（可复用组件）：
```tsx
"use client";
type Props = {
  open: boolean;
  onClose: () => void;
  snapPoints?: number[];      // 占视口高度比例，默认 [0.48, 0.92]
  initialSnap?: number;       // 默认 0（半屏档）
  children: React.ReactNode;
};
```
要点：
- `fixed inset-x-0 bottom-0 z-[60]`，圆角顶部 + 拖拽手柄条，沿用项目设计语言（`#FAFBF7` 底、`#D8DDD8` 边框、backdrop-blur）。
- framer-motion：`useDragControls`，**drag 仅由手柄/头部区域发起**（`dragListener={false}` + handle 上 `onPointerDown={e => controls.start(e)}`），内容区原生滚动，不与拖拽打架。
- `onDragEnd` 按 offset + velocity 决定吸附档位或关闭（下拽 >80px 或 velocity>500 → 关闭）。
- 高度用 `dvh` + `env(safe-area-inset-bottom)` 内边距。
- 根元素 `onPointerDown/onWheel` stopPropagation，隔离下方地图的 pan/zoom（与现 MemoryCard 同款手段，`ProvinceMap.tsx:1441-1443` 已验证有效）。
- `AnimatePresence` 进出场动画，复用现有 `spring` 配置（`ProvinceMap.tsx:71`）。

### 第 2 步：拆出 MemoryCard 内容层（控制 2113 行文件的膨胀）

把 `ProvinceMap.tsx` 内 `MemoryCard` 的**内容部分**（头部信息、tabs、地标上传、回忆展示、相册、历史、编辑表单）抽到新文件 `apps/web/components/province/MemoryCardContent.tsx`，props 即现 MemoryCard 的 props + `layout: "card" | "sheet"`：
- `layout="card"`：现桌面行为，`expanded` 状态控制 tabs 显隐（逻辑原样搬移）。
- `layout="sheet"`：始终按"展开"布局渲染（tabs 可见、表单网格在全宽下用 `grid-cols-2`），隐藏 展开/收起 按钮（sheet 档位代替该功能）。

`ProvinceMap.tsx` 中 MemoryCard 退化为桌面定位壳（motion.article + anchor 定位），新增移动分支：
```tsx
{selectedCity && (isMobile ? (
  <BottomSheet open onClose={() => setSelectedCityId(null)}>
    <MemoryCardContent layout="sheet" city={selectedCity} ... />
  </BottomSheet>
) : (
  <MemoryCard anchor={cardAnchor} ... />   // 桌面原样
))}
```
同时 `cardAnchor` 计算（`ProvinceMap.tsx:483-502`）在 isMobile 时直接返回 null 跳过。

这是纯搬移 + 薄分支，**不重写任何表单/保存逻辑**（handleSave、照片压缩、AI 润色按钮等全部原样）。

### 第 3 步：focusCity 移动端偏移 + 深链行为

`ProvinceMap.tsx:622-632`：
```tsx
const focusCity = (city: Pick<City, "id">) => {
  const point = mapGeometry.cities.find((c) => c.city.id === city.id);
  if (!point) return;
  const scale = clampZoom(Math.max(cameraRef.current.scale, 1.62));
  setCamera(isMobile
    ? { scale, x: width / 2 - point.x * scale,          // 水平居中
        y: height * 0.30 - point.y * scale }            // 城市定位到上部 30%，给 sheet 让位
    : { scale, x: width / 2 - point.x * scale - 150,    // 桌面原样
        y: height / 2 - point.y * scale + 12 });
};
```
深链 effect（`ProvinceMap.tsx:650-663`）无需改动——`setSelectedCityId` 在移动端自然走 BottomSheet 分支。

### 第 4 步：城市列表移动端改造

- 侧边栏 `<aside>`（`ProvinceMap.tsx:881`）加 `hidden lg:block`。
- 新增移动端「城市 N」按钮（右上角，`lg:hidden`），点开浮层面板（`absolute right-2 top-14 z-40 max-h-[40dvh] overflow-y-auto`），列表项 JSX 与现侧边栏完全复用（抽成小组件 `CityListItems` 避免复制两份）；点选城市后关闭面板并 `handleSelectCity`。

### 第 5 步：地图竖屏空间与外围元素

- `ProvinceMap.tsx:742` 容器：`aspect-[1120/760]` 改为移动端允许更高 —— `aspect-[1120/760] max-lg:aspect-auto max-lg:h-[52dvh]`（SVG 居中渲染，上半屏给地图、下半屏给 sheet 的空间分配）。frameScale 计算已基于 ResizeObserver（`ProvinceMap.tsx:420-433`），自动适配。
- 省份页 `app/province/[id]/page.tsx:56`：`pb-28` 移动端收紧为 `pb-4`（底部不再有需要避让的浮动卡片；该页本就没有底部导航）。
- 左下角图例（`page.tsx:60`）移动端 `hidden sm:block`（信息价值低，省出空间）。
- 缩放控制（`ProvinceMap.tsx:848`）移动端缩小：按钮 `h-9 w-9` → `max-lg:h-8 max-lg:w-8`，百分比文字 `max-lg:hidden`。

### z-index 协调
| 层 | z |
|----|---|
| 地图/标记 | 0 |
| 缩放控制、城市面板 | 40 |
| 桌面浮动卡片 | 50 |
| **BottomSheet（新）** | **60** |
| 省份页返回按钮 | 80（fixed，保持可点） |

省份页没有底部导航（MemoryNav 只在 /map 等页出现），sheet 无避让负担。`/map` 全国地图页的底部三层堆叠（MobileMapDock/MapTimeCapsules）**本期不动**——回忆展示发生在省份页，全国页可作为后续迭代复用本期的 BottomSheet 统一治理。

## 涉及文件汇总

| 文件 | 操作 |
|------|------|
| `apps/web/lib/useIsMobile.ts` | 新建 |
| `apps/web/components/ui/BottomSheet.tsx` | 新建（可复用） |
| `apps/web/components/province/MemoryCardContent.tsx` | 新建（从 ProvinceMap.tsx 搬移） |
| `apps/web/components/ProvinceMap.tsx` | 改：MemoryCard 壳化、isMobile 分支、focusCity、侧边栏断点、容器 aspect、缩放控件、CityListItems 抽取 |
| `apps/web/app/province/[id]/page.tsx` | 改：移动端 padding/图例 |

## 验证方案

1. `npm run dev -w @map-of-us/web`（端口 3002）。
2. 用 agent-browser 设移动视口 390×844 验证：
   - `/province/guangdong?city=guangzhou` 深链落地：城市聚焦上半屏、sheet 半屏档打开、回忆内容可见；
   - 拖手柄上拉 → 全屏档，tabs/相册/历史可用；下拽 → 关闭；
   - 点地图标记/「城市 N」面板选城 → sheet 打开；地图在 sheet 打开时仍可拖拽缩放（手势互不干扰）；
   - 登录管理员后打开编辑表单，字段全宽、可滚动、保存成功。
3. 桌面回归 1440×900：浮动卡片锚定/翻转、侧边栏、展开态、focusCity 偏移与现状逐项对比，确认零变化。
4. `npm run build -w @map-of-us/web` 静态导出无水合警告、无构建错误。
