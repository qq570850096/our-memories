# 使用宝塔面板部署 Our Memories

本文使用项目根目录的 [docker-compose.yml](../docker-compose.yml) 和
[.env.example](../.env.example) 作为唯一部署模板。请始终使用仓库中的最新模板，
不要在本文之外维护另一份 Compose YAML。

部署后的访问链路为：

```text
浏览器 -> HTTPS 域名 -> 宝塔 Nginx/OpenResty -> 127.0.0.1:18080 -> 容器 8080
```

一个容器同时提供 Web 页面、`/api/v1` API、`/api/v1/ws` WebSocket 和 `/health`。

## 1. 部署前检查

服务器需要满足以下条件：

- 已安装宝塔面板、Nginx 或 OpenResty，以及宝塔“Docker 管理器”。
- Docker Engine 和 Docker Compose v2 可用。
- CPU 架构为 `x86_64`/`amd64`。当前公开镜像仅发布 `linux/amd64`，不支持 ARM。
- 域名已解析到服务器，云安全组和宝塔防火墙已放行 `80`、`443`。
- 不对公网开放 `18080`；该端口仅供本机反向代理使用。

在宝塔“终端”中执行：

```bash
uname -m
docker version
docker compose version
```

`uname -m` 应返回 `x86_64`。如果返回 `aarch64`，当前镜像不能在该服务器上运行。

如果系统提供 `getenforce`，同时记录 SELinux 状态：

```bash
getenforce 2>/dev/null || true
```

返回 `Enforcing` 时，除 Unix owner/mode 外还要允许容器访问 bind mount；具体处理见
“数据库 permission denied”一节。Ubuntu/Debian 通常未启用 SELinux，不要为它们添加
SELinux 专用挂载选项。

公开镜像地址为：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

阿里云仓库是公开的，无需登录。先验证网络和镜像：

```bash
docker pull registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

## 2. 准备部署目录

宝塔环境建议使用 `/www/docker/our-memories`：

```bash
mkdir -p /www/docker/our-memories/data /www/docker/our-memories/backups
chown -R 100:101 /www/docker/our-memories/data
chmod 750 /www/docker/our-memories/data
chmod 700 /www/docker/our-memories/backups
```

容器内应用使用 UID `100`、GID `101`，不是 root。宿主机数据目录必须归该用户组所有，
否则 SQLite 和本地图片无法写入。

将仓库根目录的以下文件放入 `/www/docker/our-memories`：

- `docker-compose.yml`：原样使用。
- `.env.example`：复制为 `.env` 后填写实际配置。

服务器已有仓库副本时可以执行：

```bash
cp /path/to/our-memories/docker-compose.yml /www/docker/our-memories/docker-compose.yml
cp /path/to/our-memories/.env.example /www/docker/our-memories/.env
chmod 600 /www/docker/our-memories/.env
```

也可以在宝塔“文件”中上传和编辑。`.env` 是隐藏文件，文件列表未显示时通过终端处理。

## 3. 配置 `.env`

编辑 `/www/docker/our-memories/.env`，至少确认下表：

| 变量 | 部署值 | 说明 |
| --- | --- | --- |
| `OUR_MEMORIES_IMAGE` | 阿里云公开镜像 | 首次可用 `latest`，稳定部署建议固定 `sha-...` |
| `APP_BIND_IP` | `127.0.0.1` | 仅允许本机 Nginx/OpenResty 访问 |
| `APP_PORT` | `18080` | 后续反向代理必须使用相同端口 |
| `DATA_DIR` | `/www/docker/our-memories/data` | 使用绝对路径，避免宝塔 Compose 项目目录变化导致挂错数据卷 |
| `JWT_SECRET` | 独立随机密钥 | 至少 24 个字符，必须替换示例值 |
| `ALLOWED_ORIGINS` | 完整站点 Origin | 例如 `https://memory.example.com`；不能使用 `*`，不要带路径或尾斜杠 |
| `DEFAULT_PASSWORD` | 8-128 个任意字符 | 新部署建议至少 12 个字符且不要与其他服务共用；历史 4 位 PIN 与旧长口令保持兼容 |
| `AUTO_SEED` | 首次为 `true` | 只在空数据库中初始化一个空间和两位用户 |

