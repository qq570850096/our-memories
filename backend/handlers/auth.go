package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

type LoginRequest struct {
	SpaceCode string `json:"spaceCode" binding:"required"`
	Password  string `json:"password" binding:"required"`
	UserID    string `json:"userId" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	var space models.Space
	err := db.DB.QueryRow(`SELECT id, space_code, password_hash, name FROM spaces WHERE space_code = ?`, req.SpaceCode).
		Scan(&space.ID, &space.SpaceCode, &space.PasswordHash, &space.Name)
	if err != nil {
		utils.Error(c, 401, "Invalid space code or password")
		return
	}

	if !utils.VerifyPassword(space.PasswordHash, req.Password) {
		utils.Error(c, 401, "Invalid space code or password")
		return
	}

	var user models.User
	err = db.DB.QueryRow(`SELECT id, space_id, username, display_name, COALESCE(avatar, '') FROM users WHERE space_id = ? AND username = ?`,
		space.ID, req.UserID).Scan(&user.ID, &user.SpaceID, &user.Username, &user.DisplayName, &user.Avatar)
	if err != nil {
		utils.Error(c, 404, "User not found")
		return
	}

	accessToken, _ := utils.GenerateAccessToken(user.ID, space.ID)
	refreshToken, _ := utils.GenerateRefreshToken(user.ID, space.ID)

	utils.Success(c, gin.H{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user": gin.H{
			"id":          user.ID,
			"username":    user.Username,
			"displayName": user.DisplayName,
		},
		"space": gin.H{
			"id":        space.ID,
			"name":      space.Name,
			"spaceCode": space.SpaceCode,
		},
	})
}

func Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	claims, err := utils.VerifyToken(req.RefreshToken)
	if err != nil {
		utils.Error(c, 401, "Invalid refresh token")
		return
	}

	accessToken, _ := utils.GenerateAccessToken(claims.UserID, claims.SpaceID)

	utils.Success(c, gin.H{
		"accessToken": accessToken,
	})
}

func GetMe(c *gin.Context) {
	userID := c.GetString("userID")
	spaceID := c.GetString("spaceID")

	var user models.User
	var space models.Space

	err := db.DB.QueryRow(`SELECT id, username, display_name, COALESCE(avatar, '') FROM users WHERE id = ?`, userID).
		Scan(&user.ID, &user.Username, &user.DisplayName, &user.Avatar)
	if err != nil {
		utils.Error(c, 404, "User not found")
		return
	}

	err = db.DB.QueryRow(`SELECT id, space_code, name FROM spaces WHERE id = ?`, spaceID).
		Scan(&space.ID, &space.SpaceCode, &space.Name)
	if err != nil {
		utils.Error(c, 404, "Space not found")
		return
	}

	utils.Success(c, gin.H{
		"user": gin.H{
			"id":          user.ID,
			"username":    user.Username,
			"displayName": user.DisplayName,
		},
		"space": gin.H{
			"id":        space.ID,
			"name":      space.Name,
			"spaceCode": space.SpaceCode,
		},
	})
}

func UpdatePassword(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req struct {
		NewPassword string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if len(req.NewPassword) < 8 || len(req.NewPassword) > 128 {
		utils.Error(c, 400, "Password length must be 8-128")
		return
	}

	passwordHash := utils.HashPassword(req.NewPassword)
	_, err := db.DB.Exec(`UPDATE spaces SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, passwordHash, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update password")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}
