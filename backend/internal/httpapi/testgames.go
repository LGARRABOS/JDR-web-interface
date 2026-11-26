package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/adventures/arpenteur"
	"jdr-backend/internal/domain"
)

// Parties test : le MJ y ajoute des joueurs fictifs qu'il peut incarner
// (voir getSessionUser), remet la partie à zéro ou la remplit avec des
// données d'exemple. Personne d'autre ne peut la rejoindre.

const maxTestPlayers = 8

func (s *Server) registerTestRoutes() {
	s.mux.Route("/api/games/{id}/test", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", s.handleTestState)
		r.Post("/players", s.handleTestAddPlayer)
		r.Patch("/players/{userId}", s.handleTestUpdatePlayer)
		r.Delete("/players/{userId}", s.handleTestRemovePlayer)
		r.Post("/reset", s.handleTestReset)
		r.Post("/sample", s.handleTestSample)
	})
}

func (s *Server) isTestGame(gameID int64) bool {
	var t int
	_ = s.db.QueryRow("SELECT COALESCE(is_test, 0) FROM games WHERE id = ?", gameID).Scan(&t)
	return t == 1
}

// testGame vérifie que la requête vient du MJ (compte réel, même s'il
// incarne un joueur fictif) d'une partie test.
func (s *Server) testGame(w http.ResponseWriter, r *http.Request) (int64, *domain.User, bool) {
	u := s.getRealSessionUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Non authentifié"})
		return 0, nil, false
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return 0, nil, false
	}
	var owner int64
	var isTest int
	if err := s.db.QueryRow("SELECT owner_id, COALESCE(is_test, 0) FROM games WHERE id = ?", id).Scan(&owner, &isTest); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Partie introuvable"})
		return 0, nil, false
	}
	if owner != u.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return 0, nil, false
	}
	if isTest != 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Ce n'est pas une partie test"})
		return 0, nil, false
	}
	return id, u, true
}

type testPlayer struct {
	UserID        int64  `json:"userId"`
	DisplayName   string `json:"displayName"`
	CharacterName string `json:"characterName"`
}

func (s *Server) testPlayers(gameID int64) []testPlayer {
	rows, err := s.db.Query(`
		SELECT u.id, u.display_name, COALESCE(gp.character_name, '')
		FROM users u JOIN game_players gp ON gp.user_id = u.id AND gp.game_id = u.bot_game_id
		WHERE u.bot_game_id = ? ORDER BY u.id`, gameID)
	if err != nil {
		return []testPlayer{}
	}
	defer rows.Close()
	out := []testPlayer{}
	for rows.Next() {
		var p testPlayer
		if rows.Scan(&p.UserID, &p.DisplayName, &p.CharacterName) == nil {
			out = append(out, p)
		}
	}
	return out
}

func (s *Server) handleTestState(w http.ResponseWriter, r *http.Request) {
	id, _, ok := s.testGame(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"players": s.testPlayers(id)})
}

type testPlayerReq struct {
	DisplayName   *string `json:"displayName"`
	CharacterName *string `json:"characterName"`
}

func cleanName(v *string, fallback string, max int) string {
	if v == nil {
		return fallback
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return fallback
	}
	if r := []rune(t); len(r) > max {
		t = string(r[:max])
	}
	return t
}

