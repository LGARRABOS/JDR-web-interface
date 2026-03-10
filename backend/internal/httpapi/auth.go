package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"

	"jdr-backend/internal/domain"
	"github.com/go-chi/chi/v5"
)

func (s *Server) registerAuthRoutes() {
	s.mux.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", s.handleRegister)
		r.Post("/login", s.handleLogin)
		r.Post("/logout", s.handleLogout)
		r.Get("/me", s.handleMe)
	})
}

type registerReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Champs manquants"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var id int64
	err = s.db.QueryRow(
		"INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING id",
		req.Email, string(hash), req.DisplayName,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"message": "Utilisateur déjà existant"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	user := domain.User{ID: id, Email: req.Email, DisplayName: req.DisplayName}
	s.setSessionUser(r, w, &user)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"user": sanitizeUser(&user)})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Champs manquants"})
		return
	}

	var u domain.User
	err := s.db.QueryRow(
		"SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
		req.Email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Identifiants invalides"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Identifiants invalides"})
		return
	}

	s.setSessionUser(r, w, &u)
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": sanitizeUser(&u)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSession(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Déconnecté"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": sanitizeUser(u)})
}

func sanitizeUser(u *domain.User) map[string]interface{} {
	return map[string]interface{}{
		"id":          u.ID,
		"email":       u.Email,
		"displayName": u.DisplayName,
	}
}
