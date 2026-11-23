package httpapi

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"jdr-backend/internal/domain"
)

// Durcissement HTTP : en-têtes de sécurité, taille des requêtes, contrôle
// d'origine des écritures, compression, limitation des tentatives de connexion.

const (
	maxJSONBody      = 4 << 20  // requêtes JSON (le plus gros : fiche d'arpenteur, 2 Mo)
	maxMultipartBody = 25 << 20 // envois de fichiers (le plus gros : 20 Mo)
	// Les musiques ont leur propre plafond (100 Mo + marge pour l'enveloppe multipart).
	maxMusicBody = maxMusicSize + 1<<20
)

// isMusicUpload : POST /api/games/{id}/music/upload.
func isMusicUpload(path string) bool {
	return strings.HasPrefix(path, "/api/games/") && strings.HasSuffix(strings.TrimSuffix(path, "/"), "/music/upload")
}

// securityHeaders ajoute les en-têtes de sécurité à toutes les réponses.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// SAMEORIGIN : les PDF (fiches, documents) s'affichent dans un cadre de l'application.
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		// Les fichiers envoyés (/api/…) n'acceptent que des extensions sûres, servies
		// avec un type fixe et nosniff ; la politique de contenu vise la page.
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			host := r.Host
			h.Set("Content-Security-Policy", strings.Join([]string{
				"default-src 'self'",
				"script-src 'self'",
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
				"font-src 'self' https://fonts.gstatic.com data:",
				"img-src 'self' data: blob: https:",
				"media-src 'self' blob:",
				"connect-src 'self' ws://" + host + " wss://" + host,
				"frame-src 'self'",
				"worker-src 'self' blob:",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
				"frame-ancestors 'self'",
			}, "; "))
		}
		if requestIsHTTPS(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

// limitBody plafonne la taille des corps de requête (ParseMultipartForm ne
// limite que la mémoire : sans plafond, un envoi énorme remplirait le disque).
func limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
			limit := int64(maxJSONBody)
			if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
				limit = maxMultipartBody
				if isMusicUpload(r.URL.Path) {
					limit = maxMusicBody
				}
			}
			if r.ContentLength > limit {
				writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"message": "Requête trop volumineuse"})
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
		}
		next.ServeHTTP(w, r)
	})
}

// sameOriginWrites refuse les écritures venues d'un autre site (défense en
// profondeur contre le CSRF, en plus des cookies SameSite=Lax).
func sameOriginWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if isAllowedOrigin(origin) || originMatchesHost(origin, r) {
			next.ServeHTTP(w, r)
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Origine refusée"})
	})
}

func originMatchesHost(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		return strings.EqualFold(u.Host, strings.TrimSpace(strings.Split(fwd, ",")[0]))
	}
	return false
}

// requestIsHTTPS : TLS direct ou derrière un reverse proxy HTTPS.
func requestIsHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]), "https")
}

// compressExceptWS compresse les réponses (JSON, JS, CSS…) sauf le WebSocket.
func compressExceptWS() func(http.Handler) http.Handler {
	compress := middleware.Compress(5, "application/json", "text/html", "text/css", "application/javascript", "text/javascript", "image/svg+xml", "application/manifest+json")
	return func(next http.Handler) http.Handler {
		compressed := compress(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
				next.ServeHTTP(w, r)
				return
			}
			compressed.ServeHTTP(w, r)
		})
	}
}

// --- Utilisateur en cache dans la requête ---------------------------------------

type userCtxKey struct{}

// withSessionUser mémorise l'utilisateur de la requête : les middlewares et
// le handler n'interrogent la base qu'une fois.
func (s *Server) withSessionUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		holder := &userHolder{}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userCtxKey{}, holder)))
	})
}

type userHolder struct {
	done     bool
	user     *domain.User
	realDone bool
	real     *domain.User
}

func holderFrom(r *http.Request) *userHolder {
	h, _ := r.Context().Value(userCtxKey{}).(*userHolder)
	return h
}

// --- Limitation des tentatives ------------------------------------------------------

type rateLimiter struct {
	mu     sync.Mutex
	window time.Duration
	max    int
	hits   map[string][]time.Time
}

func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{window: window, max: max, hits: map[string][]time.Time{}}
}

// prune garde les tentatives de la fenêtre (verrou tenu par l'appelant).
func (l *rateLimiter) prune(key string, now time.Time) []time.Time {
	cut := now.Add(-l.window)
	list := l.hits[key]
	i := 0
	for i < len(list) && list[i].Before(cut) {
		i++
	}
	list = list[i:]
	if len(list) == 0 {
		delete(l.hits, key)
	} else {
		l.hits[key] = list
	}
	return list
}

// limited indique si la clé a atteint le plafond de tentatives.
func (l *rateLimiter) limited(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key, time.Now())) >= l.max
}

// hit enregistre une tentative.
func (l *rateLimiter) hit(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.hits[key] = append(l.prune(key, now), now)
	if len(l.hits) > 50000 {
		for k := range l.hits {
			l.prune(k, now)
		}
	}
}

// reset efface les tentatives d'une clé (connexion réussie).
func (l *rateLimiter) reset(key string) {
	l.mu.Lock()
	delete(l.hits, key)
	l.mu.Unlock()
}

// clientIP : adresse du client ; on ne croit X-Forwarded-For que s'il vient
// d'un reverse proxy local (réseau privé ou boucle locale).
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			parts := strings.Split(fwd, ",")
			if c := strings.TrimSpace(parts[len(parts)-1]); c != "" {
				return c
			}
		}
		if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
			return real
		}
	}
	return host
}
