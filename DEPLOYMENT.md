# Docker Compose 部署指南

本文是 Our Memories 的通用生产部署说明。1Panel 和宝塔的界面操作分别见：

- [1Panel 部署](./docs/deploy-1panel.md)
- [宝塔面板部署](./docs/deploy-baota.md)
- [裸 IP 部署](./DEPLOY_IP.md)

## 部署模型

一个容器同时提供：

- Web：`/`
- API：`/api/v1`
- WebSocket：`/api/v1/ws`
- 健康检查：`/health`

新部署从 `.env.example` 创建 `.env` 后，数据保存在宿主机 `./data`，映射到容器 `/app/data`。旧版默认使用 Compose 逻辑卷 `api-data`；实际卷名通常带 Compose 项目前缀，例如 `our-memories_api-data`。为保证原地升级兼容，未设置 `DATA_DIR` 且 Compose 项目名不变时仍会使用原物理卷。SQLite 适合个人双人空间，但只允许启动一个应用副本。

公开镜像为：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

仓库公开，无需登录。当前镜像仅提供 `linux/amd64`，部署前用 `uname -m` 确认服务器为 `x86_64`；ARM 服务器暂不能直接使用该镜像。

## 服务器要求

- Linux `x86_64`
- Docker Engine 24 或更高版本
- Docker Compose v2，可通过 `docker compose version` 检查
- 建议至少 1 核 CPU、1 GB 内存和足够的图片存储空间
- 域名与 HTTPS 非必需，但公网使用时强烈建议配置

## 准备目录

以下示例使用 `/opt/our-memories`：

```bash
sudo mkdir -p /opt/our-memories/data /opt/our-memories/backups
sudo chown -R "$USER":"$USER" /opt/our-memories
cd /opt/our-memories
```

将仓库根目录的 `docker-compose.yml` 和 `.env.example` 放入该目录，然后：

```bash
cp .env.example .env
sudo chown -R 100:101 data
sudo chmod 750 data
chmod 600 .env
```

`100:101` 是当前公开镜像内应用用户的 UID/GID。本文恢复脚本也按该 UID/GID 修复权限；若镜像未来调整运行用户，应先用以下命令确认并同步替换脚本中的值：

```bash
docker run --rm --entrypoint id \
  registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

## 服务器运行环境变量

服务器 `.env` 由 Docker Compose 在部署机器上读取，用于选择镜像、端口、数据目录和应用运行配置。它不是 GitHub Actions 配置，也不会自动同步到 GitHub。建议从 `.env.example` 复制后执行 `chmod 600 .env`，不要提交真实 `.env`。

### 必填与基础运行

| 变量 | 必填 | 用途与建议值 |
| --- | --- | --- |
| `JWT_SECRET` | 是 | JWT 签名密钥，至少 24 个字符；每个实例单独生成，并在重建容器时保持不变 |
| `COMPOSE_PROJECT_NAME` | 旧命名卷升级时 | Compose 项目名；旧部署必须保留原值，确保 `api-data` 解析到原物理卷。可放入 `.env` 或在命令中使用 `docker compose -p <原项目名>`；新 bind mount 部署可不设置 |
| `OUR_MEMORIES_IMAGE` | 否 | Compose 拉取的镜像，默认 `registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest` |
| `APP_BIND_IP` | 否 | 宿主机监听地址，默认 `127.0.0.1` |
| `APP_PORT` | 否 | 宿主机监听端口，默认 `18080`；容器内始终监听 `8080` |
| `TZ` | 否 | 容器时区，默认 `Asia/Shanghai` |
| `ALLOWED_ORIGINS` | 否 | 只在移动壳或独立前端跨域时填写精确 origin；不能使用 `*` |

生成并填写独立 JWT 密钥：

```bash
openssl rand -base64 32
```

```env
OUR_MEMORIES_IMAGE=registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
APP_BIND_IP=127.0.0.1
APP_PORT=18080
TZ=Asia/Shanghai
JWT_SECRET=<上一步生成的随机值>
ALLOWED_ORIGINS=capacitor://localhost,http://localhost,https://localhost
```

默认绑定只允许宿主机上的 Nginx 或面板反向代理访问，公网服务器通常只需开放 80/443。若明确需要通过裸 IP 直接访问，设置 `APP_BIND_IP=0.0.0.0`，保留 `APP_PORT=18080`，再放行防火墙和云安全组中的 TCP `18080`。详细步骤见 [DEPLOY_IP.md](./DEPLOY_IP.md)。

同域 Web 不需要额外加入 `ALLOWED_ORIGINS`。跨域值必须是 `https://app.example.com` 这类 origin，不能包含路径或末尾斜杠。

