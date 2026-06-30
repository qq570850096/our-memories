package repositories

import (
	"time"

	"gorm.io/gorm"
	"our-memories-backend/utils"
)

type PushDeviceRecord struct {
	ID             string `gorm:"column:id"`
	SpaceID        string `gorm:"column:space_id"`
	UserID         string `gorm:"column:user_id"`
	Platform       string `gorm:"column:platform"`
	RegistrationID string `gorm:"column:registration_id"`
	DeviceModel    string `gorm:"column:device_model"`
	AppVersion     string `gorm:"column:app_version"`
	Enabled        int    `gorm:"column:enabled"`
	CreatedAt      string `gorm:"column:created_at"`
	UpdatedAt      string `gorm:"column:updated_at"`
}

func (PushDeviceRecord) TableName() string {
	return "push_devices"
}

type PushRepository struct {
	db *gorm.DB
}

func NewPushRepository(db *gorm.DB) *PushRepository {
	return &PushRepository{db: db}
}

func (r *PushRepository) UpsertDevice(device PushDeviceRecord) error {
	now := time.Now().Format(time.RFC3339)
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existing PushDeviceRecord
		err := tx.Where("registration_id = ?", device.RegistrationID).First(&existing).Error
		if err == nil {
			return tx.Model(&PushDeviceRecord{}).
				Where("registration_id = ?", device.RegistrationID).
				Updates(map[string]any{
					"space_id":     device.SpaceID,
					"user_id":      device.UserID,
					"platform":     device.Platform,
					"device_model": device.DeviceModel,
					"app_version":  device.AppVersion,
					"enabled":      1,
					"updated_at":   now,
				}).Error
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}

		device.ID = utils.NewID()
		device.Enabled = 1
		device.CreatedAt = now
		device.UpdatedAt = now
		return tx.Create(&device).Error
	})
}

func (r *PushRepository) RegistrationIDsForSpace(spaceID string) ([]string, error) {
	var ids []string
	err := r.db.Model(&PushDeviceRecord{}).
		Where("space_id = ? AND enabled = 1", spaceID).
		Pluck("registration_id", &ids).Error
	return ids, err
}

func (r *PushRepository) RegistrationIDsForSpaceExceptUser(spaceID string, userID string) ([]string, error) {
	var ids []string
	query := r.db.Model(&PushDeviceRecord{}).
		Where("space_id = ? AND enabled = 1", spaceID)
	if userID != "" {
		query = query.Where("user_id <> ?", userID)
	}
	err := query.Pluck("registration_id", &ids).Error
	return ids, err
}
