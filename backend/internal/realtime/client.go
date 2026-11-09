package realtime

import (
	"encoding/json"
	"log"
	"sync"
	"time"
)

// textMessage correspond à websocket.TextMessage (évite d'importer gorilla ici).
const textMessage = 1

// Conn est le sous-ensemble de *websocket.Conn utilisé par le hub.
// L'interface permet de tester le hub sans vrai réseau.
type Conn interface {
	ReadMessage() (messageType int, p []byte, err error)
	WriteMessage(messageType int, data []byte) error
	SetReadDeadline(t time.Time) error
	SetWriteDeadline(t time.Time) error
	SetReadLimit(limit int64)
	Close() error
}

// Client représente une connexion WebSocket à une partie.
type Client struct {
	hub    *Hub
	room   *room
	conn   Conn
	member Member // protégé par room.mu

	send chan []byte
	done chan struct{}
	once sync.Once

	// ready passe à true quand l'instantané a été envoyé. Avant cela, les
	// événements sont mis de côté (backlog) pour être envoyés juste après.
	// Protégés par room.mu.
	ready   bool
	backlog [][]byte
}

func newClient(h *Hub, r *room, conn Conn, m Member) *Client {
	return &Client{
		hub:    h,
		room:   r,
		conn:   conn,
		member: m,
		send:   make(chan []byte, h.sendBuffer),
		done:   make(chan struct{}),
	}
}

// close ferme la connexion (idempotent). La boucle de lecture se termine alors
// et le client est retiré de la room.
func (c *Client) close() {
	c.once.Do(func() {
		close(c.done)
		_ = c.conn.Close()
	})
}

// enqueueLocked met un message en file. Doit être appelé avec room.mu verrouillé.
// Un client trop lent est déconnecté plutôt que de perdre des messages en silence :
// il se reconnectera et recevra un instantané complet.
func (c *Client) enqueueLocked(data []byte) {
	if !c.ready {
		if len(c.backlog) >= c.hub.maxBacklog {
			log.Printf("realtime: backlog plein pour l'utilisateur %d, déconnexion", c.member.UserID)
			c.close()
			return
		}
		c.backlog = append(c.backlog, data)
		return
	}
	select {
	case c.send <- data:
	case <-c.done:
	default:
		log.Printf("realtime: client trop lent (utilisateur %d), déconnexion", c.member.UserID)
		c.close()
	}
}

// resync envoie un instantané complet de la partie puis les événements survenus
// pendant sa construction. Les événements étant idempotents, un événement déjà
// inclus dans l'instantané peut être rejoué sans conséquence.
func (c *Client) resync() {
	r := c.room
	r.mu.Lock()
	c.ready = false
	member := c.member
	r.mu.Unlock()

	var state any
	if c.hub.cfg.Snapshot != nil {
		var err error
		state, err = c.hub.cfg.Snapshot(r.gameID, member)
		if err != nil {
			// Le client se reconnectera et réessaiera.
			log.Printf("realtime: snapshot partie %d: %v", r.gameID, err)
			c.close()
			return
		}
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	payload := SnapshotPayload{
		You:      c.member,
		State:    state,
		Live:     r.live,
		Presence: r.presenceLocked(),
	}
	data, err := c.hub.encode(r.gameID, EventSnapshot, payload)
	if err != nil {
		log.Printf("realtime: encode snapshot: %v", err)
		c.close()
		return
	}
	backlog := c.backlog
	c.backlog = nil
	c.ready = true
	c.enqueueLocked(data)
	for _, b := range backlog {
		c.enqueueLocked(b)
	}
}

func (c *Client) writeDirect(data []byte) error {
	_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.writeTimeout))
	return c.conn.WriteMessage(textMessage, data)
}

func (c *Client) writePump() {
	ticker := time.NewTicker(c.hub.pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case data := <-c.send:
			if err := c.writeDirect(data); err != nil {
				c.close()
				return
			}
		case <-ticker.C:
			// Ping applicatif : le client répond "pong", et peut lui-même détecter
			// une connexion morte s'il ne reçoit plus rien.
			data, err := c.hub.encode(c.room.gameID, EventPing, nil)
			if err != nil {
				continue
			}
			if err := c.writeDirect(data); err != nil {
				c.close()
				return
			}
		}
	}
}

func (c *Client) readPump() {
	c.conn.SetReadLimit(64 * 1024)
	for {
		_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.readTimeout))
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg clientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		c.hub.handleAction(c, msg)
	}
}
