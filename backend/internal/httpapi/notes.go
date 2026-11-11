package httpapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

// Notes du MJ : privées, une pour la partie et une par carte. Jamais envoyées
// aux joueurs.

const maxNoteBody = 50000

func (s *Server) registerNoteRoutes() {
	s.mux.Route("/api/games/{gameId}/notes", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Use(s.requireGM)
		r.Get("/", s.handleGetNote)
		r.Put("/", s.handlePutNote)
	})
}

// noteScope lit ?mapId= (absent : notes de la partie).
func noteScope(r *http.Request) (*int64, bool) {
	v := r.URL.Query().Get("mapId")
	if v == "" {
		return nil, true
	}
	id, err := strconv.ParseInt(v, 10, 64)
	if err != nil || id <= 0 {
		return nil, false
	}
	return &id, true
}

func (s *Server) handleGetNote(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	mapID, ok := noteScope(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "mapId invalide"})
		return
	}
	var body string
	var updated time.Time
	err := s.db.QueryRow(
		"SELECT body, updated_at FROM game_notes WHERE game_id = ? AND COALESCE(map_id, 0) = ?",
		gameID, ptrOrZero(mapID),
	).Scan(&body, &updated)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	resp := map[string]any{"body": body, "mapId": mapID, "updatedAt": nil}
	if err == nil {
		resp["updatedAt"] = updated.UTC().Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handlePutNote(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	mapID, ok := noteScope(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "mapId invalide"})
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if len(req.Body) > maxNoteBody {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Notes trop longues"})
		return
	}
	if mapID != nil {
		// La carte doit être utilisable dans cette partie (la sienne ou la bibliothèque du MJ).
		var ok int
		_ = s.db.QueryRow("SELECT 1 FROM maps WHERE id = ? AND id IN "+gameMapsFilter, *mapID, gameID, gameID).Scan(&ok)
		if ok != 1 {
			writeJSON(w, http.StatusNotFound, map[string]string{"message": "Carte introuvable"})
			return
		}
	}
	res, err := s.db.Exec(
		"UPDATE game_notes SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE game_id = ? AND COALESCE(map_id, 0) = ?",
		req.Body, gameID, ptrOrZero(mapID),
	)
	if err == nil {
		if n, _ := res.RowsAffected(); n == 0 {
			_, err = s.db.Exec("INSERT INTO game_notes (game_id, map_id, body) VALUES (?, ?, ?)", gameID, mapID, req.Body)
		}
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"body": req.Body, "mapId": mapID, "updatedAt": time.Now().UTC().Format(time.RFC3339)})
}

func ptrOrZero(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
