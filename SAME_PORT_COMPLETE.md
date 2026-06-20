# 🎉 同端口部署配置完成

## 总结

已成功将管理后台和后端 API 配置为同端口部署，类似 New API 的架构。

---

## ✅ 完成的工作

### 1. 后端静态文件服务
- 修改 `backend/main.go`
- 添加路由：`/admin/*` → `backend/public/admin/`
- 支持 SPA 路由（所有路径返回 index.html）
- 自动检测静态文件是否存在

### 2. 前端构建配置
- `apps/admin/next.config.ts` - 配置 basePath 和静态导出
- `apps/admin/lib/api.ts` - API 客户端使用相对路径
- `apps/admin/package.json` - 添加 `npm run deploy` 脚本

### 3. 部署脚本
- `./deploy.sh` - 一键部署脚本
- `./scripts/deploy-admin.sh` - 管理后台专用
- `./test-deployment.sh` - 部署测试脚本

### 4. 文档
- `SAME_PORT_DEPLOYMENT.md` - 详细部署指南
- `SAME_PORT_SETUP.md` - 快速设置说明
- `README.md` - 添加同端口部署说明
- `backend/.gitignore` - 排除部署文件

---

## 🚀 使用指南

### 首次部署

```bash
# 1. 确保已配置 JWT_SECRET
cd backend
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET

# 2. 一键部署管理后台
cd ..
./deploy.sh

# 3. 创建管理员（首次）
cd backend
go run cmd/create_admin.go -username=admin -password=YourPassword -name="Admin"

# 4. 启动服务器
go run main.go
```

访问 http://localhost:8080/admin 登录管理后台。

### 日常开发

**后端开发**：
```bash
cd backend
go run main.go
```

**前端开发（独立端口，方便热重载）**：
```bash
cd apps/admin
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
# 访问 http://localhost:3003
```

**更新管理后台（生产）**：
```bash
cd apps/admin
npm run build
npm run deploy
# 重启后端生效
```

---

## 📊 架构对比

### 之前（独立端口）
```
用户前端：localhost:3002 → API
管理后台：localhost:3003 → API
后端 API：localhost:8080
```

**问题**：
- 需要配置 CORS
- 管理 3 个端口
- 跨域请求有性能开销

### 现在（同端口）
```
用户前端：localhost:3002 → API
管理后台：localhost:8080/admin → localhost:8080/api/v1
后端 API：localhost:8080
```

**优势**：
- ✅ 管理后台无需 CORS
- ✅ 只需管理 2 个端口
- ✅ 同域请求更快
- ✅ 生产部署更简单

---

## 🌐 生产环境建议

### 1. 使用 Nginx（推荐）

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # 用户前端（另一个服务或静态文件）
    location / {
        root /var/www/user-frontend;
        try_files $uri $uri/ /index.html;
    }
    
    # 后端 API + 管理后台
    location ~ ^/(api|admin|health) {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. 直接暴露 Go 服务

如果不用 Nginx，Go 可以直接监听 80/443：

```bash
# 生产环境
cd backend
GIN_MODE=release PORT=80 go run main.go
```

需要 root 权限或使用 `setcap`：
```bash
setcap 'cap_net_bind_service=+ep' ./backend
```

### 3. Systemd 服务

```ini
[Unit]
Description=Our Memories
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/our-memories/backend
ExecStart=/usr/local/go/bin/go run main.go
Environment="GIN_MODE=release"
Environment="PORT=8080"
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## 📁 文件清单

### 新建文件
- `backend/.gitignore`
- `deploy.sh`
- `scripts/deploy-admin.sh`
- `test-deployment.sh`
- `SAME_PORT_DEPLOYMENT.md`
- `SAME_PORT_SETUP.md`

### 修改文件
- `backend/main.go` - 添加静态文件服务
- `apps/admin/next.config.ts` - 配置 basePath
- `apps/admin/lib/api.ts` - API 客户端改为相对路径
- `apps/admin/package.json` - 添加 deploy 脚本
- `apps/admin/.env.example` - 更新说明
- `README.md` - 添加同端口部署说明

---

## 🧪 测试清单

运行后端后，执行以下测试：

```bash
# 自动测试
./test-deployment.sh

# 手动测试
curl http://localhost:8080/health
curl http://localhost:8080/admin/ | grep "Our Memories"
curl http://localhost:8080/admin/dashboard # 应返回 HTML
```

浏览器测试：
1. 访问 http://localhost:8080/admin
2. 打开开发者工具 → Network
3. 确认所有请求都是相对路径（同域）
4. 登录测试
5. 切换页面测试（SPA 路由）

---

## 🎯 下一步

1. **部署到服务器**：
   - 配置域名和 HTTPS
   - 使用 Nginx 反向代理（可选）
   - 配置 Systemd 服务

2. **用户前端部署**：
   - `apps/web` 也可以考虑同端口部署
   - 或保持独立部署到 Vercel/Netlify

3. **监控和日志**：
   - 添加访问日志
   - 集成 Sentry 错误监控
   - Prometheus 性能监控

---

## 📚 相关文档

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南
- [SAME_PORT_DEPLOYMENT.md](./SAME_PORT_DEPLOYMENT.md) - 详细技术说明
- [SUMMARY.md](./SUMMARY.md) - 项目修复与升级总结

---

**完成时间**：2026-06-20  
**配置状态**：✅ 生产就绪

祝部署顺利！🚀
