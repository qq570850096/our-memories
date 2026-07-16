# Our Memories

一个适合两个人私有部署的回忆记录应用，包含回忆地图、照片、纪念日、悄悄话、时光胶囊、旅行计划和数据迁移等功能。

项目采用单容器部署：Go 服务同时提供静态 Web、API 和 WebSocket，数据默认保存在 SQLite 与本地图片目录中，不依赖 Redis、PostgreSQL 或独立管理后台。

## 功能亮点

- 回忆地图：按城市记录共同去过的地方、照片和故事
- 双人空间：两个独立身份共享同一份私密数据
- 纪念日与时光胶囊：保存重要日期和未来才能开启的内容
- 悄悄话与旅行计划：记录日常交流并规划下一段旅程
- 数据可控：支持私有化部署、数据导入导出和完整目录备份

## 效果展示

> 截图区域已预留。参赛前将下表中的占位文字替换为实际图片即可，建议把图片统一放在 `docs/screenshots/`，避免 README 根目录堆放素材。

| 回忆地图 | 回忆详情 |
| --- | --- |
| 待补充：`docs/screenshots/memory-map.png` | 待补充：`docs/screenshots/memory-detail.png` |

| 时光胶囊 | 移动端体验 |
| --- | --- |
| 待补充：`docs/screenshots/time-capsule.png` | 待补充：`docs/screenshots/mobile-home.png` |

## 快速部署

公开镜像：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

当前公开镜像支持 `linux/amd64`，阿里云仓库可匿名拉取，无需 `docker login`。

### 使用公有镜像一键运行

适合先快速体验，不需要克隆仓库：

```bash
mkdir -p ./our-memories-data
sudo chown -R 100:101 ./our-memories-data
read -rsp "请输入至少 12 个字符的初始登录口令: " OUR_MEMORIES_PASSWORD
echo

docker run -d \
  --name our-memories \
  --restart unless-stopped \
  -p 18080:8080 \
  -v "$(pwd)/our-memories-data:/app/data" \
  -e TZ=Asia/Shanghai \
  -e GIN_MODE=release \
  -e JWT_SECRET="$(openssl rand -base64 32)" \
  -e DEFAULT_SPACE_NAME="我们的回忆" \
  -e DEFAULT_USER_ME_NAME="我" \
  -e DEFAULT_USER_TA_NAME="TA" \
  -e DEFAULT_PASSWORD="$OUR_MEMORIES_PASSWORD" \
  -e AUTO_SEED=true \
  registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

访问 `http://服务器IP:18080`，并确认云安全组和主机防火墙已放行 `18080/tcp`。正式部署建议使用下方 Compose 和 HTTPS 反向代理方案，将端口限制在 `127.0.0.1`，不要长期直接暴露应用端口。

停止或升级容器不会删除 `./our-memories-data`。删除该目录会永久删除 SQLite 数据库和本地媒体，请先备份。

### 使用 Docker Compose

1. 准备配置：

```bash
git clone https://github.com/qq570850096/our-memories.git
cd our-memories
cp .env.example .env
mkdir -p data
sudo chown -R 100:101 data
```

2. 编辑 `.env`，至少设置以下内容：

```env
JWT_SECRET=<执行 openssl rand -base64 32 生成>
DEFAULT_PASSWORD=<设置独立的12字符以上强口令>
DEFAULT_SPACE_NAME=我们的回忆
DEFAULT_USER_ME_NAME=我
DEFAULT_USER_TA_NAME=TA
AUTO_SEED=true
```

3. 启动并检查：

```bash
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:18080/health
```

默认只监听宿主机 `127.0.0.1:18080`，适合通过 1Panel 或宝塔反向代理到域名。首次启动会在空数据库中创建一个空间和两个身份；已有数据时不会覆盖。

新部署口令必须为 8-128 个任意字符，推荐至少 12 个字符；不要原样使用示例占位符。旧版本的 4 位 PIN 仍可登录，升级后建议在设置页改为强口令。仅修改 `.env` 不会改变已有空间的登录口令。

从旧版升级时不要覆盖原 `.env`、不要执行 `docker compose down -v`，也不要先创建一个空 `data` 目录并把它挂到 `/app/data`。旧版默认使用逻辑卷 `api-data`，但实际卷名通常是 `<Compose 项目名>_api-data`；必须保留原部署目录和 Compose/面板项目名，或用 `docker compose -p <原项目名>` / `COMPOSE_PROJECT_NAME=<原项目名>` 显式指定原值，否则会挂载一个新的空卷。当前 Compose 在项目名不变且旧 `.env` 没有 `DATA_DIR` 时会继续使用原卷。升级后仍用原空间码、原 PIN/口令和原来的两个身份登录。完整检查、备份、原地恢复与命名卷迁移步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md#从旧版管理员端版本升级)。

## 面板部署

### 1Panel 私有化部署

1. 在“容器”中确认 Docker 和 Compose v2 已安装，服务器架构为 `x86_64`。
2. 创建 `/opt/our-memories/data`，将仓库中的 `docker-compose.yml` 和复制后的 `.env` 放入 `/opt/our-memories`。
3. 执行 `chown -R 100:101 /opt/our-memories/data`，并在 `.env` 中设置 `DATA_DIR=/opt/our-memories/data`、随机 `JWT_SECRET` 和强 `DEFAULT_PASSWORD`。
4. 在“容器 -> 编排”中新建 `our-memories` 编排，导入上述 Compose 文件并启动。
5. 在“网站”中创建反向代理，目标设为 `http://127.0.0.1:18080`，代理整个 `/`，开启 WebSocket 和 HTTPS。

