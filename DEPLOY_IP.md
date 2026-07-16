# 裸 IP 部署

项目的公开镜像为：

```text
registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
```

镜像中的一个容器同时提供 Web 页面和 API。默认 Compose 配置只监听宿主机的 `127.0.0.1:18080`，建议通过 Nginx、1Panel 或宝塔反向代理后再对外访问。

## 推荐结构

```text
浏览器 -> http://服务器 IP -> 反向代理 -> 127.0.0.1:18080 -> 容器 8080
```

这样无需直接开放 `18080` 端口，Web 页面和 `/api/v1` 也始终使用同一来源。

## 首次启动

在项目目录中准备配置：

```bash
cp .env.example .env
openssl rand -base64 32
chmod 600 .env
```

编辑 `.env`，至少替换以下值：

```env
OUR_MEMORIES_IMAGE=registry.cn-hangzhou.aliyuncs.com/work_spac/our-memories:latest
APP_BIND_IP=127.0.0.1
APP_PORT=18080
DATA_DIR=./data
JWT_SECRET=替换为上一步生成的随机值

DEFAULT_SPACE_CODE=our-space-2026
DEFAULT_SPACE_NAME=我们的回忆
DEFAULT_PASSWORD=<请设置独立的12字符以上强口令>
AUTO_SEED=true
```

不要原样使用占位符。新初始化口令必须为 8-128 个字符，推荐至少 12 个字符。历史 4 位 PIN 仍可用于登录，升级后应在设置页主动改为强口令。`AUTO_SEED=true` 只会在空数据库首次启动时创建空间；已有数据时，修改这些默认值不会覆盖原空间口令。

拉取镜像并启动：

```bash
mkdir -p data
sudo chown -R 100:101 data
sudo chmod 750 data
docker compose pull
docker compose up -d
curl http://127.0.0.1:18080/health
```

健康检查应返回：

```json
{"ok":true}
```

## 配置裸 IP 反向代理

如果直接使用 Nginx，可将站点代理到 `127.0.0.1:18080`：

```nginx
server {
    listen 80;
    server_name _;

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
    }
}
```

重新加载 Nginx 后访问：

```text
Web：http://服务器 IP/
API：http://服务器 IP/api/v1
健康检查：http://服务器 IP/health
```

1Panel 和宝塔中的容器编排、站点反向代理及 HTTPS 配置见 [DEPLOYMENT.md](./DEPLOYMENT.md)，这里不重复面板操作。

## 直接开放 18080 端口

只建议在可信网络或临时测试中使用。先完成强口令初始化，再把 `.env` 改为：

```env
APP_BIND_IP=0.0.0.0
APP_PORT=18080
```

重建容器使端口映射生效：

```bash
docker compose up -d --force-recreate
```

随后放行服务器防火墙的 TCP `18080`，并访问 `http://服务器 IP:18080/`。若使用云服务器，还需要同步检查安全组规则。

## 数据位置

默认的 `./data` 会完整挂载到容器的 `/app/data`，其中包含 SQLite 数据库和本地图片。迁移或备份时必须保留整个目录；创建归档前先停止容器，避免得到不一致的数据。按空间导出的 JSON 只包含数据库记录和媒体引用，不包含图片二进制文件，不能代替完整目录备份。详细步骤见 [备份与迁移](./docs/backup-and-migration.md)。
