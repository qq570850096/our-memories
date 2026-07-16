# 备份与迁移

Our Memories 有两种不同用途的数据迁移方式：

| 方式 | 适用场景 | 包含内容 |
| --- | --- | --- |
| 完整数据目录备份 | 整台实例恢复、换服务器、灾难恢复 | `/app/data` 中的数据库、本地图片和其他持久化文件 |
| 空间 JSON 导出 | 在两个正常运行的实例之间迁移一个空间 | 数据库记录和媒体引用，不包含图片二进制文件 |

新服务器可直接使用公开镜像，一个容器同时提供 Web 页面和 API，默认绑定宿主机 `127.0.0.1:18080`：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

1Panel、宝塔的容器和持久化目录配置见 [DEPLOYMENT.md](../DEPLOYMENT.md)。无论使用哪种方式，都不要在未确认备份可用前删除旧服务器数据。

## 完整数据目录备份

Compose 新部署默认把宿主机的 `./data` 完整挂载到容器内的 `/app/data`：

```env
DATA_DIR=./data
```

`DATA_DIR` 也可以是任意绝对路径。备份时不要手工替换脚本中的目录名，应优先从正在
运行的容器反查 `/app/data` 的真实 `Source`。这样即使面板改变 Compose 工作目录，或
`.env` 使用 `/mnt/storage/our-memories` 等路径，也不会备份错目录：

```bash
docker inspect "$(docker compose ps -q api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{printf "type=%s source=%s name=%s\n" .Type .Source .Name}}{{end}}{{end}}'
```

