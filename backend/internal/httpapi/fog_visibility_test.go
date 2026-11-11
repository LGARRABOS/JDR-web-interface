package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestPointVisibleToPlayers(t *testing.T) {
	fog := &fogState{Enabled: true, Patches: []*fogPatch{
		{ID: 1, Shape: "rect", X: 0, Y: 0, W: 100, H: 100, Reveal: true},
		{ID: 2, Shape: "ellipse", X: 40, Y: 40, W: 20, H: 20, Reveal: false},
	}}
	cases := []struct {
		name   string
		fog    *fogState
		radius int
		pj     [][2]float64
		x, y   float64
		want   bool
	}{
		{"sans brouillard", nil, 0, nil, 500, 500, true},
		{"zone révélée", fog, 0, nil, 10, 10, true},
		{"recouverte par la zone suivante", fog, 0, nil, 50, 50, false},
		{"hors zone", fog, 0, nil, 200, 200, false},
		{"la vision perce le brouillard", fog, 100, [][2]float64{{250, 200}}, 200, 200, true},
		{"vision seule, loin des personnages", nil, 50, [][2]float64{{0, 0}}, 300, 300, false},
	}
	for _, c := range cases {
		if got := pointVisibleToPlayers(c.fog, c.radius, c.pj, c.x, c.y); got != c.want {
			t.Errorf("%s : obtenu %v, attendu %v", c.name, got, c.want)
		}
	}
}

// Un ennemi sous le brouillard n'est pas envoyé au joueur ; il arrive quand
// le MJ révèle sa zone.
func TestFogHidesEnemiesServerSide(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	gameID := strconv.FormatInt(sess.GameID, 10)
	mapID := strconv.FormatInt(sess.MapID, 10)
	base := "/api/maps/" + mapID + "/fog"

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map",
		map[string]int64{"mapId": sess.MapID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map: %d", rr.Code)
	}
	_ = doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/enabled", map[string]bool{"enabled": true})
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/maps/"+mapID+"/tokens", map[string]any{
		"kind": "PNJ", "name": "Gobelin", "x": 30, "y": 30, "visibleToPlayers": true,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create token: %d %s", rr.Code, rr.Body.String())
	}

	player := joinAsPlayer(t, sess, "Fio")
	hasGoblin := func() bool {
		var list struct {
			Tokens []struct{ Name string } `json:"tokens"`
		}
		_ = json.NewDecoder(doJSON(t, sess.Handler, player, http.MethodGet, "/api/maps/"+mapID+"/tokens", nil).Body).Decode(&list)
		for _, tk := range list.Tokens {
			if tk.Name == "Gobelin" {
				return true
			}
		}
		return false
	}
	if hasGoblin() {
		t.Fatal("un ennemi sous le brouillard ne doit pas être envoyé au joueur")
	}

	pc := dialGame(t, srv, player, sess.GameID)
	readUntil(t, pc, "sync.snapshot")
	_ = doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/patches",
		map[string]any{"shape": "rect", "x": 0, "y": 0, "w": 100, "h": 100, "reveal": true})
	ev := readUntil(t, pc, "scene.tokens")
	var payload struct {
		Tokens []struct{ Name string } `json:"tokens"`
	}
	_ = json.Unmarshal(ev.Payload, &payload)
	found := false
	for _, tk := range payload.Tokens {
		found = found || tk.Name == "Gobelin"
	}
	if !found || !hasGoblin() {
		t.Fatalf("l'ennemi doit apparaître une fois sa zone révélée : %s", ev.Payload)
	}
}
