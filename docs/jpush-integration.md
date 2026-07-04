# 极光推送集成与联调文档

本文档记录当前项目的极光推送集成方式、配置项、本地联调步骤和排障清单。极光 `Master Secret` 只能放在后端环境变量中，不能写入前端代码、Android 包或公开文档。

## 当前链路

1. Android 应用启动时在 `OurMemoriesApp` 初始化 JPush SDK。
2. Capacitor 原生插件 `JPushPlugin` 负责申请通知权限并读取 `registrationId`。
3. Web 运行时 `apps/web/lib/pushRegistration.ts` 只在 Capacitor 原生环境执行设备登记。
4. 前端调用后端 `POST /api/v1/push/devices`，后端写入 `push_devices` 表。
5. 业务事件进入后端事件分发器后，同时触达站内通知、WebSocket 和 JPush。
6. JPush 作为离线触达通道；站内通知列表作为补看通道。

关键文件：

- Android 初始化：`apps/mobile/android/app/src/main/java/com/mapofus/mobile/OurMemoriesApp.java`
- Android 原生插件：`apps/mobile/android/app/src/main/java/com/mapofus/mobile/JPushPlugin.java`
- Android 通知点击处理：`apps/mobile/android/app/src/main/java/com/mapofus/mobile/JPushReceiver.java`
- Android Manifest：`apps/mobile/android/app/src/main/AndroidManifest.xml`
- Web 设备登记：`apps/web/lib/pushRegistration.ts`
- 后端接口：`backend/handlers/push.go`
- 后端推送服务：`backend/services/push_service.go`
- 后端事件发布器：`backend/events/jpush_publisher.go`

## 配置

### 后端环境变量

在 `backend/.env` 中配置：

```dotenv
JPUSH_APP_KEY=极光应用 AppKey
JPUSH_MASTER_SECRET=极光应用 Master Secret
```

本地启动还需要保证基础配置可用：

```dotenv
PORT=8080
DATABASE_PATH=./data/ourMemories.db
JWT_SECRET=至少 24 个字符的本地开发密钥
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:3003
DEFAULT_PASSWORD=至少 8 个字符的本地空间密码
AUTO_SEED=true
```

`JPUSH_MASTER_SECRET` 只允许出现在后端运行环境中。Android 端只配置 AppKey，不能包含 Master Secret。

### Android 配置

`apps/mobile/android/app/build.gradle` 中的 Manifest 占位符需要和极光控制台应用保持一致：

```gradle
manifestPlaceholders = [
    JPUSH_PKGNAME : applicationId,
    JPUSH_APPKEY  : "极光应用 AppKey",
    JPUSH_CHANNEL : "developer-default",
]
```

检查项：

- `applicationId` 必须与极光控制台配置的 Android 包名一致。
- `JPUSH_APPKEY` 必须属于同一个极光应用。
- `AndroidManifest.xml` 中保留 `OurMemoriesApp`、`JPushCoreService`、`JPushReceiver`、`INTERNET` 和 `POST_NOTIFICATIONS`。
- Android 13 及以上必须授予通知权限，否则 SDK 可以注册但系统不会展示通知。

## 后端接口

所有接口都在 `/api/v1` 下，并需要登录态。

### 登记设备

`POST /api/v1/push/devices`

请求体：

```json
{
  "platform": "android",
  "registrationId": "JPush registration id",
  "deviceModel": "device or user agent",
  "appVersion": "1.0.0"
}
```

行为：

- `registrationId` 为空会返回 400。
- 已存在的 `registrationId` 会更新所属空间、用户、设备信息并重新启用。
- 新设备写入 `push_devices`，默认 `enabled = 1`。

### 发送测试推送

`POST /api/v1/push/test`

请求体：

```json
{
  "title": "我们的回忆",
  "content": "极光推送测试成功。"
}
```

常见响应：

- `200`：请求已提交给极光。
- `404 No push devices registered`：当前空间没有登记设备。
- `503 JPush is not configured`：后端缺少 `JPUSH_APP_KEY` 或 `JPUSH_MASTER_SECRET`。
- `502 Failed to send push`：极光接口返回错误或网络失败，需要查看后端日志。

## 事件触发范围

当前 `backend/events/jpush_publisher.go` 会为以下事件生成推送：

