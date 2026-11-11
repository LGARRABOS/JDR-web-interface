package realtime

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakeConn simule une connexion WebSocket.
type fakeConn struct {
	in     chan []byte
	mu     sync.Mutex
	out    []Envelope
	closed chan struct{}
	once   sync.Once
	notify chan struct{}
}

func newFakeConn() *fakeConn {
	return &fakeConn{in: make(chan []byte, 16), closed: make(chan struct{}), notify: make(chan struct{}, 1024)}
}

func (f *fakeConn) ReadMessage() (int, []byte, error) {
	select {
	case b := <-f.in:
		return textMessage, b, nil
	case <-f.closed:
		return 0, nil, errors.New("closed")
	}
}

func (f *fakeConn) WriteMessage(_ int, data []byte) error {
	select {
	case <-f.closed:
		return errors.New("closed")
	default:
	}
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return err
	}
	f.mu.Lock()
	f.out = append(f.out, env)
	f.mu.Unlock()
	f.notify <- struct{}{}
	return nil
}

func (f *fakeConn) SetReadDeadline(time.Time) error  { return nil }
func (f *fakeConn) SetWriteDeadline(time.Time) error { return nil }
func (f *fakeConn) SetReadLimit(int64)               {}
func (f *fakeConn) Close() error {
	f.once.Do(func() { close(f.closed) })
	return nil
}

func (f *fakeConn) sendAction(t *testing.T, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	f.in <- b
}

// waitFor attend un message du type donné et le retourne.
func (f *fakeConn) waitFor(t *testing.T, typ string) Envelope {
	t.Helper()
	deadline := time.After(2 * time.Second)
	seen := 0
	for {
		f.mu.Lock()
		for i := seen; i < len(f.out); i++ {
			if f.out[i].Type == typ {
				env := f.out[i]
				f.out = append(f.out[:i], f.out[i+1:]...)
				f.mu.Unlock()
				return env
			}
		}
		seen = len(f.out)
		f.mu.Unlock()
		select {
		case <-f.notify:
		case <-deadline:
			t.Fatalf("message %q non reçu", typ)
		}
	}
}

func (f *fakeConn) types() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var ts []string
	for _, e := range f.out {
		ts = append(ts, e.Type)
	}
	return ts
}

func payloadAs[T any](t *testing.T, env Envelope) T {
	t.Helper()
	b, _ := json.Marshal(env.Payload)
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("payload: %v", err)
	}
	return v
}

var (
	gm      = Member{UserID: 1, DisplayName: "Maître", Role: RoleGM}
	player  = Member{UserID: 2, DisplayName: "Alice", Role: RolePlayer}
	player2 = Member{UserID: 3, DisplayName: "Bob", Role: RolePlayer}
)

func newTestHub() *Hub {
	return NewHub(Config{
		Snapshot: func(gameID int64, m Member) (any, error) {
			return map[string]any{"role": m.Role}, nil
		},
	})
}

func attach(h *Hub, gameID int64, m Member) *fakeConn {
	c := newFakeConn()
	go h.Attach(c, gameID, m)
	return c
}

func TestSnapshotIsFirstMessageAndFilteredByRole(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	env := g.waitFor(t, EventSnapshot)
	snap := payloadAs[SnapshotPayload](t, env)
	if snap.You.UserID != gm.UserID {
		t.Fatalf("you = %+v", snap.You)
	}
	if st := snap.State.(map[string]any); st["role"] != RoleGM {
		t.Fatalf("state = %+v", st)
	}
	if len(snap.Presence) != 1 {
		t.Fatalf("presence = %+v", snap.Presence)
	}
}

