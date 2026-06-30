package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

// GetWhispers 获取所有悄悄话及其回复
func GetWhispers(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	whispers, err := whisperService().List(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch whispers")
		return
	}

	utils.Success(c, gin.H{"whispers": whispers})
}

// CreateWhisper 创建一条新悄悄话（带首条留言）
func CreateWhisper(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.CreateWhisperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	whisperID, err := whisperService().Create(spaceID, userID, req)
	if err != nil {
		utils.Error(c, 500, "Failed to create whisper")
		return
	}

	utils.Success(c, gin.H{"id": whisperID})
}

// ReplyWhisper 在某条悄悄话下追加一条回复（两人互动）
func ReplyWhisper(c *gin.Context) {
	whisperID := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.ReplyWhisperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	replyID, err := whisperService().Reply(spaceID, userID, whisperID, req)
	if err != nil {
		writeWhisperServiceError(c, err, "Failed to reply")
		return
	}

	utils.Success(c, gin.H{"id": replyID})
}

// DeleteWhisper 删除一条悄悄话
func DeleteWhisper(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	if err := whisperService().Delete(spaceID, userID, id); err != nil {
		writeWhisperServiceError(c, err, "Failed to delete whisper")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func whisperService() *services.WhisperService {
	return services.NewWhisperService(repositories.NewWhisperRepository(db.Gorm), domainPublisher)
}

func writeWhisperServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrWhisperNotFound):
		utils.Error(c, 404, "Whisper not found")
	case errors.Is(err, services.ErrForbidden):
		utils.Error(c, 403, "Only the creator can modify this whisper")
	case errors.Is(err, services.ErrInvalidContent):
		utils.Error(c, 400, "Content or voice is required")
	default:
		utils.Error(c, 500, fallback)
	}
}
