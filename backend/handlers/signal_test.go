package handlers

import (
	"bytes"
	"context"
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

type signalEventRecorder struct {
	items []events.DomainEvent
}

func (r *signalEventRecorder) Publish(_ context.Context, event events.DomainEvent) error {
	r.items = append(r.items, event)
	return nil
}

func setupSignalHandlerTestDB(t *testing.T) {
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
		INSERT INTO users (id, space_id, username, display_name, role) VALUES
			('user-1', 'space-1', 'me', 'Me', 'owner'),
			('user-2', 'space-1', 'ta', 'Ta', 'member');
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestCreateSignalPersistsAndPublishesEvent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)
	recorder := &signalEventRecorder{}
	SetEventPublisher(recorder)

	body, err := json.Marshal(gin.H{"cityId": "hangzhou", "message": "想你"})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/signals", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("spaceID", "space-1")
	c.Set("userID", "user-1")

	CreateSignal(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected create signal to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM relationship_signals WHERE space_id = 'space-1' AND sender_user_id = 'user-1' AND city_id = 'hangzhou'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected one signal, got %d", count)
	}
	if len(recorder.items) != 1 || recorder.items[0].Type != events.SignalCreated {
		t.Fatalf("expected signal.created event, got %#v", recorder.items)
	}
}
