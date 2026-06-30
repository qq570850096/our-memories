package handlers

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/events"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

type createSignalRequest struct {
	CityID  string `json:"cityId" binding:"required"`
	Message string `json:"message"`
}

func GetSignals(c *gin.Context) {
	signals, err := signalRepo().ListActive(c.GetString("spaceID"), c.GetString("userID"), time.Now().UTC())
	if err != nil {
		utils.Error(c, 500, "Failed to fetch signals")
		return
	}
	utils.Success(c, gin.H{"signals": signals})
}

func CreateSignal(c *gin.Context) {
	var req createSignalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	cityID := strings.TrimSpace(req.CityID)
	message := strings.TrimSpace(req.Message)
	if len(message) > 80 {
		message = message[:80]
	}

	now := time.Now().UTC()
	signalID := utils.NewID()
	if err := signalRepo().Create(repositories.RelationshipSignalRecord{
		ID:           signalID,
		SpaceID:      c.GetString("spaceID"),
		SenderUserID: c.GetString("userID"),
		CityID:       cityID,
		Message:      message,
		ExpiresAt:    now.Add(24 * time.Hour).Format(time.RFC3339),
	}); err != nil {
		utils.Error(c, 500, "Failed to create signal")
		return
	}

	_ = domainPublisher.Publish(c.Request.Context(), events.DomainEvent{
		Type:     events.SignalCreated,
		SpaceID:  c.GetString("spaceID"),
		ActorID:  c.GetString("userID"),
		TargetID: signalID,
		Metadata: map[string]any{
			"cityId":  cityID,
			"message": message,
		},
	})

	utils.Success(c, gin.H{"id": signalID})
}

func signalRepo() *repositories.SignalRepository {
	return repositories.NewSignalRepository(db.Gorm)
}
