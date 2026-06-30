package events

import (
	"context"
	"errors"
	"time"
)

type Type string

const (
	MemoryCreated      Type = "memory.created"
	MemoryUpdated      Type = "memory.updated"
	MemoryDeleted      Type = "memory.deleted"
	MemoryViewed       Type = "memory.viewed"
	AnniversaryCreated Type = "anniversary.created"
	AnniversaryUpdated Type = "anniversary.updated"
	AnniversaryDeleted Type = "anniversary.deleted"
	AnniversaryNear    Type = "anniversary.near"
	TimeCapsuleCreated Type = "time_capsule.created"
	TimeCapsuleUpdated Type = "time_capsule.updated"
	TimeCapsuleOpened  Type = "time_capsule.opened"
	TimeCapsuleDeleted Type = "time_capsule.deleted"
	TimeCapsuleDue     Type = "time_capsule.due"
	WhisperCreated     Type = "whisper.created"
	WhisperReplied     Type = "whisper.replied"
	WhisperDeleted     Type = "whisper.deleted"
	WhisperTyping      Type = "whisper.typing"
	SignalCreated      Type = "signal.created"
)

type DomainEvent struct {
	Type       Type           `json:"type"`
	SpaceID    string         `json:"spaceId"`
	ActorID    string         `json:"actorId,omitempty"`
	TargetID   string         `json:"targetId,omitempty"`
	OccurredAt time.Time      `json:"occurredAt"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type Publisher interface {
	Publish(ctx context.Context, event DomainEvent) error
}

type PublisherFunc func(ctx context.Context, event DomainEvent) error

func (f PublisherFunc) Publish(ctx context.Context, event DomainEvent) error {
	return f(ctx, event)
}

type NoopPublisher struct{}

func (NoopPublisher) Publish(context.Context, DomainEvent) error {
	return nil
}

type Dispatcher struct {
	publishers []Publisher
}

func NewDispatcher(publishers ...Publisher) Dispatcher {
	return Dispatcher{publishers: publishers}
}

func (d Dispatcher) Publish(ctx context.Context, event DomainEvent) error {
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}

	errs := make([]error, 0, len(d.publishers))
	for _, publisher := range d.publishers {
		if publisher == nil {
			continue
		}
		if err := publisher.Publish(ctx, event); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func PublisherOrNoop(publisher Publisher) Publisher {
	if publisher == nil {
		return NoopPublisher{}
	}
	return publisher
}
