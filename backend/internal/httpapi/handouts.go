package httpapi

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/docimport"
	"jdr-backend/internal/realtime"
)

// Documents : une lettre, un plan, le portrait d'un PNJ… Le MJ les prépare
// (texte et/ou image) puis les montre aux joueurs : le document s'ouvre alors
// chez tout le monde et reste consultable dans l'onglet Documents.

const (
	uploadsHandoutsBase = "uploads/handouts"
	maxHandoutSize      = 20 << 20
	maxHandoutBody      = 20000
)

type handout struct {
	ID       int64  `json:"id"`
	GameID   int64  `json:"gameId"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	ImageURL string `json:"imageUrl"`
	// Kind : text (texte et/ou image), document, sheet ou pdf (fichier importé).
	Kind string `json:"kind"`
	// Fichier d'origine, téléchargeable.
	FileURL  string `json:"fileUrl"`
	FileName string `json:"fileName"`
	// HasContent : contenu converti disponible via /content.
	HasContent bool   `json:"hasContent"`
	Shown      bool   `json:"shown"`
	CreatedAt  string `json:"createdAt"`
}

const handoutColumns = "id, game_id, title, body, image_url, kind, file_url, file_name, content IS NOT NULL, shown, created_at"

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
	if err := sc.Scan(&h.ID, &h.GameID, &h.Title, &h.Body, &h.ImageURL, &h.Kind, &h.FileURL, &h.FileName,
		&h.HasContent, &shown, &created); err != nil {
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
		r.Get("/{id}/content", s.handleGetHandoutContent)
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

// uploadedHandout : fichier envoyé avec un document.
type uploadedHandout struct {
	kind     string // image, document, sheet, pdf
	url      string
	name     string // nom d'origine
	content  *string
	errorMsg string
}

// saveHandoutFile enregistre le fichier envoyé (image, document, tableur ou
// PDF) et convertit textes et tableurs pour qu'ils se lisent dans la partie.
func saveHandoutFile(gameID int64, r *http.Request) *uploadedHandout {
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil
	}
	defer file.Close()
	kind := docimport.Kind(header.Filename)
	switch kind {
	case "":
		return &uploadedHandout{errorMsg: "Format non pris en charge. Images, PDF, Word (.docx), LibreOffice (.odt, .ods), Excel (.xlsx), CSV, texte ou Markdown."}
	case "legacy":
		return &uploadedHandout{errorMsg: "Ancien format Office : enregistrez le fichier en .docx ou .xlsx (Fichier > Enregistrer sous), ou exportez-le depuis Google Docs / Sheets."}
	}
	data, err := io.ReadAll(io.LimitReader(file, maxHandoutSize+1))
	if err != nil || len(data) > maxHandoutSize {
		return &uploadedHandout{errorMsg: "Fichier trop volumineux (max 20 Mo)"}
	}
	up := &uploadedHandout{kind: kind, name: filepath.Base(header.Filename)}
	if kind == "document" || kind == "sheet" {
		c, err := docimport.Parse(header.Filename, data)
		if err != nil {
			return &uploadedHandout{errorMsg: "Impossible de lire ce fichier : " + err.Error()}
		}
		raw, _ := json.Marshal(c)
		str := string(raw)
		up.content = &str
	}
	dir := filepath.Join(uploadsHandoutsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &uploadedHandout{errorMsg: "Erreur serveur"}
	}
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + strings.ToLower(filepath.Ext(header.Filename))
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return &uploadedHandout{errorMsg: "Erreur serveur"}
	}
	up.url = "/api/games/" + strconv.FormatInt(gameID, 10) + "/handouts/file/" + name
	return up
}

func (s *Server) handleCreateHandout(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	var title, body string
	var up *uploadedHandout
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(maxHandoutSize); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 20 Mo)"})
			return
		}
		title, body = r.FormValue("title"), r.FormValue("body")
		if up = saveHandoutFile(gameID, r); up != nil && up.errorMsg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": up.errorMsg})
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
	if title == "" && up != nil && up.kind != "image" {
		title = strings.TrimSuffix(up.name, filepath.Ext(up.name))
	}
	if title == "" {
		title = "Document"
	}
	if len(body) > maxHandoutBody {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Texte trop long"})
		return
	}
	if strings.TrimSpace(body) == "" && up == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Ajoutez un texte, une image ou un fichier"})
		return
	}
	kind, imageURL, fileURL, fileName := "text", "", "", ""
	var content *string
	if up != nil {
		if up.kind == "image" {
			imageURL = up.url
		} else {
			kind, fileURL, fileName, content = up.kind, up.url, up.name, up.content
		}
	}
	var id int64
	if err := s.db.QueryRow(
		`INSERT INTO handouts (game_id, title, body, image_url, kind, file_url, file_name, content)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		gameID, title, body, imageURL, kind, fileURL, fileName, content,
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
	for _, u := range []string{h.ImageURL, h.FileURL} {
		if u != "" {
			_ = os.Remove(filepath.Join(uploadsHandoutsBase, strconv.FormatInt(gameID, 10), filepath.Base(u)))
		}
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
		_ = s.db.QueryRow("SELECT 1 FROM handouts WHERE game_id = ? AND shown = 1 AND (image_url LIKE ? OR file_url LIKE ?) LIMIT 1",
			gameID, "%/file/"+name, "%/file/"+name).Scan(&ok)
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
	// ?download=<nom> : téléchargement sous le nom d'origine.
	if dl := r.URL.Query().Get("download"); dl != "" {
		w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(filepath.Base(dl)))
	}
	http.ServeContent(w, r, name, mod, f)
}

// handleGetHandoutContent : contenu converti d'un document ou d'un tableur
// (pour un joueur, seulement s'il lui a été montré).
func (s *Server) handleGetHandoutContent(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	id, ok := handoutID(w, r)
	if !ok {
		return
	}
	var content sql.NullString
	var shown int
	err := s.db.QueryRow("SELECT content, shown FROM handouts WHERE id = ? AND game_id = ?", id, gameID).Scan(&content, &shown)
	if err != nil || (shown != 1 && !s.isGMRequest(r)) {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document introuvable"})
		return
	}
	if !content.Valid {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Pas de contenu à afficher"})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(`{"content":` + content.String + `}`))
}
