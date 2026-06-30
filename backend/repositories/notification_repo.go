package repositories

import (
	"database/sql"
	"errors"
	"time"

	"gorm.io/gorm"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

var ErrNotificationNotFound = sql.ErrNoRows

type NotificationRecord struct {
	ID         string `gorm:"column:id;primaryKey"`
	SpaceID    string `gorm:"column:space_id"`
	UserID     string `gorm:"column:user_id"`
	Type       string `gorm:"column:type"`
	TargetType string `gorm:"column:target_type"`
	TargetID   string `gorm:"column:target_id"`
	Title      string `gorm:"column:title"`
	Body       string `gorm:"column:body"`
	IsRead     int    `gorm:"column:is_read"`
	CreatedAt  string `gorm:"column:created_at"`
}

func (NotificationRecord) TableName() string {
	return "notifications"
}

type NotificationRepository struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) CreateForUsers(spaceID string, userIDs []string, eventType string, targetType string, targetID string, title string, body string) error {
	if len(userIDs) == 0 {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	records := make([]NotificationRecord, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID == "" {
			continue
		}
		records = append(records, NotificationRecord{
			ID:         utils.NewID(),
			SpaceID:    spaceID,
			UserID:     userID,
			Type:       eventType,
			TargetType: targetType,
			TargetID:   targetID,
			Title:      title,
			Body:       body,
			IsRead:     0,
			CreatedAt:  now,
		})
	}
	if len(records) == 0 {
		return nil
	}
	return r.db.Create(&records).Error
}

func (r *NotificationRepository) List(spaceID string, userID string, limit int) ([]models.Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var records []NotificationRecord
	if err := r.db.
		Where("space_id = ? AND user_id = ?", spaceID, userID).
		Order("is_read ASC, created_at DESC").
		Limit(limit).
		Find(&records).
		Error; err != nil {
		return nil, err
	}
	return notificationModels(records), nil
}

func (r *NotificationRepository) MarkRead(spaceID string, userID string, notificationID string) error {
	result := r.db.Model(&NotificationRecord{}).
		Where("id = ? AND space_id = ? AND user_id = ?", notificationID, spaceID, userID).
		Update("is_read", 1)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotificationNotFound
	}
	return nil
}

func (r *NotificationRepository) MarkAllRead(spaceID string, userID string) error {
	return r.db.Model(&NotificationRecord{}).
		Where("space_id = ? AND user_id = ? AND is_read = 0", spaceID, userID).
		Update("is_read", 1).
		Error
}

func (r *NotificationRepository) DeleteReadBefore(cutoff time.Time, limit int) (int64, error) {
	if limit <= 0 {
		limit = 500
	}
	var records []NotificationRecord
	if err := r.db.
		Select("id").
		Where("is_read = 1 AND created_at < ?", cutoff.UTC().Format(time.RFC3339)).
		Order("created_at ASC").
		Limit(limit).
		Find(&records).
		Error; err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, nil
	}
	ids := make([]string, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.ID)
	}
	result := r.db.Where("id IN ?", ids).Delete(&NotificationRecord{})
	return result.RowsAffected, result.Error
}

func notificationModels(records []NotificationRecord) []models.Notification {
	items := make([]models.Notification, 0, len(records))
	for _, record := range records {
		items = append(items, models.Notification{
			ID:         record.ID,
			SpaceID:    record.SpaceID,
			UserID:     record.UserID,
			Type:       record.Type,
			TargetType: record.TargetType,
			TargetID:   record.TargetID,
			Title:      record.Title,
			Body:       record.Body,
			IsRead:     record.IsRead == 1,
			CreatedAt:  record.CreatedAt,
		})
	}
	return items
}

func IsNotificationNotFound(err error) bool {
	return errors.Is(err, ErrNotificationNotFound)
}
