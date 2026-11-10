package httpapi

import (
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/disintegration/imageorient"
	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

const maxMapSize = 15 << 20 // 15 Mo
const uploadsMapsBase = "uploads/maps"

var allowedMapExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
}

func (s *Server) registerMapRoutes() {
	s.mux.Route("/api/games/{gameId}/maps", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Get("/", s.handleListMaps)
		r.With(s.requireGM).Post("/", s.handleCreateMap)
		r.Post("/upload", s.handleUploadMap)
	})
	s.mux.Route("/api/games/{gameId}/maps/file/{filename}", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireMapFileAccess)
		r.Get("/", s.handleGetMapFile)
	})
	s.mux.Route("/api/maps/{mapId}", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleGetMap)
		r.Patch("/", s.handleUpdateMap)
		r.Post("/update", s.handleUpdateMap)
		r.Delete("/", s.handleDeleteMap)
	})
	s.mux.Route("/api/maps/{mapId}/fog", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireMapAccess)
		r.Get("/", s.handleGetFog)
		r.With(s.requireGM).Post("/patches", s.handleAddFogPatch)
		r.With(s.requireGM).Post("/undo", s.handleUndoFog)
		r.With(s.requireGM).Post("/reset", s.handleResetFog)
		r.With(s.requireGM).Post("/enabled", s.handleSetFogEnabled)
	})
}

func (s *Server) handleListMaps(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	rows, err := s.db.Query(
		`SELECT m.id, m.game_id, m.name, m.image_url, m.width, m.height, m.grid_size, COALESCE(m.tags, '[]')
		 FROM maps m
		 WHERE m.id IN `+gameMapsFilter+`
		 ORDER BY m.id`,
		gameID, gameID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var maps []*domain.Map
	for rows.Next() {
		var m domain.Map
		var tagsJSON string
		if err := rows.Scan(&m.ID, &m.GameID, &m.Name, &m.ImageURL, &m.Width, &m.Height, &m.GridSize, &tagsJSON); err != nil {
			continue
		}
		_ = json.Unmarshal([]byte(tagsJSON), &m.Tags)
		maps = append(maps, &m)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"maps": maps})
}

