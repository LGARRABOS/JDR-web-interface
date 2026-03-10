package httpapi

import (
	"database/sql"
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

const inviteCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func (s *Server) registerGameRoutes() {
	s.mux.Route("/api/games", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleListGames)
		r.Post("/", s.handleCreateGame)
		r.Post("/join", s.handleJoinByCode)
		r.Get("/{id}", s.handleGetGame)
		r.Get("/{id}/players", s.handleListGamePlayers)
		r.Patch("/{id}/me", s.handleUpdateMe)
		r.Patch("/{id}/current-map", s.handleSetCurrentMap)
		r.Patch("/{id}", s.handleUpdateGame)
		r.Delete("/{id}", s.handleDeleteGame)
	})
}

func (s *Server) handleListGames(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	rows, err := s.db.Query(`
		SELECT g.id, g.name, g.invite_code, g.owner_id, COALESCE(g.is_gemma, 0), gp.character_name
		FROM games g
		INNER JOIN game_players gp ON gp.game_id = g.id AND gp.user_id = ?
		ORDER BY g.id DESC
	`, u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var games []map[string]interface{}
	for rows.Next() {
		var g domain.Game
		var isGemma int
		var charName sql.NullString
		if err := rows.Scan(&g.ID, &g.Name, &g.InviteCode, &g.OwnerID, &isGemma, &charName); err != nil {
			continue
		}
		var role string
		if g.OwnerID == u.ID {
			role = "MJ"
		} else {
			var r string
			_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", g.ID, u.ID).Scan(&r)
			role = r
		}
		cn := ""
		if charName.Valid {
			cn = charName.String
		}
		games = append(games, map[string]interface{}{
			"id":            g.ID,
			"name":          g.Name,
			"inviteCode":    g.InviteCode,
			"ownerId":      g.OwnerID,
			"role":         role,
			"isGemma":      isGemma == 1,
			"characterName": cn,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"games": games})
}

type createGameReq struct {
	Name    string `json:"name"`
	IsGemma bool   `json:"isGemma"`
}

func (s *Server) handleCreateGame(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	var req createGameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Name == "" {
		req.Name = "Nouvelle partie"
	}

	code := generateInviteCode()
	isGemma := 0
	if req.IsGemma {
		isGemma = 1
	}
	var id int64
	err := s.db.QueryRow(
		"INSERT INTO games (name, invite_code, owner_id, is_gemma) VALUES (?, ?, ?, ?) RETURNING id",
		req.Name, code, u.ID, isGemma,
	).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	_, _ = s.db.Exec("INSERT INTO game_players (game_id, user_id, role) VALUES (?, ?, 'MJ')", id, u.ID)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"game": map[string]interface{}{
			"id":         id,
			"name":       req.Name,
			"inviteCode": code,
			"ownerId":   u.ID,
			"role":      "MJ",
			"isGemma":   req.IsGemma,
		},
	})
}

type joinGameReq struct {
	InviteCode string `json:"inviteCode"`
}

func (s *Server) handleJoinByCode(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	var req joinGameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.InviteCode == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Code d'invitation requis"})
		return
	}

	var game domain.Game
	err := s.db.QueryRow(
		"SELECT id, name, invite_code, owner_id FROM games WHERE invite_code = ?",
		req.InviteCode,
	).Scan(&game.ID, &game.Name, &game.InviteCode, &game.OwnerID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Partie introuvable ou code invalide"})
		return
	}

	id := game.ID
	_, err = s.db.Exec("INSERT INTO game_players (game_id, user_id, role) VALUES (?, ?, 'PLAYER')", id, u.ID)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusOK, map[string]interface{}{"message": "Déjà inscrit", "gameId": id})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"message": "Inscrit", "gameId": id})
}