以下创建和恢复脚本适用于输出为 `type=bind` 的部署。若输出为 `type=volume`，说明仍在
使用旧命名卷；请改用通用部署文档中的[命名卷备份](../DEPLOYMENT.md#命名卷备份)和
[命名卷原地恢复](../DEPLOYMENT.md#命名卷原地恢复)。逻辑名 `api-data` 对应的真实卷名
依赖 Compose 项目名，迁移或升级前还必须记录并保留原项目名。

### 创建归档

归档前必须停止容器，使 SQLite 数据库和图片文件处于一致状态。部署时实际数据目录
通常归 UID `100`、GID `101` 所有，普通 SSH 用户可能无法读取，因此归档使用
`sudo tar`。`EXIT` trap 确保归档失败时也会尝试重新启动 `api`。归档内固定使用
`data/` 前缀，不保留宿主机绝对路径：

```bash
set -Eeuo pipefail

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

检查归档能否读取：

```bash
tar -tzf backups/our-memories-data-YYYYMMDD-HHMMSS.tar.gz data/ >/dev/null
```

请把归档和 `.env` 分开加密保存。`.env` 中的 `JWT_SECRET` 和外部服务凭据属于敏感信息，不应放入公开仓库。

### 在新服务器恢复

先按部署文档准备相同的 Compose 文件和 `.env`，启动一次容器，再用 `docker inspect`
确认 `/app/data` 是 `type=bind` 且 `Source` 正是预期的新服务器目录。恢复脚本不依赖
新旧服务器的 `DATA_DIR` 路径相同：它从当前容器读取目标 `Source`，将归档中的
`data/` 内容解压到该目录。失败或 60 秒内健康检查未通过时，会移走不完整目录、放回
恢复前目录并重启 `api`：

```bash
set -Eeuo pipefail

archive="our-memories-data-YYYYMMDD-HHMMSS.tar.gz"
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

把 `archive` 替换为实际归档路径。恢复后先检查页面、登录和图片，再删除与实际
`Source` 同级的 `*.before-restore-*`。如果恢复失败，保留的 `*.failed-restore-*` 可用于
排查；确认不再需要后再删除。完整数据归档不包含 `.env`，应把原 `.env` 单独加密迁移，
以保留 `JWT_SECRET` 和外部服务配置。

完整恢复使用原数据库，不会重新执行空库初始化。`AUTO_SEED=true` 和 `DEFAULT_PASSWORD` 只对空数据库有效。

## 空间 JSON 迁移

JSON 导出包含：

- 空间元数据和单独的源空间说明。当前 v2 的可恢复空间记录不会包含密码哈希；导入时始终保留目标实例的当前空间码与口令。文件的 `source.spaceCode` 仅用于标识来源和生成文件名，不会覆盖目标空间码。
- 空间用户。
- 回忆及其照片记录、纪念日及其照片记录。
- 设置、城市素材、登录图片记录、辅助项目和旅行指南店铺。
- 悄悄话及回复、时光胶囊及其照片记录。
- `media` 清单中的对象 `key` 和当前 `url` 引用。

JSON 文件不嵌入图片二进制内容。仅导入 JSON 可以恢复记录，但图片能否显示仍取决于原 URL 是否可访问，或者图片文件是否已经单独迁移。

### 从旧服务器导出

先使用空间码、原口令和用户身份登录。历史 4 位 PIN 与旧长口令均可继续使用：

```bash
OLD_API="https://old.example.com/api/v1"
read -rsp "旧空间口令: " OLD_PASSWORD
printf '\n'

TOKEN="$(
  jq -nc \
    --arg spaceCode "your-space-code" \
    --arg password "$OLD_PASSWORD" \
    '{spaceCode:$spaceCode,password:$password,userId:"me"}' \
  | curl -fsS "$OLD_API/auth/login" \
    -H 'Content-Type: application/json' --data-binary @- \
    | jq -er '.accessToken'
)"
unset OLD_PASSWORD
```

把 `your-space-code` 换成旧空间的空间码；口令会以隐藏方式读取，不会直接出现在命令历史中。随后导出：

```bash
curl -fSL "$OLD_API/backup/export" \
  -H "Authorization: Bearer $TOKEN" \
  -o our-memories-backup.json
```

妥善保护该文件，其中包含个人数据。当前 v2 文件不含密码哈希，但仍不应公开；旧版
v1 文件可能包含密码哈希，服务端只会在通过兼容性校验后接受它。

### 单独迁移图片

根据旧服务器的存储方式选择一种做法：

- 本地存储：在容器停止后迁移完整 `/app/data` 最可靠；若只迁移单个空间，至少要把 `media` 清单引用的图片按原相对路径复制到新存储。
- 对象存储：复制 `media` 清单对应的对象，并保持对象 `key` 不变。新实例配置 `S3_PUBLIC_BASE_URL` 或 `S3_ENDPOINT` 后，导入过程会按新的公开地址重写已存储 URL。

复制完成后抽查若干对象，确认新实例能够直接读取。不要把 JSON 文件误认为图片备份。

### 导入新服务器

新实例需要先有一个可登录的目标空间来授权导入，而且执行导入的身份必须是该目标
空间的 `owner`。`member` 可以导出，但不能导入，也不能修改空间登录口令。对于空数据库，
首次初始化创建的 `me` 身份是 `owner`；启动前设置：

```env
DEFAULT_SPACE_CODE=temporary-space
DEFAULT_PASSWORD=<请设置独立的12字符以上强口令>
AUTO_SEED=true
```

新部署的 `DEFAULT_PASSWORD` 必须是 8-128 个任意字符，建议至少使用 12 个字符。使用
目标实例当前的空间码和口令，以 `owner` 身份登录并取得令牌：

```bash
NEW_API="https://new.example.com/api/v1"
read -rsp "临时空间口令: " NEW_PASSWORD
printf '\n'

NEW_TOKEN="$(
  jq -nc \
    --arg spaceCode "temporary-space" \
    --arg password "$NEW_PASSWORD" \
    '{spaceCode:$spaceCode,password:$password,userId:"me"}' \
  | curl -fsS "$NEW_API/auth/login" \
    -H 'Content-Type: application/json' --data-binary @- \
    | jq -er '.accessToken'
)"
unset NEW_PASSWORD
```

导入前先为新实例创建完整数据目录备份，然后执行：

```bash
curl -fsS "$NEW_API/backup/import" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @our-memories-backup.json
```

导入会替换当前登录目标空间中的业务记录，但不会把源实例的空间码或口令带到目标
实例。目标空间 ID、当前空间码与当前登录口令保持不变；导入会提升认证版本、清除已
注册的推送设备，并使包括本次令牌在内的所有旧会话失效。成功响应包含：

```json
{"reloginRequired":true}
```

随后必须使用**目标实例导入前的空间码和当前口令**重新登录，不要改用源服务器的空间
码或口令。若目标实例原本沿用历史 4 位 PIN 或旧长口令，它仍可继续使用；建议由
`owner` 在设置页更新为 8-128 个字符的强口令。

## 校验和限制

- 在旧服务器保留可回退的数据副本，直到数据库记录和图片都核对完成。
- JSON 导入请求体上限为 64 MB。由于不包含图片二进制文件，通常不会接近该限制。
- 对象存储迁移时保持对象 `key` 不变；本地存储迁移时保持 `/app/data` 下的相对路径不变。
- 完整目录归档必须在容器停止后创建。只复制正在写入的 SQLite 文件可能得到不可用的备份。
