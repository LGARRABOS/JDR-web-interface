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

	"jdr-backend/internal/realtime"
)

// Documents : une lettre, un plan, le portrait d'un PNJ… Le MJ les prépare
// (texte et/ou image) puis les montre aux joueurs : le document s'ouvre alors
// chez tout le monde et reste consultable dans l'onglet Documents.

const (
	uploadsHandoutsBase = "uploads/handouts"
	maxHandoutSize      = 10 << 20
	maxHandoutBody      = 20000
)

type handout struct {
	ID        int64  `json:"id"`
	GameID    int64  `json:"gameId"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	ImageURL  string `json:"imageUrl"`
	Shown     bool   `json:"shown"`
	CreatedAt string `json:"createdAt"`
}

const handoutColumns = "id, game_id, title, body, image_url, shown, created_at"

// isGMRequest : l'auteur de la requête est-il MJ de la partie ?
func (s *Server) isGMRequest(r *http.Request) bool {
	u := s.getSessionUser(r)
	if u == nil {
		return false
	}
	role, ok := s.getUserGameRole(getGameIDFromContext(r), u.ID)
	return ok && role == "MJ"
}

func scanHandout(sc rowScanner) (*handout, error) {
	var h handout
	var shown int
	var created time.Time
	if err := sc.Scan(&h.ID, &h.GameID, &h.Title, &h.Body, &h.ImageURL, &shown, &created); err != nil {
		return nil, err
	}
	h.Shown = shown == 1
	h.CreatedAt = created.UTC().Format(time.RFC3339)
	return &h, nil
}

func (s *Server) registerHandoutRoutes() {
	s.mux.Route("/api/games/{gameId}/handouts", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Get("/", s.handleListHandouts)
		r.With(s.requireGM).Post("/", s.handleCreateHandout)
		r.With(s.requireGM).Patch("/{id}", s.handleUpdateHandout)
		r.With(s.requireGM).Post("/{id}/show", s.handleShowHandout)
		r.With(s.requireGM).Delete("/{id}", s.handleDeleteHandout)
		r.Get("/file/{filename}", s.handleGetHandoutFile)
	})
}

// listHandouts : tout pour le MJ, seulement les documents montrés pour un joueur.
func (s *Server) listHandouts(gameID int64, forGM bool) ([]*handout, error) {
	q := "SELECT " + handoutColumns + " FROM handouts WHERE game_id = ?"
	if !forGM {
		q += " AND shown = 1"
	}
	rows, err := s.db.Query(q+" ORDER BY id", gameID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*handout{}
	for rows.Next() {
		h, err := scanHandout(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (s *Server) getHandout(gameID, id int64) (*handout, error) {
	return scanHandout(s.db.QueryRow("SELECT "+handoutColumns+" FROM handouts WHERE id = ? AND game_id = ?", id, gameID))
}

// broadcastHandout : le MJ reçoit toujours le document ; les joueurs seulement
// s'il est montré (sinon un document caché est retiré de leur liste).
func (s *Server) broadcastHandout(eventType string, h *handout) {
	// Document caché : les joueurs n'en reçoivent que l'identifiant, pour le retirer.
	hidden := &handout{ID: h.ID, GameID: h.GameID}
	s.hub.BroadcastFunc(h.GameID, func(m realtime.Member) (string, any, bool) {
		switch {
		case m.IsGM() || h.Shown:
			return eventType, h, true
		case eventType == "handout.updated":
			return eventType, hidden, true
		}
		return "", nil, false
	})
}

func (s *Server) handleListHandouts(w http.ResponseWriter, r *http.Request) {
	list, err := s.listHandouts(getGameIDFromContext(r), s.isGMRequest(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"handouts": list})
}

// saveHandoutImage enregistre l'image envoyée et retourne son URL ("" sans image).
func saveHandoutImage(gameID int64, r *http.Request) (string, string) {
	file, header, err := r.FormFile("file")
	if err != nil {
		return "", ""
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" && ext != ".webp" {
		return "", "Format non autorisé (png, jpg, gif, webp)"
	}
	dir := filepath.Join(uploadsHandoutsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "Erreur serveur"
	}
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	dst, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		return "", "Erreur serveur"
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		return "", "Erreur serveur"
	}
	return "/api/games/" + strconv.FormatInt(gameID, 10) + "/handouts/file/" + name, ""
}

func (s *Server) handleCreateHandout(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	var title, body, imageURL string
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(maxHandoutSize); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 10 Mo)"})
			return
		}
		title, body = r.FormValue("title"), r.FormValue("body")
		var msg string
		if imageURL, msg = saveHandoutImage(gameID, r); msg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": msg})
			return
		}
	} else {
		var req struct{ Title, Body string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
			return
		}
		title, body = req.Title, req.Body
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Document"
	}
	if len(body) > maxHandoutBody {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Texte trop long"})
		return
	}
	if strings.TrimSpace(body) == "" && imageURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Ajoutez un texte ou une image"})
		return
	}
	var id int64
	if err := s.db.QueryRow(
		"INSERT INTO handouts (game_id, title, body, image_url) VALUES (?, ?, ?, ?) RETURNING id",
		gameID, title, body, imageURL,
	).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	h, err := s.getHandout(gameID, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"handout": h})
	s.broadcastHandout("handout.created", h)
}

func handoutID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return 0, false
	}
	return id, true
}

func (s *Server) handleUpdateHandout(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	id, ok := handoutID(w, r)
	if !ok {
		return
	}
	var req struct {
		Title *string `json:"title"`
		Body  *string `json:"body"`
		Shown *bool   `json:"shown"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	updates, args := []string{}, []any{}
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			t = "Document"
		}
		updates, args = append(updates, "title = ?"), append(args, t)
	}
	if req.Body != nil {
		if len(*req.Body) > maxHandoutBody {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Texte trop long"})
			return
		}
		updates, args = append(updates, "body = ?"), append(args, *req.Body)
	}
	if req.Shown != nil {
		v := 0
		if *req.Shown {
			v = 1
		}
		updates, args = append(updates, "shown = ?"), append(args, v)
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucune modification"})
		return
	}
	args = append(args, id, gameID)
	res, err := s.db.Exec("UPDATE handouts SET "+strings.Join(updates, ", ")+" WHERE id = ? AND game_id = ?", args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document introuvable"})
		return
	}
	h, err := s.getHandout(gameID, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"handout": h})
	s.broadcastHandout("handout.updated", h)
}

