package httpapi

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/go-chi/chi/v5"
	"jdr-backend/internal/domain"
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
	// CurrentPassword : exigé pour changer d'email ou de mot de passe.
	CurrentPassword string `json:"currentPassword"`
}

const (
	minPasswordLen = 6
	// bcrypt ignore tout au-delà de 72 octets.
	maxPasswordBytes = 72
	maxDisplayName   = 40
	maxEmailLen      = 254
)

// limiters : tentatives par adresse et par compte (échecs de connexion,
// créations de compte, mot de passe redemandé).
type limiters struct {
	loginIP      *rateLimiter
	loginAccount *rateLimiter
	register     *rateLimiter
}

func newLimiters() limiters {
	return limiters{
		loginIP:      newRateLimiter(40, 15*time.Minute),
		loginAccount: newRateLimiter(8, 15*time.Minute),
		register:     newRateLimiter(30, time.Hour),
	}
}

var (
	// dummyHash : comparé quand l'email est inconnu, pour un temps de réponse identique.
	dummyHash, _ = bcrypt.GenerateFromPassword([]byte("jdr-pas-un-vrai-mot-de-passe"), bcrypt.DefaultCost)
)

func validPassword(p string) string {
	if len(p) < minPasswordLen {
		return "Le mot de passe doit faire au moins 6 caractères"
	}
	if len(p) > maxPasswordBytes {
		return "Le mot de passe est trop long (72 caractères au plus)"
	}
	return ""
}

func cleanDisplayName(v string) string {
	v = strings.TrimSpace(v)
	if r := []rune(v); len(r) > maxDisplayName {
		v = string(r[:maxDisplayName])
	}
	return v
}

func tooManyAttempts(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "900")
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"message": "Trop de tentatives, réessayez dans quelques minutes"})
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if s.limits.register.limited(ip) {
		tooManyAttempts(w)
		return
	}
	s.limits.register.hit(ip)
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	req.DisplayName = cleanDisplayName(req.DisplayName)
	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Champs manquants"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if len(email) > maxEmailLen || !emailRegex.MatchString(email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format d'email invalide"})
		return
	}
	if msg := validPassword(req.Password); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": msg})
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
		email, string(hash), req.DisplayName,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"message": "Utilisateur déjà existant"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	user := domain.User{ID: id, Email: email, DisplayName: req.DisplayName, PasswordHash: string(hash)}
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
	email := strings.TrimSpace(strings.ToLower(req.Email))
	ipKey := clientIP(r)
	if s.limits.loginIP.limited(ipKey) || s.limits.loginAccount.limited(email) {
		tooManyAttempts(w)
		return
	}
	failed := func() {
		s.limits.loginIP.hit(ipKey)
		s.limits.loginAccount.hit(email)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Identifiants invalides"})
	}

	var u domain.User
	err := s.db.QueryRow(
		"SELECT id, email, password_hash, display_name FROM users WHERE email = ? AND bot_game_id IS NULL",
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName)
	if err != nil && err != sql.ErrNoRows {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if err == sql.ErrNoRows {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		failed()
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		failed()
		return
	}

	s.limits.loginAccount.reset(email)
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
	u := s.getRealSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	var req updateProfileReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	// Changer d'email ou de mot de passe demande le mot de passe actuel
	// (une session volée ne suffit pas à prendre le compte).
	if req.Email != nil && strings.TrimSpace(strings.ToLower(*req.Email)) != u.Email || req.Password != nil {
		key := "profil:" + strconv.FormatInt(u.ID, 10)
		if s.limits.loginAccount.limited(key) {
			tooManyAttempts(w)
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.CurrentPassword)) != nil {
			s.limits.loginAccount.hit(key)
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Mot de passe actuel incorrect"})
			return
		}
	}

	displayName := u.DisplayName
	if req.DisplayName != nil {
		dn := cleanDisplayName(*req.DisplayName)
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
		if len(e) > maxEmailLen || !emailRegex.MatchString(e) {
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
		if msg := validPassword(p); msg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": msg})
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
	u := s.getRealSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}
	if err := s.purgeUserAssets(u.ID); err != nil {
		log.Printf("purgeUserAssets user %d: %v", u.ID, err)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Assets purgés",
	})
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	u := s.getRealSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	key := "suppression:" + strconv.FormatInt(u.ID, 10)
	if s.limits.loginAccount.limited(key) {
		tooManyAttempts(w)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)) != nil {
		s.limits.loginAccount.hit(key)
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Mot de passe incorrect"})
		return
	}

	if err := s.purgeUserAssets(u.ID); err != nil {
		log.Printf("purgeUserAssets user %d: %v", u.ID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	_, err := s.db.Exec("DELETE FROM users WHERE id = ?", u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	s.clearSession(w, r)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Compte supprimé",
	})
}

