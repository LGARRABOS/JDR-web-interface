package realtime

import (
	"net/http/httptest"
	"testing"
)

func TestCheckOrigin(t *testing.T) {
	h := NewHub(Config{AllowedOrigins: []string{"http://localhost:5173"}})
	cases := []struct {
		name, host, fwdHost, origin string
		want                        bool
	}{
		{"sans origine", "jdr.exemple.fr", "", "", true},
		{"même site via reverse proxy", "jdr.exemple.fr", "", "https://jdr.exemple.fr", true},
		{"même site, majuscules", "JDR.exemple.fr", "", "https://jdr.exemple.fr", true},
		{"X-Forwarded-Host", "192.168.1.125:4000", "jdr.exemple.fr", "https://jdr.exemple.fr", true},
		{"accès direct par IP", "192.168.1.125:4000", "", "http://192.168.1.125:4000", true},
		{"serveur de dev autorisé", "localhost:4000", "", "http://localhost:5173", true},
		{"autre site", "jdr.exemple.fr", "", "https://pirate.exemple.com", false},
		{"origine invalide", "jdr.exemple.fr", "", "null", false},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/api/ws?gameId=1", nil)
		r.Host = c.host
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		if c.fwdHost != "" {
			r.Header.Set("X-Forwarded-Host", c.fwdHost)
		}
		if got := h.checkOrigin(r); got != c.want {
			t.Errorf("%s : checkOrigin = %v, attendu %v", c.name, got, c.want)
		}
	}
}
