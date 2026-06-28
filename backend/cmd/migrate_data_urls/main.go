package main

import (
	"log"

	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/jobs"
	"our-memories-backend/storage"
)

func main() {
	log.SetFlags(0)

	config.Load()
	db.Init()
	storage.InitS3()

	updated, err := jobs.RunPhotoSyncOnce()
	if err != nil {
		log.Fatalf("photo sync updated %d row(s) with errors: %v", updated, err)
	}
	log.Printf("photo sync updated %d row(s)", updated)
}
