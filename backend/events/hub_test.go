package events

import (
	"encoding/json"
	"testing"
)

func TestConnectionHubBroadcastSkipsActor(t *testing.T) {
	hub := NewConnectionHub()
	actor := &Connection{SpaceID: "space-1", UserID: "user-1", Send: make(chan []byte, 1)}
	partner := &Connection{SpaceID: "space-1", UserID: "user-2", Send: make(chan []byte, 1)}
	hub.Add(actor)
	hub.Add(partner)
	defer hub.Remove(actor)
	defer hub.Remove(partner)

	err := hub.Broadcast(DomainEvent{
		Type:     SignalCreated,
		SpaceID:  "space-1",
		ActorID:  "user-1",
		TargetID: "signal-1",
	})
	if err != nil {
		t.Fatal(err)
	}

	select {
	case <-actor.Send:
		t.Fatal("expected actor connection to be skipped")
	default:
	}

	select {
	case payload := <-partner.Send:
		var message WSMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type != SignalCreated || message.TargetID != "signal-1" {
			t.Fatalf("unexpected ws message: %#v", message)
		}
	default:
		t.Fatal("expected partner to receive ws message")
	}
}
