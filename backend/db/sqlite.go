package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/config"
	"our-memories-backend/dbschema"
)

var DB *sql.DB
var Gorm *gorm.DB

func Init() {
	cfg := config.Get()

	dir := filepath.Dir(cfg.DatabasePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatal("创建数据库目录失败:", err)
	}

	var err error
	DB, err = sql.Open("sqlite", cfg.DatabasePath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		log.Fatal("打开数据库失败:", err)
	}

	if err := DB.Ping(); err != nil {
		log.Fatal("连接数据库失败:", err)
	}

	initGorm(DB)

	Migrate()

	if cfg.AutoSeed {
		Seed()
	}

	log.Println("数据库初始化完成")
}

func initGorm(sqlDB *sql.DB) {
	var err error
	Gorm, err = gorm.Open(sqlite.Dialector{Conn: sqlDB}, &gorm.Config{})
	if err != nil {
		log.Fatal("初始化 ORM 失败:", err)
	}
}

func Migrate() {
	if err := dbschema.AutoMigrate(Gorm); err != nil {
		log.Fatal("数据库迁移失败:", err)
	}

	ensureColumn("memories", "cover_photo_id", "TEXT")
	ensureColumn("memories", "partner_note_author_id", "TEXT")
	ensureColumn("memories", "deleted_at", "DATETIME")
	ensureColumn("memories", "voice_text_url", "TEXT")
	ensureColumn("memories", "partner_voice_url", "TEXT")
	ensureColumn("memory_photos", "media_type", "TEXT DEFAULT 'image'")
	ensureColumn("anniversary_cards", "cover_photo_id", "TEXT")
	ensureColumn("anniversary_cards", "voice_url", "TEXT")
	ensureColumn("anniversary_cards", "bgm_url", "TEXT")
	ensureColumn("anniversary_cards", "bgm_preset", "TEXT")
	ensureColumn("whisper_replies", "voice_url", "TEXT")
	ensureColumn("time_capsules", "voice_url", "TEXT")
	ensureColumn("time_capsules", "open_mode", "TEXT DEFAULT 'single'")
	ensureColumn("time_capsules", "opened_by_user_ids", "TEXT DEFAULT '[]'")
	ensureColumn("time_capsules", "revealed_at", "DATETIME")

	// 多用户和商业化扩展
	ensureColumn("users", "role", "TEXT DEFAULT 'member'")
	ensureColumn("spaces", "status", "TEXT DEFAULT 'active'")
	ensureColumn("spaces", "tier", "TEXT DEFAULT 'free'")
	ensureColumn("spaces", "purchased_at", "DATETIME")
	ensureColumn("spaces", "storage_used_bytes", "INTEGER DEFAULT 0")

	// 创建索引
	createIndex("idx_users_space_role", "users", "space_id, role")
	createIndex("idx_spaces_status", "spaces", "status")
	createIndex("idx_memories_space_city", "memories", "space_id, city_id")
	createIndex("idx_memories_space_date", "memories", "space_id, created_at")
	createIndex("idx_memories_space_date_order", "memories", "space_id, date DESC, created_at DESC")
	createIndex("idx_memories_space_city_date", "memories", "space_id, city_id, date DESC, created_at DESC")
	createIndex("idx_memories_space_visibility_date", "memories", "space_id, visibility, date DESC, created_at DESC")
	createIndex("idx_memories_space_creator_date", "memories", "space_id, created_by_id, date DESC, created_at DESC")
	createIndex("idx_memory_photos_memory", "memory_photos", "memory_id")
	createIndex("idx_memory_photos_memory_sort", "memory_photos", "memory_id, sort_order")
	createIndex("idx_anniversary_space_pinned", "anniversary_cards", "space_id, pinned, sort_order")
	createIndex("idx_auxiliary_space_kind", "auxiliary_items", "space_id, kind")
	createIndex("idx_whispers_space", "whispers", "space_id, created_at DESC")
	createIndex("idx_whisper_replies", "whisper_replies", "whisper_id, created_at")
	createIndex("idx_time_capsules_space", "time_capsules", "space_id, open_date")

	createIndex("idx_orders_space", "orders", "space_id")
	createIndex("idx_orders_status", "orders", "status, created_at")

	createIndex("idx_audit_logs_admin", "audit_logs", "admin_id, created_at")

	createIndex("idx_push_devices_space", "push_devices", "space_id, enabled")
	createIndex("idx_push_devices_user", "push_devices", "user_id, enabled")

	createIndex("idx_notifications_user_read", "notifications", "space_id, user_id, is_read, created_at DESC")
	createIndex("idx_notifications_cleanup", "notifications", "is_read, created_at")

	createIndex("idx_relationship_signals_space_expires", "relationship_signals", "space_id, expires_at")
}

func ensureColumn(tableName string, columnName string, definition string) {
	rows, err := DB.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		log.Fatal("数据库字段检查失败:", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			log.Fatal("数据库字段读取失败:", err)
		}
		if name == columnName {
			return
		}
	}

	if _, err := DB.Exec(`ALTER TABLE ` + tableName + ` ADD COLUMN ` + columnName + ` ` + definition); err != nil {
		log.Fatal("数据库字段迁移失败:", err)
	}
}

func createIndex(indexName string, tableName string, columns string) {
	_, err := DB.Exec(`CREATE INDEX IF NOT EXISTS ` + indexName + ` ON ` + tableName + `(` + columns + `)`)
	if err != nil {
		log.Fatal("创建索引失败:", err)
	}
}
