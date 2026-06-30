package repositories

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"our-memories-backend/models"
)

var ErrMemoryNotFound = sql.ErrNoRows
var ErrMemoryCoverPhotoNotFound = errors.New("cover photo not found")
var ErrInvalidMemoryCursor = errors.New("invalid memory cursor")

type MemoryListFilter struct {
	CityID     string
	Tags       []string
	Mood       string
	Visibility string
	DateFrom   string
	DateTo     string
	Query      string
	Cursor     string
	Limit      int
}

type MemoryListPage struct {
	Items      []models.Memory
	NextCursor string
	HasMore    bool
}

type relatedMemoryCandidate struct {
	Memory        models.Memory
	Date          time.Time
	DistanceDays  int
	SharedTagHits int
}

type memoryCursor struct {
	Date      string `json:"date"`
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

type MemoryRecord struct {
	ID                  string         `gorm:"column:id;primaryKey"`
	SpaceID             string         `gorm:"column:space_id"`
	CityID              string         `gorm:"column:city_id"`
	City                string         `gorm:"column:city"`
	CityEn              string         `gorm:"column:city_en"`
	Title               string         `gorm:"column:title"`
	Date                string         `gorm:"column:date"`
	Text                string         `gorm:"column:text"`
	Mood                string         `gorm:"column:mood"`
	Tags                string         `gorm:"column:tags"`
	Visibility          string         `gorm:"column:visibility"`
	PartnerNote         string         `gorm:"column:partner_note"`
	PartnerNoteAuthorID string         `gorm:"column:partner_note_author_id"`
	VoiceTextURL        string         `gorm:"column:voice_text_url"`
	PartnerVoiceURL     string         `gorm:"column:partner_voice_url"`
	PlaceName           string         `gorm:"column:place_name"`
	CoverPhotoID        string         `gorm:"column:cover_photo_id"`
	CreatedByID         string         `gorm:"column:created_by_id"`
	CreatedAt           string         `gorm:"column:created_at"`
	UpdatedAt           string         `gorm:"column:updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"column:deleted_at"`
}

func (MemoryRecord) TableName() string {
	return "memories"
}

type MemoryPhotoRecord struct {
	ID        string `gorm:"column:id;primaryKey"`
	MemoryID  string `gorm:"column:memory_id"`
	Key       string `gorm:"column:key"`
	URL       string `gorm:"column:url"`
	MimeType  string `gorm:"column:mime_type"`
	MediaType string `gorm:"column:media_type"`
	Width     int    `gorm:"column:width"`
	Height    int    `gorm:"column:height"`
	SortOrder int    `gorm:"column:sort_order"`
	CreatedAt string `gorm:"column:created_at"`
}

func (MemoryPhotoRecord) TableName() string {
	return "memory_photos"
}

type MemoryRepository struct {
	db *gorm.DB
}

func NewMemoryRepository(db *gorm.DB) *MemoryRepository {
	return &MemoryRepository{db: db}
}

func (r *MemoryRepository) CreatedByID(memoryID string, spaceID string) (string, error) {
	return r.createdByID(memoryID, spaceID, false)
}

func (r *MemoryRepository) CreatedByIDIncludingDeleted(memoryID string, spaceID string) (string, error) {
	return r.createdByID(memoryID, spaceID, true)
}

func (r *MemoryRepository) createdByID(memoryID string, spaceID string, includeDeleted bool) (string, error) {
	var record MemoryRecord
	query := r.db
	if includeDeleted {
		query = query.Unscoped()
	}
	err := query.
		Select("created_by_id").
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrMemoryNotFound
	}
	return record.CreatedByID, err
}

