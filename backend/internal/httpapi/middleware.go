package httpapi

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

const mapIDKey contextKey = "mapID"

// requireAuth redirige vers 401 si l'utilisateur n'est pas authentifié.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.getSessionUser(r) == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireGM exige que l'utilisateur soit MJ de la partie (gameId dans l'URL).
func (s *Server) requireGM(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gameID := getGameIDFromContext(r)
		if gameID == 0 {
			gameIDStr := chi.URLParam(r, "gameId")
			if gameIDStr == "" {
				gameIDStr = chi.URLParam(r, "id")
			}
			if gameIDStr != "" {
				if id, err := strconv.ParseInt(gameIDStr, 10, 64); err == nil {
					gameID = id
				}
			}
		}
		if gameID == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
			return
		}

		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}

		role, ok := s.getUserGameRole(gameID, u.ID)
		if !ok || role != "MJ" {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// requireMapAccess exige que l'utilisateur soit membre de la partie associée à la carte (mapId dans l'URL).
func (s *Server) requireMapAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mapIDStr := chi.URLParam(r, "mapId")
		mapID, err := strconv.ParseInt(mapIDStr, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID carte invalide"})
			return
		}

		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}

		gameID, role, ok := s.getMapAccess(mapID, u.ID)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé à cette carte"})
			return
		}

		ctx := r.Context()
		ctx = context.WithValue(ctx, gameIDKey, gameID)
		ctx = context.WithValue(ctx, mapIDKey, mapID)
		ctx = context.WithValue(ctx, contextKey("gameRole"), role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getMapIDFromContext(r *http.Request) int64 {
	v := r.Context().Value(mapIDKey)
	if v == nil {
		return 0
	}
	id, ok := v.(int64)
	if !ok {
		return 0
	}
	return id
}

func getGameRoleFromContext(r *http.Request) string {
	v := r.Context().Value(contextKey("gameRole"))
	if v == nil {
		return ""
	}
	role, ok := v.(string)
	if !ok {
		return ""
	}
	return role
}
