# 使用 1Panel 部署 Our Memories

本文使用项目根目录的 [docker-compose.yml](../docker-compose.yml) 和
[.env.example](../.env.example) 作为唯一部署模板。请直接使用仓库中的最新文件，
不要从本文另抄一份 Compose 配置，以免后续升级时配置不一致。

部署后的访问链路为：

```text
浏览器 -> HTTPS 域名 -> 1Panel/OpenResty -> 127.0.0.1:18080 -> 容器 8080
```

同一个容器同时提供 Web 页面、`/api/v1` API、`/api/v1/ws` WebSocket 和
`/health` 健康检查。

## 1. 部署前检查

服务器需要满足以下条件：

- 已安装 1Panel、Docker Engine 和 Docker Compose v2。
- CPU 架构为 `x86_64`/`amd64`。当前公开镜像仅发布 `linux/amd64`，不支持
  `aarch64`/ARM 服务器。
- 域名已解析到服务器，安全组和防火墙已放行 `80`、`443`。
- 不需要开放 `18080`。应用只监听宿主机回环地址，由反向代理访问。
- 至少为应用保留能容纳数据库、照片、音频和备份的磁盘空间。

在 1Panel 的“主机 -> 终端”中检查：

```bash
uname -m
docker version
docker compose version
```

`uname -m` 应返回 `x86_64`。如果返回 `aarch64`，不要继续启动当前镜像。

应用镜像位于：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

这是公开镜像，无需执行 `docker login`。可以先验证拉取是否正常：

```bash
docker pull registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

## 2. 准备部署目录

建议将 Compose 文件、环境变量、数据和备份集中放在 `/opt/our-memories`：

```bash
mkdir -p /opt/our-memories/data /opt/our-memories/backups
chown -R 100:101 /opt/our-memories/data
chmod 750 /opt/our-memories/data
chmod 700 /opt/our-memories/backups
```

镜像以非 root 用户运行，UID 为 `100`、GID 为 `101`。如果没有执行 `chown`，
SQLite 可能因无权创建数据库而启动失败。

Rocky Linux、AlmaLinux、CentOS Stream 或 RHEL 主机还应执行 `getenforce`。返回
`Enforcing` 时，Unix 所有权正确也可能被 SELinux 拒绝；请按“常见故障”中的 SELinux
步骤为 bind mount 添加 `:Z` 并设置持久文件标签，不要关闭 SELinux。

将仓库根目录的以下两个文件放入 `/opt/our-memories`：

- `docker-compose.yml`：保持文件名不变。
- `.env.example`：复制为 `.env`，不要直接修改示例文件。

如果服务器上已经克隆了仓库，可以执行：

```bash
cp /path/to/our-memories/docker-compose.yml /opt/our-memories/docker-compose.yml
cp /path/to/our-memories/.env.example /opt/our-memories/.env
chmod 600 /opt/our-memories/.env
```

也可以使用 1Panel 文件管理器上传这两个文件。文件管理器隐藏点文件时，使用终端
创建 `.env`。

## 3. 配置 `.env`

在 1Panel 文件管理器或终端中编辑 `/opt/our-memories/.env`。至少确认以下配置：

| 变量 | 部署值 | 说明 |
| --- | --- | --- |
| `OUR_MEMORIES_IMAGE` | 阿里云镜像地址 | `latest` 适合首次体验，稳定运行建议固定 `sha-...` 标签 |
| `APP_BIND_IP` | `127.0.0.1` | 不要把应用端口直接暴露到公网 |
| `APP_PORT` | `18080` | 与后续反向代理目标端口一致 |
| `DATA_DIR` | `/opt/our-memories/data` | 使用绝对路径，避免 1Panel 改变 Compose 工作目录后挂载到错误位置 |
| `JWT_SECRET` | 独立随机值 | 必须至少 24 个字符，不能保留示例值 |
| `ALLOWED_ORIGINS` | 精确的站点 Origin | 例如 `https://memory.example.com`；多个值用英文逗号分隔，不能使用 `*`，不要带尾斜杠 |
| `DEFAULT_PASSWORD` | 8-128 个字符 | 新初始化必须使用强口令，推荐至少 12 个字符；不要留空或使用文档占位符 |
| `AUTO_SEED` | 首次为 `true` | 仅在空数据库中创建初始空间和两位用户 |

生成 JWT 密钥：

```bash
openssl rand -base64 32
```

同时按个人需要设置：

- `DEFAULT_SPACE_CODE`、`DEFAULT_SPACE_NAME`
- `DEFAULT_USER_ME_NAME`、`DEFAULT_USER_TA_NAME`
- `DEFAULT_ANNIVERSARY_DATE`、`DEFAULT_ANNIVERSARY_LABEL`

