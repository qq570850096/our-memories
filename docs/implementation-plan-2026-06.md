# 实施计划：深挖每个页面的功能潜力

更新时间：2026-06-29
配套文档：`couple-experience-animations-and-rituals.md`、`feature-discovery-tech-driven.md`
视角：手机优先，逐页深挖功能潜力，复用已有基础设施

---

## 0. 总纲

### 0.1 三条铁律

1. **手机优先**。`apps/mobile`（Capacitor/Android）和 `apps/miniprogram`（微信小程序）是基准端。实时通道要离线降级、分享走系统相册/微信、触屏用 tap/long-press 替代 hover。
2. **复用已有基础设施**。调研确认项目已具备：
   - **JPush 推送完整集成**：`push_devices` 表、`services.PushService`、`handlers.RegisterPushDevice`/`SendTestPush`。通知触达通道已存在，新功能只需在事件发生时调用 `PushService`。
   - **`events.Dispatcher` + `Publisher` 接口**：目前只有 `NoopPublisher`，事件发了没人收。所有新功能做成新的 `Publisher` 实现，注册进 `NewDispatcher(...)`，现有 service 一行不改。
   - **`jobs.StartPhotoSync` 范式**：`go func() + time.Ticker`，新后台任务照抄结构。
   - **回收站已实现**：`MemoryRecord.DeletedAt`、`ListTrash`/`Restore`/`ExpiredTrash` 已就绪，`GET /memories/trash`、`POST /memories/:id/restore` 已存在。本计划不再重复。
   - **`cache` 包**、**GORM repository 模式**可直接复用。
3. **单进程部署简洁**。不引入 Redis/ES/RabbitMQ。WebSocket hub、缓存、搜索索引、通知都在进程内。

### 0.2 本期新增的横切改造

调研发现几个全局性问题，影响所有页面，需要先统一改造：

#### A. 数据库迁移：手写 SQL → GORM AutoMigrate

**现状**：`db/sqlite.go` 的 `Migrate()` 是一整块手写 `CREATE TABLE` + `ensureColumn`。每加一个字段都要手写 SQL，容易和 `XxxRecord` struct 定义漂移。

**做什么**：把手写 schema 改为 GORM `AutoMigrate`，以 struct 为唯一真相源。
- 把 `repositories/*Record` 的字段定义提升为迁移依据（或新建 `models` 里对应的 GORM tag 完整的 struct）。
- `Migrate()` 改成 `db.Gorm.AutoMigrate(&MemoryRecord{}, &MemoryPhotoRecord{}, ...)`。
- 保留 `ensureColumn` 作为存量数据的兼容兜底（已有库不会丢字段），但新表/新字段一律走 AutoMigrate。
- 软删除字段 `gorm.DeletedAt` 已在 `MemoryRecord` 上，AutoMigrate 会正确处理。

**落点**：
```
backend/db/sqlite.go          // Migrate() 重构为 AutoMigrate
backend/repositories/*.go     // Record struct 补全 gorm tag（index、type、default）
```

**风险**：AutoMigrate 不会删字段/删索引，只会加。存量库迁移要验证不破坏。先在 `:memory:` 测试库里跑一遍全量迁移测试。

#### B. 语音媒体支持（回忆/悄悄话/胶囊通用）

**现状**：`Photo` 模型只有图片，`MimeType` 字段已有但实际只接受 `image/*`。回忆的 `text`/`partnerNote`、悄悄话回复 `content`、胶囊 `content` 都是纯文字。

**做什么**：把"照片"概念升级为"媒体"，支持音频。
- `Photo` → `Media`（保留表名 `memory_photos` 兼容，加 `media_type` 字段区分 `image`/`audio`）：`ensureColumn("memory_photos", "media_type", "TEXT DEFAULT 'image'")`，或 AutoMigrate 加字段。
- 回忆 `text` 旁可附一条语音描述（`voice_text_url`）；`partnerNote` 同理（`partner_voice_url`）。
- 悄悄话回复 `content` 旁可附语音（`voice_url`）。
- 胶囊 `content` 旁可附语音（`voice_url`）。
- 后端 upload handler 放开 `audio/*` mime；存储复用 `storage.ObjectStorage`。
- 前端新建 `VoiceRecorder` 组件（`MediaRecorder` API），`VoicePlayer` 组件（波形+播放）。