type createMapReq struct {
	Name     string `json:"name"`
	ImageURL string `json:"imageUrl"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	GridSize int    `json:"gridSize"`
}

func (s *Server) handleCreateMap(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	var req createMapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.ImageURL == "" {
		req.ImageURL = "https://via.placeholder.com/800x600?text=Carte"
	}
	if req.Width <= 0 {
		req.Width = 800
	}
	if req.Height <= 0 {
		req.Height = 600
	}
	if req.GridSize <= 0 {
		req.GridSize = 50
	}
	if req.Name == "" {
		req.Name = "Nouvelle carte"
	}

	u := s.getSessionUser(r)
	var id int64
	err := s.db.QueryRow(
		"INSERT INTO maps (game_id, name, image_url, width, height, grid_size) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
		gameID, req.Name, req.ImageURL, req.Width, req.Height, req.GridSize,
	).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	m := &domain.Map{
		ID: id, GameID: gameID, Name: req.Name, ImageURL: req.ImageURL,
		Width: req.Width, Height: req.Height, GridSize: req.GridSize,
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"map": m})

	s.hub.Broadcast(gameID, "map.created", m)
	_ = u
}

func (s *Server) handleUploadMap(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	u := s.getSessionUser(r)
	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	if err := r.ParseMultipartForm(maxMapSize); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 15 Mo)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier requis"})
		return
	}
	defer file.Close()

	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		name = strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	}
	if name == "" {
		name = "Carte"
	}

	tagsRaw := strings.TrimSpace(r.FormValue("tags"))
	var tags []string
	if tagsRaw != "" {
		if err := json.Unmarshal([]byte(tagsRaw), &tags); err != nil {
			parts := strings.Split(tagsRaw, ",")
			for _, p := range parts {
				t := strings.TrimSpace(p)
				if t != "" {
					tags = append(tags, strings.ToLower(t))
				}
			}
		}
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedMapExtensions[ext] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (png, jpg, gif)"})
		return
	}

	if _, _, err := image.DecodeConfig(file); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier image invalide"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	dir := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	storageName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(header.Filename))
	storagePath := filepath.Join(dir, storageName)

	dst, err := os.Create(storagePath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	dst.Close()

	// Récupérer les dimensions de l'image (imageorient gère l'orientation EXIF)
	width, height := 800, 600
	if f, err := os.Open(storagePath); err == nil {
		if cfg, _, err := imageorient.DecodeConfig(f); err == nil {
			width = cfg.Width
			height = cfg.Height
		}
		f.Close()
	}

	imageURL := "/api/games/" + strconv.FormatInt(gameID, 10) + "/maps/file/" + filepath.Base(storagePath)

	tagsJSON := "[]"
	if len(tags) > 0 {
		b, _ := json.Marshal(tags)
		tagsJSON = string(b)
	}

	var mapID int64
	err = s.db.QueryRow(
		"INSERT INTO maps (game_id, name, image_url, width, height, grid_size, tags) VALUES (?, ?, ?, ?, ?, 50, ?) RETURNING id",
		gameID, name, imageURL, width, height, tagsJSON,
	).Scan(&mapID)
	if err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	m := &domain.Map{
		ID: mapID, GameID: gameID, Name: name, ImageURL: imageURL,
		Width: width, Height: height, GridSize: 50, Tags: tags,
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"map": m})
	s.hub.Broadcast(gameID, "map.created", m)
}

func (s *Server) handleGetMapFile(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		http.Error(w, "gameId requis", http.StatusBadRequest)
		return
	}

	filename := chi.URLParam(r, "filename")
	if filename == "" || strings.Contains(filename, "..") || filepath.Clean(filename) != filename {
		http.Error(w, "Fichier invalide", http.StatusBadRequest)
		return
	}

	storagePath := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10), filename)
	f, err := os.Open(storagePath)
	if err != nil {
		http.Error(w, "Fichier introuvable", http.StatusNotFound)
		return
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
	case ".gif":
		w.Header().Set("Content-Type", "image/gif")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	_, _ = io.Copy(w, f)
}

func (s *Server) handleGetMap(w http.ResponseWriter, r *http.Request) {
	mapIDStr := chi.URLParam(r, "mapId")
	mapID, err := strconv.ParseInt(mapIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var m domain.Map
	var gameID int64
	var tagsJSON string
	err = s.db.QueryRow(
		"SELECT id, game_id, name, image_url, width, height, grid_size, COALESCE(tags, '[]') FROM maps WHERE id = ?",
		mapID,
	).Scan(&m.ID, &gameID, &m.Name, &m.ImageURL, &m.Width, &m.Height, &m.GridSize, &tagsJSON)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Carte introuvable"})
		return
	}
	m.GameID = gameID
	_ = json.Unmarshal([]byte(tagsJSON), &m.Tags)

	writeJSON(w, http.StatusOK, map[string]interface{}{"map": m})
}

type updateMapReq struct {
	Name *string  `json:"name"`
	Tags []string `json:"tags"`
}

func (s *Server) handleUpdateMap(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

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

	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req updateMapReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	updates := []string{}
	args := []interface{}{}
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		updates = append(updates, "name = ?")
		args = append(args, strings.TrimSpace(*req.Name))
	}
	if req.Tags != nil {
		tagsJSON := "[]"
		if len(req.Tags) > 0 {
			b, _ := json.Marshal(req.Tags)
			tagsJSON = string(b)
		}
		updates = append(updates, "tags = ?")
		args = append(args, tagsJSON)
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucune modification"})
		return
	}
	args = append(args, mapID)

	_, err = s.db.Exec("UPDATE maps SET "+strings.Join(updates, ", ")+" WHERE id = ?", args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var m domain.Map
	var tagsJSON string
	err = s.db.QueryRow(
		"SELECT id, game_id, name, image_url, width, height, grid_size, COALESCE(tags, '[]') FROM maps WHERE id = ?",
		mapID,
	).Scan(&m.ID, &m.GameID, &m.Name, &m.ImageURL, &m.Width, &m.Height, &m.GridSize, &tagsJSON)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	_ = json.Unmarshal([]byte(tagsJSON), &m.Tags)
	writeJSON(w, http.StatusOK, map[string]interface{}{"map": m})
	s.broadcastMapEvent(m.ID, "map.updated", m)
}

func (s *Server) handleDeleteMap(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	mapIDStr := chi.URLParam(r, "mapId")
	mapID, err := strconv.ParseInt(mapIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var gameID int64
	var imageURL string
	err = s.db.QueryRow("SELECT game_id, image_url FROM maps WHERE id = ?", mapID).Scan(&gameID, &imageURL)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Carte introuvable"})
		return
	}

	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	// Supprimer le fichier si l'URL suit le pattern attendu
	if idx := strings.LastIndex(imageURL, "/file/"); idx >= 0 {
		filename := imageURL[idx+6:]
		if filename != "" && !strings.Contains(filename, "..") {
			storagePath := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10), filename)
			_ = os.Remove(storagePath)
		}
	}

	affectedGames := s.gamesShowingMap(mapID)
	_, _ = s.db.Exec("UPDATE games SET current_map_id = NULL WHERE current_map_id = ?", mapID)
	_, err = s.db.Exec("DELETE FROM maps WHERE id = ?", mapID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	for _, gid := range affectedGames {
		s.hub.Broadcast(gid, "map.deleted", map[string]interface{}{"mapId": mapID})
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Carte supprimée"})
}
