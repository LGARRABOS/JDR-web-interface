package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
}

func TestRateLimiterWindow(t *testing.T) {
	l := newRateLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if l.limited("a") {
			t.Fatalf("limité trop tôt (%d)", i)
		}
		l.hit("a")
	}
	if !l.limited("a") {
		t.Fatal("4e tentative attendue limitée")
	}
	if l.limited("b") {
		t.Fatal("les clés doivent être indépendantes")
	}
	l.reset("a")
	if l.limited("a") {
		t.Fatal("reset doit effacer les tentatives")
	}
}

func TestClientIPTrustsProxyOnlyWhenLocal(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	r.Header.Set("X-Forwarded-For", "203.0.113.9")
	if got := clientIP(r); got != "203.0.113.9" {
		t.Fatalf("derrière un proxy local : %q", got)
	}
	r.RemoteAddr = "198.51.100.4:5000"
	if got := clientIP(r); got != "198.51.100.4" {
		t.Fatalf("en-tête d'un client distant à ignorer : %q", got)
	}
}

func TestSameOriginWrites(t *testing.T) {
	h := sameOriginWrites(okHandler())
	cases := []struct {
		method, origin string
		want           int
	}{
		{http.MethodPost, "", http.StatusNoContent},
		{http.MethodPost, "http://example.com", http.StatusNoContent},
		{http.MethodPost, "https://evil.test", http.StatusForbidden},
		{http.MethodGet, "https://evil.test", http.StatusNoContent},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, "http://example.com/api/x", nil)
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		if rr.Code != c.want {
			t.Errorf("%s depuis %q : %d, attendu %d", c.method, c.origin, rr.Code, c.want)
		}
	}
}

func TestLimitBodyRejectsOversized(t *testing.T) {
	h := limitBody(okHandler())
	r := httptest.NewRequest(http.MethodPost, "/api/x", bytes.NewReader(make([]byte, maxJSONBody+1)))
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("corps trop gros : %d", rr.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	h := securityHeaders(okHandler())
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/games", nil))
	for _, k := range []string{"X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Content-Security-Policy"} {
		if rr.Header().Get(k) == "" {
			t.Errorf("en-tête %s manquant", k)
		}
	}
	if !strings.Contains(rr.Header().Get("Content-Security-Policy"), "script-src 'self'") {
		t.Errorf("CSP inattendue : %s", rr.Header().Get("Content-Security-Policy"))
	}
}

// Une carte ne se lit qu'en étant membre de sa partie.
func TestGetMapRequiresMembership(t *testing.T) {
	sess := setupAuthAndGame(t)
	path := "/api/maps/" + strconv.FormatInt(sess.MapID, 10)
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, path, nil); rr.Code != http.StatusOK {
		t.Fatalf("MJ : %d", rr.Code)
	}
	body, _ := json.Marshal(map[string]string{"email": "etranger@test.com", "password": "pass123", "displayName": "Étranger"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("inscription : %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, rr.Result().Cookies(), http.MethodGet, path, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("non-membre : 403 attendu, obtenu %d", rr.Code)
	}
}

// Après 8 échecs, la connexion est bloquée pour ce compte, même avec le bon mot de passe.
func TestLoginRateLimited(t *testing.T) {
	sess := setupAuthAndGame(t)
	_ = sess
	email := strings.ToLower("mj-" + strings.ReplaceAll(t.Name(), "/", "_") + "@test.com")
	try := func(pw string) int {
		b, _ := json.Marshal(map[string]string{"email": email, "password": pw})
		r := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		sess.Handler.ServeHTTP(rr, r)
		return rr.Code
	}
	for i := 0; i < 8; i++ {
		if c := try("mauvais"); c != http.StatusUnauthorized {
			t.Fatalf("échec %d : %d", i, c)
		}
	}
	if c := try("pass123"); c != http.StatusTooManyRequests {
		t.Fatalf("après 8 échecs : 429 attendu, obtenu %d", c)
	}
}
