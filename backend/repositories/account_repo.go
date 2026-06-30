package repositories

import (
	"database/sql"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"our-memories-backend/models"
)

var ErrAccountNotFound = sql.ErrNoRows

type SpaceRecord struct {
	ID               string `gorm:"column:id;primaryKey"`
	SpaceCode        string `gorm:"column:space_code"`
	PasswordHash     string `gorm:"column:password_hash"`
	Name             string `gorm:"column:name"`
	Status           string `gorm:"column:status"`
	Tier             string `gorm:"column:tier"`
	PurchasedAt      string `gorm:"column:purchased_at"`
	StorageUsedBytes int64  `gorm:"column:storage_used_bytes"`
	CreatedAt        string `gorm:"column:created_at"`
	UpdatedAt        string `gorm:"column:updated_at"`
}

func (SpaceRecord) TableName() string {
	return "spaces"
}

type UserRecord struct {
	ID          string `gorm:"column:id;primaryKey"`
	SpaceID     string `gorm:"column:space_id"`
	Username    string `gorm:"column:username"`
	DisplayName string `gorm:"column:display_name"`
	Avatar      string `gorm:"column:avatar"`
	Role        string `gorm:"column:role"`
	CreatedAt   string `gorm:"column:created_at"`
}

func (UserRecord) TableName() string {
	return "users"
}

type AdminRecord struct {
	ID           string `gorm:"column:id;primaryKey"`
	Username     string `gorm:"column:username"`
	PasswordHash string `gorm:"column:password_hash"`
	DisplayName  string `gorm:"column:display_name"`
	CreatedAt    string `gorm:"column:created_at"`
}

func (AdminRecord) TableName() string {
	return "admins"
}

type AccountRepository struct {
	db *gorm.DB
}

func NewAccountRepository(db *gorm.DB) *AccountRepository {
	return &AccountRepository{db: db}
}

func (r *AccountRepository) SpaceByCode(spaceCode string) (models.Space, error) {
	var record SpaceRecord
	err := r.db.
		Where("space_code = ?", spaceCode).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Space{}, ErrAccountNotFound
	}
	return spaceModel(record), err
}

func (r *AccountRepository) SpaceCount() (int64, error) {
	var count int64
	err := r.db.Model(&SpaceRecord{}).Count(&count).Error
	return count, err
}

func (r *AccountRepository) CreateSpaceWithUsers(space SpaceRecord, users []UserRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("created_at", "updated_at").Create(&space).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&users).Error
	})
}

func (r *AccountRepository) SpaceByID(spaceID string) (models.Space, error) {
	var record SpaceRecord
	err := r.db.
		Where("id = ?", spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Space{}, ErrAccountNotFound
	}
	return spaceModel(record), err
}

func (r *AccountRepository) UserByUsername(spaceID string, username string) (models.User, error) {
	var record UserRecord
	err := r.db.
		Where("space_id = ? AND username = ?", spaceID, username).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.User{}, ErrAccountNotFound
	}
	return userModel(record), err
}

func (r *AccountRepository) UserByID(userID string) (models.User, error) {
	var record UserRecord
	err := r.db.
		Where("id = ?", userID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.User{}, ErrAccountNotFound
	}
	return userModel(record), err
}

func (r *AccountRepository) UserIDsForSpaceExcept(spaceID string, userID string) ([]string, error) {
	var ids []string
	query := r.db.Model(&UserRecord{}).
		Where("space_id = ?", spaceID)
	if userID != "" {
		query = query.Where("id <> ?", userID)
	}
	err := query.Pluck("id", &ids).Error
	return ids, err
}

func (r *AccountRepository) AdminByUsername(username string) (models.Admin, error) {
	var record AdminRecord
	err := r.db.
		Where("username = ?", username).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Admin{}, ErrAccountNotFound
	}
	return models.Admin{
		ID:           record.ID,
		Username:     record.Username,
		PasswordHash: record.PasswordHash,
		DisplayName:  record.DisplayName,
		CreatedAt:    record.CreatedAt,
	}, err
}

func (r *AccountRepository) CreateAdmin(admin AdminRecord) error {
	return r.db.Omit("created_at").Create(&admin).Error
}

func (r *AccountRepository) UpsertAdminByUsername(admin AdminRecord) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "username"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"password_hash": admin.PasswordHash,
			"display_name":  admin.DisplayName,
		}),
	}).Omit("created_at").Create(&admin).Error
}

func (r *AccountRepository) UpdateSpacePassword(spaceID string, passwordHash string) error {
	result := r.db.Model(&SpaceRecord{}).
		Where("id = ?", spaceID).
		Updates(map[string]any{"password_hash": passwordHash, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
	return nil
}

func (r *AccountRepository) UserRole(userID string, spaceID string) (string, error) {
	var record UserRecord
	err := r.db.
		Select("role").
		Where("id = ? AND space_id = ?", userID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrAccountNotFound
	}
	return record.Role, err
}

func (r *AccountRepository) SpaceTierStatus(spaceID string) (string, string, error) {
	var record SpaceRecord
	err := r.db.
		Select("tier", "status").
		Where("id = ?", spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", "", ErrAccountNotFound
	}
	return record.Tier, record.Status, err
}

func spaceModel(record SpaceRecord) models.Space {
	return models.Space{
		ID:               record.ID,
		SpaceCode:        record.SpaceCode,
		PasswordHash:     record.PasswordHash,
		Name:             record.Name,
		Status:           record.Status,
		Tier:             record.Tier,
		PurchasedAt:      record.PurchasedAt,
		StorageUsedBytes: record.StorageUsedBytes,
		CreatedAt:        record.CreatedAt,
		UpdatedAt:        record.UpdatedAt,
	}
}

func userModel(record UserRecord) models.User {
	return models.User{
		ID:          record.ID,
		SpaceID:     record.SpaceID,
		Username:    record.Username,
		DisplayName: record.DisplayName,
		Avatar:      record.Avatar,
		Role:        record.Role,
		CreatedAt:   record.CreatedAt,
	}
}
