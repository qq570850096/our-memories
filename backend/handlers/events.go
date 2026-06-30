package handlers

import "our-memories-backend/events"

var domainPublisher events.Publisher = events.NoopPublisher{}

func SetEventPublisher(publisher events.Publisher) {
	domainPublisher = events.PublisherOrNoop(publisher)
}
