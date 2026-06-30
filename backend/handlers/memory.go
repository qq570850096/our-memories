package handlers

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

func GetMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	if hasMemoryListQuery(c) {
		result, err := memoryService().ListPage(spaceID, userID, parseMemoryListRequest(c))
		if err != nil {
			writeMemoryServiceError(c, err, "Failed to fetch memories")
			return
		}
		utils.Success(c, result)
		return
	}

	// 尝试从缓存获取
	cacheKey := fmt.Sprintf("memories:%s:%s:full", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"memories": cached})
		return
	}

	memories, err := loadMemoryStore(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	// 缓存30秒
	cache.Set(cacheKey, memories, 30*time.Second)
	utils.Success(c, gin.H{"memories": memories})
}

func SearchMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	req := parseMemoryListRequest(c)
	req.Query = strings.TrimSpace(c.Query("q"))
	if req.Query == "" {
		utils.Error(c, 400, "q is required")
		return
	}
	result, err := memoryService().ListPage(spaceID, userID, req)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to search memories")
		return
	}
	utils.Success(c, result)
}

func SearchMemoriesByIntent(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	var req struct {
		Query string `json:"q"`
		Limit int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	query := strings.TrimSpace(req.Query)
	if query == "" {
		utils.Error(c, 400, "q is required")
		return
	}

	intent := parseMemorySearchIntent(query)
	result, err := memoryService().ListPage(spaceID, userID, services.MemoryListRequest{
		CityID: intent.CityID,
		Tags:   intent.Tags,
		Mood:   intent.Mood,
		Query:  intent.Query,
		Limit:  req.Limit,
	})
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to search memories")
		return
	}
	utils.Success(c, services.MemoryIntentSearchResponse{
		Intent:     intent,
		Items:      result.Items,
		NextCursor: result.NextCursor,
		HasMore:    result.HasMore,
	})
}

func GetRelatedMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	memoryID := strings.TrimSpace(c.Param("id"))
	if memoryID == "" {
		utils.Error(c, 400, "memory id is required")
		return
	}

	items, err := memoryService().RelatedByDate(spaceID, userID, memoryID)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to fetch related memories")
		return
	}
	utils.Success(c, gin.H{"items": items})
}

func GetCityMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	cityID := strings.TrimSpace(c.Param("cityId"))
	if cityID == "" {
		utils.Error(c, 400, "cityId is required")
		return
	}

	cacheKey := fmt.Sprintf("memories:%s:%s:city:%s", spaceID, userID, cityID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"memories": cached})
		return
	}

	memories, err := loadMemoryStoreForCity(spaceID, userID, cityID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch city memories")
		return
	}

	cache.Set(cacheKey, memories, 30*time.Second)
	utils.Success(c, gin.H{"memories": memories})
}

func GetMemorySummary(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	cacheKey := fmt.Sprintf("memories:%s:%s:summary", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"summary": cached})
		return
	}

	summary, err := loadMemorySummary(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memory summary")
		return
	}

	cache.Set(cacheKey, summary, 30*time.Second)
	utils.Success(c, gin.H{"summary": summary})
}

func clearMemoriesCache(spaceID string) {
	cache.ClearMemorySpace(spaceID)
}

func loadMemoryStore(spaceID string, userID string) (map[string][]gin.H, error) {
	return loadMemoryStoreWithCity(spaceID, userID, "")
}

func loadMemoryStoreForCity(spaceID string, userID string, cityID string) (map[string][]gin.H, error) {
	return loadMemoryStoreWithCity(spaceID, userID, cityID)
}

func loadMemoryStoreWithCity(spaceID string, userID string, cityID string) (map[string][]gin.H, error) {
	return memoryService().ListByCity(spaceID, userID, cityID)
}

func loadMemorySummary(spaceID string, userID string) (map[string]gin.H, error) {
	return memoryService().Summary(spaceID, userID)
}

func hasMemoryListQuery(c *gin.Context) bool {
	for _, key := range []string{"cursor", "limit", "tags", "cityId", "dateFrom", "dateTo", "visibility", "mood", "q"} {
		if strings.TrimSpace(c.Query(key)) != "" {
			return true
		}
	}
	return false
}

func parseMemoryListRequest(c *gin.Context) services.MemoryListRequest {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	tags := []string{}
	for _, value := range strings.Split(c.Query("tags"), ",") {
		value = strings.TrimSpace(value)
		if value != "" {
			tags = append(tags, value)
		}
	}
	return services.MemoryListRequest{
		CityID:     strings.TrimSpace(c.Query("cityId")),
		Tags:       tags,
		Mood:       strings.TrimSpace(c.Query("mood")),
		Visibility: strings.TrimSpace(c.Query("visibility")),
		DateFrom:   normalizeMemoryDateQuery(c.Query("dateFrom")),
		DateTo:     normalizeMemoryDateQuery(c.Query("dateTo")),
		Query:      strings.TrimSpace(c.Query("q")),
		Cursor:     strings.TrimSpace(c.Query("cursor")),
		Limit:      limit,
	}
}

func normalizeMemoryDateQuery(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return strings.ReplaceAll(value, "-", ".")
}