// addTestPlayer crée un compte fictif (sans mot de passe utilisable) et
// l'inscrit comme joueur ; il disparaît avec la partie.
func (s *Server) addTestPlayer(gameID, ownerID int64, name, character string) (testPlayer, error) {
	var n int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM users WHERE bot_game_id = ?", gameID).Scan(&n)
	if n >= maxTestPlayers {
		return testPlayer{}, fmt.Errorf("au plus %d joueurs fictifs", maxTestPlayers)
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	email := fmt.Sprintf("test-%d-%s@partie-test.invalid", gameID, hex.EncodeToString(b))
	var uid int64
	if err := s.db.QueryRow(
		"INSERT INTO users (email, password_hash, display_name, bot_game_id, bot_owner_id) VALUES (?, '!', ?, ?, ?) RETURNING id",
		email, name, gameID, ownerID,
	).Scan(&uid); err != nil {
		return testPlayer{}, err
	}
	if _, err := s.db.Exec("INSERT INTO game_players (game_id, user_id, role, character_name) VALUES (?, ?, 'PLAYER', ?)", gameID, uid, character); err != nil {
		_, _ = s.db.Exec("DELETE FROM users WHERE id = ?", uid)
		return testPlayer{}, err
	}
	return testPlayer{UserID: uid, DisplayName: name, CharacterName: character}, nil
}

func (s *Server) handleTestAddPlayer(w http.ResponseWriter, r *http.Request) {
	id, u, ok := s.testGame(w, r)
	if !ok {
		return
	}
	var req testPlayerReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	n := len(s.testPlayers(id)) + 1
	name := cleanName(req.DisplayName, fmt.Sprintf("Joueur test %d", n), 40)
	p, err := s.addTestPlayer(id, u.ID, name, cleanName(req.CharacterName, "", 60))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Impossible d'ajouter le joueur : " + err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"player": p})
	s.hub.Broadcast(id, "game.reload", map[string]string{"reason": "players"})
}

func (s *Server) testPlayerID(w http.ResponseWriter, r *http.Request, gameID int64) (int64, bool) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "userId"), 10, 64)
	if err == nil {
		var x int
		if s.db.QueryRow("SELECT 1 FROM users WHERE id = ? AND bot_game_id = ?", uid, gameID).Scan(&x) == nil {
			return uid, true
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"message": "Joueur fictif introuvable"})
	return 0, false
}

func (s *Server) handleTestUpdatePlayer(w http.ResponseWriter, r *http.Request) {
	id, _, ok := s.testGame(w, r)
	if !ok {
		return
	}
	uid, ok := s.testPlayerID(w, r, id)
	if !ok {
		return
	}
	var req testPlayerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.DisplayName != nil {
		if name := cleanName(req.DisplayName, "", 40); name != "" {
			_, _ = s.db.Exec("UPDATE users SET display_name = ? WHERE id = ?", name, uid)
		}
	}
	if req.CharacterName != nil {
		_ = s.setCharacterName(id, uid, cleanName(req.CharacterName, "", 60))
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"players": s.testPlayers(id)})
	s.hub.Broadcast(id, "game.reload", map[string]string{"reason": "players"})
}

func (s *Server) handleTestRemovePlayer(w http.ResponseWriter, r *http.Request) {
	id, _, ok := s.testGame(w, r)
	if !ok {
		return
	}
	uid, ok := s.testPlayerID(w, r, id)
	if !ok {
		return
	}
	if _, err := s.db.Exec("DELETE FROM users WHERE id = ? AND bot_game_id = ?", uid, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"players": s.testPlayers(id)})
	s.hub.Broadcast(id, "game.reload", map[string]string{"reason": "players"})
}

func removeGameUploads(gameID int64) {
	g := strconv.FormatInt(gameID, 10)
	for _, base := range []string{uploadsMapsBase, uploadsElementsBase, uploadsArpenteurBase, uploadsHandoutsBase, uploadsMusicBase, uploadsSheetsBase, uploadsAvatarsBase} {
		_ = os.RemoveAll(filepath.Join(base, g))
	}
}

// resetTestGame efface le contenu de la partie ; les joueurs fictifs restent.
func (s *Server) resetTestGame(gameID int64) error {
	stmts := []string{
		"UPDATE games SET current_map_id = NULL WHERE id = ?",
		"DELETE FROM tokens WHERE owner_user_id IN (SELECT id FROM users WHERE bot_game_id = ?)",
		"DELETE FROM maps WHERE game_id = ?",
		"DELETE FROM game_messages WHERE game_id = ?",
		"DELETE FROM dice_rolls WHERE game_id = ?",
		"DELETE FROM game_character_sheets WHERE game_id = ?",
		"DELETE FROM game_elements WHERE game_id = ?",
		"DELETE FROM handouts WHERE game_id = ?",
		"DELETE FROM game_notes WHERE game_id = ?",
		"DELETE FROM game_music WHERE game_id = ?",
		"DELETE FROM arpenteurs WHERE game_id = ?",
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q, gameID); err != nil {
			return err
		}
	}
	removeGameUploads(gameID)
	return nil
}

