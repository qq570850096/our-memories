package cache

import (
	"strings"
	"sync"
	"time"
)

type CacheItem struct {
	Value      interface{}
	Expiration int64
}

type Cache struct {
	items map[string]CacheItem
	mu    sync.RWMutex
}

var globalCache = &Cache{
	items: make(map[string]CacheItem),
}

func Get(key string) (interface{}, bool) {
	globalCache.mu.RLock()
	defer globalCache.mu.RUnlock()

	item, found := globalCache.items[key]
	if !found {
		return nil, false
	}

	if item.Expiration > 0 && time.Now().UnixNano() > item.Expiration {
		return nil, false
	}

	return item.Value, true
}

func Set(key string, value interface{}, duration time.Duration) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	var expiration int64
	if duration > 0 {
		expiration = time.Now().Add(duration).UnixNano()
	}

	globalCache.items[key] = CacheItem{
		Value:      value,
		Expiration: expiration,
	}
}

func Delete(key string) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()
	delete(globalCache.items, key)
}

func Clear() {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()
	globalCache.items = make(map[string]CacheItem)
}

func DeletePrefix(prefix string) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()
	for key := range globalCache.items {
		if strings.HasPrefix(key, prefix) {
			delete(globalCache.items, key)
		}
	}
}