func (r *MemoryRepository) ListVisible(spaceID string, userID string, cityID string) ([]models.Memory, error) {
	var records []MemoryRecord
	query := r.db.
		Where("space_id = ? AND (visibility = ? OR created_by_id = ?)", spaceID, "both", userID)
	if cityID != "" {
		query = query.Where("city_id = ?", cityID)
	}
	if err := query.Order("date DESC, created_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}

	memories := make([]models.Memory, 0, len(records))
	for _, record := range records {
		memory := memoryModel(record)
		if err := json.Unmarshal([]byte(record.Tags), &memory.Tags); err != nil || memory.Tags == nil {
			memory.Tags = []string{}
		}
		memories = append(memories, memory)
	}
	return memories, nil
}

func (r *MemoryRepository) ListPage(spaceID string, userID string, filter MemoryListFilter) (MemoryListPage, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	query := r.db.
		Where("space_id = ? AND (visibility = ? OR created_by_id = ?)", spaceID, "both", userID)
	if filter.CityID != "" {
		query = query.Where("city_id = ?", filter.CityID)
	}
	if filter.Mood != "" {
		query = query.Where("mood = ?", filter.Mood)
	}
	if filter.Visibility != "" {
		query = query.Where("visibility = ?", filter.Visibility)
	}
	if filter.DateFrom != "" {
		query = query.Where("date >= ?", filter.DateFrom)
	}
	if filter.DateTo != "" {
		query = query.Where("date <= ?", filter.DateTo)
	}
	for _, tag := range filter.Tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		query = query.Where("tags LIKE ?", "%"+escapeLike(tag)+"%")
	}
	if filter.Query != "" {
		like := "%" + escapeLike(filter.Query) + "%"
		query = query.Where("(title LIKE ? OR text LIKE ? OR partner_note LIKE ? OR place_name LIKE ? OR city LIKE ?)", like, like, like, like, like)
	}
	if filter.Cursor != "" {
		cursor, err := decodeMemoryCursor(filter.Cursor)
		if err != nil {
			return MemoryListPage{}, err
		}
		query = query.Where(
			"(date < ? OR (date = ? AND created_at < ?) OR (date = ? AND created_at = ? AND id < ?))",
			cursor.Date,
			cursor.Date,
			cursor.CreatedAt,
			cursor.Date,
			cursor.CreatedAt,
			cursor.ID,
		)
	}

	var records []MemoryRecord
	if err := query.
		Order("date DESC, created_at DESC, id DESC").
		Limit(limit + 1).
		Find(&records).
		Error; err != nil {
		return MemoryListPage{}, err
	}

	hasMore := len(records) > limit
	if hasMore {
		records = records[:limit]
	}

	memories := make([]models.Memory, 0, len(records))
	for _, record := range records {
		memory := memoryModel(record)
		if err := json.Unmarshal([]byte(record.Tags), &memory.Tags); err != nil || memory.Tags == nil {
			memory.Tags = []string{}
		}
		memories = append(memories, memory)
	}

	nextCursor := ""
	if hasMore && len(records) > 0 {
		last := records[len(records)-1]
		nextCursor = encodeMemoryCursor(memoryCursor{Date: last.Date, CreatedAt: last.CreatedAt, ID: last.ID})
	}
	return MemoryListPage{Items: memories, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (r *MemoryRepository) RelatedByDate(spaceID string, userID string, memoryID string, limit int) ([]models.Memory, error) {
	if limit <= 0 {
		limit = 3
	}
	if limit > 8 {
		limit = 8
	}

	var target MemoryRecord
	err := r.db.
		Where("id = ? AND space_id = ? AND (visibility = ? OR created_by_id = ?)", memoryID, spaceID, "both", userID).
		First(&target).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMemoryNotFound
	}
	if err != nil {
		return nil, err
	}
	targetDate, ok := parseMemoryDate(target.Date)
	if !ok {
		return []models.Memory{}, nil
	}
	targetTags := parseMemoryTags(target.Tags)

	var records []MemoryRecord
	if err := r.db.
		Where("space_id = ? AND city_id = ? AND id <> ? AND (visibility = ? OR created_by_id = ?)", spaceID, target.CityID, memoryID, "both", userID).
		Order("date DESC, created_at DESC").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	candidates := make([]relatedMemoryCandidate, 0, len(records))
	for _, record := range records {
		date, ok := parseMemoryDate(record.Date)
		if !ok {
			continue
		}
		distance := monthDayDistance(targetDate, date)
		if distance > 3 {
			continue
		}
		memory := memoryModel(record)
		memory.Tags = parseMemoryTags(record.Tags)
		candidates = append(candidates, relatedMemoryCandidate{
			Memory:        memory,
			Date:          date,
			DistanceDays:  distance,
			SharedTagHits: sharedTagHits(targetTags, memory.Tags),
		})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		left := candidates[i]
		right := candidates[j]
		if left.DistanceDays != right.DistanceDays {
			return left.DistanceDays < right.DistanceDays
		}
		if left.SharedTagHits != right.SharedTagHits {
			return left.SharedTagHits > right.SharedTagHits
		}
		if !left.Date.Equal(right.Date) {
			return left.Date.After(right.Date)
		}
		return left.Memory.CreatedAt > right.Memory.CreatedAt
	})

	if len(candidates) > limit {
		candidates = candidates[:limit]
	}
	memories := make([]models.Memory, 0, len(candidates))
	for _, candidate := range candidates {
		memories = append(memories, candidate.Memory)
	}
	return memories, nil
}