// purgeUserAssets supprime les assets d'un utilisateur (éléments, cartes des parties possédées, musique).
func (s *Server) purgeUserAssets(userID int64) error {
	var firstErr error
	recordErr := func(msg string, err error) {
		if err != nil {
			log.Printf("purgeUserAssets user %d: %s: %v", userID, msg, err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}

	// 1. Éléments
	rows, err := s.db.Query(
		"SELECT id, game_id, image_url FROM game_elements WHERE user_id = ?",
		userID,
	)
	if err != nil {
		recordErr("query elements", err)
	} else {
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
					recordErr("remove element file", os.Remove(storagePath))
				}
			}
		}
		rows.Close()
	}
	if _, err := s.db.Exec("DELETE FROM game_elements WHERE user_id = ?", userID); err != nil {
		recordErr("delete elements", err)
	}

	// 2. Cartes des parties possédées uniquement (pas celles d'autres MJ)
	mapRows, err := s.db.Query(
		`SELECT m.id, m.game_id, m.image_url FROM maps m
		 INNER JOIN games g ON g.id = m.game_id AND g.owner_id = ?
		 ORDER BY m.id`,
		userID,
	)
	if err != nil {
		recordErr("query maps", err)
	} else {
		for mapRows.Next() {
			var mapID, gameID int64
			var imageURL string
			if err := mapRows.Scan(&mapID, &gameID, &imageURL); err != nil {
				continue
			}
			if _, err := s.db.Exec("UPDATE games SET current_map_id = NULL WHERE current_map_id = ?", mapID); err != nil {
				recordErr("clear current_map_id", err)
			}
			if idx := strings.LastIndex(imageURL, "/file/"); idx >= 0 {
				filename := imageURL[idx+6:]
				if filename != "" && !strings.Contains(filename, "..") {
					storagePath := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10), filename)
					recordErr("remove map file", os.Remove(storagePath))
				}
			}
			if _, err := s.db.Exec("DELETE FROM maps WHERE id = ?", mapID); err != nil {
				recordErr("delete map", err)
			}
		}
		mapRows.Close()
	}

	// 3. Musique
	musicRows, err := s.db.Query(
		"SELECT id, storage_path FROM game_music WHERE user_id = ?",
		userID,
	)
	if err != nil {
		recordErr("query music", err)
	} else {
		for musicRows.Next() {
			var id int64
			var storagePath string
			if err := musicRows.Scan(&id, &storagePath); err != nil {
				continue
			}
			recordErr("remove music file", os.Remove(storagePath))
		}
		musicRows.Close()
	}
	if _, err := s.db.Exec("DELETE FROM game_music WHERE user_id = ?", userID); err != nil {
		recordErr("delete music", err)
	}

	return firstErr
}

func sanitizeUser(u *domain.User) map[string]interface{} {
	return map[string]interface{}{
		"id":          u.ID,
		"email":       u.Email,
		"displayName": u.DisplayName,
	}
}
