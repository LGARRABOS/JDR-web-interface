package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

const maxElementSize = 5 << 20 // 5 Mo
const uploadsElementsBase = "uploads/elements"

func (s *Server) registerElementRoutes() {
	s.mux.Route("/api/games/{gameId}/elements", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Get("/", s.handleListElements)
		r.Post("/upload", s.handleUploadElement)
		r.Get("/{id}", s.handleGetElement)
		r.Patch("/{id}", s.handlePatchElement)
		r.Delete("/{id}", s.handleDeleteElement)
	})
	s.mux.Route("/api/games/{gameId}/elements/file/{filename}", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireElementFileAccess)
		r.Get("/", s.handleGetElementFile)
	})
}

func (s *Server) handleListElements(w http.ResponseWriter, r *http.Request) {
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

	// Éléments partagés : tous ceux uploadés par ce MJ (toutes parties confondues)
	rows, err := s.db.Query("SELECT "+elementColumns+" FROM game_elements WHERE user_id = ? ORDER BY id", u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	elements := []*domain.GameElement{}
	for rows.Next() {
		e, err := scanElement(rows)
		if err != nil {
			continue
		}
		elements = append(elements, e)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"elements": elements})
}

func (s *Server) handleGetElement(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	u := s.getSessionUser(r)
	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)

	if role != "MJ" {
		// Un joueur ne lit la fiche d'un monstre qu'une fois celui-ci vaincu,
		// et seulement les rubriques que le MJ a rendues visibles.
		e, err := s.getElement(id)
		if err != nil || !s.isDefeatedInGame(gameID, id) {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Fiche disponible une fois le monstre vaincu"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"element": elementForPlayers(e)})
		return
	}

	e, err := scanElement(s.db.QueryRow(
		"SELECT "+elementColumns+" FROM game_elements WHERE id = ? AND (user_id = ? OR game_id = ?)",
		id, u.ID, gameID,
	))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Élément introuvable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"element": e})
}

type patchElementReq struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	UniqueTrait *string  `json:"uniqueTrait"`
	Loot        *string  `json:"loot"`
	MaxHp       *int     `json:"maxHp"`
	MaxMana     *int     `json:"maxMana"`
	IconPosX    *int     `json:"iconPosX"`
	IconPosY    *int     `json:"iconPosY"`
	IconScale   *float64 `json:"iconScale"`
	// Rubriques de la fiche visibles par les joueurs une fois le monstre vaincu.
	PlayerFields *[]string `json:"playerFields"`
}

func (s *Server) handlePatchElement(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var req patchElementReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	updates := []string{}
	args := []interface{}{}
	if req.Name != nil {
		updates = append(updates, "name = ?")
		args = append(args, *req.Name)
	}
	if req.Description != nil {
		updates = append(updates, "description = ?")
		args = append(args, *req.Description)
	}
	if req.UniqueTrait != nil {
		updates = append(updates, "unique_trait = ?")
		args = append(args, *req.UniqueTrait)
	}
	if req.Loot != nil {
		updates = append(updates, "loot = ?")
		args = append(args, *req.Loot)
	}
	if req.MaxHp != nil {
		updates = append(updates, "max_hp = ?")
		args = append(args, *req.MaxHp)
	}
	if req.MaxMana != nil {
		updates = append(updates, "max_mana = ?")
		args = append(args, *req.MaxMana)
	}
	if req.IconPosX != nil {
		updates = append(updates, "icon_pos_x = ?")
		args = append(args, *req.IconPosX)
	}
	if req.IconPosY != nil {
		updates = append(updates, "icon_pos_y = ?")
		args = append(args, *req.IconPosY)
	}
	if req.IconScale != nil {
		updates = append(updates, "icon_scale = ?")
		args = append(args, *req.IconScale)
	}
	if req.PlayerFields != nil {
		fields, err := json.Marshal(normalizePlayerFields(*req.PlayerFields))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Rubriques invalides"})
			return
		}
		updates = append(updates, "player_fields = ?::jsonb")
		args = append(args, string(fields))
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucune modification"})
		return
	}
	args = append(args, id)

	_, err = s.db.Exec("UPDATE game_elements SET "+strings.Join(updates, ", ")+" WHERE id = ? AND user_id = ?", append(args, u.ID)...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	// Retourner l'élément mis à jour
	e, err := s.getElement(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Élément introuvable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"element": e})
}

func (s *Server) handleUploadElement(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(maxElementSize); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 5 Mo)"})
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
		name = "Élément"
	}

	category := strings.TrimSpace(strings.ToLower(r.FormValue("category")))
	if category != "monster" && category != "decor" {
		category = "monster"
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
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (png, jpg, gif)"})
		return
	}

	dir := filepath.Join(uploadsElementsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	storageName := strconv.FormatInt(time.Now().UnixNano(), 10) + "_" + filepath.Base(header.Filename)
	storagePath := filepath.Join(dir, storageName)

	dst, err := os.Create(storagePath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	dst.Close()

	imageURL := "/api/games/" + strconv.FormatInt(gameID, 10) + "/elements/file/" + filepath.Base(storagePath)

	tagsJSON := "[]"
	if len(tags) > 0 {
		b, _ := json.Marshal(tags)
		tagsJSON = string(b)
	}

	var id int64
	err = s.db.QueryRow(
		"INSERT INTO game_elements (game_id, user_id, name, image_url, category, tags) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
		gameID, u.ID, name, imageURL, category, tagsJSON,
	).Scan(&id)
	if err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var createdAt string
	_ = s.db.QueryRow("SELECT created_at FROM game_elements WHERE id = ?", id).Scan(&createdAt)

	e := &domain.GameElement{
		ID:        id,
		GameID:    gameID,
		Name:      name,
		ImageURL:  imageURL,
		Category:  category,
		Tags:      tags,
		CreatedAt: createdAt,
	}
	e.PlayerFields = defaultPlayerFields
	writeJSON(w, http.StatusCreated, map[string]interface{}{"element": e})
}

func (s *Server) handleGetElementFile(w http.ResponseWriter, r *http.Request) {
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

	storagePath := filepath.Join(uploadsElementsBase, strconv.FormatInt(gameID, 10), filename)
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

func (s *Server) handleDeleteElement(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	var imageURL string
	var elemGameID int64
	err = s.db.QueryRow("SELECT image_url, game_id FROM game_elements WHERE id = ? AND (user_id = ? OR game_id = ?)", id, u.ID, gameID).Scan(&imageURL, &elemGameID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Élément introuvable"})
		return
	}

	if idx := strings.LastIndex(imageURL, "/file/"); idx >= 0 {
		filename := imageURL[idx+6:]
		if filename != "" && !strings.Contains(filename, "..") {
			storagePath := filepath.Join(uploadsElementsBase, strconv.FormatInt(elemGameID, 10), filename)
			_ = os.Remove(storagePath)
		}
	}

	_, err = s.db.Exec("DELETE FROM game_elements WHERE id = ? AND user_id = ?", id, u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Supprimé"})
}