**落点**：
```
backend/db/sqlite.go                       // media_type、voice_url 等列
backend/handlers/upload.go                 // 接受 audio mime
backend/handlers/memory.go, whisper.go, timecapsule.go   // voice 字段读写
backend/models/models.go                   // Media 模型
apps/web/components/ui/VoiceRecorder.tsx   // 录音组件
apps/web/components/ui/VoicePlayer.tsx     // 播放组件（波形+时长）
apps/mobile                                // Capacitor 录音权限
```

**手机端关键**：录音权限申请、后台录音中断处理、弱网上传重试。小程序端用 `wx.getRecorderManager`。

#### C. 异步保存（回忆优先，推广到所有写操作）

**现状**：`useMemoryEditor.save()` 是同步串行——先 `uploadImages` 等完，再 `onSave`/`onUpdate` 等完，期间 `isSaving=true` 阻塞。照片多时手机端体验差。

**做什么**：改成异步乐观更新。
- 前端：点保存立即关闭表单 + 乐观插入临时卡片（带 `pending` 标记），后台并行上传照片 + 提交。失败时回滚并提示，不阻塞界面。
- 后端：`POST /memories` 支持先创建（返回 id）后补照片的模式——`POST /memories` 创建记录，`POST /memories/:id/photos` 异步追加。或前端用 `Promise.allSettled` 并发上传后一次性提交 keys。
- SWR `mutate` 用乐观更新 `revalidate`。

**落点**：
```
apps/web/components/memories/useMemoryEditor.ts   // 乐观保存
apps/web/lib/upload.ts                            // 并发上传 + 进度
backend/handlers/memory.go                        // 可选拆分创建+补图
```

**注意**：乐观更新要处理冲突——两人同时编辑同一条。先到先得，后到的提示"TA 刚改过这条，刷新看看"。

---

## 1. 第一波：事件中枢与触达骨架（2-3 天）

回收站已完成，这一波从事件 publisher 起步。

### 1.1 events.Publisher 落地 + JPush 接入事件

- 新增 `events/jpush_publisher.go`：实现 `Publisher`，收到事件调 `PushService` 给 space 内除 actor 外的设备推送。复用已有 JPush 通道。
- `main.go` 注册 `JPushPublisher` 进 `NewDispatcher(...)`。
- 新增事件类型 `MemoryViewed`、`TimeCapsuleDue`、`AnniversaryNear`、`SignalCreated`。

```
backend/events/events.go             // 新增事件常量
backend/events/jpush_publisher.go    // 实现 Publisher
backend/main.go                      // 注册
```

### 1.2 定时触发器 scheduler

`jobs/scheduler.go`，每小时扫：
- `TimeCapsule` 到期 → 发 `TimeCapsuleDue`。
- `AnniversaryCard` 临近前后 3 天 → 发 `AnniversaryNear`。
- 去重：用 `cache` 记当天已发标记，避免重复推送。

```
backend/jobs/scheduler.go
backend/main.go        // jobs.StartScheduler()
```

### 1.3 通知中心 + WebSocket

- **通知中心**：`notifications` 表 + `NotificationPublisher` + `handlers/notification.go`。JPush 是"触达"（响一下），通知中心是"补看"（打开应用看列表）。同一事件两个 publisher 都收。
- **WebSocket**：`events/hub.go` + `ws_publisher.go` + `handlers/ws.go`。手机端断连是常态，退化成"上次同步的痕迹"，不转圈。悄悄话"正在写"在弱网下宁可静默。

