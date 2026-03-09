package httpapi

import (
	"net/http"

	"jdr-backend/internal/domain"

	"github.com/gorilla/sessions"
)

const sessionName = "jdr_session"

func (s *Server) getSession(r *http.Request) (*sessions.Session, error) {
	return s.store.Get(r, sessionName)
}

func (s *Server) getSessionUser(r *http.Request) *domain.User {
	sess, err := s.getSession(r)
	if err != nil || sess.Values["userID"] == nil {
		return nil
	}
	userID, ok := sess.Values["userID"].(int64)
	if !ok {
		return nil
	}
	var u domain.User
	err = s.db.QueryRow(
		"SELECT id, email, password_hash, display_name FROM users WHERE id = ?",
		userID,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName)
	if err != nil {
		return nil
	}
	return &u
}

func (s *Server) setSessionUser(r *http.Request, w http.ResponseWriter, u *domain.User) {
	sess, _ := s.getSession(r)
	sess.Values["userID"] = u.ID
	_ = sess.Save(r, w)
}

func (s *Server) clearSession(w http.ResponseWriter, r *http.Request) {
	sess, _ := s.getSession(r)
	sess.Options.MaxAge = -1
	_ = sess.Save(r, w)
}
