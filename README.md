# Our Memories - 情侣回忆录

> 一个为情侣设计的私密回忆记录应用，支持照片、日记、纪念日、时光胶囊等功能。现已升级为商业化版本，支持管理后台和订阅管理。

## ✨ 核心功能

### 用户端
- 📸 **回忆相册** - 按城市分类的照片和文字记录
- 🎂 **纪念日卡片** - 重要日期提醒和回顾
- ⏰ **时光胶囊** - 未来开启的惊喜
- 💬 **悄悄话** - 双人私密聊天
- 🗺️ **足迹地图** - 可视化去过的地方
- 🎨 **自定义主题** - 个性化登录页和城市封面

### 管理后台（新增）
- 👥 **空间管理** - 查看、暂停、删除用户空间
- 🔐 **用户管理** - 角色分配和权限控制
- 💰 **订单管理** - 一次性买断订单处理
- 📊 **统计面板** - 运营数据总览
- 📝 **审计日志** - 管理员操作记录

## 🚀 快速开始

### 前置要求
- Go 1.21+
- Node.js 18+
- npm 或 yarn

### 1. 克隆项目
```bash
git clone <repository-url>
cd our-memories
```

### 2. 配置后端
```bash
cd backend
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET（必须！）
go mod download
```

### 3. 启动后端（自动迁移数据库）
```bash
go run main.go
# 输出: Server starting on port 8080
```

### 4. 创建管理员（首次）
```bash
go run cmd/create_admin.go \
  -username=admin \
  -password=YourSecurePassword \
  -name="Admin User"
```

### 5. 启动用户前端
```bash
cd ../apps/web
npm install
npm run dev
# 访问 http://localhost:3002
```

### 6. 启动管理后台
```bash
cd ../apps/admin
npm install
npm run dev
# 访问 http://localhost:3003
```

## 📚 详细文档

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南
- [SAME_PORT_DEPLOYMENT.md](./SAME_PORT_DEPLOYMENT.md) - 同端口部署指南（前后端同域）
- [SUMMARY.md](./SUMMARY.md) - 项目修复与升级总结
- [计划文档](./.claude/plans/elegant-giggling-flame.md) - 实现计划

## 🔒 安全修复

本次更新修复了以下安全漏洞：

✅ **权限检查缺失**
- Anniversary Card 编辑/删除权限
- Time Capsule 编辑/删除权限
- Whisper 删除权限

✅ **时区逻辑错误**
- Time Capsule 开启日期判断统一使用 UTC

✅ **JWT Secret 不安全**
- 禁止使用默认值启动

## 🏗️ 技术栈

### 后端
- **语言**: Go 1.21
- **框架**: Gin
- **数据库**: SQLite（生产可升级为 PostgreSQL）
- **认证**: JWT
- **存储**: 阿里云 OSS / AWS S3

### 前端
- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: TailwindCSS 4
- **状态**: SWR
- **UI**: Lucide Icons

## 💰 商业化模式

**一次性买断 - 终身使用**

- **免费版**: 基础功能，限制 100 张照片
- **终身版**: ¥99 一次性付费，无限照片，全部功能

## 📦 项目结构

```
our-memories/
├── backend/              # Go 后端
│   ├── cmd/             # 命令行工具（创建管理员）
│   ├── handlers/        # API 处理器
│   ├── middleware/      # 中间件（认证、权限）
│   ├── models/          # 数据模型
│   ├── db/              # 数据库迁移
│   ├── utils/           # 工具函数
│   └── main.go          # 入口文件
├── apps/
│   ├── web/             # 用户前端（Next.js）
│   └── admin/           # 管理后台（Next.js）
├── DEPLOYMENT.md        # 部署指南
└── SUMMARY.md           # 项目总结
```

## 🧪 测试

### 权限测试
```bash
# 创建两个用户 A 和 B（同一个 space）
# A 创建内容，B 尝试删除 → 应返回 403
```

### 管理后台测试
```bash
# 登录管理后台
# 暂停某个 space
# 该 space 的用户登录 → 应提示账户已暂停
```

## 🐛 已知限制

1. **Trip Guides 无权限检查** - 存储在 JSON 中，暂时允许任何成员编辑
2. **照片删除失败无重试** - OSS 删除失败仅记录日志
3. **前端订单创建未实现** - 需要对接支付网关

详见 [SUMMARY.md](./SUMMARY.md)

## 📝 环境变量

### 后端必需
```bash
JWT_SECRET=<32+ 字符随机字符串>
DATABASE_PATH=./data/ourMemories.db
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:3003
```

### 可选配置
```bash
S3_ENDPOINT=<对象存储端点>
S3_ACCESS_KEY_ID=<访问密钥>
S3_SECRET_ACCESS_KEY=<密钥>
DEEPSEEK_API_KEY=<AI 润色 API 密钥>
```

完整配置见 `backend/.env.example`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**版本**: v1.0.0
**状态**: ✅ 生产就绪
**最后更新**: 2026-06-20

---

## 🔗 同端口部署

推荐使用同端口部署（前后端同域），简化架构和配置：

```bash
# 一键部署
./deploy.sh

# 启动服务器
cd backend && go run main.go

# 访问
# API: http://localhost:8080/api/v1
# 管理后台: http://localhost:8080/admin
```

详见 [SAME_PORT_DEPLOYMENT.md](./SAME_PORT_DEPLOYMENT.md)
