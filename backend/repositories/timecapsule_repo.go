package repositories

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"our-memories-backend/models"
)

var ErrTimeCapsuleNotFound = sql.ErrNoRows

type TimeCapsuleRecord struct {
	ID              string `gorm:"column:id;primaryKey"`
	SpaceID         string `gorm:"column:space_id"`
	Title           string `gorm:"column:title"`
	OpenDate        string `gorm:"column:open_date"`
	Content         string `gorm:"column:content"`
	VoiceURL        string `gorm:"column:voice_url"`
	OpenMode        string `gorm:"column:open_mode"`
	OpenedByUserIDs string `gorm:"column:opened_by_user_ids"`
	RevealedAt      string `gorm:"column:revealed_at"`
	CreatedByID     string `gorm:"column:created_by_id"`
	IsOpened        int    `gorm:"column:is_opened"`
	CreatedAt       string `gorm:"column:created_at"`
}

func (TimeCapsuleRecord) TableName() string {
	return "time_capsules"
}

type TimeCapsulePhotoRecord struct {
	ID            string `gorm:"column:id;primaryKey"`
	TimeCapsuleID string `gorm:"column:time_capsule_id"`
	Key           string `gorm:"column:key"`
	URL           string `gorm:"column:url"`
	MimeType      string `gorm:"column:mime_type"`
	SortOrder     int    `gorm:"column:sort_order"`
	CreatedAt     string `gorm:"column:created_at"`
}

func (TimeCapsulePhotoRecord) TableName() string {
	return "time_capsule_photos"
}

type TimeCapsuleRepository struct {
	db *gorm.DB
}

func NewTimeCapsuleRepository(db *gorm.DB) *TimeCapsuleRepository {
	return &TimeCapsuleRepository{db: db}
}

func (r *TimeCapsuleRepository) UnopenedCount(spaceID string) (int64, error) {
	var count int64
	err := r.db.Model(&TimeCapsuleRecord{}).
		Where("space_id = ? AND date(open_date) > date('now')", spaceID).
		Count(&count).
		Error
	return count, err
}

func (r *TimeCapsuleRepository) List(spaceID string) ([]models.TimeCapsule, error) {
	var records []TimeCapsuleRecord
	if err := r.db.
		Where("space_id = ?", spaceID).
		Order("open_date ASC").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	capsules := make([]models.TimeCapsule, 0, len(records))
	for _, record := range records {
		capsules = append(capsules, models.TimeCapsule{
			ID:              record.ID,
			SpaceID:         record.SpaceID,
			Title:           record.Title,
			OpenDate:        record.OpenDate,
			Content:         record.Content,
			VoiceURL:        record.VoiceURL,
			OpenMode:        normalizeTimeCapsuleOpenMode(record.OpenMode),
			OpenedByUserIDs: parseOpenedByUserIDs(record.OpenedByUserIDs),
			RevealedAt:      record.RevealedAt,
			CreatedByID:     record.CreatedByID,
			IsOpened:        record.IsOpened == 1,
			CreatedAt:       record.CreatedAt,
		})
	}
	return capsules, nil
}

func (r *TimeCapsuleRepository) CreatedByID(capsuleID string, spaceID string) (string, error) {
	var record TimeCapsuleRecord
	err := r.db.
		Select("created_by_id").
		Where("id = ? AND space_id = ?", capsuleID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrTimeCapsuleNotFound
	}
	return record.CreatedByID, err
}

func (r *TimeCapsuleRepository) OpenDate(capsuleID string, spaceID string) (string, error) {
	var record TimeCapsuleRecord
	err := r.db.
		Select("open_date").
		Where("id = ? AND space_id = ?", capsuleID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrTimeCapsuleNotFound
	}
	return record.OpenDate, err
}

func (r *TimeCapsuleRepository) ByID(capsuleID string, spaceID string) (models.TimeCapsule, error) {
	var record TimeCapsuleRecord
	err := r.db.
		Where("id = ? AND space_id = ?", capsuleID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.TimeCapsule{}, ErrTimeCapsuleNotFound
	}
	if err != nil {
		return models.TimeCapsule{}, err
	}
	return models.TimeCapsule{
		ID:              record.ID,
		SpaceID:         record.SpaceID,
		Title:           record.Title,
		OpenDate:        record.OpenDate,
		Content:         record.Content,
		VoiceURL:        record.VoiceURL,
		OpenMode:        normalizeTimeCapsuleOpenMode(record.OpenMode),
		OpenedByUserIDs: parseOpenedByUserIDs(record.OpenedByUserIDs),
		RevealedAt:      record.RevealedAt,
		CreatedByID:     record.CreatedByID,
		IsOpened:        record.IsOpened == 1,
		CreatedAt:       record.CreatedAt,
	}, nil
}