- `memory.created`
- `memory.updated`
- `memory.deleted`
- `time_capsule.due`
- `time_capsule.opened`
- `anniversary.near`
- `signal.created`
- `whisper.created`
- `whisper.replied`

推送发送给同一空间内除事件发起人以外的已启用设备。没有可发送设备时，后端只记录日志并跳过，不阻断主业务流程。

## 本地联调步骤

### 1. 启动服务

从仓库根目录启动后端：

```bash
npm run dev:server
```

从仓库根目录启动 Web：

```bash
npm run dev:web
```

默认地址：

- Web：http://localhost:3002
- API：http://localhost:8080/api/v1
- 健康检查：http://localhost:8080/health

### 2. 构建并安装 Android 包

Android 需要可用的 JDK 和 Android SDK。处理 Manifest 的最低检查命令：

```bash
cd apps/mobile/android
./gradlew :app:processDebugMainManifest
```

如需安装到设备：

```bash
cd apps/mobile/android
./gradlew :app:installDebug
```

首次打开 App 后，查看 Android 日志确认 JPush 返回了 `registrationId`：

```bash
adb logcat | grep OurMemoriesJPush
```

### 3. 触发设备登记

登录 App 后，前端会调用 `registerCurrentDeviceForPush()`：

- 非 Capacitor 原生环境直接跳过，不会在桌面浏览器登记设备。
- Android 13 及以上会先申请通知权限。
- 读取到 `registrationId` 后调用 `POST /api/v1/push/devices`。
- 同一个 `registrationId` 已经登记过时，前端会用 `localStorage` 避免重复请求。

如果需要手动验证，可以用登录后的 Bearer Token 调用：

```bash
curl -X POST http://localhost:8080/api/v1/push/devices \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","registrationId":"<registration-id>","deviceModel":"manual-test"}'
```

### 4. 发送测试推送

```bash
curl -X POST http://localhost:8080/api/v1/push/test \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"本地测试","content":"极光推送链路已打通"}'
```

成功后检查：

- Android 系统通知栏出现通知。
- 后端没有 `jpush returned ...` 或 `skip jpush ...` 错误日志。
- 极光控制台的推送统计能看到请求。

### 5. 验证业务事件推送

准备两个同空间账号 A、B：

1. B 在 Android App 登录并完成设备登记。
2. A 在 Web 或 App 创建一条回忆、想你信号或悄悄话。
3. B 应收到 JPush 通知。
4. B 在线时还应通过 WebSocket 收到实时刷新。
5. B 打开通知列表时能通过 `GET /api/v1/notifications` 看到站内通知。

## 排障清单

- `503 JPush is not configured`：检查后端进程是否读取到 `JPUSH_APP_KEY` 和 `JPUSH_MASTER_SECRET`。
- `404 No push devices registered`：确认 Android App 已登录、已授权通知权限，并且 `POST /push/devices` 成功。
- 没有 `registrationId`：确认 AppKey、包名和极光控制台一致；检查设备网络；查看 `OurMemoriesJPush` 日志。
- Android 13+ 不显示通知：检查系统通知权限是否授予。
- 桌面浏览器没有登记设备：符合预期，当前只支持 Capacitor 原生 Android。
- 推送接口 502：查看后端日志里的极光响应，常见原因是 AppKey/Secret 不匹配、registrationId 无效或极光服务返回错误。
- 自己发的业务事件没有收到推送：符合预期，事件推送会排除发起人，只发给同空间其他用户。
- 厂商通道不稳定：先验证极光基础通道；需要稳定后台触达时，再补齐华为、小米、OPPO、vivo、荣耀等厂商通道参数并在真机验证。

## 本次本地服务状态

当前本机已检测到服务运行：

- 后端：`http://localhost:8080/health` 返回 `{"ok":true}`。
- Web：`http://localhost:3002` 返回 HTTP 200。
- 默认空间 `our-space-2026`、用户 `me` 登录成功，`GET /api/v1/me` 返回 HTTP 200。

Android Manifest 检查依赖本机 Java/JDK。若出现 `JAVA_HOME is not set and no 'java' command could be found in your PATH`，先安装 JDK 并设置 `JAVA_HOME` 后再运行 Gradle 检查。
