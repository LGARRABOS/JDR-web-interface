package realtime

import (
	"encoding/json"
	"log"
	"math"
	"sort"
	"sync"
	"time"
)

// Config regroupe les dépendances du hub.
type Config struct {
	// ResolveMember vérifie qu'un utilisateur appartient à la partie et retourne ses infos.
	ResolveMember func(gameID, userID int64) (Member, bool)
	// Snapshot construit l'état persistant de la partie, filtré pour ce membre
	// (ex. les jetons cachés ne sont pas envoyés aux joueurs).
	Snapshot func(gameID int64, m Member) (any, error)
	// AllowedOrigins liste les origines autorisées pour l'upgrade WebSocket.
	AllowedOrigins []string
	// Now permet de fixer l'horloge dans les tests.
	Now func() time.Time
}

// Hub gère les connexions WebSocket, regroupées par partie (room).
type Hub struct {
	cfg   Config
	mu    sync.Mutex
	rooms map[int64]*room

	// Paramètres réglables (tests).
	pingInterval time.Duration
	readTimeout  time.Duration
	writeTimeout time.Duration
	sendBuffer   int
	maxBacklog   int
}

// NewHub crée un hub.
func NewHub(cfg Config) *Hub {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Hub{
		cfg:          cfg,
		rooms:        make(map[int64]*room),
		pingInterval: 25 * time.Second,
		readTimeout:  60 * time.Second,
		writeTimeout: 10 * time.Second,
		sendBuffer:   512,
		maxBacklog:   1024,
	}
}

// room contient les clients connectés à une partie et son état éphémère.
// Toutes les modifications et tous les envois passent par room.mu, ce qui
// garantit que chaque client reçoit les messages dans le même ordre.
type room struct {
	gameID  int64
	mu      sync.Mutex
	clients map[*Client]struct{}
	live    LiveState
}

func (h *Hub) room(gameID int64) *room {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[gameID]
	if !ok {
		r = &room{
			gameID:  gameID,
			clients: make(map[*Client]struct{}),
			live:    LiveState{Music: MusicState{Volume: 1}},
		}
		h.rooms[gameID] = r
	}
	return r
}

func (h *Hub) existingRoom(gameID int64) *room {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.rooms[gameID]
}

func (h *Hub) nowMs() int64 { return h.cfg.Now().UnixMilli() }

func (h *Hub) encode(gameID int64, typ string, payload any) ([]byte, error) {
	return json.Marshal(Envelope{Type: typ, GameID: gameID, ServerTime: h.nowMs(), Payload: payload})
}

// --- API utilisée par les handlers HTTP -----------------------------------

// Broadcast envoie un événement à tous les clients de la partie.
func (h *Hub) Broadcast(gameID int64, typ string, payload any) {
	h.BroadcastFunc(gameID, func(Member) (string, any, bool) { return typ, payload, true })
}

// BroadcastToRole envoie un événement uniquement aux clients ayant ce rôle.
func (h *Hub) BroadcastToRole(gameID int64, role, typ string, payload any) {
	h.BroadcastFunc(gameID, func(m Member) (string, any, bool) {
		return typ, payload, m.Role == role
	})
}

// BroadcastFunc envoie à chaque client un message calculé selon le destinataire.
// fn retourne (type, payload, envoyer?). Utile pour filtrer les données secrètes du MJ.
func (h *Hub) BroadcastFunc(gameID int64, fn func(m Member) (string, any, bool)) {
	r := h.existingRoom(gameID)
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	h.broadcastLocked(r, nil, fn)
}

// UpdateMember modifie les infos d'un membre connecté (ex. nom de personnage)
// et prévient tout le monde.
func (h *Hub) UpdateMember(gameID, userID int64, update func(*Member)) {
	r := h.existingRoom(gameID)
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	var updated *Member
	for c := range r.clients {
		if c.member.UserID == userID {
			update(&c.member)
			m := c.member
			updated = &m
		}
	}
	if updated != nil {
		payload := *updated
		h.broadcastLocked(r, nil, func(Member) (string, any, bool) { return EventPresenceUpdate, payload, true })
	}
}

