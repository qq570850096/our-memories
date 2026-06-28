package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              string
	DatabasePath      string
	PublicDir         string
	JWTSecret         string
	AllowedOrigins    []string
	DefaultSpaceCode  string
	DefaultPassword   string
	AdminUsername     string
	AdminPassword     string
	AdminDisplayName  string
	AutoSeed          bool
	S3Endpoint        string
	S3Region          string
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3Bucket          string
	S3PublicBaseURL   string
	S3ObjectACL       string
	LocalImageDir     string
	PhotoSyncInterval string
}

var cfg *Config

func Load() {
	_ = godotenv.Load()

	cfg = &Config{
		Port:              getEnv("PORT", "8080"),
		DatabasePath:      getEnv("DATABASE_PATH", "./data/ourMemories.db"),
		PublicDir:         getEnv("PUBLIC_DIR", "./public"),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-at-least-24-characters"),
		AllowedOrigins:    strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:3002"), ","),
		DefaultSpaceCode:  getEnv("DEFAULT_SPACE_CODE", "our-space-2026"),
		DefaultPassword:   getEnv("DEFAULT_PASSWORD", "1234"),
		AdminUsername:     getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword:     getEnv("ADMIN_PASSWORD", "admin123456"),
		AdminDisplayName:  getEnv("ADMIN_DISPLAY_NAME", "Admin User"),
		AutoSeed:          getEnv("AUTO_SEED", "true") == "true",
		S3Endpoint:        getEnv("S3_ENDPOINT", ""),
		S3Region:          getEnv("S3_REGION", "us-east-1"),
		S3AccessKeyID:     getEnv("S3_ACCESS_KEY_ID", ""),
		S3SecretAccessKey: getEnv("S3_SECRET_ACCESS_KEY", ""),
		S3Bucket:          getEnv("S3_BUCKET", "our-memories"),
		S3PublicBaseURL:   getEnv("S3_PUBLIC_BASE_URL", ""),
		S3ObjectACL:       getEnv("S3_OBJECT_ACL", ""),
		LocalImageDir:     getEnv("LOCAL_IMAGE_DIR", "./data/images"),
		PhotoSyncInterval: getEnv("PHOTO_SYNC_INTERVAL", "10m"),
	}

	if len(cfg.JWTSecret) < 24 {
		log.Fatal("JWT_SECRET must be at least 24 characters")
	}

	if cfg.JWTSecret == "change-me-at-least-24-characters" {
		log.Fatal("JWT_SECRET must be changed from default value for security")
	}
}

func Get() *Config {
	if cfg == nil {
		Load()
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