初始数据只会在数据库没有空间时创建一次。应用已经产生数据后，再修改上述
`DEFAULT_*` 或 `DEFAULT_PASSWORD` 不会覆盖数据库中的名称、空间码或登录口令。历史 4 位
PIN 仍可登录，升级后应在设置页主动改为 8-128 个字符的强口令。
首次登录验证成功后，建议把 `AUTO_SEED` 改为 `false` 并重新创建容器。这样数据挂载
意外丢失时，应用不会悄悄生成一个新的空空间。

不使用对象存储时，将 `S3_*` 保持为空即可；图片和音频会保存在
`/opt/our-memories/data/images`，因此必须备份整个数据目录。使用 OSS/S3 时，仍需
单独备份对象存储中的媒体文件，应用导出的 JSON 不包含媒体二进制。

不要把 `.env` 上传到公开仓库、聊天记录或工单。修改后再次确认权限：

```bash
chmod 600 /opt/our-memories/.env
```

## 4. 在 1Panel 创建 Compose 编排

1. 打开“容器 -> 编排”，选择“创建编排”。不同版本可能显示为“Compose”或
   “编排模板”。
2. 新部署的项目名称填写 `our-memories`。从旧版命名卷部署升级时必须沿用原项目名，
   不要在 1Panel 中另建一个不同名称的编排；实际项目名以旧容器的
   `com.docker.compose.project` 标签为准。
3. 选择从路径创建或导入已有 Compose，工作目录填写 `/opt/our-memories`，文件选择
   `/opt/our-memories/docker-compose.yml`。
4. 确认 1Panel 使用同目录的 `/opt/our-memories/.env`。如果界面提供单独的“环境变量”
   输入框，可以导入该文件内容，但不要同时维护两套不同值。
5. 创建并启动编排。不要设置副本数，不要执行扩容；SQLite 和进程内 WebSocket 状态
   要求始终只有一个 `api` 容器。

若 1Panel 版本无法正确读取 `.env`，在终端使用同一份模板启动：

```bash
cd /opt/our-memories
docker compose --env-file /opt/our-memories/.env \
  -f /opt/our-memories/docker-compose.yml config
docker compose --env-file /opt/our-memories/.env \
  -f /opt/our-memories/docker-compose.yml up -d
```

`docker compose config` 会展开环境变量，其中包含密钥，不要把输出公开。

先在服务器本机验证：

```bash
cd /opt/our-memories
docker compose ps
docker compose logs --tail=100 api
curl -fsS http://127.0.0.1:18080/health
```

健康检查应返回：

```json
{"ok":true}
```

## 5. 在 1Panel 创建整站反向代理

1. 打开“网站 -> 网站”，创建“反向代理”类型的网站；已有站点时进入该站点的
   “反向代理”设置。
2. 填写域名，例如 `memory.example.com`。
3. 代理地址填写 `http://127.0.0.1:18080`。
4. 代理整个 `/`，不要只代理 `/api/v1`，也不要添加或删除路径前缀。
5. 关闭代理缓存，开启 WebSocket 支持。
6. 保存后检查代理配置包含下列等效设置。面板已经生成 `location /` 时，只补充缺少的
   指令，不要再创建第二个冲突的 `location /`：

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

`Host` 和 `X-Forwarded-Proto` 不能省略：应用依赖它们识别同源 HTTPS 请求并设置安全
Cookie。`/api/v1/ws` 使用 WebSocket，未开启 Upgrade 时页面会反复断线重连。
`client_max_body_size 64m` 用于本地媒体请求和备份导入；应用本身同样有 64 MiB 请求
上限。

如果还使用了 CDN，应允许 WebSocket，并对 `/api/v1/*` 禁用缓存。

## 6. 配置 HTTPS

在站点的“HTTPS”或“SSL”页面申请 Let's Encrypt 证书：

1. 确认域名 A/AAAA 记录已经指向当前服务器。
2. 申请并启用证书。
3. HTTPS 访问验证正常后，开启“强制 HTTPS”。
4. 防火墙仅保留公网 `80`、`443`，不要开放 `18080`。

如果 `.env` 的 `ALLOWED_ORIGINS` 使用域名，请写完整 Origin，例如
`https://memory.example.com`，不要写路径或尾斜杠。

## 7. 部署验证

依次检查：

```bash
curl -fsS http://127.0.0.1:18080/health
curl -fsS https://memory.example.com/health
docker inspect our-memories --format '{{.State.Health.Status}}'
```

然后在浏览器中：

1. 打开 HTTPS 首页，输入 `.env` 中配置的登录口令。
2. 分别选择两位用户登录，确认名称正确。
3. 新建一条带图片的内容并刷新页面，确认图片仍可访问。
4. 在浏览器开发者工具的 Network/WS 中确认 `/api/v1/ws` 返回 `101 Switching Protocols`。

