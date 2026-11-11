package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestHandoutsShownToPlayers(t *testing.T) {
	sess := setupAuthAndGame(t)
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	base := "/api/games/" + strconv.FormatInt(sess.GameID, 10) + "/handouts"
	player := joinAsPlayer(t, sess, "Gus")

	if rr := doJSON(t, sess.Handler, player, http.MethodPost, base, map[string]string{"title": "Triche", "body": "x"}); rr.Code != http.StatusForbidden {
		t.Fatalf("un joueur ne crée pas de document : %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base, map[string]string{"title": "Vide"}); rr.Code != http.StatusBadRequest {
		t.Fatalf("document vide refusé attendu : %d", rr.Code)
	}
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base, map[string]string{"title": "Lettre", "body": "Rendez-vous à minuit"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Handout handout `json:"handout"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)
	path := base + "/" + strconv.FormatInt(created.Handout.ID, 10)

	count := func(c []*http.Cookie) int {
		var list struct {
			Handouts []handout `json:"handouts"`
		}
		_ = json.NewDecoder(doJSON(t, sess.Handler, c, http.MethodGet, base, nil).Body).Decode(&list)
		return len(list.Handouts)
	}
	if count(player) != 0 || count(sess.Cookies) != 1 {
		t.Fatalf("avant d'être montré, le document n'est visible que du MJ")
	}

	pc := dialGame(t, srv, player, sess.GameID)
	readUntil(t, pc, "sync.snapshot")
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, path+"/show", nil); rr.Code != http.StatusOK {
		t.Fatalf("show: %d %s", rr.Code, rr.Body.String())
	}
	var shown handout
	_ = json.Unmarshal(readUntil(t, pc, "handout.shown").Payload, &shown)
	if shown.Title != "Lettre" || !shown.Shown || count(player) != 1 {
		t.Fatalf("le joueur doit recevoir le document : %+v", shown)
	}

	// Caché à nouveau : le joueur ne reçoit que de quoi le retirer.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, path, map[string]bool{"shown": false}); rr.Code != http.StatusOK {
		t.Fatalf("hide: %d", rr.Code)
	}
	var hidden handout
	_ = json.Unmarshal(readUntil(t, pc, "handout.updated").Payload, &hidden)
	if hidden.Shown || hidden.Title != "" || hidden.Body != "" {
		t.Fatalf("un document caché ne doit pas fuiter : %+v", hidden)
	}
	if count(player) != 0 {
		t.Fatal("le document caché ne doit plus être listé pour le joueur")
	}

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete, path, nil); rr.Code != http.StatusOK {
		t.Fatalf("delete: %d", rr.Code)
	}
	readUntil(t, pc, "handout.deleted")
}

func TestGMNotesArePrivate(t *testing.T) {
	sess := setupAuthAndGame(t)
	base := "/api/games/" + strconv.FormatInt(sess.GameID, 10) + "/notes"
	mapNotes := base + "?mapId=" + strconv.FormatInt(sess.MapID, 10)
	player := joinAsPlayer(t, sess, "Hana")

	if rr := doJSON(t, sess.Handler, player, http.MethodGet, base, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("un joueur ne lit pas les notes du MJ : %d", rr.Code)
	}
	for _, c := range []struct{ path, body string }{
		{base, "Le traître est le forgeron"},
		{mapNotes, "Piège derrière la porte nord"},
		{base, "Le traître est l'aubergiste"},
	} {
		if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPut, c.path, map[string]string{"body": c.body}); rr.Code != http.StatusOK {
			t.Fatalf("put %s: %d %s", c.path, rr.Code, rr.Body.String())
		}
	}
	read := func(path string) string {
		var n struct {
			Body string `json:"body"`
		}
		_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, path, nil).Body).Decode(&n)
		return n.Body
	}
	if got := read(base); got != "Le traître est l'aubergiste" {
		t.Fatalf("notes de la partie : %q", got)
	}
	if got := read(mapNotes); got != "Piège derrière la porte nord" {
		t.Fatalf("notes de la carte : %q", got)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPut, base+"?mapId=999999", map[string]string{"body": "x"}); rr.Code != http.StatusNotFound {
		t.Fatalf("carte inconnue : %d", rr.Code)
	}
}
