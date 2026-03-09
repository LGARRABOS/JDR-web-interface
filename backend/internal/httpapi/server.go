package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/sessions"
	"jdr-backend/internal/realtime"
)

// Server encapsule le routeur HTTP et les dépendances.
type Server struct {
	db    *sql.DB
	mux   chi.Router
	store *sessions.CookieStore
	hub   *realtime.Hub
}

// NewServer construit le routeur HTTP principal de l'API.
// Si staticDir est non vide et existe, sert les fichiers statiques (frontend SPA) sur /.
func NewServer(db *sql.DB, staticDir string) (http.Handler, error) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	// En prod, utiliser une clé secrète réelle
	store := sessions.NewCookieStore(key)
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 jours
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // true en HTTPS
	}

	hub := realtime.NewHub(func(userID, gameID int64) (string, string, string) {
		var displayName, characterName, role string
		_ = db.QueryRow(
			"SELECT u.display_name, COALESCE(gp.character_name, ''), COALESCE(gp.role, 'PLAYER') FROM users u LEFT JOIN game_players gp ON gp.user_id = u.id AND gp.game_id = ? WHERE u.id = ?",
			gameID, userID,
		).Scan(&displayName, &characterName, &role)
		return displayName, characterName, role
	})
	go hub.Run()

	s := &Server{
		db:    db,
		mux:   chi.NewRouter(),
		store: store,
		hub:   hub,
	}

	s.mux.Use(middleware.RequestID)
	s.mux.Use(middleware.Logger)
	s.mux.Use(middleware.Recoverer)
	s.mux.Use(corsHandler)

	healthz := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		}
	}
	s.mux.Handle("/healthz", http.HandlerFunc(healthz))

	s.registerAuthRoutes()
	s.registerGameRoutes()
	s.registerCharacterSheetRoutes()
	s.registerMusicRoutes()
	s.registerMapRoutes()
	s.registerTokenRoutes()
	s.registerMessageRoutes()
	s.registerRollRoutes()
	s.mux.Handle("/api/ws", s.wsHandler())

	if staticDir != "" {
		if info, err := os.Stat(staticDir); err == nil && info.IsDir() {
			s.mux.Handle("/*", spaFileServer(staticDir))
		}
	}

	return s.mux, nil
}

// spaFileServer sert les fichiers statiques avec fallback sur index.html pour le SPA.
func spaFileServer(root string) http.Handler {
	fs := http.FileServer(http.Dir(root))
	absRoot, _ := filepath.Abs(root)
	absRoot = filepath.Clean(absRoot) + string(filepath.Separator)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if requestPath == "." {
			requestPath = ""
		}
		fullPath := filepath.Join(root, requestPath)
		absFull, _ := filepath.Abs(fullPath)
		if !strings.HasPrefix(absFull, absRoot) {
			r.URL.Path = "/"
			fs.ServeHTTP(w, r)
			return
		}
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/"
		fs.ServeHTTP(w, r)
	})
}

func corsHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := "http://localhost:5173"
		if o := os.Getenv("CORS_ORIGIN"); o != "" {
			origin = o
		} else if o := r.Header.Get("Origin"); o != "" {
			origin = o
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) wsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := s.getSessionUser(r)
		if u == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
			return
		}
		ctx := context.WithValue(r.Context(), "userID", u.ID)
		s.hub.ServeHTTP(w, r.WithContext(ctx))
	})
}
