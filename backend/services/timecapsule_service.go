package services

import (
	"context"
	"errors"
	"time"

	"our-memories-backend/cache"
	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

var ErrTimeCapsuleLimit = errors.New("time capsule unopened limit reached")
var ErrTimeCapsuleLocked = errors.New("time capsule locked")

type CreateTimeCapsuleRequest struct {
	Title    string       `json:"title" binding:"required"`
	OpenDate string       `json:"openDate" binding:"required"`
	Content  string       `json:"content" binding:"required"`
	VoiceURL string       `json:"voiceUrl"`
	OpenMode string       `json:"openMode"`
	Photos   []PhotoInput `json:"photos"`
}

type UpdateTimeCapsuleRequest struct {
	Title    string        `json:"title"`
	OpenDate string        `json:"openDate"`
	Content  string        `json:"content"`
	VoiceURL string        `json:"voiceUrl"`
	OpenMode string        `json:"openMode"`
	Photos   *[]PhotoInput `json:"photos"`
}

type TimeCapsuleService struct {
	repo      *repositories.TimeCapsuleRepository
	upload    PhotoUploader
	delete    PhotoDeleter
	publisher events.Publisher
}

func NewTimeCapsuleService(
	repo *repositories.TimeCapsuleRepository,
	upload PhotoUploader,
	delete PhotoDeleter,
	publisher ...events.Publisher,
) *TimeCapsuleService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &TimeCapsuleService{
		repo:      repo,
		upload:    upload,
		delete:    delete,
		publisher: events.PublisherOrNoop(eventPublisher),
	}
}

func (s *TimeCapsuleService) List(spaceID string, userID string) ([]models.TimeCapsule, error) {
	capsules, err := s.repo.List(spaceID)
	if err != nil {
		return nil, err
	}

	visiblePhotoCapsuleIDs := []string{}
	for i := range capsules {
		unlocked := CanOpenTimeCapsule(capsules[i].OpenDate)
		isCreator := capsules[i].CreatedByID == userID
		if (!unlocked && !isCreator) || (unlocked && !capsules[i].IsOpened) {
			capsules[i].Content = ""
			capsules[i].VoiceURL = ""
			capsules[i].Photos = []models.Photo{}
			continue
		}
		visiblePhotoCapsuleIDs = append(visiblePhotoCapsuleIDs, capsules[i].ID)
	}

	photosByCapsuleID, err := s.repo.PhotosByCapsuleIDs(visiblePhotoCapsuleIDs)
	if err != nil {
		return nil, err
	}
	for i := range capsules {
		if photos, ok := photosByCapsuleID[capsules[i].ID]; ok {
			capsules[i].Photos = photos
		}
	}
	return capsules, nil
}