### 首次初始化与默认空间

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `AUTO_SEED` | `true` | 空数据库首次启动时创建私人空间和两个身份 |
| `DEFAULT_SPACE_CODE` | `our-space-2026` | 空库创建时的空间码；旧多空间数据库中也用于选择登录页优先展示的空间 |
| `DEFAULT_SPACE_NAME` | `我们的回忆` | 空库创建时的空间名称 |
| `DEFAULT_PASSWORD` | 空 | 空库创建时的登录口令；新部署必须为 8-128 个任意字符，推荐至少 12 个字符 |
| `DEFAULT_USER_ME_NAME` | `我` | 空库创建时第一个身份的显示名 |
| `DEFAULT_USER_TA_NAME` | `TA` | 空库创建时第二个身份的显示名 |
| `DEFAULT_ANNIVERSARY_DATE` | 空 | 尚未保存纪念日设置时的默认日期，建议使用 `YYYY-MM-DD` |
| `DEFAULT_ANNIVERSARY_LABEL` | `在一起` | 尚未保存纪念日设置时的默认名称 |

首次部署示例：

```env
DEFAULT_SPACE_CODE=our-space-2026
DEFAULT_SPACE_NAME=我们的回忆
DEFAULT_PASSWORD=<请设置独立的12字符以上强口令>
DEFAULT_USER_ME_NAME=我
DEFAULT_USER_TA_NAME=TA
AUTO_SEED=true
DEFAULT_ANNIVERSARY_DATE=
DEFAULT_ANNIVERSARY_LABEL=在一起
```

不要原样使用示例占位符。新口令必须为 8-128 个任意字符，推荐至少 12 个字符，并避免与其他服务共用。口令包含 `#`、`$`、空格等 `.env` 特殊字符时，应按 Docker Compose `.env` 语法正确引用，例如使用单引号保护字面值。`AUTO_SEED=true` 只在数据库没有任何空间时写入初始化数据；已有数据库中，修改 `DEFAULT_PASSWORD`、空间名称或身份显示名不会覆盖原记录。

旧版本已经创建的 4 位 PIN 仍可正常登录。升级后建议先使用原 PIN 登录，再到设置页将其改为 8-128 个字符的强口令；不要仅修改服务器 `.env`，因为这不会更新数据库中已有的密码哈希。

当前 Web 界面面向单个私人空间。若从旧版多空间数据库升级，`DEFAULT_SPACE_CODE` 会优先选择空间码完全匹配的空间显示在登录页；它只负责选择，不会重命名空间。找不到匹配空间时，程序仅为兼容旧数据而回退到数据库中最早的空间。其余空间应分别导出并迁移到独立实例，不要依赖该回退长期共用一个数据库。

### 存储

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DATA_DIR` | `./data` | 宿主机持久化目录，整体挂载到 `/app/data` |
| `LOCAL_IMAGE_DIR` | `/app/data/images` | 容器内本地图片目录；当前 Compose 固定为该路径，不要填写宿主机路径 |
| `PHOTO_SYNC_INTERVAL` | `10m` | 本地待同步图片向对象存储重试的间隔 |
| `S3_ENDPOINT` | 空 | S3/OSS 兼容端点；留空时使用本地图片存储 |
| `S3_REGION` | `us-east-1` | 对象存储区域 |
| `S3_ACCESS_KEY_ID` | 空 | 对象存储访问密钥 ID |
| `S3_SECRET_ACCESS_KEY` | 空 | 对象存储访问密钥 Secret |
| `S3_BUCKET` | `our-memories` | 存储桶名称 |
| `S3_PUBLIC_BASE_URL` | 空 | 客户端可直接访问的图片 URL 前缀 |
| `S3_OBJECT_ACL` | 空 | 上传对象时使用的 ACL |

未配置对象存储时，图片保存在 `/app/data/images`。配置对象存储后仍要持久化并备份整个 `/app/data`，其中包含 SQLite 数据库和可能尚未同步的本地图片。OSS/S3 图片 URL 必须能被客户端读取；私有桶未配置签名访问时不能正常展示。访问密钥应使用最小权限账号。

表中的 `./data` 是新部署随 `.env.example` 提供的推荐值。若旧部署的 `.env` 中没有 `DATA_DIR`，Compose 会有意回退到旧逻辑卷 `api-data`，但它实际指向哪个物理卷取决于 Compose 项目名。不要为了与表格一致而直接加入 `DATA_DIR=./data`，也不要更改项目名；如需改用宿主机目录，先按后文迁移数据。

### AI 功能

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | 文本润色服务密钥；留空则相关功能不可用 |
| `DEEPSEEK_API_URL` | `https://api.deepseek.com/v1/chat/completions` | DeepSeek 兼容聊天接口 |
| `IMAGE_GENERATION_BASE_URL` | 空 | OpenAI 兼容生图服务根地址 |
| `IMAGE_GENERATION_API_KEY` | 空 | 生图服务密钥 |
| `IMAGE_GENERATION_MODEL` | `gpt-image-2` | 生图模型名称 |