func TestLiveStateSurvivesGMDisconnect(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)

	g.sendAction(t, map[string]any{"action": ActionMapView, "scale": 2.0, "offsetX": 10.0, "offsetY": -5.0})
	g.sendAction(t, map[string]any{"action": ActionMusicPlay, "trackId": 7, "position": 12.5})
	g.waitFor(t, EventMusicState)
	g.sendAction(t, map[string]any{"action": ActionTurnHighlight, "playerId": 2})
	g.waitFor(t, EventTurnHighlight)

	// Le MJ quitte la partie : l'état doit rester disponible pour les joueurs.
	_ = g.Close()
	time.Sleep(20 * time.Millisecond)

	p := attach(h, 1, player)
	snap := payloadAs[SnapshotPayload](t, p.waitFor(t, EventSnapshot))
	if snap.Live.View == nil || snap.Live.View.Scale != 2 || snap.Live.View.OffsetX != 10 {
		t.Fatalf("vue = %+v", snap.Live.View)
	}
	if snap.Live.Music.TrackID == nil || *snap.Live.Music.TrackID != 7 || !snap.Live.Music.Playing {
		t.Fatalf("musique = %+v", snap.Live.Music)
	}
	if snap.Live.TurnPlayerID == nil || *snap.Live.TurnPlayerID != 2 {
		t.Fatalf("tour = %+v", snap.Live.TurnPlayerID)
	}
}

func TestPlayersCannotControlLiveState(t *testing.T) {
	h := newTestHub()
	p := attach(h, 1, player)
	p.waitFor(t, EventSnapshot)
	p.sendAction(t, map[string]any{"action": ActionMusicPlay, "trackId": 3})
	p.sendAction(t, map[string]any{"action": ActionMapView, "scale": 3.0, "offsetX": 0.0, "offsetY": 0.0})
	time.Sleep(30 * time.Millisecond)
	live := h.Live(1)
	if live.Music.TrackID != nil || live.View != nil {
		t.Fatalf("un joueur a modifié l'état : %+v", live)
	}
}

func TestMapViewNotEchoedToSender(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	p := attach(h, 1, player)
	p.waitFor(t, EventSnapshot)

	g.sendAction(t, map[string]any{"action": ActionMapView, "scale": 1.5, "offsetX": 1.0, "offsetY": 2.0})
	v := payloadAs[MapView](t, p.waitFor(t, EventMapView))
	if v.Scale != 1.5 {
		t.Fatalf("vue = %+v", v)
	}
	time.Sleep(20 * time.Millisecond)
	for _, typ := range g.types() {
		if typ == EventMapView {
			t.Fatal("la vue a été renvoyée au MJ")
		}
	}
}

func TestPresenceWithMultipleTabs(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)

	tab1 := attach(h, 1, player)
	tab1.waitFor(t, EventSnapshot)
	g.waitFor(t, EventPresenceJoined)

	tab2 := attach(h, 1, player)
	tab2.waitFor(t, EventSnapshot)

	// Fermer un seul onglet ne doit pas faire « partir » le joueur.
	_ = tab1.Close()
	time.Sleep(30 * time.Millisecond)
	for _, typ := range g.types() {
		if typ == EventPresenceLeft || typ == EventPresenceJoined {
			t.Fatalf("événement de présence inattendu : %v", g.types())
		}
	}

	_ = tab2.Close()
	left := payloadAs[map[string]int64](t, g.waitFor(t, EventPresenceLeft))
	if left["userId"] != player.UserID {
		t.Fatalf("left = %+v", left)
	}
}

func TestBroadcastFuncFiltersPerRole(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	p := attach(h, 1, player)
	p.waitFor(t, EventSnapshot)

	// Un jeton caché : le MJ le reçoit, le joueur reçoit une suppression.
	h.BroadcastFunc(1, func(m Member) (string, any, bool) {
		if m.IsGM() {
			return "token.updated", map[string]any{"id": 5, "visibleToPlayers": false}, true
		}
		return "token.deleted", map[string]any{"id": 5}, true
	})
	g.waitFor(t, "token.updated")
	p.waitFor(t, "token.deleted")

	h.BroadcastToRole(1, RoleGM, "dice.rolled.hidden", map[string]any{"result": 20})
	g.waitFor(t, "dice.rolled.hidden")
	time.Sleep(20 * time.Millisecond)
	for _, typ := range p.types() {
		if typ == "dice.rolled.hidden" {
			t.Fatal("un joueur a reçu un jet caché")
		}
	}
}

func TestResyncSendsFreshSnapshot(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	g.sendAction(t, map[string]any{"action": ActionSync})
	g.waitFor(t, EventSnapshot)
}

