package repositories

import (
	"time"

	"gorm.io/gorm"
	"our-memories-backend/models"
)

type RelationshipSignalRecord struct {
	ID           string `gorm:"column:id;primaryKey"`
	SpaceID      string `gorm:"column:space_id"`
	SenderUserID string `gorm:"column:sender_user_id"`
	CityID       string `gorm:"column:city_id"`
	Message      string `gorm:"column:message"`
	CreatedAt    string `gorm:"column:created_at"`
	ExpiresAt    string `gorm:"column:expires_at"`
}

func (RelationshipSignalRecord) TableName() string {
	return "relationship_signals"
}

type SignalRepository struct {
	db *gorm.DB
}

func NewSignalRepository(db *gorm.DB) *SignalRepository {
	return &SignalRepository{db: db}
}

func (r *SignalRepository) Create(signal RelationshipSignalRecord) error {
	return r.db.Omit("created_at").Create(&signal).Error
}

func (r *SignalRepository) ListActive(spaceID string, viewerUserID string, now time.Time) ([]models.RelationshipSignal, error) {
	var records []RelationshipSignalRecord
	if err := r.db.
		Where("space_id = ? AND sender_user_id <> ? AND expires_at > ?", spaceID, viewerUserID, now.UTC().Format(time.RFC3339)).
		Order("created_at DESC").
		Find(&records).
		Error; err != nil {
		return nil, err
	}
	return signalModels(records), nil
}

func (r *SignalRepository) DeleteExpired(now time.Time, limit int) (int64, error) {
	if limit <= 0 {
		limit = 500
	}
	var records []RelationshipSignalRecord
	if err := r.db.
		Select("id").
		Where("expires_at <= ?", now.UTC().Format(time.RFC3339)).
		Order("expires_at ASC").
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
	result := r.db.Where("id IN ?", ids).Delete(&RelationshipSignalRecord{})
	return result.RowsAffected, result.Error
}

func signalModels(records []RelationshipSignalRecord) []models.RelationshipSignal {
	signals := make([]models.RelationshipSignal, 0, len(records))
	for _, record := range records {
		signals = append(signals, models.RelationshipSignal{
			ID:           record.ID,
			SpaceID:      record.SpaceID,
			SenderUserID: record.SenderUserID,
			CityID:       record.CityID,
			Message:      record.Message,
			CreatedAt:    record.CreatedAt,
			ExpiresAt:    record.ExpiresAt,
		})
	}
	return signals
}