func (s *Server) handleTestReset(w http.ResponseWriter, r *http.Request) {
	id, _, ok := s.testGame(w, r)
	if !ok {
		return
	}
	if err := s.resetTestGame(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Partie remise à zéro"})
	s.hub.Broadcast(id, "game.reload", map[string]string{"reason": "reset"})
}

func (s *Server) handleTestSample(w http.ResponseWriter, r *http.Request) {
	id, u, ok := s.testGame(w, r)
	if !ok {
		return
	}
	if err := s.seedTestGame(id, u.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Données d'exemple : " + err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Données d'exemple ajoutées"})
	s.hub.Broadcast(id, "game.reload", map[string]string{"reason": "sample"})
}

// --- Données d'exemple -----------------------------------------------------------

var samplePlayers = []struct{ name, character, color, post string }{
	{"Aria (test)", "Aria Ventelame", "#3b82f6", "Capitaine"},
	{"Brom (test)", "Brom Tisonfer", "#f59e0b", "Maître canonnier"},
	{"Cyra (test)", "Cyra Lunefeuille", "#10b981", "Guetteur"},
}

// seedTestGame : trois joueurs fictifs, une carte avec leurs jetons et deux
// monstres, un document, un message ; le navire s'il s'agit d'un arpenteur.
func (s *Server) seedTestGame(gameID, ownerID int64) error {
	players := s.testPlayers(gameID)
	for i := len(players); i < len(samplePlayers); i++ {
		p, err := s.addTestPlayer(gameID, ownerID, samplePlayers[i].name, samplePlayers[i].character)
		if err != nil {
			return err
		}
		players = append(players, p)
	}

	// Carte.
	dir := filepath.Join(uploadsMapsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	const mw, mh = 1600, 1200
	fname := fmt.Sprintf("%d_carte-exemple.png", time.Now().UnixNano())
	if err := os.WriteFile(filepath.Join(dir, fname), sampleMapPNG(mw, mh), 0o644); err != nil {
		return err
	}
	var mapID int64
	if err := s.db.QueryRow(
		"INSERT INTO maps (game_id, name, image_url, width, height, grid_size, tags) VALUES (?, ?, ?, ?, ?, 50, '[\"exemple\"]') RETURNING id",
		gameID, "Clairière d'exemple", "/api/games/"+strconv.FormatInt(gameID, 10)+"/maps/file/"+fname, mw, mh,
	).Scan(&mapID); err != nil {
		return err
	}
	_, _ = s.db.Exec("UPDATE games SET current_map_id = ? WHERE id = ? AND current_map_id IS NULL", mapID, gameID)

	// Jetons des joueurs fictifs.
	for i, p := range players {
		c := samplePlayers[i%len(samplePlayers)].color
		_, _ = s.db.Exec(
			`INSERT INTO tokens (map_id, created_by, owner_user_id, kind, name, color, x, y, visible_to_players, hp, max_hp, mana, max_mana)
			 VALUES (?, ?, ?, 'PJ', ?, ?, ?, ?, 1, 20, 20, 10, 10)`,
			mapID, ownerID, p.UserID, firstNonEmpty(p.CharacterName, p.DisplayName), c, 425+float64(i)*50, 825,
		)
	}

	// Monstres du bestiaire et leurs jetons.
	edir := filepath.Join(uploadsElementsBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(edir, 0o755); err != nil {
		return err
	}
	monsters := []struct {
		name  string
		col   color.RGBA
		hp    int
		x, y  float64
		trait string
	}{
		{"Gobelin d'exemple", color.RGBA{86, 140, 60, 255}, 8, 1125, 375, "Fuit quand il est seul."},
		{"Loup des sables", color.RGBA{176, 128, 70, 255}, 14, 1225, 475, "Attaque en meute."},
	}
	for i, m := range monsters {
		ename := fmt.Sprintf("%d_monstre-%d.png", time.Now().UnixNano(), i)
		if err := os.WriteFile(filepath.Join(edir, ename), sampleIconPNG(m.col), 0o644); err != nil {
			return err
		}
		url := "/api/games/" + strconv.FormatInt(gameID, 10) + "/elements/file/" + ename
		var eid int64
		if err := s.db.QueryRow(
			"INSERT INTO game_elements (game_id, user_id, name, image_url, category, tags, max_hp, unique_trait) VALUES (?, ?, ?, ?, 'monster', '[\"exemple\"]', ?, ?) RETURNING id",
			gameID, ownerID, m.name, url, m.hp, m.trait,
		).Scan(&eid); err != nil {
			return err
		}
		_, _ = s.db.Exec(
			`INSERT INTO tokens (map_id, created_by, kind, name, color, icon_url, x, y, visible_to_players, hp, max_hp, element_id)
			 VALUES (?, ?, 'PNJ', ?, '#b91c1c', ?, ?, ?, 1, ?, ?, ?)`,
			mapID, ownerID, m.name, url, m.x, m.y, m.hp, m.hp, eid,
		)
	}

	// Un document à montrer et un message de bienvenue.
	_, _ = s.db.Exec(
		"INSERT INTO handouts (game_id, title, body, image_url, kind, file_url, file_name) VALUES (?, ?, ?, '', 'text', '', '')",
		gameID, "Lettre d'exemple", "Ceci est un document de test : montrez-le aux joueurs depuis l'onglet Documents.",
	)
	_, _ = s.db.Exec(
		"INSERT INTO game_messages (game_id, user_id, role, content) VALUES (?, ?, 'MJ', ?)",
		gameID, ownerID, "Partie test prête : utilisez le bouton « Test » pour incarner un joueur fictif.",
	)

	// Navire de l'arpenteur.
	var variant string
	_ = s.db.QueryRow("SELECT COALESCE(gemma_variant, '') FROM games WHERE id = ?", gameID).Scan(&variant)
	if variant == gemmaVariantArpenteur {
		unlock := lockArpenteur(gameID)
		defer unlock()
		d, _, err := s.loadArpenteur(gameID)
		if err != nil {
			return err
		}
		if d.Name == "" || len(d.Crew.Members) == 0 {
			d.Name = "Arpenteur d'exemple"
			for i, p := range players {
				uid := p.UserID
				d.Crew.Members = append(d.Crew.Members, arpenteur.Member{
					ID: arpenteur.NewID(), Name: firstNonEmpty(p.CharacterName, p.DisplayName), PlayerName: p.DisplayName,
					PC: true, UserID: &uid, Post: samplePlayers[i%len(samplePlayers)].post,
					Loyalty: "Loyal", Combat: 2, Extraction: 1, Entretien: 1, Expertise: 2, Vie: 20, VieMax: 20,
				})
			}
			for _, n := range []struct{ name, post string }{{"Malrik", "Contremaître"}, {"Pip", "Mousse"}} {
				d.Crew.Members = append(d.Crew.Members, arpenteur.Member{
					ID: arpenteur.NewID(), Name: n.name, Post: n.post, Loyalty: "Neutre",
					Combat: 1, Extraction: 2, Entretien: 2, Expertise: 1, Vie: 12, VieMax: 12,
				})
			}
			for _, it := range []struct {
				name   string
				weight float64
			}{{"Caisse de vivres", 5}, {"Tonneau d'eau", 8}, {"Pièces de rechange", 3}} {
				d.Hold.Items = append(d.Hold.Items, arpenteur.Item{ID: arpenteur.NewID(), Type: "Ressource", Name: it.name, Weight: it.weight, Rarity: "Commun"})
			}
			arpenteur.Normalize(&d)
			if _, err := s.saveArpenteur(gameID, d); err != nil {
				return err
			}
		}
	}
	return nil
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// --- Images générées --------------------------------------------------------------

func hashNoise(x, y int, seed uint32) float64 {
	h := uint32(x)*374761393 + uint32(y)*668265263 + seed*2246822519
	h = (h ^ (h >> 13)) * 1274126177
	return float64(h^(h>>16)) / float64(^uint32(0))
}

func valueNoise(x, y float64, seed uint32) float64 {
	x0, y0 := int(math.Floor(x)), int(math.Floor(y))
	fx, fy := x-float64(x0), y-float64(y0)
	fx, fy = fx*fx*(3-2*fx), fy*fy*(3-2*fy)
	a := hashNoise(x0, y0, seed)
	b := hashNoise(x0+1, y0, seed)
	c := hashNoise(x0, y0+1, seed)
	d := hashNoise(x0+1, y0+1, seed)
	return a + (b-a)*fx + (c-a)*fy + (a-b-c+d)*fx*fy
}

func mixC(a, b color.RGBA, t float64) color.RGBA {
	t = math.Max(0, math.Min(1, t))
	l := func(x, y uint8) uint8 { return uint8(float64(x) + (float64(y)-float64(x))*t) }
	return color.RGBA{l(a.R, b.R), l(a.G, b.G), l(a.B, b.B), 255}
}

// sampleMapPNG dessine une clairière : herbe, chemin de terre, mare, arbres
// et ruine de pierre.
func sampleMapPNG(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	grass := color.RGBA{92, 128, 62, 255}
	grassD := color.RGBA{64, 98, 44, 255}
	dirt := color.RGBA{150, 116, 74, 255}
	water := color.RGBA{58, 104, 140, 255}
	stone := color.RGBA{128, 124, 116, 255}
	trees := [][3]float64{}
	for i := 0; i < 70; i++ {
		x := hashNoise(i, 1, 7) * float64(w)
		y := hashNoise(i, 2, 7) * float64(h)
		if math.Abs(y-(float64(h)*0.55+math.Sin(x/220)*120)) < 120 {
			continue
		}
		if x > 1000 && x < 1400 && y > 250 && y < 600 {
			continue
		}
		trees = append(trees, [3]float64{x, y, 26 + hashNoise(i, 3, 7)*22})
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			fx, fy := float64(x), float64(y)
			n := valueNoise(fx/90, fy/90, 1)*0.6 + valueNoise(fx/25, fy/25, 2)*0.4
			c := mixC(grassD, grass, n)
			// Chemin.
			py := float64(h)*0.55 + math.Sin(fx/220)*120
			dp := math.Abs(fy - py)
			if dp < 46+valueNoise(fx/30, 0, 3)*14 {
				c = mixC(dirt, color.RGBA{120, 92, 58, 255}, valueNoise(fx/12, fy/12, 4))
			}
			// Mare.
			ex, ey := (fx-330)/170, (fy-300)/110
			if r := ex*ex + ey*ey; r < 1 {
				c = mixC(water, color.RGBA{40, 78, 112, 255}, 1-r)
			} else if r < 1.18 {
				c = mixC(c, color.RGBA{110, 98, 70, 255}, 0.6)
			}
			// Ruine : murs de pierre.
			if fx > 1050 && fx < 1350 && fy > 300 && fy < 550 {
				wall := fx < 1075 || fx > 1325 || fy < 325 || (fy > 525 && (fx < 1150 || fx > 1250))
				if wall {
					c = mixC(stone, color.RGBA{96, 92, 86, 255}, valueNoise(fx/8, fy/8, 5))
				} else {
					c = mixC(color.RGBA{138, 126, 104, 255}, color.RGBA{118, 108, 90, 255}, valueNoise(fx/20, fy/20, 6))
				}
			}
			img.SetRGBA(x, y, c)
		}
	}
	// Arbres (ombre puis feuillage).
	for _, t := range trees {
		drawDisc(img, t[0]+8, t[1]+10, t[2], color.RGBA{30, 50, 24, 255}, 0.5)
		drawDisc(img, t[0], t[1], t[2], color.RGBA{44, 92, 40, 255}, 1)
		drawDisc(img, t[0]-t[2]*0.25, t[1]-t[2]*0.25, t[2]*0.55, color.RGBA{70, 124, 58, 255}, 0.8)
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func drawDisc(img *image.RGBA, cx, cy, r float64, c color.RGBA, alpha float64) {
	b := img.Bounds()
	for y := int(cy - r); y <= int(cy+r); y++ {
		for x := int(cx - r); x <= int(cx+r); x++ {
			if !(image.Point{x, y}.In(b)) {
				continue
			}
			d := math.Hypot(float64(x)-cx, float64(y)-cy)
			if d > r {
				continue
			}
			a := alpha * math.Min(1, (r-d)/1.5)
			img.SetRGBA(x, y, mixC(img.RGBAAt(x, y), c, a))
		}
	}
}

// sampleIconPNG : portrait rond de monstre (silhouette et yeux).
func sampleIconPNG(c color.RGBA) []byte {
	const s = 256
	img := image.NewRGBA(image.Rect(0, 0, s, s))
	drawDisc(img, 128, 128, 124, color.RGBA{30, 24, 20, 255}, 1)
	drawDisc(img, 128, 128, 116, mixC(c, color.RGBA{20, 20, 20, 255}, 0.35), 1)
	drawDisc(img, 128, 150, 78, c, 1)
	drawDisc(img, 128, 96, 52, mixC(c, color.RGBA{255, 255, 255, 255}, 0.12), 1)
	drawDisc(img, 108, 92, 10, color.RGBA{250, 220, 80, 255}, 1)
	drawDisc(img, 148, 92, 10, color.RGBA{250, 220, 80, 255}, 1)
	drawDisc(img, 108, 92, 4, color.RGBA{20, 10, 10, 255}, 1)
	drawDisc(img, 148, 92, 4, color.RGBA{20, 10, 10, 255}, 1)
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}