```
backend/db/sqlite.go                          // notifications 表（AutoMigrate）
backend/events/notification_publisher.go
backend/events/hub.go, ws_publisher.go
backend/handlers/notification.go, ws.go
backend/main.go                               // 注册两个 publisher
apps/web/lib/useWebSocket.ts                  // 断线重连 + 离线降级
```

---

## 2. 第二波：逐页深挖功能潜力（8-12 天）

骨架铺好后，逐页挖掘。每页先列"现状 → 潜力 → 落点"。

### 2.1 回忆页（memories）

#### 现状
- `MemoryArchive` 一次拉全部 `GET /memories`，前端全量渲染，无分页无筛选。
- `useMemoryEditor` 同步保存，`text`/`partnerNote` 纯文字。
- AI 只有 `/ai/memory-polish` 一个润色接口。

#### 潜力挖掘

**a. 分页 + 筛选器（最优先）**
- 后端 `GET /memories` 加 `cursor`（按 `date DESC, created_at DESC`）+ `limit`（默认 20）+ `tags`/`cityId`/`dateFrom`/`dateTo`/`visibility`/`mood` 筛选参数。
- 前端 `MemoryArchive` 改为无限滚动 + 顶部筛选 chip 行（城市/暗号/心情/时间范围）。
- 筛选时不含的项 `opacity: 0.3` 变淡，不直接消失（呼应暗号仪式感）。
- `MemoryRepository.List` 加 `Limit/Offset` 或 cursor，复用现有索引 `idx_memories_space_date_order`。

**b. 语音描述 + 语音补充语**
- 回忆 `text` 旁可附 `voice_text_url`（念出来）；`partnerNote` 旁可附 `partner_voice_url`。
- 编辑器加录音按钮（`VoiceRecorder`），详情页加播放按钮（`VoicePlayer` 波形）。
- 手机端录音是刚需——有些情绪打字表达不出来。

**c. AI 搜索 + 情绪价值**
- **AI 搜索**：`GET /memories/search?q=那天下雨` → 后端先做 LIKE 搜索（`text LIKE %q%`），回忆多了再上 FTS5。进阶：`POST /ai/memory-search` 把自然语言转成结构化查询（"我们在杭州的雨天" → `cityId=hangzhou AND tags LIKE %雨%`），用 DeepSeek 做意图解析。
- **情绪价值**：
  - 打开一条回忆时，AI 静默生成一句"那天你们在杭州的雨里走了很久"（5.2 回放导语，已规划）。缓存到 `memory_ai_cache` 表，不每次调。
  - `MemoryDetailSheet` 底部"那年同一天"agent（9.2）：同城市/同日期往年/同暗号的其他回忆，一行"两年前的今天你们也在杭州"。纯聚合无 LLM 成本。
  - 情绪标签自动建议：根据 `text` 内容 AI 建议 `mood`（开心/平静/想念），用户确认。比手动选下拉框轻。

**d. 异步保存**（见 0.2.C）

#### 落点
```
backend/repositories/memory_repo.go        // List 加 cursor/limit/filter
backend/handlers/memory.go                 // 查询参数解析；/search；/ai/memory-search
backend/handlers/store.go                  // AI 搜索/导语（复用 DeepSeek 调用模式）
backend/db/sqlite.go                       // voice_text_url、partner_voice_url 列
apps/web/components/MemoryArchive.tsx      // 无限滚动 + 筛选 chip
apps/web/components/memories/MemoryDetailSheet.tsx   // 语音播放 + 那年同一天 + AI 导语
apps/web/components/memories/useMemoryEditor.ts      // 语音录制 + 异步保存
apps/web/components/ui/VoiceRecorder.tsx, VoicePlayer.tsx
```

### 2.2 悄悄话页（whispers）

#### 现状
- 纯文字 `title` + `content` 回复，无媒体，无"正在写"，无语音。

#### 潜力挖掘

