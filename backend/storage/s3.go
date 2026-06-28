package storage

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
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
var s3PathStyleClient *s3.S3

const localImageURLPrefix = "/local-images/"

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

	s3Client = newS3Client(cfg, false)
	s3PathStyleClient = newS3Client(cfg, true)
}

func newS3Client(cfg *config.Config, forcePathStyle bool) *s3.S3 {
	sess := session.Must(session.NewSession(&aws.Config{
		Endpoint:         aws.String(cfg.S3Endpoint),
		Region:           aws.String(cfg.S3Region),
		Credentials:      credentials.NewStaticCredentials(cfg.S3AccessKeyID, cfg.S3SecretAccessKey, ""),
		S3ForcePathStyle: aws.Bool(forcePathStyle),
	}))
	return s3.New(sess)
}

// Enabled 报告对象存储是否已配置。
func Enabled() bool { return s3Client != nil }

// buildKey 用 "/" 拼接对象 key（path.Join 始终用斜杠并清理路径），避免 Windows 反斜杠与 .. 越界。
func buildKey(spaceID, folder, ext string) string {
	return path.Join(spaceID, folder, utils.NewID()+ext)
}

func publicURLForKey(cfg *config.Config, key string) string {
	key = strings.TrimLeft(key, "/")
	if cfg.S3PublicBaseURL != "" {
		return strings.TrimRight(cfg.S3PublicBaseURL, "/") + "/" + key
	}
	return fmt.Sprintf("%s/%s/%s", strings.TrimRight(cfg.S3Endpoint, "/"), strings.Trim(cfg.S3Bucket, "/"), key)
}

func localURLForKey(key string) string {
	return localImageURLPrefix + strings.TrimLeft(key, "/")
}

// LocalKeyFromURL returns the object key for a server-local fallback image URL.
func LocalKeyFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err == nil && parsed.Path != "" {
		rawURL = parsed.Path
	}
	if !strings.HasPrefix(rawURL, localImageURLPrefix) {
		return ""
	}
	return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawURL, localImageURLPrefix))
}

// LocalPathForKey resolves a local fallback object key to an on-disk path.
func LocalPathForKey(key string) (string, bool) {
	key = cleanObjectKeyFromURLPath(key)
	if key == "" {
		return "", false
	}
	base, err := filepath.Abs(config.Get().LocalImageDir)
	if err != nil {
		return "", false
	}
	filePath, err := filepath.Abs(filepath.Join(base, filepath.FromSlash(key)))
	if err != nil {
		return "", false
	}
	if filePath != base && !strings.HasPrefix(filePath, base+string(os.PathSeparator)) {
		return "", false
	}
	return filePath, true
}

// PublicURLForKey returns the public URL for an existing object key in the
// currently configured storage backend. It returns an empty string when storage
// has no public base to build from.
func PublicURLForKey(key string) string {
	key = strings.TrimLeft(strings.TrimSpace(key), "/")
	if key == "" {
		return ""
	}
	cfg := config.Get()
	if cfg.S3PublicBaseURL == "" && cfg.S3Endpoint == "" {
		return ""
	}
	return publicURLForKey(cfg, key)
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
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	uploadURL, err = req.Presign(15 * time.Minute)
	if err != nil {
		return "", "", "", err
	}
	return key, uploadURL, publicURLForKey(cfg, key), nil
}

// KeyFromURL 从公共访问 URL 反解出对象 key；非本 OSS 的 URL（外链/默认贴图）返回空串。
func KeyFromURL(url string) string {
	url = strings.TrimSpace(url)
	if url == "" {
		return ""
	}
	cfg := config.Get()

	for _, baseURL := range []string{
		cfg.S3PublicBaseURL,
		strings.TrimRight(cfg.S3Endpoint, "/") + "/" + strings.Trim(cfg.S3Bucket, "/"),
	} {
		if key := keyFromBaseURL(url, baseURL); key != "" {
			return key
		}
	}

	if key := keyFromVirtualHostedURL(url, cfg.S3Endpoint, cfg.S3Bucket); key != "" {
		return key
	}
	return ""
}

func keyFromBaseURL(rawURL, baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if rawURL == "" || baseURL == "" {
		return ""
	}

	parsedURL, urlErr := url.Parse(rawURL)
	parsedBase, baseErr := url.Parse(baseURL)
	if urlErr == nil && baseErr == nil && parsedURL.Scheme != "" && parsedBase.Scheme != "" {
		if !strings.EqualFold(parsedURL.Scheme, parsedBase.Scheme) || !sameHost(parsedURL.Host, parsedBase.Host) {
			return ""
		}

		basePath := strings.TrimRight(parsedBase.EscapedPath(), "/")
		rawPath := parsedURL.EscapedPath()
		if basePath == "" {
			return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawPath, "/"))
		}
		prefix := basePath + "/"
		if !strings.HasPrefix(rawPath, prefix) {
			return ""
		}
		return cleanObjectKeyFromURLPath(strings.TrimPrefix(rawPath, prefix))
	}

	prefix := baseURL + "/"
	if !strings.HasPrefix(rawURL, prefix) {
		return ""
	}
	key := strings.TrimPrefix(rawURL, prefix)
	if cut := strings.IndexAny(key, "?#"); cut >= 0 {
		key = key[:cut]
	}
	return cleanObjectKeyFromURLPath(key)
}

