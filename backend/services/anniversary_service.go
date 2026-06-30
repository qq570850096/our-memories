package services

import (
	"context"

	"our-memories-backend/cache"
	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

type CreateAnniversaryCardRequest struct {
	Title        string       `json:"title" binding:"required"`
	Date         string       `json:"date" binding:"required"`
	Note         string       `json:"note"`
	VoiceURL     string       `json:"voiceUrl"`
	BGMURL       string       `json:"bgmUrl"`
	BGMPreset    string       `json:"bgmPreset"`
	RepeatYearly bool         `json:"repeatYearly"`
	Pinned       bool         `json:"pinned"`
	Photos       []PhotoInput `json:"photos"`
}

type UpdateAnniversaryCardRequest struct {
	Title        string        `json:"title"`
	Date         string        `json:"date"`
	Note         string        `json:"note"`
	VoiceURL     string        `json:"voiceUrl"`
	BGMURL       string        `json:"bgmUrl"`
	BGMPreset    string        `json:"bgmPreset"`
	RepeatYearly bool          `json:"repeatYearly"`
	Pinned       bool          `json:"pinned"`
	Photos       *[]PhotoInput `json:"photos"`
}

type AnniversaryService struct {
	repo       *repositories.AnniversaryRepository
	memoryRepo *repositories.MemoryRepository
	upload     PhotoUploader
	delete     PhotoDeleter
	publisher  events.Publisher
}

type AnniversaryReplayResponse struct {
	Card     models.AnniversaryCard `json:"card"`
	Memories []models.Memory        `json:"memories"`
}

func NewAnniversaryService(
	repo *repositories.AnniversaryRepository,
	upload PhotoUploader,
	delete PhotoDeleter,
	publisher ...events.Publisher,
) *AnniversaryService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &AnniversaryService{
		repo:      repo,
		upload:    upload,
		delete:    delete,
		publisher: events.PublisherOrNoop(eventPublisher),
	}
}

func (s *AnniversaryService) SetMemoryRepository(repo *repositories.MemoryRepository) {
	s.memoryRepo = repo
}

func (s *AnniversaryService) List(spaceID string) ([]models.AnniversaryCard, error) {
	cards, err := s.repo.List(spaceID)
	if err != nil {
		return nil, err
	}

	cardIDs := make([]string, 0, len(cards))
	for _, card := range cards {
		cardIDs = append(cardIDs, card.ID)
	}
	photosByCardID, err := s.repo.PhotosByCardIDs(cardIDs)
	if err != nil {
		return nil, err
	}

	for i := range cards {
		cards[i].Photos = photosByCardID[cards[i].ID]
	}
	return cards, nil
}

func (s *AnniversaryService) Replay(spaceID string, userID string, cardID string) (AnniversaryReplayResponse, error) {
	card, err := s.repo.ByID(spaceID, cardID)
	if err != nil {
		return AnniversaryReplayResponse{}, err
	}
	cardPhotos, err := s.repo.PhotosByCardIDs([]string{card.ID})
	if err != nil {
		return AnniversaryReplayResponse{}, err
	}
	card.Photos = cardPhotos[card.ID]

	if s.memoryRepo == nil {
		return AnniversaryReplayResponse{Card: card, Memories: []models.Memory{}}, nil
	}
	memories, err := s.memoryRepo.ListAroundMonthDay(spaceID, userID, card.Date, 3, 12)
	if err != nil {
		return AnniversaryReplayResponse{}, err
	}
	memoryIDs := make([]string, 0, len(memories))
	for _, memory := range memories {
		memoryIDs = append(memoryIDs, memory.ID)
	}
	photosByMemoryID, err := s.memoryRepo.PhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return AnniversaryReplayResponse{}, err
	}
	for i := range memories {
		memories[i].Photos = photosByMemoryID[memories[i].ID]
	}
	return AnniversaryReplayResponse{Card: card, Memories: memories}, nil
}

