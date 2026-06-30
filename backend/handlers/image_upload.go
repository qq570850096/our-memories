package handlers

import (
	"fmt"
	"strings"

	"our-memories-backend/storage"
)

type photoInput struct {
	Key       string `json:"key"`
	URL       string `json:"url"`
	MimeType  string `json:"mimeType"`
	MediaType string `json:"mediaType"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

func uploadDataURL(spaceID, folder, value string) (string, error) {
	if !strings.HasPrefix(value, "data:image/") {
		return value, nil
	}
	url, _, err := storage.Default().UploadImageWithKey(spaceID, folder, value)
	return url, err
}

func uploadPhotoInputs(spaceID, folder string, photos []photoInput) error {
	objectStorage := storage.Default()
	for index := range photos {
		url, key, err := objectStorage.UploadImageWithKey(spaceID, folder, photos[index].URL)
		if err != nil {
			return err
		}
		photos[index].URL = url
		if key != "" {
			photos[index].Key = key
		}
		if photos[index].Key == "" {
			photos[index].Key = objectStorage.KeyFromURL(photos[index].URL)
		}
		if photos[index].Key != "" && !objectStorage.KeyBelongsToSpace(photos[index].Key, spaceID) {
			return fmt.Errorf("photo key is outside current space")
		}
	}
	return nil
}
