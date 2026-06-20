# API 国内访问加速与缓存更新方案

## 背景

当前 Web/移动端直连部署在美国节点的 API。国内用户每次进入页面都要跨境请求核心接口，同时前端多个组件会重复请求同一份数据，例如 `/api/v1/memories` 会被地图、首页侧栏、随机相框、回忆列表分别拉取，并且不少请求显式使用 `cache: "no-store"`。结果是页面切换时容易重新出现骨架屏或空状态，交互体感被远距离网络放大。

## 目标

- 国内首屏和切页不再依赖每个组件重新请求美国 API。
- 常用 GET 数据在同一次浏览会话内共享缓存，写操作后主动刷新缓存。
- 部署链路支持从美国单点平滑迁移到国内或亚洲近端节点。
- 图片和静态资源走对象存储/CDN，API 只处理 JSON 和鉴权。

## 部署方案

### 推荐方案：国内/香港近端 API + 对象存储 CDN

1. 将 Go API 服务部署到香港、新加坡、日本或中国大陆合规云节点。优先选香港或新加坡，通常不需要把业务一次性迁到大陆合规链路，又能显著降低国内访问时延。
2. SQLite 数据库挂载在同区域持久盘；如果后续多人高并发或多节点部署，再升级为同区域 PostgreSQL。
3. 图片上传改用 S3 兼容对象存储，并配置靠近国内用户的 CDN 域名作为 `S3_PUBLIC_BASE_URL`。
4. 前端保持静态导出，可部署在 CDN 或对象存储静态站点；构建时注入 `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`。
5. API 域名接入 HTTPS 反向代理，例如 Nginx/Caddy/云负载均衡，并将 `ALLOWED_ORIGINS` 精确设置为 Web 域名和移动端 origin。

### 过渡方案：国内边缘代理

如果短期不能迁移 API，可以先加一个靠近国内的反向代理：

- `https://api-cn.example.com` 转发到美国源站。
- 对 `/health`、静态公开资源设置短缓存。
- 对鉴权 JSON 接口不在边缘缓存用户数据，只复用连接、TLS 和路由优化。

这个方案能减少握手和路由损耗，但数据库和业务计算仍在美国，收益不如 API 近端部署。

## 应用缓存方案

### 前端缓存

1. 统一使用 SWR 读取 GET 接口，缓存 key 使用规范路径，例如 `/api/v1/memories`。
2. 在根布局挂载 `ApiCacheProvider`，提供全局内存缓存，并把可序列化响应写入 `sessionStorage`。
3. 设置 5 分钟去重窗口，页面切换时直接复用旧数据，避免重复 loading。
4. 写操作成功后调用统一发布函数更新 SWR 缓存，并广播现有的 `mapofus:memories-updated` 事件。
5. 对编辑后强一致要求高的页面，只在用户触发保存/删除后主动 `mutate`，不在每次 mount 时强制重拉。

### 后端缓存与 HTTP 头

短期优先前端缓存。后端后续可以补两层：

- 对 `/api/v1/memories`、`/api/v1/city-assets`、`/api/v1/settings` 生成 `ETag`，客户端携带 `If-None-Match` 时返回 `304`。
- 对只读且低频变化的接口设置 `Cache-Control: private, max-age=60, stale-while-revalidate=300`。包含个人内容的接口不要使用公共 CDN 缓存。

## 已落地的第一阶段改动

- 新增 `apps/web/lib/apiCache.tsx`：全局 SWR 缓存 Provider，同会话内复用 GET 响应。
- 新增 `apps/web/lib/memoryStore.ts`：统一 `/api/v1/memories` 的读取和写后缓存同步。
- 将地图、首页进度、随机相框、最近回忆等重复读取 `/memories` 的组件改为共享缓存。

## 后续实施清单

- 将纪念日、悄悄话、时光胶囊、地点收藏等列表页也迁移到统一 `useApi` hook。
- 为 API 增加 `ETag`/`304`，降低跨区域重验证流量。
- 部署一个香港或新加坡 API 预发环境，使用生产前端切换 `NEXT_PUBLIC_API_BASE_URL` 做 A/B 延迟对比。
- 把图片从 data URL 迁移到对象存储，避免 JSON 响应过大。
- 增加简单埋点：记录每个 API 的 P50/P95、失败率、缓存命中后的页面可交互时间。
