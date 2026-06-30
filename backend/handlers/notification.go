package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

func GetNotifications(c *gin.Context) {
	notifications, err := notificationRepo().List(c.GetString("spaceID"), c.GetString("userID"), 50)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch notifications")
		return
	}
	utils.Success(c, gin.H{"notifications": notifications})
}

func MarkNotificationRead(c *gin.Context) {
	err := notificationRepo().MarkRead(c.GetString("spaceID"), c.GetString("userID"), c.Param("id"))
	if err != nil {
		writeNotificationError(c, err, "Failed to mark notification read")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func MarkAllNotificationsRead(c *gin.Context) {
	if err := notificationRepo().MarkAllRead(c.GetString("spaceID"), c.GetString("userID")); err != nil {
		utils.Error(c, 500, "Failed to mark notifications read")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func notificationRepo() *repositories.NotificationRepository {
	return repositories.NewNotificationRepository(db.Gorm)
}

func writeNotificationError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrNotificationNotFound):
		utils.Error(c, 404, "Notification not found")
	default:
		utils.Error(c, 500, fallback)
	}
}
