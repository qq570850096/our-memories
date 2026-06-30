package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/cache"
	"our-memories-backend/config"
	"our-memories-backend/db"
)

func setupNotificationHandlerTestDB(t *testing.T) {
	t.Helper()
	cache.Clear()
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	config.Load()

	name := strings.NewReplacer("/", "-", " ", "-", ":", "-").Replace(t.Name())
	testDB, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cache.Clear()
		_ = testDB.Close()
	})

	db.DB = testDB
	db.Gorm, err = gorm.Open(sqlitegorm.Dialector{Conn: testDB}, &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Migrate()

	_, err = db.DB.Exec(`
		INSERT INTO spaces (id, space_code, password_hash, name) VALUES ('space-1', 'space-one', 'hash', 'Space One');
		INSERT INTO users (id, space_id, username, display_name, role) VALUES ('user-1', 'space-1', 'me', 'Me', 'owner');
		INSERT INTO notifications (id, space_id, user_id, type, target_type, target_id, title, body, is_read, created_at)
		VALUES
			('notification-1', 'space-1', 'user-1', 'memory.created', 'memory', 'memory-1', 'New', 'Body', 0, '2026-06-29T00:00:00Z'),
			('notification-2', 'space-1', 'user-1', 'memory.updated', 'memory', 'memory-1', 'Read', 'Body', 1, '2026-06-28T00:00:00Z');
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestNotificationHandlersListAndMarkRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupNotificationHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/notifications", nil)
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")
	GetNotifications(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected list to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var response struct {
		Notifications []map[string]any `json:"notifications"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Notifications) != 2 || response.Notifications[0]["id"] != "notification-1" {
		t.Fatalf("unexpected notifications: %#v", response)
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/notification-1/read", nil)
	c.Params = gin.Params{{Key: "id", Value: "notification-1"}}
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")
	MarkNotificationRead(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected mark read to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var unread int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = 'user-1' AND is_read = 0`).Scan(&unread); err != nil {
		t.Fatal(err)
	}
	if unread != 0 {
		t.Fatalf("expected notification to be read, unread=%d", unread)
	}
}
