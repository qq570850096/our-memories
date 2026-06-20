#!/bin/bash

# 快速测试同端口部署

set -e

echo "🧪 测试同端口部署"
echo ""

# 检查后端是否运行
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "❌ 后端未运行"
    echo "请先启动后端: cd backend && go run main.go"
    exit 1
fi

echo "✅ 后端运行正常"
echo ""

# 检查管理后台静态文件
if [ ! -f "backend/public/admin/index.html" ]; then
    echo "❌ 管理后台未部署"
    echo "运行部署脚本: ./deploy.sh"
    exit 1
fi

echo "✅ 管理后台文件存在"
echo ""

# 测试 API
echo "测试 API 端点..."
API_HEALTH=$(curl -s http://localhost:8080/health | grep -c "ok" || true)
if [ "$API_HEALTH" -gt 0 ]; then
    echo "✅ API 健康检查通过"
else
    echo "❌ API 响应异常"
    exit 1
fi

# 测试管理后台
echo ""
echo "测试管理后台..."
ADMIN_HTML=$(curl -s http://localhost:8080/admin/ | grep -c "Our Memories Admin" || true)
if [ "$ADMIN_HTML" -gt 0 ]; then
    echo "✅ 管理后台页面正常"
else
    echo "⚠️  管理后台页面可能有问题（但文件存在）"
fi

echo ""
echo "🎉 测试完成！"
echo ""
echo "访问地址："
echo "  API: http://localhost:8080/api/v1"
echo "  管理后台: http://localhost:8080/admin"
echo ""