生成 JWT：

```bash
openssl rand -base64 32
```

根据个人情况设置 `DEFAULT_SPACE_CODE`、`DEFAULT_SPACE_NAME`、
`DEFAULT_USER_ME_NAME`、`DEFAULT_USER_TA_NAME` 和纪念日默认值。

初始值只在数据库为空时写入一次。初始化完成后，修改 `.env` 中的 `DEFAULT_*` 或
`DEFAULT_PASSWORD` 不会更新已有数据。首次登录确认正常后，建议把 `AUTO_SEED` 改成
`false` 并重新创建容器，避免数据挂载失效时自动生成一个看似正常的新空库。

默认不需要 OSS/S3。`S3_*` 留空时，媒体保存在
`/www/docker/our-memories/data/images`。如果配置了对象存储，除本地数据外还必须独立
备份存储桶；应用 JSON 备份不包含媒体二进制。

保护环境变量文件：

```bash
chmod 600 /www/docker/our-memories/.env
```

## 4. 在宝塔创建 Compose 项目

1. 打开“Docker”。如果没有该菜单，先在“软件商店”安装并启动“Docker 管理器”。
2. 进入“Compose”或“容器编排”，选择“添加 Compose 项目”。不同宝塔版本可能显示为
   “编排模板”或“Compose 管理”。
3. 新部署的项目名称填写 `our-memories`，项目目录填写 `/www/docker/our-memories`。从旧版
   命名卷部署升级时必须沿用原面板/Compose 项目名；实际值以旧容器的
   `com.docker.compose.project` 标签为准。
4. 导入 `/www/docker/our-memories/docker-compose.yml`，并确认项目读取同目录的 `.env`。
5. 创建并启动项目。不要设置多个副本，不要使用扩容；SQLite 和进程内 WebSocket
   状态要求只有一个 `api` 容器。

部分旧版 Docker 管理器不能正确加载 `.env` 或 Compose v2 语法。此时不要另写一份
YAML，直接在宝塔终端使用现有文件：

```bash
cd /www/docker/our-memories
docker compose --env-file /www/docker/our-memories/.env \
  -f /www/docker/our-memories/docker-compose.yml config
docker compose --env-file /www/docker/our-memories/.env \
  -f /www/docker/our-memories/docker-compose.yml up -d
```

`docker compose config` 的输出会展开密钥，不要把它发到公开工单。

启动后检查：

```bash
cd /www/docker/our-memories
docker compose ps
docker compose logs --tail=100 api
curl -fsS http://127.0.0.1:18080/health
```

应返回：

```json
{"ok":true}
```

## 5. 在宝塔创建整站反向代理

1. 打开“网站 -> 添加站点”，绑定域名，例如 `memory.example.com`。如果当前版本支持
   “反向代理项目”，可以直接选择该类型；否则先创建静态站点。
2. 进入站点“设置 -> 反向代理”，添加代理。
3. 代理名称填写 `our-memories`，目标 URL 填写 `http://127.0.0.1:18080`。
4. 发送域名选择或填写 `$host`，代理目录为 `/`。
5. 关闭缓存，开启“WebSocket”选项，保存配置。
6. 代理必须覆盖整个站点。不要只代理 `/api/v1`，不要改写路径前缀。

进入站点“配置文件”，确认现有代理块含有以下等效指令。宝塔已经生成
`location /` 时，只编辑现有块，不要再添加一个重复的 `location /`：

