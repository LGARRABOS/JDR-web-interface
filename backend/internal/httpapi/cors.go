package httpapi

import (
	"os"
	"strings"
)

// allowedOrigins retourne la liste des origines CORS autorisées.
// Si CORS_ORIGIN est défini, il peut contenir plusieurs origines séparées par des virgules.
func allowedOrigins() []string {
	if o := os.Getenv("CORS_ORIGIN"); o != "" {
		parts := strings.Split(o, ",")
		var origins []string
		for _, p := range parts {
			if trimmed := strings.TrimSpace(p); trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
		if len(origins) > 0 {
			return origins
		}
	}
	return []string{"http://localhost:5173"}
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range allowedOrigins() {
		if origin == allowed {
			return true
		}
	}
	return false
}