func (r *MemoryRepository) ListAroundMonthDay(spaceID string, userID string, date string, windowDays int, limit int) ([]models.Memory, error) {
	if windowDays < 0 {
		windowDays = 0
	}
	if limit <= 0 {
		limit = 12
	}
	if limit > 50 {
		limit = 50
	}
	targetDate, ok := parseMemoryDate(date)
	if !ok {
		return []models.Memory{}, nil
	}

	var records []MemoryRecord
	if err := r.db.
		Where("space_id = ? AND (visibility = ? OR created_by_id = ?)", spaceID, "both", userID).
		Order("date DESC, created_at DESC").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	candidates := make([]relatedMemoryCandidate, 0, len(records))
	for _, record := range records {
		memoryDate, ok := parseMemoryDate(record.Date)
		if !ok {
			continue
		}
		distance := monthDayDistance(targetDate, memoryDate)
		if distance > windowDays {
			continue
		}
		memory := memoryModel(record)
		memory.Tags = parseMemoryTags(record.Tags)
		candidates = append(candidates, relatedMemoryCandidate{
			Memory:       memory,
			Date:         memoryDate,
			DistanceDays: distance,
		})
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		left := candidates[i]
		right := candidates[j]
		if left.DistanceDays != right.DistanceDays {
			return left.DistanceDays < right.DistanceDays
		}
		if !left.Date.Equal(right.Date) {
			return left.Date.After(right.Date)
		}
		return left.Memory.CreatedAt > right.Memory.CreatedAt
	})
	if len(candidates) > limit {
		candidates = candidates[:limit]
	}
	memories := make([]models.Memory, 0, len(candidates))
	for _, candidate := range candidates {
		memories = append(memories, candidate.Memory)
	}
	return memories, nil
}

func (r *MemoryRepository) ListTrash(spaceID string, userID string) ([]models.Memory, error) {
	var records []MemoryRecord
	if err := r.db.
		Unscoped().
		Where("space_id = ? AND deleted_at IS NOT NULL AND (visibility = ? OR created_by_id = ?)", spaceID, "both", userID).
		Order("deleted_at DESC").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	memories := make([]models.Memory, 0, len(records))
	for _, record := range records {
		memory := memoryModel(record)
		if err := json.Unmarshal([]byte(record.Tags), &memory.Tags); err != nil || memory.Tags == nil {
			memory.Tags = []string{}
		}
		memories = append(memories, memory)
	}
	return memories, nil
}

