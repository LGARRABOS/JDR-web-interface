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

	var trackID int64
	err = s.db.QueryRow(
		"INSERT INTO game_music (game_id, user_id, filename, storage_path) VALUES (?, ?, ?, ?) RETURNING id",
		gameID, u.ID, header.Filename, storagePath,
	).Scan(&trackID)
	if err != nil {
		os.Remove(storagePath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

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

	// Musique partagée : toutes les pistes des parties où ce MJ est présent
	rows, err := s.db.Query(
		`SELECT gm.id, gm.game_id, gm.filename FROM game_music gm
		 INNER JOIN game_players gp ON gp.game_id = gm.game_id AND gp.user_id = ? AND gp.role = 'MJ'
		 ORDER BY gm.created_at`,
		u.ID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var tracks []map[string]interface{}
	for rows.Next() {
		var id int64
		var trackGameID int64
		var filename string
		if err := rows.Scan(&id, &trackGameID, &filename); err != nil {
			continue
		}
		tracks = append(tracks, map[string]interface{}{
			"id":       id,
			"gameId":   trackGameID,
			"filename": filename,
			"url":      "/api/games/" + strconv.FormatInt(trackGameID, 10) + "/music/" + strconv.FormatInt(id, 10) + "/file",
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

	var storagePath, filename string
	var trackUserID sql.NullInt64
	err = s.db.QueryRow(
		"SELECT storage_path, filename, user_id FROM game_music WHERE id = ? AND game_id = ?",
		trackID, gameID,
	).Scan(&storagePath, &filename, &trackUserID)
	if err == sql.ErrNoRows {
		http.Error(w, "Piste introuvable", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Erreur serveur", http.StatusInternalServerError)
		return
	}

	// Accès : utilisateur a accès au game OU partage une partie avec le propriétaire (joueurs qui écoutent la musique du MJ)
	hasAccess := false
	var ok int
	_ = s.db.QueryRow("SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&ok)
	if ok == 1 {
		hasAccess = true
	}
	if !hasAccess && trackUserID.Valid {
		// Utilisateur partage une partie avec le propriétaire de la piste
		_ = s.db.QueryRow(
			`SELECT 1 FROM game_players gp1
			 INNER JOIN game_players gp2 ON gp1.game_id = gp2.game_id AND gp2.user_id = ?
			 WHERE gp1.user_id = ?`,
			u.ID, trackUserID.Int64,
		).Scan(&ok)
		if ok == 1 {
			hasAccess = true
		}
	}
	if !hasAccess {
		http.Error(w, "Accès refusé", http.StatusForbidden)
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
	_, _ = io.Copy(w, f)
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

	var storagePath string
	var trackGameID int64
	var trackUserID sql.NullInt64
	err = s.db.QueryRow(
		"SELECT storage_path, game_id, user_id FROM game_music WHERE id = ?",
		trackID,
	).Scan(&storagePath, &trackGameID, &trackUserID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Piste introuvable"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	canDelete := false
	if trackUserID.Valid && trackUserID.Int64 == u.ID {
		canDelete = true
	} else {
		var role string
		_ = s.db.QueryRow("SELECT role FROM game_players WHERE game_id = ? AND user_id = ?", trackGameID, u.ID).Scan(&role)
		if role == "MJ" && trackGameID == gameID {
			canDelete = true
		}
	}
	if !canDelete {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au propriétaire"})
		return
	}

	_ = os.Remove(storagePath)
	_, err = s.db.Exec("DELETE FROM game_music WHERE id = ?", trackID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Piste supprimée"})
}
