#!/bin/bash

# 一键部署脚本：构建管理后台并启动服务器

set -e

echo "🚀 Our Memories 部署脚本"
echo ""

# 检查环境
if [ ! -f "backend/.env" ]; then
    echo "⚠️  未找到 backend/.env 文件"
    echo "请复制 backend/.env.example 并配置 JWT_SECRET"
    exit 1
fi

# 构建管理后台
echo "📦 构建管理后台..."
cd apps/admin
npm install
npm run build
cd ../..

# 部署静态文件
echo "📋 部署静态文件到后端..."
rm -rf backend/public/admin
mkdir -p backend/public/admin
cp -r apps/admin/out/* backend/public/admin/

echo ""
echo "✅ 部署完成！"
echo ""
echo "🎯 启动服务器："
echo "   cd backend && go run main.go"
echo ""
echo "📱 访问地址："
echo "   API: http://localhost:8080/api/v1"
echo "   管理后台: http://localhost:8080/admin"
echo ""