验证成功后，将 `AUTO_SEED=false`，再执行：

```bash
cd /opt/our-memories
docker compose up -d
```

## 8. 升级与固定镜像版本

`latest` 是可变标签，适合快速安装，但不利于审计和回滚。镜像发布流程同时生成
`sha-<短提交号>` 标签。稳定部署建议在 `.env` 中固定已经验证过的标签，例如：

```text
OUR_MEMORIES_IMAGE=registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:sha-abcdef0
```

可以记录当前容器对应的源码提交：

```bash
docker inspect our-memories \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

每次升级前先执行下一节的停机备份，然后修改 `.env` 中的镜像标签并运行：

如果这是从旧版升级，且原 `.env` 没有 `DATA_DIR`，数据仍在逻辑卷 `api-data` 中。
它的实际卷名通常是 `<Compose 项目名>_api-data`，因此升级前必须在旧编排仍运行时记录
项目名和物理卷名：

```bash
cd /opt/our-memories
container_id="$(docker compose ps -q api)"
docker inspect "$container_id" --format \
  'project={{index .Config.Labels "com.docker.compose.project"}} {{range .Mounts}}{{if eq .Destination "/app/data"}}type={{.Type}} source={{.Source}} name={{.Name}}{{end}}{{end}}'
```

输出为 `type=volume` 时，保持 1Panel 编排项目名与 `project=` 后的原值完全一致；若必须
更换面板项目或部署目录，在 `.env` 中显式加入 `COMPOSE_PROJECT_NAME=<原项目名>`，或
在终端为所有命令使用 `docker compose -p <原项目名> ...`。
不要加入指向空目录的 `DATA_DIR`。先按通用文档的[命名卷备份](../DEPLOYMENT.md#命名卷备份)
完成备份，并保留原项目名与 `name=` 后的物理卷名，再继续升级。

```bash
cd /opt/our-memories
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

升级后还要验证登录、读取旧内容、图片和 WebSocket，不能只看 `/health`。

如需回滚，必须同时恢复升级前的数据备份和旧 `sha-...` 镜像。应用启动时会自动迁移
SQLite，单独回退镜像可能无法兼容已经升级的数据库。

## 9. 停机备份与恢复

SQLite 使用 WAL 模式。在线只复制 `ourMemories.db` 可能遗漏 WAL 中的数据；请停止容器
后备份整个 `/app/data` 挂载，而不是只备份一个数据库文件。先检查实际挂载：

```bash
cd /opt/our-memories
docker inspect "$(docker compose ps -q api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{printf "type=%s source=%s name=%s\n" .Type .Source .Name}}{{end}}{{end}}'
```

