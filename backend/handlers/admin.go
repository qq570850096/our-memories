package handlers

import (
	"database/sql"
	"encoding/json"
	"strconv"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

// GetSpaces 获取空间列表（分页、搜索）
func GetSpaces(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	search := c.Query("search")
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	query := `SELECT id, space_code, name, status, tier, COALESCE(purchased_at, ''), storage_used_bytes, created_at, updated_at
		FROM spaces WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM spaces WHERE 1=1`
	args := []interface{}{}

	if search != "" {
		query += ` AND (space_code LIKE ? OR name LIKE ?)`
		countQuery += ` AND (space_code LIKE ? OR name LIKE ?)`
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern)
	}
	if status != "" {
		query += ` AND status = ?`
		countQuery += ` AND status = ?`
		args = append(args, status)
	}

	var total int
	db.DB.QueryRow(countQuery, args...).Scan(&total)

	query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch spaces")
		return
	}
	defer rows.Close()

	spaces := []models.Space{}
	for rows.Next() {
		var s models.Space
		rows.Scan(&s.ID, &s.SpaceCode, &s.Name, &s.Status, &s.Tier, &s.PurchasedAt, &s.StorageUsedBytes, &s.CreatedAt, &s.UpdatedAt)
		spaces = append(spaces, s)
	}

	utils.Success(c, gin.H{
		"spaces": spaces,
		"total":  total,
		"page":   page,
		"pageSize": pageSize,
	})
}

// GetSpaceDetail 获取空间详情
func GetSpaceDetail(c *gin.Context) {
	spaceID := c.Param("id")

	var s models.Space
	err := db.DB.QueryRow(`SELECT id, space_code, name, status, tier, COALESCE(purchased_at, ''), storage_used_bytes, created_at, updated_at
		FROM spaces WHERE id = ?`, spaceID).
		Scan(&s.ID, &s.SpaceCode, &s.Name, &s.Status, &s.Tier, &s.PurchasedAt, &s.StorageUsedBytes, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		utils.Error(c, 404, "Space not found")
		return
	}

	// 获取空间的用户
	userRows, _ := db.DB.Query(`SELECT id, username, display_name, COALESCE(avatar, ''), role, created_at
		FROM users WHERE space_id = ?`, spaceID)
	defer userRows.Close()

	users := []models.User{}
	for userRows.Next() {
		var u models.User
		userRows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Avatar, &u.Role, &u.CreatedAt)
		u.SpaceID = spaceID
		users = append(users, u)
	}

	// 统计数据
	var memoryCount, photoCount int
	db.DB.QueryRow(`SELECT COUNT(*) FROM memories WHERE space_id = ?`, spaceID).Scan(&memoryCount)
	db.DB.QueryRow(`SELECT COUNT(*) FROM memory_photos p JOIN memories m ON p.memory_id = m.id WHERE m.space_id = ?`, spaceID).Scan(&photoCount)

	utils.Success(c, gin.H{
		"space": s,
		"users": users,
		"stats": gin.H{
			"memoryCount": memoryCount,
			"photoCount":  photoCount,
		},
	})
}

// UpdateSpaceStatus 更新空间状态
func UpdateSpaceStatus(c *gin.Context) {
	spaceID := c.Param("id")
	adminID := c.GetString("adminID")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if req.Status != "active" && req.Status != "suspended" && req.Status != "deleted" {
		utils.Error(c, 400, "Invalid status")
		return
	}

	_, err := db.DB.Exec(`UPDATE spaces SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, req.Status, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update space status")
		return
	}

	// 记录审计日志
	logAuditAction(adminID, "update_space_status", "space", spaceID, gin.H{"status": req.Status})

	utils.Success(c, gin.H{"ok": true})
}

// DeleteSpace 删除空间（软删除）
func DeleteSpace(c *gin.Context) {
	spaceID := c.Param("id")
	adminID := c.GetString("adminID")

	_, err := db.DB.Exec(`UPDATE spaces SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete space")
		return
	}

	logAuditAction(adminID, "delete_space", "space", spaceID, nil)

	utils.Success(c, gin.H{"ok": true})
}

