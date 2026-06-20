package handlers

import (
	"database/sql"
	"strings"

	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

type sqlExecer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
}

func insertMemoryPhotos(exec sqlExecer, memoryID string, photos []photoInput) error {
	for i, photo := range photos {
		photoID := utils.NewID()
		if _, err := exec.Exec(
			`INSERT INTO memory_photos (id, memory_id, key, url, mime_type, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			photoID, memoryID, photo.Key, photo.URL, photo.MimeType, photo.Width, photo.Height, i,
		); err != nil {
			return err
		}
	}
	return nil
}

func insertAnniversaryPhotos(exec sqlExecer, cardID string, photos []photoInput) error {
	for i, photo := range photos {
		photoID := utils.NewID()
		if _, err := exec.Exec(
			`INSERT INTO anniversary_photos (id, anniversary_card_id, key, url, mime_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			photoID, cardID, photo.Key, photo.URL, photo.MimeType, i,
		); err != nil {
			return err
		}
	}
	return nil
}

func insertTimeCapsulePhotos(exec sqlExecer, capsuleID string, photos []photoInput) error {
	for i, photo := range photos {
		photoID := utils.NewID()
		if _, err := exec.Exec(
			`INSERT INTO time_capsule_photos (id, time_capsule_id, key, url, mime_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			photoID, capsuleID, photo.Key, photo.URL, photo.MimeType, i,
		); err != nil {
			return err
		}
	}
	return nil
}

func queryPlaceholders(count int) string {
	if count <= 0 {
		return ""
	}
	return strings.TrimRight(strings.Repeat("?,", count), ",")
}

func queryArgs(values []string) []interface{} {
	args := make([]interface{}, len(values))
	for i, value := range values {
		args[i] = value
	}
	return args
}

func emptyPhotoMap(parentIDs []string) map[string][]models.Photo {
	photosByParentID := make(map[string][]models.Photo, len(parentIDs))
	for _, parentID := range parentIDs {
		photosByParentID[parentID] = []models.Photo{}
	}
	return photosByParentID
}

func loadMemoryPhotosByMemoryIDs(memoryIDs []string) (map[string][]models.Photo, error) {
	photosByMemoryID := emptyPhotoMap(memoryIDs)
	if len(memoryIDs) == 0 {
		return photosByMemoryID, nil
	}

	rows, err := db.DB.Query(`
		SELECT id, memory_id, key, url, COALESCE(mime_type, ''),
		       COALESCE(width, 0), COALESCE(height, 0), sort_order, created_at
		FROM memory_photos
		WHERE memory_id IN (`+queryPlaceholders(len(memoryIDs))+`)
		ORDER BY memory_id, sort_order
	`, queryArgs(memoryIDs)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var p models.Photo
		if err := rows.Scan(&p.ID, &p.MemoryID, &p.Key, &p.URL, &p.MimeType, &p.Width, &p.Height, &p.SortOrder, &p.CreatedAt); err != nil {
			return nil, err
		}
		photosByMemoryID[p.MemoryID] = append(photosByMemoryID[p.MemoryID], p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return photosByMemoryID, nil
}

func loadAnniversaryPhotosByCardIDs(cardIDs []string) (map[string][]models.Photo, error) {
	photosByCardID := emptyPhotoMap(cardIDs)
	if len(cardIDs) == 0 {
		return photosByCardID, nil
	}

	rows, err := db.DB.Query(`
		SELECT id, anniversary_card_id, key, url, COALESCE(mime_type, ''), sort_order, created_at
		FROM anniversary_photos
		WHERE anniversary_card_id IN (`+queryPlaceholders(len(cardIDs))+`)
		ORDER BY anniversary_card_id, sort_order
	`, queryArgs(cardIDs)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var cardID string
		var p models.Photo
		if err := rows.Scan(&p.ID, &cardID, &p.Key, &p.URL, &p.MimeType, &p.SortOrder, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.MemoryID = cardID
		photosByCardID[cardID] = append(photosByCardID[cardID], p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return photosByCardID, nil
}

func loadTimeCapsulePhotosByCapsuleIDs(capsuleIDs []string) (map[string][]models.Photo, error) {
	photosByCapsuleID := emptyPhotoMap(capsuleIDs)
	if len(capsuleIDs) == 0 {
		return photosByCapsuleID, nil
	}

	rows, err := db.DB.Query(`
		SELECT id, time_capsule_id, key, url, COALESCE(mime_type, ''), sort_order, created_at
		FROM time_capsule_photos
		WHERE time_capsule_id IN (`+queryPlaceholders(len(capsuleIDs))+`)
		ORDER BY time_capsule_id, sort_order
	`, queryArgs(capsuleIDs)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var capsuleID string
		var p models.Photo
		if err := rows.Scan(&p.ID, &capsuleID, &p.Key, &p.URL, &p.MimeType, &p.SortOrder, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.MemoryID = capsuleID
		photosByCapsuleID[capsuleID] = append(photosByCapsuleID[capsuleID], p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return photosByCapsuleID, nil
}
