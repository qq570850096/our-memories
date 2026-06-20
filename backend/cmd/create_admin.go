package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/utils"
)

func main() {
	username := flag.String("username", "", "管理员用户名")
	password := flag.String("password", "", "管理员密码")
	displayName := flag.String("name", "", "管理员显示名称")
	flag.Parse()

	if *username == "" || *password == "" || *displayName == "" {
		fmt.Println("用法: go run create_admin.go -username=admin -password=yourpassword -name=\"Admin User\"")
		os.Exit(1)
	}

	config.Load()
	db.Init()

	// 检查用户名是否已存在
	var exists int
	db.DB.QueryRow(`SELECT COUNT(*) FROM admins WHERE username = ?`, *username).Scan(&exists)
	if exists > 0 {
		log.Fatal("管理员用户名已存在")
	}

	// 创建管理员
	adminID := utils.NewID()
	passwordHash := utils.HashPassword(*password)

	_, err := db.DB.Exec(`INSERT INTO admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)`,
		adminID, *username, passwordHash, *displayName)
	if err != nil {
		log.Fatal("创建管理员失败:", err)
	}

	fmt.Printf("✅ 管理员创建成功!\n")
	fmt.Printf("ID: %s\n", adminID)
	fmt.Printf("Username: %s\n", *username)
	fmt.Printf("Display Name: %s\n", *displayName)
}
