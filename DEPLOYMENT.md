# Our Memories - 管理后台部署指南

## 系统概述

Our Memories 已升级为支持多用户空间和商业化的版本，包含：

- **安全修复**：修复了权限检查漏洞、时区问题、JWT 安全等问题
- **数据库升级**：添加了角色、订阅、管理员表
- **管理后台**：提供空间管理、用户管理、订单管理功能
- **商业化支持**：一次性买断模式（终身使用权）

---

## 🔧 部署步骤

### 1. 更新环境变量

在 `backend/.env` 中添加或修改：

```bash
# ⚠️ 必须修改默认值！
JWT_SECRET=your-secure-random-string-at-least-24-characters-long

# 其他配置保持不变
PORT=8080
DATABASE_PATH=./data/ourMemories.db
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:3003
```

### 2. 运行数据库迁移

数据库会自动迁移，首次启动后端时会添加新表和字段：

```bash
cd backend
go run main.go
```

检查日志确认迁移成功：
```
数据库初始化完成
```

### 3. 创建管理员账户

使用命令行工具创建第一个管理员：

```bash
cd backend
go run cmd/create_admin.go -username=admin -password=YourSecurePassword -name="Admin User"
```

输出：
```
✅ 管理员创建成功!
ID: xxxxxxxxxx
Username: admin
Display Name: Admin User
```

### 4. 启动管理后台前端

```bash
cd apps/admin
npm install
npm run dev
```

访问 http://localhost:3003

---

## 📋 功能清单

### 已修复的 Bug

✅ **权限检查漏洞**
- Anniversary Card 编辑/删除现在需要创建者权限
- Time Capsule 编辑/删除需要创建者权限
- Whisper 删除需要创建者权限

✅ **Time Capsule 时区问题**
- 统一使用 UTC 时区判断开启日期
- 修复了创建数量查询的 SQL 语法

✅ **JWT Secret 安全**
- 禁止使用默认值启动，必须在 `.env` 中设置

### 新增功能

#### 数据库扩展
- `users.role` - 用户角色（owner/member）
- `spaces.status` - 空间状态（active/suspended/deleted）
- `spaces.tier` - 订阅套餐（free/lifetime）
- `admins` 表 - 管理员账户
- `orders` 表 - 订单记录
- `audit_logs` 表 - 审计日志

#### 管理后台 API

**管理员认证**
- `POST /api/v1/admin/login` - 管理员登录

**空间管理**
- `GET /api/v1/admin/spaces` - 空间列表（分页、搜索、筛选）
- `GET /api/v1/admin/spaces/:id` - 空间详情
- `PUT /api/v1/admin/spaces/:id/status` - 更新空间状态
- `DELETE /api/v1/admin/spaces/:id` - 删除空间（软删除）

**用户管理**
- `GET /api/v1/admin/users` - 用户列表
- `PUT /api/v1/admin/users/:id/role` - 修改用户角色

**订单管理**
- `GET /api/v1/admin/orders` - 订单列表
- `POST /api/v1/admin/orders/:id/confirm` - 手动确认订单

**统计数据**
- `GET /api/v1/admin/stats` - Dashboard 统计

#### 管理后台前端

**页面**
- `/login` - 管理员登录
- `/dashboard` - 统计面板
- `/spaces` - 空间管理
- `/users` - 用户管理
- `/orders` - 订单管理

---

## 🏗️ 架构说明

### 权限模型

**当前模式**：1 Space = 2 User（情侣模式）

- **owner**：可以删除空间、修改密码、删除自己创建的内容
- **member**：可以查看和编辑，但不能删除他人内容

### 商业化模式

**一次性买断 - 终身使用**

1. 用户创建订单（前端待实现）
2. 支付完成后通知后端
3. 管理员在后台手动确认订单
4. 系统自动将 `space.tier` 升级为 `lifetime`

### 审计日志

所有管理员操作都会记录到 `audit_logs` 表：
- 更新空间状态
- 删除空间
- 修改用户角色
- 确认订单

---

## 🔒 安全注意事项

### JWT Secret
- **必须修改**默认值
- 建议使用 32 字符以上的随机字符串
- 可以用以下命令生成：
  ```bash
  openssl rand -base64 32
  ```

### 管理员密码
- 使用 Argon2 哈希存储
- 建议至少 12 位，包含大小写字母、数字、特殊字符

### CORS 配置
- 生产环境需要配置正确的 `ALLOWED_ORIGINS`
- 包含管理后台的域名

---

## 📊 数据库 Schema

### 新增字段

```sql
-- users 表
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member';

-- spaces 表
ALTER TABLE spaces ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE spaces ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE spaces ADD COLUMN purchased_at DATETIME;
ALTER TABLE spaces ADD COLUMN storage_used_bytes INTEGER DEFAULT 0;
```

### 新增表

```sql
-- 管理员
CREATE TABLE admins (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 订单
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'CNY',
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (space_id) REFERENCES spaces(id)
);

-- 审计日志
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);
```

---

## 🚀 下一步

### 待实现功能（Phase 2）

1. **前端订单创建流程**
   - 用户端订单页面
   - 支付集成（微信/支付宝）
   
2. **配额限制**
   - 免费版限制空间数、照片数
   - 付费版解锁限制

3. **邮件通知**
   - 订单确认邮件
   - 空间暂停通知

4. **照片存储管理**
   - 计算实际使用量更新 `storage_used_bytes`
   - OSS 删除失败重试队列

5. **高级管理功能**
   - 内容审核（查看用户照片）
   - 批量操作
   - 数据导出

---

## 🐛 已知限制

1. **Trip Guides 无权限检查**
   - 存储在 settings 表的 JSON 中
   - 暂时允许任何成员编辑

2. **照片删除是尽力而为**
   - OSS 删除失败仅记录日志
   - 需要实现失败重试机制

3. **缓存架构待优化**
   - 后端和前端双层缓存可能不同步
   - 建议去掉后端缓存，全靠 SWR

---

## 📞 支持

如有问题，请查看：
- 后端日志：`backend/logs/`
- 数据库文件：`backend/data/ourMemories.db`
- 管理员操作审计：`audit_logs` 表

---

**版本**：v1.0.0  
**更新日期**：2026-06-20