func TestEventsDuringSnapshotAreDelivered(t *testing.T) {
	release := make(chan struct{})
	h := NewHub(Config{
		Snapshot: func(int64, Member) (any, error) {
			<-release // instantané lent
			return nil, nil
		},
	})
	p := newFakeConn()
	go h.Attach(p, 1, player)
	time.Sleep(20 * time.Millisecond)
	h.Broadcast(1, "token.updated", map[string]any{"id": 1})
	close(release)
	p.waitFor(t, EventSnapshot)
	p.waitFor(t, "token.updated")
	if ts := p.types(); len(ts) != 0 {
		t.Fatalf("messages restants : %v", ts)
	}
}

func TestSlowClientIsDisconnected(t *testing.T) {
	h := newTestHub()
	h.sendBuffer = 2
	blocked := &blockingConn{fakeConn: newFakeConn(), unblock: make(chan struct{})}
	go h.Attach(blocked, 1, player)
	time.Sleep(20 * time.Millisecond)
	for i := 0; i < 20; i++ {
		h.Broadcast(1, "chat.message", map[string]any{"i": i})
	}
	select {
	case <-blocked.closed:
	case <-time.After(time.Second):
		t.Fatal("le client lent n'a pas été déconnecté")
	}
	close(blocked.unblock)
}

type blockingConn struct {
	*fakeConn
	unblock chan struct{}
}

func (b *blockingConn) WriteMessage(int, []byte) error {
	<-b.unblock
	return errors.New("closed")
}

func TestMusicPositionAdvancesWhilePlaying(t *testing.T) {
	now := time.UnixMilli(1_000_000)
	var mu sync.Mutex
	h := NewHub(Config{Now: func() time.Time { mu.Lock(); defer mu.Unlock(); return now }})
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	g.sendAction(t, map[string]any{"action": ActionMusicPlay, "trackId": 1, "position": 10.0})
	g.waitFor(t, EventMusicState)

	mu.Lock()
	now = now.Add(5 * time.Second)
	mu.Unlock()
	g.sendAction(t, map[string]any{"action": ActionMusicPause})
	m := payloadAs[MusicState](t, g.waitFor(t, EventMusicState))
	if m.Playing || m.Position < 14.9 || m.Position > 15.1 {
		t.Fatalf("musique = %+v", m)
	}
}

func TestUpdateMemberBroadcastsPresence(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	p := attach(h, 1, player)
	p.waitFor(t, EventSnapshot)
	h.UpdateMember(1, player.UserID, func(m *Member) { m.CharacterName = "Elara" })
	m := payloadAs[Member](t, g.waitFor(t, EventPresenceUpdate))
	if m.CharacterName != "Elara" {
		t.Fatalf("membre = %+v", m)
	}
	_ = player2
}

func TestRulerRelayedToOthersOnly(t *testing.T) {
	h := newTestHub()
	g := attach(h, 1, gm)
	g.waitFor(t, EventSnapshot)
	p := attach(h, 1, player)
	p.waitFor(t, EventSnapshot)

	// Un joueur peut mesurer : le MJ voit sa règle.
	p.sendAction(t, map[string]any{"action": ActionRuler, "mapId": 5,
		"from": map[string]float64{"x": 1, "y": 2}, "to": map[string]float64{"x": 3, "y": 4}})
	l := payloadAs[RulerLine](t, g.waitFor(t, EventRuler))
	if l.UserID != player.UserID || l.MapID != 5 || l.To == nil || l.To.X != 3 {
		t.Fatalf("règle = %+v", l)
	}
	// Fin de mesure : segment vide.
	p.sendAction(t, map[string]any{"action": ActionRuler, "mapId": 5})
	if l := payloadAs[RulerLine](t, g.waitFor(t, EventRuler)); l.From != nil {
		t.Fatalf("la règle doit être retirée : %+v", l)
	}
	time.Sleep(20 * time.Millisecond)
	for _, typ := range p.types() {
		if typ == EventRuler {
			t.Fatal("la règle a été renvoyée à son auteur")
		}
	}
}
