package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

const (
	cityAssetsSettingKey  = "cityAssets"
	loginPhotosSettingKey = "loginPhotoStore"
	tripStoreSettingKey   = "tripStore"
)

type loginPhotoText struct {
	City  string `json:"city,omitempty"`
	Label string `json:"label,omitempty"`
}

type loginPhotoStore struct {
	Photos map[string]string         `json:"photos"`
	Texts  map[string]loginPhotoText `json:"texts"`
}

type tripItem struct {
	ID        string                 `json:"id"`
	Status    string                 `json:"status,omitempty"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt string                 `json:"createdAt,omitempty"`
	UpdatedAt string                 `json:"updatedAt,omitempty"`
}

type tripStore struct {
	Guides []tripItem `json:"guides"`
	Drafts []tripItem `json:"drafts"`
}

func readSettingJSON(spaceID string, key string, target interface{}) error {
	var valueJSON string
	err := db.DB.QueryRow(`SELECT value FROM settings WHERE space_id = ? AND key = ?`, spaceID, key).Scan(&valueJSON)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(valueJSON), target)
}

func writeSettingJSON(spaceID string, key string, value interface{}) error {
	valueJSON, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = db.DB.Exec(`INSERT INTO settings (id, space_id, key, value) VALUES (?, ?, ?, ?)
		ON CONFLICT(space_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
		utils.NewID(), spaceID, key, valueJSON)
	return err
}

func readCityAssets(spaceID string) (map[string]string, error) {
	assets := map[string]string{}
	err := readSettingJSON(spaceID, cityAssetsSettingKey, &assets)
	return assets, err
}

func GetCityAssets(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	cacheKey := fmt.Sprintf("city-assets:%s", spaceID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"assets": cached})
		return
	}

	assets, err := readCityAssets(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch city assets")
		return
	}
	cache.Set(cacheKey, assets, 5*time.Minute)
	utils.Success(c, gin.H{"assets": assets})
}

func clearCityAssetsCache(spaceID string) {
	cache.Delete(fmt.Sprintf("city-assets:%s", spaceID))
}

func UpdateCityAsset(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		CityID string `json:"cityId" binding:"required"`
		Image  string `json:"image" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	assets, err := readCityAssets(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update city asset")
		return
	}
	previous := assets[req.CityID]
	image, err := uploadDataURL(spaceID, "city-assets", req.Image)
	if err != nil {
		utils.Error(c, 500, "Failed to upload city asset")
		return
	}
	assets[req.CityID] = image
	if err := writeSettingJSON(spaceID, cityAssetsSettingKey, assets); err != nil {
		utils.Error(c, 500, "Failed to update city asset")
		return
	}
	clearCityAssetsCache(spaceID)
	if previous != "" && previous != image {
		storage.DeleteObjectByURL(previous)
	}
	utils.Success(c, gin.H{"assets": assets})
}

func DeleteCityAsset(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		CityID string `json:"cityId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	assets, err := readCityAssets(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete city asset")
		return
	}
	previous := assets[req.CityID]
	delete(assets, req.CityID)
	if err := writeSettingJSON(spaceID, cityAssetsSettingKey, assets); err != nil {
		utils.Error(c, 500, "Failed to delete city asset")
		return
	}
	clearCityAssetsCache(spaceID)
	if previous != "" {
		storage.DeleteObjectByURL(previous)
	}
	utils.Success(c, gin.H{"assets": assets})
}

func readLoginStore(spaceID string) (loginPhotoStore, error) {
	store := loginPhotoStore{Photos: map[string]string{}, Texts: map[string]loginPhotoText{}}
	err := readSettingJSON(spaceID, loginPhotosSettingKey, &store)
	if store.Photos == nil {
		store.Photos = map[string]string{}
	}
	if store.Texts == nil {
		store.Texts = map[string]loginPhotoText{}
	}
	return store, err
}

func GetLoginPhotos(c *gin.Context) {
	store, err := readLoginStore(c.GetString("spaceID"))
	if err != nil {
		utils.Error(c, 500, "Failed to fetch login photos")
		return
	}
	utils.Success(c, store)
}

