package httpapi

import (
	"database/sql"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const maxSheetSize = 10 << 20 // 10 Mo
const uploadsSheetsBase = "uploads/sheets"

var allowedSheetExtensions = map[string]string{
	".pdf":  "application/pdf",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

func (s *Server) registerCharacterSheetRoutes() {
	s.mux.Route("/api/games/{id}/character-sheet", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleGetCharacterSheet)
		r.Post("/", s.handleUploadCharacterSheet)
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

	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)

	targetUserID := u.ID
	if userIdStr := r.URL.Query().Get("userId"); userIdStr != "" && role == "MJ" {
		if uid, e := strconv.ParseInt(userIdStr, 10, 64); e == nil {
			targetUserID = uid
		}
	}

	var filename, mimeType string
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

	url := "/api/games/" + idStr + "/character-sheet/file"
	if targetUserID != u.ID {
		url += "?userId=" + strconv.FormatInt(targetUserID, 10)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"filename": filename,
		"mimeType": mimeType,
		"url":      url,
	})
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

	var storagePath, mimeType string
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

	f, err := os.Open(storagePath)
	if err != nil {
		http.Error(w, "Fichier introuvable", http.StatusNotFound)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", "inline")
	_, _ = io.Copy(w, f)
}