var memoryIntentCities = []struct {
	ID      string
	Names   []string
	Aliases []string
}{
	{ID: "hangzhou", Names: []string{"杭州", "hangzhou"}, Aliases: []string{"西湖"}},
	{ID: "shanghai", Names: []string{"上海", "shanghai"}, Aliases: []string{"外滩", "东方明珠"}},
	{ID: "beijing", Names: []string{"北京", "beijing"}, Aliases: []string{"故宫", "天安门"}},
	{ID: "guangzhou", Names: []string{"广州", "guangzhou"}, Aliases: []string{"珠江"}},
	{ID: "shenzhen", Names: []string{"深圳", "shenzhen"}, Aliases: []string{}},
	{ID: "suzhou", Names: []string{"苏州", "suzhou"}, Aliases: []string{"园林"}},
	{ID: "nanjing", Names: []string{"南京", "nanjing"}, Aliases: []string{"夫子庙"}},
	{ID: "chengdu", Names: []string{"成都", "chengdu"}, Aliases: []string{"火锅"}},
	{ID: "dali", Names: []string{"大理", "dali"}, Aliases: []string{"洱海"}},
	{ID: "qingdao", Names: []string{"青岛", "qingdao"}, Aliases: []string{}},
	{ID: "xiamen", Names: []string{"厦门", "xiamen"}, Aliases: []string{"鼓浪屿"}},
	{ID: "hongkong", Names: []string{"香港", "hongkong", "hong kong"}, Aliases: []string{}},
	{ID: "macau", Names: []string{"澳门", "macau"}, Aliases: []string{}},
}

var memoryIntentTags = map[string][]string{
	"雨":  {"雨", "下雨", "雨天", "雨后"},
	"雪":  {"雪", "下雪", "雪天"},
	"晴天": {"晴", "晴天", "阳光"},
	"夜晚": {"夜晚", "晚上", "夜景"},
	"海":  {"海", "海边", "海风"},
}

var memoryIntentMoods = map[string][]string{
	"开心": {"开心", "快乐", "高兴"},
	"想念": {"想念", "想你", "思念"},
	"平静": {"平静", "安静", "舒服"},
}

func parseMemorySearchIntent(query string) services.MemorySearchIntent {
	normalized := strings.ToLower(strings.TrimSpace(query))
	intent := services.MemorySearchIntent{
		Query:  query,
		Source: map[string]string{},
	}
	for _, city := range memoryIntentCities {
		for _, value := range append(city.Names, city.Aliases...) {
			if value != "" && strings.Contains(normalized, strings.ToLower(value)) {
				intent.CityID = city.ID
				intent.Source["cityId"] = value
				break
			}
		}
		if intent.CityID != "" {
			break
		}
	}
	for tag, keywords := range memoryIntentTags {
		for _, keyword := range keywords {
			if strings.Contains(normalized, strings.ToLower(keyword)) {
				intent.Tags = append(intent.Tags, tag)
				intent.Source["tag:"+tag] = keyword
				break
			}
		}
	}
	for mood, keywords := range memoryIntentMoods {
		for _, keyword := range keywords {
			if strings.Contains(normalized, strings.ToLower(keyword)) {
				intent.Mood = mood
				intent.Source["mood"] = keyword
				break
			}
		}
		if intent.Mood != "" {
			break
		}
	}
	if intent.CityID != "" || len(intent.Tags) > 0 || intent.Mood != "" {
		intent.Query = ""
	}
	if len(intent.Source) == 0 {
		intent.Source = nil
	}
	return intent
}

func CreateMemory(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.CreateMemoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	memoryID, memories, err := memoryService().Create(spaceID, userID, req)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to create memory")
		return
	}

	utils.Success(c, gin.H{"id": memoryID, "memories": memories})
}

func UpdateMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.UpdateMemoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	memories, err := memoryService().Update(spaceID, userID, id, req)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to update memory")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func DeleteMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	memories, err := memoryService().Delete(spaceID, userID, id)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to delete memory")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func GetTrashedMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	memories, err := memoryService().ListTrash(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch trashed memories")
		return
	}

	utils.Success(c, gin.H{"memories": memories})
}

func RestoreMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	memories, err := memoryService().Restore(spaceID, userID, id)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to restore memory")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func memoryService() *services.MemoryService {
	return services.NewMemoryService(
		repositories.NewMemoryRepository(db.Gorm),
		loadMemoryStore,
		uploadServicePhotoInputs,
		deleteServicePhotos,
		domainPublisher,
	)
}

func uploadServicePhotoInputs(spaceID string, folder string, photos []services.PhotoInput) error {
	items := make([]photoInput, len(photos))
	for i, photo := range photos {
		items[i] = photoInput(photo)
	}
	if err := uploadPhotoInputs(spaceID, folder, items); err != nil {
		return err
	}
	for i, photo := range items {
		photos[i] = services.PhotoInput(photo)
	}
	return nil
}

func deleteServicePhotos(spaceID string, photos []services.StoredPhoto) error {
	items := make([]storedPhoto, len(photos))
	for i, photo := range photos {
		items[i] = storedPhoto{key: photo.Key, url: photo.URL}
	}
	return deletePhotos(spaceID, items)
}

func writeMemoryServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrMemoryNotFound):
		utils.Error(c, 404, "Memory not found")
	case errors.Is(err, repositories.ErrMemoryCoverPhotoNotFound):
		utils.Error(c, 400, "Cover photo not found")
	case errors.Is(err, repositories.ErrInvalidMemoryCursor):
		utils.Error(c, 400, "Invalid cursor")
	case errors.Is(err, services.ErrForbidden):
		utils.Error(c, 403, "Only the creator can modify this memory")
	default:
		utils.Error(c, 500, fallback)
	}
}
