package handlers

import (
	"our-memories-backend/db"
	"our-memories-backend/storage"
)

type storedPhoto struct {
	key string
	url string
}

// collectPhotos 读取某父记录下的图片 key/url（query 必须 SELECT key, url ...）。
// 用于删除父记录前先抓取要清理的 OSS 对象（外键级联会先删掉照片行）。
func collectPhotos(query string, args ...interface{}) []storedPhoto {
	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []storedPhoto
	for rows.Next() {
		var p storedPhoto
		if err := rows.Scan(&p.key, &p.url); err == nil {
			out = append(out, p)
		}
	}
	return out
}

// deletePhotos 异步批量清理 OSS 对象（尽力而为）。
func deletePhotos(photos []storedPhoto) {
	if len(photos) == 0 {
		return
	}
	pending := append([]storedPhoto(nil), photos...)
	go func() {
		for _, p := range pending {
			storage.DeletePhotoObject(p.key, p.url)
		}
	}()
}

// deleteRemovedPhotos 在编辑「删旧再插新」场景下，清理那些不在新集合里的旧对象。
func deleteRemovedPhotos(old []storedPhoto, kept []photoInput) {
	keep := map[string]bool{}
	for _, p := range kept {
		k := p.Key
		if k == "" {
			k = storage.KeyFromURL(p.URL)
		}
		if k != "" {
			keep[k] = true
		}
	}
	removed := []storedPhoto{}
	for _, op := range old {
		k := op.key
		if k == "" {
			k = storage.KeyFromURL(op.url)
		}
		if k != "" && !keep[k] {
			removed = append(removed, op)
		}
	}
	deletePhotos(removed)
}
