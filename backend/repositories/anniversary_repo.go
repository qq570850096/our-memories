package repositories

import (
	"database/sql"
	"errors"

	"gorm.io/gorm"
	"our-memories-backend/models"
)

var ErrAnniversaryCardNotFound = sql.ErrNoRows

type AnniversaryCardRecord struct {
	ID           string `gorm:"column:id;primaryKey"`
	SpaceID      string `gorm:"column:space_id"`
	Title        string `gorm:"column:title"`
	Date         string `gorm:"column:date"`
	Note         string `gorm:"column:note"`
	CoverPhotoID string `gorm:"column:cover_photo_id"`
	VoiceURL     string `gorm:"column:voice_url"`
	BGMURL       string `gorm:"column:bgm_url"`
	BGMPreset    string `gorm:"column:bgm_preset"`
	RepeatYearly int    `gorm:"column:repeat_yearly"`
	Pinned       int    `gorm:"column:pinned"`
	SortOrder    int    `gorm:"column:sort_order"`
	CreatedByID  string `gorm:"column:created_by_id"`
	CreatedAt    string `gorm:"column:created_at"`
	UpdatedAt    string `gorm:"column:updated_at"`
}

func (AnniversaryCardRecord) TableName() string {
	return "anniversary_cards"
}

type AnniversaryPhotoRecord struct {
	ID                string `gorm:"column:id;primaryKey"`
	AnniversaryCardID string `gorm:"column:anniversary_card_id"`
	Key               string `gorm:"column:key"`
	URL               string `gorm:"column:url"`
	MimeType          string `gorm:"column:mime_type"`
	SortOrder         int    `gorm:"column:sort_order"`
	CreatedAt         string `gorm:"column:created_at"`
}

func (AnniversaryPhotoRecord) TableName() string {
	return "anniversary_photos"
}

type AnniversaryRepository struct {
	db *gorm.DB
}

func NewAnniversaryRepository(db *gorm.DB) *AnniversaryRepository {
	return &AnniversaryRepository{db: db}
}

func (r *AnniversaryRepository) CreatedByID(cardID string, spaceID string) (string, error) {
	var record AnniversaryCardRecord
	err := r.db.
		Select("created_by_id").
		Where("id = ? AND space_id = ?", cardID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrAnniversaryCardNotFound
	}
	return record.CreatedByID, err
}

func (r *AnniversaryRepository) ByID(spaceID string, cardID string) (models.AnniversaryCard, error) {
	var record AnniversaryCardRecord
	err := r.db.
		Where("id = ? AND space_id = ?", cardID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.AnniversaryCard{}, ErrAnniversaryCardNotFound
	}
	if err != nil {
		return models.AnniversaryCard{}, err
	}
	return anniversaryCardModel(record), nil
}

func (r *AnniversaryRepository) List(spaceID string) ([]models.AnniversaryCard, error) {
	var records []AnniversaryCardRecord
	if err := r.db.
		Where("space_id = ?", spaceID).
		Order("pinned DESC, sort_order, date").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	cards := make([]models.AnniversaryCard, 0, len(records))
	for _, record := range records {
		cards = append(cards, anniversaryCardModel(record))
	}
	return cards, nil
}

func (r *AnniversaryRepository) Create(card AnniversaryCardRecord, photos []AnniversaryPhotoRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("created_at", "updated_at").Create(&card).Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func anniversaryCardModel(record AnniversaryCardRecord) models.AnniversaryCard {
	return models.AnniversaryCard{
		ID:           record.ID,
		SpaceID:      record.SpaceID,
		Title:        record.Title,
		Date:         record.Date,
		Note:         record.Note,
		CoverPhotoID: record.CoverPhotoID,
		VoiceURL:     record.VoiceURL,
		BGMURL:       record.BGMURL,
		BGMPreset:    record.BGMPreset,
		RepeatYearly: record.RepeatYearly == 1,
		Pinned:       record.Pinned == 1,
		SortOrder:    record.SortOrder,
		CreatedByID:  record.CreatedByID,
		CreatedAt:    record.CreatedAt,
		UpdatedAt:    record.UpdatedAt,
	}
}

func (r *AnniversaryRepository) Update(
	cardID string,
	spaceID string,
	fields map[string]any,
	photos []AnniversaryPhotoRecord,
	replacePhotos bool,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		fields["updated_at"] = gorm.Expr("CURRENT_TIMESTAMP")
		result := tx.Model(&AnniversaryCardRecord{}).
			Where("id = ? AND space_id = ?", cardID, spaceID).
			Updates(fields)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrAnniversaryCardNotFound
		}

		if !replacePhotos {
			return nil
		}
		if err := tx.Where("anniversary_card_id = ?", cardID).Delete(&AnniversaryPhotoRecord{}).Error; err != nil {
			return err
		}
		if err := tx.Model(&AnniversaryCardRecord{}).
			Where("id = ? AND space_id = ?", cardID, spaceID).
			Update("cover_photo_id", nil).
			Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func (r *AnniversaryRepository) Delete(cardID string, spaceID string) error {
	result := r.db.Where("id = ? AND space_id = ?", cardID, spaceID).Delete(&AnniversaryCardRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAnniversaryCardNotFound
	}
	return nil
}

func (r *AnniversaryRepository) PhotosForCard(cardID string) ([]AnniversaryPhotoRecord, error) {
	var records []AnniversaryPhotoRecord
	if err := r.db.
		Where("anniversary_card_id = ?", cardID).
		Order("sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *AnniversaryRepository) PhotosByCardIDs(cardIDs []string) (map[string][]models.Photo, error) {
	photosByCardID := emptyPhotoMap(cardIDs)
	if len(cardIDs) == 0 {
		return photosByCardID, nil
	}

	var records []AnniversaryPhotoRecord
	if err := r.db.
		Where("anniversary_card_id IN ?", cardIDs).
		Order("anniversary_card_id, sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	for _, record := range records {
		photosByCardID[record.AnniversaryCardID] = append(photosByCardID[record.AnniversaryCardID], models.Photo{
			ID:        record.ID,
			MemoryID:  record.AnniversaryCardID,
			Key:       record.Key,
			URL:       record.URL,
			MimeType:  record.MimeType,
			SortOrder: record.SortOrder,
			CreatedAt: record.CreatedAt,
		})
	}
	return photosByCardID, nil
}
