package realtime

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // En prod, vérifier l'origine
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Client représente une connexion WebSocket.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID int64
	games  map[int64]bool
	mu     sync.RWMutex
}

// UserInfoFunc retourne les infos d'un utilisateur dans une partie (displayName, characterName, role).
type UserInfoFunc func(userID, gameID int64) (displayName, characterName, role string)

// Hub gère les connexions WebSocket et les rooms par partie.
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan *BroadcastMsg
	register   chan *Client
	unregister chan *Client
	userInfo   UserInfoFunc
	mu         sync.RWMutex
}

// BroadcastMsg est un message à envoyer à une room.
type BroadcastMsg struct {
	GameID  int64       `json:"gameId"`
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// NewHub crée un nouveau hub. userInfo peut être nil.
func NewHub(userInfo UserInfoFunc) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan *BroadcastMsg, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		userInfo:   userInfo,
	}
}

// ServeHTTP gère l'upgrade WebSocket.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}

	userID := int64(0)
	if v := r.Context().Value("userID"); v != nil {
		if id, ok := v.(int64); ok {
			userID = id
		}
	}

	client := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, 256),
		userID: userID,
		games:  make(map[int64]bool),
	}
	h.register <- client

	go client.writePump()
	go client.readPump()
}

// Broadcast envoie un message à tous les clients d'une partie.
func (h *Hub) Broadcast(gameID int64, typ string, payload interface{}) {
	msg := &BroadcastMsg{GameID: gameID, Type: typ, Payload: payload}
	select {
	case h.broadcast <- msg:
	default:
		log.Printf("hub broadcast buffer full, dropping message")
	}
}

// Run démarre la boucle principale du hub.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				h.onClientUnregister(client)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			h.mu.RLock()
			for client := range h.clients {
				client.mu.RLock()
				if client.games[msg.GameID] {
					select {
					case client.send <- data:
					default:
						// buffer full, skip
					}
				}
				client.mu.RUnlock()
			}
			h.mu.RUnlock()
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var req struct {
			Action   string  `json:"action"`
			GameID   int64   `json:"gameId"`
			TrackID  int64   `json:"trackId"`
			Position float64 `json:"position"`
			Scale    float64 `json:"scale"`
			OffsetX  float64 `json:"offsetX"`
			OffsetY  float64 `json:"offsetY"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			continue
		}

		// Vue carte (pan/zoom) : seul le MJ peut envoyer, diffusion à tous
		if req.Action == "map.view" && req.GameID > 0 {
			if c.hub.userInfo != nil {
				_, _, role := c.hub.userInfo(c.userID, req.GameID)
				if role == "MJ" {
					payload := map[string]interface{}{
						"scale":   req.Scale,
						"offsetX": req.OffsetX,
						"offsetY": req.OffsetY,
					}
					c.hub.Broadcast(req.GameID, "map.view", payload)
				}
			}
			continue
		}

		// Diffusion musicale : seul le MJ peut envoyer
		if (req.Action == "music.play" || req.Action == "music.pause" || req.Action == "music.seek") && req.GameID > 0 {
			if c.hub.userInfo != nil {
				_, _, role := c.hub.userInfo(c.userID, req.GameID)
				if role == "MJ" {
					payload := map[string]interface{}{"trackId": req.TrackID, "position": req.Position}
					c.hub.Broadcast(req.GameID, req.Action, payload)
				}
			}
			continue
		}

		if req.Action == "subscribe" && req.GameID > 0 {
			c.mu.Lock()
			wasSubscribed := c.games[req.GameID]
			c.games[req.GameID] = true
			c.mu.Unlock()
			if !wasSubscribed {
				c.hub.broadcastPresenceJoined(c, req.GameID)
				c.hub.sendPresenceList(c, req.GameID)
			}
		}
		if req.Action == "unsubscribe" && req.GameID > 0 {
			c.mu.Lock()
			delete(c.games, req.GameID)
			c.mu.Unlock()
			c.hub.broadcastPresenceLeft(c.userID, req.GameID)
		}
	}
}

func (c *Client) writePump() {
	for data := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			break
		}
	}
}

func (h *Hub) broadcastPresenceJoined(client *Client, gameID int64) {
	displayName, characterName, role := "", "", ""
	if h.userInfo != nil {
		displayName, characterName, role = h.userInfo(client.userID, gameID)
	}
	if characterName != "" {
		displayName = characterName
	} else if displayName == "" {
		displayName = "Joueur"
	}
	payload := map[string]interface{}{
		"userId":      client.userID,
		"displayName": displayName,
		"characterName": characterName,
		"role":        role,
	}
	h.Broadcast(gameID, "presence.joined", payload)
}

func (h *Hub) broadcastPresenceLeft(userID int64, gameID int64) {
	h.Broadcast(gameID, "presence.left", map[string]interface{}{"userId": userID})
}

func (h *Hub) sendPresenceList(client *Client, gameID int64) {
	h.mu.RLock()
	seen := make(map[int64]bool)
	var list []map[string]interface{}
	for c := range h.clients {
		c.mu.RLock()
		if c.games[gameID] && c.userID > 0 && !seen[c.userID] {
			seen[c.userID] = true
			displayName, characterName, role := "", "", ""
			if h.userInfo != nil {
				displayName, characterName, role = h.userInfo(c.userID, gameID)
			}
			if characterName != "" {
				displayName = characterName
			} else if displayName == "" {
				displayName = "Joueur"
			}
			list = append(list, map[string]interface{}{
				"userId":       c.userID,
				"displayName":  displayName,
				"characterName": characterName,
				"role":         role,
			})
		}
		c.mu.RUnlock()
	}
	h.mu.RUnlock()

	msg := &BroadcastMsg{GameID: gameID, Type: "presence.list", Payload: map[string]interface{}{"users": list}}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case client.send <- data:
	default:
	}
}

func (h *Hub) onClientUnregister(client *Client) {
	client.mu.RLock()
	games := make([]int64, 0, len(client.games))
	for gid := range client.games {
		games = append(games, gid)
	}
	client.mu.RUnlock()
	for _, gid := range games {
		h.broadcastPresenceLeft(client.userID, gid)
	}
}
