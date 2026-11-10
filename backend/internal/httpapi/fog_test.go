package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestNormalizeFogRect(t *testing.T) {
	x, y, w, h := normalizeFogRect(100, 50, -40, -20)
	if x != 60 || y != 30 || w != 40 || h != 20 {
		t.Fatalf("obtenu %v %v %v %v", x, y, w, h)
	}
}

func decodeFog(t *testing.T, rr *httptest.ResponseRecorder) fogState {
	t.Helper()
	var resp struct {
		Fog fogState `json:"fog"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode fog: %v (%d)", err, rr.Code)
	}
	return resp.Fog
}

func TestFogOfWar(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	gameID := strconv.FormatInt(sess.GameID, 10)
	base := "/api/maps/" + strconv.FormatInt(sess.MapID, 10) + "/fog"

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map",
		map[string]int64{"mapId": sess.MapID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map: %d", rr.Code)
	}
	player := joinAsPlayer(t, sess, "Carla")

	// Un joueur ne peut pas toucher au brouillard.
	if rr := doJSON(t, sess.Handler, player, http.MethodPost, base+"/enabled", map[string]bool{"enabled": true}); rr.Code != http.StatusForbidden {
		t.Fatalf("joueur : %d, attendu 403", rr.Code)
	}

	pc := dialGame(t, srv, player, sess.GameID)
	readUntil(t, pc, "sync.snapshot")

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/enabled", map[string]bool{"enabled": true}); rr.Code != http.StatusOK {
		t.Fatalf("enabled: %d %s", rr.Code, rr.Body.String())
	}
	ev := readUntil(t, pc, "fog.state")
	var st fogState
	_ = json.Unmarshal(ev.Payload, &st)
	if !st.Enabled || len(st.Patches) != 0 {
		t.Fatalf("brouillard actif et vide attendu : %s", ev.Payload)
	}

	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/patches",
		map[string]any{"shape": "rect", "x": 200, "y": 100, "w": -50, "h": 40, "reveal": true})
	if rr.Code != http.StatusCreated {
		t.Fatalf("patch: %d %s", rr.Code, rr.Body.String())
	}
	ev = readUntil(t, pc, "fog.patch")
	var p fogPatch
	_ = json.Unmarshal(ev.Payload, &p)
	if p.X != 150 || p.W != 50 || !p.Reveal || p.Shape != "rect" {
		t.Fatalf("zone inattendue : %s", ev.Payload)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/patches",
		map[string]any{"shape": "star", "x": 0, "y": 0, "w": 10, "h": 10}); rr.Code != http.StatusBadRequest {
		t.Fatalf("forme inconnue : %d, attendu 400", rr.Code)
	}
	_ = doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/patches",
		map[string]any{"shape": "ellipse", "x": 0, "y": 0, "w": 30, "h": 30, "reveal": false})

	// Le joueur lit l'état complet.
	if st := decodeFog(t, doJSON(t, sess.Handler, player, http.MethodGet, base, nil)); len(st.Patches) != 2 {
		t.Fatalf("2 zones attendues, obtenu %d", len(st.Patches))
	}
	if st := decodeFog(t, doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/undo", nil)); len(st.Patches) != 1 || st.Patches[0].Shape != "rect" {
		t.Fatalf("annuler doit retirer la dernière zone : %+v", st.Patches)
	}
	st = decodeFog(t, doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/reset", map[string]bool{"revealAll": true}))
	if len(st.Patches) != 1 || !st.Patches[0].Reveal || st.Patches[0].X != 0 {
		t.Fatalf("tout révéler : une zone couvrant la carte attendue : %+v", st.Patches)
	}
	if st := decodeFog(t, doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/reset", map[string]bool{"revealAll": false})); len(st.Patches) != 0 {
		t.Fatalf("tout cacher : aucune zone attendue : %+v", st.Patches)
	}

	// Un nouvel instantané contient le brouillard.
	pc2 := dialGame(t, srv, player, sess.GameID)
	snap := readUntil(t, pc2, "sync.snapshot")
	var s struct {
		State struct {
			Scene struct {
				Fog *fogState `json:"fog"`
			} `json:"scene"`
		} `json:"state"`
	}
	_ = json.Unmarshal(snap.Payload, &s)
	if s.State.Scene.Fog == nil || !s.State.Scene.Fog.Enabled {
		t.Fatalf("l'instantané doit contenir le brouillard : %s", snap.Payload)
	}
}
