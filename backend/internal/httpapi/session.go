package httpapi

import (
	"net/http"
	"strconv"

	"jdr-backend/internal/domain"

	"github.com/gorilla/sessions"
)

const sessionName = "jdr_session"

func (s *Server) getSession(r *http.Request) (*sessions.Session, error) {
	return s.store.Get(r, sessionName)
}

// actAsHeader : en partie test, le MJ peut agir au nom d'un joueur fictif
// (en-tête sur les requêtes HTTP, paramètre « actAs » pour le WebSocket).
const actAsHeader = "X-Act-As"

// getSessionUser renvoie l'utilisateur au nom duquel la requête agit : le
// compte connecté, ou le joueur fictif qu'il incarne dans une partie test.
func (s *Server) getSessionUser(r *http.Request) *domain.User {
	u := s.getRealSessionUser(r)
	if u == nil {
		return nil
	}
	if bot := s.actingBot(r, u.ID); bot != nil {
		return bot
	}
	return u
}

// actingBot vérifie que le joueur fictif demandé appartient bien à une partie
// test dont le compte connecté est le MJ.
func (s *Server) actingBot(r *http.Request, ownerID int64) *domain.User {
	raw := r.Header.Get(actAsHeader)
	if raw == "" {
		raw = r.URL.Query().Get("actAs")
	}
	if raw == "" {
		return nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id == ownerID {
		return nil
	}
	var u domain.User
	err = s.db.QueryRow(
		`SELECT u.id, u.email, u.password_hash, u.display_name FROM users u
		 JOIN games g ON g.id = u.bot_game_id
		 WHERE u.id = ? AND u.bot_owner_id = ? AND g.owner_id = ? AND COALESCE(g.is_test, 0) = 1`,
		id, ownerID, ownerID,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName)
	if err != nil {
		return nil
	}
	return &u
}

// getRealSessionUser : le compte réellement connecté, sans incarnation.
func (s *Server) getRealSessionUser(r *http.Request) *domain.User {
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
	// Régénérer l'ID de session pour éviter la fixation de session
	sess.ID = ""
	sess.IsNew = true
	sess.Values = map[interface{}]interface{}{"userID": u.ID}
	_ = sess.Save(r, w)
}

func (s *Server) clearSession(w http.ResponseWriter, r *http.Request) {
	sess, _ := s.getSession(r)
	sess.Options.MaxAge = -1
	_ = sess.Save(r, w)
}
