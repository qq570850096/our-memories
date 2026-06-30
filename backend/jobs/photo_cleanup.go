package jobs

import (
	"errors"
	"log"
	"time"

	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/storage"
)

const memoryTrashRetention = 30 * 24 * time.Hour

func StartPhotoCleanup() {
	log.Printf("photo cleanup scheduled: interval=%s retention=%s", 24*time.Hour, memoryTrashRetention)
	go func() {
		time.Sleep(10 * time.Second)
		runAndLogPhotoCleanup()

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runAndLogPhotoCleanup()
		}
	}()
}

func runAndLogPhotoCleanup() {
	start := time.Now()
	deleted, err := RunPhotoCleanupOnce()
	if err != nil {
		log.Printf("photo cleanup finished with errors: deleted=%d duration=%s err=%v", deleted, time.Since(start).Round(time.Millisecond), err)
		return
	}
	if deleted > 0 {
		log.Printf("photo cleanup finished: deleted=%d duration=%s", deleted, time.Since(start).Round(time.Millisecond))
	}
}

func RunPhotoCleanupOnce() (int, error) {
	repo := repositories.NewMemoryRepository(db.Gorm)
	expired, err := repo.ExpiredTrash(memoryTrashRetention, 100)
	if err != nil {
		return 0, err
	}

	deleted := 0
	errs := []error{}
	objectStorage := storage.Default()
	for _, memory := range expired {
		if err := deleteTrashMemoryPhotos(objectStorage, memory); err != nil {
			errs = append(errs, err)
			continue
		}
		if err := repo.HardDelete(memory.MemoryID, memory.SpaceID); err != nil {
			errs = append(errs, err)
			continue
		}
		cache.ClearMemorySpace(memory.SpaceID)
		deleted++
	}
	return deleted, errors.Join(errs...)
}

func deleteTrashMemoryPhotos(objectStorage storage.ObjectStorage, memory repositories.MemoryTrashPhotos) error {
	errs := []error{}
	seen := map[string]bool{}
	for _, photo := range memory.Photos {
		key := photo.Key
		if key == "" {
			key = objectStorage.KeyFromURL(photo.URL)
		}
		if key == "" {
			key = objectStorage.LocalKeyFromURL(photo.URL)
		}
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		if !objectStorage.KeyBelongsToSpace(key, memory.SpaceID) {
			log.Printf("skip deleting trash object outside current space (space=%s key=%s)", memory.SpaceID, key)
			continue
		}
		if err := objectStorage.DeletePhotoObject(key, photo.URL); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
