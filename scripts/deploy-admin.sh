#!/bin/bash

# 部署管理后台到后端静态文件目录

set -e

echo "🚀 开始部署管理后台..."

# 进入管理后台目录
cd "$(dirname "$0")/../apps/admin"

echo "📦 构建管理后台..."
npm run build

echo "📁 清理旧文件..."
rm -rf ../../backend/public/admin

echo "📋 复制新文件..."
mkdir -p ../../backend/public/admin
cp -r out/* ../../backend/public/admin/

echo "✅ 部署完成！"
echo ""
echo "启动后端服务器："
echo "  cd backend && go run main.go"
echo ""
echo "访问地址："
echo "  http://localhost:8080/admin"
