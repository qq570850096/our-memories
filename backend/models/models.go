package models

type Space struct {
	ID               string `json:"id"`
	SpaceCode        string `json:"spaceCode"`
	PasswordHash     string `json:"-"`
	Name             string `json:"name"`
	Status           string `json:"status"` // 'active' | 'suspended' | 'deleted'
	Tier             string `json:"tier"`   // 'free' | 'lifetime'
	PurchasedAt      string `json:"purchasedAt,omitempty"`
	StorageUsedBytes int64  `json:"storageUsedBytes"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

type User struct {
	ID          string `json:"id"`
	SpaceID     string `json:"spaceId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Avatar      string `json:"avatar,omitempty"`
	Role        string `json:"role"` // 'owner' | 'member'
	CreatedAt   string `json:"createdAt"`
}

type Admin struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
	DisplayName  string `json:"displayName"`
	CreatedAt    string `json:"createdAt"`
}

type Order struct {
	ID            string  `json:"id"`
	SpaceID       string  `json:"spaceId"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	Status        string  `json:"status"` // 'pending' | 'paid' | 'cancelled'
	PaymentMethod string  `json:"paymentMethod,omitempty"`
	PaidAt        string  `json:"paidAt,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

type AuditLog struct {
	ID         string `json:"id"`
	AdminID    string `json:"adminId"`
	Action     string `json:"action"`
	TargetType string `json:"targetType,omitempty"`
	TargetID   string `json:"targetId,omitempty"`
	Details    string `json:"details,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type Memory struct {
	ID                  string   `json:"id"`
	SpaceID             string   `json:"spaceId"`
	CityID              string   `json:"cityId"`
	City                string   `json:"city"`
	CityEn              string   `json:"cityEn"`
	Title               string   `json:"title,omitempty"`
	Date                string   `json:"date"`
	Text                string   `json:"text"`
	Mood                string   `json:"mood,omitempty"`
	Tags                []string `json:"tags"`
	Visibility          string   `json:"visibility"`
	PartnerNote         string   `json:"partnerNote,omitempty"`
	PartnerNoteAuthorID string   `json:"partnerNoteAuthorId,omitempty"`
	VoiceTextURL        string   `json:"voiceTextUrl,omitempty"`
	PartnerVoiceURL     string   `json:"partnerVoiceUrl,omitempty"`
	PlaceName           string   `json:"placeName,omitempty"`
	CoverPhotoID        string   `json:"coverPhotoId,omitempty"`
	CreatedByID         string   `json:"createdById,omitempty"`
	CreatedAt           string   `json:"createdAt"`
	UpdatedAt           string   `json:"updatedAt"`
	DeletedAt           string   `json:"deletedAt,omitempty"`
	Photos              []Photo  `json:"photos,omitempty"`
}

type Photo struct {
	ID        string `json:"id"`
	MemoryID  string `json:"memoryId"`
	Key       string `json:"key"`
	URL       string `json:"url"`
	MimeType  string `json:"mimeType,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
}

type AnniversaryCard struct {
	ID           string  `json:"id"`
	SpaceID      string  `json:"spaceId"`
	Title        string  `json:"title"`
	Date         string  `json:"date"`
	Note         string  `json:"note"`
	VoiceURL     string  `json:"voiceUrl,omitempty"`
	BGMURL       string  `json:"bgmUrl,omitempty"`
	BGMPreset    string  `json:"bgmPreset,omitempty"`
	CoverPhotoID string  `json:"coverPhotoId,omitempty"`
	RepeatYearly bool    `json:"repeatYearly"`
	Pinned       bool    `json:"pinned"`
	SortOrder    int     `json:"sortOrder"`
	CreatedByID  string  `json:"createdById,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	Photos       []Photo `json:"photos,omitempty"`
}

type Whisper struct {
	ID          string         `json:"id"`
	SpaceID     string         `json:"spaceId"`
	Title       string         `json:"title"`
	CreatedByID string         `json:"createdById"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
	Messages    []WhisperReply `json:"messages,omitempty"`
}

type WhisperReply struct {
	ID        string `json:"id"`
	WhisperID string `json:"whisperId"`
	UserID    string `json:"userId"`
	Content   string `json:"content"`
	VoiceURL  string `json:"voiceUrl,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type TimeCapsule struct {
	ID              string   `json:"id"`
	SpaceID         string   `json:"spaceId"`
	Title           string   `json:"title"`
	OpenDate        string   `json:"openDate"`
	Content         string   `json:"content"`
	VoiceURL        string   `json:"voiceUrl,omitempty"`
	OpenMode        string   `json:"openMode"`
	OpenedByUserIDs []string `json:"openedByUserIds"`
	RevealedAt      string   `json:"revealedAt,omitempty"`
	CreatedByID     string   `json:"createdById"`
	IsOpened        bool     `json:"isOpened"`
	CreatedAt       string   `json:"createdAt"`
	Photos          []Photo  `json:"photos,omitempty"`
}

type Notification struct {
	ID         string `json:"id"`
	SpaceID    string `json:"spaceId"`
	UserID     string `json:"userId"`
	Type       string `json:"type"`
	TargetType string `json:"targetType,omitempty"`
	TargetID   string `json:"targetId,omitempty"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	IsRead     bool   `json:"isRead"`
	CreatedAt  string `json:"createdAt"`
}

type RelationshipSignal struct {
	ID           string `json:"id"`
	SpaceID      string `json:"spaceId"`
	SenderUserID string `json:"senderUserId"`
	CityID       string `json:"cityId"`
	Message      string `json:"message"`
	CreatedAt    string `json:"createdAt"`
	ExpiresAt    string `json:"expiresAt"`
}
