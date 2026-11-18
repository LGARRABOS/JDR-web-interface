package arpenteur

import (
	"regexp"
	"strconv"
	"strings"

	"jdr-backend/internal/docimport"
)

// Import d'un classeur d'arpenteur (Excel, LibreOffice, CSV) : on retrouve
// les tableaux par leurs en-têtes (« Nom … Poste affecté », « Type Nom Effet
// Poids », « Constitution », « Canons A1 »…) plutôt que par des cases fixes,
// pour qu'un classeur légèrement modifié s'importe encore.

// PlayerRef : un joueur de la partie, pour relier « Malrik (Luc) » à Luc.
type PlayerRef struct {
	UserID int64
	Names  []string
}

// ImportResult : les sections trouvées dans le classeur (nil = absente).
type ImportResult struct {
	Name        string
	Number      int
	FormerOwner string
	HasTitle    bool
	Sector      string
	SectorName  string
	Expedition  *Expedition
	Crew        *Crew
	Combat      *Combat
	Hold        *Inventory
	Cave        *Inventory
	Summary     ImportSummary
}

type ImportSummary struct {
	Crew       int      `json:"crew"`
	Hold       int      `json:"hold"`
	Cave       int      `json:"cave"`
	Combat     bool     `json:"combat"`
	Expedition bool     `json:"expedition"`
	Ignored    []string `json:"ignored"`
}

// ImportContent analyse le classeur converti par docimport.
func ImportContent(c *docimport.Content, players []PlayerRef) ImportResult {
	var res ImportResult
	res.Summary.Ignored = []string{}
	for _, sh := range c.Sheets {
		key := FoldKey(sh.Name)
		if strings.Contains(key, "save") || strings.Contains(key, "sauvegarde") {
			res.Summary.Ignored = append(res.Summary.Ignored, sh.Name)
			continue
		}
		used := false
		if res.parseTitle(sh.Rows) {
			used = true
		}
		if hdr, cols := findHeader(sh.Rows, isCrewHeader); hdr >= 0 {
			res.parseCrew(sh.Rows, hdr, cols, players)
			res.parseExpedition(sh.Rows[:hdr])
			used = true
		}
		if res.parseCombat(sh.Rows) {
			used = true
		}
		if hdr, cols := findHeader(sh.Rows, isItemHeader); hdr >= 0 {
			inv := parseItems(sh.Rows, hdr, cols)
			if strings.Contains(key, "cave") || strings.Contains(key, "coffre") || strings.Contains(key, "stock") {
				inv.Title = strings.TrimSpace(strings.ReplaceAll(sh.Name, "_", " "))
				inv.Description = sheetDescription(sh.Rows[:hdr])
				NormalizeInventory(&inv, "Cave")
				res.Cave = mergeInventory(res.Cave, inv)
			} else {
				NormalizeInventory(&inv, "Cale")
				inv.Title = "Cale"
				res.Hold = mergeInventory(res.Hold, inv)
			}
			used = true
		}
		if !used {
			res.Summary.Ignored = append(res.Summary.Ignored, sh.Name)
		}
	}
	if res.Crew != nil {
		res.Summary.Crew = len(res.Crew.Members)
	}
	if res.Hold != nil {
		res.Summary.Hold = len(res.Hold.Items)
	}
	if res.Cave != nil {
		res.Summary.Cave = len(res.Cave.Items)
	}
	res.Summary.Combat = res.Combat != nil
	res.Summary.Expedition = res.Expedition != nil
	return res
}

