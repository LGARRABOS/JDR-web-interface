package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type contextKey string

const gameIDKey contextKey = "gameID"

func (s *Server) requireGameAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gameIDStr := chi.URLParam(r, "gameId")
		if gameIDStr == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
			return
		}
		gameID, err := strconv.ParseInt(gameIDStr, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId invalide"})
			return
		}

		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}

		var count int
		err = s.db.QueryRow(
			"SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?",
			gameID, u.ID,
		).Scan(&count)
		if err != nil || count == 0 {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé à cette partie"})
			return
		}

		ctx := context.WithValue(r.Context(), gameIDKey, gameID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getGameIDFromContext(r *http.Request) int64 {
	v := r.Context().Value(gameIDKey)
	if v == nil {
		return 0
	}
	id, ok := v.(int64)
	if !ok {
		return 0
	}
	return id
}

func (s *Server) getUserGameRole(gameID, userID int64) (string, bool) {
	var role string
	err := s.db.QueryRow(
		"SELECT role FROM game_players WHERE game_id = ? AND user_id = ?",
		gameID, userID,
	).Scan(&role)
	return role, err == nil
}

func (s *Server) isUserInGame(gameID, userID int64) bool {
	var count int
	err := s.db.QueryRow(
		"SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?",
		gameID, userID,
	).Scan(&count)
	return err == nil && count != 0
}

func (s *Server) getMapGameID(mapID int64) (int64, error) {
	var gameID int64
	err := s.db.QueryRow("SELECT game_id FROM maps WHERE id = ?", mapID).Scan(&gameID)
	return gameID, err
}

// getMapAccess indique dans quelle partie l'utilisateur voit cette carte.
// Une carte peut venir d'une autre partie du MJ ou de sa bibliothèque : la
// partie qui l'affiche passe alors avant la partie d'origine, pour que les
// règles (rôle, déplacements bloqués…) soient celles de la table en cours.
func (s *Server) getMapAccess(mapID, userID int64) (gameID int64, role string, ok bool) {
	var showing int64
	var showingRole string
	if err := s.db.QueryRow(
		`SELECT g.id, gp.role FROM games g
		 JOIN game_players gp ON gp.game_id = g.id AND gp.user_id = ?
		 WHERE g.current_map_id = ? AND COALESCE(g.is_library, 0) = 0
		 ORDER BY g.id LIMIT 1`, userID, mapID,
	).Scan(&showing, &showingRole); err == nil {
		return showing, showingRole, true
	}
	gameID, err := s.getMapGameID(mapID)
	if err != nil {
		return 0, "", false
	}
	role, member := s.getUserGameRole(gameID, userID)
	return gameID, role, member
}

// libraryOfGameMJ : sous-requête SQL donnant la bibliothèque du MJ d'une
// partie. Un paramètre : l'id de la partie.
const libraryOfGameMJ = `(SELECT lg.id FROM games lg
	JOIN game_players mj ON mj.user_id = lg.owner_id AND mj.role = 'MJ'
	WHERE COALESCE(lg.is_library, 0) = 1 AND mj.game_id = ?::bigint)`

// gameMapsFilter renvoie un filtre SQL sur maps.id : les cartes de la partie
// et celles de la bibliothèque de son MJ. Deux paramètres : l'id de la partie, deux fois.
const gameMapsFilter = `(SELECT mm.id FROM maps mm
	WHERE mm.game_id = ?::bigint OR mm.game_id IN ` + libraryOfGameMJ + `)`

// getTokenContextFor résout le jeton dans la partie où cet utilisateur le voit.
func (s *Server) getTokenContextFor(tokenID, userID int64) (mapID, gameID int64, kind string, ownerUserID *int64, err error) {
	mapID, gameID, kind, ownerUserID, err = s.getTokenContext(tokenID)
	if err != nil {
		return
	}
	if g, _, ok := s.getMapAccess(mapID, userID); ok {
		gameID = g
	}
	return
}

func (s *Server) getTokenContext(tokenID int64) (mapID, gameID int64, kind string, ownerUserID *int64, err error) {
	var owner sql.NullInt64
	err = s.db.QueryRow(
		"SELECT map_id, kind, owner_user_id FROM tokens WHERE id = ?",
		tokenID,
	).Scan(&mapID, &kind, &owner)
	if err != nil {
		return
	}
	gameID, err = s.getMapGameID(mapID)
	if err != nil {
		return
	}
	if owner.Valid {
		id := owner.Int64
		ownerUserID = &id
	}
	return
}

func (s *Server) isTokenMovementLocked(gameID int64) bool {
	var locked int
	_ = s.db.QueryRow("SELECT COALESCE(token_movement_locked, 0) FROM games WHERE id = ?", gameID).Scan(&locked)
	return locked == 1
}

// requireMapFileAccess : accès si l'utilisateur a accès au gameId OU si la carte est affichée dans une de ses parties.
func (s *Server) requireMapFileAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gameIDStr := chi.URLParam(r, "gameId")
		if gameIDStr == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
			return
		}
		gameID, err := strconv.ParseInt(gameIDStr, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId invalide"})
			return
		}

		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}

		hasAccess := false
		var count int
		err = s.db.QueryRow(
			"SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?",
			gameID, u.ID,
		).Scan(&count)
		if err == nil && count != 0 {
			hasAccess = true
		}
		if !hasAccess {
			filename := chi.URLParam(r, "filename")
			if filename != "" {
				imageSuffix := "/file/" + filename
				var mapID int64
				err := s.db.QueryRow(
					`SELECT m.id FROM maps m
					 INNER JOIN games g ON g.current_map_id = m.id
					 INNER JOIN game_players gp ON gp.game_id = g.id AND gp.user_id = ?
					 WHERE m.game_id = ? AND m.image_url LIKE ?`,
					u.ID, gameID, "%"+imageSuffix,
				).Scan(&mapID)
				if err == nil && mapID != 0 {
					hasAccess = true
				}
			}
		}
		if !hasAccess {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé à ce fichier"})
			return
		}

		ctx := context.WithValue(r.Context(), gameIDKey, gameID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireElementFileAccess : image d'un monstre ou d'un décor. Accès si
// l'utilisateur est dans la partie d'origine, ou s'il joue dans une partie
// dont le propriétaire de l'élément est le MJ (bibliothèque, autre partie du MJ).
func (s *Server) requireElementFileAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gameID, err := strconv.ParseInt(chi.URLParam(r, "gameId"), 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId invalide"})
			return
		}
		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}
		_, member := s.getUserGameRole(gameID, u.ID)
		if !member {
			var ok int
			_ = s.db.QueryRow(
				`SELECT 1 FROM game_elements ge
				 JOIN game_players mj ON mj.user_id = ge.user_id AND mj.role = 'MJ'
				 JOIN game_players me ON me.game_id = mj.game_id AND me.user_id = ?
				 WHERE ge.game_id = ? AND ge.image_url LIKE ?
				 LIMIT 1`,
				u.ID, gameID, "%/file/"+chi.URLParam(r, "filename"),
			).Scan(&ok)
			member = ok == 1
		}
		if !member {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé à ce fichier"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), gameIDKey, gameID)))
	})
}
