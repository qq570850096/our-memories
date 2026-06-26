# APK构建与前端热更新方案

## 两种APK版本

### 1. 本地版APK（推荐用于首次发布）

**特点：**
- ✅ 内嵌完整Web资源
- ✅ 可离线使用
- ❌ 前端更新需要重新打包APK

**构建命令：**
```bash
npm run build:apk:local
# 或
./scripts/build-apk-local.sh
```

---

### 2. 远程版APK（推荐用于生产环境）⭐

**特点：**
- ✅ APK只打包一次
- ✅ 前端更新无需重新发布APK
- ✅ 用户自动获取最新前端
- ❌ 需要网络连接

**构建命令：**
```bash
npm run build:apk:remote https://your-domain.com
# 或
./scripts/build-apk-remote.sh https://your-domain.com
```

**示例：**
```bash
# 连接到你的生产服务器
./scripts/build-apk-remote.sh https://ourmemories.example.com

# 只有裸 IP / HTTP 时，用于私有分发
CAPACITOR_ALLOW_HTTP=1 CAPACITOR_SERVER_URL=http://your-server-ip npm run mobile:android:build:online

# 连接到本地开发服务器（测试）
./scripts/build-apk-remote.sh http://192.168.1.100:3000
```

---

## 前端热更新工作流程

### 远程版APK的更新流程

1. **首次发布APK**
   ```bash
   ./scripts/build-apk-remote.sh https://your-domain.com
   # 发布到应用商店或分发给用户
   ```

2. **前端代码更新**（无需重新打包APK）
   ```bash
   cd apps/web
   npm run build
   # 部署到你的服务器
   ```

3. **用户自动获取更新**
   - 用户打开APP
   - APP自动从服务器加载最新前端
   - ✅ 完成！无需下载新APK

---

## 推荐方案

### 开发阶段
- 使用**本地版APK**进行测试

### 生产环境
- 使用**远程版APK**
- 每次前端更新只需部署Web
- 用户无感知获取更新

---

## 配置文件

配置位于 `apps/mobile/capacitor.config.ts`：

```typescript
server: {
  url: process.env.CAPACITOR_SERVER_URL,  // 远程服务器地址
  cleartext: true,                         // 允许HTTP（开发用）
}
```

---

## 注意事项

1. **远程版APK需要网络**
   - 首次打开需要加载远程资源
   - 建议实现缓存机制

2. **HTTPS推荐**
   - 生产环境使用HTTPS
   - 开发环境可用HTTP
   - 裸 IP / HTTP 在线 APK 需要显式设置 `CAPACITOR_ALLOW_HTTP=1`

3. **版本兼容性**
   - 如果API接口变更，仍需发布新APK
   - 前端UI更新无需重新打包

---

## 性能优化建议

- 启用Service Worker缓存
- 使用CDN加速资源加载
- 实现离线降级方案
