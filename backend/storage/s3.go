package storage

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"log"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"our-memories-backend/config"
	"our-memories-backend/utils"
)

var s3Client *s3.S3

// allowedFolders 限定对象 key 的二级目录，防止客户端传入任意 folder 造成注入/越界。
var allowedFolders = map[string]bool{
	"memories":      true,
	"anniversaries": true,
	"time-capsules": true,
	"settings":      true,
	"city-assets":   true,
	"login-photos":  true,
	"uploads":       true,
}

// extByContentType 图片 MIME 白名单 → 扩展名。
var extByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/jpg":  ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func InitS3() {
	cfg := config.Get()
	if cfg.S3Endpoint == "" {
		return
	}

	sess := session.Must(session.NewSession(&aws.Config{
		Endpoint:         aws.String(cfg.S3Endpoint),
		Region:           aws.String(cfg.S3Region),
		Credentials:      credentials.NewStaticCredentials(cfg.S3AccessKeyID, cfg.S3SecretAccessKey, ""),
		S3ForcePathStyle: aws.Bool(false), // 阿里云OSS需要虚拟主机样式
	}))

	s3Client = s3.New(sess)
}

// Enabled 报告对象存储是否已配置。
func Enabled() bool { return s3Client != nil }

// buildKey 用 "/" 拼接对象 key（path.Join 始终用斜杠并清理路径），避免 Windows 反斜杠与 .. 越界。
func buildKey(spaceID, folder, ext string) string {
	return path.Join(spaceID, folder, utils.NewID()+ext)
}

func publicURLForKey(cfg *config.Config, key string) string {
	if cfg.S3PublicBaseURL != "" {
		return cfg.S3PublicBaseURL + "/" + key
	}
	return fmt.Sprintf("%s/%s/%s", cfg.S3Endpoint, cfg.S3Bucket, key)
}

// PresignPut 为前端直传签发一个 15 分钟有效的 PUT URL，并返回对象 key 与最终公共访问 URL。
func PresignPut(spaceID, folder, contentType string) (key, uploadURL, publicURL string, err error) {
	if s3Client == nil {
		return "", "", "", fmt.Errorf("object storage not configured")
	}
	if !allowedFolders[folder] {
		return "", "", "", fmt.Errorf("invalid folder")
	}
	ext, ok := extByContentType[strings.ToLower(contentType)]
	if !ok {
		return "", "", "", fmt.Errorf("unsupported content type")
	}

	cfg := config.Get()
	key = buildKey(spaceID, folder, ext)
	req, _ := s3Client.PutObjectRequest(&s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	uploadURL, err = req.Presign(15 * time.Minute)
	if err != nil {
		return "", "", "", err
	}
	return key, uploadURL, publicURLForKey(cfg, key), nil
}

// KeyFromURL 从公共访问 URL 反解出对象 key；非本 OSS 的 URL（外链/默认贴图）返回空串。
func KeyFromURL(url string) string {
	if url == "" {
		return ""
	}
	cfg := config.Get()
	if cfg.S3PublicBaseURL != "" {
		if prefix := cfg.S3PublicBaseURL + "/"; strings.HasPrefix(url, prefix) {
			return strings.TrimPrefix(url, prefix)
		}
	}
	if prefix := fmt.Sprintf("%s/%s/", cfg.S3Endpoint, cfg.S3Bucket); strings.HasPrefix(url, prefix) {
		return strings.TrimPrefix(url, prefix)
	}
	return ""
}

// KeyBelongsToSpace 校验 key 是否位于该 space 前缀下，供删除接口防越权。
func KeyBelongsToSpace(key, spaceID string) bool {
	return spaceID != "" && strings.HasPrefix(key, spaceID+"/")
}

// DeleteObject 删除单个对象（key 为空或未配置存储时静默忽略）。
func DeleteObject(key string) error {
	if s3Client == nil || key == "" {
		return nil
	}
	cfg := config.Get()
	_, err := s3Client.DeleteObject(&s3.DeleteObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	return err
}

// DeletePhotoObject 优先用持久化的 key 删除，缺失时回退从 url 反解。失败仅记录日志（尽力而为）。
func DeletePhotoObject(key, url string) {
	if key == "" {
		key = KeyFromURL(url)
	}
	if key == "" {
		return
	}
	if err := DeleteObject(key); err != nil {
		log.Printf("delete oss object failed (key=%s): %v", key, err)
	}
}

// DeleteObjectByURL 从公共 URL 反解 key 后删除（尽力而为）。
func DeleteObjectByURL(url string) {
	DeletePhotoObject("", url)
}

// UploadImage 旧的后端中转上传：仅在前端无法直传（未配置 S3 或回退）时被调用。
// 非 data:image/ 前缀的值（已是 OSS URL / 外链）原样返回。
func UploadImage(spaceID, folder, dataURL string) (string, error) {
	if !strings.HasPrefix(dataURL, "data:image/") {
		return dataURL, nil
	}

	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid data URL")
	}

	mimeType := strings.TrimPrefix(strings.TrimSuffix(parts[0], ";base64"), "data:")
	ext, ok := extByContentType[strings.ToLower(mimeType)]
	if !ok {
		ext = ".jpg"
	}

	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}

	if !allowedFolders[folder] {
		folder = "uploads"
	}
	key := buildKey(spaceID, folder, ext)
	cfg := config.Get()

	if s3Client != nil {
		input := &s3.PutObjectInput{
			Bucket:      aws.String(cfg.S3Bucket),
			Key:         aws.String(key),
			Body:        bytes.NewReader(data),
			ContentType: aws.String(mimeType),
		}
		if cfg.S3ObjectACL != "" {
			input.ACL = aws.String(cfg.S3ObjectACL)
		}

		if _, err = s3Client.PutObject(input); err != nil {
			return "", err
		}

		return publicURLForKey(cfg, key), nil
	}

	return dataURL, nil
}
