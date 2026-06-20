# 同端口部署完成！

## ✅ 已完成的配置

### 后端改动
- ✅ `backend/main.go` - 添加静态文件服务逻辑
  - 路由：`/admin/*` → serve from `backend/public/admin/`
  - 静态资源：`/admin/_next/*`
  - SPA 路由支持（所有路径返回 index.html）

### 前端改动
- ✅ `apps/admin/next.config.ts` - 配置静态导出
  - `output: "export"` - 导出为静态文件
  - `basePath: "/admin"` - 部署在 /admin 路径
  - `assetPrefix: "/admin"` - 资源前缀
  
- ✅ `apps/admin/lib/api.ts` - API 客户端改为相对路径
  - 生产环境：空字符串（同域）
  - 开发环境：可配置 `NEXT_PUBLIC_API_BASE_URL`

- ✅ `apps/admin/package.json` - 添加部署脚本
  - `npm run deploy` - 一键部署到后端

### 部署脚本
- ✅ `deploy.sh` - 一键构建和部署
- ✅ `scripts/deploy-admin.sh` - 管理后台专用部署
- ✅ `test-deployment.sh` - 部署测试脚本

### 文档
- ✅ `SAME_PORT_DEPLOYMENT.md` - 详细的同端口部署指南
- ✅ `README.md` - 添加同端口部署说明
- ✅ `backend/.gitignore` - 排除 public/ 目录

---

## 🚀 使用方法

### 方法 1：一键部署（推荐）

```bash
# 1. 构建并部署管理后台
./deploy.sh

# 2. 启动后端
cd backend
go run main.go

# 3. 访问
# http://localhost:8080/admin
```

### 方法 2：手动部署

```bash
# 1. 构建
cd apps/admin
npm install
npm run build

# 2. 部署
npm run deploy

# 3. 启动后端
cd ../../backend
go run main.go
```

### 开发模式（独立端口）

```bash
# 终端 1：后端
cd backend
go run main.go

# 终端 2：前端
cd apps/admin
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev
# 访问 http://localhost:3003
```

---

## 🔍 测试部署

```bash
# 启动后端后运行
./test-deployment.sh
```

预期输出：
```
✅ 后端运行正常
✅ 管理后台文件存在
✅ API 健康检查通过
✅ 管理后台页面正常
```

---

## 📁 部署后的目录结构

```
backend/
├── public/
│   └── admin/
│       ├── index.html         # 管理后台入口
│       ├── _next/
│       │   ├── static/        # JS/CSS
│       │   └── ...
│       └── favicon.ico
├── main.go                    # 已配置静态服务
└── ...
```

---

## 🌐 URL 结构

| 路径 | 功能 | 备注 |
|------|------|------|
| `/api/v1/*` | 后端 API | JSON 接口 |
| `/admin` | 管理后台首页 | 重定向到 /admin/ |
| `/admin/` | 管理后台 | 返回 index.html |
| `/admin/dashboard` | Dashboard 页面 | SPA 路由 |
| `/admin/spaces` | 空间管理 | SPA 路由 |
| `/admin/_next/*` | 静态资源 | JS/CSS/图片 |
| `/health` | 健康检查 | 返回 JSON |

---

## 🎯 优势

相比独立端口部署：

✅ **无需 CORS 配置** - 前后端同域  
✅ **部署简单** - 只需一个端口  
✅ **性能更好** - 无跨域请求开销  
✅ **管理方便** - 统一的服务和日志  
✅ **生产就绪** - 类似 New API 的架构  

---

## 📝 环境变量

### 开发环境
```bash
# apps/admin/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

### 生产环境
```bash
# apps/admin/.env.production
NEXT_PUBLIC_API_BASE_URL=
```

或直接不配置（默认为空字符串）。

---

## 🔧 故障排查

### 问题：管理后台 404

**解决**：
```bash
# 确认文件存在
ls backend/public/admin/index.html

# 重新部署
cd apps/admin
npm run deploy
```

### 问题：静态资源 404

**检查**：
```bash
# 确认 Next.js 配置正确
cat apps/admin/next.config.ts
# 应该有 basePath: "/admin"
```

### 问题：API 请求失败

**检查**：
```typescript
// apps/admin/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
// 生产环境应该是空字符串
```

---

## 🎉 完成！

现在你的管理后台和 API 运行在同一个端口上，架构更加简洁和高效！

参考：[SAME_PORT_DEPLOYMENT.md](./SAME_PORT_DEPLOYMENT.md) 获取更多详细信息。
