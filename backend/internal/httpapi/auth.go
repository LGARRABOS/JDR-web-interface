package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

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
		r.Patch("/me", s.handleUpdateProfile)
		r.Post("/me/purge-assets", s.handlePurgeAssets)
		r.Delete("/me", s.handleDeleteAccount)
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

type updateProfileReq struct {
	DisplayName *string `json:"displayName"`
	Email       *string `json:"email"`
	Password    *string `json:"password"`
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

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

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	var req updateProfileReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	displayName := u.DisplayName
	if req.DisplayName != nil {
		dn := strings.TrimSpace(*req.DisplayName)
		if dn == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Le pseudo ne peut pas être vide"})
			return
		}
		displayName = dn
	}

	email := u.Email
	if req.Email != nil {
		e := strings.TrimSpace(strings.ToLower(*req.Email))
		if e == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "L'email ne peut pas être vide"})
			return
		}
		if !emailRegex.MatchString(e) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format d'email invalide"})
			return
		}
		var existingID int64
		err := s.db.QueryRow("SELECT id FROM users WHERE email = ? AND id != ?", e, u.ID).Scan(&existingID)
		if err == nil {
			writeJSON(w, http.StatusConflict, map[string]string{"message": "Cet email est déjà utilisé"})
			return
		}
		email = e
	}

	passwordHash := u.PasswordHash
	if req.Password != nil {
		p := *req.Password
		if len(p) < 6 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Le mot de passe doit faire au moins 6 caractères"})
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
			return
		}
		passwordHash = string(hash)
	}

	_, err := s.db.Exec(
		"UPDATE users SET display_name = ?, email = ?, password_hash = ? WHERE id = ?",
		displayName, email, passwordHash, u.ID,
	)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"message": "Cet email est déjà utilisé"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	updated := &domain.User{
		ID: u.ID, Email: email, DisplayName: displayName, PasswordHash: passwordHash,
	}
	s.setSessionUser(r, w, updated)
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": sanitizeUser(updated)})
}

func (s *Server) handlePurgeAssets(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}
	s.purgeUserAssets(u.ID)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Assets purgés",
	})
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	u := s.getSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	// Purger les assets avant suppression du compte
	s.purgeUserAssets(u.ID)

	s.clearSession(w, r)

	_, err := s.db.Exec("DELETE FROM users WHERE id = ?", u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Compte supprimé",
	})
}

// purgeUserAssets supprime tous les assets d'un utilisateur (éléments, cartes, musique).
func (s *Server) purgeUserAssets(userID int64) {
	// 1. Éléments
	rows, _ := s.db.Query(
		"SELECT id, game_id, image_url FROM game_elements WHERE user_id = ?",
		userID,
	)
	if rows != nil {
		for rows.Next() {
			var id int64
			var gameID int64
			var imageURL string
			if err := rows.Scan(&id, &gameID, &imageURL); err != nil {
				continue
			}
			if idx := strings.LastIndex(imageURL, "/file/"); idx >= 0 {
				filename := imageURL[idx+6:]
				if filename != "" && !strings.Contains(filename, "..") {
					storagePath := filepath.Join(uploadsElementsBase, strconv.FormatInt(gameID, 10), filename)
					_ = os.Remove(storagePath)
				}
			}
		}
		rows.Close()
	}
	_, _ = s.db.Exec("DELETE FROM game_elements WHERE user_id = ?", userID)

	// 2. Cartes (parties où user est MJ)
	mapRows, _ := s.db.Query(
		`SELECT m.id, m.game_id, m.image_url FROM maps m
		 INNER JOIN game_players gp ON gp.game_id = m.game_id AND gp.user_id = ? AND gp.role = 'MJ'
		 ORDER BY m.id`,
		userID,
	)
	if mapRows != nil {
		for mapRows.Next() {
			var mapID, gameID int64
			var imageURL string
			if err := mapRows.Scan(&mapID, &gameID, &imageURL); err != nil {
				continue
			}
			_, _ = s.db.Exec("UPDATE games SET current_map_id = NULL WHERE current_map_id = ?", mapID)
			if idx := strings.LastIndex(imageURL, "/file/"); idx >= 0 {
				filename := imageURL[idx+6:]
				if filename != "" && !strings.Contains(filename, "..") {
					storagePath := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10), filename)
					_ = os.Remove(storagePath)
				}
			}
			_, _ = s.db.Exec("DELETE FROM maps WHERE id = ?", mapID)
		}
		mapRows.Close()
	}

	// 3. Musique
	musicRows, _ := s.db.Query(
		"SELECT id, storage_path FROM game_music WHERE user_id = ?",
		userID,
	)
	if musicRows != nil {
		for musicRows.Next() {
			var id int64
			var storagePath string
			if err := musicRows.Scan(&id, &storagePath); err != nil {
				continue
			}
			_ = os.Remove(storagePath)
		}
		musicRows.Close()
	}
	_, _ = s.db.Exec("DELETE FROM game_music WHERE user_id = ?", userID)
}

func sanitizeUser(u *domain.User) map[string]interface{} {
	return map[string]interface{}{
		"id":          u.ID,
		"email":       u.Email,
		"displayName": u.DisplayName,
	}
}
