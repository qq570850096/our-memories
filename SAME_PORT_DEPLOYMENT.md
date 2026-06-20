# 同端口部署指南

## 架构说明

后端 Gin 服务器同时提供：
- API 接口：`http://localhost:8080/api/v1/*`
- 管理后台：`http://localhost:8080/admin/*`

管理后台构建为静态文件，部署到 `backend/public/admin/` 目录，由 Gin 直接 serve。

---

## 🚀 快速部署

### 方法 1：使用一键脚本（推荐）

```bash
# 构建并部署管理后台
./deploy.sh

# 启动服务器
cd backend
go run main.go
```

访问 http://localhost:8080/admin

### 方法 2：手动部署

```bash
# 1. 构建管理后台
cd apps/admin
npm install
npm run build

# 2. 部署到后端
npm run deploy
# 或手动复制：
# cp -r out/* ../../backend/public/admin/

# 3. 启动后端
cd ../../backend
go run main.go
```

---

## 📁 目录结构

```
backend/
├── public/
│   └── admin/              # 管理后台静态文件
│       ├── index.html
│       ├── _next/          # Next.js 资源
│       │   ├── static/
│       │   └── ...
│       └── favicon.ico
├── main.go                 # 配置了静态文件服务
└── ...

apps/
└── admin/
    ├── out/                # 构建输出（npm run build）
    └── ...
```

---

## ⚙️ 配置说明

### backend/main.go

```go
// 静态文件服务：管理后台
adminDistPath := filepath.Join(".", "public", "admin")
if stat, err := os.Stat(adminDistPath); err == nil && stat.IsDir() {
    log.Printf("Serving admin panel from %s at /admin", adminDistPath)

    // 静态资源（CSS, JS, 图片等）
    r.Static("/admin/_next", filepath.Join(adminDistPath, "_next"))
    r.StaticFile("/admin/favicon.ico", filepath.Join(adminDistPath, "favicon.ico"))

    // SPA 路由：所有 /admin/* 路径都返回 index.html
    adminGroup := r.Group("/admin")
    {
        adminGroup.GET("/*path", func(c *gin.Context) {
            indexPath := filepath.Join(adminDistPath, "index.html")
            c.File(indexPath)
        })
    }
}
```

### apps/admin/next.config.ts

```typescript
const nextConfig: NextConfig = {
  output: "export",           // 导出为静态文件
  basePath: "/admin",         // 部署在 /admin 路径下
  assetPrefix: "/admin",      // 资源前缀
  trailingSlash: true,        // URL 末尾斜杠
};
```

### apps/admin/lib/api.ts

```typescript
// 生产环境使用相对路径（同域）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
```

---

## 🔧 开发 vs 生产

### 开发环境（独立端口）

管理后台和后端分别启动：

```bash
# 终端 1：后端
cd backend
go run main.go
# http://localhost:8080

# 终端 2：管理后台
cd apps/admin
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
# http://localhost:3003
```

### 生产环境（同端口）

```bash
# 1. 构建并部署
./deploy.sh

# 2. 启动服务器
cd backend
go run main.go

# 访问：
# API: http://localhost:8080/api/v1
# 管理后台: http://localhost:8080/admin
```

---

## 🌐 CORS 配置

同端口部署后，前后端同域，**不需要** CORS。

但 `.env` 中仍需保留用户前端的 CORS 配置：

```bash
# backend/.env
ALLOWED_ORIGINS=http://localhost:3002,https://your-user-frontend.com
```

管理后台 `/admin` 路由不受 CORS 影响（同域）。

---

## 🚢 生产部署

### Systemd 服务

创建 `/etc/systemd/system/our-memories.service`：

```ini
[Unit]
Description=Our Memories API and Admin Panel
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/our-memories/backend
ExecStart=/usr/local/go/bin/go run main.go
Restart=on-failure
Environment="GIN_MODE=release"

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable our-memories
sudo systemctl start our-memories
```

### Nginx 反向代理（可选）

如果需要 HTTPS 或域名：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🐛 故障排查

### 管理后台 404

**症状**：访问 `/admin` 返回 404

**检查**：
```bash
# 确认文件存在
ls -la backend/public/admin/

# 查看后端日志
# 应该看到：Serving admin panel from ./public/admin at /admin
```

**解决**：
```bash
cd apps/admin
npm run deploy
```

### 静态资源 404

**症状**：页面空白，控制台报 `/_next/static/...` 404

**原因**：`basePath` 或 `assetPrefix` 配置错误

**检查**：
```typescript
// apps/admin/next.config.ts
basePath: "/admin",        // ✅ 正确
assetPrefix: "/admin",     // ✅ 正确
```

### API 请求失败

**症状**：登录失败，Network 错误

**检查**：
```typescript
// apps/admin/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
// 生产环境应该是空字符串（同域相对路径）
```

**生产环境 .env**：
```bash
# apps/admin/.env.production
NEXT_PUBLIC_API_BASE_URL=
```

---

## 📊 性能优化

### 1. Gzip 压缩

修改 `backend/main.go`：

```go
import "github.com/gin-contrib/gzip"

r.Use(gzip.Gzip(gzip.DefaultCompression))
```

### 2. 静态资源缓存

```go
adminGroup.Use(func(c *gin.Context) {
    // 静态资源缓存 1 年
    if strings.Contains(c.Request.URL.Path, "/_next/static/") {
        c.Header("Cache-Control", "public, max-age=31536000, immutable")
    }
    c.Next()
})
```

### 3. CDN（可选）

将 `backend/public/admin/_next/` 上传到 CDN，修改 `assetPrefix`：

```typescript
// next.config.ts
assetPrefix: process.env.NODE_ENV === 'production' 
  ? 'https://cdn.your-domain.com/admin'
  : '/admin',
```

---

## 🔐 安全建议

1. **HTTPS**：生产环境必须使用 HTTPS
2. **CSP 头**：防止 XSS 攻击
3. **Rate Limiting**：限制 API 请求频率
4. **Admin 路径隐藏**：考虑改为随机路径（如 `/a8f2d9c1`）

---

## 📚 参考

- [Gin 静态文件服务](https://gin-gonic.com/docs/examples/serving-static-files/)
- [Next.js 静态导出](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Next.js basePath](https://nextjs.org/docs/app/api-reference/next-config-js/basePath)

---

**更新日期**：2026-06-20
