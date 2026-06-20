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

func GetAnniversaryCards(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	cacheKey := fmt.Sprintf("anniversary-cards:%s", spaceID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"anniversaryCards": cached})
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, space_id, title, date, note, COALESCE(cover_photo_id, ''), repeat_yearly, pinned, sort_order,
		       COALESCE(created_by_id, ''), created_at, updated_at
		FROM anniversary_cards
		WHERE space_id = ?
		ORDER BY pinned DESC, sort_order, date
	`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch anniversary cards")
		return
	}
	defer rows.Close()

	cards := []models.AnniversaryCard{}
	cardIDs := []string{}
	for rows.Next() {
		var card models.AnniversaryCard
		var repeatInt, pinnedInt int
		err := rows.Scan(&card.ID, &card.SpaceID, &card.Title, &card.Date, &card.Note, &card.CoverPhotoID,
			&repeatInt, &pinnedInt, &card.SortOrder, &card.CreatedByID, &card.CreatedAt, &card.UpdatedAt)
		if err != nil {
			continue
		}
		card.RepeatYearly = repeatInt == 1
		card.Pinned = pinnedInt == 1

		cardIDs = append(cardIDs, card.ID)
		cards = append(cards, card)
	}
	if err := rows.Err(); err != nil {
		utils.Error(c, 500, "Failed to fetch anniversary cards")
		return
	}

	photosByCardID, err := loadAnniversaryPhotosByCardIDs(cardIDs)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch anniversary cards")
		return
	}
	for i := range cards {
		cards[i].Photos = photosByCardID[cards[i].ID]
	}

	cache.Set(cacheKey, cards, 5*time.Minute)
	utils.Success(c, gin.H{"anniversaryCards": cards})
}

func clearAnniversaryCardsCache(spaceID string) {
	cache.Delete(fmt.Sprintf("anniversary-cards:%s", spaceID))
}

func CreateAnniversaryCard(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Title        string       `json:"title" binding:"required"`
		Date         string       `json:"date" binding:"required"`
		Note         string       `json:"note"`
		RepeatYearly bool         `json:"repeatYearly"`
		Pinned       bool         `json:"pinned"`
		Photos       []photoInput `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	if err := uploadPhotoInputs(spaceID, "anniversaries", req.Photos); err != nil {
		utils.Error(c, 500, "Failed to upload anniversary photos")
		return
	}

	cardID := utils.NewID()
	repeatInt := 0
	if req.RepeatYearly {
		repeatInt = 1
	}
	pinnedInt := 0
	if req.Pinned {
		pinnedInt = 1
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to create anniversary card")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO anniversary_cards (id, space_id, title, date, note, repeat_yearly, pinned, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		cardID, spaceID, req.Title, req.Date, req.Note, repeatInt, pinnedInt, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create anniversary card")
		return
	}

	if err := insertAnniversaryPhotos(tx, cardID, req.Photos); err != nil {
		utils.Error(c, 500, "Failed to save anniversary photos")
		return
	}
	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to create anniversary card")
		return
	}

	clearAnniversaryCardsCache(spaceID)
	utils.Success(c, gin.H{"id": cardID})
}

func UpdateAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Title        string        `json:"title"`
		Date         string        `json:"date"`
		Note         string        `json:"note"`
		RepeatYearly bool          `json:"repeatYearly"`
		Pinned       bool          `json:"pinned"`
		Photos       *[]photoInput `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	// 检查权限：只有创建者可以编辑
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM anniversary_cards WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Anniversary card not found")
		return
	}
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can edit this card")
		return
	}
	if req.Photos != nil {
		if err := uploadPhotoInputs(spaceID, "anniversaries", *req.Photos); err != nil {
			utils.Error(c, 500, "Failed to upload anniversary photos")
			return
		}
	}

	repeatInt := 0
	if req.RepeatYearly {
		repeatInt = 1
	}
	pinnedInt := 0
	if req.Pinned {
		pinnedInt = 1
	}

	var oldPhotos []storedPhoto
	if req.Photos != nil {
		oldPhotos = collectPhotos(`SELECT key, url FROM anniversary_photos WHERE anniversary_card_id = ?`, id)
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to update anniversary card")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE anniversary_cards SET title = ?, date = ?, note = ?, repeat_yearly = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND space_id = ?`,
		req.Title, req.Date, req.Note, repeatInt, pinnedInt, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update anniversary card")
		return
	}

	if req.Photos != nil {
		if _, err := tx.Exec(`DELETE FROM anniversary_photos WHERE anniversary_card_id = ?`, id); err != nil {
			utils.Error(c, 500, "Failed to update anniversary photos")
			return
		}
		if _, err := tx.Exec(`UPDATE anniversary_cards SET cover_photo_id = NULL WHERE id = ?`, id); err != nil {
			utils.Error(c, 500, "Failed to update anniversary photos")
			return
		}
		if err := insertAnniversaryPhotos(tx, id, *req.Photos); err != nil {
			utils.Error(c, 500, "Failed to save anniversary photos")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to update anniversary card")
		return
	}
	if req.Photos != nil {
		deleteRemovedPhotos(oldPhotos, *req.Photos)
	}

	clearAnniversaryCardsCache(spaceID)
	utils.Success(c, gin.H{"ok": true})
}

func DeleteAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查权限：只有创建者可以删除
	var createdByID string
	err := db.DB.QueryRow(`SELECT created_by_id FROM anniversary_cards WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&createdByID)
	if err != nil {
		utils.Error(c, 404, "Anniversary card not found")
		return
	}
	if createdByID != userID {
		utils.Error(c, 403, "Only the creator can delete this card")
		return
	}

	photos := collectPhotos(`SELECT key, url FROM anniversary_photos WHERE anniversary_card_id = ?`, id)

	_, err = db.DB.Exec(`DELETE FROM anniversary_cards WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete anniversary card")
		return
	}
	deletePhotos(photos)

	clearAnniversaryCardsCache(spaceID)
	utils.Success(c, gin.H{"ok": true})
}