func (r *MemoryRepository) Create(memory MemoryRecord, photos []MemoryPhotoRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("created_at", "updated_at").Create(&memory).Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func (r *MemoryRepository) UpdatePartnerNote(memoryID string, spaceID string, partnerNote string, authorID string, partnerVoiceURL string) error {
	return r.updateFields(memoryID, spaceID, map[string]any{
		"partner_note":           partnerNote,
		"partner_note_author_id": authorID,
		"partner_voice_url":      partnerVoiceURL,
	})
}

func (r *MemoryRepository) UpdateCore(memoryID string, spaceID string, patch map[string]any) error {
	return r.updateFields(memoryID, spaceID, patch)
}

func (r *MemoryRepository) ReplacePhotos(
	memoryID string,
	spaceID string,
	photos []MemoryPhotoRecord,
	coverImage string,
	fallbackCoverImage string,
	keyFromURL func(string) string,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("memory_id = ?", memoryID).Delete(&MemoryPhotoRecord{}).Error; err != nil {
			return err
		}
		if len(photos) > 0 {
			if err := tx.Omit("created_at").Create(&photos).Error; err != nil {
				return err
			}
		}

		nextCoverImage := coverImage
		if nextCoverImage == "" {
			nextCoverImage = fallbackCoverImage
		}
		if err := setMemoryCoverPhoto(tx, memoryID, nextCoverImage, keyFromURL); err != nil {
			if errors.Is(err, ErrMemoryCoverPhotoNotFound) && coverImage == "" {
				return setMemoryCoverPhoto(tx, memoryID, "", keyFromURL)
			}
			return err
		}

		return updateMemoryTimestamp(tx, memoryID, spaceID)
	})
}

func (r *MemoryRepository) SetCoverPhoto(spaceID string, memoryID string, coverImage string, keyFromURL func(string) string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := setMemoryCoverPhoto(tx, memoryID, coverImage, keyFromURL); err != nil {
			return err
		}
		return updateMemoryTimestamp(tx, memoryID, spaceID)
	})
}

