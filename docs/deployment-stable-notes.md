# Our Memories 稳定部署记录

## 目标架构

- 服务器：1Panel + Docker Compose
- 镜像构建：GitHub Actions 构建并推送到 GHCR
- 服务器部署：只拉取镜像，不在服务器上构建
- Web/API/Admin：同一个 Go 服务提供
- 数据库：SQLite，挂载到 Docker volume
- APK：在线版 APK，通过 `CAPACITOR_SERVER_URL` 加载服务器页面

## 关键地址

- Web：首页 `http://your-server-ip:8080/`
- Admin：`http://your-server-ip:8080/admin/`
- API：`http://your-server-ip:8080/api/v1`
- 健康检查：`http://your-server-ip:8080/health`

## GitHub Secrets / Variables

GitHub 仓库路径：

```text
Settings -> Secrets and variables -> Actions
```

Secrets：

```text
CAPACITOR_SERVER_URL=http://your-server-ip:8080
```

Variables：

```text
CAPACITOR_ALLOW_HTTP=1
```

说明：

- `CAPACITOR_SERVER_URL` 不写进代码仓库
- 使用 HTTP 裸 IP 构建在线 APK 时，必须设置 `CAPACITOR_ALLOW_HTTP=1`
- 如果后续有域名和 HTTPS，把 `CAPACITOR_SERVER_URL` 改成 `https://your-domain`

## 1Panel docker-compose.yml

```yaml
services:
  api:
    container_name: our-memories-api
    image: "${OUR_MEMORIES_IMAGE:-ghcr.io/qq570850096/our-memories:latest}"
    pull_policy: always
    env_file:
      - .env
    environment:
      PORT: "8080"
      DATABASE_PATH: "/app/data/ourMemories.db"
      PUBLIC_DIR: "/app/public"
    ports:
      - "8080:8080"
    volumes:
      - api-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  api-data:
```

## 1Panel .env

```env
OUR_MEMORIES_IMAGE=ghcr.io/qq570850096/our-memories:latest

JWT_SECRET=replace-with-a-long-random-secret

ALLOWED_ORIGINS=http://your-server-ip:8080,http://your-server-ip,capacitor://localhost,http://localhost,https://localhost

DEFAULT_SPACE_CODE=our-space-2026
DEFAULT_PASSWORD=<your-strong-space-password>

ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-admin-password
ADMIN_DISPLAY_NAME=Admin User

AUTO_SEED=false

S3_ENDPOINT=
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=our-memories
S3_PUBLIC_BASE_URL=
S3_OBJECT_ACL=
```

生成 JWT：

```bash
openssl rand -base64 32
```

## 首次部署步骤

1. GitHub Actions 确认 `Build Docker Image` 成功。
2. 服务器登录 GHCR。

```bash
docker login ghcr.io -u qq570850096
```

3. 在 1Panel 创建 Compose 编排。
4. 填入 `docker-compose.yml`。
5. 配置 `.env`。
6. 启动服务。
7. 测试健康检查。

```bash
curl http://your-server-ip:8080/health
```

成功返回：

```json
{"ok":true}
```

## 更新部署

每次代码更新后：

1. GitHub Actions 自动构建新镜像。
2. 服务器拉取并重启。

```bash
docker compose pull
docker compose up -d
```

## APK 构建

进入 GitHub：

```text
Actions -> Build Android APK -> Run workflow
```

可以不填参数，默认读取：

- `CAPACITOR_SERVER_URL`
- `CAPACITOR_ALLOW_HTTP`

构建成功后下载 artifact：

```text
our-memories-debug.apk
```

## 登录失败排查

登录接口：

```text
POST /api/v1/auth/login
```

前端默认使用：

```json
{
  "spaceCode": "our-space-2026",
  "password": "<your-strong-space-password>",
  "userId": "me"
}
```

如果返回 401：

```text
Invalid space code or password
```

说明：

- 服务是正常的
- 不是浏览器问题
- 是数据库中的空间码或密码不匹配

注意：

- `DEFAULT_PASSWORD` 只在数据库为空时初始化
- 如果 SQLite 已经有数据，修改 `.env` 不会覆盖旧密码
- 替换数据库后需要重启容器

```bash
docker compose restart api
```

## 数据库替换

数据库位置：

```text
/app/data/ourMemories.db
```

使用 Docker volume：

```text
api-data:/app/data
```

替换数据库后必须重启：

```bash
docker compose restart api
```

如果是全新部署且不保留数据，可以删除 volume 后重建：

```bash
docker compose down
docker volume ls | grep api-data
docker volume rm our-memories_api-data
docker compose up -d
```

## 常见问题

### 服务器 2c2g 部署失败

不要在服务器 build 镜像。

用 GitHub Actions 构建镜像，服务器只拉取运行。

### `Can't resolve 'swr'`

原因：web workspace 没声明 `swr`。

已修复：`apps/web/package.json` 中增加 `swr`。

### APK 构建卡 Android SDK

原因：旧 workflow 默认安装过时 Android SDK tools。

已修复：workflow 显式安装：

```text
platform-tools
platforms;android-36
build-tools;36.0.0
```

### 在线 APK 必须用 HTTPS 吗

正式公开分发建议 HTTPS。

裸 IP / HTTP 只建议私有分发，并设置：

```text
CAPACITOR_ALLOW_HTTP=1
```

## Obsidian 复制出现很多空行的原因

如果从聊天窗口、网页预览、GitHub 预览或 Obsidian 阅读模式复制 Markdown，复制到的通常不是纯 Markdown 源码，而是渲染后的 HTML 块。

粘贴时，Obsidian 可能把段落、列表、代码块之间的 HTML 间距转换成额外空行。

建议：

- 从 `.md` 文件源码复制
- 在 Obsidian 使用源码模式粘贴
- 使用 `Ctrl+Shift+V` 粘贴为纯文本
- 不要从渲染预览态复制 Markdown
