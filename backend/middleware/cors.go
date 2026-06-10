package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
)

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowed := false

		for _, allowedOrigin := range config.Get().AllowedOrigins {
			allowedOrigin = strings.TrimSpace(allowedOrigin)
			if allowedOrigin == "*" || origin == allowedOrigin {
				allowed = true
				break
			}
		}

		if origin == "capacitor://localhost" || origin == "ionic://localhost" || origin == "https://localhost" {
			allowed = true
		}

		if allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
