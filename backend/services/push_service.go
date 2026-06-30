package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"our-memories-backend/config"
	"our-memories-backend/repositories"
)

var ErrPushNotConfigured = errors.New("jpush is not configured")
var ErrNoPushDevices = errors.New("no push devices")

type RegisterPushDeviceRequest struct {
	Platform       string `json:"platform" binding:"required"`
	RegistrationID string `json:"registrationId" binding:"required"`
	DeviceModel    string `json:"deviceModel"`
	AppVersion     string `json:"appVersion"`
}

type TestPushRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type PushService struct {
	repo       *repositories.PushRepository
	httpClient *http.Client
}

func NewPushService(repo *repositories.PushRepository) *PushService {
	return &PushService{
		repo: repo,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *PushService) RegisterDevice(spaceID string, userID string, req RegisterPushDeviceRequest) error {
	registrationID := strings.TrimSpace(req.RegistrationID)
	if registrationID == "" {
		return errors.New("registration id is required")
	}

	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		platform = "android"
	}

	return s.repo.UpsertDevice(repositories.PushDeviceRecord{
		SpaceID:        spaceID,
		UserID:         userID,
		Platform:       platform,
		RegistrationID: registrationID,
		DeviceModel:    strings.TrimSpace(req.DeviceModel),
		AppVersion:     strings.TrimSpace(req.AppVersion),
	})
}

func (s *PushService) SendTest(spaceID string, req TestPushRequest) error {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "我们的回忆"
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		content = "极光推送测试成功。"
	}

	registrationIDs, err := s.repo.RegistrationIDsForSpace(spaceID)
	if err != nil {
		return err
	}
	if len(registrationIDs) == 0 {
		return ErrNoPushDevices
	}

	return s.pushToRegistrationIDs(registrationIDs, title, content)
}

func (s *PushService) SendToSpaceExcept(spaceID string, actorID string, title string, content string) error {
	registrationIDs, err := s.repo.RegistrationIDsForSpaceExceptUser(spaceID, actorID)
	if err != nil {
		return err
	}
	if len(registrationIDs) == 0 {
		return ErrNoPushDevices
	}

	return s.pushToRegistrationIDs(registrationIDs, title, content)
}

func (s *PushService) pushToRegistrationIDs(registrationIDs []string, title string, content string) error {
	cfg := config.Get()
	if cfg.JPushAppKey == "" || cfg.JPushMasterSecret == "" {
		return ErrPushNotConfigured
	}

	payload := map[string]any{
		"platform": "android",
		"audience": map[string]any{
			"registration_id": registrationIDs,
		},
		"notification": map[string]any{
			"android": map[string]any{
				"alert": content,
				"title": title,
			},
		},
		"options": map[string]any{
			"apns_production": false,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequest(http.MethodPost, "https://api.jpush.cn/v3/push", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(cfg.JPushAppKey+":"+cfg.JPushMasterSecret)))

	response, err := s.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var payload map[string]any
		_ = json.NewDecoder(response.Body).Decode(&payload)
		return fmt.Errorf("jpush returned %s: %v", response.Status, payload)
	}

	return nil
}