AI 密钥只保存在服务器 `.env`，不要放进浏览器端变量，也不要放进 GitHub Actions，除非另一个构建工作流明确需要它们。

### 推送通知

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `JPUSH_APP_KEY` | 空 | 极光推送应用 App Key |
| `JPUSH_MASTER_SECRET` | 空 | 极光推送服务端密钥 |

两项均留空时不启用极光推送。`JPUSH_MASTER_SECRET` 只能保存在服务端 `.env`。

`NEXT_PUBLIC_API_BASE_URL` 和 `CAPACITOR_SERVER_URL` 属于前端或 APK 构建期变量，放进运行容器的 `.env` 不会改变已经构建好的公开镜像。

## 启动与验证

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 api
curl -fsS http://127.0.0.1:18080/health
```

健康检查应返回：

```json
{"ok":true}
```

再访问域名，输入 `.env` 中配置的登录口令，选择其中一个身份登录。浏览器开发者工具中 `/api/v1/ws` 应返回 `101 Switching Protocols`。

## 反向代理要求

反向代理整个 `/` 到 `http://127.0.0.1:18080`，不要只代理 `/api`，也不要改写路径。

Nginx 至少需要：

```nginx
location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 64m;
    proxy_buffering off;
}
```

`X-Forwarded-Proto` 会影响 HTTPS Cookie 和同源安全判断，不能省略。申请证书后启用 HTTP 跳转 HTTPS。

## 数据目录

默认 `DATA_DIR=./data`，目录中包含：

```text
data/
├── ourMemories.db
├── ourMemories.db-wal
├── ourMemories.db-shm
└── images/
```

不要只复制主 `.db` 文件。SQLite 使用 WAL 模式，未使用对象存储时图片也在同一目录中。

不要运行多个副本，不要将同一 `data` 目录挂载给多个容器，不要执行 `docker compose down -v`。

## 完整备份

先确认 `/app/data` 的实际挂载类型。不要只根据 `.env` 猜测，因为面板可能改变 Compose 工作目录，旧部署也可能仍使用命名卷：

```bash
docker inspect "$(docker compose ps -q api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{printf "type=%s source=%s name=%s\n" .Type .Source .Name}}{{end}}{{end}}'
```

### Bind mount 备份

输出为 `type=bind` 时，以下脚本从正在运行的容器读取 `/app/data` 的真实宿主机 `Source`，因此支持相对 `DATA_DIR` 解析后的路径以及任意绝对路径。归档中的持久化内容统一位于 `data/` 前缀下，不依赖宿主机目录名：

```bash
set -Eeuo pipefail

cd /opt/our-memories
mkdir -p backups
umask 077
container_id="$(docker compose ps -q api)"
test -n "$container_id"
mount_type="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}')"
data_source="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}')"
if [ "$mount_type" != "bind" ] || [ -z "$data_source" ] || [ "$data_source" = "/" ]; then
  echo "/app/data is not a safe bind mount: type=$mount_type source=$data_source" >&2
  exit 1
fi
archive="$PWD/backups/our-memories-data-$(date +%Y%m%d-%H%M%S).tar.gz"
restart_api() {
  exit_code=$?
  trap - EXIT
  docker compose start api >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap restart_api EXIT
docker compose stop api
sudo tar --numeric-owner --transform='s#^\.$#data#;s#^\./#data/#' \
  -czf "$archive" -C "$data_source" .
sudo chown "$(id -u):$(id -g)" "$archive"
chmod 600 "$archive"
tar -tzf "$archive" data/ >/dev/null
docker compose start api
trap - EXIT
```

定期把备份复制到另一台机器或对象存储，并保留多代。若使用 OSS/S3，还需单独开启存储桶版本控制或备份。

### 命名卷备份

输出为 `type=volume` 时，不要假设宿主机存在 `./data`。逻辑卷 `api-data` 的实际名称由 Compose 项目名决定；先记录容器标签中的原项目名和挂载的真实卷名，再创建停机备份：