// DisconnectUser ferme les connexions d'un utilisateur à une partie
// (ex. quand il est retiré de la partie).
func (h *Hub) DisconnectUser(gameID, userID int64) {
	r := h.existingRoom(gameID)
	if r == nil {
		return
	}
	r.mu.Lock()
	var toClose []*Client
	for c := range r.clients {
		if c.member.UserID == userID {
			toClose = append(toClose, c)
		}
	}
	r.mu.Unlock()
	for _, c := range toClose {
		c.close()
	}
}

// CloseGame ferme toutes les connexions d'une partie et oublie son état (suppression de partie).
func (h *Hub) CloseGame(gameID int64) {
	h.mu.Lock()
	r := h.rooms[gameID]
	delete(h.rooms, gameID)
	h.mu.Unlock()
	if r == nil {
		return
	}
	r.mu.Lock()
	clients := make([]*Client, 0, len(r.clients))
	for c := range r.clients {
		clients = append(clients, c)
	}
	r.mu.Unlock()
	for _, c := range clients {
		c.close()
	}
}

// Live retourne une copie de l'état éphémère d'une partie.
func (h *Hub) Live(gameID int64) LiveState {
	r := h.room(gameID)
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.live
}

// ResetMapView efface la vue imposée (ex. quand le MJ change de carte).
func (h *Hub) ResetMapView(gameID int64) {
	r := h.room(gameID)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.live.View = nil
}

// --- Envoi ------------------------------------------------------------------

// broadcastLocked doit être appelé avec r.mu verrouillé.
// Les payloads identiques sont encodés une seule fois.
func (h *Hub) broadcastLocked(r *room, except *Client, fn func(m Member) (string, any, bool)) {
	type key struct {
		typ  string
		role string
	}
	cache := make(map[key][]byte)
	for c := range r.clients {
		if c == except {
			continue
		}
		typ, payload, ok := fn(c.member)
		if !ok {
			continue
		}
		// Le payload ne dépend en pratique que du rôle : on met en cache par (type, rôle).
		// Pour un payload propre à un utilisateur, fn renvoie un objet différent : on
		// encode alors à chaque fois (voir perUser).
		k := key{typ, c.member.Role}
		data, cached := cache[k]
		if !cached || isPerUser(payload) {
			var err error
			data, err = h.encode(r.gameID, typ, unwrapPerUser(payload))
			if err != nil {
				log.Printf("realtime: encode %s: %v", typ, err)
				continue
			}
			if !isPerUser(payload) {
				cache[k] = data
			}
		}
		c.enqueueLocked(data)
	}
}

// PerUser marque un payload qui dépend de l'utilisateur destinataire (pas seulement de son rôle).
type PerUser struct{ Value any }

func isPerUser(p any) bool { _, ok := p.(PerUser); return ok }

func unwrapPerUser(p any) any {
	if pu, ok := p.(PerUser); ok {
		return pu.Value
	}
	return p
}

// --- Connexion / déconnexion -----------------------------------------------

// Attach enregistre une connexion pour un membre et démarre ses boucles de lecture/écriture.
// Bloque jusqu'à la fermeture de la connexion.
func (h *Hub) Attach(conn Conn, gameID int64, member Member) {
	r := h.room(gameID)
	c := newClient(h, r, conn, member)

	r.mu.Lock()
	firstConnection := !r.hasUserLocked(member.UserID)
	r.clients[c] = struct{}{}
	if firstConnection {
		joined := member
		h.broadcastLocked(r, c, func(Member) (string, any, bool) { return EventPresenceJoined, joined, true })
	}
	r.mu.Unlock()

	go c.writePump()
	c.resync()
	c.readPump() // bloquant
	h.detach(c)
}

func (h *Hub) detach(c *Client) {
	c.close()
	r := c.room
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.clients[c]; !ok {
		return
	}
	delete(r.clients, c)
	if !r.hasUserLocked(c.member.UserID) {
		left := map[string]int64{"userId": c.member.UserID}
		h.broadcastLocked(r, nil, func(Member) (string, any, bool) { return EventPresenceLeft, left, true })
	}
}

