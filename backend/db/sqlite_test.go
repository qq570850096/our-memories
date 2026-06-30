package db

import (
	"database/sql"
	"testing"

	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestMigrateAutoMigrateCreatesCoreSchema(t *testing.T) {
	testDB, err := sql.Open("sqlite", "file:migrate-automigrate?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = testDB.Close()
	})

	DB = testDB
	Gorm, err = gorm.Open(sqlitegorm.Dialector{Conn: testDB}, &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}

	Migrate()

	for _, table := range []string{
		"spaces",
		"users",
		"memories",
		"memory_photos",
		"notifications",
		"relationship_signals",
		"push_devices",
	} {
		if !tableExists(t, table) {
			t.Fatalf("expected table %s to exist", table)
		}
	}

	assertColumnExists(t, "memories", "deleted_at")
	assertColumnExists(t, "memories", "voice_text_url")
	assertColumnExists(t, "memories", "partner_voice_url")
	assertColumnExists(t, "memory_photos", "media_type")
	assertColumnExists(t, "whisper_replies", "voice_url")
	assertColumnExists(t, "time_capsules", "voice_url")
	assertColumnExists(t, "time_capsules", "open_mode")
	assertColumnExists(t, "time_capsules", "opened_by_user_ids")
	assertColumnExists(t, "time_capsules", "revealed_at")
	assertColumnExists(t, "anniversary_cards", "voice_url")
	assertColumnExists(t, "anniversary_cards", "bgm_url")
	assertColumnExists(t, "anniversary_cards", "bgm_preset")
	assertIndexExists(t, "idx_memories_space_date_order")
	assertIndexExists(t, "idx_notifications_user_read")
	assertIndexExists(t, "idx_relationship_signals_space_expires")
}

func tableExists(t *testing.T, tableName string) bool {
	t.Helper()
	var count int
	if err := DB.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, tableName).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count == 1
}

func assertColumnExists(t *testing.T, tableName string, columnName string) {
	t.Helper()
	rows, err := DB.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		t.Fatal(err)
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
			t.Fatal(err)
		}
		if name == columnName {
			return
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	t.Fatalf("expected column %s.%s to exist", tableName, columnName)
}

func assertIndexExists(t *testing.T, indexName string) {
	t.Helper()
	var count int
	if err := DB.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, indexName).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected index %s to exist", indexName)
	}
}
