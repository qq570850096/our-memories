package handlers

import (
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

func GetSettings(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	settings, err := settingService().List(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch settings")
		return
	}

	utils.Success(c, settings)
}

func UpdateSetting(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	key := c.Param("key")

	var req map[string]interface{}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	value, ok := req["value"]
	if !ok {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// coupleLogo 是图片设置：记录旧值，写入后清理被替换/删除的 OSS 对象。
	previousLogo := ""
	if key == "coupleLogo" {
		_ = readSettingJSON(spaceID, "coupleLogo", &previousLogo)
	}

	if value == nil {
		if err := settingService().Delete(spaceID, key); err != nil {
			utils.Error(c, 500, "Failed to update setting")
			return
		}
		if previousLogo != "" {
			storage.Default().DeleteObjectByURL(previousLogo)
		}
		utils.Success(c, gin.H{"ok": true})
		return
	}
	if key == "coupleLogo" {
		if image, ok := value.(string); ok && strings.HasPrefix(image, "data:image/") {
			url, err := uploadDataURL(spaceID, "settings", image)
			if err != nil {
				utils.Error(c, 500, "Failed to upload setting image")
				return
			}
			value = url
		}
	}

	if err := settingService().Upsert(spaceID, key, value); err != nil {
		utils.Error(c, 500, "Failed to update setting")
		return
	}

	if newLogo, ok := value.(string); ok && previousLogo != "" && previousLogo != newLogo {
		storage.Default().DeleteObjectByURL(previousLogo)
	}

	utils.Success(c, gin.H{"ok": true})
}

func GetAgentSettings(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	settings, err := settingService().AgentSettings(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch agent settings")
		return
	}
	ignored, err := settingService().IgnoredAgentSuggestions(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch agent settings")
		return
	}
	utils.Success(c, gin.H{"settings": settings, "ignored": ignored})
}

func UpdateAgentSettings(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req services.AgentSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	if err := settingService().UpdateAgentSettings(spaceID, req); err != nil {
		utils.Error(c, 500, "Failed to update agent settings")
		return
	}
	utils.Success(c, gin.H{"settings": req})
}

func IgnoreAgentSuggestion(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req services.IgnoreAgentSuggestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	ignored, err := settingService().IgnoreAgentSuggestion(spaceID, req)
	if err != nil {
		utils.Error(c, 500, "Failed to ignore suggestion")
		return
	}
	utils.Success(c, gin.H{"ignored": ignored})
}

func GetAuxiliaryItems(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	kind := c.Query("kind")

	items, err := settingService().ListAuxiliaryItems(spaceID, kind)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch auxiliary items")
		return
	}

	utils.Success(c, gin.H{"items": items})
}

func CreateAuxiliaryItem(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req services.CreateAuxiliaryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	itemID, err := settingService().CreateAuxiliaryItem(spaceID, req)
	if err != nil {
		utils.Error(c, 500, "Failed to create item")
		return
	}

	utils.Success(c, gin.H{"id": itemID})
}

func UpdateAuxiliaryItem(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var req services.UpdateAuxiliaryItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := settingService().UpdateAuxiliaryItem(spaceID, id, req); err != nil {
		writeSettingServiceError(c, err, "Failed to update item")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func DeleteAuxiliaryItem(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	if err := settingService().DeleteAuxiliaryItem(spaceID, id); err != nil {
		writeSettingServiceError(c, err, "Failed to delete item")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func settingService() *services.SettingService {
	return services.NewSettingService(repositories.NewSettingRepository(db.Gorm))
}

func writeSettingServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrAuxiliaryItemNotFound):
		utils.Error(c, 404, "Item not found")
	default:
		utils.Error(c, 500, fallback)
	}
}