func keyFromVirtualHostedURL(rawURL, endpoint, bucket string) string {
	if rawURL == "" || endpoint == "" || bucket == "" {
		return ""
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Host == "" {
		return ""
	}
	parsedEndpoint, err := url.Parse(endpoint)
	if err != nil {
		return ""
	}
	endpointHost := parsedEndpoint.Host
	if endpointHost == "" {
		endpointHost = parsedEndpoint.Path
	}
	if endpointHost == "" {
		return ""
	}

	if !sameHost(parsedURL.Host, bucket+"."+endpointHost) {
		return ""
	}
	return cleanObjectKeyFromURLPath(strings.TrimPrefix(parsedURL.EscapedPath(), "/"))
}

func sameHost(a, b string) bool {
	return strings.EqualFold(strings.TrimSuffix(a, "."), strings.TrimSuffix(b, "."))
}

func cleanObjectKeyFromURLPath(value string) string {
	value = strings.TrimLeft(value, "/")
	if value == "" {
		return ""
	}
	if unescaped, err := url.PathUnescape(value); err == nil {
		value = unescaped
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == ".." {
			return ""
		}
	}
	value = path.Clean(value)
	if value == "." || strings.HasPrefix(value, "../") {
		return ""
	}
	return value
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
	input := &s3.DeleteObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	}
	_, err := s3Client.DeleteObject(input)
	if err != nil && s3PathStyleClient != nil {
		if _, fallbackErr := s3PathStyleClient.DeleteObject(input); fallbackErr == nil {
			return nil
		}
	}
	return err
}

// DeletePhotoObject 优先用持久化的 key 删除，缺失时回退从 url 反解。
func DeletePhotoObject(key, url string) error {
	if key == "" {
		key = KeyFromURL(url)
	}
	if key == "" {
		key = LocalKeyFromURL(url)
	}
	if key == "" {
		return nil
	}
	if LocalKeyFromURL(url) != "" {
		if err := DeleteLocalObject(key); err != nil {
			log.Printf("delete local object failed (key=%s): %v", key, err)
			return err
		}
		return nil
	}
	if err := DeleteObject(key); err != nil {
		log.Printf("delete oss object failed (key=%s): %v", key, err)
		return err
	}
	return nil
}

// DeleteObjectByURL 从公共 URL 反解 key 后删除（尽力而为）。
func DeleteObjectByURL(url string) error {
	return DeletePhotoObject("", url)
}

// UploadImageWithKey 旧的后端中转上传：仅在前端无法直传（未配置 S3 或回退）时被调用。
// 非 data:image/ 前缀的值（已是 OSS URL / 外链）原样返回，并尽量从 URL 反解 key。
func UploadImageWithKey(spaceID, folder, dataURL string) (string, string, error) {
	if !strings.HasPrefix(dataURL, "data:image/") {
		if key := KeyFromURL(dataURL); key != "" {
			return dataURL, key, nil
		}
		return dataURL, LocalKeyFromURL(dataURL), nil
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
			log.Printf("upload to object storage failed; using local fallback (key=%s): %v", key, err)
		} else {
			return publicURLForKey(cfg, key), key, nil
		}
	}

	if err := SaveLocalImage(key, data); err != nil {
		return "", "", err
	}
	return localURLForKey(key), key, nil
}

// UploadImage 返回上传后的公共 URL，保留给不需要持久化 object key 的调用方。
func UploadImage(spaceID, folder, dataURL string) (string, error) {
	url, _, err := UploadImageWithKey(spaceID, folder, dataURL)
	return url, err
}

// SaveLocalImage writes a fallback image under LOCAL_IMAGE_DIR using the object key.
func SaveLocalImage(key string, data []byte) error {
	filePath, ok := LocalPathForKey(key)
	if !ok {
		return fmt.Errorf("invalid local image key")
	}
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// UploadLocalObjectToS3 uploads a server-local fallback image to object storage using the same key.
func UploadLocalObjectToS3(key string) (string, error) {
	if s3Client == nil {
		return "", fmt.Errorf("object storage not configured")
	}
	filePath, ok := LocalPathForKey(key)
	if !ok {
		return "", fmt.Errorf("invalid local image key")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	contentType := mime.TypeByExtension(filepath.Ext(filePath))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	cfg := config.Get()
	input := &s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	}
	if cfg.S3ObjectACL != "" {
		input.ACL = aws.String(cfg.S3ObjectACL)
	}
	if _, err := s3Client.PutObject(input); err != nil {
		return "", err
	}
	return publicURLForKey(cfg, key), nil
}

// DeleteLocalObject removes a server-local fallback image.
func DeleteLocalObject(key string) error {
	filePath, ok := LocalPathForKey(key)
	if !ok {
		return nil
	}
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
