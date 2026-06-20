package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

// GetWhispers 获取所有悄悄话及其回复
func GetWhispers(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	rows, err := db.DB.Query(`
		SELECT id, space_id, title, created_by_id, created_at, updated_at
		FROM whispers
		WHERE space_id = ?
		ORDER BY updated_at DESC
	`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch whispers")
		return
	}
	defer rows.Close()

	whispers := []models.Whisper{}
	for rows.Next() {
		var w models.Whisper
		if err := rows.Scan(&w.ID, &w.SpaceID, &w.Title, &w.CreatedByID, &w.CreatedAt, &w.UpdatedAt); err != nil {
			continue
		}

		replyRows, _ := db.DB.Query(`SELECT id, whisper_id, user_id, content, created_at
			FROM whisper_replies WHERE whisper_id = ? ORDER BY created_at`, w.ID)
		w.Messages = []models.WhisperReply{}
		for replyRows.Next() {
			var r models.WhisperReply
			replyRows.Scan(&r.ID, &r.WhisperID, &r.UserID, &r.Content, &r.CreatedAt)
			w.Messages = append(w.Messages, r)
		}
		replyRows.Close()

		whispers = append(whispers, w)
	}

	utils.Success(c, gin.H{"whispers": whispers})
}

// CreateWhisper 创建一条新悄悄话（带首条留言）
func CreateWhisper(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	whisperID := utils.NewID()
	_, err := db.DB.Exec(`INSERT INTO whispers (id, space_id, title, created_by_id) VALUES (?, ?, ?, ?)`,
		whisperID, spaceID, req.Title, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create whisper")
		return
	}

	if req.Content != "" {
		replyID := utils.NewID()
		db.DB.Exec(`INSERT INTO whisper_replies (id, whisper_id, user_id, content) VALUES (?, ?, ?, ?)`,
			replyID, whisperID, userID, req.Content)
	}

	utils.Success(c, gin.H{"id": whisperID})
}

// ReplyWhisper 在某条悄悄话下追加一条回复（两人互动）
func ReplyWhisper(c *gin.Context) {
	whisperID := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// 校验该悄悄话属于当前空间
	var exists string
	if err := db.DB.QueryRow(`SELECT id FROM whispers WHERE id = ? AND space_id = ?`, whisperID, spaceID).Scan(&exists); err != nil {
		utils.Error(c, 404, "Whisper not found")
		return
	}

	replyID := utils.NewID()
	_, err := db.DB.Exec(`INSERT INTO whisper_replies (id, whisper_id, user_id, content) VALUES (?, ?, ?, ?)`,
		replyID, whisperID, userID, req.Content)
	if err != nil {
		utils.Error(c, 500, "Failed to reply")
		return
	}

	db.DB.Exec(`UPDATE whispers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, whisperID)

	utils.Success(c, gin.H{"id": replyID})
}

// DeleteWhisper 删除一条悄悄话
func DeleteWhisper(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查权限：只有创建者可以删除
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM whispers WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Whisper not found")
		return
	}
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can delete this whisper")
		return
	}

	_, err = db.DB.Exec(`DELETE FROM whispers WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete whisper")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}
