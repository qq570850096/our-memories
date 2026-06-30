package repositories

type MemoryTrashPhoto struct {
	Key string
	URL string
}

type MemoryTrashPhotos struct {
	MemoryID string
	SpaceID  string
	Photos   []MemoryTrashPhoto
}

type MemoryTrashPhotoRow struct {
	MemoryID string `gorm:"column:memory_id"`
	Key      string `gorm:"column:key"`
	URL      string `gorm:"column:url"`
}

type MemoryTrashRecord struct {
	ID      string `gorm:"column:id"`
	SpaceID string `gorm:"column:space_id"`
}
