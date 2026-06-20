package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

// AdminLogin 管理员登录
func AdminLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	var admin models.Admin
	err := db.DB.QueryRow(`SELECT id, username, password_hash, display_name FROM admins WHERE username = ?`, req.Username).
		Scan(&admin.ID, &admin.Username, &admin.PasswordHash, &admin.DisplayName)
	if err != nil {
		utils.Error(c, 401, "Invalid username or password")
		return
	}

	if !utils.VerifyPassword(admin.PasswordHash, req.Password) {
		utils.Error(c, 401, "Invalid username or password")
		return
	}

	token, _ := utils.GenerateAdminToken(admin.ID)

	utils.Success(c, gin.H{
		"token": token,
		"admin": gin.H{
			"id":          admin.ID,
			"username":    admin.Username,
			"displayName": admin.DisplayName,
		},
	})
}