func (r *MemoryRepository) Delete(memoryID string, spaceID string) error {
	result := r.db.Where("id = ? AND space_id = ?", memoryID, spaceID).Delete(&MemoryRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func (r *MemoryRepository) Restore(memoryID string, spaceID string) error {
	result := r.db.Unscoped().
		Model(&MemoryRecord{}).
		Where("id = ? AND space_id = ? AND deleted_at IS NOT NULL", memoryID, spaceID).
		Updates(map[string]any{
			"deleted_at": nil,
			"updated_at": gorm.Expr("CURRENT_TIMESTAMP"),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func (r *MemoryRepository) ExpiredTrash(retention time.Duration, limit int) ([]MemoryTrashPhotos, error) {
	if limit <= 0 {
		limit = 100
	}
	cutoff := time.Now().UTC().Add(-retention)
	var memories []MemoryTrashRecord
	if err := r.db.
		Unscoped().
		Model(&MemoryRecord{}).
		Select("id, space_id").
		Where("deleted_at IS NOT NULL AND deleted_at < ?", cutoff).
		Order("deleted_at ASC").
		Limit(limit).
		Scan(&memories).
		Error; err != nil {
		return nil, err
	}
	if len(memories) == 0 {
		return []MemoryTrashPhotos{}, nil
	}

	memoryIDs := make([]string, 0, len(memories))
	result := make([]MemoryTrashPhotos, 0, len(memories))
	byMemoryID := map[string]*MemoryTrashPhotos{}
	for _, memory := range memories {
		item := MemoryTrashPhotos{MemoryID: memory.ID, SpaceID: memory.SpaceID}
		result = append(result, item)
		byMemoryID[memory.ID] = &result[len(result)-1]
		memoryIDs = append(memoryIDs, memory.ID)
	}

	var rows []MemoryTrashPhotoRow
	if err := r.db.
		Table("memory_photos").
		Select("memory_id, key, url").
		Where("memory_id IN ?", memoryIDs).
		Order("memory_id, sort_order ASC").
		Scan(&rows).
		Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		item := byMemoryID[row.MemoryID]
		if item != nil {
			item.Photos = append(item.Photos, MemoryTrashPhoto{Key: row.Key, URL: row.URL})
		}
	}
	return result, nil
}

func (r *MemoryRepository) HardDelete(memoryID string, spaceID string) error {
	result := r.db.Unscoped().
		Where("id = ? AND space_id = ? AND deleted_at IS NOT NULL", memoryID, spaceID).
		Delete(&MemoryRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func (r *MemoryRepository) PhotosForMemory(memoryID string) ([]models.Photo, error) {
	var records []MemoryPhotoRecord
	if err := r.db.
		Where("memory_id = ?", memoryID).
		Order("sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	photos := make([]models.Photo, 0, len(records))
	for _, record := range records {
		photos = append(photos, models.Photo{
			ID:        record.ID,
			MemoryID:  record.MemoryID,
			Key:       record.Key,
			URL:       record.URL,
			MimeType:  record.MimeType,
			MediaType: record.MediaType,
			Width:     record.Width,
			Height:    record.Height,
			SortOrder: record.SortOrder,
			CreatedAt: record.CreatedAt,
		})
	}
	return photos, nil
}

func (r *MemoryRepository) PhotosByMemoryIDs(memoryIDs []string) (map[string][]models.Photo, error) {
	photosByMemoryID := emptyPhotoMap(memoryIDs)
	if len(memoryIDs) == 0 {
		return photosByMemoryID, nil
	}

	var records []MemoryPhotoRecord
	if err := r.db.
		Where("memory_id IN ?", memoryIDs).
		Order("memory_id, sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	for _, record := range records {
		photosByMemoryID[record.MemoryID] = append(photosByMemoryID[record.MemoryID], memoryPhotoModel(record))
	}
	return photosByMemoryID, nil
}

func (r *MemoryRepository) CurrentCoverImage(memoryID string) (string, error) {
	var photo MemoryPhotoRecord
	err := r.db.
		Table("memory_photos AS p").
		Select("p.*").
		Joins("JOIN memories m ON m.cover_photo_id = p.id").
		Where("m.id = ? AND p.memory_id = ?", memoryID, memoryID).
		First(&photo).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return photo.URL, nil
}

func (r *MemoryRepository) updateFields(memoryID string, spaceID string, fields map[string]any) error {
	fields["updated_at"] = gorm.Expr("CURRENT_TIMESTAMP")
	result := r.db.Model(&MemoryRecord{}).
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		Updates(fields)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func setMemoryCoverPhoto(tx *gorm.DB, memoryID string, coverImage string, keyFromURL func(string) string) error {
	if coverImage == "" {
		return tx.Model(&MemoryRecord{}).
			Where("id = ?", memoryID).
			Updates(map[string]any{"cover_photo_id": nil, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")}).
			Error
	}

	photoID, err := findMemoryPhotoID(tx, memoryID, coverImage, keyFromURL)
	if err != nil {
		return err
	}

	return tx.Model(&MemoryRecord{}).
		Where("id = ?", memoryID).
		Updates(map[string]any{"cover_photo_id": photoID, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")}).
		Error
}

func findMemoryPhotoID(tx *gorm.DB, memoryID string, coverImage string, keyFromURL func(string) string) (string, error) {
	var photo MemoryPhotoRecord
	key := keyFromURL(coverImage)
	query := tx.Select("id").Where("memory_id = ?", memoryID).Limit(1)
	if key != "" {
		query = query.
			Where("(url = ? OR key = ?)", coverImage, key).
			Order(clause.Expr{SQL: "CASE WHEN url = ? THEN 0 ELSE 1 END", Vars: []interface{}{coverImage}})
	} else {
		query = query.Where("url = ?", coverImage)
	}

	err := query.First(&photo).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrMemoryCoverPhotoNotFound
	}
	if err != nil {
		return "", err
	}
	return photo.ID, nil
}

func updateMemoryTimestamp(tx *gorm.DB, memoryID string, spaceID string) error {
	result := tx.Model(&MemoryRecord{}).
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		Update("updated_at", gorm.Expr("CURRENT_TIMESTAMP"))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func memoryModel(record MemoryRecord) models.Memory {
	memory := models.Memory{
		ID:                  record.ID,
		SpaceID:             record.SpaceID,
		CityID:              record.CityID,
		City:                record.City,
		CityEn:              record.CityEn,
		Title:               record.Title,
		Date:                record.Date,
		Text:                record.Text,
		Mood:                record.Mood,
		Visibility:          record.Visibility,
		PartnerNote:         record.PartnerNote,
		PartnerNoteAuthorID: record.PartnerNoteAuthorID,
		VoiceTextURL:        record.VoiceTextURL,
		PartnerVoiceURL:     record.PartnerVoiceURL,
		PlaceName:           record.PlaceName,
		CoverPhotoID:        record.CoverPhotoID,
		CreatedByID:         record.CreatedByID,
		CreatedAt:           record.CreatedAt,
		UpdatedAt:           record.UpdatedAt,
	}
	if record.DeletedAt.Valid {
		memory.DeletedAt = record.DeletedAt.Time.Format(time.RFC3339)
	}
	return memory
}

func memoryPhotoModel(record MemoryPhotoRecord) models.Photo {
	return models.Photo{
		ID:        record.ID,
		MemoryID:  record.MemoryID,
		Key:       record.Key,
		URL:       record.URL,
		MimeType:  record.MimeType,
		MediaType: record.MediaType,
		Width:     record.Width,
		Height:    record.Height,
		SortOrder: record.SortOrder,
		CreatedAt: record.CreatedAt,
	}
}

func encodeMemoryCursor(cursor memoryCursor) string {
	data, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeMemoryCursor(value string) (memoryCursor, error) {
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return memoryCursor{}, ErrInvalidMemoryCursor
	}
	var cursor memoryCursor
	if err := json.Unmarshal(data, &cursor); err != nil {
		return memoryCursor{}, ErrInvalidMemoryCursor
	}
	if cursor.Date == "" || cursor.CreatedAt == "" || cursor.ID == "" {
		return memoryCursor{}, ErrInvalidMemoryCursor
	}
	return cursor, nil
}

func parseMemoryDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	layouts := []string{
		"2006.01.02",
		"2006.1.2",
		"2006-01-02",
		"2006-1-2",
		time.RFC3339,
	}
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func monthDayDistance(left time.Time, right time.Time) int {
	leftDay := time.Date(2000, left.Month(), left.Day(), 0, 0, 0, 0, time.UTC)
	rightDay := time.Date(2000, right.Month(), right.Day(), 0, 0, 0, 0, time.UTC)
	minDistance := absDays(leftDay.Sub(rightDay))
	for _, shift := range []int{-1, 1} {
		shifted := rightDay.AddDate(shift, 0, 0)
		if distance := absDays(leftDay.Sub(shifted)); distance < minDistance {
			minDistance = distance
		}
	}
	return minDistance
}

func absDays(duration time.Duration) int {
	if duration < 0 {
		duration = -duration
	}
	return int(duration.Hours() / 24)
}

func parseMemoryTags(value string) []string {
	tags := []string{}
	if err := json.Unmarshal([]byte(value), &tags); err != nil || tags == nil {
		return []string{}
	}
	return tags
}

func sharedTagHits(left []string, right []string) int {
	if len(left) == 0 || len(right) == 0 {
		return 0
	}
	leftSet := map[string]bool{}
	for _, tag := range left {
		tag = strings.TrimSpace(tag)
		if tag != "" {
			leftSet[tag] = true
		}
	}
	hits := 0
	for _, tag := range right {
		if leftSet[strings.TrimSpace(tag)] {
			hits++
		}
	}
	return hits
}

func escapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

func emptyPhotoMap(parentIDs []string) map[string][]models.Photo {
	photosByParentID := make(map[string][]models.Photo, len(parentIDs))
	for _, parentID := range parentIDs {
		photosByParentID[parentID] = []models.Photo{}
	}
	return photosByParentID
}
