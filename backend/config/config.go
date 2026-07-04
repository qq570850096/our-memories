package config

import (
	"fmt"
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
	JPushAppKey       string
	JPushMasterSecret string
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
		DefaultPassword:   getEnv("DEFAULT_PASSWORD", ""),
		AdminUsername:     getEnv("ADMIN_USERNAME", ""),
		AdminPassword:     getEnv("ADMIN_PASSWORD", ""),
		AdminDisplayName:  getEnv("ADMIN_DISPLAY_NAME", "Admin User"),
		AutoSeed:          getEnv("AUTO_SEED", "false") == "true",
		S3Endpoint:        getEnv("S3_ENDPOINT", ""),
		S3Region:          getEnv("S3_REGION", "us-east-1"),
		S3AccessKeyID:     getEnv("S3_ACCESS_KEY_ID", ""),
		S3SecretAccessKey: getEnv("S3_SECRET_ACCESS_KEY", ""),
		S3Bucket:          getEnv("S3_BUCKET", "our-memories"),
		S3PublicBaseURL:   getEnv("S3_PUBLIC_BASE_URL", ""),
		S3ObjectACL:       getEnv("S3_OBJECT_ACL", ""),
		LocalImageDir:     getEnv("LOCAL_IMAGE_DIR", "./data/images"),
		PhotoSyncInterval: getEnv("PHOTO_SYNC_INTERVAL", "10m"),
		JPushAppKey:       getEnv("JPUSH_APP_KEY", ""),
		JPushMasterSecret: getEnv("JPUSH_MASTER_SECRET", ""),
	}

	if err := Validate(cfg); err != nil {
		log.Fatal(err)
	}
}

func Validate(cfg *Config) error {
	if len(cfg.JWTSecret) < 24 {
		return fmt.Errorf("JWT_SECRET must be at least 24 characters")
	}

	if cfg.JWTSecret == "change-me-at-least-24-characters" {
		return fmt.Errorf("JWT_SECRET must be changed from default value for security")
	}

	for _, origin := range cfg.AllowedOrigins {
		if strings.TrimSpace(origin) == "*" {
			return fmt.Errorf("ALLOWED_ORIGINS must not contain * when credentialed cookies are enabled")
		}
	}

	if cfg.AutoSeed && (len(cfg.DefaultPassword) < 8 || cfg.DefaultPassword == "1234") {
		return fmt.Errorf("DEFAULT_PASSWORD must be at least 8 characters when AUTO_SEED=true")
	}

	if cfg.AdminUsername != "" || cfg.AdminPassword != "" {
		if cfg.AdminUsername == "" || cfg.AdminPassword == "" {
			return fmt.Errorf("ADMIN_USERNAME and ADMIN_PASSWORD must be set together")
		}
		if len(cfg.AdminPassword) < 12 || cfg.AdminPassword == "admin123456" {
			return fmt.Errorf("ADMIN_PASSWORD must be at least 12 characters and changed from the example value")
		}
	}

	return nil
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
