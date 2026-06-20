package handlers

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

func GetSettings(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	rows, err := db.DB.Query(`SELECT key, value FROM settings WHERE space_id = ?`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch settings")
		return
	}
	defer rows.Close()

	settings := make(map[string]interface{})
	for rows.Next() {
		var key, valueJSON string
		if err := rows.Scan(&key, &valueJSON); err != nil {
			continue
		}
		var value interface{}
		json.Unmarshal([]byte(valueJSON), &value)
		settings[key] = value
	}

	// 从环境变量读取纪念日期（如果没有数据库设置）
	if _, hasAnniversaryDate := settings["anniversaryDate"]; !hasAnniversaryDate {
		if envDate := os.Getenv("DEFAULT_ANNIVERSARY_DATE"); envDate != "" {
			settings["anniversaryDate"] = envDate
		}
	}
	if _, hasAnniversaryLabel := settings["anniversaryLabel"]; !hasAnniversaryLabel {
		if envLabel := os.Getenv("DEFAULT_ANNIVERSARY_LABEL"); envLabel != "" {
			settings["anniversaryLabel"] = envLabel
		}
	}

	utils.Success(c, settings)
}

func UpdateSetting(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	key := c.Param("key")

	var req map[string]interface{}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	value, ok := req["value"]
	if !ok {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// coupleLogo 是图片设置：记录旧值，写入后清理被替换/删除的 OSS 对象。
	previousLogo := ""
	if key == "coupleLogo" {
		_ = readSettingJSON(spaceID, "coupleLogo", &previousLogo)
	}

	if value == nil {
		_, err := db.DB.Exec(`DELETE FROM settings WHERE space_id = ? AND key = ?`, spaceID, key)
		if err != nil {
			utils.Error(c, 500, "Failed to update setting")
			return
		}
		if previousLogo != "" {
			storage.DeleteObjectByURL(previousLogo)
		}
		utils.Success(c, gin.H{"ok": true})
		return
	}
	if key == "coupleLogo" {
		if image, ok := value.(string); ok && strings.HasPrefix(image, "data:image/") {
			url, err := uploadDataURL(spaceID, "settings", image)
			if err != nil {
				utils.Error(c, 500, "Failed to upload setting image")
				return
			}
			value = url
		}
	}

	valueJSON, _ := json.Marshal(value)
	settingID := utils.NewID()

	_, err := db.DB.Exec(`INSERT INTO settings (id, space_id, key, value) VALUES (?, ?, ?, ?)
		ON CONFLICT(space_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
		settingID, spaceID, key, valueJSON)
	if err != nil {
		utils.Error(c, 500, "Failed to update setting")
		return
	}

	if newLogo, ok := value.(string); ok && previousLogo != "" && previousLogo != newLogo {
		storage.DeleteObjectByURL(previousLogo)
	}

	utils.Success(c, gin.H{"ok": true})
}

func GetAuxiliaryItems(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	kind := c.Query("kind")

	query := `SELECT id, space_id, kind, title, COALESCE(date, ''), note, COALESCE(city_id, ''), created_at, updated_at
		FROM auxiliary_items WHERE space_id = ?`
	args := []interface{}{spaceID}

	if kind != "" {
		query += ` AND kind = ?`
		args = append(args, kind)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch auxiliary items")
		return
	}
	defer rows.Close()

	items := []map[string]interface{}{}
	for rows.Next() {
		var id, spaceID, kind, title, date, note, cityID, createdAt, updatedAt string
		rows.Scan(&id, &spaceID, &kind, &title, &date, &note, &cityID, &createdAt, &updatedAt)
		items = append(items, map[string]interface{}{
			"id":        id,
			"spaceId":   spaceID,
			"kind":      kind,
			"title":     title,
			"date":      date,
			"note":      note,
			"cityId":    cityID,
			"createdAt": createdAt,
			"updatedAt": updatedAt,
		})
	}

	utils.Success(c, gin.H{"items": items})
}

func CreateAuxiliaryItem(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req struct {
		Kind   string `json:"kind" binding:"required"`
		Title  string `json:"title" binding:"required"`
		Date   string `json:"date"`
		Note   string `json:"note"`
		CityID string `json:"cityId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	itemID := utils.NewID()
	_, err := db.DB.Exec(`INSERT INTO auxiliary_items (id, space_id, kind, title, date, note, city_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		itemID, spaceID, req.Kind, req.Title, req.Date, req.Note, req.CityID)
	if err != nil {
		utils.Error(c, 500, "Failed to create item")
		return
	}

	utils.Success(c, gin.H{"id": itemID})
}

func UpdateAuxiliaryItem(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var req struct {
		Kind   string `json:"kind"`
		Title  string `json:"title"`
		Date   string `json:"date"`
		Note   string `json:"note"`
		CityID string `json:"cityId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	_, err := db.DB.Exec(`UPDATE auxiliary_items SET title = ?, date = ?, note = ?, city_id = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND space_id = ?`,
		req.Title, req.Date, req.Note, req.CityID, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update item")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func DeleteAuxiliaryItem(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	_, err := db.DB.Exec(`DELETE FROM auxiliary_items WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete item")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}