func (s *Server) handleGetGame(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var role string
	var characterName sql.NullString
	err = s.db.QueryRow(
		"SELECT role, character_name FROM game_players WHERE game_id = ? AND user_id = ?",
		id, u.ID,
	).Scan(&role, &characterName)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	var g domain.Game
	var isGemma int
	var tokenMovementLocked int
	var currentMapID sql.NullInt64
	err = s.db.QueryRow(
		"SELECT id, name, invite_code, owner_id, COALESCE(is_gemma, 0), COALESCE(token_movement_locked, 0), current_map_id FROM games WHERE id = ?",
		id,
	).Scan(&g.ID, &g.Name, &g.InviteCode, &g.OwnerID, &isGemma, &tokenMovementLocked, &currentMapID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Partie introuvable"})
		return
	}

	cn := ""
	if characterName.Valid {
		cn = characterName.String
	}
	resp := map[string]interface{}{
		"id":             g.ID,
		"name":           g.Name,
		"inviteCode":     g.InviteCode,
		"ownerId":       g.OwnerID,
		"role":          role,
		"isGemma":       isGemma == 1,
		"tokenMovementLocked": tokenMovementLocked == 1,
		"characterName": cn,
	}
	if currentMapID.Valid {
		resp["currentMapId"] = currentMapID.Int64
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"game": resp})
}

type updateGameReq struct {
	TokenMovementLocked *bool `json:"tokenMovementLocked"`
}

func (s *Server) handleUpdateGame(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	gameID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var role string
	err = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if err != nil || role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req updateGameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	if req.TokenMovementLocked != nil {
		locked := 0
		if *req.TokenMovementLocked {
			locked = 1
		}
		_, err = s.db.Exec("UPDATE games SET token_movement_locked = ? WHERE id = ?", locked, gameID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
			return
		}
		s.hub.Broadcast(gameID, "gemma.tokensLocked", map[string]interface{}{"locked": *req.TokenMovementLocked})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"message": "ok"})
}

type setCurrentMapReq struct {
	MapID int64 `json:"mapId"`
}

func (s *Server) handleSetCurrentMap(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	gameID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var role string
	err = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if err != nil || role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req setCurrentMapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MapID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "mapId requis"})
		return
	}

	var mapGameID int64
	err = s.db.QueryRow("SELECT game_id FROM maps WHERE id = ?", req.MapID).Scan(&mapGameID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Carte introuvable"})
		return
	}
	// Autoriser les cartes d'autres parties où l'utilisateur est MJ (partage entre parties)
	var mapRole string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", mapGameID, u.ID).Scan(&mapRole)
	if mapRole != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Carte invalide (réservée aux cartes de vos parties)"})
		return
	}

	_, err = s.db.Exec("UPDATE games SET current_map_id = ? WHERE id = ?", req.MapID, gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	s.hub.Broadcast(gameID, "map.displayed", map[string]interface{}{"mapId": req.MapID})
	writeJSON(w, http.StatusOK, map[string]interface{}{"currentMapId": req.MapID})
}

func (s *Server) handleListGamePlayers(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var role string
	err = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", id, u.ID).Scan(&role)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	rows, err := s.db.Query(`
		SELECT u.id, u.display_name, COALESCE(gp.character_name, '')
		FROM game_players gp
		INNER JOIN users u ON u.id = gp.user_id
		WHERE gp.game_id = ? AND gp.role = 'PLAYER'
		ORDER BY u.display_name
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var players []map[string]interface{}
	for rows.Next() {
		var userID int64
		var displayName, charName string
		if err := rows.Scan(&userID, &displayName, &charName); err != nil {
			continue
		}
		players = append(players, map[string]interface{}{
			"userId":        userID,
			"displayName":   displayName,
			"characterName": charName,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"players": players})
}

type updateMeReq struct {
	CharacterName string `json:"characterName"`
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var req updateMeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	var ok int
	err = s.db.QueryRow(
		"SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?",
		id, u.ID,
	).Scan(&ok)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	_, err = s.db.Exec(
		"UPDATE game_players SET character_name = ? WHERE game_id = ? AND user_id = ?",
		req.CharacterName, id, u.ID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"characterName": req.CharacterName})
}

func (s *Server) handleDeleteGame(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var ownerID int64
	err = s.db.QueryRow("SELECT owner_id FROM games WHERE id = ?", id).Scan(&ownerID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Partie introuvable"})
		return
	}
	if ownerID != u.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Seul le MJ peut supprimer la partie"})
		return
	}

	_, err = s.db.Exec("DELETE FROM games WHERE id = ?", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Partie supprimée"})
}

func generateInviteCode() string {
	b := make([]byte, 6)
	for i := range b {
		b[i] = inviteCodeChars[rand.Intn(len(inviteCodeChars))]
	}
	return string(b)
}
