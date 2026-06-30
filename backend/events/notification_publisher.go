package events

import "context"

type NotificationStore interface {
	CreateForUsers(spaceID string, userIDs []string, eventType string, targetType string, targetID string, title string, body string) error
}

type SpaceUserLookup interface {
	UserIDsForSpaceExcept(spaceID string, userID string) ([]string, error)
}

type NotificationPublisher struct {
	notifications NotificationStore
	users         SpaceUserLookup
}

func NewNotificationPublisher(notifications NotificationStore, users SpaceUserLookup) *NotificationPublisher {
	return &NotificationPublisher{notifications: notifications, users: users}
}

func (p *NotificationPublisher) Publish(_ context.Context, event DomainEvent) error {
	if p == nil || p.notifications == nil || p.users == nil || event.SpaceID == "" {
		return nil
	}

	title, body, ok := notificationMessage(event)
	if !ok {
		return nil
	}
	userIDs, err := p.users.UserIDsForSpaceExcept(event.SpaceID, event.ActorID)
	if err != nil {
		return err
	}
	return p.notifications.CreateForUsers(
		event.SpaceID,
		userIDs,
		string(event.Type),
		targetType(event.Type),
		event.TargetID,
		title,
		body,
	)
}

func notificationMessage(event DomainEvent) (string, string, bool) {
	switch event.Type {
	case MemoryCreated:
		return "新的回忆", "TA 添加了一条新的回忆。", true
	case MemoryUpdated:
		return "回忆更新", "TA 更新了一条回忆。", true
	case MemoryDeleted:
		return "回忆移入回收站", "TA 把一条回忆移入了回收站。", true
	case TimeCapsuleDue:
		return "时光胶囊到期", "有一枚时光胶囊可以打开了。", true
	case TimeCapsuleOpened:
		return "时光胶囊已打开", "TA 打开了一枚时光胶囊。", true
	case AnniversaryNear:
		return "纪念日快到了", "有一个重要日子正在靠近。", true
	case SignalCreated:
		return "想你信号", "TA 给你发来一个想你信号。", true
	case WhisperCreated:
		return "新的悄悄话", "TA 留下了一条悄悄话。", true
	case WhisperReplied:
		return "悄悄话有回复", "TA 回复了一条悄悄话。", true
	default:
		return "", "", false
	}
}

func targetType(eventType Type) string {
	switch eventType {
	case MemoryCreated, MemoryUpdated, MemoryDeleted, MemoryViewed:
		return "memory"
	case TimeCapsuleCreated, TimeCapsuleUpdated, TimeCapsuleOpened, TimeCapsuleDeleted, TimeCapsuleDue:
		return "time_capsule"
	case AnniversaryCreated, AnniversaryUpdated, AnniversaryDeleted, AnniversaryNear:
		return "anniversary"
	case WhisperCreated, WhisperReplied, WhisperDeleted:
		return "whisper"
	case SignalCreated:
		return "signal"
	default:
		return ""
	}
}
