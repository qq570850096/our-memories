package middleware

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/utils"
)

// RequireOwner 要求当前用户是 space 的 owner
func RequireOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("userID")
		spaceID := c.GetString("spaceID")

		var role string
		err := db.DB.QueryRow(`SELECT role FROM users WHERE id = ? AND space_id = ?`, userID, spaceID).Scan(&role)
		if err != nil || role != "owner" {
			utils.Error(c, 403, "Owner permission required")
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireActiveTier 要求 space 是付费版（tier = 'lifetime'）
func RequireActiveTier() gin.HandlerFunc {
	return func(c *gin.Context) {
		spaceID := c.GetString("spaceID")

		var tier, status string
		err := db.DB.QueryRow(`SELECT tier, status FROM spaces WHERE id = ?`, spaceID).Scan(&tier, &status)
		if err != nil {
			utils.Error(c, 500, "Failed to check tier")
			c.Abort()
			return
		}

		if status != "active" {
			utils.Error(c, 403, "Space is suspended or deleted")
			c.Abort()
			return
		}

		if tier != "lifetime" {
			utils.Error(c, 402, "This feature requires lifetime tier")
			c.Abort()
			return
		}
		c.Next()
	}
}
