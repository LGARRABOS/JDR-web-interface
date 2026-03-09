package httpapi

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const maxMusicSize = 20 << 20 // 20 Mo
const uploadsMusicBase = "uploads/music"

var allowedMusicExtensions = map[string]string{
	".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
}

func (s *Server) registerMusicRoutes() {
	s.mux.Route("/api/games/{id}/music", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleListMusic)
		r.Post("/upload", s.handleUploadMusic)
		r.Get("/{trackId}/file", s.handleGetMusicFile)
		r.Delete("/{trackId}", s.handleDeleteMusic)
	})
}

func (s *Server) handleUploadMusic(w http.ResponseWriter, r *http.Request) {
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
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	if err := r.ParseMultipartForm(maxMusicSize); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 20 Mo)"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier requis"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if _, ok := allowedMusicExtensions[ext]; !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (mp3, ogg, wav, m4a)"})
		return
	}

	dir := filepath.Join(uploadsMusicBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	storageName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
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

	res, err := s.db.Exec(
		"INSERT INTO game_music (game_id, filename, storage_path) VALUES (?, ?, ?)",
		gameID, header.Filename, storagePath,
	)
	if err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	trackID, _ := res.LastInsertId()

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"track": map[string]interface{}{
			"id":       trackID,
			"filename": header.Filename,
		},
	})
}

func (s *Server) handleListMusic(w http.ResponseWriter, r *http.Request) {
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

	rows, err := s.db.Query("SELECT id, filename FROM game_music WHERE game_id = ? ORDER BY created_at", gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var tracks []map[string]interface{}
	for rows.Next() {
		var id int64
		var filename string
		if err := rows.Scan(&id, &filename); err != nil {
			continue
		}
		tracks = append(tracks, map[string]interface{}{
			"id":       id,
			"filename": filename,
			"url":      "/api/games/" + idStr + "/music/" + strconv.FormatInt(id, 10) + "/file",
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"tracks": tracks})
}

func (s *Server) handleGetMusicFile(w http.ResponseWriter, r *http.Request) {
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

	trackIDStr := chi.URLParam(r, "trackId")
	trackID, err := strconv.ParseInt(trackIDStr, 10, 64)
	if err != nil {
		http.Error(w, "ID piste invalide", http.StatusBadRequest)
		return
	}

	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok != 1 {
		http.Error(w, "Accès refusé", http.StatusForbidden)
		return
	}

	var storagePath, filename string
	err = s.db.QueryRow("SELECT storage_path, filename FROM game_music WHERE id = ? AND game_id = ?", trackID, gameID).Scan(&storagePath, &filename)
	if err == sql.ErrNoRows {
		http.Error(w, "Piste introuvable", http.StatusNotFound)
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

	ext := strings.ToLower(filepath.Ext(filename))
	if mime, ok := allowedMusicExtensions[ext]; ok {
		w.Header().Set("Content-Type", mime)
	} else {
		w.Header().Set("Content-Type", "audio/mpeg")
	}
	w.Header().Set("Accept-Ranges", "bytes")
	io.Copy(w, f)
}

func (s *Server) handleDeleteMusic(w http.ResponseWriter, r *http.Request) {
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

	trackIDStr := chi.URLParam(r, "trackId")
	trackID, err := strconv.ParseInt(trackIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID piste invalide"})
		return
	}

	var role string
	_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role)
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var storagePath string
	err = s.db.QueryRow("SELECT storage_path FROM game_music WHERE id = ? AND game_id = ?", trackID, gameID).Scan(&storagePath)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Piste introuvable"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	_ = os.Remove(storagePath)
	_, err = s.db.Exec("DELETE FROM game_music WHERE id = ? AND game_id = ?", trackID, gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Piste supprimée"})
}
