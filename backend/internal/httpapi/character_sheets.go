package httpapi

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const maxSheetSize = 10 << 20   // 10 Mo
const maxAvatarSize = 2 << 20   // 2 Mo
const uploadsSheetsBase = "uploads/sheets"
const uploadsAvatarsBase = "uploads/character-avatars"

var allowedAvatarExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
}

var allowedSheetExtensions = map[string]string{
	".pdf":  "application/pdf",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

func (s *Server) registerCharacterSheetRoutes() {
	s.mux.Route("/api/games/{id}/character-sheet", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Post("/avatar", s.handleUploadCharacterSheetAvatar)
		r.Get("/avatar/file/{filename}", s.handleGetCharacterSheetAvatarFile)
		r.Get("/", s.handleGetCharacterSheet)
		r.Post("/", s.handleUploadCharacterSheet)
		r.Patch("/", s.handlePatchCharacterSheet)
		r.Get("/file", s.handleGetCharacterSheetFile)
	})
}

func (s *Server) handleUploadCharacterSheet(w http.ResponseWriter, r *http.Request) {
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

	var isGemma int
	_ = s.db.QueryRow("SELECT is_gemma FROM games WHERE id = ?", gameID).Scan(&isGemma)
	if isGemma == 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "En mode GEMMA, utilisez le formulaire in-app"})
		return
	}

	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok != 1 {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	if err := r.ParseMultipartForm(maxSheetSize); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 10 Mo)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier requis"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	mimeType, allowed := allowedSheetExtensions[ext]
	if !allowed {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (PDF, .doc, .docx uniquement)"})
		return
	}

	dir := filepath.Join(uploadsSheetsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	storageName := strconv.FormatInt(u.ID, 10) + ext
	storagePath := filepath.Join(dir, storageName)

	dst, err := os.Create(storagePath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	_, err = s.db.Exec(`
		INSERT INTO game_character_sheets (game_id, user_id, filename, storage_path, mime_type)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(game_id, user_id) DO UPDATE SET filename = excluded.filename, storage_path = excluded.storage_path, mime_type = excluded.mime_type
	`, gameID, u.ID, header.Filename, storagePath, mimeType)
	if err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"filename":  header.Filename,
		"mimeType":  mimeType,
	})
}

func (s *Server) handleGetCharacterSheet(w http.ResponseWriter, r *http.Request) {
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

	var isGemma int
	_ = s.db.QueryRow("SELECT is_gemma FROM games WHERE id = ?", gameID).Scan(&isGemma)

	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)

	targetUserID := u.ID
	if userIdStr := r.URL.Query().Get("userId"); userIdStr != "" && role == "MJ" {
		if uid, e := strconv.ParseInt(userIdStr, 10, 64); e == nil {
			targetUserID = uid
		}
	}

	if isGemma == 1 {
		var dataJSON []byte
		err = s.db.QueryRow(`
			SELECT data FROM game_character_sheets
			WHERE game_id = ? AND user_id = ?
		`, gameID, targetUserID).Scan(&dataJSON)
		if err == sql.ErrNoRows {
			writeJSON(w, http.StatusOK, map[string]interface{}{"data": nil})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
			return
		}
		var data interface{}
		if len(dataJSON) > 0 {
			_ = json.Unmarshal(dataJSON, &data)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"data": data})
		return
	}

	var filename, mimeType sql.NullString
	err = s.db.QueryRow(`
		SELECT filename, mime_type FROM game_character_sheets
		WHERE game_id = ? AND user_id = ?
	`, gameID, targetUserID).Scan(&filename, &mimeType)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Aucune fiche"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if !filename.Valid || !mimeType.Valid {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Aucune fiche"})
		return
	}

	url := "/api/games/" + idStr + "/character-sheet/file"
	if targetUserID != u.ID {
		url += "?userId=" + strconv.FormatInt(targetUserID, 10)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"filename": filename.String,
		"mimeType": mimeType.String,
		"url":      url,
	})
}

