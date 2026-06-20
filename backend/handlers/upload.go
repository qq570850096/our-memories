package handlers

import (
	"log"

	"github.com/gin-gonic/gin"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

func UploadImage(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req struct {
		DataURL string `json:"dataUrl" binding:"required"`
		Folder  string `json:"folder"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if req.Folder == "" {
		req.Folder = "uploads"
	}

	url, err := storage.UploadImage(spaceID, req.Folder, req.DataURL)
	if err != nil {
		log.Printf("image upload failed: %v", err)
		utils.Error(c, 500, "Upload failed")
		return
	}

	utils.Success(c, gin.H{"url": url})
}

// PresignUpload 为前端直传 OSS 签发临时 PUT URL。
func PresignUpload(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req struct {
		Folder      string `json:"folder"`
		ContentType string `json:"contentType" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}
	if req.Folder == "" {
		req.Folder = "uploads"
	}

	key, uploadURL, publicURL, err := storage.PresignPut(spaceID, req.Folder, req.ContentType)
	if err != nil {
		if !storage.Enabled() {
			utils.Error(c, 503, "Object storage not configured")
			return
		}
		utils.Error(c, 400, err.Error())
		return
	}

	utils.Success(c, gin.H{"key": key, "uploadUrl": uploadURL, "publicUrl": publicURL})
}

// DeleteUpload 供前端在「直传成功但随后保存失败」时回删刚上传的对象。
func DeleteUpload(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	key := c.Query("key")
	if key == "" {
		utils.Error(c, 400, "Missing key")
		return
	}
	if !storage.KeyBelongsToSpace(key, spaceID) {
		utils.Error(c, 403, "Forbidden")
		return
	}
	if err := storage.DeleteObject(key); err != nil {
		log.Printf("delete upload failed (key=%s): %v", key, err)
		utils.Error(c, 500, "Delete failed")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}