```bash
set -Eeuo pipefail

mkdir -p backups
umask 077
container_id="$(docker compose ps -q api)"
test -n "$container_id"
project_name="$(docker inspect "$container_id" \
  --format '{{index .Config.Labels "com.docker.compose.project"}}')"
mount_type="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}')"
volume_name="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"
if [ "$mount_type" != "volume" ] || [ -z "$volume_name" ]; then
  echo "/app/data is not a named volume" >&2
  exit 1
fi
printf 'Compose project: %s\nDocker volume: %s\n' "$project_name" "$volume_name"
archive="$PWD/backups/our-memories-volume-$(date +%Y%m%d-%H%M%S).tar.gz"
restart_api() {
  exit_code=$?
  trap - EXIT
  docker compose start api >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap restart_api EXIT
docker compose stop api
docker run --rm -v "$volume_name:/app/data:ro" alpine:3.20 \
  tar --numeric-owner -C /app -czf - data >"$archive"
chmod 600 "$archive"
tar -tzf "$archive" data/ >/dev/null
docker compose start api
trap - EXIT
```

应用的 JSON 导出适合跨实例迁移数据库记录，但只包含媒体 URL/Key，不包含图片二进制，不能替代上述灾备。详见 [backup-and-migration.md](./docs/backup-and-migration.md)。

## 恢复与回滚

### Bind mount 原地恢复

此流程只适用于上述 `type=bind`、且归档中数据位于 `data/` 前缀下的备份。脚本仍以当前容器挂载的真实 `Source` 为恢复目标；它先移动原目录，恢复失败或 60 秒内健康检查未通过时会放回原目录并重启：

```bash
set -Eeuo pipefail

cd /opt/our-memories
archive="$PWD/backups/our-memories-data-YYYYMMDD-HHMMSS.tar.gz"
timestamp="$(date +%Y%m%d-%H%M%S)"
container_id="$(docker compose ps -q api)"
test -n "$container_id"
mount_type="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}')"
data_source="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}')"
if [ "$mount_type" != "bind" ] || [ -z "$data_source" ] || [ "$data_source" = "/" ]; then
  echo "/app/data is not a safe bind mount: type=$mount_type source=$data_source" >&2
  exit 1
fi
previous_data="${data_source}.before-restore-${timestamp}"
failed_data="${data_source}.failed-restore-${timestamp}"

wait_for_health() {
  deadline=$((SECONDS + 60))
  until curl -fsS --connect-timeout 2 --max-time 5 \
    http://127.0.0.1:18080/health >/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "health check did not pass within 60 seconds" >&2
      return 1
    fi
    sleep 2
  done
}

rollback_and_restart() {
  exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ] && [ -d "$previous_data" ]; then
    docker compose down >/dev/null 2>&1 || true
    if [ -e "$data_source" ]; then
      sudo mv "$data_source" "$failed_data" || true
    fi
    sudo mv "$previous_data" "$data_source" || true
  fi
  docker compose up -d api >/dev/null 2>&1 || true
  exit "$exit_code"
}

tar -tzf "$archive" data/ >/dev/null
if [ -e "$previous_data" ] || [ -e "$failed_data" ]; then
  echo "restore destination already exists; choose a new timestamp" >&2
  exit 1
fi
if [ ! -d "$data_source" ]; then
  echo "bind source does not exist: $data_source" >&2
  exit 1
fi
trap rollback_and_restart EXIT
docker compose down
sudo mv "$data_source" "$previous_data"
sudo mkdir -p "$data_source"
sudo tar --numeric-owner --strip-components=1 \
  -C "$data_source" -xzf "$archive" data
sudo chown -R 100:101 "$data_source"
sudo find "$data_source" -type d -exec chmod 750 {} +
sudo find "$data_source" -type f -exec chmod 640 {} +
docker compose up -d api
wait_for_health
trap - EXIT
```

恢复成功后，先验证原登录、内容和图片，再决定是否删除 `*.before-restore-*`。归档只包含 `/app/data`；`.env` 和 Compose 文件应单独备份。回滚代码时，建议同时恢复升级前的数据和当时使用的镜像标签，数据库迁移不保证能被更旧镜像反向读取。

### 命名卷原地恢复

命名卷恢复必须使用容器实际挂载的物理卷名，不能只写逻辑名 `api-data`。运行前确保当前 Compose/面板项目名仍是备份时记录的原值；若部署目录或面板项目名已经改变，可在 `.env` 中设置 `COMPOSE_PROJECT_NAME=<原项目名>`，或为本节所有 Compose 命令加 `-p <原项目名>`，再重新执行 `docker compose ps` 确认它找到原容器。以下脚本会先为当前卷再建一份安全归档，恢复失败时自动放回：

