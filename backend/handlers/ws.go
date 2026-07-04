package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"our-memories-backend/events"
	"our-memories-backend/middleware"
	"our-memories-backend/utils"
)

var wsHub = events.NewConnectionHub()

func SetWebSocketHub(hub *events.ConnectionHub) {
	if hub == nil {
		wsHub = events.NewConnectionHub()
		return
	}
	wsHub = hub
}

func WebSocketHub() *events.ConnectionHub {
	return wsHub
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(*http.Request) bool {
		return true
	},
}

type websocketClientMessage struct {
	Type     events.Type    `json:"type"`
	TargetID string         `json:"targetId"`
	Metadata map[string]any `json:"metadata"`
}

func WebSocket(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	if spaceID == "" || userID == "" {
		claims, err := claimsFromWebSocketRequest(c)
		if err != nil {
			utils.Error(c, http.StatusUnauthorized, "Authentication required")
			return
		}
		spaceID = claims.SpaceID
		userID = claims.UserID
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	client := &events.Connection{
		SpaceID: spaceID,
		UserID:  userID,
		Send:    make(chan []byte, 16),
	}
	wsHub.Add(client)
	defer wsHub.Remove(client)

	go writeWebSocketMessages(conn, client.Send)
	readWebSocketMessages(conn, client)
}

func claimsFromWebSocketRequest(c *gin.Context) (*utils.Claims, error) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		}
	}
	if token == "" {
		token, _ = c.Cookie(middleware.AccessTokenCookieName)
	}
	return utils.VerifyToken(token)
}

func writeWebSocketMessages(conn *websocket.Conn, send <-chan []byte) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case payload, ok := <-send:
			if !ok {
				_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func readWebSocketMessages(conn *websocket.Conn, client *events.Connection) {
	conn.SetReadLimit(1024)
	conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		handleWebSocketClientMessage(client, payload)
	}
}

func handleWebSocketClientMessage(client *events.Connection, payload []byte) {
	if client == nil || client.SpaceID == "" || client.UserID == "" {
		return
	}
	var message websocketClientMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return
	}
	if message.Type != events.WhisperTyping || strings.TrimSpace(message.TargetID) == "" {
		return
	}
	typing, ok := message.Metadata["typing"].(bool)
	if !ok {
		typing = true
	}
	_ = wsHub.Broadcast(events.DomainEvent{
		Type:     events.WhisperTyping,
		SpaceID:  client.SpaceID,
		ActorID:  client.UserID,
		TargetID: strings.TrimSpace(message.TargetID),
		Metadata: map[string]any{"typing": typing},
	})
}