**a. 语音悄悄话**
- 回复 `content` 旁可附 `voice_url`。`VoiceRecorder` 嵌入回复输入框旁边。
- 播放时显示对方头像 + 波形跳动，比文字更有"在场感"。

**b. "正在写"实时状态**（依赖第一波 WS）
- 对方正在输入时，悄悄话卡片底部三个缓慢跳动的点。WS 推 typing 状态。
- 弱网静默，不显示假状态。

**c. 悄悄话不消失/收藏**
- 重要悄悄话可"钉住"（`pinned` 字段），置顶显示。现在所有悄悄话平铺，重要的会被淹没。

**d. 悄悄话情绪贴纸**（轻量）
- 回复可附一个极小的心情符号（预设 6 个，非 emoji 库），从两人常用里选。比文字更轻地传达情绪。

#### 落点
```
backend/db/sqlite.go                       // whisper_replies 加 voice_url、pinned、sticker
backend/handlers/whisper.go                // 语音字段读写
backend/models/models.go                   // WhisperReply 加字段
apps/web/components/WhisperWall.tsx        // 语音录制/播放 + 正在写 + 钉住 + 贴纸
apps/web/lib/useWebSocket.ts               // typing 状态
```

### 2.3 时光胶囊页（time-capsule）

#### 现状
- 纯文字 `content` + 照片，无语音，无显影动画，无一起打开模式，倒计时只是数字。

#### 潜力挖掘

**a. 语音胶囊**
- `content` 旁可附 `voice_url`。打开胶囊时听到对方的声音，比文字冲击大得多。

**b. 封存仪式 + 显影动画**（仪式感，文档瞬间三）
- 封存：提交后 `clip-path` 从下往上封蜡覆盖 0.8s + 盖日期戳。
- 显影：打开时照片 `blur(20px)→blur(0)` 1.5s，文字按字符 `staggerChildren:0.03`，语音最后淡入播放。
- 到期当天 `/map` 底部胶囊图标浮起暖光（贴底拇指热区）。

**c. 一起打开模式**
- `open_mode: "together"` + `opened_by_user_ids` + `revealed_at`。两人都点"我也准备好了"才显影。先点的人看到"TA 还在路上"。
- 异地刚需，比单人打开浪漫得多。

**d. 胶囊封存前 AI 审查**（9.3 agent）
- `CreateTimeCapsule` 前调 DeepSeek 做事实性防呆：定位水印、未来日期、第三方名字。prompt 限定"只挑事实性问题，不评价情感"。手机端弹轻 sheet 确认。

#### 落点
```
backend/db/sqlite.go                       // time_capsules 加 voice_url、open_mode、opened_by_user_ids、revealed_at
backend/models/models.go                   // 字段
backend/services/timecapsule_service.go    // 一起打开逻辑
backend/handlers/timecapsule.go            // 封存前 AI 预检
apps/web/components/time-capsule/TimeCapsuleReveal.tsx   // 封存+显影动画
apps/web/app/time-capsule/page.tsx         // 语音 + 一起打开 UI
apps/web/components/MapTimeCapsules.tsx    // 到期浮起
```

### 2.4 纪念日页（anniversaries）

#### 现状
- `AnniversaryWall` 只是卡片网格（照片+标题+日期+note+置顶+距今/下一次）。无画廊，无背景音乐，无回放。

#### 潜力挖掘

**a. 纪念日画廊**（核心新增）
- 每个纪念日卡片可展开为画廊视图：全屏照片轮播 + 那天的文字 + 日期。
- 画廊支持滑动切换照片（手机端原生手势），桌面端左右箭头。
- 画廊入口：卡片点击展开，或单独 `/anniversaries/:id/gallery` 路由。

**b. 背景音乐**
- 每个纪念日可绑一段背景音乐（用户上传 mp3 或从预设里选）。
- `anniversary_cards` 加 `bgm_url`/`bgm_preset` 字段。画廊打开时音乐淡入，关闭淡出。
- 预设音乐库（几首轻音乐，本地资源非外链）："初见""远行""晚安"。
- 手机端尊重系统静音键 + 应用内音乐开关（默认关，文档原则）。