```bash
set -Eeuo pipefail

cd /opt/our-memories
mkdir -p backups
umask 077
archive="$PWD/backups/our-memories-volume-YYYYMMDD-HHMMSS.tar.gz"
safety_archive="$PWD/backups/before-volume-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
container_id="$(docker compose ps -q api)"
test -n "$container_id"
project_name="$(docker inspect "$container_id" \
  --format '{{index .Config.Labels "com.docker.compose.project"}}')"
mount_type="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}')"
volume_name="$(docker inspect "$container_id" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"
if [ "$mount_type" != "volume" ] || [ -z "$volume_name" ]; then
  echo "/app/data is not a named volume" >&2
  exit 1
fi
printf 'Compose project: %s\nDocker volume: %s\n' "$project_name" "$volume_name"

wait_for_health() {
  deadline=$((SECONDS + 60))
  until curl -fsS --connect-timeout 2 --max-time 5 \
    http://127.0.0.1:18080/health >/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "health check did not pass within 60 seconds" >&2
      return 1
    fi
    sleep 2
  done
}

replace_volume_from_archive() {
  source_archive=$1
  docker run --rm -i -v "$volume_name:/app/data" alpine:3.20 sh -c \
    'find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} \; &&
     tar --numeric-owner -C /app -xzf - &&
     chown -R 100:101 /app/data &&
     find /app/data -type d -exec chmod 750 {} \; &&
     find /app/data -type f -exec chmod 640 {} \;' <"$source_archive"
}

restore_started=false
rollback_and_restart() {
  exit_code=$?
  trap - EXIT
  docker compose down >/dev/null 2>&1 || true
  if [ "$exit_code" -ne 0 ] && [ "$restore_started" = "true" ] && [ -s "$safety_archive" ]; then
    replace_volume_from_archive "$safety_archive" || true
  fi
  docker compose up -d api >/dev/null 2>&1 || true
  exit "$exit_code"
}

tar -tzf "$archive" data/ >/dev/null
trap rollback_and_restart EXIT
docker compose stop api
docker run --rm -v "$volume_name:/app/data:ro" alpine:3.20 \
  tar --numeric-owner -C /app -czf - data >"$safety_archive"
chmod 600 "$safety_archive"
tar -tzf "$safety_archive" data/ >/dev/null
docker compose down
restore_started=true
replace_volume_from_archive "$archive"
docker compose up -d api
wait_for_health
restore_started=false
trap - EXIT
```

成功后保留 `before-volume-restore-*`，直到登录、内容和图片全部验证完成。不要执行 `docker compose down -v`；该选项会删除当前项目拥有的命名卷，使脚本失去自动回滚所需的数据。

## 升级

升级前先完成全量备份：

```bash
cd /opt/our-memories
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 api
for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 5 \
    http://127.0.0.1:18080/health >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "health check did not pass within 60 seconds" >&2
    exit 1
  fi
  sleep 2
done
```

`latest` 适合快速体验。需要稳定回滚时，将 `.env` 中 `OUR_MEMORIES_IMAGE` 固定到发布流程生成的 `sha-<短提交>` 标签，并记录每次升级前后的标签。

## 从旧版管理员端版本升级

旧版本的默认挂载是 Compose 逻辑卷 `api-data:/app/data`。实际物理卷名由 Compose 项目名决定，通常是 `<项目名>_api-data`；Compose 默认又可能从部署目录名推导项目名。因此只有原部署目录以及 Compose/面板项目名不变时，逻辑卷才会继续指向原物理卷。若必须换目录或面板项目，在原容器仍运行时记录其项目标签，并在 `.env` 中显式设置 `COMPOSE_PROJECT_NAME=<原项目名>`，或为每条命令使用 `docker compose -p <原项目名> ...`。

升级前先在原部署目录、原面板编排中执行检查；只有这样 `docker compose ps` 才能定位旧容器。如果已经知道原项目名，也可以先设置 `COMPOSE_PROJECT_NAME` 或使用 `-p`。下面的 `type` 应为 `volume`，`project` 必须记录下来，`name` 通常类似 `our-memories_api-data`，`destination` 必须是 `/app/data`：

```bash
container_id="$(docker compose ps -q api)"
docker inspect "$container_id" --format \
  'project={{index .Config.Labels "com.docker.compose.project"}} {{range .Mounts}}{{if eq .Destination "/app/data"}}type={{.Type}} source={{.Source}} name={{.Name}} destination={{.Destination}}{{end}}{{end}}'
```

