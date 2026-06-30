# 功能挖掘：基于现有技术栈的扩展机会

更新时间：2026-06-29
视角：产品经理，从技术能力出发反推可落地的功能点
参照代码：`backend/main.go`、`backend/events/events.go`、`backend/jobs/photo_sync.go`、`backend/cache/cache.go`、`backend/services/*.go`、`backend/handlers/*.go`、`backend/config/config.go`、`backend/models/models.go`、`go.mod`

## 写作前提

技术栈梳理如下，这是本文所有建议的落地基础：

- **Go 1.22 + Gin**，单进程，`main.go` 启动 HTTP 服务
- **GORM + glebarez/sqlite**（纯 Go SQLite 驱动，无 CGO 依赖，可交叉编译）
- **JWT 认证**，middleware 层注入 `spaceID` / `userID`
- **events.Dispatcher**：已有领域事件总线，定义了 `MemoryCreated`、`TimeCapsuleOpened`、`WhisperReplied` 等事件类型，支持多 `Publisher` 扇出
- **jobs.PhotoSync**：后台 goroutine，定时 ticker 同步本地图片到 S3
- **cache**：内存级 TTL 缓存，带 `sync.RWMutex`，按前缀失效
- **storage**：S3 / 本地双模式对象存储
- **前端**：Next.js 16 App Router + framer-motion + SWR

下面按技术能力分类，每个功能点标注：为什么从这个技术出发、产品价值、落地复杂度。

---

## 一、goroutine / 后台任务能力

项目已经有 `jobs.StartPhotoSync` 的范式：`go func()` + `time.Ticker` 定时执行。Gin 的请求-响应模型 + 后台 goroutine 是这个项目最自然的扩展点。所有"不需要请求方等待"的耗时操作都可以这么做。

### 1.1 纪念日与胶囊的定时触发器

**技术依据**：`time.Ticker` + goroutine

**功能**：一个独立的后台 job，每小时扫描一次：
- 到期可打开的 `TimeCapsule`（`OpenDate <= now && IsOpened == false`），发 `TimeCapsuleDue` 事件
- 临近的 `AnniversaryCard`（前后 3 天），发 `AnniversaryNear` 事件

**产品价值**：现在"到期"靠用户自己打开应用发现。有了定时器，可以在到期当天主动推一条"今天可以打开那个胶囊了"。这是 `romantic-two-person-feature-strategy.md` 里"被记得"情绪的技术基础。

**落地复杂度**：低。新增 `jobs/scheduler.go`，仿照 `photo_sync.go` 的结构，一个 ticker + 一个 scan 函数。复用 `events.Dispatcher` 发布事件。

**落点**：
```
backend/jobs/scheduler.go        // StartScheduler()
backend/main.go                   // jobs.StartScheduler()
```

### 1.2 异步图片处理管线

**技术依据**：goroutine + `storage.ObjectStorage` + `events`

**功能**：用户上传照片后，不阻塞响应，后台异步做：
- 生成缩略图（用标准库 `image` + `golang.org/x/image/draw`，无新依赖风险，或用 `disintegration/imaging`）
- 提取 EXIF 时间地点（用 `rwcarlsen/goexif`，轻量）
- 生成回忆封面图（裁剪到正方形）

**产品价值**：
- 缩略图让列表页（`MemoryArchive`、`RecentMemories`）加载更快，尤其在弱网移动端
- EXIF 时间可以自动填充 `Memory.Date`，减少用户输入摩擦
- 封面图让地图城市点更美观（现在用的是原图缩放）

**落地复杂度**：中。需要新增一个图片处理 worker，在 `UploadImage` handler 里 publish 一个 `PhotoUploaded` 事件触发，或直接 `go processPhoto(...)`。注意并发上限（用带缓冲的 channel + worker pool，避免照片多时 goroutine 爆炸）。

**落点**：
```
backend/jobs/image_worker.go     // worker pool + channel
backend/handlers/upload.go        // 上传后投递任务
backend/storage/processor.go      // 缩略图/EXIF/封面
```

### 1.3 关系数据周报/月报生成

**技术依据**：goroutine + 定时任务 + 聚合查询