func (r *TimeCapsuleRepository) Create(capsule TimeCapsuleRecord, photos []TimeCapsulePhotoRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("created_at").Create(&capsule).Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func (r *TimeCapsuleRepository) Update(
	capsuleID string,
	spaceID string,
	fields map[string]any,
	photos []TimeCapsulePhotoRecord,
	replacePhotos bool,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&TimeCapsuleRecord{}).
			Where("id = ? AND space_id = ?", capsuleID, spaceID).
			Updates(fields)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrTimeCapsuleNotFound
		}

		if !replacePhotos {
			return nil
		}
		if err := tx.Where("time_capsule_id = ?", capsuleID).Delete(&TimeCapsulePhotoRecord{}).Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func (r *TimeCapsuleRepository) MarkOpened(capsuleID string, spaceID string, userID string) (models.TimeCapsule, error) {
	var capsule models.TimeCapsule
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var record TimeCapsuleRecord
		err := tx.
			Where("id = ? AND space_id = ?", capsuleID, spaceID).
			First(&record).
			Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTimeCapsuleNotFound
		}
		if err != nil {
			return err
		}

		openMode := normalizeTimeCapsuleOpenMode(record.OpenMode)
		openedBy := parseOpenedByUserIDs(record.OpenedByUserIDs)
		if userID != "" && !containsString(openedBy, userID) {
			openedBy = append(openedBy, userID)
		}

		isOpened := record.IsOpened == 1
		revealedAt := record.RevealedAt
		if openMode != "together" || len(openedBy) >= 2 {
			isOpened = true
			if revealedAt == "" {
				revealedAt = time.Now().UTC().Format(time.RFC3339)
			}
		}

		openedByJSON, _ := json.Marshal(openedBy)
		updates := map[string]any{
			"open_mode":          openMode,
			"opened_by_user_ids": string(openedByJSON),
			"is_opened":          0,
			"revealed_at":        revealedAt,
		}
		if isOpened {
			updates["is_opened"] = 1
		}
		if err := tx.Model(&TimeCapsuleRecord{}).
			Where("id = ? AND space_id = ?", capsuleID, spaceID).
			Updates(updates).
			Error; err != nil {
			return err
		}

		capsule = models.TimeCapsule{
			ID:              record.ID,
			SpaceID:         record.SpaceID,
			Title:           record.Title,
			OpenDate:        record.OpenDate,
			Content:         record.Content,
			VoiceURL:        record.VoiceURL,
			OpenMode:        openMode,
			OpenedByUserIDs: openedBy,
			RevealedAt:      revealedAt,
			CreatedByID:     record.CreatedByID,
			IsOpened:        isOpened,
			CreatedAt:       record.CreatedAt,
		}
		return nil
	})
	return capsule, err
}

func (r *TimeCapsuleRepository) Delete(capsuleID string, spaceID string) error {
	result := r.db.Where("id = ? AND space_id = ?", capsuleID, spaceID).Delete(&TimeCapsuleRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrTimeCapsuleNotFound
	}
	return nil
}

func normalizeTimeCapsuleOpenMode(value string) string {
	if value == "together" {
		return "together"
	}
	return "single"
}

func parseOpenedByUserIDs(value string) []string {
	ids := []string{}
	if err := json.Unmarshal([]byte(value), &ids); err != nil || ids == nil {
		return []string{}
	}
	return ids
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (r *TimeCapsuleRepository) PhotosForCapsule(capsuleID string) ([]TimeCapsulePhotoRecord, error) {
	var records []TimeCapsulePhotoRecord
	if err := r.db.
		Where("time_capsule_id = ?", capsuleID).
		Order("sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *TimeCapsuleRepository) PhotosByCapsuleIDs(capsuleIDs []string) (map[string][]models.Photo, error) {
	photosByCapsuleID := emptyPhotoMap(capsuleIDs)
	if len(capsuleIDs) == 0 {
		return photosByCapsuleID, nil
	}

	var records []TimeCapsulePhotoRecord
	if err := r.db.
		Where("time_capsule_id IN ?", capsuleIDs).
		Order("time_capsule_id, sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	for _, record := range records {
		photosByCapsuleID[record.TimeCapsuleID] = append(photosByCapsuleID[record.TimeCapsuleID], models.Photo{
			ID:        record.ID,
			MemoryID:  record.TimeCapsuleID,
			Key:       record.Key,
			URL:       record.URL,
			MimeType:  record.MimeType,
			SortOrder: record.SortOrder,
			CreatedAt: record.CreatedAt,
		})
	}
	return photosByCapsuleID, nil
}
