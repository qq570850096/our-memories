package services

import (
	"os"
	"time"

	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

const agentSettingsKey = "agentSettings"
const agentIgnoredSuggestionsKey = "agentIgnoredSuggestions"

type CreateAuxiliaryItemRequest struct {
	Kind   string `json:"kind" binding:"required"`
	Title  string `json:"title" binding:"required"`
	Date   string `json:"date"`
	Note   string `json:"note"`
	CityID string `json:"cityId"`
}

type UpdateAuxiliaryItemRequest struct {
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Date   string `json:"date"`
	Note   string `json:"note"`
	CityID string `json:"cityId"`
}

type AuxiliaryItem struct {
	ID        string `json:"id"`
	SpaceID   string `json:"spaceId"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Date      string `json:"date"`
	Note      string `json:"note"`
	CityID    string `json:"cityId"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type SettingService struct {
	repo *repositories.SettingRepository
}

type AgentSettings struct {
	Enabled bool `json:"enabled"`
}

type AgentIgnoredSuggestion struct {
	Agent     string `json:"agent"`
	TargetID  string `json:"targetId"`
	Reason    string `json:"reason,omitempty"`
	IgnoredAt string `json:"ignoredAt"`
}

type IgnoreAgentSuggestionRequest struct {
	Agent    string `json:"agent" binding:"required"`
	TargetID string `json:"targetId" binding:"required"`
	Reason   string `json:"reason"`
}

func NewSettingService(repo *repositories.SettingRepository) *SettingService {
	return &SettingService{repo: repo}
}

func (s *SettingService) List(spaceID string) (map[string]any, error) {
	settings, err := s.repo.List(spaceID)
	if err != nil {
		return nil, err
	}
	if _, ok := settings["anniversaryDate"]; !ok {
		if envDate := os.Getenv("DEFAULT_ANNIVERSARY_DATE"); envDate != "" {
			settings["anniversaryDate"] = envDate
		}
	}
	if _, ok := settings["anniversaryLabel"]; !ok {
		if envLabel := os.Getenv("DEFAULT_ANNIVERSARY_LABEL"); envLabel != "" {
			settings["anniversaryLabel"] = envLabel
		}
	}
	return settings, nil
}

func (s *SettingService) ReadJSON(spaceID string, key string, target any) error {
	return s.repo.ReadJSON(spaceID, key, target)
}

func (s *SettingService) Upsert(spaceID string, key string, value any) error {
	return s.repo.UpsertJSON(utils.NewID(), spaceID, key, value)
}

func (s *SettingService) Delete(spaceID string, key string) error {
	return s.repo.Delete(spaceID, key)
}

func (s *SettingService) AgentSettings(spaceID string) (AgentSettings, error) {
	settings := AgentSettings{Enabled: false}
	if err := s.repo.ReadJSON(spaceID, agentSettingsKey, &settings); err != nil {
		return AgentSettings{}, err
	}
	return settings, nil
}

func (s *SettingService) UpdateAgentSettings(spaceID string, settings AgentSettings) error {
	return s.repo.UpsertJSON(utils.NewID(), spaceID, agentSettingsKey, settings)
}

func (s *SettingService) IgnoredAgentSuggestions(spaceID string) ([]AgentIgnoredSuggestion, error) {
	ignored := []AgentIgnoredSuggestion{}
	if err := s.repo.ReadJSON(spaceID, agentIgnoredSuggestionsKey, &ignored); err != nil {
		return nil, err
	}
	return ignored, nil
}

func (s *SettingService) IgnoreAgentSuggestion(spaceID string, req IgnoreAgentSuggestionRequest) ([]AgentIgnoredSuggestion, error) {
	ignored, err := s.IgnoredAgentSuggestions(spaceID)
	if err != nil {
		return nil, err
	}
	for i := range ignored {
		if ignored[i].Agent == req.Agent && ignored[i].TargetID == req.TargetID {
			ignored[i].Reason = req.Reason
			ignored[i].IgnoredAt = time.Now().UTC().Format(time.RFC3339)
			return ignored, s.repo.UpsertJSON(utils.NewID(), spaceID, agentIgnoredSuggestionsKey, ignored)
		}
	}
	ignored = append(ignored, AgentIgnoredSuggestion{
		Agent:     req.Agent,
		TargetID:  req.TargetID,
		Reason:    req.Reason,
		IgnoredAt: time.Now().UTC().Format(time.RFC3339),
	})
	return ignored, s.repo.UpsertJSON(utils.NewID(), spaceID, agentIgnoredSuggestionsKey, ignored)
}

func (s *SettingService) ListAuxiliaryItems(spaceID string, kind string) ([]AuxiliaryItem, error) {
	records, err := s.repo.ListAuxiliaryItems(spaceID, kind)
	if err != nil {
		return nil, err
	}
	items := make([]AuxiliaryItem, 0, len(records))
	for _, record := range records {
		items = append(items, AuxiliaryItem{
			ID:        record.ID,
			SpaceID:   record.SpaceID,
			Kind:      record.Kind,
			Title:     record.Title,
			Date:      record.Date,
			Note:      record.Note,
			CityID:    record.CityID,
			CreatedAt: record.CreatedAt,
			UpdatedAt: record.UpdatedAt,
		})
	}
	return items, nil
}

func (s *SettingService) CreateAuxiliaryItem(spaceID string, req CreateAuxiliaryItemRequest) (string, error) {
	itemID := utils.NewID()
	err := s.repo.CreateAuxiliaryItem(repositories.AuxiliaryItemRecord{
		ID:      itemID,
		SpaceID: spaceID,
		Kind:    req.Kind,
		Title:   req.Title,
		Date:    req.Date,
		Note:    req.Note,
		CityID:  req.CityID,
	})
	return itemID, err
}

func (s *SettingService) UpdateAuxiliaryItem(spaceID string, itemID string, req UpdateAuxiliaryItemRequest) error {
	return s.repo.UpdateAuxiliaryItem(itemID, spaceID, map[string]any{
		"title":   req.Title,
		"date":    req.Date,
		"note":    req.Note,
		"city_id": req.CityID,
	})
}

func (s *SettingService) DeleteAuxiliaryItem(spaceID string, itemID string) error {
	return s.repo.DeleteAuxiliaryItem(itemID, spaceID)
}
