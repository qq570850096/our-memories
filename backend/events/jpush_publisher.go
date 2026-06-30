package events

import (
	"context"
	"log"
)

type PushSender interface {
	SendToSpaceExcept(spaceID string, actorID string, title string, content string) error
}

type JPushPublisher struct {
	push PushSender
}

func NewJPushPublisher(push PushSender) *JPushPublisher {
	return &JPushPublisher{push: push}
}

func (p *JPushPublisher) Publish(_ context.Context, event DomainEvent) error {
	if p == nil || p.push == nil || event.SpaceID == "" {
		return nil
	}

	title, content, ok := pushMessage(event)
	if !ok {
		return nil
	}

	if err := p.push.SendToSpaceExcept(event.SpaceID, event.ActorID, title, content); err != nil {
		log.Printf("skip jpush event=%s space=%s: %v", event.Type, event.SpaceID, err)
		return nil
	}
	return nil
}

func pushMessage(event DomainEvent) (string, string, bool) {
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