func UpdateLoginPhoto(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		SlotID string          `json:"slotId" binding:"required"`
		Image  string          `json:"image"`
		Text   *loginPhotoText `json:"text"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	store, err := readLoginStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update login photo")
		return
	}
	previousPhoto := ""
	if req.Image != "" {
		previousPhoto = store.Photos[req.SlotID]
		image, err := uploadDataURL(spaceID, "login-photos", req.Image)
		if err != nil {
			utils.Error(c, 500, "Failed to upload login photo")
			return
		}
		store.Photos[req.SlotID] = image
	}
	if req.Text != nil {
		store.Texts[req.SlotID] = *req.Text
	}
	if err := writeSettingJSON(spaceID, loginPhotosSettingKey, store); err != nil {
		utils.Error(c, 500, "Failed to update login photo")
		return
	}
	if previousPhoto != "" && previousPhoto != store.Photos[req.SlotID] {
		storage.DeleteObjectByURL(previousPhoto)
	}
	utils.Success(c, store)
}

func PatchLoginPhotos(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		Texts map[string]loginPhotoText `json:"texts"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	store, err := readLoginStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update login photos")
		return
	}
	if req.Texts != nil {
		store.Texts = req.Texts
	}
	if err := writeSettingJSON(spaceID, loginPhotosSettingKey, store); err != nil {
		utils.Error(c, 500, "Failed to update login photos")
		return
	}
	utils.Success(c, store)
}

func DeleteLoginPhoto(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		SlotID string `json:"slotId" binding:"required"`
		Kind   string `json:"kind"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	store, err := readLoginStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete login photo")
		return
	}
	previousPhoto := ""
	if req.Kind == "text" {
		delete(store.Texts, req.SlotID)
	} else {
		previousPhoto = store.Photos[req.SlotID]
		delete(store.Photos, req.SlotID)
	}
	if err := writeSettingJSON(spaceID, loginPhotosSettingKey, store); err != nil {
		utils.Error(c, 500, "Failed to delete login photo")
		return
	}
	if previousPhoto != "" {
		storage.DeleteObjectByURL(previousPhoto)
	}
	utils.Success(c, store)
}

func readTripStore(spaceID string) (tripStore, error) {
	store := tripStore{Guides: []tripItem{}, Drafts: []tripItem{}}
	err := readSettingJSON(spaceID, tripStoreSettingKey, &store)
	if store.Guides == nil {
		store.Guides = []tripItem{}
	}
	if store.Drafts == nil {
		store.Drafts = []tripItem{}
	}
	return store, err
}

func writeTripStore(spaceID string, store tripStore) error {
	return writeSettingJSON(spaceID, tripStoreSettingKey, store)
}

func GetTripGuides(c *gin.Context) {
	store, err := readTripStore(c.GetString("spaceID"))
	if err != nil {
		utils.Error(c, 500, "Failed to fetch trip guides")
		return
	}
	utils.Success(c, gin.H{"guides": store.Guides, "drafts": store.Drafts})
}

func CreateTripGuide(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	var req struct {
		Payload map[string]interface{} `json:"payload" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	store, err := readTripStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to create trip guide")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	guide := tripItem{ID: utils.NewID(), Payload: req.Payload, CreatedAt: now, UpdatedAt: now}
	store.Guides = append([]tripItem{guide}, store.Guides...)
	if err := writeTripStore(spaceID, store); err != nil {
		utils.Error(c, 500, "Failed to create trip guide")
		return
	}
	utils.Success(c, gin.H{"guide": guide})
}

func UpdateTripGuide(c *gin.Context) {
	updateTripItem(c, false)
}

func UpdateTripDraft(c *gin.Context) {
	updateTripItem(c, true)
}

