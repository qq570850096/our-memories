# 裸 IP 部署

目标地址：

```text
http://your-server-ip/
```

推荐使用同端口部署：用户端、管理端和 API 都由同一个 Go 服务提供。

## 本地验证

```bash
npm install
./deploy.sh

PORT=8080 \
GIN_MODE=release \
DATABASE_PATH=./backend/data/ourMemories.db \
PUBLIC_DIR=./backend/public \
JWT_SECRET=<32字符以上随机密钥> \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=<强密码> \
ALLOWED_ORIGINS=http://your-server-ip,http://localhost:3002,http://localhost:3003 \
./dist/our-memories-api
```

验证：

```bash
BASE_URL=http://localhost:8080 ./test-deployment.sh
```

## 服务器环境变量

生产环境至少设置：

```bash
PORT=8080
GIN_MODE=release
DATABASE_PATH=./backend/data/ourMemories.db
PUBLIC_DIR=./backend/public
JWT_SECRET=<32字符以上随机密钥>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<强密码>
ALLOWED_ORIGINS=http://your-server-ip,http://localhost:3002,http://localhost:3003
```

如果前端和后端同域部署，构建 Web/Admin 时保持：

```bash
NEXT_PUBLIC_API_BASE_URL=
```

这样前端会直接请求相对路径 `/api/v1`。

## 访问地址

```text
用户端: http://your-server-ip/
管理端: http://your-server-ip/admin/
API: http://your-server-ip/api/v1
```

## Docker 注意

`Dockerfile` 已去掉远程 Dockerfile frontend 语法声明，国内服务器构建时少一次额外拉取。

如果 Docker 仍然报镜像拉取失败，需要修服务器 Docker 代理或镜像源；项目本身构建入口已经不再依赖旧的 `@map-of-us/server` workspace。
