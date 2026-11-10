package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
)

func TestLibraryLeaveAndDelete(t *testing.T) {
	sess := setupAuthAndGame(t)
	gameID := strconv.FormatInt(sess.GameID, 10)

	// Bibliothèque : créée à la demande, toujours la même, absente des parties.
	var lib struct {
		GameID int64 `json:"gameId"`
	}
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/library", nil)
	_ = json.NewDecoder(rr.Body).Decode(&lib)
	if rr.Code != http.StatusOK || lib.GameID == 0 {
		t.Fatalf("library: %d", rr.Code)
	}
	var again struct {
		GameID int64 `json:"gameId"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/library", nil).Body).Decode(&again)
	if again.GameID != lib.GameID {
		t.Fatalf("la bibliothèque doit être unique : %d puis %d", lib.GameID, again.GameID)
	}
	var games struct {
		Games []struct{ ID int64 } `json:"games"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/games", nil).Body).Decode(&games)
	for _, g := range games.Games {
		if g.ID == lib.GameID {
			t.Fatalf("la bibliothèque ne doit pas apparaître dans « Mes parties »")
		}
	}

	// Une carte préparée dans la bibliothèque est proposée dans la partie.
	libID := strconv.FormatInt(lib.GameID, 10)
	rr = doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games/"+libID+"/maps", map[string]any{
		"name": "Taverne", "imageUrl": "https://example.com/t.png", "width": 800, "height": 600,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create library map: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Map struct{ ID int64 } `json:"map"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)
	libMap := strconv.FormatInt(created.Map.ID, 10)

	var maps struct {
		Maps []struct{ ID int64 } `json:"maps"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/games/"+gameID+"/maps", nil).Body).Decode(&maps)
	found := false
	for _, m := range maps.Maps {
		found = found || m.ID == created.Map.ID
	}
	if !found {
		t.Fatalf("la carte de la bibliothèque doit être listée dans la partie : %+v", maps.Maps)
	}

	// Affichée à la table, le joueur peut tourner son personnage, même bloqué.
	player := joinAsPlayer(t, sess, "Eli")
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID+"/current-map",
		map[string]int64{"mapId": created.Map.ID}); rr.Code != http.StatusOK {
		t.Fatalf("current-map: %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, "/api/games/"+gameID,
		map[string]any{"tokenMovementLocked": true}); rr.Code != http.StatusOK {
		t.Fatalf("lock: %d %s", rr.Code, rr.Body.String())
	}
	rr = doJSON(t, sess.Handler, player, http.MethodGet, "/api/maps/"+libMap+"/tokens", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("le joueur doit voir les jetons de la carte affichée : %d", rr.Code)
	}
	var list struct {
		Tokens []struct {
			ID   int64  `json:"id"`
			Kind string `json:"kind"`
		} `json:"tokens"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&list)
	var pj int64
	for _, tk := range list.Tokens {
		if tk.Kind == "PJ" {
			pj = tk.ID
		}
	}
	if pj == 0 {
		t.Fatalf("jeton du joueur absent")
	}
	tokPath := "/api/tokens/" + strconv.FormatInt(pj, 10)
	rr = doJSON(t, sess.Handler, player, http.MethodPatch, tokPath, map[string]int{"facing": -90})
	if rr.Code != http.StatusOK {
		t.Fatalf("tourner : %d %s", rr.Code, rr.Body.String())
	}
	var tok struct {
		Token struct{ Facing int } `json:"token"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&tok)
	if tok.Token.Facing != 270 {
		t.Fatalf("direction attendue 270, obtenu %d", tok.Token.Facing)
	}
	if rr := doJSON(t, sess.Handler, player, http.MethodPatch, tokPath, map[string]float64{"x": 10}); rr.Code != http.StatusForbidden {
		t.Fatalf("déplacement bloqué attendu, obtenu %d", rr.Code)
	}

	// Le joueur quitte la partie : son jeton disparaît.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete, "/api/games/"+gameID+"/players/me", nil); rr.Code != http.StatusBadRequest {
		t.Fatalf("le MJ ne quitte pas sa partie : %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, player, http.MethodDelete, "/api/games/"+gameID+"/players/me", nil); rr.Code != http.StatusOK {
		t.Fatalf("quitter : %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, player, http.MethodGet, "/api/games/"+gameID, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("après départ, la partie doit être inaccessible : %d", rr.Code)
	}
	list.Tokens = nil
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/maps/"+libMap+"/tokens", nil).Body).Decode(&list)
	for _, tk := range list.Tokens {
		if tk.ID == pj {
			t.Fatalf("le jeton du joueur parti doit être supprimé")
		}
	}

	// Suppression de la partie : sa carte rejoint la bibliothèque.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete, "/api/games/"+libID, nil); rr.Code != http.StatusBadRequest {
		t.Fatalf("la bibliothèque ne se supprime pas : %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete, "/api/games/"+gameID, nil); rr.Code != http.StatusOK {
		t.Fatalf("delete game: %d %s", rr.Code, rr.Body.String())
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, "/api/games/"+libID+"/maps", nil).Body).Decode(&maps)
	ids := map[int64]bool{}
	for _, m := range maps.Maps {
		ids[m.ID] = true
	}
	if !ids[sess.MapID] || !ids[created.Map.ID] {
		t.Fatalf("les cartes doivent être dans la bibliothèque : %+v", maps.Maps)
	}
}