```nginx
client_max_body_size 64m;

proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

`Host` 和 `X-Forwarded-Proto` 用于安全 Cookie 与同源校验，不能删除。
`/api/v1/ws` 是 WebSocket，必须使用 HTTP/1.1 并传递 Upgrade。代理请求体限制设为
`64m`，与应用 64 MiB 上限匹配。若使用 CDN，还应允许 WebSocket，并对
`/api/v1/*` 禁用缓存。

保存配置后，在“软件商店 -> Nginx/OpenResty”中执行重载；如果宝塔提示配置错误，先
恢复到上一个可用配置，不要强制重启。

## 6. 配置 SSL

进入站点“SSL”：

1. 确认域名 A/AAAA 记录已解析到服务器。
2. 选择 Let's Encrypt，申请并部署证书。
3. HTTPS 验证正常后开启“强制 HTTPS”。
4. 在云安全组和“安全 -> 系统防火墙”中仅开放公网 `80`、`443`，不要开放 `18080`。

`.env` 中的站点 Origin 应写成 `https://memory.example.com`，不能包含页面路径或尾斜杠。

## 7. 部署验证

执行：

```bash
curl -fsS http://127.0.0.1:18080/health
curl -fsS https://memory.example.com/health
docker inspect our-memories --format '{{.State.Health.Status}}'
```

然后用浏览器完成以下检查：

1. HTTPS 首页能够加载，新配置的口令可以登录；从旧实例恢复时历史 4 位 PIN 与旧长口令仍可登录。
2. 两位用户的显示名称与初始化设置一致。
3. 新建带图片的内容，刷新页面后图片仍能显示。
4. 开发者工具 Network/WS 中 `/api/v1/ws` 返回 `101 Switching Protocols`。

确认初始化数据正确后，将 `AUTO_SEED=false`，重新应用编排：

```bash
cd /www/docker/our-memories
docker compose up -d
```

## 8. 升级、固定版本与回滚

`latest` 会随主分支发布而变化。镜像仓库同时提供 `sha-<短提交号>` 标签，长期运行
建议将 `.env` 固定到已验证的版本，例如：

```text
OUR_MEMORIES_IMAGE=registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:sha-abcdef0
```

查看当前镜像对应的源码提交：

```bash
docker inspect our-memories \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

升级前先执行下一节的停机备份。然后修改镜像标签，并在宝塔 Docker 管理器中选择
“拉取镜像/重建”，或在终端执行：

如果原 `.env` 没有 `DATA_DIR`，旧数据仍在逻辑卷 `api-data` 中。物理卷名通常是
`<Compose 项目名>_api-data`，改变宝塔项目名会创建并挂载一个新的空卷。升级前在旧
编排仍运行时记录项目名和物理卷名：

```bash
cd /www/docker/our-memories
container_id="$(docker compose ps -q api)"
docker inspect "$container_id" --format \
  'project={{index .Config.Labels "com.docker.compose.project"}} {{range .Mounts}}{{if eq .Destination "/app/data"}}type={{.Type}} source={{.Source}} name={{.Name}}{{end}}{{end}}'
```

输出为 `type=volume` 时，保持宝塔项目名与 `project=` 后的原值完全一致；若必须更换面板
项目或目录，在 `.env` 中显式加入 `COMPOSE_PROJECT_NAME=<原项目名>`，或在终端为所有
命令使用 `docker compose -p <原项目名> ...`。不要加入指向空
目录的 `DATA_DIR`。先按通用文档的[命名卷备份](../DEPLOYMENT.md#命名卷备份)创建备份，
并保留原项目名和 `name=` 后的物理卷名，再继续升级。

```bash
cd /www/docker/our-memories
docker compose pull api
docker compose up -d --remove-orphans
docker compose ps
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
docker compose logs --tail=100 api
```

升级后检查旧内容、图片、登录和 WebSocket。`/health` 只说明进程存活，不能代替业务
验证。

应用启动时会自动迁移 SQLite。回滚时不能只切换旧镜像，还要恢复升级前的数据目录，
否则旧版本可能无法读取新结构。旧镜像使用原 `sha-...` 标签，不要依赖已经变化的
`latest`。

## 9. 停机备份与恢复

SQLite 使用 WAL。容器运行时只复制 `ourMemories.db` 可能得到不一致的备份，还会漏掉
`data/images` 中的本地媒体。必须停止应用，并备份整个 `/app/data` 挂载。先检查实际
挂载类型和来源：

```bash
cd /www/docker/our-memories
docker inspect "$(docker compose ps -q api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{printf "type=%s source=%s name=%s\n" .Type .Source .Name}}{{end}}{{end}}'
```

以下脚本仅适用于 `type=bind`，并从容器反查真实宿主机 `Source`，所以支持任意绝对
`DATA_DIR`。若输出为 `type=volume`，请改用通用文档中的
[命名卷备份](../DEPLOYMENT.md#命名卷备份)和
[命名卷原地恢复](../DEPLOYMENT.md#命名卷原地恢复)，不要按下面的 `data` 目录流程操作；
同时保持原宝塔/Compose 项目名。

一致性备份命令：

```bash
set -Eeuo pipefail

cd /www/docker/our-memories
umask 077
timestamp="$(date +%Y%m%d-%H%M%S)"
archive="backups/our-memories-${timestamp}.tar.gz"
archive="$PWD/$archive"
project_dir="$PWD"
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

restart_api() {
  exit_code=$?
  trap - EXIT
  docker compose start api >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap restart_api EXIT
docker compose stop api
sudo tar --numeric-owner --transform='s#^\.$#data#;s#^\./#data/#' \
  -czf "$archive" -C "$data_source" . \
  -C "$project_dir" .env docker-compose.yml
sudo chown "$(id -u):$(id -g)" "$archive"
chmod 600 "$archive"
tar -tzf "$archive" data/ >/dev/null
docker compose start api
trap - EXIT
```

备份包含所有个人数据和密钥，应保持私有，并复制到异机或独立对象存储。使用 OSS/S3
时还要单独备份桶内对象。

可在宝塔“计划任务”中添加“Shell 脚本”，在低峰期执行相同停机备份流程。任务需要
具备 Docker 权限，并应定期删除过期备份，防止 `/www` 分区被占满。只有同机备份无法
应对磁盘损坏。

恢复或版本回滚：

```bash
set -Eeuo pipefail

cd /www/docker/our-memories
archive="backups/our-memories-YYYYMMDD-HHMMSS.tar.gz"
archive="$PWD/$archive"
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
docker compose pull api
docker compose up -d api
wait_for_health
trap - EXIT
```

替换为实际备份文件名。归档根目录中的 `.env` 和 `docker-compose.yml` 只供核对，脚本
只自动恢复 `data/`，避免改变当前挂载或 Compose 项目名。版本回滚时手工确认并恢复旧
`sha-...` 标签。完成登录、旧内容和图片检查前，保留与实际数据目录同级的
`*.before-restore-*`。健康检查失败时脚本会恢复旧目录并重启服务，同时把不完整内容
保留为 `*.failed-restore-*` 供排查。

绝对不要执行 `docker compose down -v`，也不要为了重新初始化直接删除 `data`。当前
模板使用 bind mount，但不带 `-v` 可以避免未来卷配置变化时误删数据。

应用 JSON 导出只包含数据库记录和媒体清单，不包含图片或音频二进制，不能代替全量
数据目录与对象存储备份。逻辑迁移另见
[backup-and-migration.md](backup-and-migration.md)。

## 10. 常见故障

### 拉取镜像失败或出现 exec format error

公开仓库不需要登录。先确认镜像地址拼写和服务器网络，再运行 `uname -m`。当前镜像
只支持 `x86_64`；ARM 常见报错为 `no matching manifest` 或 `exec format error`。

### Compose 提示 JWT_SECRET 未设置

确认 `.env` 位于 `/www/docker/our-memories`，且不再使用示例 JWT。旧版宝塔未读取
`.env` 时，改用文中的 `docker compose --env-file ...` 命令。

### 数据库 permission denied

先修正 Unix owner/mode：

```bash
sudo chown -R 100:101 /www/docker/our-memories/data
sudo find /www/docker/our-memories/data -type d -exec chmod 750 {} +
sudo find /www/docker/our-memories/data -type f -exec chmod 640 {} +
cd /www/docker/our-memories && docker compose up -d
```

如果仍然失败，检查 SELinux：

```bash
getenforce 2>/dev/null || true
ls -Zd /www/docker/our-memories/data
```

只有返回 `Enforcing` 的 SELinux 主机才执行下面二选一的处理。最简单的方式是在当前
`docker-compose.yml` 中仅给数据 bind mount 增加私有 relabel 标记：

```yaml
services:
  api:
    volumes:
      - "${DATA_DIR:-./data}:/app/data:Z"
```

`:Z` 会把目录标记为仅供这个容器使用。不要改成共享标签，也不要因此复制或扩容容器；
SQLite 和进程内 WebSocket 状态仍要求只运行一个 `api` 副本。修改后执行：

```bash
cd /www/docker/our-memories
docker compose up -d --force-recreate api
```

如果不想修改 Compose，可为固定的绝对路径持久设置 `container_file_t`。RHEL、Rocky、
AlmaLinux 或 CentOS 缺少 `semanage` 时，先安装发行版提供的
`policycoreutils-python-utils`：

```bash
sudo semanage fcontext -a -t container_file_t \
  '/www/docker/our-memories/data(/.*)?'
sudo restorecon -Rv /www/docker/our-memories/data
ls -Zd /www/docker/our-memories/data
cd /www/docker/our-memories && docker compose up -d --force-recreate api
```

若 `semanage` 提示该规则已存在，将 `-a` 改为 `-m`。SELinux 为 `Permissive`、
`Disabled` 或系统没有 `getenforce` 时，不要使用 `:Z`，也不要修改文件安全上下文。

### 容器正常但密码或 PIN 无法登录

- 空库首次启动需要 `AUTO_SEED=true`；新部署的 `DEFAULT_PASSWORD` 必须是 8-128 个任意字符，建议至少使用 12 个字符。
- 数据只初始化一次。已有数据库不会因修改 `.env` 而改变口令、空间码或姓名；历史 4 位 PIN 与旧长口令保持兼容。
- 确认 `DATA_DIR=/www/docker/our-memories/data` 没有被改到其他目录。

### 域名访问显示 502

先执行 `curl http://127.0.0.1:18080/health`。本机也失败时查看 `docker compose logs api`；
本机正常时检查宝塔代理目标、Nginx 配置是否已保存并重载。

### 返回 403 Origin not allowed

检查代理是否传递 `Host`、`X-Forwarded-Proto`，以及 `ALLOWED_ORIGINS` 是否为完整、精确
的 Origin。不要使用 `*`，不要填写路径或尾斜杠。

### WebSocket 反复断开

在宝塔反向代理中开启 WebSocket，确认 HTTP/1.1、Upgrade、Connection 和长超时配置已
生效。浏览器 `/api/v1/ws` 请求应返回 `101`。

### 上传或备份导入返回 413

确认站点配置的 `client_max_body_size 64m` 已生效并重载 Nginx/OpenResty。后端也限制
请求为 64 MiB，过大的迁移应改用停机全目录备份。

### 更新后版本没有变化

先执行 `docker compose pull api`，再 `docker compose up -d --remove-orphans`。通过镜像
标签和 OCI revision 检查版本。固定 `sha-...` 时，需要先修改 `.env`。

### 重启后看到新的空空间

通常是 `DATA_DIR` 挂载到了错误目录或原目录权限失效，同时 `AUTO_SEED=true` 创建了
新库。立即停机，修正挂载并恢复原数据。首次验证后应关闭自动初始化。

### 是否可以创建多个容器

不可以。应用依赖单机 SQLite 和进程内 WebSocket 状态，只能运行一个实例。不要在
宝塔中复制容器、扩容 Compose 服务或在多个后端之间负载均衡。
