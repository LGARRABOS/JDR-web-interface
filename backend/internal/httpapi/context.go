package httpapi

import (
	"context"
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