// handleShowHandout montre le document : il s'ouvre chez tous les joueurs.
func (s *Server) handleShowHandout(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	id, ok := handoutID(w, r)
	if !ok {
		return
	}
	if _, err := s.db.Exec("UPDATE handouts SET shown = 1 WHERE id = ? AND game_id = ?", id, gameID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	h, err := s.getHandout(gameID, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document introuvable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"handout": h})
	s.hub.Broadcast(gameID, "handout.shown", h)
}

func (s *Server) handleDeleteHandout(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	id, ok := handoutID(w, r)
	if !ok {
		return
	}
	h, err := s.getHandout(gameID, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document introuvable"})
		return
	}
	if _, err := s.db.Exec("DELETE FROM handouts WHERE id = ?", id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if h.ImageURL != "" {
		_ = os.Remove(filepath.Join(uploadsHandoutsBase, strconv.FormatInt(gameID, 10), filepath.Base(h.ImageURL)))
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Document supprimé"})
	s.hub.Broadcast(gameID, "handout.deleted", map[string]int64{"id": id})
}

// handleGetHandoutFile : le MJ voit toutes les images, un joueur seulement
// celles des documents montrés.
func (s *Server) handleGetHandoutFile(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	name := chi.URLParam(r, "filename")
	if name == "" || strings.Contains(name, "..") || filepath.Base(name) != name {
		http.Error(w, "Fichier invalide", http.StatusBadRequest)
		return
	}
	if !s.isGMRequest(r) {
		var ok int
		_ = s.db.QueryRow("SELECT 1 FROM handouts WHERE game_id = ? AND shown = 1 AND image_url LIKE ? LIMIT 1",
			gameID, "%/file/"+name).Scan(&ok)
		if ok != 1 {
			http.Error(w, "Document non montré", http.StatusForbidden)
			return
		}
	}
	f, err := os.Open(filepath.Join(uploadsHandoutsBase, strconv.FormatInt(gameID, 10), name))
	if err != nil {
		http.Error(w, "Fichier introuvable", http.StatusNotFound)
		return
	}
	defer f.Close()
	var mod time.Time
	if st, err := f.Stat(); err == nil {
		mod = st.ModTime()
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, name, mod, f)
}
