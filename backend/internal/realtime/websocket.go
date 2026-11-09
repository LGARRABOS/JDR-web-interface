package realtime

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/websocket"
)

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
	return false
}

// ServeWS gère l'upgrade WebSocket pour un utilisateur déjà authentifié.
// L'URL attendue est /api/ws?gameId=<id>.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, userID int64) {
	gameID, err := strconv.ParseInt(r.URL.Query().Get("gameId"), 10, 64)
	if err != nil || gameID <= 0 {
		http.Error(w, "gameId requis", http.StatusBadRequest)
		return
	}
	if h.cfg.ResolveMember == nil {
		http.Error(w, "indisponible", http.StatusServiceUnavailable)
		return
	}
	member, ok := h.cfg.ResolveMember(gameID, userID)
	if !ok {
		http.Error(w, "Accès refusé à cette partie", http.StatusForbidden)
		return
	}

	up := websocket.Upgrader{
		CheckOrigin:     h.checkOrigin,
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
	}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}
	h.Attach(conn, gameID, member)
}