**功能**：每周日凌晨，为每个 space 生成一份"本周我们的回忆"摘要：
- 新增了几条回忆
- 去过哪些城市
- 创建了几个胶囊
- 双方贡献比例

**产品价值**：低压力的回顾，不是 push 通知，而是下次打开应用时首页出现一张"这周我们记下了 3 段回忆"的卡片。配合第一篇文档的"周年影片"做阶梯。

**落地复杂度**：中。需要一个 `weekly_report` 表存生成结果，聚合查询复用现有 repository。

**落点**：
```
backend/jobs/report_generator.go
backend/models/models.go           // WeeklyReport 模型
backend/handlers/memory.go          // GET /memories/weekly-report
```

---

## 二、events 事件总线能力

`events.Dispatcher` 是项目里最被低估的基础设施。它已经有 `Publish` 接口和多 Publisher 扇出，但目前只有一个 `NoopPublisher` 在兜底。这意味着所有领域事件都被"发了但没人收"。这是最大的可挖掘点。

### 2.1 WebSocket 实时通知

**技术依据**：`events.Publisher` 接口 + Gin + gorilla/websocket（或标准库）

**功能**：实现一个 `WebSocketPublisher`，订阅 `events.Dispatcher`。当一方创建回忆、回复悄悄话、发送想你信号时，另一方如果在线，通过 WebSocket 实时收到：
- "TA 刚刚补充了杭州的回忆"
- "TA 回复了你的悄悄话"
- "TA 正在想你"

**产品价值**：这是第一篇文档"知道对方刚刚来过"和"正在写"动效的技术底座。没有这个，所有"对方刚来过"都只能靠轮询，体验差且耗电。

**落地复杂度**：中。需要：
- `gorilla/websocket` 依赖（成熟，或用 nhooyr/websocket 更现代）
- 一个 `ConnectionHub`（`map[spaceID][]*Connection` + `sync.RWMutex`）管理连接
- `WebSocketPublisher` 实现 `events.Publisher` 接口
- 心跳 ping/pong 防止断连
- 断线重连（前端 SWR 配合）

**落点**：
```
backend/events/ws_publisher.go    // 实现 Publisher 接口
backend/handlers/ws.go             // GET /ws 升级连接
backend/events/hub.go             // ConnectionHub
backend/main.go                    // dispatcher 注册 ws publisher
```

**关键设计**：Hub 按 spaceID 分组，同一 space 最多两个连接（两个用户）。发事件时投递给 space 内除 actor 外的连接。消息只走内存，不持久化——持久的通知用 2.2。

### 2.2 通知中心（持久化推送）

**技术依据**：`events.Publisher` + GORM 持久化 + 定时清理 goroutine

**功能**：实现一个 `NotificationPublisher`，把事件写入 `notifications` 表。用户打开应用时拉取未读通知。配合 1.1 的定时器，可以在纪念日/胶囊到期时生成通知。

**产品价值**：WebSocket 解决"在线实时"，通知中心解决"离线补看"。两者互补：在线时走 WS 推送并标记已读，离线时进通知中心等下次打开。

**落地复杂度**：低-中。一张表 + 一个 Publisher + 一个 handler。

**落点**：
```
backend/models/models.go            // Notification 模型
backend/events/notification_publisher.go
backend/handlers/notification.go    // GET /notifications, PATCH /notifications/:id/read
backend/jobs/scheduler.go            // 定时清理 30 天前的已读通知
```

### 2.3 搜索索引构建器

**技术依据**：`events.Publisher` + 全文搜索

**功能**：实现一个 `SearchIndexer`，订阅 `MemoryCreated/Updated/Deleted`，实时维护一个内存倒排索引（按标签、城市、日期、文字关键词）。搜索请求直接查内存索引，不查数据库。

**产品价值**：现在按标签/城市筛选是前端遍历（`MemoryArchive` 的 filter）。回忆多了之后（几百条），前端筛选会卡。后端索引 + 搜索 API 更快，还能支持"模糊搜索那天的文字"。

