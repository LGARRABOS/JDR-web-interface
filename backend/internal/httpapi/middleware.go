package httpapi

import (
	"net/http"
)

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
