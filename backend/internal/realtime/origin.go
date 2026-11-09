package realtime

import (
	"net/http"
	"net/url"
	"strings"
)

// checkOrigin autorise l'upgrade WebSocket si :
//   - il n'y a pas d'en-tête Origin (client non navigateur) ;
//   - l'origine est la même que le site (cas normal : le frontend est servi par
//     ce serveur, éventuellement derrière un reverse proxy) ;
//   - l'origine est listée dans AllowedOrigins (CORS_ORIGIN, ex. le serveur Vite en dev).
func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	for _, allowed := range h.cfg.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	for _, host := range requestHosts(r) {
		if strings.EqualFold(u.Host, host) {
			return true
		}
	}
	return false
}

// requestHosts retourne les noms d'hôte sous lesquels la requête a été reçue
// (Host, et X-Forwarded-Host si un reverse proxy l'a réécrit).
func requestHosts(r *http.Request) []string {
	hosts := []string{r.Host}
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		for _, h := range strings.Split(fwd, ",") {
			if h = strings.TrimSpace(h); h != "" {
				hosts = append(hosts, h)
			}
		}
	}
	return hosts
}
