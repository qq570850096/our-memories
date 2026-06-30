package events

import (
	"context"
	"encoding/json"
	"testing"
)

type fakePushSender struct {
	spaceID string
	actorID string
	title   string
	content string
}

func (s *fakePushSender) SendToSpaceExcept(spaceID string, actorID string, title string, content string) error {
	s.spaceID = spaceID
	s.actorID = actorID
	s.title = title
	s.content = content
	return nil
}

func TestDispatcherFansOutMemoryCreatedToPushNotificationAndWS(t *testing.T) {
	push := &fakePushSender{}
	notifications := &fakeNotificationStore{}
	hub := NewConnectionHub()
	actor := &Connection{SpaceID: "space-1", UserID: "user-1", Send: make(chan []byte, 1)}
	partner := &Connection{SpaceID: "space-1", UserID: "user-2", Send: make(chan []byte, 1)}
	hub.Add(actor)
	hub.Add(partner)
	defer hub.Remove(actor)
	defer hub.Remove(partner)

	dispatcher := NewDispatcher(
		NewJPushPublisher(push),
		NewNotificationPublisher(notifications, fakeSpaceUsers{userIDs: []string{"user-2"}}),
		NewWSPublisher(hub),
	)

	err := dispatcher.Publish(context.Background(), DomainEvent{
		Type:     MemoryCreated,
		SpaceID:  "space-1",
		ActorID:  "user-1",
		TargetID: "memory-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if push.spaceID != "space-1" || push.actorID != "user-1" || push.title == "" || push.content == "" {
		t.Fatalf("expected push sender to receive memory event, got %#v", push)
	}
	if notifications.spaceID != "space-1" || notifications.eventType != string(MemoryCreated) || notifications.targetID != "memory-1" {
		t.Fatalf("expected notification to be persisted, got %#v", notifications)
	}
	select {
	case <-actor.Send:
		t.Fatal("expected actor ws connection to be skipped")
	default:
	}
	select {
	case payload := <-partner.Send:
		var message WSMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type != MemoryCreated || message.TargetID != "memory-1" {
			t.Fatalf("unexpected ws message: %#v", message)
		}
	default:
		t.Fatal("expected partner to receive ws event")
	}
}