func (r *room) hasUserLocked(userID int64) bool {
	for c := range r.clients {
		if c.member.UserID == userID {
			return true
		}
	}
	return false
}

// presenceLocked retourne la liste des membres connectés (un par utilisateur).
func (r *room) presenceLocked() []Member {
	seen := make(map[int64]bool)
	list := make([]Member, 0, len(r.clients))
	for c := range r.clients {
		if seen[c.member.UserID] {
			continue
		}
		seen[c.member.UserID] = true
		list = append(list, c.member)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].UserID < list[j].UserID })
	return list
}

// --- Actions des clients -----------------------------------------------------

func (h *Hub) handleAction(c *Client, msg clientMessage) {
	switch msg.Action {
	case ActionPong, "":
		return
	case ActionSync:
		c.resync()
		return
	}

	// Toutes les autres actions sont réservées au MJ.
	if !c.member.IsGM() {
		return
	}
	r := c.room
	r.mu.Lock()
	defer r.mu.Unlock()
	now := h.nowMs()

	switch msg.Action {
	case ActionMapView:
		if msg.Scale == nil || msg.OffsetX == nil || msg.OffsetY == nil {
			return
		}
		if !finite(*msg.Scale, *msg.OffsetX, *msg.OffsetY) || *msg.Scale <= 0 {
			return
		}
		v := MapView{Scale: clamp(*msg.Scale, 0.05, 20), OffsetX: *msg.OffsetX, OffsetY: *msg.OffsetY}
		r.live.View = &v
		// Pas de renvoi à l'expéditeur : il a déjà cette vue, et un écho provoquerait des saccades.
		h.broadcastLocked(r, c, func(Member) (string, any, bool) { return EventMapView, v, true })
		return

	case ActionMusicPlay:
		if msg.TrackID == nil || *msg.TrackID <= 0 {
			return
		}
		id := *msg.TrackID
		r.live.Music.TrackID = &id
		r.live.Music.Playing = true
		r.live.Music.Position = positionOr(msg.Position, 0)
	case ActionMusicPause:
		if r.live.Music.TrackID == nil {
			return
		}
		r.live.Music.Position = positionOr(msg.Position, currentPosition(r.live.Music, now))
		r.live.Music.Playing = false
	case ActionMusicSeek:
		if r.live.Music.TrackID == nil || msg.Position == nil {
			return
		}
		r.live.Music.Position = positionOr(msg.Position, 0)
	case ActionMusicVolume:
		if msg.Volume == nil || !finite(*msg.Volume) {
			return
		}
		r.live.Music.Position = currentPosition(r.live.Music, now)
		r.live.Music.Volume = clamp(*msg.Volume, 0, 1)
	case ActionMusicStop:
		r.live.Music.TrackID = nil
		r.live.Music.Playing = false
		r.live.Music.Position = 0

	case ActionTurnHighlight:
		var pid *int64
		if msg.PlayerID != nil && *msg.PlayerID > 0 {
			id := *msg.PlayerID
			pid = &id
		}
		r.live.TurnPlayerID = pid
		payload := map[string]*int64{"playerId": pid}
		h.broadcastLocked(r, nil, func(Member) (string, any, bool) { return EventTurnHighlight, payload, true })
		return

	default:
		return
	}

	// Actions musique : on diffuse l'état complet à tout le monde (MJ compris).
	r.live.Music.UpdatedAt = now
	music := r.live.Music
	h.broadcastLocked(r, nil, func(Member) (string, any, bool) { return EventMusicState, music, true })
}

func currentPosition(m MusicState, nowMs int64) float64 {
	if !m.Playing || m.UpdatedAt == 0 {
		return m.Position
	}
	return m.Position + float64(nowMs-m.UpdatedAt)/1000
}

func positionOr(p *float64, def float64) float64 {
	if p == nil || !finite(*p) || *p < 0 {
		return def
	}
	return *p
}

func finite(vals ...float64) bool {
	for _, v := range vals {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}

func clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}