**c. 纪念日回放页**（文档瞬间四）
- 纪念日当天首页顶部"今天是我们第 N 个某某日"卡片，点进只读回放页：
  - 顶部：那天的日期、当时的城市
  - 主体：那天拍的照片（从 `Memory` 按 `date` 匹配 ±3 天）、那天的文字、语音
  - 底部："今年想补一句吗？"展开极简输入框，存为新回忆关联该纪念日
- 回放入场：整页从老照片局部缓慢拉远 `scale:1.2→1` 2s。

**d. 纪念日临近微光**（依赖第一波）
- 临近前后 3 天的纪念日卡片有轻微呼吸光晕，hover/tap 显示"还有 X 天"。

**e. 语音 note**
- `note` 旁可附 `voice_url`，念出来比读出来更有温度。

#### 落点
```
backend/db/sqlite.go                       // anniversary_cards 加 bgm_url、bgm_preset、voice_url
backend/handlers/anniversary.go            // bgm/voice 读写；GET /anniversary-cards/:id/replay
backend/models/models.go                   // 字段
apps/web/components/AnniversaryWall.tsx    // 画廊入口 + 临近微光
apps/web/components/anniversaries/AnniversaryGallery.tsx   // 全屏画廊 + 背景音乐
apps/web/app/anniversaries/[id]/replay/page.tsx             // 回放页
apps/web/components/ui/AudioPlayer.tsx      // 背景音乐播放（淡入淡出）
```

---

## 3. 第三波：AI agent 增强（按需，2-4 天/个）

红线：不替写回忆、不评价关系、不单方施压、默认可关、忽略要被记住。

### 3.1 那年同一天 agent（最先做，无 LLM 成本）
打开 memory 时后端静默查同城市/同日期往年/同暗号回忆，响应附 `relatedEcho`。`MemoryDetailSheet` 底部一行"两年前的今天你们也在杭州"。

### 3.2 暗号策展 agent
`jobs/tag_curator.go` 周期扫描 `memory.text`，DeepSeek 筛候选暗号 + 摘来由，落 `tag_suggestions`。用户打开暗号管理页展示，不打扰首页。

### 3.3 回忆情绪标签建议
根据 `text` 内容 AI 建议 `mood`，用户确认。比手动选下拉轻。

### 3.4 纪念日回放导语
`AnniversaryNear` 触发时后台生成一句导语并缓存，回放页顶部展示。

### 3.5 记录摩擦诊断 agent（极克制）
周期扫"只有照片没文字"的 memory，用户再打开时轻提示"那天你只传了照片，要不要补句话"。必须可关，只在主动打开时出现。

### 3.6 AI 搜索意图解析
`POST /ai/memory-search` 把"我们在杭州的雨天"转成 `cityId=hangzhou AND tags LIKE %雨%`。回忆少时 LIKE 够用，多了再上 FTS5。

---

## 4. 暂缓（高成本/非刚需）

- 周年影片/导出长图（付费卖点，走系统相册/微信分享）
- 音频回忆独立模式（语音已作为附件支持，独立 voice-only memory 后期）
- FTS5 全文搜索（LIKE + AI 意图解析够用一段时间）
- 照片多版本/异步图片处理 worker（移动端流量问题显现后再做）
- 桌面壁纸、小程序快捷入口（长期探索）

---

## 5. 波次依赖与并行

```
第零波 (0.A ORM改造 ‖ 0.B 语音媒体底座 ‖ 0.C 异步保存)  横切改造，先做
        │
        ├── 第一波 (1.1 事件publisher ‖ 1.2 scheduler ‖ 1.3 通知+WS)  触达骨架
        │       │
        │       └── 第二波 (2.1 回忆 ‖ 2.2 悄悄话 ‖ 2.3 胶囊 ‖ 2.4 纪念日)  逐页深挖
        │               2.1 分页筛选/语音/AI搜索可先做；2.2 正在写/2.3 一起打开/2.4 临近微光依赖第一波
        │               │
        │               └── 第三波 agent (按需)
```

