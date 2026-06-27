package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

var errCoverPhotoNotFound = errors.New("cover photo not found")

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
	cache.DeletePrefix(fmt.Sprintf("memories:%s:", spaceID))
}

func loadMemoryStore(spaceID string, userID string) (map[string][]gin.H, error) {
	rows, err := db.DB.Query(`
		SELECT id, space_id, city_id, city, city_en, COALESCE(title, ''), date, text,
		       COALESCE(mood, ''), COALESCE(tags, '[]'), visibility, COALESCE(partner_note, ''),
		       COALESCE(partner_note_author_id, ''), COALESCE(place_name, ''),
		       COALESCE(cover_photo_id, ''), COALESCE(created_by_id, ''), created_at, updated_at
		FROM memories
		WHERE space_id = ? AND (visibility = 'both' OR created_by_id = ?)
		ORDER BY date DESC, created_at DESC
	`, spaceID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	memoryRows := []models.Memory{}
	for rows.Next() {
		var m models.Memory
		var tagsJSON string
		err := rows.Scan(&m.ID, &m.SpaceID, &m.CityID, &m.City, &m.CityEn, &m.Title, &m.Date, &m.Text,
			&m.Mood, &tagsJSON, &m.Visibility, &m.PartnerNote, &m.PartnerNoteAuthorID, &m.PlaceName,
			&m.CoverPhotoID, &m.CreatedByID, &m.CreatedAt, &m.UpdatedAt)
		if err != nil {
			continue
		}
		json.Unmarshal([]byte(tagsJSON), &m.Tags)
		if m.Tags == nil {
			m.Tags = []string{}
		}

		memoryRows = append(memoryRows, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	memoryIDs := make([]string, 0, len(memoryRows))
	for _, m := range memoryRows {
		memoryIDs = append(memoryIDs, m.ID)
	}
	photosByMemoryID, err := loadMemoryPhotosByMemoryIDs(memoryIDs)
	if err != nil {
		return nil, err
	}

	memories := map[string][]gin.H{}
	for _, m := range memoryRows {
		m.Photos = photosByMemoryID[m.ID]

		photoURLs := []string{}
		for _, photo := range m.Photos {
			if photo.URL == "" {
				continue
			}
			photoURLs = append(photoURLs, photo.URL)
		}
		image := ""
		if m.CoverPhotoID != "" {
			for _, photo := range m.Photos {
				if photo.ID == m.CoverPhotoID && photo.URL != "" {
					image = photo.URL
					break
				}
			}
		}
		if len(photoURLs) > 0 {
			if image == "" {
				image = photoURLs[0]
			}
		}

		memories[m.CityID] = append(memories[m.CityID], gin.H{
			"id":                  m.ID,
			"cityId":              m.CityID,
			"city":                m.City,
			"cityEn":              m.CityEn,
			"title":               m.Title,
			"date":                m.Date,
			"text":                m.Text,
			"mood":                m.Mood,
			"tags":                m.Tags,
			"visibility":          m.Visibility,
			"partnerNote":         m.PartnerNote,
			"partnerNoteAuthorId": m.PartnerNoteAuthorID,
			"placeName":           m.PlaceName,
			"coverPhotoId":        m.CoverPhotoID,
			"image":               image,
			"photos":              photoURLs,
			"createdById":         m.CreatedByID,
			"createdAt":           m.CreatedAt,
			"updatedAt":           m.UpdatedAt,
		})
	}

	return memories, nil
}

func CreateMemory(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		CityID      string       `json:"cityId" binding:"required"`
		City        string       `json:"city" binding:"required"`
		CityEn      string       `json:"cityEn" binding:"required"`
		Title       string       `json:"title"`
		Date        string       `json:"date" binding:"required"`
		Text        string       `json:"text" binding:"required"`
		Mood        string       `json:"mood"`
		Tags        []string     `json:"tags"`
		Visibility  string       `json:"visibility"`
		PartnerNote string       `json:"partnerNote"`
		PlaceName   string       `json:"placeName"`
		Photos      []photoInput `json:"photos"`
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
	if err := uploadPhotoInputs(spaceID, "memories", req.Photos); err != nil {
		utils.Error(c, 500, "Failed to upload memory photos")
		return
	}

	partnerNote := strings.TrimSpace(req.PartnerNote)
	partnerNoteAuthorID := ""
	if partnerNote != "" {
		partnerNoteAuthorID = userID
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to create memory")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO memories (id, space_id, city_id, city, city_en, title, date, text, mood, tags, visibility, partner_note, partner_note_author_id, place_name, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		memoryID, spaceID, req.CityID, req.City, req.CityEn, req.Title, req.Date, req.Text, req.Mood, tagsJSON, req.Visibility, partnerNote, partnerNoteAuthorID, req.PlaceName, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create memory")
		return
	}

	if err := insertMemoryPhotos(tx, memoryID, req.Photos); err != nil {
		utils.Error(c, 500, "Failed to save memory photos")
		return
	}
	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to create memory")
		return
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
	userID := c.GetString("userID")

	var req struct {
		Title       string        `json:"title"`
		Date        string        `json:"date"`
		Text        string        `json:"text"`
		Mood        string        `json:"mood"`
		Tags        []string      `json:"tags"`
		Visibility  string        `json:"visibility"`
		PartnerNote *string       `json:"partnerNote"`
		PlaceName   string        `json:"placeName"`
		CoverImage  string        `json:"coverImage"`
		Photos      *[]photoInput `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// 检查回忆是否存在并获取创建者ID
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM memories WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Memory not found")
		return
	}

	// 判断是否为创建者
	isCreator := createdByID == userID

	// 非创建者只能更新补充回忆，前端会发送最小 payload：{ partnerNote }。
	if !isCreator {
		if req.PartnerNote == nil {
			utils.Error(c, 403, "Only supplement updates are allowed")
			return
		}

		partnerNote := strings.TrimSpace(*req.PartnerNote)
		partnerNoteAuthorID := userID
		if partnerNote == "" {
			partnerNoteAuthorID = ""
		}

		_, err := db.DB.Exec(`UPDATE memories SET partner_note = ?, partner_note_author_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
			partnerNote, partnerNoteAuthorID, id, spaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to update partner note")
			return
		}
	} else if req.Date != "" || req.Text != "" {
		// 创建者可以更新核心字段，但不能覆盖另一位成员的补充回忆。
		tagsJSON, _ := json.Marshal(req.Tags)
		if req.Visibility == "" {
			req.Visibility = "both"
		}

		_, err := db.DB.Exec(`UPDATE memories SET title = ?, date = ?, text = ?, mood = ?, tags = ?, visibility = ?, place_name = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND space_id = ?`,
			req.Title, req.Date, req.Text, req.Mood, tagsJSON, req.Visibility, req.PlaceName, id, spaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to update memory")
			return
		}
	}

	// 只有创建者可以更新照片。coverImage 只更新封面指针，不替换照片集。
	if isCreator && req.Photos != nil {
		oldPhotos := collectPhotos(`SELECT key, url FROM memory_photos WHERE memory_id = ?`, id)
		oldCoverImage := currentMemoryCoverImage(id)
		photos := *req.Photos
		if err := uploadPhotoInputs(spaceID, "memories", photos); err != nil {
			utils.Error(c, 500, "Failed to upload memory photos")
			return
		}

		tx, err := db.DB.Begin()
		if err != nil {
			utils.Error(c, 500, "Failed to update memory photos")
			return
		}
		committed := false
		defer func() {
			if !committed {
				tx.Rollback()
			}
		}()

		if _, err := tx.Exec(`DELETE FROM memory_photos WHERE memory_id = ?`, id); err != nil {
			utils.Error(c, 500, "Failed to update memory photos")
			return
		}
		if err := insertMemoryPhotos(tx, id, photos); err != nil {
			utils.Error(c, 500, "Failed to save memory photos")
			return
		}
		nextCoverImage := req.CoverImage
		if nextCoverImage == "" {
			nextCoverImage = oldCoverImage
		}
		if err := setMemoryCoverPhotoTx(tx, id, nextCoverImage); err != nil {
			if errors.Is(err, errCoverPhotoNotFound) {
				if req.CoverImage != "" {
					utils.Error(c, 400, "Cover photo not found")
					return
				}
				if err := setMemoryCoverPhotoTx(tx, id, ""); err != nil {
					utils.Error(c, 500, "Failed to update memory cover")
					return
				}
			} else {
				utils.Error(c, 500, "Failed to update memory cover")
				return
			}
		}
		if err := tx.Commit(); err != nil {
			utils.Error(c, 500, "Failed to update memory photos")
			return
		}
		committed = true
		if err := deleteRemovedPhotos(spaceID, oldPhotos, photos); err != nil {
			clearMemoriesCache(spaceID)
			utils.Error(c, 500, "Failed to delete removed memory photos")
			return
		}
	} else if isCreator && req.CoverImage != "" {
		if err := setMemoryCoverPhoto(spaceID, id, req.CoverImage); err != nil {
			if errors.Is(err, errCoverPhotoNotFound) {
				utils.Error(c, 400, "Cover photo not found")
				return
			}
			utils.Error(c, 500, "Failed to update memory cover")
			return
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

func currentMemoryCoverImage(memoryID string) string {
	var url string
	err := db.DB.QueryRow(`
		SELECT p.url
		FROM memory_photos p
		JOIN memories m ON m.cover_photo_id = p.id
		WHERE m.id = ? AND p.memory_id = ?
	`, memoryID, memoryID).Scan(&url)
	if err != nil {
		return ""
	}
	return url
}

func setMemoryCoverPhoto(spaceID, memoryID, coverImage string) error {
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := setMemoryCoverPhotoTx(tx, memoryID, coverImage); err != nil {
		return err
	}

	result, err := tx.Exec(`UPDATE memories SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`, memoryID, spaceID)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return sql.ErrNoRows
	}

	return tx.Commit()
}

func setMemoryCoverPhotoTx(tx *sql.Tx, memoryID, coverImage string) error {
	if coverImage == "" {
		_, err := tx.Exec(`UPDATE memories SET cover_photo_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, memoryID)
		return err
	}

	coverPhotoID, err := findMemoryPhotoID(tx, memoryID, coverImage)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE memories SET cover_photo_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, coverPhotoID, memoryID)
	return err
}

func findMemoryPhotoID(tx *sql.Tx, memoryID, coverImage string) (string, error) {
	key := storage.KeyFromURL(coverImage)
	var photoID string
	var err error
	if key != "" {
		err = tx.QueryRow(`
			SELECT id
			FROM memory_photos
			WHERE memory_id = ? AND (url = ? OR key = ?)
			ORDER BY CASE WHEN url = ? THEN 0 ELSE 1 END
			LIMIT 1
		`, memoryID, coverImage, key, coverImage).Scan(&photoID)
	} else {
		err = tx.QueryRow(`
			SELECT id
			FROM memory_photos
			WHERE memory_id = ? AND url = ?
			LIMIT 1
		`, memoryID, coverImage).Scan(&photoID)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return "", errCoverPhotoNotFound
	}
	return photoID, err
}

func DeleteMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查回忆是否存在并获取创建者ID
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM memories WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Memory not found")
		return
	}

	// 只有创建者可以删除
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can delete this memory")
		return
	}

	// 删除前先抓取并清理图片对象（级联会删掉照片行）。
	photos := collectPhotos(`SELECT key, url FROM memory_photos WHERE memory_id = ?`, id)
	if err := deletePhotos(spaceID, photos); err != nil {
		utils.Error(c, 500, "Failed to delete memory photos")
		return
	}

	_, err = db.DB.Exec(`DELETE FROM memories WHERE id = ? AND space_id = ?`, id, spaceID)
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