**落地复杂度**：中。纯内存倒排索引用 `map[string]map[string]bool`（term → memoryID set）。如果需要分词，中文用 `gomaxneck/gojieba` 或简单按字符切分。不引入外部搜索引擎（ES 太重），保持单进程部署的简洁。

**落点**：
```
backend/events/search_indexer.go   // 实现 Publisher
backend/search/index.go             // 倒排索引
backend/handlers/search.go          // GET /search?q=...
```

---

## 三、缓存层能力

`cache` 包是一个干净的内存 TTL 缓存，带 `sync.RWMutex` 和前缀失效。目前只缓存 memories 和 anniversary-cards。可以扩展到更多场景。

### 3.1 时光胶囊倒计时缓存

**技术依据**：`cache.Set` + TTL

**功能**：胶囊列表里每个胶囊的"剩余天数"是算出来的。把每个胶囊的倒计时结果缓存，TTL 到当天结束（午夜失效）。避免每次列表请求都算一次。

**产品价值**：小优化，但配合 1.1 的定时器，可以让"今天到期"的胶囊在缓存层就有标记。

**落地复杂度**：低。在 `GetTimeCapsules` handler 里加一层缓存。

### 3.2 热点回忆预加载

**技术依据**：`cache` + SWR

**功能**：用户打开应用时，大概率会看最近编辑的回忆和随机推荐。在 `GetMemories` 响应里，把"最近 3 条"和"随机 3 条"单独缓存（key 带 spaceID），TTL 5 分钟。

**产品价值**：首屏加载更快。移动端（`apps/mobile`、`apps/miniprogram`）对首屏速度更敏感。

**落地复杂度**：低。复用现有 `cache.Set`。

### 3.3 缓存预热 goroutine

**技术依据**：goroutine + `cache.Set`

**功能**：服务启动后，后台 goroutine 遍历所有 active space，预加载它们的 memories 缓存。避免第一个用户打开时的冷查询。

**产品价值**：部署后第一次访问不慢。对单进程 + SQLite 架构，冷启动一次全量预热成本可控（几百个 space，每个几条查询）。

**落地复杂度**：低。在 `main.go` 的 `jobs.StartPhotoSync()` 旁边加一个 `jobs.WarmCache()`。

**落点**：
```
backend/jobs/cache_warmer.go
backend/main.go
```

---

## 四、GORM / SQLite 能力

项目用 `glebarez/sqlite`（纯 Go SQLite），无 CGO，部署简单。GORM 的能力没有被充分利用。

### 4.1 软删除与回忆回收站

**技术依据**：GORM `gorm.DeletedAt` 软删除

**功能**：把 `Memory` 的硬删除改为软删除。删除后进"回收站"，30 天内可恢复。

**产品价值**：情侣吵架删回忆是真实场景。回收站让"删了后悔"有补救余地。当前硬删除一旦执行，照片也从 OSS 删了，不可逆。

**落地复杂度**：低。GORM 原生支持 `DeletedAt`，加一个字段，所有查询自动过滤。再加一个 `GET /memories/trash` 和 `POST /memories/:id/restore`。

**落点**：
```
backend/models/models.go        // Memory 加 DeletedAt
backend/handlers/memory.go       // 回收站接口
```

**注意**：照片在 OSS 的删除要改为延迟删除——软删除时只标 DB，真正删 OSS 要等回收站过期。

### 4.2 回忆的时间线视图

**技术依据**：GORM 排序 + 聚合

**功能**：`GET /memories/timeline` 返回所有回忆按日期排序的扁平列表（不按城市分组），前端渲染成一条竖向时间线。

**产品价值**：现在 `MemoryArchive` 按城市分组。时间线视图是另一种叙事方式——"我们 2023 年 5 月到 9 月发生了什么"。配合第一篇文档的"我们的路线"，是同一数据的两种视角。

**落地复杂度**：低。现有 repository 加一个 `ListTimeline` 方法，按 `date ASC` 排序。

**落点**：
```
backend/repositories/memory_repo.go
backend/handlers/memory.go
apps/web/app/memories/timeline/page.tsx
```

### 4.3 SQLite 全文搜索（FTS5）

