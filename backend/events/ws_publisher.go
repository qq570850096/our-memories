package events

import "context"

type WSPublisher struct {
	hub *ConnectionHub
}

func NewWSPublisher(hub *ConnectionHub) *WSPublisher {
	return &WSPublisher{hub: hub}
}

func (p *WSPublisher) Publish(_ context.Context, event DomainEvent) error {
	if p == nil || p.hub == nil {
		return nil
	}
	return p.hub.Broadcast(event)
}
