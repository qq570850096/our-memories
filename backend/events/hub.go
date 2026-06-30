package events

import (
	"encoding/json"
	"sync"
	"time"
)

type WSMessage struct {
	Type       Type           `json:"type"`
	SpaceID    string         `json:"spaceId"`
	ActorID    string         `json:"actorId,omitempty"`
	TargetID   string         `json:"targetId,omitempty"`
	OccurredAt time.Time      `json:"occurredAt"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type Connection struct {
	SpaceID string
	UserID  string
	Send    chan []byte
}

type ConnectionHub struct {
	mu          sync.RWMutex
	connections map[string]map[*Connection]struct{}
}

func NewConnectionHub() *ConnectionHub {
	return &ConnectionHub{connections: map[string]map[*Connection]struct{}{}}
}

func (h *ConnectionHub) Add(conn *Connection) {
	if h == nil || conn == nil || conn.SpaceID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.connections[conn.SpaceID] == nil {
		h.connections[conn.SpaceID] = map[*Connection]struct{}{}
	}
	h.connections[conn.SpaceID][conn] = struct{}{}
}

func (h *ConnectionHub) Remove(conn *Connection) {
	if h == nil || conn == nil || conn.SpaceID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	conns := h.connections[conn.SpaceID]
	if conns == nil {
		return
	}
	delete(conns, conn)
	close(conn.Send)
	if len(conns) == 0 {
		delete(h.connections, conn.SpaceID)
	}
}

func (h *ConnectionHub) Broadcast(event DomainEvent) error {
	if h == nil || event.SpaceID == "" {
		return nil
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	payload, err := json.Marshal(WSMessage{
		Type:       event.Type,
		SpaceID:    event.SpaceID,
		ActorID:    event.ActorID,
		TargetID:   event.TargetID,
		OccurredAt: event.OccurredAt,
		Metadata:   event.Metadata,
	})
	if err != nil {
		return err
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.connections[event.SpaceID] {
		if event.ActorID != "" && conn.UserID == event.ActorID {
			continue
		}
		select {
		case conn.Send <- payload:
		default:
		}
	}
	return nil
}
