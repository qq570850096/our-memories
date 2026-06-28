package jobs

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"our-memories-backend/cache"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/storage"
)

type photoTable struct {
	name      string
	folder    string
	idColumn  string
	joinTable string
	joinOn    string
}

type photoRow struct {
	id      string
	spaceID string
	key     string
	url     string
}

var photoTables = []photoTable{
	{
		name:      "memory_photos",
		folder:    "memories",
		idColumn:  "id",
		joinTable: "memories",
		joinOn:    "memory_photos.memory_id = memories.id",
	},
	{
		name:      "anniversary_photos",
		folder:    "anniversaries",
		idColumn:  "id",
		joinTable: "anniversary_cards",
		joinOn:    "anniversary_photos.anniversary_card_id = anniversary_cards.id",
	},
	{
		name:      "time_capsule_photos",
		folder:    "time-capsules",
		idColumn:  "id",
		joinTable: "time_capsules",
		joinOn:    "time_capsule_photos.time_capsule_id = time_capsules.id",
	},
}

// StartPhotoSync runs one image sync shortly after startup, then repeats on PHOTO_SYNC_INTERVAL.
func StartPhotoSync() {
	interval, err := time.ParseDuration(config.Get().PhotoSyncInterval)
	if err != nil || interval <= 0 {
		log.Printf("photo sync disabled: invalid PHOTO_SYNC_INTERVAL=%q", config.Get().PhotoSyncInterval)
		return
	}

	go func() {
		time.Sleep(3 * time.Second)
		runAndLogPhotoSync()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			runAndLogPhotoSync()
		}
	}()
}

func runAndLogPhotoSync() {
	updated, err := RunPhotoSyncOnce()
	if err != nil {
		log.Printf("photo sync completed with errors after updating %d row(s): %v", updated, err)
		return
	}
	if updated > 0 {
		log.Printf("photo sync updated %d row(s)", updated)
	}
}

// RunPhotoSyncOnce uploads inline/local fallback images and updates database URLs.
func RunPhotoSyncOnce() (int, error) {
	totalUpdated := 0
	errs := []error{}

	for _, table := range photoTables {
		updated, err := syncPhotoTable(table)
		totalUpdated += updated
		if err != nil {
			errs = append(errs, err)
		}
	}

	if totalUpdated > 0 {
		cache.Clear()
	}

	return totalUpdated, errors.Join(errs...)
}

func syncPhotoTable(table photoTable) (int, error) {
	rows, err := db.DB.Query(fmt.Sprintf(`
		SELECT %s.%s, %s.space_id, COALESCE(%s.key, ''), %s.url
		FROM %s
		JOIN %s ON %s
		WHERE %s.url LIKE 'data:image/%%'
		   OR %s.url LIKE '/local-images/%%'
		   OR %s.url LIKE 'http%%/local-images/%%'
		ORDER BY %s.%s
	`, table.name, table.idColumn, table.joinTable, table.name, table.name, table.name, table.joinTable, table.joinOn, table.name, table.name, table.name, table.name, table.idColumn))
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	pending := []photoRow{}
	for rows.Next() {
		var row photoRow
		if err := rows.Scan(&row.id, &row.spaceID, &row.key, &row.url); err != nil {
			return 0, err
		}
		pending = append(pending, row)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	updated := 0
	errs := []error{}
	for _, row := range pending {
		rowUpdated, err := syncPhotoRow(table, row)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if rowUpdated {
			updated++
		}
	}
	return updated, errors.Join(errs...)
}

func syncPhotoRow(table photoTable, row photoRow) (bool, error) {
	nextURL, nextKey, err := nextPhotoLocation(table, row)
	if err != nil {
		return false, err
	}
	if nextURL == "" || nextURL == row.url {
		return false, nil
	}

	result, err := db.DB.Exec(
		fmt.Sprintf(`UPDATE %s SET url = ?, key = ? WHERE %s = ? AND url = ?`, table.name, table.idColumn),
		nextURL,
		nextKey,
		row.id,
		row.url,
	)
	if err != nil {
		cleanupNewObject(nextURL, nextKey)
		return false, fmt.Errorf("%s %s update failed: %w", table.name, row.id, err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if affected != 1 {
		cleanupNewObject(nextURL, nextKey)
		return false, fmt.Errorf("%s %s update affected %d rows", table.name, row.id, affected)
	}

	if localKey := storage.LocalKeyFromURL(row.url); localKey != "" && storage.KeyFromURL(nextURL) != "" {
		if err := storage.DeleteLocalObject(localKey); err != nil {
			return true, fmt.Errorf("%s %s local cleanup failed: %w", table.name, row.id, err)
		}
	}
	return true, nil
}

func nextPhotoLocation(table photoTable, row photoRow) (string, string, error) {
	if strings.HasPrefix(row.url, "data:image/") {
		nextURL, nextKey, err := storage.UploadImageWithKey(row.spaceID, table.folder, row.url)
		if err != nil {
			return "", "", fmt.Errorf("%s %s inline upload failed: %w", table.name, row.id, err)
		}
		return nextURL, nextKey, nil
	}

	localKey := storage.LocalKeyFromURL(row.url)
	if localKey == "" {
		return "", "", nil
	}
	if !storage.Enabled() {
		return "", "", nil
	}
	nextURL, err := storage.UploadLocalObjectToS3(localKey)
	if err != nil {
		return "", "", fmt.Errorf("%s %s local upload failed: %w", table.name, row.id, err)
	}
	return nextURL, localKey, nil
}

func cleanupNewObject(url, key string) {
	if key == "" {
		return
	}
	if storage.LocalKeyFromURL(url) != "" {
		_ = storage.DeleteLocalObject(key)
		return
	}
	if storage.KeyFromURL(url) != "" {
		_ = storage.DeleteObject(key)
	}
}
