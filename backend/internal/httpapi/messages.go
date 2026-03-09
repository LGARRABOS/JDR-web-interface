package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"

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

	rows, err := s.db.Query(`
		SELECT gm.id, gm.game_id, gm.user_id, gm.role, gm.content, gm.created_at,
			COALESCE(NULLIF(gp.character_name, ''), u.display_name) as display_name
		FROM game_messages gm
		JOIN users u ON u.id = gm.user_id
		LEFT JOIN game_players gp ON gp.game_id = gm.game_id AND gp.user_id = gm.user_id
		WHERE gm.game_id = ?
		ORDER BY gm.created_at DESC
		LIMIT 100
	`, gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id, gameID, userID int64
		var role, content, createdAt, displayName string
		if err := rows.Scan(&id, &gameID, &userID, &role, &content, &createdAt, &displayName); err != nil {
			continue
		}
		messages = append(messages, map[string]interface{}{
			"id":          id,
			"gameId":      gameID,
			"userId":      userID,
			"role":        role,
			"content":     content,
			"createdAt":   createdAt,
			"displayName": displayName,
		})
	}

	// Inverser pour avoir le plus ancien en premier
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
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

	res, err := s.db.Exec(
		"INSERT INTO game_messages (game_id, user_id, role, content) VALUES (?, ?, ?, ?)",
		gameID, u.ID, role, req.Content,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	id, _ := res.LastInsertId()

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
	}
	s.hub.Broadcast(gameID, "chat.message", payload)
}
