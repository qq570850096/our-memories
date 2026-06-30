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

func GetAnniversaryCards(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	cacheKey := fmt.Sprintf("anniversary-cards:%s", spaceID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"anniversaryCards": cached})
		return
	}

	cards, err := anniversaryService().List(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch anniversary cards")
		return
	}

	cache.Set(cacheKey, cards, 5*time.Minute)
	utils.Success(c, gin.H{"anniversaryCards": cards})
}

func GetAnniversaryReplay(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	cardID := c.Param("id")

	replay, err := anniversaryService().Replay(spaceID, userID, cardID)
	if err != nil {
		writeAnniversaryServiceError(c, err, "Failed to fetch anniversary replay")
		return
	}
	utils.Success(c, replay)
}

func clearAnniversaryCardsCache(spaceID string) {
	cache.ClearAnniversarySpace(spaceID)
}

func CreateAnniversaryCard(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.CreateAnniversaryCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	cardID, err := anniversaryService().Create(spaceID, userID, req)
	if err != nil {
		writeAnniversaryServiceError(c, err, "Failed to create anniversary card")
		return
	}

	utils.Success(c, gin.H{"id": cardID})
}

func UpdateAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.UpdateAnniversaryCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := anniversaryService().Update(spaceID, userID, id, req); err != nil {
		writeAnniversaryServiceError(c, err, "Failed to update anniversary card")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func DeleteAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	if err := anniversaryService().Delete(spaceID, userID, id); err != nil {
		writeAnniversaryServiceError(c, err, "Failed to delete anniversary card")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func anniversaryService() *services.AnniversaryService {
	service := services.NewAnniversaryService(
		repositories.NewAnniversaryRepository(db.Gorm),
		uploadServicePhotoInputs,
		deleteServicePhotos,
		domainPublisher,
	)
	service.SetMemoryRepository(repositories.NewMemoryRepository(db.Gorm))
	return service
}

func writeAnniversaryServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrAnniversaryCardNotFound):
		utils.Error(c, 404, "Anniversary card not found")
	case errors.Is(err, services.ErrForbidden):
		utils.Error(c, 403, "Only the creator can modify this card")
	default:
		utils.Error(c, 500, fallback)
	}
}