具体界面操作、Nginx 配置、升级、备份和故障排查见 [1Panel 完整部署说明](./docs/deploy-1panel.md)。

### 宝塔面板私有化部署

1. 在“软件商店”安装 Docker 管理器和 Nginx/OpenResty，服务器架构需为 `x86_64`。
2. 创建 `/www/docker/our-memories/data`，在上级目录放入 `docker-compose.yml` 和 `.env`，数据目录设为 `/www/docker/our-memories/data`。
3. 执行 `chown -R 100:101 /www/docker/our-memories/data`，填写随机 `JWT_SECRET` 和强 `DEFAULT_PASSWORD`。
4. 在“Docker -> Compose”中新建 `our-memories` 项目并启动。
5. 在“网站 -> 反向代理”中把整个 `/` 代理到 `http://127.0.0.1:18080`，开启 WebSocket，申请 SSL 后启用强制 HTTPS。

不同版本宝塔的菜单名称及 SELinux 处理方式见 [宝塔面板完整部署说明](./docs/deploy-baota.md)。

面板反向代理必须覆盖整个 `/`，并开启 WebSocket；实时连接路径是 `/api/v1/ws`。

更多部署资料：

- [通用 Docker Compose 部署、升级与灾备](./DEPLOYMENT.md)
- [裸 IP 部署](./DEPLOY_IP.md)
- [应用数据迁移](./docs/backup-and-migration.md)

## 配置 GitHub Actions 机密

仓库内的 [Docker 镜像工作流](./.github/workflows/docker-image.yml) 会在推送到 `main` 或 `master` 后运行测试，并同时发布到 GHCR 和阿里云容器镜像服务。进入 GitHub 仓库的 **Settings -> Secrets and variables -> Actions**，在 **Repository secrets** 中添加：

| Secret | 示例或说明 | 是否必需 |
| --- | --- | --- |
| `ALIYUN_REGISTRY` | `registry.cn-hangzhou.aliyuncs.com`，只填域名，不带 `https://` | 发布阿里云镜像必需 |
| `ALIYUN_NAMESPACE` | `work_spac` | 发布阿里云镜像必需 |
| `ALIYUN_USERNAME` | 阿里云镜像仓库登录用户名 | 发布阿里云镜像必需 |
| `ALIYUN_PASSWORD` | 阿里云容器镜像服务的固定密码或访问凭证，不是 GitHub 密码 | 发布阿里云镜像必需 |
| `CAPACITOR_SERVER_URL` | 例如 `https://memory.example.com` | 构建在线版 Android APK 时可选 |

`GITHUB_TOKEN` 由 GitHub Actions 自动创建，无需手动添加。工作流已声明 `packages: write`，用于推送 `ghcr.io/<GitHub 用户或组织>/our-memories`。首次发布后，还需要在 GitHub 的 **Packages -> Package settings -> Change visibility** 中将镜像设为 `Public`，匿名用户才能拉取。

如果 Android APK 必须连接内网 HTTP 地址，可在 **Variables -> Actions -> Repository variables** 中添加 `CAPACITOR_ALLOW_HTTP=1`；公网部署应保持 `0` 并使用 HTTPS。所有运行时密钥（如 `JWT_SECRET`、`S3_SECRET_ACCESS_KEY`、`JPUSH_MASTER_SECRET`）应配置在部署服务器的 `.env` 中，不应作为镜像构建参数写入 GitHub Actions。

配置完成后，可在 **Actions -> Build Docker Image -> Run workflow** 手动验证。成功后将产生 `latest` 与 `sha-<提交短哈希>` 两类标签；生产环境建议固定 SHA 标签，确认新版本正常后再更新。

## 数据与备份

容器内 `/app/data` 包含：

- SQLite 数据库及 `-wal`、`-shm` 文件
- 未使用 OSS/S3 时的本地图片 `/app/data/images`

新部署按 `.env.example` 使用 bind mount 时，完整灾备必须停容器后备份 `/app/data` 对应的整个宿主机目录；备份脚本应以 `docker inspect` 显示的实际 `Source` 为准，而不是猜测相对路径。旧部署若仍使用 `api-data` 命名卷，请按部署文档中的命名卷步骤备份，并记录实际卷名和原 Compose 项目名。应用 JSON 导出只包含数据库记录和媒体引用，不包含图片二进制，不能替代目录备份。

不要执行 `docker compose down -v`，也不要让多个容器副本同时读写同一个 SQLite 数据目录。

## 可选服务

默认不配置外部服务也可运行。需要时可在 `.env` 中增加：

- S3/阿里云 OSS 兼容对象存储
- DeepSeek 文本润色
- OpenAI 兼容生图节点
- 极光推送

完整变量说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 本地开发

要求 Node.js 22、Go 1.22 和 npm。

```bash
npm ci
cp backend/.env.example backend/.env
```

修改 `backend/.env` 中的 `JWT_SECRET`。需要初始化空数据库时，再设置：

```env
AUTO_SEED=true
DEFAULT_PASSWORD=<设置独立的12字符以上强口令>
```

分别启动前后端：

```bash
npm run dev:web
npm run dev:server
```

- Web 开发服务器：`http://localhost:3002`
- API：`http://localhost:8080/api/v1`
- 健康检查：`http://localhost:8080/health`

## 构建与测试

```bash
npm run lint
npm run typecheck
npm run build
(cd backend && go test ./...)
docker build -t our-memories:local .
```

Dockerfile 默认优先使用国内 Go 模块代理，并保留官方代理与直连后备。如需使用自己的代理，可传入 `--build-arg GOPROXY=<代理地址>`。

Web 使用 Next.js 16 App Router 静态导出，生产镜像将导出产物与 Go API 打包为一个运行容器。
