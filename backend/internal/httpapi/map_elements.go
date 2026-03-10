package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

func (s *Server) registerMapElementRoutes() {
	s.mux.Route("/api/maps/{mapId}/elements", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleListMapElements)
		r.Post("/", s.handleCreateMapElement)
	})
	s.mux.Route("/api/map-elements/{id}", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Patch("/", s.handleUpdateMapElement)
		r.Delete("/", s.handleDeleteMapElement)
	})
}

func (s *Server) handleListMapElements(w http.ResponseWriter, r *http.Request) {
	mapIDStr := chi.URLParam(r, "mapId")
	mapID, err := strconv.ParseInt(mapIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	rows, err := s.db.Query(
		"SELECT id, map_id, image_url, x, y, width, height, created_at FROM map_elements WHERE map_id = ? ORDER BY id",
		mapID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var elements []*domain.MapElement
	for rows.Next() {
		var e domain.MapElement
		if err := rows.Scan(&e.ID, &e.MapID, &e.ImageURL, &e.X, &e.Y, &e.Width, &e.Height, &e.CreatedAt); err != nil {
			continue
		}
		elements = append(elements, &e)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"elements": elements})
}

type createMapElementReq struct {
	ImageURL string  `json:"imageUrl"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    int     `json:"width"`
	Height   int     `json:"height"`
}

func (s *Server) handleCreateMapElement(w http.ResponseWriter, r *http.Request) {
	mapIDStr := chi.URLParam(r, "mapId")
	mapID, err := strconv.ParseInt(mapIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var gameID int64
	err = s.db.QueryRow("SELECT game_id FROM maps WHERE id = ?", mapID).Scan(&gameID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Carte introuvable"})
		return
	}

	u := s.getSessionUser(r)
	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req createMapElementReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.ImageURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "imageUrl requis"})
		return
	}
	if req.Width <= 0 {
		req.Width = 50
	}
	if req.Height <= 0 {
		req.Height = 50
	}

	var id int64
	err = s.db.QueryRow(
		"INSERT INTO map_elements (map_id, image_url, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
		mapID, req.ImageURL, req.X, req.Y, req.Width, req.Height,
	).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var createdAt string
	_ = s.db.QueryRow("SELECT created_at FROM map_elements WHERE id = ?", id).Scan(&createdAt)

	e := &domain.MapElement{
		ID:        id,
		MapID:     mapID,
		ImageURL:  req.ImageURL,
		X:         req.X,
		Y:         req.Y,
		Width:     req.Width,
		Height:    req.Height,
		CreatedAt: createdAt,
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"element": e})
	s.hub.Broadcast(gameID, "map_element.created", e)
}

type updateMapElementReq struct {
	X      *float64 `json:"x"`
	Y      *float64 `json:"y"`
	Width  *int     `json:"width"`
	Height *int     `json:"height"`
}

func (s *Server) handleUpdateMapElement(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var mapID, gameID int64
	err = s.db.QueryRow("SELECT map_id FROM map_elements WHERE id = ?", id).Scan(&mapID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Élément introuvable"})
		return
	}
	_ = s.db.QueryRow("SELECT game_id FROM maps WHERE id = ?", mapID).Scan(&gameID)

	u := s.getSessionUser(r)
	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req updateMapElementReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	updates := []string{}
	args := []interface{}{}
	if req.X != nil {
		updates = append(updates, "x = ?")
		args = append(args, *req.X)
	}
	if req.Y != nil {
		updates = append(updates, "y = ?")
		args = append(args, *req.Y)
	}
	if req.Width != nil && *req.Width > 0 {
		updates = append(updates, "width = ?")
		args = append(args, *req.Width)
	}
	if req.Height != nil && *req.Height > 0 {
		updates = append(updates, "height = ?")
		args = append(args, *req.Height)
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucune modification"})
		return
	}
	args = append(args, id)

	_, err = s.db.Exec("UPDATE map_elements SET "+joinStrings(updates, ", ")+" WHERE id = ?", args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var e domain.MapElement
	_ = s.db.QueryRow(
		"SELECT id, map_id, image_url, x, y, width, height, created_at FROM map_elements WHERE id = ?",
		id,
	).Scan(&e.ID, &e.MapID, &e.ImageURL, &e.X, &e.Y, &e.Width, &e.Height, &e.CreatedAt)
	writeJSON(w, http.StatusOK, map[string]interface{}{"element": e})
	s.hub.Broadcast(gameID, "map_element.updated", e)
}

func (s *Server) handleDeleteMapElement(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var mapID, gameID int64
	err = s.db.QueryRow("SELECT map_id FROM map_elements WHERE id = ?", id).Scan(&mapID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Élément introuvable"})
		return
	}
	_ = s.db.QueryRow("SELECT game_id FROM maps WHERE id = ?", mapID).Scan(&gameID)

	u := s.getSessionUser(r)
	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	_, err = s.db.Exec("DELETE FROM map_elements WHERE id = ?", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Supprimé"})
	s.hub.Broadcast(gameID, "map_element.deleted", map[string]interface{}{"id": id})
}