// ApplyImport remplace les sections trouvées. Les membres déjà connus (même
// nom) gardent leur lien avec un joueur.
func (d *Doc) ApplyImport(r ImportResult) {
	if r.HasTitle {
		if r.Name != "" {
			d.Name = r.Name
		}
		if r.Number > 0 {
			d.Number = r.Number
		}
		d.FormerOwner = r.FormerOwner
	}
	if r.Expedition != nil {
		d.Expedition = *r.Expedition
	}
	if r.Sector != "" {
		d.Map.Sector = r.Sector
		if r.SectorName != "" {
			if d.Map.SectorNames == nil {
				d.Map.SectorNames = map[string]string{}
			}
			d.Map.SectorNames[strings.ToUpper(r.Sector)] = r.SectorName
		}
	}
	if r.Crew != nil {
		prev := map[string]Member{}
		for _, m := range d.Crew.Members {
			prev[FoldKey(m.Name)] = m
		}
		for i, m := range r.Crew.Members {
			if old, ok := prev[FoldKey(m.Name)]; ok {
				if m.UserID == nil {
					r.Crew.Members[i].UserID = old.UserID
				}
				r.Crew.Members[i].ID = old.ID
				if r.Crew.Members[i].Note == "" {
					r.Crew.Members[i].Note = old.Note
				}
			}
		}
		r.Crew.FatigueMax = d.Crew.FatigueMax
		if r.Crew.RespectMax == 0 {
			r.Crew.RespectMax = d.Crew.RespectMax
		}
		d.Crew = *r.Crew
	}
	if r.Combat != nil {
		d.Combat = *r.Combat
	}
	if r.Hold != nil {
		d.Hold = *r.Hold
	}
	if r.Cave != nil {
		d.Cave = *r.Cave
	}
	Normalize(d)
}

// --- Titre et expédition -----------------------------------------------------

var titleRe = regexp.MustCompile(`(?i)^\s*arpenteur\s*(\d*)\s*[-–:]?\s*["«“]?\s*([^"»”(]*?)\s*["»”]?\s*(?:\((.*)\))?\s*$`)

func (r *ImportResult) parseTitle(rows [][]string) bool {
	if r.HasTitle {
		return false
	}
	for i, row := range rows {
		if i > 3 {
			break
		}
		for _, cell := range row {
			if !strings.HasPrefix(FoldKey(cell), "arpenteur") || len([]rune(cell)) < 12 {
				continue
			}
			m := titleRe.FindStringSubmatch(cell)
			if m == nil {
				continue
			}
			r.HasTitle = true
			r.Number, _ = strconv.Atoi(m[1])
			r.Name = strings.TrimSpace(m[2])
			owner := strings.TrimSpace(m[3])
			lower := strings.ToLower(owner)
			for _, p := range []string{"contrôle de ", "controle de ", "commandement de "} {
				if j := strings.Index(lower, p); j >= 0 && j+len(p) <= len(owner) {
					owner = strings.TrimSpace(owner[j+len(p):])
					break
				}
			}
			r.FormerOwner = owner
			return true
		}
	}
	return false
}

func (r *ImportResult) parseExpedition(rows [][]string) {
	e := Expedition{}
	found := false
	for _, row := range rows {
		for ci := 0; ci < len(row); ci++ {
			cell := strings.TrimSpace(row[ci])
			if cell == "" || !strings.Contains(cell, ":") {
				continue
			}
			label, value := splitLabel(cell)
			// Valeur dans la case suivante (« Joueurs : » | « Naoué, … »).
			next := ""
			if ci+1 < len(row) && !strings.Contains(row[ci+1], ":") {
				next = strings.TrimSpace(row[ci+1])
			}
			key := FoldKey(label)
			switch {
			case strings.HasPrefix(key, "joueur"):
				e.Players = firstNonEmpty(value, next)
				found = true
			case strings.HasPrefix(key, "expedition"):
				e.Number = atoiLoose(value)
				found = true
			case strings.HasPrefix(key, "secteur"):
				r.Sector, r.SectorName = splitSector(firstNonEmpty(value, next))
				found = true
			case strings.HasPrefix(key, "coupon"):
				e.Coupons = atoiLoose(value)
				e.CouponsNote = next
				found = true
			case strings.HasPrefix(key, "quete"):
				e.PatronQuest = firstNonEmpty(value, next)
				found = true
			case key == "autre" || key == "autres":
				e.Other = firstNonEmpty(value, next)
				found = true
			case strings.HasPrefix(key, "respect"):
				if n, max, ok := fraction(value); ok {
					if r.Crew != nil {
						v := n
						r.Crew.RespectOverride = &v
						if max > 0 {
							r.Crew.RespectMax = max
						}
					}
				}
			default:
				if key != "" {
					e.Fields = append(e.Fields, Field{Label: label, Value: firstNonEmpty(value, next)})
					found = true
				}
			}
			if next != "" && !strings.HasPrefix(key, "secteur") {
				ci++ // la case suivante a servi de valeur
			}
		}
		// « Équipage (5/7 places) » : nombre de places.
		for _, cell := range row {
			k := FoldKey(cell)
			if strings.HasPrefix(k, "equipage") && strings.Contains(k, "place") && r.Crew != nil {
				if _, max, ok := fraction(cell); ok {
					r.Crew.Capacity = max
				}
			}
		}
	}
	if found {
		NormalizeExpedition(&e)
		r.Expedition = &e
	}
}