func (s *AnniversaryService) Create(spaceID string, userID string, req CreateAnniversaryCardRequest) (string, error) {
	if err := s.upload(spaceID, "anniversaries", req.Photos); err != nil {
		return "", err
	}

	cardID := utils.NewID()
	if err := s.repo.Create(repositories.AnniversaryCardRecord{
		ID:           cardID,
		SpaceID:      spaceID,
		Title:        req.Title,
		Date:         req.Date,
		Note:         req.Note,
		VoiceURL:     req.VoiceURL,
		BGMURL:       req.BGMURL,
		BGMPreset:    req.BGMPreset,
		RepeatYearly: boolInt(req.RepeatYearly),
		Pinned:       boolInt(req.Pinned),
		CreatedByID:  userID,
	}, anniversaryPhotoRecords(cardID, req.Photos)); err != nil {
		return "", err
	}

	s.publish(events.AnniversaryCreated, spaceID, userID, cardID)
	cache.ClearAnniversarySpace(spaceID)
	return cardID, nil
}

func (s *AnniversaryService) Update(spaceID string, userID string, cardID string, req UpdateAnniversaryCardRequest) error {
	createdByID, err := s.repo.CreatedByID(cardID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}

	var oldPhotos []StoredPhoto
	replacePhotos := req.Photos != nil
	if replacePhotos {
		oldPhotos, err = s.collectPhotos(cardID)
		if err != nil {
			return err
		}
		if err := s.upload(spaceID, "anniversaries", *req.Photos); err != nil {
			return err
		}
	}

	photos := []repositories.AnniversaryPhotoRecord{}
	if replacePhotos {
		photos = anniversaryPhotoRecords(cardID, *req.Photos)
	}
	if err := s.repo.Update(cardID, spaceID, map[string]any{
		"title":         req.Title,
		"date":          req.Date,
		"note":          req.Note,
		"voice_url":     req.VoiceURL,
		"bgm_url":       req.BGMURL,
		"bgm_preset":    req.BGMPreset,
		"repeat_yearly": boolInt(req.RepeatYearly),
		"pinned":        boolInt(req.Pinned),
	}, photos, replacePhotos); err != nil {
		return err
	}

	if replacePhotos {
		if err := s.deleteRemovedPhotos(spaceID, oldPhotos, *req.Photos); err != nil {
			cache.ClearAnniversarySpace(spaceID)
			return err
		}
	}

	s.publish(events.AnniversaryUpdated, spaceID, userID, cardID)
	cache.ClearAnniversarySpace(spaceID)
	return nil
}

func (s *AnniversaryService) Delete(spaceID string, userID string, cardID string) error {
	createdByID, err := s.repo.CreatedByID(cardID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}

	photos, err := s.collectPhotos(cardID)
	if err != nil {
		return err
	}
	if err := s.delete(spaceID, photos); err != nil {
		return err
	}
	if err := s.repo.Delete(cardID, spaceID); err != nil {
		return err
	}

	s.publish(events.AnniversaryDeleted, spaceID, userID, cardID)
	cache.ClearAnniversarySpace(spaceID)
	return nil
}

func (s *AnniversaryService) publish(eventType events.Type, spaceID string, actorID string, targetID string) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
	})
}

func (s *AnniversaryService) collectPhotos(cardID string) ([]StoredPhoto, error) {
	photos, err := s.repo.PhotosForCard(cardID)
	if err != nil {
		return nil, err
	}
	result := make([]StoredPhoto, 0, len(photos))
	for _, photo := range photos {
		result = append(result, StoredPhoto{Key: photo.Key, URL: photo.URL})
	}
	return result, nil
}

func (s *AnniversaryService) deleteRemovedPhotos(spaceID string, oldPhotos []StoredPhoto, newPhotos []PhotoInput) error {
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

func anniversaryPhotoRecords(cardID string, photos []PhotoInput) []repositories.AnniversaryPhotoRecord {
	records := make([]repositories.AnniversaryPhotoRecord, 0, len(photos))
	for i, photo := range photos {
		records = append(records, repositories.AnniversaryPhotoRecord{
			ID:                utils.NewID(),
			AnniversaryCardID: cardID,
			Key:               photo.Key,
			URL:               photo.URL,
			MimeType:          photo.MimeType,
			SortOrder:         i,
		})
	}
	return records
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
