package jobs

import (
	"context"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
	"our-memories-backend/cache"
	"our-memories-backend/events"
	"our-memories-backend/repositories"
)

type scheduledTimeCapsule struct {
	ID      string `gorm:"column:id"`
	SpaceID string `gorm:"column:space_id"`
}

type scheduledAnniversary struct {
	ID           string `gorm:"column:id"`
	SpaceID      string `gorm:"column:space_id"`
	Title        string `gorm:"column:title"`
	Date         string `gorm:"column:date"`
	RepeatYearly int    `gorm:"column:repeat_yearly"`
}

func StartScheduler(database *gorm.DB, publisher events.Publisher) {
	if database == nil {
		log.Printf("scheduler disabled: database is nil")
		return
	}
	publisher = events.PublisherOrNoop(publisher)
	log.Printf("scheduler started: interval=%s", time.Hour)

	go func() {
		time.Sleep(5 * time.Second)
		runAndLogScheduler(database, publisher)

		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runAndLogScheduler(database, publisher)
		}
	}()
}

func runAndLogScheduler(database *gorm.DB, publisher events.Publisher) {
	start := time.Now()
	dispatched, err := RunSchedulerOnce(context.Background(), database, publisher, start.UTC())
	if err != nil {
		log.Printf("scheduler finished with errors: dispatched=%d duration=%s err=%v", dispatched, time.Since(start).Round(time.Millisecond), err)
		return
	}
	if dispatched > 0 {
		log.Printf("scheduler finished: dispatched=%d duration=%s", dispatched, time.Since(start).Round(time.Millisecond))
	}
}

func RunSchedulerOnce(ctx context.Context, database *gorm.DB, publisher events.Publisher, now time.Time) (int, error) {
	if database == nil {
		return 0, nil
	}
	publisher = events.PublisherOrNoop(publisher)

	count, err := dispatchDueTimeCapsules(ctx, database, publisher, now)
	if err != nil {
		return count, err
	}
	anniversaryCount, err := dispatchNearAnniversaries(ctx, database, publisher, now)
	count += anniversaryCount
	if err != nil {
		return count, err
	}
	if err := cleanupReadNotifications(database, now); err != nil {
		return count, err
	}
	return count, cleanupExpiredSignals(database, now)
}

func dispatchDueTimeCapsules(ctx context.Context, database *gorm.DB, publisher events.Publisher, now time.Time) (int, error) {
	var capsules []scheduledTimeCapsule
	if err := database.
		Table("time_capsules").
		Select("id, space_id").
		Where("date(open_date) <= date(?) AND is_opened = 0", now.Format("2006-01-02")).
		Find(&capsules).
		Error; err != nil {
		return 0, err
	}

	dispatched := 0
	for _, capsule := range capsules {
		cacheKey := schedulerCacheKey(events.TimeCapsuleDue, capsule.SpaceID, capsule.ID, now)
		if _, found := cache.Get(cacheKey); found {
			continue
		}
		if err := publisher.Publish(ctx, events.DomainEvent{
			Type:     events.TimeCapsuleDue,
			SpaceID:  capsule.SpaceID,
			TargetID: capsule.ID,
		}); err != nil {
			return dispatched, err
		}
		cache.Set(cacheKey, true, nextDayTTL(now))
		dispatched++
	}
	return dispatched, nil
}

func dispatchNearAnniversaries(ctx context.Context, database *gorm.DB, publisher events.Publisher, now time.Time) (int, error) {
	var cards []scheduledAnniversary
	if err := database.
		Table("anniversary_cards").
		Select("id, space_id, title, date, repeat_yearly").
		Find(&cards).
		Error; err != nil {
		return 0, err
	}

	today := startOfDay(now)
	dispatched := 0
	for _, card := range cards {
		days, ok := daysUntilAnniversary(card.Date, card.RepeatYearly == 1, today)
		if !ok || days < -3 || days > 3 {
			continue
		}
		cacheKey := schedulerCacheKey(events.AnniversaryNear, card.SpaceID, card.ID, now)
		if _, found := cache.Get(cacheKey); found {
			continue
		}
		if err := publisher.Publish(ctx, events.DomainEvent{
			Type:     events.AnniversaryNear,
			SpaceID:  card.SpaceID,
			TargetID: card.ID,
			Metadata: map[string]any{
				"title": card.Title,
				"days":  days,
			},
		}); err != nil {
			return dispatched, err
		}
		cache.Set(cacheKey, true, nextDayTTL(now))
		dispatched++
	}
	return dispatched, nil
}

func daysUntilAnniversary(value string, repeatYearly bool, today time.Time) (int, bool) {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, value)
		if err != nil {
			return 0, false
		}
	}

	target := startOfDay(parsed)
	if repeatYearly {
		target = time.Date(today.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
		if target.Before(today.AddDate(0, 0, -3)) {
			target = target.AddDate(1, 0, 0)
		}
	}
	return int(target.Sub(today).Hours() / 24), true
}

func schedulerCacheKey(eventType events.Type, spaceID string, targetID string, now time.Time) string {
	return fmt.Sprintf("scheduler:%s:%s:%s:%s", eventType, spaceID, targetID, now.UTC().Format("2006-01-02"))
}

func nextDayTTL(now time.Time) time.Duration {
	tomorrow := startOfDay(now).AddDate(0, 0, 1)
	ttl := tomorrow.Sub(now.UTC())
	if ttl <= 0 {
		return 24 * time.Hour
	}
	return ttl
}

func startOfDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func cleanupReadNotifications(database *gorm.DB, now time.Time) error {
	_, err := repositories.NewNotificationRepository(database).DeleteReadBefore(now.AddDate(0, 0, -30), 500)
	return err
}

func cleanupExpiredSignals(database *gorm.DB, now time.Time) error {
	_, err := repositories.NewSignalRepository(database).DeleteExpired(now, 500)
	return err
}
