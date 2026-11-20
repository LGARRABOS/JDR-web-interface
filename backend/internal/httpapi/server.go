package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/sessions"
	"jdr-backend/internal/realtime"
	"jdr-backend/internal/storage"
)

// Server encapsule le routeur HTTP et les dépendances.
type Server struct {
	db    storage.DB
	mux   chi.Router
	store *sessions.CookieStore
	hub   *realtime.Hub
	// limits : tentatives de connexion et de création de compte.
	limits limiters
}

// NewServer construit le routeur HTTP principal de l'API.
// Si staticDir est non vide et existe, sert les fichiers statiques (frontend SPA) sur /.
func loadSessionKey() ([]byte, error) {
	if secret := os.Getenv("SESSION_SECRET"); secret != "" {
		if len(secret) < 32 {
			log.Printf("ATTENTION : SESSION_SECRET est court (%d caractères) ; utilisez au moins 32 caractères aléatoires", len(secret))
		}
		sum := sha256.Sum256([]byte(secret))
		return sum[:], nil
	}
	log.Printf("ATTENTION : SESSION_SECRET absent ; clé de session aléatoire, les joueurs seront déconnectés à chaque redémarrage")
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("generate session key: %w", err)
	}
	return key, nil
}

func isProduction() bool {
	if strings.EqualFold(os.Getenv("ENV"), "production") {
		return true
	}
	if v := os.Getenv("HTTPS"); v == "true" || v == "1" {
		return true
	}
	return false
}

func NewServer(db storage.DB, staticDir string) (http.Handler, error) {
	key, err := loadSessionKey()
	if err != nil {
		return nil, err
	}
	store := sessions.NewCookieStore(key)
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 jours
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isProduction(),
	}

	s := &Server{
		db:     db,
		mux:    chi.NewRouter(),
		store:  store,
		limits: newLimiters(),
	}
	s.hub = realtime.NewHub(realtime.Config{
		ResolveMember:  s.resolveMember,
		Snapshot:       s.buildSnapshot,
		AllowedOrigins: allowedOrigins(),
	})

	s.mux.Use(middleware.RequestID)
	s.mux.Use(middleware.Logger)
	s.mux.Use(middleware.Recoverer)
	s.mux.Use(securityHeaders)
	s.mux.Use(corsHandler)
	s.mux.Use(sameOriginWrites)
	s.mux.Use(limitBody)
	s.mux.Use(compressExceptWS())
	s.mux.Use(s.withSessionUser)

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
	s.registerElementRoutes()
	s.registerMapElementRoutes()
	s.registerMessageRoutes()
	s.registerRollRoutes()
	s.registerLibraryRoutes()
	s.registerHandoutRoutes()
	s.registerNoteRoutes()
	s.registerArpenteurRoutes()
	s.registerTestRoutes()
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
			// Fichiers de Vite à nom haché : immuables, gardés un an.
			if strings.HasPrefix(requestPath, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fs.ServeHTTP(w, r)
			return
		}
		// Routes de l'application : toujours la dernière version de index.html.
		w.Header().Set("Cache-Control", "no-cache")
		r.URL.Path = "/"
		fs.ServeHTTP(w, r)
	})
}

func corsHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestOrigin := r.Header.Get("Origin")
		if requestOrigin != "" && isAllowedOrigin(requestOrigin) {
			w.Header().Set("Access-Control-Allow-Origin", requestOrigin)
		} else if requestOrigin == "" {
			origins := allowedOrigins()
			if len(origins) > 0 {
				w.Header().Set("Access-Control-Allow-Origin", origins[0])
			}
		}
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Act-As")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Add("Vary", "Origin")
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
		s.hub.ServeWS(w, r, u.ID)
	})
}