**技术依据**：SQLite FTS5 虚拟表（glebarez/sqlite 支持）

**功能**：为 `memories.text` 建立全文搜索虚拟表，支持中文分词搜索。比 2.3 的内存索引更持久，且支持重启后恢复。

**产品价值**：用户想找"那天下雨"的回忆，直接搜文字。比按城市/标签翻找快得多。

**落地复杂度**：中。FTS5 虚拟表 + 触发器同步。中文需要 `simple` tokenizer 或外部分词。如果 2.3 的内存索引够用，可以先不做 FTS5。

**落点**：
```
backend/db/migrations/fts.go
backend/repositories/search_repo.go
```

### 4.4 数据导出为关系时间线长图

**技术依据**：GORM 聚合查询 + Go 模板渲染

**功能**：`GET /memories/export/timeline` 返回一个聚合数据包，前端或服务端渲染成一张可分享的时间线长图（不是 PDF，是图片）。

**产品价值**：情侣想把"我们的故事"分享给朋友、印成实体纪念册。这是付费功能的好卖点。

**落地复杂度**：中。聚合查询复用现有 repo，渲染用 Go `image` 库或前端 `html2canvas`。

---

## 五、AI 能力

项目已经集成了 `DEEPSEEK_API_KEY` 和 `handlers.PolishMemory`（AI 润色回忆文字）。这条线可以延伸。

### 5.1 回忆智能补全提示

**技术依据**：DeepSeek API（已有）

**功能**：用户写回忆时，如果他只写了几个词（如"西湖 雨天 那家店"），点击"帮我展开"，AI 根据这几个词 + 已有的历史回忆风格，生成一段建议文字。用户可以采纳、修改或忽略。

**产品价值**：降低记录摩擦。第一篇文档里"主动记录者"需要低摩擦入口。不是替用户写，是帮用户起头。

**落地复杂度**：低。复用现有 `PolishMemory` 的 API 调用模式，改 prompt 为"扩写"而非"润色"。

**落点**：
```
backend/handlers/memory.go    // POST /ai/memory-expand
backend/services/ai_service.go // 可复用现有 polish 逻辑
```

**注意**：必须明确标注"AI 建议"，让用户知道这不是自己写的。浪漫来自真实的细节，AI 只是帮起头。

### 5.2 纪念日回放文案生成

**技术依据**：DeepSeek API + 事件触发

**功能**：纪念日回放页（第一篇文档的功能）生成时，AI 根据那天的回忆内容，生成一句简短的回放导语，如"那天你们在杭州的雨里走了很久"。

**产品价值**：让回放页有"旁白感"，不是纯数据罗列。但只用一句，不生成大段文字。

**落地复杂度**：低。在 1.1 的定时器触发 `AnniversaryNear` 时，后台生成导语并缓存。

### 5.3 照片场景描述（可选）

**技术依据**：DeepSeek 多模态（如果支持）或外部视觉 API

**功能**：上传照片时，AI 识别照片内容（"海边""咖啡馆""夜景"），自动建议标签。

**产品价值**：减少手动打标签的摩擦。

**落地复杂度**：高。需要多模态模型，且 DeepSeek 不一定支持。建议作为后期探索，不优先。

---

## 六、对象存储能力

`storage` 包支持 S3 / 本地双模式，已经有 `UploadLocalObjectToS3`、`DeleteObject` 等完整能力。

### 6.1 照片版本管理

**技术依据**：`storage.ObjectStorage` + key 命名规范

**功能**：每张照片存原始版 + 缩略版 + 封面版，用 key 后缀区分（`memories/xxx.jpg`、`memories/xxx_thumb.jpg`、`memories/xxx_cover.jpg`）。

**产品价值**：列表用缩略图、详情用原图、地图用封面图，按需加载，移动端流量减半。

**落地复杂度**：中。结合 1.2 的图片处理 worker，上传时生成多版本。

### 6.2 音频回忆（语音日记）

**技术依据**：`storage.ObjectStorage` 上传 + 前端 MediaRecorder

**功能**：支持录制一段语音作为回忆，存到 OSS。播放时用音频播放器。

