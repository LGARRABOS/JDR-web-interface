package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

// Le MJ supprime la carte affichée, en crée une nouvelle et l'affiche (depuis
// la page Ressources, donc sans être connecté à la table) : le joueur doit la
// recevoir en direct, avec son personnage au centre.
func TestPlayerReceivesNewMapAfterDeletingCurrent(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	gameID := strconv.FormatInt(sess.GameID, 10)

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map",
		map[string]int64{"mapId": sess.MapID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map: %d", rr.Code)
	}
	player := joinAsPlayer(t, sess, "Dana")
	pc := dialGame(t, srv, player, sess.GameID)
	readUntil(t, pc, "sync.snapshot")

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete,
		"/api/maps/"+strconv.FormatInt(sess.MapID, 10), nil); rr.Code != http.StatusOK {
		t.Fatalf("delete map: %d %s", rr.Code, rr.Body.String())
	}
	readUntil(t, pc, "map.deleted")

	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games/"+gameID+"/maps", map[string]any{
		"name": "Grotte", "imageUrl": "https://example.com/grotte.png", "width": 1000, "height": 600,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create map: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Map struct{ ID int64 } `json:"map"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)
	readUntil(t, pc, "map.created")

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map",
		map[string]int64{"mapId": created.Map.ID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map (nouvelle carte): %d %s", rr.Code, rr.Body.String())
	}
	ev := readUntil(t, pc, "map.displayed")
	var scene struct {
		Map    struct{ ID int64 } `json:"map"`
		Tokens []struct {
			Kind string  `json:"kind"`
			X    float64 `json:"x"`
			Y    float64 `json:"y"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(ev.Payload, &scene); err != nil {
		t.Fatalf("scene: %v", err)
	}
	if scene.Map.ID != created.Map.ID {
		t.Fatalf("carte affichée %d, attendu %d", scene.Map.ID, created.Map.ID)
	}
	found := false
	for _, tk := range scene.Tokens {
		if tk.Kind == "PJ" {
			found = true
			if tk.X != 500 || tk.Y != 300 {
				t.Fatalf("le personnage doit arriver au centre (500, 300), obtenu (%v, %v)", tk.X, tk.Y)
			}
		}
	}
	if !found {
		t.Fatalf("le jeton du joueur doit être dans la scène : %s", ev.Payload)
	}
}
