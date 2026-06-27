package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
	"our-memories-backend/config"
)

var DB *sql.DB

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

	Migrate()

	if cfg.AutoSeed {
		Seed()
	}

	log.Println("数据库初始化完成")
}

func Migrate() {
	schema := `
	CREATE TABLE IF NOT EXISTS spaces (
		id TEXT PRIMARY KEY,
		space_code TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		username TEXT NOT NULL,
		display_name TEXT NOT NULL,
		avatar TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		UNIQUE(space_id, username)
	);

	CREATE TABLE IF NOT EXISTS memories (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		city_id TEXT NOT NULL,
		city TEXT NOT NULL,
		city_en TEXT NOT NULL,
		title TEXT,
		date TEXT NOT NULL,
		text TEXT NOT NULL,
		mood TEXT,
		tags TEXT,
		visibility TEXT DEFAULT 'both',
		partner_note TEXT,
		partner_note_author_id TEXT,
		place_name TEXT,
		cover_photo_id TEXT,
		created_by_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_memories_space_city ON memories(space_id, city_id);
	CREATE INDEX IF NOT EXISTS idx_memories_space_date ON memories(space_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_memories_space_date_order ON memories(space_id, date DESC, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_memories_space_city_date ON memories(space_id, city_id, date DESC, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_memories_space_visibility_date ON memories(space_id, visibility, date DESC, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_memories_space_creator_date ON memories(space_id, created_by_id, date DESC, created_at DESC);

	CREATE TABLE IF NOT EXISTS memory_photos (
		id TEXT PRIMARY KEY,
		memory_id TEXT NOT NULL,
		key TEXT NOT NULL,
		url TEXT NOT NULL,
		mime_type TEXT,
		width INTEGER,
		height INTEGER,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_memory_photos_memory ON memory_photos(memory_id);
	CREATE INDEX IF NOT EXISTS idx_memory_photos_memory_sort ON memory_photos(memory_id, sort_order);

	CREATE TABLE IF NOT EXISTS anniversary_cards (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		title TEXT NOT NULL,
		date TEXT NOT NULL,
		note TEXT DEFAULT '',
		cover_photo_id TEXT,
		repeat_yearly INTEGER DEFAULT 1,
		pinned INTEGER DEFAULT 0,
		sort_order INTEGER DEFAULT 0,
		created_by_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_anniversary_space_pinned ON anniversary_cards(space_id, pinned, sort_order);

	CREATE TABLE IF NOT EXISTS anniversary_photos (
		id TEXT PRIMARY KEY,
		anniversary_card_id TEXT NOT NULL,
		key TEXT NOT NULL,
		url TEXT NOT NULL,
		mime_type TEXT,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (anniversary_card_id) REFERENCES anniversary_cards(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS settings (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		UNIQUE(space_id, key)
	);

	CREATE TABLE IF NOT EXISTS auxiliary_items (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		title TEXT NOT NULL,
		date TEXT,
		note TEXT DEFAULT '',
		city_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id)
	);

	CREATE INDEX IF NOT EXISTS idx_auxiliary_space_kind ON auxiliary_items(space_id, kind);

	CREATE TABLE IF NOT EXISTS whispers (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		title TEXT NOT NULL,
		created_by_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS whisper_replies (
		id TEXT PRIMARY KEY,
		whisper_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (whisper_id) REFERENCES whispers(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_whispers_space ON whispers(space_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_whisper_replies ON whisper_replies(whisper_id, created_at);

	CREATE TABLE IF NOT EXISTS time_capsules (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		title TEXT NOT NULL,
		open_date TEXT NOT NULL,
		content TEXT NOT NULL,
		created_by_id TEXT NOT NULL,
		is_opened INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS time_capsule_photos (
		id TEXT PRIMARY KEY,
		time_capsule_id TEXT NOT NULL,
		key TEXT NOT NULL,
		url TEXT NOT NULL,
		mime_type TEXT,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (time_capsule_id) REFERENCES time_capsules(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_time_capsules_space ON time_capsules(space_id, open_date);
	`

	if _, err := DB.Exec(schema); err != nil {
		log.Fatal("数据库迁移失败:", err)
	}

	ensureColumn("memories", "cover_photo_id", "TEXT")
	ensureColumn("memories", "partner_note_author_id", "TEXT")
	ensureColumn("anniversary_cards", "cover_photo_id", "TEXT")

	// 多用户和商业化扩展
	ensureColumn("users", "role", "TEXT DEFAULT 'member'")
	ensureColumn("spaces", "status", "TEXT DEFAULT 'active'")
	ensureColumn("spaces", "tier", "TEXT DEFAULT 'free'")
	ensureColumn("spaces", "purchased_at", "DATETIME")
	ensureColumn("spaces", "storage_used_bytes", "INTEGER DEFAULT 0")

	// 创建索引
	createIndex("idx_users_space_role", "users", "space_id, role")
	createIndex("idx_spaces_status", "spaces", "status")

	// 创建管理员表
	createTableIfNotExists("admins", `
		id TEXT PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		display_name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	`)

	// 创建订单表
	createTableIfNotExists("orders", `
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		amount REAL NOT NULL,
		currency TEXT DEFAULT 'CNY',
		status TEXT DEFAULT 'pending',
		payment_method TEXT,
		paid_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id)
	`)
	createIndex("idx_orders_space", "orders", "space_id")
	createIndex("idx_orders_status", "orders", "status, created_at")

	// 创建审计日志表
	createTableIfNotExists("audit_logs", `
		id TEXT PRIMARY KEY,
		admin_id TEXT NOT NULL,
		action TEXT NOT NULL,
		target_type TEXT,
		target_id TEXT,
		details TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (admin_id) REFERENCES admins(id)
	`)
	createIndex("idx_audit_logs_admin", "audit_logs", "admin_id, created_at")
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

func createTableIfNotExists(tableName string, schema string) {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS ` + tableName + ` (` + schema + `)`)
	if err != nil {
		log.Fatal("创建表失败:", err)
	}
}
