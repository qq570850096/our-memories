package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

// AdminAuthMiddleware 管理员认证中间件
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.Error(c, 401, "Authentication required")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.Error(c, 401, "Invalid authorization header")
			c.Abort()
			return
		}

		claims, err := utils.VerifyToken(parts[1])
		if err != nil {
			utils.Error(c, 401, "Invalid or expired token")
			c.Abort()
			return
		}

		// 检查是否为管理员 token
		if !claims.IsAdmin {
			utils.Error(c, 403, "Admin permission required")
			c.Abort()
			return
		}

		c.Set("adminID", claims.UserID)
		c.Next()
	}
}
