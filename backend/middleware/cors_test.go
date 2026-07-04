package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
)

func TestCORSMiddlewareAllowsSameRequestOrigin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://configured.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(CORSMiddleware())
	router.GET("/resource", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/resource", nil)
	request.Host = "memories.example.com"
	request.Header.Set("X-Forwarded-Proto", "https")
	request.Header.Set("Origin", "https://memories.example.com")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected request to pass, got %d", response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "https://memories.example.com" {
		t.Fatalf("expected same origin CORS header, got %q", response.Header().Get("Access-Control-Allow-Origin"))
	}
}
