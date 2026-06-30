package services

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/cache"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/events"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

type recordedEvents struct {
	items []events.DomainEvent
}

func (r *recordedEvents) Publish(_ context.Context, event events.DomainEvent) error {
	r.items = append(r.items, event)
	return nil
}

func setupServiceTestDB(t *testing.T) {
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
		INSERT INTO users (id, space_id, username, display_name, role) VALUES
			('user-1', 'space-1', 'me', 'Me', 'owner'),
			('user-2', 'space-1', 'her', 'Her', 'member');
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestMemoryServiceCreateAndPartnerNoteUpdate(t *testing.T) {
	setupServiceTestDB(t)
	recorder := &recordedEvents{}
	upload := func(_ string, _ string, photos []PhotoInput) error {
		for i := range photos {
			if photos[i].Key == "" {
				photos[i].Key = "uploaded-key"
			}
		}
		return nil
	}
	loader := func(_ string, _ string) (map[string][]gin.H, error) {
		return map[string][]gin.H{"shanghai": {{"id": "loaded-memory"}}}, nil
	}
	service := NewMemoryService(
		repositories.NewMemoryRepository(db.Gorm),
		loader,
		upload,
		func(string, []StoredPhoto) error { return nil },
		recorder,
	)

	cache.Set("memories:space-1:user-1:summary", "stale", time.Hour)
	memoryID, memories, err := service.Create("space-1", "user-1", CreateMemoryRequest{
		CityID:     "shanghai",
		City:       "上海",
		CityEn:     "Shanghai",
		Date:       "2026.06.28",
		Text:       "first memory",
		Visibility: "",
		Photos: []PhotoInput{{
			URL:      "https://cdn.example.com/photo.jpg",
			MimeType: "image/jpeg",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if memories["shanghai"][0]["id"] != "loaded-memory" {
		t.Fatalf("expected reloaded memories, got %#v", memories)
	}
	if _, found := cache.Get("memories:space-1:user-1:summary"); found {
		t.Fatal("expected memory cache to be cleared after create")
	}

	var visibility, photoKey string
	if err := db.DB.QueryRow(`SELECT visibility FROM memories WHERE id = ?`, memoryID).Scan(&visibility); err != nil {
		t.Fatal(err)
	}
	if visibility != "both" {
		t.Fatalf("expected default visibility both, got %q", visibility)
	}
	if err := db.DB.QueryRow(`SELECT key FROM memory_photos WHERE memory_id = ?`, memoryID).Scan(&photoKey); err != nil {
		t.Fatal(err)
	}
	if photoKey != "uploaded-key" {
		t.Fatalf("expected uploaded key to be persisted, got %q", photoKey)
	}
	if len(recorder.items) != 1 || recorder.items[0].Type != events.MemoryCreated || recorder.items[0].TargetID != memoryID {
		t.Fatalf("expected memory.created event, got %#v", recorder.items)
	}

	if _, err := service.Update("space-1", "user-2", memoryID, UpdateMemoryRequest{Title: "not allowed"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected non-creator field update to be forbidden, got %v", err)
	}

	note := "  partner note  "
	if _, err := service.Update("space-1", "user-2", memoryID, UpdateMemoryRequest{PartnerNote: &note}); err != nil {
		t.Fatal(err)
	}
	var partnerNote, authorID string
	if err := db.DB.QueryRow(`SELECT partner_note, partner_note_author_id FROM memories WHERE id = ?`, memoryID).Scan(&partnerNote, &authorID); err != nil {
		t.Fatal(err)
	}
	if partnerNote != "partner note" || authorID != "user-2" {
		t.Fatalf("expected partner note by user-2, got note=%q author=%q", partnerNote, authorID)
	}
	if len(recorder.items) != 2 || recorder.items[1].Type != events.MemoryUpdated {
		t.Fatalf("expected memory.updated event, got %#v", recorder.items)
	}
}

func TestMemoryServiceDeleteRestoresAndDefersPhotoCleanup(t *testing.T) {
	setupServiceTestDB(t)
	recorder := &recordedEvents{}
	deleteCalls := 0
	loader := func(_ string, _ string) (map[string][]gin.H, error) {
		return map[string][]gin.H{"shanghai": {}}, nil
	}
	service := NewMemoryService(
		repositories.NewMemoryRepository(db.Gorm),
		loader,
		func(string, string, []PhotoInput) error { return nil },
		func(string, []StoredPhoto) error {
			deleteCalls++
			return nil
		},
		recorder,
	)

	memoryID, _, err := service.Create("space-1", "user-1", CreateMemoryRequest{
		CityID:     "shanghai",
		City:       "上海",
		CityEn:     "Shanghai",
		Date:       "2026-06-28",
		Text:       "keep this",
		Visibility: "both",
		Photos: []PhotoInput{{
			Key:      "space-1/memories/photo.jpg",
			URL:      "https://cdn.example.com/space-1/memories/photo.jpg",
			MimeType: "image/jpeg",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.Delete("space-1", "user-2", memoryID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected non-creator delete to be forbidden, got %v", err)
	}
	if _, err := service.Delete("space-1", "user-1", memoryID); err != nil {
		t.Fatal(err)
	}
	if deleteCalls != 0 {
		t.Fatalf("expected soft delete not to delete photos immediately, got %d calls", deleteCalls)
	}

	var activeCount, photoCount int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM memories WHERE id = ? AND deleted_at IS NULL`, memoryID).Scan(&activeCount); err != nil {
		t.Fatal(err)
	}
	if activeCount != 0 {
		t.Fatalf("expected deleted memory to be hidden from active query, got %d", activeCount)
	}
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM memory_photos WHERE memory_id = ?`, memoryID).Scan(&photoCount); err != nil {
		t.Fatal(err)
	}
	if photoCount != 1 {
		t.Fatalf("expected photos to remain while memory is in trash, got %d", photoCount)
	}

	trash, err := service.ListTrash("space-1", "user-2")
	if err != nil {
		t.Fatal(err)
	}
	if len(trash) != 1 || trash[0]["id"] != memoryID || trash[0]["deletedAt"] == "" {
		t.Fatalf("expected memory in trash with deletedAt, got %#v", trash)
	}

	if _, err := service.Restore("space-1", "user-2", memoryID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected non-creator restore to be forbidden, got %v", err)
	}
	if _, err := service.Restore("space-1", "user-1", memoryID); err != nil {
		t.Fatal(err)
	}
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM memories WHERE id = ? AND deleted_at IS NULL`, memoryID).Scan(&activeCount); err != nil {
		t.Fatal(err)
	}
	if activeCount != 1 {
		t.Fatalf("expected memory to be restored, got active count %d", activeCount)
	}
	if len(recorder.items) != 3 || recorder.items[1].Type != events.MemoryDeleted || recorder.items[2].Type != events.MemoryUpdated {
		t.Fatalf("expected create/delete/restore events, got %#v", recorder.items)
	}
}

func TestAnniversaryServicePermissionsPhotoCleanupAndEvents(t *testing.T) {
	setupServiceTestDB(t)
	recorder := &recordedEvents{}
	deleted := []StoredPhoto{}
	service := NewAnniversaryService(
		repositories.NewAnniversaryRepository(db.Gorm),
		func(string, string, []PhotoInput) error { return nil },
		func(_ string, photos []StoredPhoto) error {
			deleted = append(deleted, photos...)
			return nil
		},
		recorder,
	)

	cache.Set("anniversary-cards:space-1", "stale", time.Hour)
	cardID, err := service.Create("space-1", "user-1", CreateAnniversaryCardRequest{
		Title:        "First date",
		Date:         "2026-06-28",
		Note:         "remember",
		RepeatYearly: true,
		Pinned:       true,
		Photos: []PhotoInput{
			{Key: "old-key-1", URL: "https://cdn.example.com/old-1.jpg", MimeType: "image/jpeg"},
			{Key: "old-key-2", URL: "https://cdn.example.com/old-2.jpg", MimeType: "image/jpeg"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, found := cache.Get("anniversary-cards:space-1"); found {
		t.Fatal("expected anniversary cache to be cleared after create")
	}
	if len(recorder.items) != 1 || recorder.items[0].Type != events.AnniversaryCreated || recorder.items[0].TargetID != cardID {
		t.Fatalf("expected anniversary.created event, got %#v", recorder.items)
	}

	nextPhotos := []PhotoInput{
		{Key: "old-key-2", URL: "https://cdn.example.com/old-2.jpg", MimeType: "image/jpeg"},
		{Key: "new-key", URL: "https://cdn.example.com/new.jpg", MimeType: "image/jpeg"},
	}
	if err := service.Update("space-1", "user-2", cardID, UpdateAnniversaryCardRequest{Title: "not allowed"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected non-creator anniversary update to be forbidden, got %v", err)
	}
	cache.Set("anniversary-cards:space-1", "stale", time.Hour)
	if err := service.Update("space-1", "user-1", cardID, UpdateAnniversaryCardRequest{
		Title:  "Updated date",
		Date:   "2026-06-29",
		Note:   "updated",
		Photos: &nextPhotos,
	}); err != nil {
		t.Fatal(err)
	}
	if _, found := cache.Get("anniversary-cards:space-1"); found {
		t.Fatal("expected anniversary cache to be cleared after update")
	}
	if len(deleted) != 1 || deleted[0].Key != "old-key-1" {
		t.Fatalf("expected only removed anniversary photo to be deleted after update, got %#v", deleted)
	}

	var photoCount int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM anniversary_photos WHERE anniversary_card_id = ?`, cardID).Scan(&photoCount); err != nil {
		t.Fatal(err)
	}
	if photoCount != 2 {
		t.Fatalf("expected replacement photos to be persisted, got %d", photoCount)
	}
	if len(recorder.items) != 2 || recorder.items[1].Type != events.AnniversaryUpdated {
		t.Fatalf("expected anniversary.updated event, got %#v", recorder.items)
	}

	if err := service.Delete("space-1", "user-2", cardID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected non-creator anniversary delete to be forbidden, got %v", err)
	}
	if err := service.Delete("space-1", "user-1", cardID); err != nil {
		t.Fatal(err)
	}
	if len(recorder.items) != 3 || recorder.items[2].Type != events.AnniversaryDeleted {
		t.Fatalf("expected anniversary.deleted event, got %#v", recorder.items)
	}
	if len(deleted) != 3 {
		t.Fatalf("expected update cleanup plus delete cleanup, got %#v", deleted)
	}
}

func TestSettingServiceDefaultsAndAuxiliaryItems(t *testing.T) {
	setupServiceTestDB(t)
	t.Setenv("DEFAULT_ANNIVERSARY_DATE", "2026-06-28")
	t.Setenv("DEFAULT_ANNIVERSARY_LABEL", "Together")
	service := NewSettingService(repositories.NewSettingRepository(db.Gorm))

	settings, err := service.List("space-1")
	if err != nil {
		t.Fatal(err)
	}
	if settings["anniversaryDate"] != "2026-06-28" || settings["anniversaryLabel"] != "Together" {
		t.Fatalf("expected env defaults when settings are missing, got %#v", settings)
	}

	if err := service.Upsert("space-1", "anniversaryDate", "2026-07-01"); err != nil {
		t.Fatal(err)
	}
	settings, err = service.List("space-1")
	if err != nil {
		t.Fatal(err)
	}
	if settings["anniversaryDate"] != "2026-07-01" {
		t.Fatalf("expected stored setting to override env default, got %#v", settings)
	}

	agentSettings, err := service.AgentSettings("space-1")
	if err != nil {
		t.Fatal(err)
	}
	if agentSettings.Enabled {
		t.Fatalf("expected agent to default off, got %#v", agentSettings)
	}
	if err := service.UpdateAgentSettings("space-1", AgentSettings{Enabled: true}); err != nil {
		t.Fatal(err)
	}
	agentSettings, err = service.AgentSettings("space-1")
	if err != nil {
		t.Fatal(err)
	}
	if !agentSettings.Enabled {
		t.Fatalf("expected agent to be enabled, got %#v", agentSettings)
	}
	ignored, err := service.IgnoreAgentSuggestion("space-1", IgnoreAgentSuggestionRequest{
		Agent:    "memory_mood",
		TargetID: "memory-1",
		Reason:   "not now",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ignored) != 1 || ignored[0].IgnoredAt == "" {
		t.Fatalf("unexpected ignored suggestions: %#v", ignored)
	}
	ignored, err = service.IgnoreAgentSuggestion("space-1", IgnoreAgentSuggestionRequest{
		Agent:    "memory_mood",
		TargetID: "memory-1",
		Reason:   "still no",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ignored) != 1 || ignored[0].Reason != "still no" {
		t.Fatalf("expected duplicate ignore to update in place, got %#v", ignored)
	}

	itemID, err := service.CreateAuxiliaryItem("space-1", CreateAuxiliaryItemRequest{
		Kind: "wishlist", Title: "Go to Chengdu", Date: "2026-10-01", Note: "hotpot", CityID: "chengdu",
	})
	if err != nil {
		t.Fatal(err)
	}
	items, err := service.ListAuxiliaryItems("space-1", "wishlist")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != itemID || items[0].Title != "Go to Chengdu" {
		t.Fatalf("unexpected auxiliary items: %#v", items)
	}
	if err := service.UpdateAuxiliaryItem("space-1", itemID, UpdateAuxiliaryItemRequest{
		Title: "Go to Dali", Date: "2026-11-01", Note: "lake", CityID: "dali",
	}); err != nil {
		t.Fatal(err)
	}
	items, err = service.ListAuxiliaryItems("space-1", "wishlist")
	if err != nil {
		t.Fatal(err)
	}
	if items[0].Title != "Go to Dali" || items[0].CityID != "dali" {
		t.Fatalf("expected updated auxiliary item, got %#v", items[0])
	}
	if err := service.DeleteAuxiliaryItem("space-1", itemID); err != nil {
		t.Fatal(err)
	}
	items, err = service.ListAuxiliaryItems("space-1", "wishlist")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("expected auxiliary item to be deleted, got %#v", items)
	}
}

func TestAccountServiceLoginPasswordAndAdminRules(t *testing.T) {
	setupServiceTestDB(t)
	service := NewAccountService(repositories.NewAccountRepository(db.Gorm))
	if _, err := db.DB.Exec(`UPDATE spaces SET password_hash = ? WHERE id = 'space-1'`, utils.HashPassword("correct-password")); err != nil {
		t.Fatal(err)
	}

	if _, err := service.Login(LoginRequest{SpaceCode: "space-one", Password: "wrong-password", UserID: "me"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected invalid credentials for wrong password, got %v", err)
	}
	login, err := service.Login(LoginRequest{SpaceCode: "space-one", Password: "correct-password", UserID: "me"})
	if err != nil {
		t.Fatal(err)
	}
	if login.AccessToken == "" || login.RefreshToken == "" || login.User.ID != "user-1" || login.Space.ID != "space-1" {
		t.Fatalf("unexpected login result: %#v", login)
	}

	if err := service.UpdatePassword("space-1", "short"); !errors.Is(err, ErrInvalidPasswordLength) {
		t.Fatalf("expected password length error, got %v", err)
	}
	if err := service.UpdatePassword("space-1", "new-valid-password"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Login(LoginRequest{SpaceCode: "space-one", Password: "new-valid-password", UserID: "me"}); err != nil {
		t.Fatalf("expected login with updated password, got %v", err)
	}

	admin, err := service.CreateAdmin("admin", "admin-password", "Admin User")
	if err != nil {
		t.Fatal(err)
	}
	if admin.ID == "" || admin.Username != "admin" || admin.DisplayName != "Admin User" {
		t.Fatalf("unexpected admin: %#v", admin)
	}
	if _, err := service.CreateAdmin("admin", "admin-password", "Admin User"); !errors.Is(err, ErrAdminAlreadyExists) {
		t.Fatalf("expected duplicate admin error, got %v", err)
	}
	if _, err := service.AdminLogin(AdminLoginRequest{Username: "admin", Password: "bad-password"}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected invalid admin credentials, got %v", err)
	}
	adminLogin, err := service.AdminLogin(AdminLoginRequest{Username: "admin", Password: "admin-password"})
	if err != nil {
		t.Fatal(err)
	}
	if adminLogin.Token == "" || adminLogin.Admin.ID != admin.ID {
		t.Fatalf("unexpected admin login: %#v", adminLogin)
	}
}

func TestTimeCapsuleServiceLimitAndOpenRules(t *testing.T) {
	setupServiceTestDB(t)
	recorder := &recordedEvents{}
	uploadCalls := 0
	service := NewTimeCapsuleService(
		repositories.NewTimeCapsuleRepository(db.Gorm),
		func(string, string, []PhotoInput) error {
			uploadCalls++
			return nil
		},
		func(string, []StoredPhoto) error { return nil },
		recorder,
	)

	future := time.Now().UTC().AddDate(0, 0, 3).Format("2006-01-02")
	_, err := db.DB.Exec(`
		INSERT INTO time_capsules (id, space_id, title, open_date, content, created_by_id) VALUES
			('future-1', 'space-1', 'Future 1', ?, 'locked', 'user-1'),
			('future-2', 'space-1', 'Future 2', ?, 'locked', 'user-1'),
			('future-3', 'space-1', 'Future 3', ?, 'locked', 'user-1');
	`, future, future, future)
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.Create("space-1", "user-1", CreateTimeCapsuleRequest{
		Title:    "Too many",
		OpenDate: future,
		Content:  "wait",
	})
	if !errors.Is(err, ErrTimeCapsuleLimit) {
		t.Fatalf("expected unopened limit error, got %v", err)
	}
	if uploadCalls != 0 {
		t.Fatalf("expected upload not to run when limit is reached, got %d calls", uploadCalls)
	}

	if err := service.Open("space-1", "user-1", "future-1"); !errors.Is(err, ErrTimeCapsuleLocked) {
		t.Fatalf("expected locked capsule error, got %v", err)
	}

	past := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	if _, err := db.DB.Exec(
		`INSERT INTO time_capsules (id, space_id, title, open_date, content, created_by_id) VALUES ('past-1', 'space-1', 'Past', ?, 'open', 'user-1')`,
		past,
	); err != nil {
		t.Fatal(err)
	}
	if err := service.Open("space-1", "user-1", "past-1"); err != nil {
		t.Fatal(err)
	}
	var opened int
	if err := db.DB.QueryRow(`SELECT is_opened FROM time_capsules WHERE id = 'past-1'`).Scan(&opened); err != nil {
		t.Fatal(err)
	}
	if opened != 1 {
		t.Fatalf("expected capsule to be marked opened, got %d", opened)
	}
	if len(recorder.items) != 1 || recorder.items[0].Type != events.TimeCapsuleOpened || recorder.items[0].TargetID != "past-1" {
		t.Fatalf("expected time_capsule.opened event, got %#v", recorder.items)
	}

	if _, err := db.DB.Exec(
		`INSERT INTO time_capsules (id, space_id, title, open_date, content, open_mode, opened_by_user_ids, created_by_id) VALUES ('together-1', 'space-1', 'Together', ?, 'wait together', 'together', '[]', 'user-1')`,
		past,
	); err != nil {
		t.Fatal(err)
	}
	if err := service.Open("space-1", "user-1", "together-1"); err != nil {
		t.Fatal(err)
	}
	var firstOpened int
	var openedBy string
	if err := db.DB.QueryRow(`SELECT is_opened, opened_by_user_ids FROM time_capsules WHERE id = 'together-1'`).Scan(&firstOpened, &openedBy); err != nil {
		t.Fatal(err)
	}
	if firstOpened != 0 || !strings.Contains(openedBy, "user-1") {
		t.Fatalf("expected first ready without reveal, opened=%d openedBy=%s", firstOpened, openedBy)
	}
	if err := service.Open("space-1", "user-2", "together-1"); err != nil {
		t.Fatal(err)
	}
	var secondOpened int
	var revealedAt string
	if err := db.DB.QueryRow(`SELECT is_opened, revealed_at FROM time_capsules WHERE id = 'together-1'`).Scan(&secondOpened, &revealedAt); err != nil {
		t.Fatal(err)
	}
	if secondOpened != 1 || revealedAt == "" {
		t.Fatalf("expected second ready to reveal, opened=%d revealedAt=%q", secondOpened, revealedAt)
	}
}

func TestCanOpenTimeCapsuleUsesLocalDayForDateOnlyValues(t *testing.T) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 6, 30, 7, 30, 0, 0, location)
	if !canOpenTimeCapsuleAt("2026-06-30", now) {
		t.Fatal("expected date-only capsule to open on the local calendar day")
	}
	if canOpenTimeCapsuleAt("2026-07-01", now) {
		t.Fatal("expected future local calendar day to stay locked")
	}
}

func TestBackupServiceImportRewritesMediaURLsAndReportsCacheScope(t *testing.T) {
	setupServiceTestDB(t)
	t.Setenv("S3_PUBLIC_BASE_URL", "https://new-cdn.example.com/assets")
	config.Load()

	service := NewBackupService(repositories.NewBackupRepository(db.Gorm))
	payload := BackupPayload{
		Format:  BackupFormat,
		Version: BackupVersion,
		Space: repositories.BackupRow{
			"id":            "backup-space",
			"space_code":    "backup",
			"password_hash": "backup-hash",
			"name":          "Backup Space",
		},
		Tables: BackupTableRows{
			"users": {
				{"id": "backup-user", "space_id": "backup-space", "username": "me", "display_name": "Backup User"},
			},
			"memories": {
				{
					"id": "backup-memory", "space_id": "backup-space", "city_id": "shanghai",
					"city": "上海", "city_en": "Shanghai", "date": "2026.06.28", "text": "hello",
					"created_by_id": "backup-user",
				},
			},
			"memory_photos": {
				{
					"id": "backup-photo", "memory_id": "backup-memory", "key": "backup-space/memories/photo.jpg",
					"url": "https://old-cdn.example.com/backup-space/memories/photo.jpg", "mime_type": "image/jpeg",
				},
			},
		},
		Media: []BackupMediaReference{{
			Kind: "memory_photo", ID: "backup-photo", ParentID: "backup-memory",
			Key: "backup-space/memories/photo.jpg", URL: "https://old-cdn.example.com/backup-space/memories/photo.jpg",
		}},
	}

	result, err := service.Import("space-1", false, payload)
	if err != nil {
		t.Fatal(err)
	}
	if !result.ReloginRequired || result.SpaceID != "backup-space" || result.SpaceCode != "backup" {
		t.Fatalf("unexpected import result: %#v", result)
	}
	if strings.Join(result.CacheSpaceIDs, ",") != "backup-space,space-1" {
		t.Fatalf("unexpected cache scope: %#v", result.CacheSpaceIDs)
	}

	var targetCount int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM spaces WHERE id = 'space-1'`).Scan(&targetCount); err != nil {
		t.Fatal(err)
	}
	if targetCount != 0 {
		t.Fatalf("expected current space to be replaced, found %d rows", targetCount)
	}
	var photoURL string
	if err := db.DB.QueryRow(`SELECT url FROM memory_photos WHERE id = 'backup-photo'`).Scan(&photoURL); err != nil {
		t.Fatal(err)
	}
	wantURL := "https://new-cdn.example.com/assets/backup-space/memories/photo.jpg"
	if photoURL != wantURL {
		t.Fatalf("expected rewritten photo url %q, got %q", wantURL, photoURL)
	}
}
