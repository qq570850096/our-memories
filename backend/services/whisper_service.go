package services

import (
	"context"
	"strings"

	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

type CreateWhisperRequest struct {
	Title    string `json:"title" binding:"required"`
	Content  string `json:"content"`
	VoiceURL string `json:"voiceUrl"`
}

type ReplyWhisperRequest struct {
	Content  string `json:"content"`
	VoiceURL string `json:"voiceUrl"`
}

type WhisperService struct {
	repo      *repositories.WhisperRepository
	publisher events.Publisher
}

func NewWhisperService(repo *repositories.WhisperRepository, publisher ...events.Publisher) *WhisperService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &WhisperService{
		repo:      repo,
		publisher: events.PublisherOrNoop(eventPublisher),
	}
}

func (s *WhisperService) List(spaceID string) ([]models.Whisper, error) {
	return s.repo.List(spaceID)
}

func (s *WhisperService) Create(spaceID string, userID string, req CreateWhisperRequest) (string, error) {
	whisperID := utils.NewID()
	var firstReply *repositories.WhisperReplyRecord
	if strings.TrimSpace(req.Content) != "" || strings.TrimSpace(req.VoiceURL) != "" {
		firstReply = &repositories.WhisperReplyRecord{
			ID:        utils.NewID(),
			WhisperID: whisperID,
			UserID:    userID,
			Content:   req.Content,
			VoiceURL:  req.VoiceURL,
		}
	}

	if err := s.repo.Create(repositories.WhisperRecord{
		ID:          whisperID,
		SpaceID:     spaceID,
		Title:       req.Title,
		CreatedByID: userID,
	}, firstReply); err != nil {
		return "", err
	}
	s.publish(events.WhisperCreated, spaceID, userID, whisperID)
	return whisperID, nil
}

func (s *WhisperService) Reply(spaceID string, userID string, whisperID string, req ReplyWhisperRequest) (string, error) {
	if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.VoiceURL) == "" {
		return "", ErrInvalidContent
	}
	replyID := utils.NewID()
	err := s.repo.AddReply(spaceID, repositories.WhisperReplyRecord{
		ID:        replyID,
		WhisperID: whisperID,
		UserID:    userID,
		Content:   req.Content,
		VoiceURL:  req.VoiceURL,
	})
	if err == nil {
		s.publish(events.WhisperReplied, spaceID, userID, whisperID)
	}
	return replyID, err
}

func (s *WhisperService) Delete(spaceID string, userID string, whisperID string) error {
	createdByID, err := s.repo.CreatedByID(whisperID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}
	if err := s.repo.Delete(whisperID, spaceID); err != nil {
		return err
	}
	s.publish(events.WhisperDeleted, spaceID, userID, whisperID)
	return nil
}

func (s *WhisperService) publish(eventType events.Type, spaceID string, actorID string, targetID string) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
	})
}
