# 全国图点省交互方案（/map · ChinaMap）

## 背景（Context）

“我们的回忆”前端为 Next.js 16 静态导出 + React 19 + Tailwind v4 + framer-motion + d3-geo 自绘 SVG 地图。移动端（手机浏览器 / Capacitor APK）100% 复用 `apps/web` 响应式页面。

两份既有方案（`plan.md`、`plan-recall-interaction.md`）的交互增强**全部落在省份图 `ProvinceMap`**，并明确把全国图 `/map`（`ChinaMap`）划到“后续迭代”（plan.md 末尾“`/map` 全国地图页本期不动”、plan-recall“全国图 ChinaMap 后续可复用”）。本方案补上这块缺口，把 plan-recall 痛点 #1“点亮地图与地图上的回忆缺乏互动”延伸到全国级。

经核实，全国图当前的交互短板：

| # | 问题 | 位置 |
|---|------|------|
| 1 | 点省份零预览、零确认，直接 `router.push` 跳走 | `ChinaMap.tsx:178-180`、`310`、`333` |
| 2 | 省名提示只由 `onMouseEnter` 触发，移动端无 hover → 点省前看不到任何省名，易跳错省 | `ChinaMap.tsx:306-308`、`399-414` |
| 3 | `localMemories` 已加载却只用于点亮/路线，省份无回忆数、无“最近一条”速览 | `ChinaMap.tsx:97`、`271-313` |
| 4 | 已画出“我们走过的路线”并编号，但节点 `pointerEvents="none"`，是浪费掉的交互入口 | `ChinaMap.tsx:377-395` |

**范围**：纯前端，**只动 `apps/web/components/ChinaMap.tsx`**（外加复用/补建一个共用 hook）。不动后端、不动省份图、不改全国图的缩放/平移模型（pan 对齐是另一独立议题，不在本方案）。

**关键复用**：`ProvinceMap` 已实现这套交互的全部零件，本方案照搬其模式而非重新设计——
- 预览 popover：`previewCityId` 状态 + `CityPreviewPopover` 组件 + hover（`onHoverStart/End`）/ 触屏长按（`onPointerDown` 400ms，`ProvinceMap.tsx:1003-1016`）。
- 点击反馈动画：`sparked` / `nudged`（`ProvinceMap.tsx:988-993`）。
- 共用断点 hook：`apps/web/lib/useIsMobile.ts`（两份既有方案均列为“新建”）。

## 总体交互设计

核心改动：**点省份从“立即跳转”改为“先选中预览、再确认进入”**，桌面与移动分流，但都不再让用户在零信息下被弹走。

### 桌面（≥lg）
- **Hover 省份**：把现有省名 tooltip（`ChinaMap.tsx:399-414`）升级为**预览卡** —— 省名 + 回忆数 + 点亮城市数；该省有回忆时附封面缩略 + 最近一条标题/日期。
- **点击省份**：保留“点击即进省”（桌面用户已在 hover 时看过预览，肌肉记忆不破坏）。

### 移动（<lg，无 hover）
- **第一次点省份**：`setSelectedProvinceId(id)`，在省份质心锚点弹出预览卡（pointer-events 可交互），**不跳转**；播放一次 `spark` 选中动效。
- **预览卡内“进入该省 →”按钮**：点击才 `router.push(/province/[id])`。
- **再次点同一省 / 点空白**：进入 / 取消选中。
- 由此根除“手一抖点错省、瞬间被弹走”。

### 路线节点可点（桌面 + 移动共用）
- 路线节点（`ChinaMap.tsx:377-395`）由纯装饰改为可点击命中区：点节点 → 深链 `router.push(/province/[provinceId]?city=[cityId])`，直达该城回忆（节点已带 `point.city` / `point.memory`）。
- 命中区给一个透明大 `circle`（r≈14）保证移动端可点；可见的小圆点视觉不变。

## 实现步骤

> AGENTS.md 强制要求：写代码前先读 `node_modules/next/dist/docs/` 中 client components / hooks / 静态导出指南，确认与训练数据差异（本版 Next 有 breaking changes）。

### 第 0 步：共用 hook（若尚未由其他阶段建立）

`apps/web/lib/useIsMobile.ts`：`useSyncExternalStore` 订阅 `(max-width: 1023px)`（对齐 Tailwind `lg`），SSR 快照返回 `false`。两份既有方案已规定同一规格——若已存在直接复用，不重复创建。

> 水合安全：省份 path 的渲染在 server/client 完全一致；`selectedProvinceId`、预览卡、移动分支**只在用户点击后**出现（纯客户端状态），不存在水合不匹配。`useIsMobile` 仅用于“点击后才分叉”的行为判断，不用于静态可见性。

### 第 1 步：省份回忆聚合

在 `ChinaMap` 内新增 `useMemo`，从已加载的 `localMemories` 聚合省级统计（依赖 `[localMemories]`）：

```tsx
// 复用 cityById（由 data/cities）与 memoryTime（由 data/memories）
const provinceStats = useMemo(() => {
  const stats = new Map<string, { count: number; latest?: Memory }>();
  for (const list of Object.values(localMemories)) {
    for (const memory of list) {
      const city = cityById.get(memory.cityId);
      if (!city) continue;
      const prev = stats.get(city.provinceId) ?? { count: 0 };
      prev.count += 1;
      if (!prev.latest || memoryTime(memory) > memoryTime(prev.latest)) prev.latest = memory;
      stats.set(city.provinceId, prev);
    }
  }
  return stats;
}, [localMemories]);
```

新增 import：`cities`（建 `cityById`）、`memoryTime` / `Memory`（`@/data/memories`）。封面取 `latest.image`（回退 `latest.photos?.[0]`）。