**产品价值**：有些情绪打字表达不出来，说一句话更真实。语音比文字更有"在场感"。

**落地复杂度**：中。后端只是多一种 PhotoInput 类型（改为 MediaInput），前端需要录音组件。可结合 5.1 的 AI 把语音转文字做索引。

**落点**：
```
backend/models/models.go       // Photo 加 MediaType 字段
backend/handlers/upload.go      // 支持音频 mime
apps/web/components/memories/   // VoiceRecorder 组件
```

---

## 七、中间件与安全能力

### 7.1 请求限流（速率限制）

**技术依据**：Gin middleware + `golang.org/x/time/rate` token bucket

**功能**：对 `POST /auth/login`、`POST /upload` 加速率限制，防止暴力破解密码和滥用上传。

**产品价值**：安全加固，不直接面向用户但对商业化（买断制）很重要。

**落地复杂度**：低。一个 middleware，按 IP + endpoint 做 token bucket。

**落点**：
```
backend/middleware/ratelimit.go
backend/main.go    // 注册到对应路由
```

### 7.2 操作审计（用户端）

**技术依据**：现有 `AuditLog` 模型（目前只给 admin 用）

**功能**：把审计日志扩展到用户端，记录"谁在什么时候删除了谁的回忆""谁打开了胶囊"。

**产品价值**：情侣间的信任感——"我能看到我们一起做过什么"。不是监控，是共同账本。

**落地复杂度**：低。复用 `AuditLog` 表，加一个 `UserID` 字段。

---

## 八、多端能力（已有 apps 目录）

项目已经有 `web`、`admin`、`mobile`、`miniprogram`、`desktop` 五个端。这是很大的优势。

### 端优先级：手机先行

情侣记录回忆的真实场景绝大多数在手机上，`apps/mobile`（Capacitor / Android）和 `apps/miniprogram`（微信小程序）是基准端，`apps/web` 是放大版。这条原则会反过来影响前面所有功能的落地形态：

- **实时通道要能离线降级**：WebSocket（2.1）在手机端断连是常态（地铁、漫游、后台被杀），必须退化成"上次同步的痕迹"而不是转圈等待。悄悄话"正在写"在弱网下宁可静默也不显示假状态。
- **推送走系统级，不要自造**：胶囊到期、纪念日临近（1.1 定时器）的触达，手机端走微信小程序订阅消息或 Capacitor 本地推送，不要指望用户常驻应用内通知中心（2.2）。通知中心是"补看"，不是"触达"。
- **触屏没有 hover**：所有在 web 上靠 `onHoverStart` 的预览（`ProvinceMapCanvas` 现状），手机端必须有 tap / long-press 等价路径，否则功能等于不存在。
- **分享走系统相册 + 微信转发**：导出长图（4.4）、周年影片，手机端终点是"存到相册 / 发给微信好友"，必须走端原生分享，不要依赖 `html2canvas` 这类 web 截图方案。
- **首屏和流量更敏感**：3.2 热点回忆预加载、1.2 缩略图，在手机端的收益比桌面端大得多，应优先按手机端指标验收。

### 8.1 小程序端的"想你信号"快捷入口（最高优先）

**技术依据**：微信小程序 + 后端 API

**功能**：小程序首页放一个"戳一下"按钮，点击直接发送想你信号，不需要进地图。

**产品价值**：微信是国内情侣最自然的沟通场景。从微信里"戳一下"比打开独立 App 轻得多。这是获客 + 留存的入口。

**落地复杂度**：中。需要小程序端开发 + 后端 `POST /signals` 接口。

### 8.2 桌面端的"回忆壁纸"

**技术依据**：desktop 端（Electron 或 Tauri）

**功能**：桌面端定时拉取最新回忆照片，设为壁纸或屏保。

**产品价值**：让回忆进入日常生活，不是只有打开应用才看到。

**落地复杂度**：高。需要桌面端原生能力，且壁纸 API 各平台不同。作为长期探索。

---

## 九、AI agent 能力

