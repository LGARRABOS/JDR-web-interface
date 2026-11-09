package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Tests de bout en bout du temps réel : vrai serveur HTTP, vraie base, vrais WebSocket.

type wsEnvelope struct {
	Type    string          `json:"type"`
	GameID  int64           `json:"gameId"`
	Payload json.RawMessage `json:"payload"`
}

func dialGame(t *testing.T, srv *httptest.Server, cookies []*http.Cookie, gameID int64) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/ws?gameId=" + strconv.FormatInt(gameID, 10)
	header := http.Header{}
	for _, c := range cookies {
		header.Add("Cookie", c.Name+"="+c.Value)
	}
	conn, resp, err := websocket.DefaultDialer.Dial(url, header)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("dial ws: %v (status %d)", err, status)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

// readUntil lit les messages jusqu'à trouver le type demandé.
func readUntil(t *testing.T, conn *websocket.Conn, typ string) wsEnvelope {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		var env wsEnvelope
		if err := conn.ReadJSON(&env); err != nil {
			t.Fatalf("lecture %q : %v", typ, err)
		}
		if env.Type == typ {
			return env
		}
	}
}

// expectNone vérifie qu'aucun message du type donné contenant `needle` n'arrive pendant un court délai.
func expectNone(t *testing.T, conn *websocket.Conn, typ, needle string, within time.Duration) {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(within))
	for {
		var env wsEnvelope
		if err := conn.ReadJSON(&env); err != nil {
			return // délai écoulé
		}
		if env.Type == typ && strings.Contains(string(env.Payload), needle) {
			t.Fatalf("message %q inattendu : %s", typ, env.Payload)
		}
	}
}

func doJSON(t *testing.T, h http.Handler, cookies []*http.Cookie, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

// joinAsPlayer crée un joueur et le fait rejoindre la partie.
func joinAsPlayer(t *testing.T, sess *testSession, name string) []*http.Cookie {
	t.Helper()
	email := strings.ToLower(fmt.Sprintf("%s-%s@test.com", name, strings.ReplaceAll(t.Name(), "/", "_")))
	if rr := doJSON(t, sess.Handler, nil, http.MethodPost, "/api/auth/register",
		map[string]string{"email": email, "password": "pass123", "displayName": name}); rr.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", rr.Code, rr.Body.String())
	}
	rr := doJSON(t, sess.Handler, nil, http.MethodPost, "/api/auth/login", map[string]string{"email": email, "password": "pass123"})
	if rr.Code != http.StatusOK {
		t.Fatalf("login: %d", rr.Code)
	}
	cookies := rr.Result().Cookies()
	if rr := doJSON(t, sess.Handler, cookies, http.MethodPost, "/api/games/join", map[string]string{"inviteCode": sess.InviteCode}); rr.Code >= 300 {
		t.Fatalf("join: %d %s", rr.Code, rr.Body.String())
	}
	return cookies
}

