package handlers

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

// canOpen 判断时光胶囊是否到达可开启日期（openDate 当天及之后）
func canOpen(openDate string) bool {
	t, err := time.Parse("2006-01-02", openDate)
	if err != nil {
		// 兼容带时间的格式
		t, err = time.Parse(time.RFC3339, openDate)
		if err != nil {
			return false
		}
	}
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	openDay := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	return !today.Before(openDay)
}

// GetTimeCapsules 获取所有时光胶囊（未到期的不返回正文内容）
func GetTimeCapsules(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	cacheKey := fmt.Sprintf("time-capsules:%s:%s", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"timeCapsules": cached})
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, space_id, title, open_date, content, created_by_id, is_opened, created_at
		FROM time_capsules
		WHERE space_id = ?
		ORDER BY open_date ASC
	`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch time capsules")
		return
	}
	defer rows.Close()

	capsules := []models.TimeCapsule{}
	visiblePhotoCapsuleIDs := []string{}
	for rows.Next() {
		var tc models.TimeCapsule
		var isOpenedInt int
		if err := rows.Scan(&tc.ID, &tc.SpaceID, &tc.Title, &tc.OpenDate, &tc.Content,
			&tc.CreatedByID, &isOpenedInt, &tc.CreatedAt); err != nil {
			continue
		}
		tc.IsOpened = isOpenedInt == 1

		unlocked := canOpen(tc.OpenDate)
		isCreator := tc.CreatedByID == userID

		// 未到期且非创建人：隐藏内容和照片
		if !unlocked && !isCreator {
			tc.Content = ""
			tc.Photos = []models.Photo{}
		} else {
			visiblePhotoCapsuleIDs = append(visiblePhotoCapsuleIDs, tc.ID)
		}

		capsules = append(capsules, tc)
	}
	if err := rows.Err(); err != nil {
		utils.Error(c, 500, "Failed to fetch time capsules")
		return
	}

	photosByCapsuleID, err := loadTimeCapsulePhotosByCapsuleIDs(visiblePhotoCapsuleIDs)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch time capsules")
		return
	}
	for i := range capsules {
		if photos, ok := photosByCapsuleID[capsules[i].ID]; ok {
			capsules[i].Photos = photos
		}
	}

	cache.Set(cacheKey, capsules, 2*time.Minute)
	utils.Success(c, gin.H{"timeCapsules": capsules})
}

func clearTimeCapsulesCache(spaceID string) {
	cache.DeletePrefix(fmt.Sprintf("time-capsules:%s:", spaceID))
}

// CreateTimeCapsule 创建一个时光胶囊
func CreateTimeCapsule(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查未开启的时光胶囊数量（限制3个）
	var unopenedCount int
	db.DB.QueryRow(`SELECT COUNT(*) FROM time_capsules
		WHERE space_id = ? AND date(open_date) > date('now')`, spaceID).Scan(&unopenedCount)
	if unopenedCount >= 3 {
		utils.Error(c, 400, "最多只能有3个未开启的时光胶囊")
		return
	}

	var req struct {
		Title    string       `json:"title" binding:"required"`
		OpenDate string       `json:"openDate" binding:"required"`
		Content  string       `json:"content" binding:"required"`
		Photos   []photoInput `json:"photos"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	if err := uploadPhotoInputs(spaceID, "time-capsules", req.Photos); err != nil {
		utils.Error(c, 500, "Failed to upload time capsule photos")
		return
	}

	capsuleID := utils.NewID()
	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to create time capsule")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO time_capsules (id, space_id, title, open_date, content, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?)`,
		capsuleID, spaceID, req.Title, req.OpenDate, req.Content, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create time capsule")
		return
	}

	if err := insertTimeCapsulePhotos(tx, capsuleID, req.Photos); err != nil {
		utils.Error(c, 500, "Failed to save time capsule photos")
		return
	}
	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to create time capsule")
		return
	}

	clearTimeCapsulesCache(spaceID)
	utils.Success(c, gin.H{"id": capsuleID})
}

// OpenTimeCapsule 标记时光胶囊为已开启（仅到期后允许）
func OpenTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var openDate string
	if err := db.DB.QueryRow(`SELECT open_date FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&openDate); err != nil {
		utils.Error(c, 404, "Time capsule not found")
		return
	}

	if !canOpen(openDate) {
		utils.Error(c, 403, "时光胶囊还未到开启日期")
		return
	}

	db.DB.Exec(`UPDATE time_capsules SET is_opened = 1 WHERE id = ? AND space_id = ?`, id, spaceID)
	clearTimeCapsulesCache(spaceID)
	utils.Success(c, gin.H{"ok": true})
}

// DeleteTimeCapsule 删除时光胶囊
func DeleteTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查权限：只有创建者可以删除
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Time capsule not found")
		return
	}
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can delete this capsule")
		return
	}

	photos := collectPhotos(`SELECT key, url FROM time_capsule_photos WHERE time_capsule_id = ?`, id)

	_, err = db.DB.Exec(`DELETE FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete time capsule")
		return
	}
	deletePhotos(photos)

	clearTimeCapsulesCache(spaceID)
	utils.Success(c, gin.H{"ok": true})
}

// UpdateTimeCapsule 编辑时光胶囊
func UpdateTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Title    string        `json:"title"`
		OpenDate string        `json:"openDate"`
		Content  string        `json:"content"`
		Photos   *[]photoInput `json:"photos"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// 检查权限：只有创建者可以编辑
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Time capsule not found")
		return
	}
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can edit this capsule")
		return
	}
	if req.Photos != nil {
		if err := uploadPhotoInputs(spaceID, "time-capsules", *req.Photos); err != nil {
			utils.Error(c, 500, "Failed to upload time capsule photos")
			return
		}
	}

	var oldPhotos []storedPhoto
	if req.Photos != nil {
		oldPhotos = collectPhotos(`SELECT key, url FROM time_capsule_photos WHERE time_capsule_id = ?`, id)
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to update time capsule")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE time_capsules SET title = ?, open_date = ?, content = ? WHERE id = ? AND space_id = ?`,
		req.Title, req.OpenDate, req.Content, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update time capsule")
		return
	}

	if req.Photos != nil {
		if _, err := tx.Exec(`DELETE FROM time_capsule_photos WHERE time_capsule_id = ?`, id); err != nil {
			utils.Error(c, 500, "Failed to update time capsule photos")
			return
		}
		if err := insertTimeCapsulePhotos(tx, id, *req.Photos); err != nil {
			utils.Error(c, 500, "Failed to save time capsule photos")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to update time capsule")
		return
	}
	if req.Photos != nil {
		deleteRemovedPhotos(oldPhotos, *req.Photos)
	}

	clearTimeCapsulesCache(spaceID)
	utils.Success(c, gin.H{"ok": true})
}
