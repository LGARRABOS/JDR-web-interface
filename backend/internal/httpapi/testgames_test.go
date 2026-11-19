package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
)

func TestTestGameBotsImpersonationAndReset(t *testing.T) {
	sess := setupAuthAndGame(t)
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games",
		map[string]any{"name": "Essais", "isGemma": true, "gemmaVariant": "arpenteur", "isTest": true, "sample": true})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Game struct {
			ID         int64  `json:"id"`
			InviteCode string `json:"inviteCode"`
			IsTest     bool   `json:"isTest"`
		} `json:"game"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)
	if !created.Game.IsTest {
		t.Fatalf("partie test attendue : %+v", created.Game)
	}
	gid := strconv.FormatInt(created.Game.ID, 10)
	base := "/api/games/" + gid

	// Données d'exemple : trois joueurs fictifs.
	var state struct {
		Players []testPlayer `json:"players"`
	}
	rr = doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/test", nil)
	_ = json.NewDecoder(rr.Body).Decode(&state)
	if len(state.Players) != 3 {
		t.Fatalf("3 joueurs fictifs attendus, obtenu %d (%s)", len(state.Players), rr.Body.String())
	}
	bot := state.Players[0]

	// Personne ne peut rejoindre une partie test.
	other := joinAsPlayer(t, sess, "Intrus")
	if rr := doJSON(t, sess.Handler, other, http.MethodPost, "/api/games/join", map[string]string{"inviteCode": created.Game.InviteCode}); rr.Code != http.StatusForbidden {
		t.Fatalf("invitation : 403 attendu, obtenu %d", rr.Code)
	}

	// Le MJ incarne le joueur fictif ; un autre compte ne le peut pas.
	asBot := "/api/auth/me?actAs=" + strconv.FormatInt(bot.UserID, 10)
	if id := userIDAt(t, sess, sess.Cookies, asBot); id != bot.UserID {
		t.Fatalf("incarnation : %d attendu, obtenu %d", bot.UserID, id)
	}
	if id := userIDAt(t, sess, other, asBot); id == bot.UserID {
		t.Fatal("un autre compte ne doit pas pouvoir incarner le joueur fictif")
	}
	rr = doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"?actAs="+strconv.FormatInt(bot.UserID, 10), nil)
	var g struct {
		Game struct {
			Role string `json:"role"`
		} `json:"game"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&g)
	if g.Game.Role != "PLAYER" {
		t.Fatalf("rôle incarné : PLAYER attendu, obtenu %q", g.Game.Role)
	}
	// Même incarné, le MJ garde la main sur les outils de test.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/test?actAs="+strconv.FormatInt(bot.UserID, 10), nil); rr.Code != http.StatusOK {
		t.Fatalf("outils de test incarné : %d", rr.Code)
	}

	// Ajout, suppression, remise à zéro.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/test/players", map[string]string{"displayName": "Dina"}); rr.Code != http.StatusCreated {
		t.Fatalf("ajout : %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodDelete, base+"/test/players/"+strconv.FormatInt(bot.UserID, 10), nil); rr.Code != http.StatusOK {
		t.Fatalf("suppression : %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, base+"/test/reset", nil); rr.Code != http.StatusOK {
		t.Fatalf("reset : %d %s", rr.Code, rr.Body.String())
	}
	var after struct {
		Game map[string]any `json:"game"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base, nil).Body).Decode(&after)
	if _, still := after.Game["currentMapId"]; still {
		t.Fatalf("carte encore affichée après reset : %v", after.Game)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/test", nil); rr.Code != http.StatusOK {
		t.Fatalf("état : %d", rr.Code)
	}

	// Les outils de test sont refusés sur une partie normale et aux autres comptes.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games/"+strconv.FormatInt(sess.GameID, 10)+"/test/reset", nil); rr.Code != http.StatusBadRequest {
		t.Fatalf("partie normale : 400 attendu, obtenu %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, other, http.MethodPost, base+"/test/reset", nil); rr.Code != http.StatusForbidden {
		t.Fatalf("autre compte : 403 attendu, obtenu %d", rr.Code)
	}
}

func userIDAt(t *testing.T, sess *testSession, cookies []*http.Cookie, path string) int64 {
	t.Helper()
	var me struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, cookies, http.MethodGet, path, nil).Body).Decode(&me)
	return me.User.ID
}