func (s *Server) handlePatchCharacterSheet(w http.ResponseWriter, r *http.Request) {
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

	var isGemma int
	_ = s.db.QueryRow("SELECT is_gemma FROM games WHERE id = ?", gameID).Scan(&isGemma)
	if isGemma != 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fiche in-app réservée aux parties GEMMA"})
		return
	}

	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok != 1 {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	var body struct {
		Data interface{} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	dataJSON, err := json.Marshal(body.Data)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Données invalides"})
		return
	}

	_, err = s.db.Exec(`
		INSERT INTO game_character_sheets (game_id, user_id, data)
		VALUES (?, ?, ?::jsonb)
		ON CONFLICT (game_id, user_id) DO UPDATE SET data = EXCLUDED.data
	`, gameID, u.ID, string(dataJSON))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	// Sync tokenIconUrl, tokenWidth, tokenHeight, tokenIconPosX, tokenIconPosY to PJ tokens
	if dataMap, ok := body.Data.(map[string]interface{}); ok {
		iconURL, _ := dataMap["tokenIconUrl"].(string)
		tokenWidth := 56
		if w, ok := dataMap["tokenWidth"].(float64); ok && w > 0 {
			tokenWidth = int(w)
		}
		tokenHeight := 56
		if h, ok := dataMap["tokenHeight"].(float64); ok && h > 0 {
			tokenHeight = int(h)
		}
		tokenIconPosX := 50
		if x, ok := dataMap["tokenIconPosX"].(float64); ok {
			tokenIconPosX = int(x)
		}
		tokenIconPosY := 50
		if y, ok := dataMap["tokenIconPosY"].(float64); ok {
			tokenIconPosY = int(y)
		}
		tokenIconScale := 1.0
		if s, ok := dataMap["tokenIconScale"].(float64); ok && s > 0 {
			tokenIconScale = s
		}
		if iconURL != "" {
			_, _ = s.db.Exec(`
				UPDATE tokens t
				SET icon_url = ?, width = ?, height = ?, icon_pos_x = ?, icon_pos_y = ?, icon_scale = ?
				FROM maps m
				WHERE t.map_id = m.id AND m.game_id = ? AND t.kind = 'PJ' AND t.owner_user_id = ?
			`, iconURL, tokenWidth, tokenHeight, tokenIconPosX, tokenIconPosY, tokenIconScale, gameID, u.ID)
		} else {
			_, _ = s.db.Exec(`
				UPDATE tokens t
				SET icon_url = NULL
				FROM maps m
				WHERE t.map_id = m.id AND m.game_id = ? AND t.kind = 'PJ' AND t.owner_user_id = ?
			`, gameID, u.ID)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"data": body.Data})
}

func (s *Server) handleGetCharacterSheetFile(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		http.Error(w, "Non authentifié", http.StatusUnauthorized)
		return
	}

	idStr := chi.URLParam(r, "id")
	gameID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "ID invalide", http.StatusBadRequest)
		return
	}

	targetUserID := u.ID
	if userIdStr := r.URL.Query().Get("userId"); userIdStr != "" {
		var role string
		_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
		if role == "MJ" {
			if uid, e := strconv.ParseInt(userIdStr, 10, 64); e == nil {
				targetUserID = uid
			}
		}
	}

	var storagePath, mimeType sql.NullString
	err = s.db.QueryRow(`
		SELECT storage_path, mime_type FROM game_character_sheets
		WHERE game_id = ? AND user_id = ?
	`, gameID, targetUserID).Scan(&storagePath, &mimeType)
	if err == sql.ErrNoRows {
		http.Error(w, "Fiche introuvable", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Erreur serveur", http.StatusInternalServerError)
		return
	}
	if !storagePath.Valid || storagePath.String == "" {
		http.Error(w, "Fiche introuvable", http.StatusNotFound)
		return
	}

	f, err := os.Open(storagePath.String)
	if err != nil {
		http.Error(w, "Fichier introuvable", http.StatusNotFound)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", mimeType.String)
	w.Header().Set("Content-Disposition", "inline")
	_, _ = io.Copy(w, f)
}

func (s *Server) handleUploadCharacterSheetAvatar(w http.ResponseWriter, r *http.Request) {
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

	var isGemma int
	_ = s.db.QueryRow("SELECT is_gemma FROM games WHERE id = ?", gameID).Scan(&isGemma)
	if isGemma != 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Avatar réservé aux parties GEMMA"})
		return
	}

	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok != 1 {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	if err := r.ParseMultipartForm(maxAvatarSize); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 2 Mo)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier requis"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedAvatarExtensions[ext] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (png, jpg, jpeg, gif)"})
		return
	}

	dir := filepath.Join(uploadsAvatarsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	storageName := strconv.FormatInt(u.ID, 10) + "_" + strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	storagePath := filepath.Join(dir, storageName)

	dst, err := os.Create(storagePath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	url := "/api/games/" + idStr + "/character-sheet/avatar/file/" + storageName
	writeJSON(w, http.StatusOK, map[string]interface{}{"url": url})
}

func (s *Server) handleGetCharacterSheetAvatarFile(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		http.Error(w, "Non authentifié", http.StatusUnauthorized)
		return
	}

	idStr := chi.URLParam(r, "id")
	gameID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "ID invalide", http.StatusBadRequest)
		return
	}

	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok != 1 {
		http.Error(w, "Accès refusé", http.StatusForbidden)
		return
	}

	filename := chi.URLParam(r, "filename")
	if filename == "" || strings.Contains(filename, "..") || filepath.Clean(filename) != filename {
		http.Error(w, "Fichier invalide", http.StatusBadRequest)
		return
	}

	storagePath := filepath.Join(uploadsAvatarsBase, strconv.FormatInt(gameID, 10), filename)
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