然后执行前文的[命名卷备份](#命名卷备份)。保留原 `.env`，尤其不要为了套用新示例而覆盖它，也不要设置 `DATA_DIR=./data` 指向一个空目录。若需要显式固定项目名，把上面 `project=` 的原值加入 `.env`，并在升级前运行 `docker compose ps` 确认仍能找到原容器。更新代码和镜像后运行：

```bash
git pull --ff-only
docker compose config
docker compose pull api
docker compose up -d --remove-orphans
docker compose logs --tail=100 api
for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 5 \
    http://127.0.0.1:18080/health >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "health check did not pass within 60 seconds" >&2
    exit 1
  fi
  sleep 2
done
```

升级不会重建已有空间或覆盖密码哈希。继续使用原空间码、原 4 位 PIN/旧口令和 `me`/`ta` 身份登录；`.env` 中的 `DEFAULT_PASSWORD` 只用于空库初始化。建议保留原 `JWT_SECRET`；本版本会拒绝旧版未区分用途的 JWT（包括旧管理员会话），因此升级后浏览器可能要求重新登录，但原空间口令不受影响。独立管理员入口和管理员 API 已移除，旧管理员账号不再提供登录入口，不影响空间用户及其内容。

若旧数据库中有多个空间，登录页优先展示 `DEFAULT_SPACE_CODE` 完全匹配的空间；未匹配时回退到最早创建的空间。要切换展示空间，修改 `DEFAULT_SPACE_CODE` 后重启容器。长期使用建议将每个空间迁移为独立实例。

只有确认旧卷备份可恢复后，才考虑改用宿主机目录。先记录旧卷真实名称并停止容器：

```bash
OLD_VOLUME="$(docker inspect "$(docker compose ps -q api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"
test -n "$OLD_VOLUME"
docker compose down
mkdir -p data
docker run --rm \
  -v "$OLD_VOLUME:/source:ro" \
  -v "$PWD/data:/target" \
  alpine:3.20 sh -c 'cp -a /source/. /target/'
sudo chown -R 100:101 data
sudo find data -type d -exec chmod 750 {} +
sudo find data -type f -exec chmod 640 {} +
```

再在原 `.env` 中加入 `DATA_DIR=./data`，执行 `docker compose up -d`。验证原内容、图片和登录正常，并另外保留旧卷至少一个备份周期；不要立即执行 `docker volume rm`。

## GitHub Actions 构建与镜像发布

仅部署本文开头的公开镜像时，可以跳过本章。只有维护本仓库、Fork 后发布自己的镜像，或需要生成新 `sha-*` 标签时，才需要配置 GitHub Actions。

当前工作流文件为 [.github/workflows/docker-image.yml](./.github/workflows/docker-image.yml)，名称是 `Build Docker Image`。它会先运行质量检查，再构建一次 `linux/amd64` 镜像并同时推送到：

```text
ghcr.io/<GitHub 仓库所有者>/<仓库名>
<ALIYUN_REGISTRY>/<ALIYUN_NAMESPACE>/our-memories
```

质量检查包含 `npm ci`、各 workspace lint、TypeScript 类型检查和 `go test ./...`。任何一步失败，镜像都不会构建或推送。

### Repository Actions 权限

进入 GitHub 仓库：

```text
Settings -> Actions -> General
```

检查以下设置：

1. `Actions permissions` 必须允许运行当前工作流。最简单的是选择 `Allow all actions and reusable workflows`。若仓库使用允许列表，至少要允许 `actions/checkout`、`actions/setup-node`、`actions/setup-go` 以及 `docker/setup-buildx-action`、`docker/login-action`、`docker/metadata-action`、`docker/build-push-action`。
2. `Workflow permissions` 保持默认的只读选项即可，不需要为整个仓库选择 `Read and write permissions`。当前工作流只在 `build-and-push` job 显式申请 `packages: write` 以推送 GHCR，质量检查 job 只有 `contents: read`。
3. `Allow GitHub Actions to create and approve pull requests` 与本工作流无关，可以保持关闭。

如果仓库属于 Organization，组织级 Actions 策略可能覆盖仓库设置。选项不可修改或 GHCR 推送返回权限错误时，需要由组织所有者允许上述 Actions，并允许 `GITHUB_TOKEN` 写入 Packages。

### 自动提供的 GITHUB_TOKEN

`GITHUB_TOKEN` 由 GitHub 为每次 job 自动签发，不需要也不应该在 Secrets 中手工创建同名项目。当前工作流使用：

```text
username: github.actor
password: secrets.GITHUB_TOKEN
```

它只用于登录 `ghcr.io`，权限来自工作流声明的 `packages: write`，job 结束后失效。它不是阿里云密码，也不应复制到服务器 `.env`。GHCR 包首次发布后若需要匿名拉取，还要在 GitHub 包页面单独将可见性设为 Public；这不会影响阿里云公开镜像。

### 准备阿里云容器镜像服务

进入 [阿里云容器镜像服务 ACR 控制台](https://cr.console.aliyun.com/)，选择要使用的实例和区域。GitHub 托管 Runner 在公网运行，因此必须使用控制台显示的公网登录地址，不能使用 VPC 专有地址。

以当前公开镜像为例，提前确认以下资源存在：

```text
区域：华东 1（杭州）
公网 Registry：registry.cn-hangzhou.aliyuncs.com
命名空间：work_spac
镜像仓库：our-memories
仓库可见性：公开
```

在 ACR 的 `命名空间` 页面创建或确认命名空间，在 `镜像仓库` 页面创建 `our-memories`。在 `访问凭证` 页面查看登录用户名，并设置或重置 Registry 登录密码。该密码是容器镜像服务的固定密码，不是阿里云控制台登录密码，也不是 AccessKey Secret。

不同 ACR 版本的菜单名称可能略有差异；最可靠的来源是目标实例的“登录指引”或“访问凭证”页面，其中会给出完整的 `docker login <Registry>` 命令。

### 配置四个 Repository Secrets

进入：

```text
Settings -> Secrets and variables -> Actions -> Secrets
```

依次选择 `New repository secret`，创建以下四项。名称区分大小写：

| Secret 名称 | 当前仓库示例 | 含义 | 获取位置 |
| --- | --- | --- | --- |
| `ALIYUN_REGISTRY` | `registry.cn-hangzhou.aliyuncs.com` | ACR 公网登录域名，只填域名，不带 `https://`、命名空间或末尾斜杠 | ACR 实例的登录指引、访问凭证或镜像仓库基本信息 |
| `ALIYUN_USERNAME` | 以控制台显示为准 | ACR Registry 登录用户名 | ACR 实例的访问凭证页面 |
| `ALIYUN_PASSWORD` | 不提供示例 | ACR Registry 固定登录密码 | ACR 实例的访问凭证页面设置或重置 |
| `ALIYUN_NAMESPACE` | `work_spac` | ACR 命名空间，不包含 Registry 域名和镜像仓库名 | ACR 实例的命名空间列表 |

镜像仓库名 `our-memories` 已由工作流中的 `ALIYUN_IMAGE_NAME` 固定，不需要再创建 Secret。阿里云仓库即使允许匿名拉取，GitHub Actions 推送时仍必须配置用户名和密码。

不要把这四项只创建为 Environment secrets。当前 job 没有声明 `environment`，因此读不到 Environment secrets。组织级 Secret 也可以使用，但必须明确授权给当前仓库。

### Secrets、Variables 与服务器 .env 的区别

| 配置位置 | 工作流读取方式 | 适合内容 | 当前项目示例 |
| --- | --- | --- | --- |
| GitHub Actions Secrets | `${{ secrets.NAME }}` | 镜像仓库凭据及工作流需要隐藏的值 | 四个 `ALIYUN_*`、自动 `GITHUB_TOKEN` |
| GitHub Actions Variables | `${{ vars.NAME }}` | 工作流需要的非敏感配置 | 当前工作流未读取任何 Variable |
| 服务器 `.env` | Docker Compose `${NAME}` | 已构建容器的运行配置 | `JWT_SECRET`、初始化口令、数据目录、AI 和推送密钥 |

`ALIYUN_REGISTRY` 和 `ALIYUN_NAMESPACE` 本身不敏感，但当前 YAML 使用的是 `secrets.ALIYUN_REGISTRY` 和 `secrets.ALIYUN_NAMESPACE`，所以它们也必须建立为 Secrets。只在 Variables 页面创建同名值会得到空字符串，除非同时修改工作流为 `vars.*`。

反过来，`JWT_SECRET`、`DEFAULT_PASSWORD`、S3、AI 和极光推送配置都不参与当前镜像构建，不要上传到 GitHub Actions。服务器也不会自动获得 Actions Secrets；公开阿里云镜像部署无需在服务器保存 `ALIYUN_PASSWORD`。如果以后把镜像改为私有，应在服务器单独执行 `docker login`，并使用只有拉取权限的凭据。

### 默认分支与镜像标签

工作流使用两种标签规则：

| 标签 | 生成条件 | 含义 |
| --- | --- | --- |
| `sha-<短提交>` | 每次成功构建 | 本次运行对应的 Git commit 短 SHA，适合固定版本和回滚 |
| `latest` | 本次运行的 ref 是 GitHub 默认分支 | 默认分支最新一次成功构建 |

`sha-*` 是提交标签，不是镜像 digest。实际短 SHA 通常类似 `sha-a1b2c3d`，可在 Actions 的 metadata 或 build 输出中确认。两个 Registry 会得到相同的一组标签。

同一分支连续推送时，工作流会取消尚未完成的旧运行，避免旧提交较晚完成后把 `latest` 覆盖回旧版本。不同分支互不取消，且仍各自保留不可变的 `sha-*` 标签。

进入 `Settings -> General -> Default branch` 检查默认分支。当前 push 触发器只监听 `main` 和 `master`，因此默认分支应是其中之一：

- push 到默认分支：生成 `sha-*` 并更新 `latest`。
- push 到另一个被监听但不是默认分支的分支：只生成 `sha-*`，不更新 `latest`。
- 默认分支不是 `main` 或 `master`：push 到该默认分支不会触发当前工作流，只能手动运行，或另行修改工作流触发器。

手动运行时，选择默认分支才会更新 `latest`；选择其他分支只发布该提交的 `sha-*` 标签。

### 触发工作流

自动触发：向 `main` 或 `master` push 提交，例如：

```bash
git push origin main
```

手动触发：

```text
GitHub 仓库 -> Actions -> Build Docker Image -> Run workflow
```

选择要构建的分支后点击 `Run workflow`。`Run workflow` 按钮只有在带 `workflow_dispatch` 的工作流已经存在于默认分支时才会显示。当前工作流不监听 `pull_request`，所以仅创建或更新 PR 不会发布镜像。

### 验证发布结果

先在 Actions 运行详情中确认 `quality` 和 `build-and-push` 两个 job 都是绿色。展开以下步骤检查关键结果：

- `Log in to GitHub Container Registry` 和 `Log in to Aliyun Container Registry` 均成功。
- `Extract Docker metadata` 输出了预期的 GHCR、阿里云地址和标签。
- `Build and push Docker image` 最后输出了推送标签与 digest。

再到 ACR 控制台的 `work_spac/our-memories` 仓库查看镜像版本，或直接从公网验证。把 `<短提交>` 换成 Actions 输出的实际值：

```bash
docker pull registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:sha-<短提交>
docker buildx imagetools inspect \
  registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:sha-<短提交>
```

默认分支发布后再验证：

```bash
docker pull registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
docker buildx imagetools inspect \
  registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

GHCR 对应地址为 `ghcr.io/<GitHub 仓库所有者>/<仓库名>:<标签>`。如果包不是 Public，验证 GHCR 前需要先 `docker login ghcr.io`。

需要让服务器固定到本次构建时，设置：

```env
OUR_MEMORIES_IMAGE=registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:sha-<短提交>
```

随后执行 `docker compose pull && docker compose up -d`，再检查 `/health`。生产部署应同时记录该标签和 Actions 输出的不可变 digest。

### Actions 常见失败

- 阿里云登录返回 `401 Unauthorized`：检查 `ALIYUN_REGISTRY` 是否为公网域名，以及用户名、Registry 固定密码是否来自同一 ACR 实例。
- 推送返回 `denied` 或找不到仓库：检查 `ALIYUN_NAMESPACE`、`our-memories` 仓库是否存在，以及登录账号是否有推送权限。
- GHCR 推送返回权限错误：检查 Repository/Organization Actions 策略和 `packages: write` 是否被允许。
- metadata 输出的阿里云镜像地址为空：某个 `ALIYUN_*` 被建在 Variables 或 Environment secrets，而不是当前 job 可读取的 Repository Secrets。
- `sha-*` 已更新但 `latest` 未更新：本次运行不是 GitHub 默认分支，这是工作流的预期行为。

## 常见故障

### 容器反复重启

```bash
docker compose logs --tail=200 api
```

常见原因是 `JWT_SECRET` 仍为示例值、全新空库初始化时 `DEFAULT_PASSWORD` 不符合 8-128 个字符的要求，或 `data` 目录不可写。

### 健康检查正常但不能登录

- 首次部署确认 `AUTO_SEED=true`。
- 确认启动日志包含“种子数据初始化完成”。
- 默认变量只初始化空数据库；修改 `.env` 不会改掉现有空间的登录口令。
- 不确定数据来源时，先备份 `data`，不要直接删除数据库。

### 页面可打开但保存返回 403

确认代理传递了原始 `Host` 和 `X-Forwarded-Proto $scheme`。跨域部署时再检查 `ALLOWED_ORIGINS` 是否为精确 origin。

### 实时更新失效

确认面板已开启 WebSocket，且 `/api/v1/ws` 的握手状态是 101。检查代理是否传递 `Upgrade`/`Connection`，读取超时是否足够长。

### 图片上传后重启丢失

确认实际挂载了整个 `/app/data`，且 `LOCAL_IMAGE_DIR=/app/data/images`。只挂载数据库单文件无法持久化本地图片。

### 拉取镜像提示平台不匹配

当前公开镜像只支持 `linux/amd64`。`aarch64`/`arm64` 服务器需要自行构建 ARM 镜像或更换 x86_64 服务器。
