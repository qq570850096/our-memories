package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

var ErrForbidden = errors.New("forbidden")
var ErrInvalidContent = errors.New("invalid content")

type PhotoInput struct {
	Key       string `json:"key"`
	URL       string `json:"url"`
	MimeType  string `json:"mimeType"`
	MediaType string `json:"mediaType"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

type CreateMemoryRequest struct {
	CityID          string       `json:"cityId" binding:"required"`
	City            string       `json:"city" binding:"required"`
	CityEn          string       `json:"cityEn" binding:"required"`
	Title           string       `json:"title"`
	Date            string       `json:"date" binding:"required"`
	Text            string       `json:"text" binding:"required"`
	Mood            string       `json:"mood"`
	Tags            []string     `json:"tags"`
	Visibility      string       `json:"visibility"`
	PartnerNote     string       `json:"partnerNote"`
	VoiceTextURL    string       `json:"voiceTextUrl"`
	PartnerVoiceURL string       `json:"partnerVoiceUrl"`
	PlaceName       string       `json:"placeName"`
	Photos          []PhotoInput `json:"photos"`
}

type UpdateMemoryRequest struct {
	Title           string        `json:"title"`
	Date            string        `json:"date"`
	Text            string        `json:"text"`
	Mood            string        `json:"mood"`
	Tags            []string      `json:"tags"`
	Visibility      string        `json:"visibility"`
	PartnerNote     *string       `json:"partnerNote"`
	VoiceTextURL    string        `json:"voiceTextUrl"`
	PartnerVoiceURL string        `json:"partnerVoiceUrl"`
	PlaceName       string        `json:"placeName"`
	CoverImage      string        `json:"coverImage"`
	Photos          *[]PhotoInput `json:"photos"`
}

type MemoryStoreLoader func(spaceID string, userID string) (map[string][]gin.H, error)
type PhotoUploader func(spaceID string, folder string, photos []PhotoInput) error
type PhotoDeleter func(spaceID string, photos []StoredPhoto) error

type StoredPhoto struct {
	Key string
	URL string
}

type MemoryService struct {
	repo        *repositories.MemoryRepository
	storeLoader MemoryStoreLoader
	upload      PhotoUploader
	delete      PhotoDeleter
	publisher   events.Publisher
}

type MemoryListRequest struct {
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

type MemoryListResponse struct {
	Items      []models.Memory `json:"items"`
	NextCursor string          `json:"nextCursor,omitempty"`
	HasMore    bool            `json:"hasMore"`
}

type MemorySearchIntent struct {
	Query  string            `json:"query,omitempty"`
	CityID string            `json:"cityId,omitempty"`
	Tags   []string          `json:"tags,omitempty"`
	Mood   string            `json:"mood,omitempty"`
	Source map[string]string `json:"source,omitempty"`
}

type MemoryIntentSearchResponse struct {
	Intent     MemorySearchIntent `json:"intent"`
	Items      []models.Memory    `json:"items"`
	NextCursor string             `json:"nextCursor,omitempty"`
	HasMore    bool               `json:"hasMore"`
}

func NewMemoryService(
	repo *repositories.MemoryRepository,
	storeLoader MemoryStoreLoader,
	upload PhotoUploader,
	delete PhotoDeleter,
	publisher ...events.Publisher,
) *MemoryService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &MemoryService{
		repo:        repo,
		storeLoader: storeLoader,
		upload:      upload,
		delete:      delete,
		publisher:   events.PublisherOrNoop(eventPublisher),
	}
}

func (s *MemoryService) Create(spaceID string, userID string, req CreateMemoryRequest) (string, map[string][]gin.H, error) {
	memoryID := utils.NewID()
	tagsJSON, _ := json.Marshal(req.Tags)
	if req.Visibility == "" {
		req.Visibility = "both"
	}
	if err := s.upload(spaceID, "memories", req.Photos); err != nil {
		return "", nil, err
	}

	partnerNote := strings.TrimSpace(req.PartnerNote)
	partnerNoteAuthorID := ""
	if partnerNote != "" {
		partnerNoteAuthorID = userID
	}

	err := s.repo.Create(repositories.MemoryRecord{
		ID:                  memoryID,
		SpaceID:             spaceID,
		CityID:              req.CityID,
		City:                req.City,
		CityEn:              req.CityEn,
		Title:               req.Title,
		Date:                req.Date,
		Text:                req.Text,
		Mood:                req.Mood,
		Tags:                string(tagsJSON),
		Visibility:          req.Visibility,
		PartnerNote:         partnerNote,
		PartnerNoteAuthorID: partnerNoteAuthorID,
		VoiceTextURL:        req.VoiceTextURL,
		PartnerVoiceURL:     req.PartnerVoiceURL,
		PlaceName:           req.PlaceName,
		CreatedByID:         userID,
	}, memoryPhotoRecords(memoryID, req.Photos))
	if err != nil {
		return "", nil, err
	}
	s.publish(events.MemoryCreated, spaceID, userID, memoryID, map[string]any{"cityId": req.CityID})

	memories, err := s.reload(spaceID, userID)
	return memoryID, memories, err
}

func (s *MemoryService) ListByCity(spaceID string, userID string, cityID string) (map[string][]gin.H, error) {
	memories, err := s.repo.ListVisible(spaceID, userID, cityID)
	if err != nil {
		return nil, err
	}

	memoryIDs := make([]string, 0, len(memories))
	for _, memory := range memories {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.repo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return nil, err
	}

	result := map[string][]gin.H{}
	for _, memory := range memories {
		memory.Photos = photosByMemoryID[memory.ID]
		photoURLs, image := memoryImagePayload(memory)

		result[memory.CityID] = append(result[memory.CityID], gin.H{
			"id":                  memory.ID,
			"cityId":              memory.CityID,
			"city":                memory.City,
			"cityEn":              memory.CityEn,
			"title":               memory.Title,
			"date":                memory.Date,
			"text":                memory.Text,
			"mood":                memory.Mood,
			"tags":                memory.Tags,
			"visibility":          memory.Visibility,
			"partnerNote":         memory.PartnerNote,
			"partnerNoteAuthorId": memory.PartnerNoteAuthorID,
			"voiceTextUrl":        memory.VoiceTextURL,
			"partnerVoiceUrl":     memory.PartnerVoiceURL,
			"placeName":           memory.PlaceName,
			"coverPhotoId":        memory.CoverPhotoID,
			"image":               image,
			"photos":              photoURLs,
			"createdById":         memory.CreatedByID,
			"createdAt":           memory.CreatedAt,
			"updatedAt":           memory.UpdatedAt,
		})
	}
	return result, nil
}

func (s *MemoryService) ListPage(spaceID string, userID string, req MemoryListRequest) (MemoryListResponse, error) {
	page, err := s.repo.ListPage(spaceID, userID, repositories.MemoryListFilter{
		CityID:     req.CityID,
		Tags:       req.Tags,
		Mood:       req.Mood,
		Visibility: req.Visibility,
		DateFrom:   req.DateFrom,
		DateTo:     req.DateTo,
		Query:      req.Query,
		Cursor:     req.Cursor,
		Limit:      req.Limit,
	})
	if err != nil {
		return MemoryListResponse{}, err
	}
	memoryIDs := make([]string, 0, len(page.Items))
	for _, memory := range page.Items {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.repo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return MemoryListResponse{}, err
	}
	for i := range page.Items {
		page.Items[i].Photos = photosByMemoryID[page.Items[i].ID]
	}
	return MemoryListResponse{
		Items:      page.Items,
		NextCursor: page.NextCursor,
		HasMore:    page.HasMore,
	}, nil
}

func (s *MemoryService) RelatedByDate(spaceID string, userID string, memoryID string) ([]models.Memory, error) {
	memories, err := s.repo.RelatedByDate(spaceID, userID, memoryID, 3)
	if err != nil {
		return nil, err
	}
	memoryIDs := make([]string, 0, len(memories))
	for _, memory := range memories {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.repo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return nil, err
	}
	for i := range memories {
		memories[i].Photos = photosByMemoryID[memories[i].ID]
	}
	return memories, nil
}

func (s *MemoryService) ListTrash(spaceID string, userID string) ([]gin.H, error) {
	memories, err := s.repo.ListTrash(spaceID, userID)
	if err != nil {
		return nil, err
	}

	memoryIDs := make([]string, 0, len(memories))
	for _, memory := range memories {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.repo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return nil, err
	}

	result := make([]gin.H, 0, len(memories))
	for _, memory := range memories {
		memory.Photos = photosByMemoryID[memory.ID]
		photoURLs, image := memoryImagePayload(memory)
		result = append(result, gin.H{
			"id":                  memory.ID,
			"cityId":              memory.CityID,
			"city":                memory.City,
			"cityEn":              memory.CityEn,
			"title":               memory.Title,
			"date":                memory.Date,
			"text":                memory.Text,
			"mood":                memory.Mood,
			"tags":                memory.Tags,
			"visibility":          memory.Visibility,
			"partnerNote":         memory.PartnerNote,
			"partnerNoteAuthorId": memory.PartnerNoteAuthorID,
			"voiceTextUrl":        memory.VoiceTextURL,
			"partnerVoiceUrl":     memory.PartnerVoiceURL,
			"placeName":           memory.PlaceName,
			"coverPhotoId":        memory.CoverPhotoID,
			"image":               image,
			"photos":              photoURLs,
			"createdById":         memory.CreatedByID,
			"createdAt":           memory.CreatedAt,
			"updatedAt":           memory.UpdatedAt,
			"deletedAt":           memory.DeletedAt,
		})
	}
	return result, nil
}

func (s *MemoryService) Summary(spaceID string, userID string) (map[string]gin.H, error) {
	memories, err := s.repo.ListVisible(spaceID, userID, "")
	if err != nil {
		return nil, err
	}

	memoryIDs := make([]string, 0, len(memories))
	for _, memory := range memories {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.repo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return nil, err
	}

	summary := map[string]gin.H{}
	for _, memory := range memories {
		memory.Photos = photosByMemoryID[memory.ID]
		_, image := memoryImagePayload(memory)

		existing, ok := summary[memory.CityID]
		count := 1
		if ok {
			if existingCount, isInt := existing["count"].(int); isInt {
				count = existingCount + 1
			}
		}

		latest := gin.H{
			"id":          memory.ID,
			"cityId":      memory.CityID,
			"city":        memory.City,
			"cityEn":      memory.CityEn,
			"title":       memory.Title,
			"date":        memory.Date,
			"text":        memory.Text,
			"placeName":   memory.PlaceName,
			"image":       image,
			"createdById": memory.CreatedByID,
			"createdAt":   memory.CreatedAt,
			"updatedAt":   memory.UpdatedAt,
		}

		if ok {
			existing["count"] = count
			summary[memory.CityID] = existing
			continue
		}

		summary[memory.CityID] = gin.H{
			"cityId":     memory.CityID,
			"city":       memory.City,
			"cityEn":     memory.CityEn,
			"count":      count,
			"coverImage": image,
			"latest":     latest,
			"updatedAt":  memory.UpdatedAt,
		}
	}
	return summary, nil
}

func (s *MemoryService) Update(spaceID string, userID string, memoryID string, req UpdateMemoryRequest) (map[string][]gin.H, error) {
	createdByID, err := s.repo.CreatedByID(memoryID, spaceID)
	if err != nil {
		return nil, err
	}

	isCreator := createdByID == userID
	if !isCreator {
		if req.PartnerNote == nil && req.PartnerVoiceURL == "" {
			return nil, ErrForbidden
		}
		partnerNote := ""
		if req.PartnerNote != nil {
			partnerNote = strings.TrimSpace(*req.PartnerNote)
		}
		partnerNoteAuthorID := userID
		if partnerNote == "" && req.PartnerVoiceURL == "" {
			partnerNoteAuthorID = ""
		}
		if err := s.repo.UpdatePartnerNote(memoryID, spaceID, partnerNote, partnerNoteAuthorID, req.PartnerVoiceURL); err != nil {
			return nil, err
		}
		s.publish(events.MemoryUpdated, spaceID, userID, memoryID, map[string]any{"field": "partnerNote"})
		return s.reload(spaceID, userID)
	}

	if req.Date != "" || req.Text != "" || req.VoiceTextURL != "" || req.PartnerVoiceURL != "" {
		tagsJSON, _ := json.Marshal(req.Tags)
		if req.Visibility == "" {
			req.Visibility = "both"
		}
		if err := s.repo.UpdateCore(memoryID, spaceID, map[string]any{
			"title":             req.Title,
			"date":              req.Date,
			"text":              req.Text,
			"mood":              req.Mood,
			"tags":              string(tagsJSON),
			"visibility":        req.Visibility,
			"voice_text_url":    req.VoiceTextURL,
			"partner_voice_url": req.PartnerVoiceURL,
			"place_name":        req.PlaceName,
		}); err != nil {
			return nil, err
		}
	}

	if req.Photos != nil {
		oldPhotos, err := s.collectPhotos(memoryID)
		if err != nil {
			return nil, err
		}
		oldCoverImage, err := s.repo.CurrentCoverImage(memoryID)
		if err != nil {
			return nil, err
		}
		photos := *req.Photos
		if err := s.upload(spaceID, "memories", photos); err != nil {
			return nil, err
		}
		if err := s.repo.ReplacePhotos(memoryID, spaceID, memoryPhotoRecords(memoryID, photos), req.CoverImage, oldCoverImage, storage.KeyFromURL); err != nil {
			return nil, err
		}
		if err := s.deleteRemovedPhotos(spaceID, oldPhotos, photos); err != nil {
			cache.ClearMemorySpace(spaceID)
			return nil, err
		}
	} else if req.CoverImage != "" {
		if err := s.repo.SetCoverPhoto(spaceID, memoryID, req.CoverImage, storage.KeyFromURL); err != nil {
			return nil, err
		}
	}

	s.publish(events.MemoryUpdated, spaceID, userID, memoryID, nil)
	return s.reload(spaceID, userID)
}

func (s *MemoryService) Delete(spaceID string, userID string, memoryID string) (map[string][]gin.H, error) {
	createdByID, err := s.repo.CreatedByID(memoryID, spaceID)
	if err != nil {
		return nil, err
	}
	if createdByID != userID {
		return nil, ErrForbidden
	}

	if err := s.repo.Delete(memoryID, spaceID); err != nil {
		return nil, err
	}

	s.publish(events.MemoryDeleted, spaceID, userID, memoryID, nil)
	return s.reload(spaceID, userID)
}

func (s *MemoryService) Restore(spaceID string, userID string, memoryID string) (map[string][]gin.H, error) {
	createdByID, err := s.repo.CreatedByIDIncludingDeleted(memoryID, spaceID)
	if err != nil {
		return nil, err
	}
	if createdByID != userID {
		return nil, ErrForbidden
	}

	if err := s.repo.Restore(memoryID, spaceID); err != nil {
		return nil, err
	}

	s.publish(events.MemoryUpdated, spaceID, userID, memoryID, map[string]any{"field": "restore"})
	return s.reload(spaceID, userID)
}

func (s *MemoryService) publish(eventType events.Type, spaceID string, actorID string, targetID string, metadata map[string]any) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
		Metadata: metadata,
	})
}

func (s *MemoryService) reload(spaceID string, userID string) (map[string][]gin.H, error) {
	cache.ClearMemorySpace(spaceID)
	return s.storeLoader(spaceID, userID)
}

func (s *MemoryService) collectPhotos(memoryID string) ([]StoredPhoto, error) {
	photos, err := s.repo.PhotosForMemory(memoryID)
	if err != nil {
		return nil, err
	}
	result := make([]StoredPhoto, 0, len(photos))
	for _, photo := range photos {
		result = append(result, StoredPhoto{Key: photo.Key, URL: photo.URL})
	}
	return result, nil
}

func (s *MemoryService) deleteRemovedPhotos(spaceID string, oldPhotos []StoredPhoto, newPhotos []PhotoInput) error {
	keep := map[string]bool{}
	for _, photo := range newPhotos {
		if photo.Key != "" {
			keep[photo.Key] = true
		}
		if photo.URL != "" {
			keep[photo.URL] = true
		}
	}

	removed := []StoredPhoto{}
	for _, photo := range oldPhotos {
		if (photo.Key == "" || !keep[photo.Key]) && (photo.URL == "" || !keep[photo.URL]) {
			removed = append(removed, photo)
		}
	}
	if len(removed) == 0 {
		return nil
	}
	return s.delete(spaceID, removed)
}

func memoryPhotoRecords(memoryID string, photos []PhotoInput) []repositories.MemoryPhotoRecord {
	records := make([]repositories.MemoryPhotoRecord, 0, len(photos))
	for i, photo := range photos {
		records = append(records, repositories.MemoryPhotoRecord{
			ID:        utils.NewID(),
			MemoryID:  memoryID,
			Key:       photo.Key,
			URL:       photo.URL,
			MimeType:  photo.MimeType,
			MediaType: normalizeMediaType(photo.MediaType, photo.MimeType),
			Width:     photo.Width,
			Height:    photo.Height,
			SortOrder: i,
		})
	}
	return records
}

func memoryImagePayload(memory models.Memory) ([]string, string) {
	photoURLs := []string{}
	for _, photo := range memory.Photos {
		if photo.URL == "" {
			continue
		}
		if normalizeMediaType(photo.MediaType, photo.MimeType) == "audio" {
			continue
		}
		photoURLs = append(photoURLs, photo.URL)
	}

	image := ""
	if memory.CoverPhotoID != "" {
		for _, photo := range memory.Photos {
			if photo.ID == memory.CoverPhotoID && photo.URL != "" {
				if normalizeMediaType(photo.MediaType, photo.MimeType) == "audio" {
					continue
				}
				image = photo.URL
				break
			}
		}
	}
	if image == "" && len(photoURLs) > 0 {
		image = photoURLs[0]
	}
	return photoURLs, image
}

func normalizeMediaType(mediaType string, mimeType string) string {
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if mediaType == "audio" {
		return "audio"
	}
	if strings.HasPrefix(strings.ToLower(mimeType), "audio/") {
		return "audio"
	}
	return "image"
}
