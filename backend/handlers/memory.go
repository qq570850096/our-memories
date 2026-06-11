package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

func GetMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 尝试从缓存获取
	cacheKey := fmt.Sprintf("memories:%s:%s", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"memories": cached})
		return
	}

	memories, err := loadMemoryStore(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	// 缓存30秒
	cache.Set(cacheKey, memories, 30*time.Second)
	utils.Success(c, gin.H{"memories": memories})
}

func clearMemoriesCache(spaceID string) {
	cache.Clear() // 简单起见，清空所有缓存
}

func loadMemoryStore(spaceID string, userID string) (map[string][]gin.H, error) {
	rows, err := db.DB.Query(`
		SELECT id, space_id, city_id, city, city_en, COALESCE(title, ''), date, text,
		       COALESCE(mood, ''), COALESCE(tags, '[]'), visibility, COALESCE(partner_note, ''),
		       COALESCE(place_name, ''), COALESCE(cover_photo_id, ''), COALESCE(created_by_id, ''),
		       created_at, updated_at
		FROM memories
		WHERE space_id = ? AND (visibility = 'both' OR created_by_id = ?)
		ORDER BY date DESC, created_at DESC
	`, spaceID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	memories := map[string][]gin.H{}
	for rows.Next() {
		var m models.Memory
		var tagsJSON string
		err := rows.Scan(&m.ID, &m.SpaceID, &m.CityID, &m.City, &m.CityEn, &m.Title, &m.Date, &m.Text,
			&m.Mood, &tagsJSON, &m.Visibility, &m.PartnerNote, &m.PlaceName, &m.CoverPhotoID, &m.CreatedByID,
			&m.CreatedAt, &m.UpdatedAt)
		if err != nil {
			continue
		}
		json.Unmarshal([]byte(tagsJSON), &m.Tags)
		if m.Tags == nil {
			m.Tags = []string{}
		}

		photoRows, _ := db.DB.Query(`SELECT id, memory_id, key, url, COALESCE(mime_type, ''),
			COALESCE(width, 0), COALESCE(height, 0), sort_order, created_at FROM memory_photos WHERE memory_id = ? ORDER BY sort_order`,
			m.ID)
		m.Photos = []models.Photo{}
		for photoRows.Next() {
			var p models.Photo
			photoRows.Scan(&p.ID, &p.MemoryID, &p.Key, &p.URL, &p.MimeType, &p.Width, &p.Height, &p.SortOrder, &p.CreatedAt)
			m.Photos = append(m.Photos, p)
		}
		photoRows.Close()

		photoURLs := []string{}
		photoItems := []models.Photo{}
		for _, photo := range m.Photos {
			if photo.URL == "" {
				continue
			}
			photoURLs = append(photoURLs, photo.URL)
			photoItems = append(photoItems, photo)
		}
		image := ""
		if len(photoURLs) > 0 {
			image = photoURLs[0]
		}

		memories[m.CityID] = append(memories[m.CityID], gin.H{
			"id":          m.ID,
			"cityId":      m.CityID,
			"city":        m.City,
			"cityEn":      m.CityEn,
			"title":       m.Title,
			"date":        m.Date,
			"text":        m.Text,
			"mood":        m.Mood,
			"tags":        m.Tags,
			"visibility":  m.Visibility,
			"partnerNote": m.PartnerNote,
			"placeName":   m.PlaceName,
			"image":       image,
			"photos":      photoURLs,
			"photoItems":  photoItems,
			"createdById": m.CreatedByID,
			"createdAt":   m.CreatedAt,
			"updatedAt":   m.UpdatedAt,
		})
	}

	return memories, nil
}

func CreateMemory(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		CityID      string   `json:"cityId" binding:"required"`
		City        string   `json:"city" binding:"required"`
		CityEn      string   `json:"cityEn" binding:"required"`
		Title       string   `json:"title"`
		Date        string   `json:"date" binding:"required"`
		Text        string   `json:"text" binding:"required"`
		Mood        string   `json:"mood"`
		Tags        []string `json:"tags"`
		Visibility  string   `json:"visibility"`
		PartnerNote string   `json:"partnerNote"`
		PlaceName   string   `json:"placeName"`
		Photos      []struct {
			Key      string `json:"key"`
			URL      string `json:"url"`
			MimeType string `json:"mimeType"`
			Width    int    `json:"width"`
			Height   int    `json:"height"`
		} `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	memoryID := utils.NewID()
	tagsJSON, _ := json.Marshal(req.Tags)
	if req.Visibility == "" {
		req.Visibility = "both"
	}

	_, err := db.DB.Exec(`INSERT INTO memories (id, space_id, city_id, city, city_en, title, date, text, mood, tags, visibility, partner_note, place_name, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		memoryID, spaceID, req.CityID, req.City, req.CityEn, req.Title, req.Date, req.Text, req.Mood, tagsJSON, req.Visibility, req.PartnerNote, req.PlaceName, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create memory")
		return
	}

	for i, photo := range req.Photos {
		photoID := utils.NewID()
		db.DB.Exec(`INSERT INTO memory_photos (id, memory_id, key, url, mime_type, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			photoID, memoryID, photo.Key, photo.URL, photo.MimeType, photo.Width, photo.Height, i)
	}

	clearMemoriesCache(spaceID)
	memories, err := loadMemoryStore(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	utils.Success(c, gin.H{"id": memoryID, "memories": memories})
}

func UpdateMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var req struct {
		Title       string   `json:"title"`
		Date        string   `json:"date"`
		Text        string   `json:"text"`
		Mood        string   `json:"mood"`
		Tags        []string `json:"tags"`
		Visibility  string   `json:"visibility"`
		PartnerNote string   `json:"partnerNote"`
		PlaceName   string   `json:"placeName"`
		CoverImage  string   `json:"coverImage"`
		Photos      []struct {
			Key      string `json:"key"`
			URL      string `json:"url"`
			MimeType string `json:"mimeType"`
			Width    int    `json:"width"`
			Height   int    `json:"height"`
		} `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if req.Date != "" || req.Text != "" {
		tagsJSON, _ := json.Marshal(req.Tags)
		if req.Visibility == "" {
			req.Visibility = "both"
		}

		_, err := db.DB.Exec(`UPDATE memories SET title = ?, date = ?, text = ?, mood = ?, tags = ?, visibility = ?, partner_note = ?, place_name = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND space_id = ?`,
			req.Title, req.Date, req.Text, req.Mood, tagsJSON, req.Visibility, req.PartnerNote, req.PlaceName, id, spaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to update memory")
			return
		}
	}

	if len(req.Photos) > 0 || req.CoverImage != "" {
		_, _ = db.DB.Exec(`DELETE FROM memory_photos WHERE memory_id = ?`, id)
		photos := req.Photos
		if len(photos) == 0 && req.CoverImage != "" {
			photos = append(photos, struct {
				Key      string `json:"key"`
				URL      string `json:"url"`
				MimeType string `json:"mimeType"`
				Width    int    `json:"width"`
				Height   int    `json:"height"`
			}{URL: req.CoverImage, MimeType: "image/jpeg"})
		}
		for i, photo := range photos {
			photoID := utils.NewID()
			db.DB.Exec(`INSERT INTO memory_photos (id, memory_id, key, url, mime_type, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				photoID, id, photo.Key, photo.URL, photo.MimeType, photo.Width, photo.Height, i)
		}
	}

	clearMemoriesCache(spaceID)
	memories, err := loadMemoryStore(spaceID, c.GetString("userID"))
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func DeleteMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	_, err := db.DB.Exec(`DELETE FROM memories WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete memory")
		return
	}

	clearMemoriesCache(spaceID)
	memories, err := loadMemoryStore(spaceID, c.GetString("userID"))
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}
