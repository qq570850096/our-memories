# 我们的回忆

“我们的回忆”是一个给两个人使用的私密情侣空间。它把地图、照片、纪念日、地点收藏、悄悄话和时光胶囊放在同一个空间里，让共同生活的轨迹可以被记录、整理和回看。

项目采用在线优先架构：Web 前端连接自托管后端，数据保存在自己的 SQLite 数据库中，图片可选择继续留在本地 data URL，或接入 S3/OSS/R2 等兼容对象存储。

## 产品功能

- 私密双人空间：通过空间码、四位密码和双人身份进入，只属于两个人的内容空间。
- 地图回忆：在中国地图上点亮去过的城市，按城市查看回忆、照片、地点、心情、标签和对方备注。
- 回忆归档：支持新增、编辑、删除回忆，记录日期、城市、地点、正文、多图和可见范围。
- 纪念日墙：保存重要日期，支持置顶、每年重复、照片和备注，用来管理节日、相识日、旅行日等特殊时刻。
- 地点收藏：提前收好想一起去的地方，和地图、城市数据一起形成旅行愿望清单。
- 悄悄话：两个人可以创建私密话题并持续回复，适合放只想慢慢说的话。
- 时光胶囊：写给未来的内容可以设置开启日期，未到期时对非创建者隐藏正文。
- 登录照片墙：可配置登录页展示的城市照片和文案，让入口也带有两个人的仪式感。
- 旅行攻略草稿：后端提供旅行攻略、草稿、接受草稿等接口，便于后续把 AI 或人工整理的行程沉淀为正式攻略。
- AI 文案润色：配置 DeepSeek API 后，可对回忆文本进行润色；未配置时会原样返回，不影响本地使用。
- 备份导入导出：后端提供备份接口，便于迁移或保留空间数据。
- 多端壳子：仓库包含 Next.js Web、Taro 小程序、Capacitor Android 和 Electron 桌面端基础工程。

## 项目结构

- `apps/web`：Next.js + React Web 前端，默认端口 `3002`。
- `backend`：Go + Gin API 服务，使用 SQLite 存储，默认端口 `8080`。
- `apps/miniprogram`：Taro React 微信小程序工程。
- `apps/mobile`：Capacitor Android 工程。
- `apps/desktop`：Electron 桌面端工程。
- `packages/shared`：多端共享类型、DTO 和工具。
- `docs`：部署、APK、数据库等补充文档。

## 配置方法

### 1. 准备环境

- Node.js 20 或更高版本
- npm
- Go 1.22 或更高版本
- 可选：Docker，用于容器化运行后端
- 可选：S3/OSS/R2 兼容对象存储，用于保存上传图片

### 2. 安装前端依赖

```bash
npm install
```

### 3. 配置并启动后端

后端会读取 `backend/.env`。本地开发可以先复制示例配置：

```bash
cd backend
cp .env.example .env
go mod tidy
go run main.go
```

Windows PowerShell 可以使用：

```powershell
cd backend
Copy-Item .env.example .env
go mod tidy
go run main.go
```

后端启动后可访问：

```text
http://localhost:8080/health
```

### 4. 启动 Web 前端

另开一个终端，在仓库根目录运行：

```bash
npm run dev:web
```

Web 前端默认访问：

```text
http://localhost:3002
```

前端默认连接 `http://localhost:8080`。如果后端部署在其它地址，请设置：

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

### 5. 默认登录信息

本地后端默认会在空数据库中自动初始化一个空间：

```text
空间码：our-space-2026
密码：1234
身份：me / ta
```

登录页第一步输入空间密码，第二步选择身份后再次输入密码即可进入。

## 后端环境变量

常用配置位于 `backend/.env.example`：

```text
DATABASE_PATH=./data/ourMemories.db
PORT=8080
JWT_SECRET=change-me-at-least-24-characters-long-secret
ALLOWED_ORIGINS=http://localhost:3002
DEFAULT_SPACE_CODE=our-space-2026
DEFAULT_PASSWORD=1234
AUTO_SEED=true

S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=our-memories
S3_PUBLIC_BASE_URL=
```

说明：

- `DATABASE_PATH`：SQLite 数据库文件路径。
- `JWT_SECRET`：生产环境必须改成足够长的随机字符串，至少 24 个字符。
- `ALLOWED_ORIGINS`：允许访问 API 的前端来源，多个值用英文逗号分隔。
- `DEFAULT_SPACE_CODE`、`DEFAULT_PASSWORD`：首次自动初始化空间时使用。
- `AUTO_SEED`：空库启动时是否自动初始化默认空间和用户。
- `S3_*`：对象存储配置。留空时图片会以 data URL 形式保存，适合本地体验；生产环境建议配置对象存储。

如需启用 AI 文案润色，可额外配置：

```text
DEEPSEEK_API_KEY=your-api-key
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
```

## Docker 运行后端

仓库根目录提供了后端 Dockerfile 和 `docker-compose.yml`：

```bash
docker compose up -d --build api
```

默认会将 API 暴露在：

```text
http://localhost:8080
```

生产部署时请通过环境变量覆盖 `JWT_SECRET`、`ALLOWED_ORIGINS`、`DEFAULT_SPACE_CODE`、`DEFAULT_PASSWORD` 和对象存储配置。

## 多端构建

```bash
npm run build:web
npm run miniprogram:build
npm run desktop
npm run dist:win
npm run mobile:sync
npm run mobile:android:build
```

移动端和桌面端都需要连接已部署的后端。构建 Android APK 前，可设置：

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

## 友情链接

- [LINUX DO](https://linux.do/)：本项目认可并链接 LINUX DO 社区。