区别于第五节的"单次 DeepSeek 调用"（润色/扩写/回放导语），agent 指有持续上下文、能主动从数据里发现东西并提议的角色。在情侣回忆应用里，agent 的定位是"安静的策展人 / 编辑助手"，不是"替你们说话的第三人"。

### 红线（所有 agent 共用）

1. **不替两人写回忆**。永远不把 AI 生成的正文直接落库为 `memory.text`；5.1 的扩写必须用户确认且标注"AI 建议"。
2. **不评价关系好坏**。不做"你应该多陪 TA"这类情感建议，AI 不介入关系本身。
3. **不单方施压**。不做"TA 最近都没记"这类只给一方看的施压分析；关系节律数据若做，必须两人共同可见且不附 AI 评判。
4. **默认可关**。所有主动行为默认关，用户在设置里开。情侣应用的信任感比智能感重要。
5. **忽略要被记住**。agent 产出的建议都带"忽略"按钮，忽略结果落 `agent_feedback` 表，避免反复推同一个。

### 9.1 暗号策展 agent

**技术依据**：后台 goroutine + 周期扫描 `memory.text` + DeepSeek

**功能**：扫描两人的回忆文字，发现高频私密词、地点组合（"蓝色便利店""那天的风"），主动建议"要不要把这个设成暗号？"，并附一句从原文摘的来由。用户一键采纳或忽略。

**产品价值**：暗号标签（瞬间七）的最大门槛是"想不出该叫什么"。agent 从你们自己的语言里挖，比预设模板有归属感得多。

**落地复杂度**：中。文本聚合 + 一次 DeepSeek 调用做候选筛选。结果落 `tag_suggestions` 表，下次打开暗号管理页时展示，不打扰首页。

**落点**：
```
backend/jobs/tag_curator.go        // 周期扫描，限频
backend/handlers/tag_suggestion.go // GET /tag-suggestions, POST /tag-suggestions/:id/ignore
backend/models/models.go           // TagSuggestion, AgentFeedback
```

### 9.2 跨回忆串联 agent（"那年同一天"）

**技术依据**：GORM 聚合 + memory 打开事件

**功能**：用户打开一条 memory 时，agent 静默查"同城市 / 同日期往年 / 同暗号"的其他回忆，在 `MemoryDetailSheet` 底部出现一行极小的"两年前的今天你们也在杭州"。只一句话、一个跳转链接。

**产品价值**：把纪念日回放（瞬间四）的"重逢感"下沉到日常，不必等到周年。成本极低，情绪价值高。

**落地复杂度**：低。纯后端聚合，不需要 LLM——叫 agent 是因为它按上下文主动决定"显示哪条"。可先用真实原文片段，不生成文案。

**落点**：
```
backend/handlers/memory.go   // GetMemory 响应附 relatedEcho 字段
```

### 9.3 胶囊封存前审查 agent

**技术依据**：DeepSeek + 创建事件

**功能**：创建胶囊提交前，agent 读内容，只在有明显问题时拦一下——"这张照片有定位水印，确定封存？""这段提到的日期还在未来，是不是写错了""内容里有第三方名字，要不要确认"。不当文案写手，只做最后一道防呆。

**产品价值**：胶囊一旦封存要等很久才打开，封存时的小错会变成多年后的遗憾。agent 在这里是"细心的另一个自己"。

**落地复杂度**：低-中。一次轻量调用，prompt 限定为"只挑事实性问题，不评价情感"。手机端弹一个轻 sheet 让用户确认。

**落点**：
```
backend/handlers/timecapsule.go   // Create 前的预检
apps/web, apps/mobile             // 封存确认 sheet
```

### 9.4 照片反问 agent（多模态，后期）

**技术依据**：DeepSeek 多模态 / 视觉 API + 上传事件

**功能**：上传照片后，agent 不写文案，而是反问一句"这张是在海边吧？想记一句话吗？"。用提问降低记录摩擦，而不是替写（区别于 5.1 的"帮我展开"直接给文案）。

**产品价值**：5.1 是"用户写不出时 AI 接手"，9.4 是"用户懒得写时 AI 搭话"。前者给答案，后者给起点。对手机端单手场景，被问一句比看到一段建议更轻。

