package handlers

import (
	"errors"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

// GetTimeCapsules 获取所有时光胶囊（未到期的不返回正文内容）
func GetTimeCapsules(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	cacheKey := fmt.Sprintf("time-capsules:%s:%s", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"timeCapsules": cached})
		return
	}

	capsules, err := timeCapsuleService().List(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch time capsules")
		return
	}

	cache.Set(cacheKey, capsules, 2*time.Minute)
	utils.Success(c, gin.H{"timeCapsules": capsules})
}

func clearTimeCapsulesCache(spaceID string) {
	cache.ClearTimeCapsuleSpace(spaceID)
}

// CreateTimeCapsule 创建一个时光胶囊
func CreateTimeCapsule(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.CreateTimeCapsuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	capsuleID, err := timeCapsuleService().Create(spaceID, userID, req)
	if err != nil {
		writeTimeCapsuleServiceError(c, err, "Failed to create time capsule")
		return
	}

	utils.Success(c, gin.H{"id": capsuleID})
}

// OpenTimeCapsule 标记时光胶囊为已开启（仅到期后允许）
func OpenTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	if err := timeCapsuleService().Open(spaceID, userID, id); err != nil {
		writeTimeCapsuleServiceError(c, err, "Failed to open time capsule")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// DeleteTimeCapsule 删除时光胶囊
func DeleteTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	if err := timeCapsuleService().Delete(spaceID, userID, id); err != nil {
		writeTimeCapsuleServiceError(c, err, "Failed to delete time capsule")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// UpdateTimeCapsule 编辑时光胶囊
func UpdateTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.UpdateTimeCapsuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := timeCapsuleService().Update(spaceID, userID, id, req); err != nil {
		writeTimeCapsuleServiceError(c, err, "Failed to update time capsule")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func timeCapsuleService() *services.TimeCapsuleService {
	return services.NewTimeCapsuleService(
		repositories.NewTimeCapsuleRepository(db.Gorm),
		uploadServicePhotoInputs,
		deleteServicePhotos,
		domainPublisher,
	)
}

func writeTimeCapsuleServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrTimeCapsuleNotFound):
		utils.Error(c, 404, "Time capsule not found")
	case errors.Is(err, services.ErrForbidden):
		utils.Error(c, 403, "Only the creator can modify this capsule")
	case errors.Is(err, services.ErrTimeCapsuleLimit):
		utils.Error(c, 400, "最多只能有3个未开启的时光胶囊")
	case errors.Is(err, services.ErrTimeCapsuleLocked):
		utils.Error(c, 403, "时光胶囊还未到开启日期")
	default:
		utils.Error(c, 500, fallback)
	}
}