// splitSector : « M2, Le Désert du phare vert » → « M2 », « Le Désert du phare vert ».
func splitSector(v string) (string, string) {
	v = strings.TrimSpace(v)
	if v == "" || FoldKey(v) == "x" {
		return "", ""
	}
	for _, sep := range []string{",", " - ", " – ", ":"} {
		if i := strings.Index(v, sep); i > 0 {
			return strings.ToUpper(strings.TrimSpace(v[:i])), strings.TrimSpace(v[i+len(sep):])
		}
	}
	if len([]rune(v)) <= 4 {
		return strings.ToUpper(v), ""
	}
	return "", v
}

// --- Équipage ----------------------------------------------------------------

type colMap map[string]int

func (c colMap) get(row []string, name string) string {
	i, ok := c[name]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func isCrewHeader(row []string) colMap {
	cols := colMap{}
	for i, cell := range row {
		k := FoldKey(cell)
		switch {
		case k == "nom":
			cols["name"] = i
		case k == "sexe" || k == "genre":
			cols["sex"] = i
		case k == "race" || k == "espece":
			cols["race"] = i
		case strings.HasPrefix(k, "loyaute") || strings.HasPrefix(k, "faction"):
			cols["loyalty"] = i
		case k == "combat":
			cols["combat"] = i
		case strings.HasPrefix(k, "extraction"):
			cols["extraction"] = i
		case strings.HasPrefix(k, "entretien") || strings.HasPrefix(k, "reparation"):
			cols["entretien"] = i
		case strings.HasPrefix(k, "expertise"):
			cols["expertise"] = i
		case strings.HasPrefix(k, "posteaffecte") || k == "poste":
			cols["post"] = i
		case strings.HasPrefix(k, "posteadequat"):
			cols["good"] = i
		case strings.HasPrefix(k, "posteinadapte"):
			cols["bad"] = i
		case k == "prix":
			cols["price"] = i
		case strings.HasPrefix(k, "prixcoupon") || k == "coupons" || k == "coupon":
			cols["coupons"] = i
		case k == "vie" || k == "pv":
			cols["vie"] = i
		case k == "fatigue":
			cols["fatigue"] = i
		case k == "respect":
			cols["respect"] = i
		}
	}
	_, hasName := cols["name"]
	_, hasPost := cols["post"]
	if !hasName || !hasPost {
		return nil
	}
	return cols
}

var playerNameRe = regexp.MustCompile(`^\s*(.*?)\s*\(\s*([^)]*?)\s*\)\s*$`)

func (r *ImportResult) parseCrew(rows [][]string, hdr int, cols colMap, players []PlayerRef) {
	crew := Crew{Capacity: 7, RespectMax: 20, FatigueMax: 10}
	if r.Crew != nil {
		crew = *r.Crew
	}
	for _, row := range rows[hdr+1:] {
		name := cols.get(row, "name")
		if name == "" {
			break
		}
		m := Member{ID: NewID(), Name: name}
		if g := playerNameRe.FindStringSubmatch(name); g != nil && g[1] != "" {
			m.Name, m.PlayerName, m.PC = g[1], g[2], true
			m.UserID = matchPlayer(g[2], players)
		}
		m.Sex = cols.get(row, "sex")
		m.Race = cols.get(row, "race")
		m.Loyalty = cols.get(row, "loyalty")
		m.Combat = skillLevel(cols.get(row, "combat"))
		m.Extraction = skillLevel(cols.get(row, "extraction"))
		m.Entretien = skillLevel(cols.get(row, "entretien"))
		m.Expertise = skillLevel(cols.get(row, "expertise"))
		m.Post = CanonicalPost(cols.get(row, "post"))
		m.GoodPost = CanonicalPost(cols.get(row, "good"))
		m.BadPost = CanonicalPost(cols.get(row, "bad"))
		m.Price = cols.get(row, "price")
		m.Coupons = cols.get(row, "coupons")
		m.Vie = atoiLoose(cols.get(row, "vie"))
		m.VieMax = m.Vie
		m.Fatigue = atoiLoose(cols.get(row, "fatigue"))
		m.Respect = atoiLoose(cols.get(row, "respect"))
		crew.Members = append(crew.Members, m)
	}
	// « Équipage de sortie » : noms listés sous cette case.
	for i, row := range rows {
		for ci, cell := range row {
			if !strings.HasPrefix(FoldKey(cell), "equipagedesortie") {
				continue
			}
			for _, below := range rows[i+1:] {
				if ci >= len(below) || strings.TrimSpace(below[ci]) == "" {
					break
				}
				k := FoldKey(playerNameRe.ReplaceAllString(below[ci], "$1"))
				for mi := range crew.Members {
					if FoldKey(crew.Members[mi].Name) == k || FoldKey(below[ci]) == FoldKey(crew.Members[mi].Name) {
						crew.Members[mi].Sortie = true
					}
				}
			}
		}
	}
	r.Crew = &crew
}

// matchPlayer : « Mathis » ↔ joueur « Mathisss » (l'un commence par l'autre).
func matchPlayer(name string, players []PlayerRef) *int64 {
	k := FoldKey(name)
	if len(k) < 3 {
		return nil
	}
	var found *int64
	for _, p := range players {
		for _, n := range p.Names {
			pk := FoldKey(n)
			if len(pk) < 3 {
				continue
			}
			if strings.HasPrefix(pk, k) || strings.HasPrefix(k, pk) {
				if found != nil && *found != p.UserID {
					return nil // ambigu : le MJ reliera lui-même
				}
				id := p.UserID
				found = &id
			}
		}
	}
	return found
}

func skillLevel(v string) int {
	switch k := FoldKey(v); {
	case k == "":
		return 0
	case strings.HasPrefix(k, "faible"):
		return 1
	case strings.HasPrefix(k, "moyen"):
		return 2
	case strings.HasPrefix(k, "fort"):
		return 3
	case strings.HasPrefix(k, "expert"):
		return 4
	default:
		return clamp(atoiLoose(v), 0, 4)
	}
}

// --- Combat ------------------------------------------------------------------

func (r *ImportResult) parseCombat(rows [][]string) bool {
	if r.Combat != nil {
		return false
	}
	c := Combat{ConstitutionMax: 10, RepairPartsMax: 10, PowderReserveMax: 10}
	found := false
	for ri, row := range rows {
		for ci, cell := range row {
			k := FoldKey(cell)
			nextVal := func() string {
				for j := ci + 1; j < len(row) && j <= ci+2; j++ {
					if strings.TrimSpace(row[j]) != "" {
						return row[j]
					}
				}
				return ""
			}
			switch {
			case strings.HasPrefix(k, "constitution"):
				if n, max, ok := fraction(firstNonEmpty(afterColon(cell), nextVal())); ok {
					c.Constitution, c.ConstitutionMax = n, maxOr(max, 10)
					found = true
				}
			case strings.HasPrefix(k, "piecesdereparation") || strings.HasPrefix(k, "piecereparation"):
				if n, max, ok := fraction(firstNonEmpty(afterColon(cell), nextVal())); ok {
					c.RepairParts, c.RepairPartsMax = n, maxOr(max, 10)
					found = true
				}
			case strings.HasPrefix(k, "reservecale") || strings.HasPrefix(k, "reservedepoudre"):
				if n, max, ok := fraction(cell); ok {
					c.PowderReserve, c.PowderReserveMax = n, maxOr(max, 10)
					found = true
				}
			case strings.HasPrefix(k, "baril") && len(k) <= 8 && ri+1 < len(rows):
				below := rows[ri+1]
				if ci < len(below) {
					if n, max, ok := fraction(below[ci]); ok {
						c.Barrels = append(c.Barrels, Barrel{ID: NewID(), Uses: n, Max: maxOr(max, 5)})
						found = true
					}
				}
			case k == "type" && ci+1 < len(row) && FoldKey(row[ci+1]) == "nombre":
				for _, ar := range rows[ri+1:] {
					if ci+1 >= len(ar) || strings.TrimSpace(ar[ci]) == "" {
						break
					}
					name := strings.TrimSpace(ar[ci])
					c.Ammo = append(c.Ammo, Ammo{ID: ammoID(name), Name: name, Count: atoiLoose(ar[ci+1])})
					found = true
				}
			}
		}
		// Ligne d'en-tête des canons : trois groupes A1 A2 A3 (types, chargés, poudre).
		if groups := gunGroups(row); len(groups) > 0 {
			for _, dr := range rows[ri+1:] {
				if len(dr) == 0 || strings.TrimSpace(dr[0]) == "" {
					break
				}
				c.Decks = append(c.Decks, parseDeckRow(dr, groups))
				found = true
			}
		}
	}
	if !found {
		return false
	}
	NormalizeCombat(&c)
	r.Combat = &c
	return true
}

// gunGroups : pour chaque groupe (0 types, 1 armement, 2 poudre), la colonne
// de chaque type de canon.
func gunGroups(row []string) []map[string]int {
	groups := []map[string]int{}
	for i, cell := range row {
		k := FoldKey(cell)
		var t string
		switch k {
		case "canonsa1", "canona1", "a1":
			t = "A1"
		case "canonsa2", "canona2", "a2":
			t = "A2"
		case "canonsa3", "canona3", "a3":
			t = "A3"
		default:
			continue
		}
		if len(groups) == 0 || hasKey(groups[len(groups)-1], t) {
			groups = append(groups, map[string]int{})
		}
		groups[len(groups)-1][t] = i
	}
	if len(groups) == 0 || len(groups[0]) < 2 {
		return nil
	}
	return groups
}

func hasKey(m map[string]int, k string) bool {
	_, ok := m[k]
	return ok
}

func parseDeckRow(row []string, groups []map[string]int) Deck {
	raw := strings.TrimSpace(row[0])
	name, status := raw, ""
	if i := strings.Index(raw, "("); i > 0 {
		name = strings.TrimSpace(raw[:i])
		status = FoldKey(raw[i:])
	}
	d := Deck{ID: deckID(name), Name: name}
	cell := func(g int, t string) string {
		if g >= len(groups) {
			return ""
		}
		i, ok := groups[g][t]
		if !ok || i >= len(row) {
			return ""
		}
		return row[i]
	}
	for _, t := range []string{"A1", "A2", "A3"} {
		var b Battery
		if n, max, ok := fraction(cell(0, t)); ok {
			b.Installed, b.Slots = n, max
		}
		if n, _, ok := fraction(cell(1, t)); ok {
			b.Loaded = n
		}
		if n, _, ok := fraction(cell(2, t)); ok {
			b.Primed = n
		}
		switch t {
		case "A1":
			d.Guns.A1 = b
		case "A2":
			d.Guns.A2 = b
		case "A3":
			d.Guns.A3 = b
		}
	}
	switch {
	case strings.Contains(status, "impossible"):
		d.Available = false
	case strings.Contains(status, "possible"):
		d.Available = true
	default:
		d.Available = d.Guns.A1.Slots+d.Guns.A2.Slots+d.Guns.A3.Slots > 0
	}
	return d
}

func deckID(name string) string {
	switch k := FoldKey(name); {
	case strings.Contains(k, "grand"):
		return "grand"
	case strings.Contains(k, "superieur"):
		return "superieur"
	case strings.Contains(k, "souspont"):
		return "souspont"
	case strings.Contains(k, "inferieur"):
		return "inferieur"
	}
	return NewID()
}

func ammoID(name string) string {
	switch k := FoldKey(name); {
	case strings.Contains(k, "boulet"):
		return "boulets"
	case strings.Contains(k, "filet"):
		return "filets"
	}
	return NewID()
}

// --- Cale et cave ------------------------------------------------------------

func isItemHeader(row []string) colMap {
	cols := colMap{}
	for i, cell := range row {
		k := FoldKey(cell)
		switch {
		case k == "type" || k == "categorie":
			cols["type"] = i
		case k == "nom" || k == "objet" || k == "tresor":
			cols["name"] = i
		case strings.HasPrefix(k, "effet") || k == "description":
			cols["effect"] = i
		case strings.HasPrefix(k, "poids"):
			cols["weight"] = i
		case strings.HasPrefix(k, "rarete"):
			cols["rarity"] = i
		case strings.HasPrefix(k, "prix") || k == "valeur":
			cols["price"] = i
		case strings.HasPrefix(k, "coupon"):
			cols["coupons"] = i
		}
	}
	_, hasName := cols["name"]
	_, hasWeight := cols["weight"]
	_, hasPrice := cols["price"]
	if !hasName || (!hasWeight && !hasPrice) {
		return nil
	}
	if _, crew := cols["type"]; !crew {
		// Sans colonne « Type » on exige « Effet » pour ne pas confondre avec l'équipage.
		if _, ok := cols["effect"]; !ok {
			return nil
		}
	}
	return cols
}

func parseItems(rows [][]string, hdr int, cols colMap) Inventory {
	inv := Inventory{}
	for _, row := range rows[hdr+1:] {
		name := cols.get(row, "name")
		if name == "" {
			if rowEmpty(row) {
				break
			}
			continue
		}
		it := Item{
			ID:     NewID(),
			Type:   cols.get(row, "type"),
			Name:   name,
			Effect: cols.get(row, "effect"),
			Weight: floatLoose(cols.get(row, "weight")),
			Rarity: strings.ToUpper(cols.get(row, "rarity")),
			Price:  cols.get(row, "price"),
		}
		if c := cols.get(row, "coupons"); c != "" {
			v := atoiLoose(c)
			it.Coupons = &v
		}
		inv.Items = append(inv.Items, it)
	}
	return inv
}

func mergeInventory(cur *Inventory, inv Inventory) *Inventory {
	if cur == nil {
		return &inv
	}
	cur.Items = append(cur.Items, inv.Items...)
	if cur.Description == "" {
		cur.Description = inv.Description
	}
	return cur
}

// sheetDescription : texte d'introduction au-dessus du tableau (hors titre d'arpenteur).
func sheetDescription(rows [][]string) string {
	for _, row := range rows {
		for _, cell := range row {
			cell = strings.TrimSpace(cell)
			if len([]rune(cell)) >= 30 && !strings.HasPrefix(FoldKey(cell), "arpenteur") {
				return cell
			}
		}
	}
	return ""
}

// --- Outils ------------------------------------------------------------------

func findHeader(rows [][]string, match func([]string) colMap) (int, colMap) {
	for i, row := range rows {
		if cols := match(row); cols != nil {
			return i, cols
		}
	}
	return -1, nil
}

func splitLabel(cell string) (string, string) {
	i := strings.Index(cell, ":")
	if i < 0 {
		return strings.TrimSpace(cell), ""
	}
	return strings.TrimSpace(cell[:i]), strings.TrimSpace(cell[i+1:])
}

func afterColon(cell string) string {
	_, v := splitLabel(cell)
	return v
}

var fractionRe = regexp.MustCompile(`(-?\d+)\s*/\s*(\d+)`)

// fraction : « 5/10 » → 5, 10. « X » ou vide → faux.
func fraction(v string) (int, int, bool) {
	m := fractionRe.FindStringSubmatch(v)
	if m == nil {
		if n := strings.TrimSpace(v); n != "" && regexp.MustCompile(`^\d+$`).MatchString(n) {
			x, _ := strconv.Atoi(n)
			return x, 0, true
		}
		return 0, 0, false
	}
	a, _ := strconv.Atoi(m[1])
	b, _ := strconv.Atoi(m[2])
	return a, b, true
}

var intRe = regexp.MustCompile(`-?\d+`)

func atoiLoose(v string) int {
	m := intRe.FindString(v)
	n, _ := strconv.Atoi(m)
	return n
}

func floatLoose(v string) float64 {
	v = strings.ReplaceAll(strings.TrimSpace(v), ",", ".")
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return float64(atoiLoose(v))
	}
	return f
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func maxOr(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}

func rowEmpty(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}