**落地复杂度**：高。需要多模态，且 DeepSeek 不一定支持。建议在 5.1 验证可用后再做。

**落点**：
```
backend/handlers/upload.go          // 上传后异步触发
apps/web, apps/mobile               // 上传完成态显示反问气泡
```

### 9.5 记录摩擦诊断 agent（极克制）

**技术依据**：周期扫描 + 聚合

**功能**：agent 周期性看"哪条 memory 只有照片没文字、哪条只有几个字、哪条日期缺失"，在用户再次打开那条回忆时轻提示"那天你只传了照片，要不要补句话"。不在首页推，不通知。

**产品价值**：回忆的密度比数量重要。这个 agent 是"慢补全"，把 5.1 的当场扩写延后到"事后愿意补的时候"。

**落地复杂度**：低。纯聚合，不需要 LLM。

**落点**：
```
backend/jobs/memory_diagnostic.go
apps/web/components/memories/MemoryDetailSheet.tsx   // 底部条件渲染提示
```

**风险**：必须可关，且永远只在"用户主动打开该回忆"时出现，不能主动弹——否则变成催促，违反红线 3。

### 工程原则补充

- agent 调用 DeepSeek 的成本要监控，周期性 agent（9.1 / 9.5）用 cron 限频，不要每次请求都调。
- agent 的所有"主动行为"走 `events.Dispatcher` 还是直接 goroutine，按是否需要联动其他 Publisher 决定；9.3 的封存审查建议走同步预检（用户在等），其余走后台。

---

## 优先级矩阵

按"产品价值 × 落地可行性"排序，推荐分三批落地：

### 第一批（技术基础 + 高价值）

| 功能 | 依据技术 | 产品价值 | 复杂度 |
| --- | --- | --- | --- |
| WebSocket 实时通知 | events.Publisher + goroutine | 极高（所有实时动效的底座，手机端需离线降级） | 中 |
| 通知中心 | events.Publisher + GORM | 高（离线补看；触达仍靠小程序订阅消息/本地推送） | 低-中 |
| 定时触发器（胶囊/纪念日） | goroutine + ticker | 高（主动推送基础） | 低 |
| 回收站（软删除） | GORM DeletedAt | 高（防误删/后悔，OSS 延迟删除） | 低 |
| 小程序"想你信号"快捷入口 | 多端 + signals API | 高（手机端获客+留存，微信是情侣最自然的场景） | 中 |

### 第二批（体验增强）

| 功能 | 依据技术 | 产品价值 | 复杂度 |
| --- | --- | --- | --- |
| 异步图片处理（缩略图/EXIF） | goroutine + worker pool | 中-高（移动端弱网/流量优先验收） | 中 |
| 时间线视图 | GORM 排序 | 中（新叙事视角） | 低 |
| 回忆智能补全（5.1） | DeepSeek API | 中（降摩擦） | 低 |
| 跨回忆串联 agent（9.2） | GORM 聚合 | 中-高（日常重逢感，无 LLM 成本） | 低 |
| 暗号策展 agent（9.1） | 后台扫描 + DeepSeek | 中（暗号功能的最大障碍是起名） | 中 |
| 胶囊封存前审查 agent（9.3） | DeepSeek 同步预检 | 中（防多年后的遗憾） | 低-中 |
| 记录摩擦诊断 agent（9.5） | 周期聚合 | 中（慢补全，须可关） | 低 |
| 搜索（内存倒排索引） | events.Publisher | 中（回忆多了之后刚需） | 中 |
| 周报生成 | goroutine + 聚合 | 中（低压力回顾） | 中 |

### 第三批（长期探索）

| 功能 | 依据技术 | 产品价值 | 复杂度 |
| --- | --- | --- | --- |
| 音频回忆 | storage + 前端录音 | 中（新表达形式） | 中 |
| FTS5 全文搜索 | SQLite FTS5 | 中（搜索增强） | 中 |
| 导出长图（走系统相册/微信分享） | GORM + 渲染 + 端原生分享 | 中-高（付费卖点，手机端终点是相册不是截屏） | 中-高 |
| 照片反问 agent（9.4） | DeepSeek 多模态 | 中（待 5.1 验证后再做） | 高 |
| 照片版本管理 | storage | 低-中 | 中 |
| 桌面壁纸 | desktop 端 | 低（锦上添花） | 高 |

