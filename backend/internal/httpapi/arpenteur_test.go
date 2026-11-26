package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"jdr-backend/internal/adventures/arpenteur"
)

// arpenteurGame crée une partie GEMMA en mode Arpenteur pour le MJ de sess.
func arpenteurGame(t *testing.T, sess *testSession) *testSession {
	t.Helper()
	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games",
		map[string]any{"name": "Chasseurs de Draals", "isGemma": true, "gemmaVariant": "arpenteur"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		Game struct {
			ID           int64  `json:"id"`
			InviteCode   string `json:"inviteCode"`
			GemmaVariant string `json:"gemmaVariant"`
		} `json:"game"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if resp.Game.GemmaVariant != "arpenteur" {
		t.Fatalf("sous-type attendu : %+v", resp.Game)
	}
	cp := *sess
	cp.GameID, cp.InviteCode = resp.Game.ID, resp.Game.InviteCode
	return &cp
}

func userID(t *testing.T, sess *testSession, cookies []*http.Cookie) int64 {
	t.Helper()
	var me struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.NewDecoder(doJSON(t, sess.Handler, cookies, http.MethodGet, "/api/auth/me", nil).Body).Decode(&me)
	return me.User.ID
}

func decodeArpenteur(t *testing.T, rr *httptest.ResponseRecorder) arpenteurPayload {
	t.Helper()
	var p arpenteurPayload
	if err := json.NewDecoder(rr.Body).Decode(&p); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return p
}

func TestArpenteurNeedsVariant(t *testing.T) {
	sess := setupAuthAndGame(t)
	base := "/api/games/" + strconv.FormatInt(sess.GameID, 10)
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/arpenteur", nil); rr.Code != http.StatusNotFound {
		t.Fatalf("partie classique : 404 attendu, obtenu %d", rr.Code)
	}
	// Une partie non GEMMA ne peut pas passer en mode Arpenteur.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, base, map[string]string{"gemmaVariant": "arpenteur"}); rr.Code != http.StatusBadRequest {
		t.Fatalf("400 attendu, obtenu %d", rr.Code)
	}
}

func TestArpenteurPermissionsAndBroadcast(t *testing.T) {
	sess := arpenteurGame(t, setupAuthAndGame(t))
	srv := httptest.NewServer(sess.Handler)
	defer srv.Close()
	base := "/api/games/" + strconv.FormatInt(sess.GameID, 10) + "/arpenteur"
	captain := joinAsPlayer(t, sess, "Luc")
	surgeon := joinAsPlayer(t, sess, "Ehouann")
	captainID, surgeonID := userID(t, sess, captain), userID(t, sess, surgeon)

	rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("get: %d %s", rr.Code, rr.Body.String())
	}
	doc := decodeArpenteur(t, rr).Arpenteur
	if doc.Build.Allure != "protector" || len(doc.Combat.Decks) != 3 {
		t.Fatalf("arpenteur par défaut attendu : %+v", doc.Build)
	}

	// Sans poste, un joueur ne modifie rien.
	if rr := doJSON(t, sess.Handler, captain, http.MethodPatch, base, map[string]any{"section": "hold", "value": doc.Hold}); rr.Code != http.StatusForbidden {
		t.Fatalf("403 attendu sans poste, obtenu %d", rr.Code)
	}

	// Le MJ affecte les postes : Luc capitaine, Ehouann chirurgien, un PNJ canonnier.
	crew := doc.Crew
	crew.Members = []arpenteur.Member{
		{ID: "malrik", Name: "Malrik", PC: true, UserID: &captainID, Post: "Capitaine"},
		{ID: "ssythik", Name: "Ssythik Dzan", PC: true, UserID: &surgeonID, Post: "Chirurgien"},
		{ID: "ehpu", Name: "Ehpu-Ki", Post: "Maître canonnier", Vie: 21, VieMax: 21},
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, base, map[string]any{"section": "crew", "value": crew}); rr.Code != http.StatusOK {
		t.Fatalf("crew: %d %s", rr.Code, rr.Body.String())
	}

	pc := dialGame(t, srv, surgeon, sess.GameID)
	snap := readUntil(t, pc, "sync.snapshot")
	var s struct {
		State struct {
			Game      snapshotGame      `json:"game"`
			Arpenteur *arpenteurPayload `json:"arpenteur"`
		} `json:"state"`
	}
	_ = json.Unmarshal(snap.Payload, &s)
	if s.State.Game.GemmaVariant != "arpenteur" || s.State.Arpenteur == nil || len(s.State.Arpenteur.Arpenteur.Crew.Members) != 3 {
		t.Fatalf("l'instantané doit contenir l'arpenteur : %+v", s.State.Game)
	}

	// Le capitaine prend la relève sur les canons (le canonnier est un PNJ) et tire.
	combat := doc.Combat
	combat.Decks[0].Guns.A1 = arpenteur.Battery{Slots: 6, Installed: 4, Loaded: 2, Primed: 2}
	combat.LastSalvo = &arpenteur.Salvo{ID: 42, Guns: 2, Ammo: "Boulets de canon", By: "Quelqu'un d'autre"}
	rr = doJSON(t, sess.Handler, captain, http.MethodPatch, base, map[string]any{"section": "combat", "value": combat, "log": "Salve de 2 canons"})
	if rr.Code != http.StatusOK {
		t.Fatalf("combat (relève du capitaine): %d %s", rr.Code, rr.Body.String())
	}
	var ev arpenteurPayload
	_ = json.Unmarshal(readUntil(t, pc, "arpenteur.state").Payload, &ev)
	if ev.Arpenteur.Combat.LastSalvo == nil || ev.Arpenteur.Combat.LastSalvo.By != "Luc" || ev.Arpenteur.Combat.LastSalvo.At == "" {
		t.Fatalf("salve signée par le serveur attendue : %+v", ev.Arpenteur.Combat.LastSalvo)
	}
	if n := len(ev.Arpenteur.Log); n == 0 || ev.Arpenteur.Log[n-1].Text != "Salve de 2 canons" || ev.Arpenteur.Log[n-1].By != "Luc" {
		t.Fatalf("journal de bord : %+v", ev.Arpenteur.Log)
	}

	// Le chirurgien soigne mais ne touche pas aux canons.
	if rr := doJSON(t, sess.Handler, surgeon, http.MethodPatch, base, map[string]any{"section": "combat", "value": combat}); rr.Code != http.StatusForbidden {
		t.Fatalf("403 attendu pour le chirurgien sur les canons, obtenu %d", rr.Code)
	}
	heal := []arpenteur.HealthUpdate{{ID: "ehpu", Vie: 15, Fatigue: 3}}
	if rr := doJSON(t, sess.Handler, surgeon, http.MethodPatch, base, map[string]any{"section": "crewHealth", "value": heal}); rr.Code != http.StatusOK {
		t.Fatalf("soins: %d %s", rr.Code, rr.Body.String())
	}

	// Repère caché : visible du MJ seulement.
	mp := ev.Arpenteur.Map
	x, y := 0.4, 0.6
	mp.Markers = []arpenteur.Marker{{ID: "repaire", Label: "Repaire", Hidden: true, X: &x, Y: &y}}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, base, map[string]any{"section": "map", "value": mp}); rr.Code != http.StatusOK {
		t.Fatalf("map: %d", rr.Code)
	}
	if got := decodeArpenteur(t, doJSON(t, sess.Handler, surgeon, http.MethodGet, base, nil)).Arpenteur.Map.Markers; len(got) != 0 {
		t.Fatalf("repère caché envoyé au joueur : %+v", got)
	}
	if got := decodeArpenteur(t, doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base, nil)).Arpenteur; len(got.Map.Markers) != 1 || got.Crew.Members[2].Vie != 15 {
		t.Fatalf("état MJ : %+v", got.Map.Markers)
	}

	// Les droits sont réservés au MJ.
	if rr := doJSON(t, sess.Handler, captain, http.MethodPatch, base, map[string]any{"section": "permissions", "value": arpenteur.DefaultPermissions()}); rr.Code != http.StatusForbidden {
		t.Fatalf("403 attendu, obtenu %d", rr.Code)
	}
}

func TestArpenteurImportCSV(t *testing.T) {
	sess := arpenteurGame(t, setupAuthAndGame(t))
	base := "/api/games/" + strconv.FormatInt(sess.GameID, 10) + "/arpenteur"
	player := joinAsPlayer(t, sess, "Luc")

	csv := strings.Join([]string{
		"Nom;Race;Poste affecté;Poste Adéquat;Vie;Fatigue;Respect",
		"Malrik (Luc);Humain;Capitaine;Capitaine;;;",
		"Sahnara;Léonin;Chirurgien;Chirurgien;21;0;10",
	}, "\n")
	upload := func(cookies []*http.Cookie, name, content string) *httptest.ResponseRecorder {
		body := &bytes.Buffer{}
		w := multipart.NewWriter(body)
		part, _ := w.CreateFormFile("file", name)
		_, _ = part.Write([]byte(content))
		w.Close()
		req := httptest.NewRequest(http.MethodPost, base+"/import", body)
		req.Header.Set("Content-Type", w.FormDataContentType())
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rr := httptest.NewRecorder()
		sess.Handler.ServeHTTP(rr, req)
		return rr
	}
	if rr := upload(player, "equipage.csv", csv); rr.Code != http.StatusForbidden {
		t.Fatalf("import réservé au MJ : %d", rr.Code)
	}
	if rr := upload(sess.Cookies, "notes.txt", "bonjour"); rr.Code != http.StatusBadRequest {
		t.Fatalf("un texte n'est pas un classeur : %d", rr.Code)
	}
	rr := upload(sess.Cookies, "equipage.csv", csv)
	if rr.Code != http.StatusOK {
		t.Fatalf("import: %d %s", rr.Code, rr.Body.String())
	}
	var res struct {
		Summary   arpenteur.ImportSummary `json:"summary"`
		Arpenteur arpenteur.Doc           `json:"arpenteur"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&res)
	if res.Summary.Crew != 2 || len(res.Arpenteur.Crew.Members) != 2 {
		t.Fatalf("équipage importé : %+v", res.Summary)
	}
	malrik := res.Arpenteur.Crew.Members[0]
	if malrik.Name != "Malrik" || malrik.UserID == nil || *malrik.UserID != userID(t, sess, player) {
		t.Fatalf("Malrik relié au joueur Luc attendu : %+v", malrik)
	}
	// Relié comme capitaine, le joueur gère maintenant l'équipage.
	crew := res.Arpenteur.Crew
	crew.Capacity = 9
	if rr := doJSON(t, sess.Handler, player, http.MethodPatch, base, map[string]any{"section": "crew", "value": crew}); rr.Code != http.StatusOK {
		t.Fatalf("le capitaine gère l'équipage : %d %s", rr.Code, rr.Body.String())
	}
}

