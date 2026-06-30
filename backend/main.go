package main

import (
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/events"
	"our-memories-backend/handlers"
	"our-memories-backend/jobs"
	"our-memories-backend/middleware"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/storage"
)

func main() {
	config.Load()
	db.Init()
	db.EnsureAdminFromEnv()
	storage.InitS3()
	accountRepo := repositories.NewAccountRepository(db.Gorm)
	pushService := services.NewPushService(repositories.NewPushRepository(db.Gorm))
	hub := events.NewConnectionHub()
	handlers.SetWebSocketHub(hub)
	dispatcher := events.NewDispatcher(
		events.NewJPushPublisher(pushService),
		events.NewNotificationPublisher(repositories.NewNotificationRepository(db.Gorm), accountRepo),
		events.NewWSPublisher(hub),
	)
	handlers.SetEventPublisher(dispatcher)
	jobs.StartPhotoSync()
	jobs.StartPhotoCleanup()
	jobs.StartScheduler(db.Gorm, dispatcher)

	r := gin.Default()

	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.BodySizeLimit(64 << 20)) // 64MB 上限：图片走前端直传 OSS，本服务只收 JSON（含备份导入）

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})
	r.GET("/local-images/*key", serveLocalImage)

	api := r.Group("/api/v1")
	{
		api.POST("/auth/login", handlers.Login)
		api.POST("/auth/refresh", handlers.Refresh)
		api.GET("/ws", handlers.WebSocket)

		// 管理员路由
		api.POST("/admin/login", handlers.AdminLogin)
		admin := api.Group("/admin")
		admin.Use(middleware.AdminAuthMiddleware())
		{
			admin.GET("/spaces", handlers.GetSpaces)
			admin.GET("/spaces/:id", handlers.GetSpaceDetail)
			admin.PUT("/spaces/:id/status", handlers.UpdateSpaceStatus)
			admin.DELETE("/spaces/:id", handlers.DeleteSpace)
			admin.GET("/spaces/:id/backup/export", handlers.AdminExportSpaceBackup)
			admin.POST("/backup/import", handlers.AdminImportBackup)

			admin.GET("/users", handlers.GetUsers)
			admin.PUT("/users/:id/role", handlers.UpdateUserRole)

			admin.GET("/orders", handlers.GetOrders)
			admin.POST("/orders/:id/confirm", handlers.ConfirmOrder)

			admin.GET("/stats", handlers.GetStats)
		}

		auth := api.Group("")
		auth.Use(middleware.AuthMiddleware())
		{
			auth.GET("/me", handlers.GetMe)
			auth.PUT("/auth/password", handlers.UpdatePassword)
			auth.POST("/push/devices", handlers.RegisterPushDevice)
			auth.POST("/push/test", handlers.SendTestPush)
			auth.GET("/notifications", handlers.GetNotifications)
			auth.PATCH("/notifications/read-all", handlers.MarkAllNotificationsRead)
			auth.PATCH("/notifications/:id/read", handlers.MarkNotificationRead)
			auth.GET("/signals", handlers.GetSignals)
			auth.POST("/signals", handlers.CreateSignal)

			auth.GET("/memories", handlers.GetMemories)
			auth.GET("/memories/search", handlers.SearchMemories)
			auth.GET("/memories/summary", handlers.GetMemorySummary)
			auth.GET("/memories/trash", handlers.GetTrashedMemories)
			auth.GET("/memories/cities/:cityId", handlers.GetCityMemories)
			auth.GET("/memories/:id/related", handlers.GetRelatedMemories)
			auth.POST("/memories", handlers.CreateMemory)
			auth.PATCH("/memories/:id", handlers.UpdateMemory)
			auth.POST("/memories/:id/restore", handlers.RestoreMemory)
			auth.DELETE("/memories/:id", handlers.DeleteMemory)

			auth.GET("/city-assets", handlers.GetCityAssets)
			auth.PUT("/city-assets", handlers.UpdateCityAsset)
			auth.DELETE("/city-assets", handlers.DeleteCityAsset)

			auth.GET("/anniversary-cards", handlers.GetAnniversaryCards)
			auth.POST("/anniversary-cards", handlers.CreateAnniversaryCard)
			auth.GET("/anniversary-cards/:id/replay", handlers.GetAnniversaryReplay)
			auth.PATCH("/anniversary-cards/:id", handlers.UpdateAnniversaryCard)
			auth.DELETE("/anniversary-cards/:id", handlers.DeleteAnniversaryCard)

			auth.POST("/upload", handlers.UploadImage)
			auth.POST("/upload/presign", handlers.PresignUpload)
			auth.DELETE("/upload", handlers.DeleteUpload)

			auth.GET("/settings", handlers.GetSettings)
			auth.PUT("/settings/:key", handlers.UpdateSetting)
			auth.GET("/agent/settings", handlers.GetAgentSettings)
			auth.PATCH("/agent/settings", handlers.UpdateAgentSettings)
			auth.POST("/agent/ignored", handlers.IgnoreAgentSuggestion)

			auth.GET("/auxiliary-items", handlers.GetAuxiliaryItems)
			auth.POST("/auxiliary-items", handlers.CreateAuxiliaryItem)
			auth.PATCH("/auxiliary-items/:id", handlers.UpdateAuxiliaryItem)
			auth.DELETE("/auxiliary-items/:id", handlers.DeleteAuxiliaryItem)

			auth.GET("/login-photos", handlers.GetLoginPhotos)
			auth.PUT("/login-photos", handlers.UpdateLoginPhoto)
			auth.PATCH("/login-photos", handlers.PatchLoginPhotos)
			auth.DELETE("/login-photos", handlers.DeleteLoginPhoto)

			auth.POST("/backup/import", handlers.ImportBackup)
			auth.GET("/backup/export", handlers.ExportBackup)

			auth.GET("/trip-guides", handlers.GetTripGuides)
			auth.POST("/trip-guides", handlers.CreateTripGuide)
			auth.PATCH("/trip-guides/:id", handlers.UpdateTripGuide)
			auth.DELETE("/trip-guides/:id", handlers.DeleteTripGuide)
			auth.PATCH("/trip-guide-drafts/:id", handlers.UpdateTripDraft)
			auth.DELETE("/trip-guide-drafts/:id", handlers.DeleteTripDraft)
			auth.POST("/trip-guide-drafts/:id/accept", handlers.AcceptTripDraft)

			auth.POST("/ai/memory-polish", handlers.PolishMemory)
			auth.POST("/ai/memory-search", handlers.SearchMemoriesByIntent)
			auth.POST("/activation-codes", handlers.CreateActivationCode)

			auth.GET("/whispers", handlers.GetWhispers)
			auth.POST("/whispers", handlers.CreateWhisper)
			auth.POST("/whispers/:id/reply", handlers.ReplyWhisper)
			auth.DELETE("/whispers/:id", handlers.DeleteWhisper)

			auth.GET("/time-capsules", handlers.GetTimeCapsules)
			auth.POST("/time-capsules", handlers.CreateTimeCapsule)
			auth.PATCH("/time-capsules/:id", handlers.UpdateTimeCapsule)
			auth.POST("/time-capsules/:id/open", handlers.OpenTimeCapsule)
			auth.DELETE("/time-capsules/:id", handlers.DeleteTimeCapsule)
		}
	}

	registerStaticApps(r)

	log.Printf("Server starting on port %s", config.Get().Port)
	log.Printf("API endpoints: http://localhost:%s/api/v1", config.Get().Port)
	log.Printf("Web app: http://localhost:%s", config.Get().Port)
	log.Printf("Admin panel: http://localhost:%s/admin", config.Get().Port)
	if err := r.Run(":" + config.Get().Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func serveLocalImage(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	filePath, ok := storage.Default().LocalPathForKey(key)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}
	if stat, err := os.Stat(filePath); err != nil || stat.IsDir() {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}
	c.File(filePath)
}

