package dbschema

import "gorm.io/gorm"

type Space struct {
	ID               string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceCode        string `gorm:"column:space_code;type:TEXT;uniqueIndex"`
	PasswordHash     string `gorm:"column:password_hash;type:TEXT"`
	Name             string `gorm:"column:name;type:TEXT"`
	Status           string `gorm:"column:status;type:TEXT;default:active"`
	Tier             string `gorm:"column:tier;type:TEXT;default:free"`
	PurchasedAt      string `gorm:"column:purchased_at;type:DATETIME"`
	StorageUsedBytes int64  `gorm:"column:storage_used_bytes;default:0"`
	CreatedAt        string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt        string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Space) TableName() string { return "spaces" }

type User struct {
	ID          string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID     string `gorm:"column:space_id;type:TEXT;uniqueIndex:idx_users_space_username"`
	Username    string `gorm:"column:username;type:TEXT;uniqueIndex:idx_users_space_username"`
	DisplayName string `gorm:"column:display_name;type:TEXT"`
	Avatar      string `gorm:"column:avatar;type:TEXT"`
	Role        string `gorm:"column:role;type:TEXT;default:member"`
	CreatedAt   string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (User) TableName() string { return "users" }

type Admin struct {
	ID           string `gorm:"column:id;primaryKey;type:TEXT"`
	Username     string `gorm:"column:username;type:TEXT;uniqueIndex"`
	PasswordHash string `gorm:"column:password_hash;type:TEXT"`
	DisplayName  string `gorm:"column:display_name;type:TEXT"`
	CreatedAt    string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Admin) TableName() string { return "admins" }

type Memory struct {
	ID                  string         `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID             string         `gorm:"column:space_id;type:TEXT"`
	CityID              string         `gorm:"column:city_id;type:TEXT"`
	City                string         `gorm:"column:city;type:TEXT"`
	CityEn              string         `gorm:"column:city_en;type:TEXT"`
	Title               string         `gorm:"column:title;type:TEXT"`
	Date                string         `gorm:"column:date;type:TEXT"`
	Text                string         `gorm:"column:text;type:TEXT"`
	Mood                string         `gorm:"column:mood;type:TEXT"`
	Tags                string         `gorm:"column:tags;type:TEXT"`
	Visibility          string         `gorm:"column:visibility;type:TEXT;default:both"`
	PartnerNote         string         `gorm:"column:partner_note;type:TEXT"`
	PartnerNoteAuthorID string         `gorm:"column:partner_note_author_id;type:TEXT"`
	PlaceName           string         `gorm:"column:place_name;type:TEXT"`
	CoverPhotoID        string         `gorm:"column:cover_photo_id;type:TEXT"`
	VoiceTextURL        string         `gorm:"column:voice_text_url;type:TEXT"`
	PartnerVoiceURL     string         `gorm:"column:partner_voice_url;type:TEXT"`
	CreatedByID         string         `gorm:"column:created_by_id;type:TEXT"`
	CreatedAt           string         `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt           string         `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	DeletedAt           gorm.DeletedAt `gorm:"column:deleted_at;index"`
}

func (Memory) TableName() string { return "memories" }

type MemoryPhoto struct {
	ID        string `gorm:"column:id;primaryKey;type:TEXT"`
	MemoryID  string `gorm:"column:memory_id;type:TEXT"`
	Key       string `gorm:"column:key;type:TEXT"`
	URL       string `gorm:"column:url;type:TEXT"`
	MimeType  string `gorm:"column:mime_type;type:TEXT"`
	MediaType string `gorm:"column:media_type;type:TEXT;default:image"`
	Width     int    `gorm:"column:width"`
	Height    int    `gorm:"column:height"`
	SortOrder int    `gorm:"column:sort_order;default:0"`
	CreatedAt string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (MemoryPhoto) TableName() string { return "memory_photos" }

type AnniversaryCard struct {
	ID           string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID      string `gorm:"column:space_id;type:TEXT"`
	Title        string `gorm:"column:title;type:TEXT"`
	Date         string `gorm:"column:date;type:TEXT"`
	Note         string `gorm:"column:note;type:TEXT;default:''"`
	CoverPhotoID string `gorm:"column:cover_photo_id;type:TEXT"`
	VoiceURL     string `gorm:"column:voice_url;type:TEXT"`
	BGMURL       string `gorm:"column:bgm_url;type:TEXT"`
	BGMPreset    string `gorm:"column:bgm_preset;type:TEXT"`
	RepeatYearly int    `gorm:"column:repeat_yearly;default:1"`
	Pinned       int    `gorm:"column:pinned;default:0"`
	SortOrder    int    `gorm:"column:sort_order;default:0"`
	CreatedByID  string `gorm:"column:created_by_id;type:TEXT"`
	CreatedAt    string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt    string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (AnniversaryCard) TableName() string { return "anniversary_cards" }

type AnniversaryPhoto struct {
	ID                string `gorm:"column:id;primaryKey;type:TEXT"`
	AnniversaryCardID string `gorm:"column:anniversary_card_id;type:TEXT"`
	Key               string `gorm:"column:key;type:TEXT"`
	URL               string `gorm:"column:url;type:TEXT"`
	MimeType          string `gorm:"column:mime_type;type:TEXT"`
	SortOrder         int    `gorm:"column:sort_order;default:0"`
	CreatedAt         string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (AnniversaryPhoto) TableName() string { return "anniversary_photos" }

type Setting struct {
	ID        string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID   string `gorm:"column:space_id;type:TEXT;uniqueIndex:idx_settings_space_key"`
	Key       string `gorm:"column:key;type:TEXT;uniqueIndex:idx_settings_space_key"`
	Value     string `gorm:"column:value;type:TEXT"`
	UpdatedAt string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Setting) TableName() string { return "settings" }

type AuxiliaryItem struct {
	ID        string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID   string `gorm:"column:space_id;type:TEXT"`
	Kind      string `gorm:"column:kind;type:TEXT"`
	Title     string `gorm:"column:title;type:TEXT"`
	Date      string `gorm:"column:date;type:TEXT"`
	Note      string `gorm:"column:note;type:TEXT;default:''"`
	CityID    string `gorm:"column:city_id;type:TEXT"`
	CreatedAt string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (AuxiliaryItem) TableName() string { return "auxiliary_items" }

type Whisper struct {
	ID          string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID     string `gorm:"column:space_id;type:TEXT"`
	Title       string `gorm:"column:title;type:TEXT"`
	CreatedByID string `gorm:"column:created_by_id;type:TEXT"`
	CreatedAt   string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt   string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Whisper) TableName() string { return "whispers" }

type WhisperReply struct {
	ID        string `gorm:"column:id;primaryKey;type:TEXT"`
	WhisperID string `gorm:"column:whisper_id;type:TEXT"`
	UserID    string `gorm:"column:user_id;type:TEXT"`
	Content   string `gorm:"column:content;type:TEXT"`
	VoiceURL  string `gorm:"column:voice_url;type:TEXT"`
	CreatedAt string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (WhisperReply) TableName() string { return "whisper_replies" }

type TimeCapsule struct {
	ID              string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID         string `gorm:"column:space_id;type:TEXT"`
	Title           string `gorm:"column:title;type:TEXT"`
	OpenDate        string `gorm:"column:open_date;type:TEXT"`
	Content         string `gorm:"column:content;type:TEXT"`
	VoiceURL        string `gorm:"column:voice_url;type:TEXT"`
	OpenMode        string `gorm:"column:open_mode;type:TEXT;default:'single'"`
	OpenedByUserIDs string `gorm:"column:opened_by_user_ids;type:TEXT;default:'[]'"`
	RevealedAt      string `gorm:"column:revealed_at;type:DATETIME"`
	CreatedByID     string `gorm:"column:created_by_id;type:TEXT"`
	IsOpened        int    `gorm:"column:is_opened;default:0"`
	CreatedAt       string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (TimeCapsule) TableName() string { return "time_capsules" }

type TimeCapsulePhoto struct {
	ID            string `gorm:"column:id;primaryKey;type:TEXT"`
	TimeCapsuleID string `gorm:"column:time_capsule_id;type:TEXT"`
	Key           string `gorm:"column:key;type:TEXT"`
	URL           string `gorm:"column:url;type:TEXT"`
	MimeType      string `gorm:"column:mime_type;type:TEXT"`
	SortOrder     int    `gorm:"column:sort_order;default:0"`
	CreatedAt     string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (TimeCapsulePhoto) TableName() string { return "time_capsule_photos" }

type Order struct {
	ID            string  `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID       string  `gorm:"column:space_id;type:TEXT"`
	Amount        float64 `gorm:"column:amount"`
	Currency      string  `gorm:"column:currency;type:TEXT;default:CNY"`
	Status        string  `gorm:"column:status;type:TEXT;default:pending"`
	PaymentMethod string  `gorm:"column:payment_method;type:TEXT"`
	PaidAt        string  `gorm:"column:paid_at;type:DATETIME"`
	CreatedAt     string  `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Order) TableName() string { return "orders" }

type AuditLog struct {
	ID         string `gorm:"column:id;primaryKey;type:TEXT"`
	AdminID    string `gorm:"column:admin_id;type:TEXT"`
	Action     string `gorm:"column:action;type:TEXT"`
	TargetType string `gorm:"column:target_type;type:TEXT"`
	TargetID   string `gorm:"column:target_id;type:TEXT"`
	Details    string `gorm:"column:details;type:TEXT"`
	CreatedAt  string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (AuditLog) TableName() string { return "audit_logs" }

type PushDevice struct {
	ID             string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID        string `gorm:"column:space_id;type:TEXT"`
	UserID         string `gorm:"column:user_id;type:TEXT"`
	Platform       string `gorm:"column:platform;type:TEXT"`
	RegistrationID string `gorm:"column:registration_id;type:TEXT;uniqueIndex"`
	DeviceModel    string `gorm:"column:device_model;type:TEXT;default:''"`
	AppVersion     string `gorm:"column:app_version;type:TEXT;default:''"`
	Enabled        int    `gorm:"column:enabled;default:1"`
	CreatedAt      string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	UpdatedAt      string `gorm:"column:updated_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (PushDevice) TableName() string { return "push_devices" }

type Notification struct {
	ID         string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID    string `gorm:"column:space_id;type:TEXT"`
	UserID     string `gorm:"column:user_id;type:TEXT"`
	Type       string `gorm:"column:type;type:TEXT"`
	TargetType string `gorm:"column:target_type;type:TEXT;default:''"`
	TargetID   string `gorm:"column:target_id;type:TEXT;default:''"`
	Title      string `gorm:"column:title;type:TEXT"`
	Body       string `gorm:"column:body;type:TEXT;default:''"`
	IsRead     int    `gorm:"column:is_read;default:0"`
	CreatedAt  string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
}

func (Notification) TableName() string { return "notifications" }

type RelationshipSignal struct {
	ID           string `gorm:"column:id;primaryKey;type:TEXT"`
	SpaceID      string `gorm:"column:space_id;type:TEXT"`
	SenderUserID string `gorm:"column:sender_user_id;type:TEXT"`
	CityID       string `gorm:"column:city_id;type:TEXT"`
	Message      string `gorm:"column:message;type:TEXT;default:''"`
	CreatedAt    string `gorm:"column:created_at;type:DATETIME;default:CURRENT_TIMESTAMP"`
	ExpiresAt    string `gorm:"column:expires_at;type:DATETIME"`
}

func (RelationshipSignal) TableName() string { return "relationship_signals" }

func AutoMigrate(db *gorm.DB) error {
	models := []interface{}{
		&Space{},
		&User{},
		&Admin{},
		&Memory{},
		&MemoryPhoto{},
		&AnniversaryCard{},
		&AnniversaryPhoto{},
		&Setting{},
		&AuxiliaryItem{},
		&Whisper{},
		&WhisperReply{},
		&TimeCapsule{},
		&TimeCapsulePhoto{},
		&Order{},
		&AuditLog{},
		&PushDevice{},
		&Notification{},
		&RelationshipSignal{},
	}

	pending := make([]interface{}, 0, len(models))
	for _, model := range models {
		if !db.Migrator().HasTable(model) {
			pending = append(pending, model)
		}
	}
	if len(pending) == 0 {
		return nil
	}

	return db.AutoMigrate(pending...)
}