// GetUsers 获取用户列表
func GetUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	search := c.Query("search")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	query := `SELECT u.id, u.space_id, u.username, u.display_name, COALESCE(u.avatar, ''), u.role, u.created_at, s.space_code, s.name
		FROM users u
		JOIN spaces s ON u.space_id = s.id
		WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM users u JOIN spaces s ON u.space_id = s.id WHERE 1=1`
	args := []interface{}{}

	if search != "" {
		query += ` AND (u.username LIKE ? OR u.display_name LIKE ? OR s.space_code LIKE ?)`
		countQuery += ` AND (u.username LIKE ? OR u.display_name LIKE ? OR s.space_code LIKE ?)`
		searchPattern := "%" + search + "%"
		args = append(args, searchPattern, searchPattern, searchPattern)
	}

	var total int
	db.DB.QueryRow(countQuery, args...).Scan(&total)

	query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch users")
		return
	}
	defer rows.Close()

	users := []gin.H{}
	for rows.Next() {
		var u models.User
		var spaceCode, spaceName string
		rows.Scan(&u.ID, &u.SpaceID, &u.Username, &u.DisplayName, &u.Avatar, &u.Role, &u.CreatedAt, &spaceCode, &spaceName)
		users = append(users, gin.H{
			"id":          u.ID,
			"spaceId":     u.SpaceID,
			"username":    u.Username,
			"displayName": u.DisplayName,
			"avatar":      u.Avatar,
			"role":        u.Role,
			"createdAt":   u.CreatedAt,
			"spaceCode":   spaceCode,
			"spaceName":   spaceName,
		})
	}

	utils.Success(c, gin.H{
		"users":    users,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// UpdateUserRole 修改用户角色
func UpdateUserRole(c *gin.Context) {
	userID := c.Param("id")
	adminID := c.GetString("adminID")

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if req.Role != "owner" && req.Role != "member" {
		utils.Error(c, 400, "Invalid role")
		return
	}

	_, err := db.DB.Exec(`UPDATE users SET role = ? WHERE id = ?`, req.Role, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to update user role")
		return
	}

	logAuditAction(adminID, "update_user_role", "user", userID, gin.H{"role": req.Role})

	utils.Success(c, gin.H{"ok": true})
}

// GetOrders 获取订单列表
func GetOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	query := `SELECT o.id, o.space_id, o.amount, o.currency, o.status, COALESCE(o.payment_method, ''), COALESCE(o.paid_at, ''), o.created_at, s.space_code, s.name
		FROM orders o
		JOIN spaces s ON o.space_id = s.id
		WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM orders o WHERE 1=1`
	args := []interface{}{}

	if status != "" {
		query += ` AND o.status = ?`
		countQuery += ` AND status = ?`
		args = append(args, status)
	}

	var total int
	db.DB.QueryRow(countQuery, args...).Scan(&total)

	query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch orders")
		return
	}
	defer rows.Close()

	orders := []gin.H{}
	for rows.Next() {
		var o models.Order
		var spaceCode, spaceName string
		rows.Scan(&o.ID, &o.SpaceID, &o.Amount, &o.Currency, &o.Status, &o.PaymentMethod, &o.PaidAt, &o.CreatedAt, &spaceCode, &spaceName)
		orders = append(orders, gin.H{
			"id":            o.ID,
			"spaceId":       o.SpaceID,
			"amount":        o.Amount,
			"currency":      o.Currency,
			"status":        o.Status,
			"paymentMethod": o.PaymentMethod,
			"paidAt":        o.PaidAt,
			"createdAt":     o.CreatedAt,
			"spaceCode":     spaceCode,
			"spaceName":     spaceName,
		})
	}

	utils.Success(c, gin.H{
		"orders":   orders,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// ConfirmOrder 手动确认订单（标记为已付款）
func ConfirmOrder(c *gin.Context) {
	orderID := c.Param("id")
	adminID := c.GetString("adminID")

	var spaceID string
	err := db.DB.QueryRow(`SELECT space_id FROM orders WHERE id = ? AND status = 'pending'`, orderID).Scan(&spaceID)
	if err == sql.ErrNoRows {
		utils.Error(c, 404, "Order not found or already processed")
		return
	}
	if err != nil {
		utils.Error(c, 500, "Failed to confirm order")
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to confirm order")
		return
	}
	defer tx.Rollback()

	// 更新订单状态
	_, err = tx.Exec(`UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?`, orderID)
	if err != nil {
		utils.Error(c, 500, "Failed to confirm order")
		return
	}

	// 升级空间到终身版
	_, err = tx.Exec(`UPDATE spaces SET tier = 'lifetime', purchased_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to upgrade space")
		return
	}

	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to confirm order")
		return
	}

	logAuditAction(adminID, "confirm_order", "order", orderID, gin.H{"spaceId": spaceID})

	utils.Success(c, gin.H{"ok": true})
}

// GetStats 获取统计数据
func GetStats(c *gin.Context) {
	var totalSpaces, activeSpaces, lifetimeSpaces int
	var totalUsers, totalOrders int
	var totalRevenue float64

	db.DB.QueryRow(`SELECT COUNT(*) FROM spaces`).Scan(&totalSpaces)
	db.DB.QueryRow(`SELECT COUNT(*) FROM spaces WHERE status = 'active'`).Scan(&activeSpaces)
	db.DB.QueryRow(`SELECT COUNT(*) FROM spaces WHERE tier = 'lifetime'`).Scan(&lifetimeSpaces)
	db.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&totalUsers)
	db.DB.QueryRow(`SELECT COUNT(*) FROM orders`).Scan(&totalOrders)
	db.DB.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'paid'`).Scan(&totalRevenue)

	utils.Success(c, gin.H{
		"totalSpaces":    totalSpaces,
		"activeSpaces":   activeSpaces,
		"lifetimeSpaces": lifetimeSpaces,
		"totalUsers":     totalUsers,
		"totalOrders":    totalOrders,
		"totalRevenue":   totalRevenue,
	})
}

// logAuditAction 记录审计日志
func logAuditAction(adminID, action, targetType, targetID string, details gin.H) {
	detailsJSON := ""
	if details != nil {
		jsonBytes, _ := json.Marshal(details)
		detailsJSON = string(jsonBytes)
	}
	db.DB.Exec(`INSERT INTO audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
		utils.NewID(), adminID, action, targetType, targetID, detailsJSON)
}