### 第 2 步：状态与点击分流

- 新增 `const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null)` 与 `const isMobile = useIsMobile()`。
- 改 `goProvince`（`ChinaMap.tsx:178-180`）调用点的语义：抽一个 `handleProvinceTap(id)`：
  ```tsx
  const handleProvinceTap = (id: string) => {
    if (isMobile) setSelectedProvinceId((cur) => (cur === id ? id : id)); // 选中→预览
    else router.push(`/province/${id}`);                                  // 桌面直达
  };
  ```
- 省份主 path 与 HK/Macau easy-tap 圆（`ChinaMap.tsx:310`、`333`）的 `onClick` 改调 `handleProvinceTap`。
- 移动端点空白取消选中：在最外层 `motion.div` 加 `onClick` 兜底（仅当点击目标非 path/按钮时 `setSelectedProvinceId(null)`）。

### 第 3 步：预览卡（替换并增强现 hover tooltip）

把 `ChinaMap.tsx:399-414` 的 tooltip 升级为预览卡组件 `ProvincePreview`（就近内联或抽小组件）：
- **触发源**：桌面 `hoveredId`，移动 `selectedProvinceId`（取并集决定 `activeId`）。
- **锚定**：复用现有质心百分比定位（`left/top` = `path.x/width`、`path.y/height` 的 %），并按 `path.x > width * 0.6` 左右翻转，避免贴边溢出。
- **内容**：
  - 标题：省名 + `nameEn`（沿用现样式）。
  - 该省 `provinceStats` 命中且 `count>0`：封面缩略（`next/image`，`unoptimized`，36×36 圆角）+ `回忆 N · 点亮 M 城` + 最近一条 `title`·`date`。
  - 未点亮：`还没有回忆，去点亮 →`。
- **可交互性**：
  - 桌面：`pointer-events-none`（纯速览，click 在 path 上完成跳转）。
  - 移动：`pointer-events-auto`，底部一枚 **「进入该省 →」** 按钮 `onClick={() => router.push('/province/'+activeId)}`。
- 进出场复用现有 `motion.div` + `AnimatePresence`（与 `ProvinceMap` 一致的 spring）。

### 第 4 步：路线节点可点

改 `route.points.map`（`ChinaMap.tsx:377-395`）：
- 外层 `<g>` 去掉 `pointerEvents="none"`，加一个透明命中圆 `<circle r="14" fill="transparent" className="cursor-pointer">`。
- `onClick={() => router.push('/province/'+point.city.provinceId+'?city='+point.city.id)}`（`buildMemoryRoutePoints` 的 point 已带 `city`/`memory`）。
- 可见小圆点 + 序号文字保持不变；命中圆置于其下层。
- 移动端长按节点可触发同省预览（可选，列为后续；本期点按即深链已够用）。

### 第 5 步：点击/选中反馈动效（轻量）

- 移动端 `selectedProvinceId` 命中省份时，对应 `path` 播放一次 `spark`（`scale`/glow 脉冲，复用 `visitedGlow` filter 思路 + framer-motion，参考 `ProvinceMap` 的 `sparked`）。
- 包一层 `prefers-reduced-motion` 判断（`window.matchMedia('(prefers-reduced-motion: reduce)')`），降级为无动画——顺手补上现有入场/路线动画都缺的这层尊重。

### z-index 协调（沿用既有表）
| 层 | z |
|----|---|
| 地图 / 省份 path / 路线节点 | 0 |
| 缩放控制 | 20（现状） |
| **省份预览卡（含移动“进入”按钮）** | **40** |

无 BottomSheet 引入，不触碰 50/60/80 层；与 `MobileMapDock`（z-40）同层但锚定地图内部、互不重叠。

## 涉及文件汇总

| 文件 | 操作 |
|------|------|
| `apps/web/lib/useIsMobile.ts` | 复用（不存在则按既有方案规格新建） |
| `apps/web/components/ChinaMap.tsx` | 改：省份聚合 `provinceStats`、点击分流 `handleProvinceTap`、`selectedProvinceId` 状态、tooltip 升级为可交互预览卡、路线节点可点、移动选中动效 + reduced-motion |

后端不动；`ProvinceMap`、省份页、`map/page.tsx` 不动。

## 分阶段交付

1. **第 1–2 步**（聚合 + 点击分流）：拆掉“裸跳转”，移动端先选中后确认，最痛点先落地、可独立验证。
2. **第 3 步**（预览卡）：补齐速览信息。
3. **第 4–5 步**（路线节点可点 + 动效/reduced-motion）：体验增强，最后做。

每步独立可验证、可单独提交。

## 验证方案

> 本机无法 `npm install` / `build`（见记忆 env-no-deps-install），以下需在可构建环境执行；本地仅做静态审查。

1. `npm run dev -w @map-of-us/web`（端口 3002），后端 `cd backend && go run main.go`。
2. **移动 390×844**：`/map` 点未点亮省 → 弹预览“还没有回忆”+「进入」；点已点亮省 → 预览显示回忆数/最近一条/封面，**不跳转**；点「进入」才进省；点空白取消选中；不会“点一下就跳错省”。
3. **桌面 1440×900**：hover 省份出预览卡（省名/回忆数/最近一条），点击直达省份页——与现状路径一致、零退化。
4. **路线节点**：点全国图路线上的编号节点 → 落地 `/province/[id]?city=[cityId]`，直达该城回忆。
5. **回归**：点亮态配色/发光、缩放控件、`SouthChinaSeaInset`、`MobileMapDock` 与现状逐项对比；开启系统“减弱动态效果”后选中无脉冲动画。
6. `npm run build -w @map-of-us/web` 静态导出无水合警告、无构建错误；`npm run typecheck` 通过。
