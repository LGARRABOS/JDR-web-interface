package realtime

// Ce fichier décrit le protocole WebSocket entre le serveur et les clients.
// Il doit rester aligné avec frontend/src/realtime/protocol.ts.
//
// Principe : le serveur est la seule source de vérité.
//   - À chaque (re)connexion, le serveur envoie un message "sync.snapshot"
//     contenant l'état complet de la partie (filtré selon le rôle).
//   - Ensuite il envoie des événements qui remplacent ou suppriment des objets
//     entiers (idempotents) : un client peut les rejouer sans risque.
//   - Si un client est trop lent, sa connexion est fermée : il se reconnecte
//     et reçoit un nouvel instantané. Aucun message n'est perdu silencieusement.

// Rôles dans une partie.
const (
	RoleGM     = "MJ"
	RolePlayer = "PLAYER"
)

// Types d'événements envoyés par le serveur.
const (
	EventSnapshot       = "sync.snapshot"
	EventPing           = "ping"
	EventError          = "error"
	EventPresenceJoined = "presence.joined"
	EventPresenceLeft   = "presence.left"
	EventPresenceUpdate = "presence.updated"
	EventMapView        = "map.view"
	EventMusicState     = "music.state"
	EventTurnHighlight  = "turn.highlight"
	EventRuler          = "ruler"
)

// Actions envoyées par les clients.
const (
	ActionPong          = "pong"
	ActionSync          = "sync"
	ActionMapView       = "map.view"
	ActionMusicPlay     = "music.play"
	ActionMusicPause    = "music.pause"
	ActionMusicSeek     = "music.seek"
	ActionMusicVolume   = "music.volume"
	ActionMusicStop     = "music.stop"
	ActionTurnHighlight = "turn.highlight"
	// Règle de mesure : ouverte à tous les membres, relayée aux autres.
	ActionRuler = "ruler"
)

// Envelope est la forme de tout message envoyé par le serveur.
type Envelope struct {
	Type       string `json:"type"`
	GameID     int64  `json:"gameId"`
	ServerTime int64  `json:"serverTime"` // ms depuis epoch, sert à synchroniser la musique
	Payload    any    `json:"payload,omitempty"`
}

// Member décrit un utilisateur connecté à une partie.
type Member struct {
	UserID        int64  `json:"userId"`
	DisplayName   string `json:"displayName"`
	CharacterName string `json:"characterName"`
	Role          string `json:"role"`
}

// IsGM indique si le membre est Maître du Jeu.
func (m Member) IsGM() bool { return m.Role == RoleGM }

// MapView est la vue (zoom / déplacement) de la carte imposée par le MJ.
type MapView struct {
	Scale   float64 `json:"scale"`
	OffsetX float64 `json:"offsetX"`
	OffsetY float64 `json:"offsetY"`
}

// MusicState est l'état de la musique d'ambiance.
// Position est la position (en secondes) au moment UpdatedAt (ms serveur).
// Si Playing, la position réelle vaut Position + (maintenant - UpdatedAt).
type MusicState struct {
	TrackID   *int64  `json:"trackId"`
	Playing   bool    `json:"playing"`
	Position  float64 `json:"position"`
	Volume    float64 `json:"volume"`
	UpdatedAt int64   `json:"updatedAt"`
}

// LiveState est l'état éphémère d'une partie, conservé en mémoire par le serveur.
type LiveState struct {
	View         *MapView   `json:"view"`
	Music        MusicState `json:"music"`
	TurnPlayerID *int64     `json:"turnPlayerId"`
}

// SnapshotPayload est le contenu du message "sync.snapshot".
type SnapshotPayload struct {
	You      Member    `json:"you"`
	State    any       `json:"state"`
	Live     LiveState `json:"live"`
	Presence []Member  `json:"presence"`
}

// clientMessage est la forme des messages reçus des clients.
type clientMessage struct {
	Action   string   `json:"action"`
	Scale    *float64 `json:"scale"`
	OffsetX  *float64 `json:"offsetX"`
	OffsetY  *float64 `json:"offsetY"`
	TrackID  *int64   `json:"trackId"`
	Position *float64 `json:"position"`
	Volume   *float64 `json:"volume"`
	PlayerID *int64   `json:"playerId"`
	// Règle : segment en coordonnées de carte ; absent = règle retirée.
	MapID *int64      `json:"mapId"`
	From  *RulerPoint `json:"from"`
	To    *RulerPoint `json:"to"`
}

// RulerPoint est un point de la carte.
type RulerPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// RulerLine est la mesure en cours d'un membre (From/To nuls : terminée).
type RulerLine struct {
	UserID int64       `json:"userId"`
	MapID  int64       `json:"mapId"`
	From   *RulerPoint `json:"from"`
	To     *RulerPoint `json:"to"`
}
