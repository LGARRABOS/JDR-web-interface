package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strconv"
	"testing"

	"jdr-backend/internal/domain"
)

func TestElementForPlayers(t *testing.T) {
	hp := 12
	e := &domain.GameElement{
		ID: 1, Name: "Gobelin", ImageURL: "/img.png", Description: "Petit et vicieux",
		UniqueTrait: "Fourbe", Loot: "3 pièces d'or", MaxHp: &hp,
		PlayerFields: defaultPlayerFields,
	}
	p := elementForPlayers(e)
	if p.Name != "Gobelin" || p.ImageURL != "/img.png" || p.Description != "Petit et vicieux" {
		t.Fatalf("les rubriques par défaut doivent être visibles : %+v", p)
	}
	if p.Loot != "" || p.UniqueTrait != "" || p.MaxHp != nil {
		t.Fatalf("butin, trait et statistiques doivent rester cachés : %+v", p)
	}

	e.PlayerFields = []string{FieldLoot}
	p = elementForPlayers(e)
	if p.Name != "Créature inconnue" || p.ImageURL != "" || p.Loot != "3 pièces d'or" {
		t.Fatalf("seul le butin doit être visible : %+v", p)
	}
}

func TestNormalizePlayerFields(t *testing.T) {
	got := normalizePlayerFields([]string{"loot", "inconnu", "name", "loot"})
	if want := []string{"name", "loot"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("obtenu %v, attendu %v", got, want)
	}
	if got := normalizePlayerFields(nil); got == nil || len(got) != 0 {
		t.Fatalf("une liste vide doit rester une liste vide, obtenu %#v", got)
	}
}

// Un joueur ne voit ni les PV des ennemis ni leur fiche, sauf une fois le
// monstre vaincu, et alors seulement les rubriques choisies par le MJ.
func TestMonsterSheetVisibleToPlayersWhenDefeated(t *testing.T) {
	origDir, _ := os.Getwd()
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })

	sess := setupAuthAndGame(t)
	gameID := strconv.FormatInt(sess.GameID, 10)
	mapID := strconv.FormatInt(sess.MapID, 10)

	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, _ := w.CreateFormFile("file", "gobelin.png")
	_, _ = part.Write(minimalPNG)
	_ = w.WriteField("name", "Gobelin")
	_ = w.WriteField("category", "monster")
	w.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/games/"+gameID+"/elements/upload", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", rr.Code, rr.Body.String())
	}
	var up struct {
		Element struct {
			ID           int64    `json:"id"`
			PlayerFields []string `json:"playerFields"`
		} `json:"element"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&up)
	if !reflect.DeepEqual(up.Element.PlayerFields, defaultPlayerFields) {
		t.Fatalf("rubriques par défaut attendues, obtenu %v", up.Element.PlayerFields)
	}
	elementPath := "/api/games/" + gameID + "/elements/" + strconv.FormatInt(up.Element.ID, 10)

	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, elementPath,
		map[string]any{"description": "Petit et vicieux", "loot": "3 pièces d'or"}); rr.Code != http.StatusOK {
		t.Fatalf("patch element: %d %s", rr.Code, rr.Body.String())
	}

	rr = doJSON(t, sess.Handler, sess.Cookies, http.MethodPost, "/api/maps/"+mapID+"/tokens", map[string]any{
		"kind": "PNJ", "name": "Gobelin", "x": 10, "y": 10, "hp": 10, "maxHp": 10,
		"elementId": up.Element.ID, "visibleToPlayers": true,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create token: %d %s", rr.Code, rr.Body.String())
	}
	var created struct {
		Token struct{ ID int64 } `json:"token"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&created)

	player := joinAsPlayer(t, sess, "Bob")

	// Vivant : fiche refusée et PV cachés.
	if rr := doJSON(t, sess.Handler, player, http.MethodGet, elementPath, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("fiche d'un monstre vivant : %d, attendu 403", rr.Code)
	}
	rr = doJSON(t, sess.Handler, player, http.MethodGet, "/api/maps/"+mapID+"/tokens", nil)
	var list struct {
		Tokens []map[string]any `json:"tokens"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&list)
	for _, tk := range list.Tokens {
		if tk["kind"] == "PNJ" {
			if _, ok := tk["hp"]; ok {
				t.Fatalf("les PV d'un ennemi ne doivent pas être envoyés aux joueurs : %v", tk)
			}
		}
	}

	// Vaincu : rubriques par défaut seulement.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch,
		"/api/tokens/"+strconv.FormatInt(created.Token.ID, 10), map[string]any{"hp": 0}); rr.Code != http.StatusOK {
		t.Fatalf("patch token: %d %s", rr.Code, rr.Body.String())
	}
	rr = doJSON(t, sess.Handler, player, http.MethodGet, elementPath, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("fiche d'un monstre vaincu : %d %s", rr.Code, rr.Body.String())
	}
	var sheet struct {
		Element map[string]any `json:"element"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&sheet)
	if sheet.Element["name"] != "Gobelin" || sheet.Element["description"] != "Petit et vicieux" {
		t.Fatalf("nom et description attendus : %v", sheet.Element)
	}
	if _, ok := sheet.Element["loot"]; ok {
		t.Fatalf("le butin doit rester caché par défaut : %v", sheet.Element)
	}

	// Le MJ montre le butin.
	if rr := doJSON(t, sess.Handler, sess.Cookies, http.MethodPatch, elementPath,
		map[string]any{"playerFields": []string{"name", "loot"}}); rr.Code != http.StatusOK {
		t.Fatalf("patch playerFields: %d %s", rr.Code, rr.Body.String())
	}
	rr = doJSON(t, sess.Handler, player, http.MethodGet, elementPath, nil)
	sheet.Element = nil
	_ = json.NewDecoder(rr.Body).Decode(&sheet)
	if sheet.Element["loot"] != "3 pièces d'or" {
		t.Fatalf("le butin doit être visible : %v", sheet.Element)
	}
	if _, ok := sheet.Element["description"]; ok {
		t.Fatalf("la description ne doit plus être visible : %v", sheet.Element)
	}
}
