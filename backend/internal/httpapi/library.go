package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// Bibliothèque personnelle : chaque utilisateur a une « partie » cachée qui
// range ses cartes, monstres, décors et musiques hors de toute table. Elle
// réutilise les mêmes routes que les ressources d'une partie ; ses cartes et
// ses musiques sont proposées dans toutes les parties dont il est le MJ.

func (s *Server) registerLibraryRoutes() {
	s.mux.Route("/api/library", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleGetLibrary)
	})
	s.mux.Route("/api/games/{id}/players/me", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Delete("/", s.handleLeaveGame)
	})
}

// ensureLibrary retourne l'id de la bibliothèque de l'utilisateur, en la créant
// au besoin.
func (s *Server) ensureLibrary(userID int64) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		"SELECT id FROM games WHERE owner_id = ? AND COALESCE(is_library, 0) = 1 ORDER BY id LIMIT 1", userID,
	).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	for attempt := 0; attempt < 5; attempt++ {
		err = s.db.QueryRow(
			"INSERT INTO games (name, invite_code, owner_id, is_gemma, is_library) VALUES ('Ma bibliothèque', ?, ?, 0, 1) RETURNING id",
			"LIB-"+generateInviteCode()+generateInviteCode(), userID,
		).Scan(&id)
		if err == nil {
			break
		}
		if !isUniqueViolation(err) {
			return 0, err
		}
	}
	if err != nil {
		return 0, err
	}
	_, err = s.db.Exec("INSERT INTO game_players (game_id, user_id, role) VALUES (?, ?, 'MJ')", id, userID)
	return id, err
}

func (s *Server) handleGetLibrary(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	id, err := s.ensureLibrary(u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"gameId": id})
}

func (s *Server) isLibrary(gameID int64) bool {
	var lib int
	_ = s.db.QueryRow("SELECT COALESCE(is_library, 0) FROM games WHERE id = ?", gameID).Scan(&lib)
	return lib == 1
}

// moveFiles déplace les fichiers d'un dossier de partie vers un autre.
func moveFiles(base string, from, to int64) {
	src := filepath.Join(base, strconv.FormatInt(from, 10))
	entries, err := os.ReadDir(src)
	if err != nil {
		return
	}
	dst := filepath.Join(base, strconv.FormatInt(to, 10))
	if os.MkdirAll(dst, 0o755) != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() {
			_ = os.Rename(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name()))
		}
	}
	_ = os.Remove(src)
}

// moveGameAssetsToLibrary range les cartes, monstres, décors et musiques d'une
// partie dans la bibliothèque de son MJ avant qu'elle soit supprimée : rien de
// ce qui a été préparé n'est perdu. Les jetons des joueurs de cette partie
// sont retirés des cartes ; monstres, décors et brouillard restent en place.
func (s *Server) moveGameAssetsToLibrary(gameID, ownerID int64) error {
	lib, err := s.ensureLibrary(ownerID)
	if err != nil {
		return err
	}
	if lib == gameID {
		return nil
	}
	g, l := strconv.FormatInt(gameID, 10), strconv.FormatInt(lib, 10)
	mapsOld, mapsNew := "/api/games/"+g+"/maps/file/", "/api/games/"+l+"/maps/file/"
	elOld, elNew := "/api/games/"+g+"/elements/file/", "/api/games/"+l+"/elements/file/"

	moveFiles(uploadsMapsBase, gameID, lib)
	moveFiles(uploadsElementsBase, gameID, lib)
	moveFiles(uploadsMusicBase, gameID, lib)

	stmts := []struct {
		q    string
		args []any
	}{
		{"DELETE FROM tokens WHERE kind = 'PJ' AND map_id IN (SELECT id FROM maps WHERE game_id = ?)", []any{gameID}},
		{"UPDATE games SET current_map_id = NULL WHERE id = ?", []any{gameID}},
		{"UPDATE maps SET game_id = ?, image_url = REPLACE(image_url, ?, ?) WHERE game_id = ?", []any{lib, mapsOld, mapsNew, gameID}},
		{"UPDATE game_elements SET game_id = ?, image_url = REPLACE(image_url, ?, ?) WHERE game_id = ?", []any{lib, elOld, elNew, gameID}},
		{"UPDATE tokens SET icon_url = REPLACE(icon_url, ?, ?) WHERE icon_url LIKE ?", []any{elOld, elNew, "%" + elOld + "%"}},
		{"UPDATE map_elements SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?", []any{elOld, elNew, "%" + elOld + "%"}},
		{"UPDATE game_music SET game_id = ?, storage_path = REPLACE(storage_path, ?, ?) WHERE game_id = ?", []any{
			lib,
			filepath.Join(uploadsMusicBase, g) + string(filepath.Separator),
			filepath.Join(uploadsMusicBase, l) + string(filepath.Separator),
			gameID,
		}},
	}
	for _, st := range stmts {
		if _, err := s.db.Exec(st.q, st.args...); err != nil {
			return err
		}
	}
	return nil
}

// handleLeaveGame : un joueur quitte la partie. Ses jetons disparaissent des
// cartes ; sa fiche de personnage est gardée, il la retrouve s'il revient avec
// le code d'invitation. Le MJ, lui, supprime la partie.
func (s *Server) handleLeaveGame(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	gameID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}
	role, member := s.getUserGameRole(gameID, u.ID)
	if !member {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Vous ne faites pas partie de cette partie"})
		return
	}
	if role == "MJ" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Le MJ ne quitte pas sa partie : il la supprime"})
		return
	}

	rows, err := s.db.Query(
		"SELECT id, map_id FROM tokens WHERE kind = 'PJ' AND owner_user_id = ? AND map_id IN "+gameMapsFilter,
		u.ID, gameID, gameID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	type ref struct{ id, mapID int64 }
	var gone []ref
	for rows.Next() {
		var t ref
		if rows.Scan(&t.id, &t.mapID) == nil {
			gone = append(gone, t)
		}
	}
	rows.Close()

	for _, t := range gone {
		_, _ = s.db.Exec("DELETE FROM tokens WHERE id = ?", t.id)
	}
	if _, err := s.db.Exec("DELETE FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	for _, t := range gone {
		s.broadcastTokenDeleted(t.id, t.mapID)
	}
	s.hub.DisconnectUser(gameID, u.ID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Vous avez quitté la partie"})
}
