package storage

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
)

// allowedFolders limits object key folder names accepted from clients.
var allowedFolders = map[string]bool{
	"memories":      true,
	"anniversaries": true,
	"time-capsules": true,
	"whispers":      true,
	"settings":      true,
	"city-assets":   true,
	"login-photos":  true,
	"uploads":       true,
}

var extByContentType = map[string]string{
	"image/jpeg":  ".jpg",
	"image/jpg":   ".jpg",
	"image/png":   ".png",
	"image/webp":  ".webp",
	"audio/mpeg":  ".mp3",
	"audio/mp3":   ".mp3",
	"audio/mp4":   ".m4a",
	"audio/aac":   ".aac",
	"audio/webm":  ".webm",
	"audio/wav":   ".wav",
	"audio/x-wav": ".wav",
}

// PresignPut signs a 15-minute PUT URL and returns key, upload URL, and public URL.
func (s *S3Storage) PresignPut(spaceID, folder, contentType string) (key, uploadURL, publicURL string, err error) {
	if s == nil || s.client == nil {
		return "", "", "", fmt.Errorf("object storage not configured")
	}
	if !allowedFolders[folder] {
		return "", "", "", fmt.Errorf("invalid folder")
	}
	ext, ok := extByContentType[strings.ToLower(contentType)]
	if !ok {
		return "", "", "", fmt.Errorf("unsupported content type")
	}

	cfg := s.config()
	key = buildKey(spaceID, folder, ext)
	req, _ := s.client.PutObjectRequest(&s3.PutObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	uploadURL, err = req.Presign(15 * time.Minute)
	if err != nil {
		return "", "", "", err
	}
	return key, uploadURL, publicURLForKey(cfg, key), nil
}

// UploadImageWithKey handles server-side relay upload and local fallback.
func (s *S3Storage) UploadImageWithKey(spaceID, folder, dataURL string) (string, string, error) {
	if !strings.HasPrefix(dataURL, "data:image/") && !strings.HasPrefix(dataURL, "data:audio/") {
		if key := s.KeyFromURL(dataURL); key != "" {
			return dataURL, key, nil
		}
		return dataURL, s.LocalKeyFromURL(dataURL), nil
	}

	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid data URL")
	}

	mimeType := strings.TrimPrefix(strings.TrimSuffix(parts[0], ";base64"), "data:")
	ext, ok := extByContentType[strings.ToLower(mimeType)]
	if !ok {
		ext = ".jpg"
	}

	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", err
	}

	if !allowedFolders[folder] {
		folder = "uploads"
	}
	key := buildKey(spaceID, folder, ext)
	cfg := s.config()

	if s != nil && s.client != nil {
		input := &s3.PutObjectInput{
			Bucket:      aws.String(cfg.S3Bucket),
			Key:         aws.String(key),
			Body:        bytes.NewReader(data),
			ContentType: aws.String(mimeType),
		}
		if cfg.S3ObjectACL != "" {
			input.ACL = aws.String(cfg.S3ObjectACL)
		}

		if _, err = s.client.PutObject(input); err != nil {
			log.Printf("upload to object storage failed; using local fallback (key=%s): %v", key, err)
		} else {
			return publicURLForKey(cfg, key), key, nil
		}
	}

	if err := s.SaveLocalImage(key, data); err != nil {
		return "", "", err
	}
	return localURLForKey(key), key, nil
}

// UploadImage returns the uploaded public URL for callers that do not persist object keys.
func (s *S3Storage) UploadImage(spaceID, folder, dataURL string) (string, error) {
	url, _, err := s.UploadImageWithKey(spaceID, folder, dataURL)
	return url, err
}
