package repositories

import (
	"database/sql"
	"encoding/json"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrAuxiliaryItemNotFound = sql.ErrNoRows

type SettingRecord struct {
	ID        string `gorm:"column:id;primaryKey"`
	SpaceID   string `gorm:"column:space_id"`
	Key       string `gorm:"column:key"`
	Value     string `gorm:"column:value"`
	UpdatedAt string `gorm:"column:updated_at"`
}

func (SettingRecord) TableName() string {
	return "settings"
}

type AuxiliaryItemRecord struct {
	ID        string `gorm:"column:id;primaryKey"`
	SpaceID   string `gorm:"column:space_id"`
	Kind      string `gorm:"column:kind"`
	Title     string `gorm:"column:title"`
	Date      string `gorm:"column:date"`
	Note      string `gorm:"column:note"`
	CityID    string `gorm:"column:city_id"`
	CreatedAt string `gorm:"column:created_at"`
	UpdatedAt string `gorm:"column:updated_at"`
}

func (AuxiliaryItemRecord) TableName() string {
	return "auxiliary_items"
}

type SettingRepository struct {
	db *gorm.DB
}

func NewSettingRepository(db *gorm.DB) *SettingRepository {
	return &SettingRepository{db: db}
}

func (r *SettingRepository) List(spaceID string) (map[string]any, error) {
	var records []SettingRecord
	if err := r.db.Where("space_id = ?", spaceID).Find(&records).Error; err != nil {
		return nil, err
	}

	settings := make(map[string]any, len(records))
	for _, record := range records {
		var value any
		if err := json.Unmarshal([]byte(record.Value), &value); err != nil {
			continue
		}
		settings[record.Key] = value
	}
	return settings, nil
}

func (r *SettingRepository) ReadJSON(spaceID string, key string, target any) error {
	var record SettingRecord
	result := r.db.
		Select("value").
		Where("space_id = ? AND key = ?", spaceID, key).
		Limit(1).
		Find(&record)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return nil
	}
	return json.Unmarshal([]byte(record.Value), target)
}

func (r *SettingRepository) UpsertJSON(id string, spaceID string, key string, value any) error {
	valueJSON, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return r.db.Omit("updated_at").Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "space_id"}, {Name: "key"}},
		DoUpdates: clause.Assignments(map[string]any{
			"value":      string(valueJSON),
			"updated_at": gorm.Expr("CURRENT_TIMESTAMP"),
		}),
	}).Create(&SettingRecord{
		ID:      id,
		SpaceID: spaceID,
		Key:     key,
		Value:   string(valueJSON),
	}).Error
}

func (r *SettingRepository) Delete(spaceID string, key string) error {
	return r.db.Where("space_id = ? AND key = ?", spaceID, key).Delete(&SettingRecord{}).Error
}

func (r *SettingRepository) ListAuxiliaryItems(spaceID string, kind string) ([]AuxiliaryItemRecord, error) {
	var records []AuxiliaryItemRecord
	query := r.db.Where("space_id = ?", spaceID)
	if kind != "" {
		query = query.Where("kind = ?", kind)
	}
	if err := query.Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *SettingRepository) CreateAuxiliaryItem(record AuxiliaryItemRecord) error {
	return r.db.Omit("created_at", "updated_at").Create(&record).Error
}

func (r *SettingRepository) UpdateAuxiliaryItem(itemID string, spaceID string, fields map[string]any) error {
	fields["updated_at"] = gorm.Expr("CURRENT_TIMESTAMP")
	result := r.db.Model(&AuxiliaryItemRecord{}).
		Where("id = ? AND space_id = ?", itemID, spaceID).
		Updates(fields)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAuxiliaryItemNotFound
	}
	return nil
}

func (r *SettingRepository) DeleteAuxiliaryItem(itemID string, spaceID string) error {
	result := r.db.Where("id = ? AND space_id = ?", itemID, spaceID).Delete(&AuxiliaryItemRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAuxiliaryItemNotFound
	}
	return nil
}
