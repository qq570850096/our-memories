package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// BodySizeLimit 限制请求体最大字节数，防止超大 JSON（如残留的 base64 内嵌图片）打爆内存。
// 真正的图片字节走前端直传 OSS，不经过本服务，所以这里只用于保护 JSON 接口。
func BodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