func updateTripItem(c *gin.Context, draft bool) {
	spaceID := c.GetString("spaceID")
	id := c.Param("id")
	var req struct {
		Payload map[string]interface{} `json:"payload" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	store, err := readTripStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update trip item")
		return
	}
	items := store.Guides
	if draft {
		items = store.Drafts
	}
	for index := range items {
		if items[index].ID == id {
			items[index].Payload = req.Payload
			items[index].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			if draft {
				store.Drafts = items
				if err := writeTripStore(spaceID, store); err != nil {
					utils.Error(c, 500, "Failed to update trip draft")
					return
				}
				utils.Success(c, gin.H{"draft": items[index]})
				return
			}
			store.Guides = items
			if err := writeTripStore(spaceID, store); err != nil {
				utils.Error(c, 500, "Failed to update trip guide")
				return
			}
			utils.Success(c, gin.H{"guide": items[index]})
			return
		}
	}
	utils.Error(c, 404, "Trip item not found")
}

func DeleteTripGuide(c *gin.Context) {
	deleteTripItem(c, false)
}

func DeleteTripDraft(c *gin.Context) {
	deleteTripItem(c, true)
}

func deleteTripItem(c *gin.Context, draft bool) {
	spaceID := c.GetString("spaceID")
	id := c.Param("id")
	store, err := readTripStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete trip item")
		return
	}
	if draft {
		store.Drafts = filterTripItems(store.Drafts, id)
	} else {
		store.Guides = filterTripItems(store.Guides, id)
	}
	if err := writeTripStore(spaceID, store); err != nil {
		utils.Error(c, 500, "Failed to delete trip item")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func filterTripItems(items []tripItem, id string) []tripItem {
	next := make([]tripItem, 0, len(items))
	for _, item := range items {
		if item.ID != id {
			next = append(next, item)
		}
	}
	return next
}

func AcceptTripDraft(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	id := c.Param("id")
	store, err := readTripStore(spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to accept trip draft")
		return
	}
	for index, draft := range store.Drafts {
		if draft.ID == id {
			now := time.Now().UTC().Format(time.RFC3339)
			guide := tripItem{ID: utils.NewID(), Payload: draft.Payload, CreatedAt: now, UpdatedAt: now}
			store.Guides = append([]tripItem{guide}, store.Guides...)
			store.Drafts = append(store.Drafts[:index], store.Drafts[index+1:]...)
			if err := writeTripStore(spaceID, store); err != nil {
				utils.Error(c, 500, "Failed to accept trip draft")
				return
			}
			utils.Success(c, gin.H{"ok": true, "guide": guide})
			return
		}
	}
	utils.Error(c, 404, "Trip draft not found")
}

func PolishMemory(c *gin.Context) {
	var req struct {
		SourceText string `json:"sourceText"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// 获取DeepSeek API配置
	apiKey := os.Getenv("DEEPSEEK_API_KEY")
	apiURL := os.Getenv("DEEPSEEK_API_URL")
	if apiURL == "" {
		apiURL = "https://api.deepseek.com/v1/chat/completions"
	}

	// 如果没有配置API Key，直接返回原文
	if apiKey == "" {
		utils.Success(c, gin.H{"polishedText": req.SourceText})
		return
	}

	// 构建DeepSeek请求
	payload := map[string]interface{}{
		"model": "deepseek-chat",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "你是一个文字润色助手。请优化用户提供的文字，使其更加生动、准确、有感染力。保持原意，只改进表达。直接返回润色后的文字，不要添加任何解释。",
			},
			{
				"role":    "user",
				"content": req.SourceText,
			},
		},
		"temperature": 0.7,
		"max_tokens":  500,
	}

	jsonData, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		utils.Error(c, 500, "Failed to create request")
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		utils.Error(c, 500, "Failed to call AI service")
		return
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Choices) == 0 {
		utils.Error(c, 500, "Failed to parse AI response")
		return
	}

	polishedText := strings.TrimSpace(result.Choices[0].Message.Content)
	utils.Success(c, gin.H{"polishedText": polishedText})
}

func CreateActivationCode(c *gin.Context) {
	code := fmt.Sprintf("MOU-%s", utils.NewID())
	utils.Success(c, gin.H{"activationCode": gin.H{"code": code}})
}