---

## 关键工程原则

在落地这些功能时，应该遵守项目已有的工程纪律：

### 1. 不过早抽接口

项目目前只在副作用边界（`events.Publisher`、`storage.ObjectStorage`、`PhotoUploader`）用了接口。新增功能保持这个习惯——不要为每个 repository 先抽 interface，直接用 struct。只有真正需要多实现或测试替换时才抽。

### 2. 保持单进程部署简洁

项目最大的优势是单二进制部署（`./dist/our-memories-api` 一个进程搞定 API + Web + Admin）。不要因为一个功能引入 Redis、ES、RabbitMQ。所有"需要后台服务"的功能（WebSocket hub、缓存、搜索索引、通知）都在进程内用 goroutine + channel + 内存结构实现。SQLite + 内存缓存 + goroutine 足够支撑情侣应用这个量级（单 space 两个用户，总 space 数百到数千）。

### 3. events.Dispatcher 是中枢

几乎所有新功能都可以通过"新增一个 `events.Publisher` 实现"来接入，而不是改现有的 service 代码。这是项目已经搭好的扩展点，应该充分利用：
- WebSocket 推送 → `WebSocketPublisher`
- 通知持久化 → `NotificationPublisher`
- 搜索索引 → `SearchIndexer`
- 图片处理 → `ImageProcessor`

在 `main.go` 的初始化里把它们注册进 `NewDispatcher(...)` 即可，现有 service 一行不用改。

### 4. 前端复用现有组件

前端已经有成熟的 sheet 组件（`MemoryCitySheet`、`MemoryDetailSheet`）、地图组件（`ProvinceMap`）、编辑 hook（`useMemoryEditor`）。新功能的 UI 尽量落到这些现有组件上，避免新建平行组件。`OPTIMIZATION_GUIDE.md` 提到的"地图抽 hook"方向要继续坚持。

### 5. 测试用真实行为验证

项目有 `backend/services/service_test.go`。新增 service 方法时，用真实 SQLite（`:memory:`）测试，不要 mock 到只剩语法检查。新增 WebSocket/通知功能时，至少写一个端到端的连接测试。

---

## 与情侣体验文档的对应关系

这份技术文档的每个功能点，都能映射到 `couple-experience-animations-and-rituals.md` 里的某个情感瞬间：

| 情感瞬间 | 技术支撑 |
| --- | --- |
| 开门那一刻（首图随时间） | 无新后端，前端 `EntryExperience` 按小时切图 |
| 知道对方刚刚来过 | WebSocket 实时通知 + 通知中心 + `MemoryViewed` 事件 |
| 等待的重量（胶囊仪式） | 定时触发器 + `open_mode` 字段 + WebSocket 同步 |
| 重逢某一天（纪念日回放） | 定时触发器 + `GET /anniversaries/:id/replay` 聚合 |
| 不用说话也在（想你信号） | `signals` 表 + `SignalCreated` 事件 + WebSocket |
| 一起走过的路（路线） | GORM 聚合 + 前端路线几何 hook |
| 只属于我们的暗号 | `Memory.Tags` + 前端 UI 升级 |
| 每年的礼物（周年影片） | 周报生成 + 聚合查询 + 渲染 |

技术能力是骨架，情感瞬间是血肉。两者配合，Our Memories 才能从"回忆相册"变成"关系容器"。

### 横切补充：手机优先与 AI agent

- **手机优先**是所有瞬间的落地基准：实时通道要离线降级、推送靠系统级、分享走相册/微信、触屏用 tap/long-press 替代 hover。桌面端是放大版而非基准版。
- **AI agent**（第九节）的角色是安静的策展人：从两人的数据里发现暗号、串联那年同一天、封存前防呆、事后慢补全。红线是不替两人说话、不评价关系、不单方施压、默认可关。agent 给体验文档里的"暗号""重逢""胶囊仪式"提供低成本增强，但绝不替代真实的细节。