- **第零波横切改造最先**：ORM 迁移和语音底座是所有页面的依赖。异步保存可与第一波并行。
- **第一波 1.1/1.2/1.3 可并行**：事件 publisher、scheduler、通知+WS 互不依赖。
- **第二波 2.1 可提前**：分页筛选和语音不依赖 WS。2.2 正在写、2.3 一起打开、2.4 临近微光依赖第一波。

---

## 6. 验证清单

### 第零波
- [x] `AutoMigrate` 在 `:memory:` 测试库跑通，存量库升级不丢字段
- [x] 上传 mp3 成功，`media_type=audio`；前端播放波形正常
- [x] 回忆保存点保存后表单立即关闭，照片后台上传，失败回滚提示
- [x] 手机端录音权限申请正常，后台录音中断有提示

### 第一波
- [x] 创建 memory，对方 JPush 收到 + `GET /notifications` 有记录 + WS 在线实时收
- [x] WS 断开不转圈，重连后通知中心补看
- [x] 手动改 capsule `open_date` 为过去，scheduler 触发且当天只发一次

### 第二波
- [x] `GET /memories?cursor=xxx&limit=20&tags=雨` 返回正确分页+筛选结果
- [x] 回忆详情播放语音正常；"那年同一天"显示正确
- [x] 悄悄话回复附语音，对方播放波形跳动；"正在写"三个点显示，弱网静默
- [x] 胶囊封存动画 0.8s，显影 1.5s 手机端可跳过；一起打开模式两人都点才显影
- [x] 纪念日画廊全屏轮播 + 背景音乐淡入淡出，尊重系统静音
- [x] 纪念日回放页 `scale:1.2→1` 入场，"今年想补一句"可存为新回忆

### 第三波
- [x] agent 建议都带"忽略"按钮，忽略后不再推
- [x] agent 默认关，关闭后无任何行为
- [x] AI 搜索"杭州的雨天"转成正确结构化查询

---

## 7. 风险与红线

### 技术风险
- **AutoMigrate 与手写 schema 混用过渡**：存量库已有手写表，AutoMigrate 只加不删。先在测试库验证，保留 `ensureColumn` 兜底一个版本。
- **语音文件体积**：mp3 限制时长（如 60 秒）+ 压缩，避免 OSS 膨胀。上传走前端直传 OSS，后端只收 key。
- **乐观更新冲突**：两人同时编辑同一条 memory。先到先得，后到提示"TA 刚改过"。
- **JPush 配额**：定时推送限频，`cache` 记当天已发标记。
- **DeepSeek 成本**：周期性 agent 限频，导语/情绪建议结果缓存到 `memory_ai_cache` 表。

### 产品红线
- 不做实时定位，只做"对方 24 小时痕迹"。
- 想你信号不做统计，只对双方可见，不进 admin。
- 所有提醒用画面内元素，不用 alert/toast 红点。
- 背景音乐默认关，尊重系统静音。
- agent 不替写、不评价关系、不单方施压、默认可关、忽略要被记住。
- 动效手机端更克制：仪式场景允许 1.5s，日常浏览 0.2-0.4s。

---

## 8. 一句话

第零波做横切改造（ORM 迁移 + 语音底座 + 异步保存），第一波铺触达骨架（事件 publisher + 通知 + WS），第二波逐页深挖（回忆分页筛选/语音/AI 搜索、悄悄话语音/正在写、胶囊仪式/一起打开、纪念日画廊/音乐/回放），第三波让 agent 安静策展。手机优先，复用 JPush 和 events.Dispatcher，全 ORM 操作，不引入新基础设施。
