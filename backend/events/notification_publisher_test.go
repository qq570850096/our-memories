package events

import (
	"context"
	"testing"
)

type fakeNotificationStore struct {
	spaceID    string
	userIDs    []string
	eventType  string
	targetType string
	targetID   string
	title      string
	body       string
}

func (s *fakeNotificationStore) CreateForUsers(spaceID string, userIDs []string, eventType string, targetType string, targetID string, title string, body string) error {
	s.spaceID = spaceID
	s.userIDs = append([]string{}, userIDs...)
	s.eventType = eventType
	s.targetType = targetType
	s.targetID = targetID
	s.title = title
	s.body = body
	return nil
}

type fakeSpaceUsers struct {
	userIDs []string
}

func (u fakeSpaceUsers) UserIDsForSpaceExcept(string, string) ([]string, error) {
	return u.userIDs, nil
}

func TestNotificationPublisherPersistsRecognizedEvents(t *testing.T) {
	store := &fakeNotificationStore{}
	publisher := NewNotificationPublisher(store, fakeSpaceUsers{userIDs: []string{"user-2"}})

	err := publisher.Publish(context.Background(), DomainEvent{
		Type:     MemoryCreated,
		SpaceID:  "space-1",
		ActorID:  "user-1",
		TargetID: "memory-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if store.spaceID != "space-1" || len(store.userIDs) != 1 || store.userIDs[0] != "user-2" {
		t.Fatalf("unexpected recipients: %#v", store)
	}
	if store.eventType != string(MemoryCreated) || store.targetType != "memory" || store.targetID != "memory-1" {
		t.Fatalf("unexpected notification target: %#v", store)
	}
	if store.title == "" || store.body == "" {
		t.Fatalf("expected notification copy, got %#v", store)
	}
}
