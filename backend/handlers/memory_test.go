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
	"our-memories-backend/events"
)

func setupMemoryHandlerTestDB(t *testing.T) {
	t.Helper()
	cache.Clear()
	SetEventPublisher(events.NoopPublisher{})
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	config.Load()

	name := strings.NewReplacer("/", "-", " ", "-", ":", "-").Replace(t.Name())
	testDB, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cache.Clear()
		SetEventPublisher(events.NoopPublisher{})
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
		INSERT INTO memories (id, space_id, city_id, city, city_en, date, text, tags, visibility, created_by_id, deleted_at)
		VALUES ('memory-1', 'space-1', 'shanghai', '上海', 'Shanghai', '2026-06-28', 'soft deleted', '[]', 'both', 'user-1', '2026-06-01T00:00:00Z');
		INSERT INTO memories (id, space_id, city_id, city, city_en, date, text, tags, visibility, mood, created_by_id, created_at)
		VALUES
			('memory-2', 'space-1', 'hangzhou', '杭州', 'Hangzhou', '2026.06.29', '西湖下雨', '["雨","西湖"]', 'both', '想念', 'user-1', '2026-06-29T10:00:00Z'),
			('memory-3', 'space-1', 'suzhou', '苏州', 'Suzhou', '2026.06.28', '晴天散步', '["晴天"]', 'both', '开心', 'user-1', '2026-06-28T10:00:00Z'),
			('memory-4', 'space-1', 'hangzhou', '杭州', 'Hangzhou', '2026.06.27', '雨后晚风', '["雨"]', 'both', '平静', 'user-1', '2026-06-27T10:00:00Z'),
			('memory-5', 'space-1', 'hangzhou', '杭州', 'Hangzhou', '2024.06.29', '旧年桂花', '["桂花"]', 'both', '平静', 'user-1', '2024-06-29T10:00:00Z'),
			('memory-6', 'space-1', 'suzhou', '苏州', 'Suzhou', '2025.06.29', '另一座城', '["桂花"]', 'both', '平静', 'user-1', '2025-06-29T10:00:00Z'),
			('memory-7', 'space-1', 'hangzhou', '杭州', 'Hangzhou', '2025.12.01', '冬天很远', '["冬天"]', 'both', '平静', 'user-1', '2025-12-01T10:00:00Z');
		INSERT INTO memory_photos (id, memory_id, key, url, mime_type)
		VALUES ('photo-1', 'memory-1', 'space-1/memories/photo.jpg', 'https://cdn.example.com/space-1/memories/photo.jpg', 'image/jpeg');
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestGetMemoriesPaginationAndFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMemoryHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memories?limit=1&tags=雨", nil)
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	GetMemories(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected paged fetch to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var firstPage struct {
		Items      []map[string]any `json:"items"`
		NextCursor string           `json:"nextCursor"`
		HasMore    bool             `json:"hasMore"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &firstPage); err != nil {
		t.Fatal(err)
	}
	if len(firstPage.Items) != 1 || firstPage.Items[0]["id"] != "memory-2" || !firstPage.HasMore || firstPage.NextCursor == "" {
		t.Fatalf("unexpected first page: %#v", firstPage)
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memories?limit=20&tags=雨&cursor="+firstPage.NextCursor, nil)
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	GetMemories(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected second page to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var secondPage struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &secondPage); err != nil {
		t.Fatal(err)
	}
	if len(secondPage.Items) != 1 || secondPage.Items[0]["id"] != "memory-4" {
		t.Fatalf("unexpected second page: %#v", secondPage)
	}
}

func TestSearchMemories(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMemoryHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memories/search?q=西湖", nil)
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	SearchMemories(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected search to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var response struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Items) != 1 || response.Items[0]["id"] != "memory-2" {
		t.Fatalf("unexpected search response: %#v", response)
	}
}

func TestSearchMemoriesByIntent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMemoryHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/ai/memory-search", strings.NewReader(`{"q":"杭州的雨天"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	SearchMemoriesByIntent(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected intent search to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var response struct {
		Intent struct {
			CityID string   `json:"cityId"`
			Tags   []string `json:"tags"`
		} `json:"intent"`
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Intent.CityID != "hangzhou" || len(response.Intent.Tags) != 1 || response.Intent.Tags[0] != "雨" {
		t.Fatalf("unexpected intent: %#v", response.Intent)
	}
	gotIDs := map[string]bool{}
	for _, item := range response.Items {
		gotIDs[item["id"].(string)] = true
	}
	if !gotIDs["memory-2"] || !gotIDs["memory-4"] || gotIDs["memory-3"] {
		t.Fatalf("unexpected intent search items: %#v", response.Items)
	}
}

func TestGetRelatedMemories(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMemoryHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memories/memory-2/related", nil)
	c.Params = gin.Params{{Key: "id", Value: "memory-2"}}
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	GetRelatedMemories(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected related fetch to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var response struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	gotIDs := map[string]bool{}
	for _, item := range response.Items {
		gotIDs[item["id"].(string)] = true
	}
	if !gotIDs["memory-5"] || !gotIDs["memory-4"] {
		t.Fatalf("expected same-city nearby dates, got %#v", response.Items)
	}
	if gotIDs["memory-6"] || gotIDs["memory-7"] {
		t.Fatalf("unexpected different city or distant date in response: %#v", response.Items)
	}
}

func TestGetTrashedMemoriesHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMemoryHandlerTestDB(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memories/trash", nil)
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	GetTrashedMemories(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected trash fetch to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var response struct {
		Memories []map[string]any `json:"memories"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Memories) != 1 || response.Memories[0]["id"] != "memory-1" || response.Memories[0]["deletedAt"] == "" {
		t.Fatalf("unexpected trash response: %#v", response)
	}
}