func TestRealtimeSnapshotAndHiddenTokens(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	gameID := strconv.FormatInt(sess.GameID, 10)
	mapID := strconv.FormatInt(sess.MapID, 10)

	// Le MJ affiche la carte.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map", map[string]int64{"mapId": sess.MapID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map: %d %s", rr.Code, rr.Body.String())
	}

	gm := dialGame(t, srv, sess.Cookies, sess.GameID)
	snap := readUntil(t, gm, "sync.snapshot")
	var gmSnap struct {
		You   struct{ Role string } `json:"you"`
		State struct {
			Game  struct{ ID int64 } `json:"game"`
			Scene *struct {
				Map struct{ ID int64 } `json:"map"`
			} `json:"scene"`
		} `json:"state"`
	}
	if err := json.Unmarshal(snap.Payload, &gmSnap); err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if gmSnap.You.Role != "MJ" || gmSnap.State.Game.ID != sess.GameID || gmSnap.State.Scene == nil || gmSnap.State.Scene.Map.ID != sess.MapID {
		t.Fatalf("instantané MJ inattendu : %s", snap.Payload)
	}

	playerCookies := joinAsPlayer(t, sess, "Alice")
	player := dialGame(t, srv, playerCookies, sess.GameID)
	pSnap := readUntil(t, player, "sync.snapshot")
	var playerSnap struct {
		State struct {
			Game struct {
				InviteCode string `json:"inviteCode"`
			} `json:"game"`
			Scene struct {
				Tokens []struct {
					Kind string `json:"kind"`
				} `json:"tokens"`
			} `json:"scene"`
		} `json:"state"`
	}
	_ = json.Unmarshal(pSnap.Payload, &playerSnap)
	if playerSnap.State.Game.InviteCode != "" {
		t.Error("le code d'invitation ne doit pas être envoyé aux joueurs")
	}
	if len(playerSnap.State.Scene.Tokens) != 1 || playerSnap.State.Scene.Tokens[0].Kind != "PJ" {
		t.Errorf("le joueur doit avoir son jeton PJ : %s", pSnap.Payload)
	}
	readUntil(t, gm, "presence.joined")

	// Jeton caché : le MJ le reçoit, pas le joueur.
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/maps/"+mapID+"/tokens",
		map[string]any{"name": "Embuscade", "x": 10, "y": 10, "visibleToPlayers": false})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create token: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Token struct{ ID int64 } `json:"token"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)
	expectNone(t, player, "token.created", "Embuscade", 300*time.Millisecond)

	// Le MJ le révèle : le joueur le reçoit.
	tokenPath := "/api/tokens/" + strconv.FormatInt(created.Token.ID, 10)
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, tokenPath, map[string]any{"visibleToPlayers": true}); rr.Code != http.StatusOK {
		t.Fatalf("reveal: %d %s", rr.Code, rr.Body.String())
	}
	readUntil(t, player, "token.updated")

	// La liste HTTP des jetons ne contient pas les jetons cachés pour un joueur.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, tokenPath, map[string]any{"visibleToPlayers": false}); rr.Code != http.StatusOK {
		t.Fatalf("hide: %d", rr.Code)
	}
	readUntil(t, player, "token.deleted")
	rr = doJSON(t, sess.Handler, playerCookies, http.MethodGet, "/api/maps/"+mapID+"/tokens", nil)
	if strings.Contains(rr.Body.String(), "Embuscade") {
		t.Error("jeton caché visible dans l'API pour un joueur")
	}
}

func TestRealtimeLiveStateAndCharacterName(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()

	gm := dialGame(t, srv, sess.Cookies, sess.GameID)
	readUntil(t, gm, "sync.snapshot")
	_ = gm.WriteJSON(map[string]any{"action": "music.play", "trackId": 42, "position": 3})
	readUntil(t, gm, "music.state")
	_ = gm.WriteJSON(map[string]any{"action": "map.view", "scale": 2, "offsetX": 5, "offsetY": 6})
	time.Sleep(100 * time.Millisecond)

	// Un joueur qui arrive ensuite reçoit la musique et la vue, même si le MJ se déconnecte.
	_ = gm.Close()
	playerCookies := joinAsPlayer(t, sess, "Bob")
	player := dialGame(t, srv, playerCookies, sess.GameID)
	snap := readUntil(t, player, "sync.snapshot")
	var payload struct {
		Live struct {
			View  *struct{ Scale float64 } `json:"view"`
			Music struct {
				TrackID *int64 `json:"trackId"`
				Playing bool   `json:"playing"`
			} `json:"music"`
		} `json:"live"`
	}
	_ = json.Unmarshal(snap.Payload, &payload)
	if payload.Live.Music.TrackID == nil || *payload.Live.Music.TrackID != 42 || !payload.Live.Music.Playing {
		t.Errorf("musique absente de l'instantané : %s", snap.Payload)
	}
	if payload.Live.View == nil || payload.Live.View.Scale != 2 {
		t.Errorf("vue absente de l'instantané : %s", snap.Payload)
	}

	// Changer son nom de personnage prévient les autres.
	gm2 := dialGame(t, srv, sess.Cookies, sess.GameID)
	readUntil(t, gm2, "sync.snapshot")
	if rr := doJSON(t, sess.Handler, playerCookies, http.MethodPatch, "/api/games/"+strconv.FormatInt(sess.GameID, 10)+"/me",
		map[string]string{"characterName": "Thorin"}); rr.Code != http.StatusOK {
		t.Fatalf("update me: %d", rr.Code)
	}
	upd := readUntil(t, gm2, "presence.updated")
	if !strings.Contains(string(upd.Payload), "Thorin") {
		t.Errorf("presence.updated = %s", upd.Payload)
	}
}

func TestRealtimeRejectsNonMembers(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()

	email := strings.ToLower(fmt.Sprintf("intrus-%s@test.com", strings.ReplaceAll(t.Name(), "/", "_")))
	doJSON(t, sess.Handler, nil, http.MethodPost, "/api/auth/register", map[string]string{"email": email, "password": "pass123", "displayName": "Intrus"})
	rr := doJSON(t, sess.Handler, nil, http.MethodPost, "/api/auth/login", map[string]string{"email": email, "password": "pass123"})
	cookies := rr.Result().Cookies()

	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/ws?gameId=" + strconv.FormatInt(sess.GameID, 10)
	header := http.Header{}
	for _, c := range cookies {
		header.Add("Cookie", c.Name+"="+c.Value)
	}
	_, resp, err := websocket.DefaultDialer.Dial(url, header)
	if err == nil {
		t.Fatal("un non-membre a pu se connecter")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("statut attendu 403, reçu %v", resp)
	}
}
