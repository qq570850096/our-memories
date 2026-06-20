package handlers

import (
	"strings"

	"our-memories-backend/storage"
)

type photoInput struct {
	Key      string `json:"key"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

func uploadDataURL(spaceID, folder, value string) (string, error) {
	if !strings.HasPrefix(value, "data:image/") {
		return value, nil
	}
	return storage.UploadImage(spaceID, folder, value)
}

func uploadPhotoInputs(spaceID, folder string, photos []photoInput) error {
	for index := range photos {
		url, err := uploadDataURL(spaceID, folder, photos[index].URL)
		if err != nil {
			return err
		}
		photos[index].URL = url
	}
	return nil
}