func registerStaticApps(r *gin.Engine) {
	publicDir := resolvePublicDir(config.Get().PublicDir)
	webDistPath := filepath.Join(publicDir, "web")
	adminDistPath := filepath.Join(publicDir, "admin")

	if stat, err := os.Stat(webDistPath); err == nil && stat.IsDir() {
		log.Printf("Serving web app from %s at /", webDistPath)
	} else {
		log.Printf("Web app not found at %s, skipping static file serving", webDistPath)
	}

	if stat, err := os.Stat(adminDistPath); err == nil && stat.IsDir() {
		log.Printf("Serving admin panel from %s at /admin", adminDistPath)
	} else {
		log.Printf("Admin panel not found at %s, skipping static file serving", adminDistPath)
	}

	r.NoRoute(func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if strings.HasPrefix(requestPath, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
			return
		}

		if serveStaticApp(c, adminDistPath, "/admin") {
			return
		}
		if serveStaticApp(c, webDistPath, "") {
			return
		}

		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
	})
}

func resolvePublicDir(configuredPath string) string {
	if configuredPath == "" {
		configuredPath = "./public"
	}
	if stat, err := os.Stat(configuredPath); err == nil && stat.IsDir() {
		return configuredPath
	}
	if configuredPath == "./public" {
		fallbackPath := filepath.Join("backend", "public")
		if stat, err := os.Stat(fallbackPath); err == nil && stat.IsDir() {
			return fallbackPath
		}
	}
	return configuredPath
}

func serveStaticApp(c *gin.Context, distPath, prefix string) bool {
	if stat, err := os.Stat(distPath); err != nil || !stat.IsDir() {
		return false
	}

	requestPath := c.Request.URL.Path
	if prefix != "" {
		if requestPath != prefix && !strings.HasPrefix(requestPath, prefix+"/") {
			return false
		}
		requestPath = strings.TrimPrefix(requestPath, prefix)
	}

	cleanPath := path.Clean("/" + strings.TrimPrefix(requestPath, "/"))
	if cleanPath == "/" {
		cleanPath = "/index.html"
	}

	filePath := filepath.Join(distPath, filepath.FromSlash(strings.TrimPrefix(cleanPath, "/")))
	if !isPathInside(distPath, filePath) {
		c.Status(http.StatusNotFound)
		return true
	}

	if stat, err := os.Stat(filePath); err == nil {
		if stat.IsDir() {
			indexPath := filepath.Join(filePath, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				serveStaticFile(c, indexPath)
				return true
			}
		} else {
			serveStaticFile(c, filePath)
			return true
		}
	}

	if filepath.Ext(cleanPath) != "" {
		c.Status(http.StatusNotFound)
		return true
	}

	indexPath := filepath.Join(distPath, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		serveStaticFile(c, indexPath)
		return true
	}

	c.Status(http.StatusNotFound)
	return true
}

func serveStaticFile(c *gin.Context, filePath string) {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch {
	case ext == ".html" || ext == ".txt" || ext == ".rsc":
		c.Header("Cache-Control", "no-store")
	case strings.Contains(filepath.ToSlash(filePath), "/_next/static/"):
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	}
	c.File(filePath)
}

func isPathInside(root, target string) bool {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	return absTarget == absRoot || strings.HasPrefix(absTarget, absRoot+string(os.PathSeparator))
}
