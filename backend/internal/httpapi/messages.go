package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

func (s *Server) registerMessageRoutes() {
	s.mux.Route("/api/games/{gameId}/messages", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Get("/", s.handleListMessages)
		r.Post("/", s.handleCreateMessage)
	})
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	messages, err := s.listRecentMessages(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"messages": messages})
}

type createMessageReq struct {
	Content string `json:"content"`
}

func (s *Server) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	u := s.getSessionUser(r)
	var role string
	var characterName sql.NullString
	_ = s.db.QueryRow("SELECT role, character_name FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role, &characterName)
	if role == "" {
		role = "PLAYER"
	}
	displayName := u.DisplayName
	if characterName.Valid && characterName.String != "" {
		displayName = characterName.String
	}

	var req createMessageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Contenu requis"})
		return
	}

	var id int64
	err := s.db.QueryRow(
		"INSERT INTO game_messages (game_id, user_id, role, content) VALUES (?, ?, ?, ?) RETURNING id",
		gameID, u.ID, role, req.Content,
	).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	m := &domain.GameMessage{
		ID: id, GameID: gameID, UserID: u.ID, Role: role, Content: req.Content,
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"message": m})

	// Enrichir pour le broadcast
	payload := map[string]interface{}{
		"id":          id,
		"gameId":      gameID,
		"userId":      u.ID,
		"role":        role,
		"content":     req.Content,
		"displayName": displayName,
		"createdAt":   time.Now().UTC().Format(time.RFC3339Nano),
	}
	s.hub.Broadcast(gameID, "chat.message", payload)
}