// L'aventure Eternita est conservée ; une aventure inconnue retombe sur la
// table libre, et Eternita n'ouvre pas l'arpenteur.
func TestGemmaVariantEternita(t *testing.T) {
	sess := setupAuthAndGame(t)
	create := func(v string) (int64, string) {
		rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/games",
			map[string]any{"name": "Partie", "isGemma": true, "gemmaVariant": v})
		if rr.Code != http.StatusCreated {
			t.Fatalf("create %q: %d %s", v, rr.Code, rr.Body.String())
		}
		var resp struct {
			Game struct {
				ID           int64  `json:"id"`
				GemmaVariant string `json:"gemmaVariant"`
			} `json:"game"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		return resp.Game.ID, resp.Game.GemmaVariant
	}
	id, v := create("eternita")
	if v != "eternita" {
		t.Fatalf("eternita attendu, obtenu %q", v)
	}
	if _, v := create("inconnue"); v != "" {
		t.Fatalf("aventure inconnue : table libre attendue, obtenu %q", v)
	}
	base := "/api/games/" + strconv.FormatInt(id, 10)
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/arpenteur", nil); rr.Code != http.StatusNotFound {
		t.Fatalf("Eternita : pas d'arpenteur, 404 attendu, obtenu %d", rr.Code)
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, base, map[string]string{"gemmaVariant": "arpenteur"}); rr.Code != http.StatusOK {
		t.Fatalf("passage à l'arpenteur : %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, base, map[string]string{"gemmaVariant": "eternita"}); rr.Code != http.StatusOK {
		t.Fatalf("retour à Eternita : %d %s", rr.Code, rr.Body.String())
	}
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodGet, base+"/arpenteur", nil); rr.Code != http.StatusNotFound {
		t.Fatalf("retour à Eternita : 404 attendu, obtenu %d", rr.Code)
	}
}