func (s *TimeCapsuleService) Create(spaceID string, userID string, req CreateTimeCapsuleRequest) (string, error) {
	count, err := s.repo.UnopenedCount(spaceID)
	if err != nil {
		return "", err
	}
	if count >= 3 {
		return "", ErrTimeCapsuleLimit
	}
	if err := s.upload(spaceID, "time-capsules", req.Photos); err != nil {
		return "", err
	}

	capsuleID := utils.NewID()
	if err := s.repo.Create(repositories.TimeCapsuleRecord{
		ID:          capsuleID,
		SpaceID:     spaceID,
		Title:       req.Title,
		OpenDate:    req.OpenDate,
		Content:     req.Content,
		VoiceURL:    req.VoiceURL,
		OpenMode:    normalizeTimeCapsuleOpenMode(req.OpenMode),
		CreatedByID: userID,
	}, timeCapsulePhotoRecords(capsuleID, req.Photos)); err != nil {
		return "", err
	}

	s.publish(events.TimeCapsuleCreated, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return capsuleID, nil
}

func (s *TimeCapsuleService) Update(spaceID string, userID string, capsuleID string, req UpdateTimeCapsuleRequest) error {
	createdByID, err := s.repo.CreatedByID(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}

	var oldPhotos []StoredPhoto
	replacePhotos := req.Photos != nil
	if replacePhotos {
		oldPhotos, err = s.collectPhotos(capsuleID)
		if err != nil {
			return err
		}
		if err := s.upload(spaceID, "time-capsules", *req.Photos); err != nil {
			return err
		}
	}

	photos := []repositories.TimeCapsulePhotoRecord{}
	if replacePhotos {
		photos = timeCapsulePhotoRecords(capsuleID, *req.Photos)
	}
	if err := s.repo.Update(capsuleID, spaceID, map[string]any{
		"title":     req.Title,
		"open_date": req.OpenDate,
		"content":   req.Content,
		"voice_url": req.VoiceURL,
		"open_mode": normalizeTimeCapsuleOpenMode(req.OpenMode),
	}, photos, replacePhotos); err != nil {
		return err
	}

	if replacePhotos {
		if err := s.deleteRemovedPhotos(spaceID, oldPhotos, *req.Photos); err != nil {
			cache.ClearTimeCapsuleSpace(spaceID)
			return err
		}
	}

	s.publish(events.TimeCapsuleUpdated, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

func (s *TimeCapsuleService) Open(spaceID string, userID string, capsuleID string) error {
	openDate, err := s.repo.OpenDate(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if !CanOpenTimeCapsule(openDate) {
		return ErrTimeCapsuleLocked
	}
	capsule, err := s.repo.MarkOpened(capsuleID, spaceID, userID)
	if err != nil {
		return err
	}

	if capsule.IsOpened {
		s.publish(events.TimeCapsuleOpened, spaceID, userID, capsuleID)
	} else {
		s.publish(events.TimeCapsuleUpdated, spaceID, userID, capsuleID)
	}
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

func (s *TimeCapsuleService) Delete(spaceID string, userID string, capsuleID string) error {
	createdByID, err := s.repo.CreatedByID(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}

	photos, err := s.collectPhotos(capsuleID)
	if err != nil {
		return err
	}
	if err := s.delete(spaceID, photos); err != nil {
		return err
	}
	if err := s.repo.Delete(capsuleID, spaceID); err != nil {
		return err
	}

	s.publish(events.TimeCapsuleDeleted, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

func (s *TimeCapsuleService) publish(eventType events.Type, spaceID string, actorID string, targetID string) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
	})
}

func (s *TimeCapsuleService) collectPhotos(capsuleID string) ([]StoredPhoto, error) {
	photos, err := s.repo.PhotosForCapsule(capsuleID)
	if err != nil {
		return nil, err
	}
	result := make([]StoredPhoto, 0, len(photos))
	for _, photo := range photos {
		result = append(result, StoredPhoto{Key: photo.Key, URL: photo.URL})
	}
	return result, nil
}

func (s *TimeCapsuleService) deleteRemovedPhotos(spaceID string, oldPhotos []StoredPhoto, newPhotos []PhotoInput) error {
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

func CanOpenTimeCapsule(openDate string) bool {
	return canOpenTimeCapsuleAt(openDate, time.Now())
}

func canOpenTimeCapsuleAt(openDate string, now time.Time) bool {
	t, err := time.Parse("2006-01-02", openDate)
	if err != nil {
		t, err = time.Parse(time.RFC3339, openDate)
		if err != nil {
			return false
		}
		now = now.UTC()
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	openDay := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, today.Location())
	return !today.Before(openDay)
}

func normalizeTimeCapsuleOpenMode(value string) string {
	if value == "together" {
		return "together"
	}
	return "single"
}

func timeCapsulePhotoRecords(capsuleID string, photos []PhotoInput) []repositories.TimeCapsulePhotoRecord {
	records := make([]repositories.TimeCapsulePhotoRecord, 0, len(photos))
	for i, photo := range photos {
		records = append(records, repositories.TimeCapsulePhotoRecord{
			ID:            utils.NewID(),
			TimeCapsuleID: capsuleID,
			Key:           photo.Key,
			URL:           photo.URL,
			MimeType:      photo.MimeType,
			SortOrder:     i,
		})
	}
	return records
}