以下脚本仅适用于 `type=bind`。它从容器反查真实 `Source`，即使 `DATA_DIR` 改为其他
绝对路径也不会备份错目录。若输出为 `type=volume`，不要运行下面的 bind mount 脚本，
请使用通用文档中的[命名卷备份](../DEPLOYMENT.md#命名卷备份)和
[命名卷原地恢复](../DEPLOYMENT.md#命名卷原地恢复)，并保持原 1Panel/Compose 项目名。

手动创建一致性备份：

```bash
set -Eeuo pipefail

cd /opt/our-memories
mkdir -p backups
umask 077
timestamp="$(date +%Y%m%d-%H%M%S)"
archive="$PWD/backups/our-memories-${timestamp}.tar.gz"
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

备份包含个人内容和密钥，必须保持私有，并定期复制到另一台机器或独立对象存储。
只保存在同一块服务器磁盘上不属于灾难恢复。使用 OSS/S3 时，还要单独备份对应桶。

可以在“计划任务 -> Shell 脚本”中使用同样流程安排低峰期备份。计划任务必须以有权
操作 Docker 和读取 `/opt/our-memories` 的用户执行，并设置保留周期，避免备份占满磁盘。

恢复或回滚：

```bash
set -Eeuo pipefail

cd /opt/our-memories
archive="$PWD/backups/our-memories-YYYYMMDD-HHMMSS.tar.gz"
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

将示例备份文件名替换为实际文件。归档根目录还保存了备份时的 `.env` 和
`docker-compose.yml` 供核对，但脚本只自动恢复 `data/`，避免意外改变当前挂载和
Compose 项目名。版本回滚时先手工核对并恢复旧镜像标签。验证登录、旧内容和图片前，
保留与实际数据目录同级的 `*.before-restore-*`；健康检查失败时脚本会放回该目录，并把
不完整数据留为 `*.failed-restore-*`。

不要执行 `docker compose down -v`，也不要删除数据目录。虽然当前模板使用 bind mount，
养成不带 `-v` 的习惯可避免以后切换卷配置时误删数据。

应用内 JSON 导出适合逻辑迁移，但只包含媒体清单，不包含图片和音频文件，不能替代
上述全目录备份。更多逻辑迁移说明见
[backup-and-migration.md](backup-and-migration.md)。

## 10. 常见故障

### 镜像无法运行或提示架构不匹配

执行 `uname -m`。当前镜像只支持 `x86_64`/`amd64`；ARM 服务器常见错误为
`no matching manifest` 或 `exec format error`。

### Compose 提示 JWT_SECRET 未设置

确认 `.env` 与 `docker-compose.yml` 位于同一编排目录，且 `JWT_SECRET` 已替换示例值。
用带显式 `--env-file` 的命令执行 `docker compose config` 检查加载路径。

### 容器日志出现 permission denied 或 unable to open database

修复数据目录所有权后重建容器：

```bash
chown -R 100:101 /opt/our-memories/data
chmod 750 /opt/our-memories/data
cd /opt/our-memories && docker compose up -d
```

如果 `getenforce` 返回 `Enforcing`，再检查 SELinux 标签：

```bash
getenforce
ls -Zd /opt/our-memories/data
ausearch -m AVC -ts recent | tail -n 50
```

在 `/opt/our-memories/docker-compose.yml` 中把数据挂载改为带私有重标记的形式：

```yaml
services:
  api:
    volumes:
      - "${DATA_DIR:-./data}:/app/data:Z"
```

大写 `:Z` 会把目录标记为仅供这个容器使用，符合本项目必须单副本运行的约束。不要改成
小写 `:z` 与其他容器共享同一个 SQLite 目录。修改后强制重建容器以应用挂载选项：

```bash
cd /opt/our-memories
docker compose up -d --force-recreate
```

如果恢复备份、移动目录或系统执行 `restorecon` 后标签反复丢失，为实际数据目录注册持久
SELinux 规则，再让 Compose 的 `:Z` 分配容器私有标签：

```bash
# Rocky/Alma/RHEL 8+ 缺少 semanage 时先安装 policycoreutils-python-utils
semanage fcontext -a -t container_file_t '/opt/our-memories/data(/.*)?'
restorecon -Rv /opt/our-memories/data
cd /opt/our-memories
docker compose up -d --force-recreate
```

规则已存在时，将 `semanage fcontext -a` 换成 `semanage fcontext -m`。再次用 `ls -Zd`
和容器日志验证。`chcon` 只会临时改标签，后续 `restorecon` 可能撤销；不要用
`setenforce 0`、禁用 SELinux 或 `chmod 777` 作为长期解决方案。

### 容器健康但登录返回 401

- 首次启动必须设置 `AUTO_SEED=true`，并将 `DEFAULT_PASSWORD` 设为 8-128 个字符的强口令，推荐至少 12 个字符。
- 初始数据只创建一次。数据库已经存在时，修改 `.env` 不会更改现有登录口令或空间码；历史 4 位 PIN 可继续登录，并应在设置页主动升级。
- 检查 `DATA_DIR` 是否仍指向 `/opt/our-memories/data`，不要为“重新初始化”直接删除
  数据目录。

### 域名返回 502

先在服务器执行 `curl http://127.0.0.1:18080/health`。失败时查看容器日志；本机成功而
域名失败时，检查 1Panel 上游地址是否为同一个 `127.0.0.1:18080`，以及站点配置是否
已重新加载。

### 请求返回 403 Origin not allowed

确认反向代理保留 `Host` 和 `X-Forwarded-Proto`，并检查 `ALLOWED_ORIGINS` 是否为精确
Origin。不要使用 `*`，不要包含路径或尾斜杠。

### WebSocket 不断重连

确认 1Panel 已开启 WebSocket，代理使用 HTTP/1.1 并传递 `Upgrade`、`Connection`，
读写超时足够长。浏览器中的 `/api/v1/ws` 应返回 `101`。

### 上传或导入返回 413

确认站点配置中 `client_max_body_size 64m` 已生效并重载 OpenResty。应用本身也限制
请求为 64 MiB，超出限制的备份需要拆分数据或使用全目录迁移。

### 更新后仍运行旧镜像

执行 `docker compose pull api` 后再执行 `docker compose up -d --remove-orphans`，并通过
镜像标签和 OCI revision 标签确认版本。固定 `sha-...` 时必须先修改 `.env`。

### 重启后出现全新的空空间

通常表示 `DATA_DIR` 挂载错误或原数据目录不可访问，而 `AUTO_SEED=true` 又初始化了
新数据库。立即停止容器，修正挂载并恢复原数据；首次验证后应将 `AUTO_SEED=false`。

### 能否运行多个副本

不能。当前架构使用单机 SQLite 和进程内 WebSocket 状态，只能运行一个应用容器。
不要在 1Panel 中扩容、复制容器或配置负载均衡多实例。
