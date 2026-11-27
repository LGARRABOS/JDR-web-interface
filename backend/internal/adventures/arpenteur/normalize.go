package arpenteur

import (
	"crypto/rand"
	"encoding/hex"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Catalogues des choix possibles (arbre des choix du glisseur des sables).
// Doivent rester alignés avec frontend/src/adventures/arpenteur/model/catalog.ts.
var (
	Allures         = []string{"escorteur", "survivor", "protector", "bombardier", "fleche", "forteresse", "enforceur", "gouverneur"}
	QuilleMaterials = map[string][]string{"simple": {"beaulou", "chene", "sombrefer"}, "lourde": {"cuivre", "fer", "acier"}}
	CoqueMaterials  = map[string][]string{"legere": {"beaulou", "chene", "sombrefer"}, "renforcee": {"cuivre", "boisfer", "acier"}}
	AllMaterials    = []string{"beaulou", "chene", "sombrefer", "cuivre", "fer", "boisfer", "acier"}
	MastTypes       = []string{"simple", "double", "triple", "pique"}
	FlagEmblems     = []string{"aucun", "soleil", "crane", "etoile", "croissant", "griffes"}
	Gouvernails     = []string{"classique", "sculpte", "renforce"}
	Luminaires      = []string{"aucun", "lanternes", "aether", "braseros"}
	Sculptures      = []string{"aucune", "humanoide", "monstre", "animal"}
	ProwMaterials   = []string{"flotte", "renforce", "cuivreor"}
	RoomKinds       = []string{"jeux", "fumoir", "plaisance", "sauna", "torture", "chambre", "exposition", "autre"}
	RoomDecks       = []string{"superieur", "grand", "inferieur", "souspont", "cale"}
	MarkerKinds     = []string{"mission", "danger", "ville", "tresor", "repere"}
	Rarities        = []string{"", "S", "A", "B", "C", "D"}
)

// Limites : protègent la base et l'affichage d'un document démesuré.
const (
	maxMembers   = 60
	maxItems     = 400
	maxDecks     = 6
	maxAmmo      = 12
	maxBarrels   = 30
	maxRooms     = 20
	maxHistory   = 60
	maxTrail     = 200
	maxMarkers   = 150
	maxFields    = 20
	maxLog       = 200
	maxBands     = 3
	maxShortText = 80
	maxText      = 600
	maxLongText  = 2000
)

// DefaultBuild : un galion de base (Protector, bois de chêne, trois mâts).
func DefaultBuild() Build {
	return Build{
		Allure: "protector",
		Quille: Part{Type: "simple", Material: "chene"},
		Coque:  Part{Type: "legere", Material: "chene"},
		Mats:   Masts{Type: "triple", SailColor: "#e8dcc0", FlagColor: "#9b2c2c", FlagEmblem: "soleil"},
		Ponts:  1,
		Poupe:  Stern{Material: "chene", Gouvernail: "classique", Luminaires: "lanternes"},
		Proue:  Prow{Sculpture: "aucune", Material: "flotte"},
		Deco:   Deco{Bands: []string{}, Trim: "#c9a227"},
		Tenue:  Outfit{Color: "#6b4f2a", Accent: "#c9a227"},
		Rooms:  []Room{},
	}
}

// Default : l'arpenteur d'une nouvelle partie.
func Default() Doc {
	d := Doc{
		Name:       "Arpenteur",
		Number:     1,
		Build:      DefaultBuild(),
		Expedition: Expedition{Number: 1},
		Crew:       Crew{Capacity: 7, FatigueMax: 10, RespectMax: 20},
		Combat: Combat{
			Constitution: 10, ConstitutionMax: 10, RepairParts: 10, RepairPartsMax: 10,
			Decks: []Deck{
				{ID: "grand", Name: "Grand pont", Available: true, Guns: Guns{A1: Battery{Slots: 6}, A2: Battery{Slots: 2}, A3: Battery{Slots: 1}}},
				{ID: "superieur", Name: "Pont supérieur"},
				{ID: "inferieur", Name: "Pont inférieur"},
			},
			Ammo:             []Ammo{{ID: "boulets", Name: "Boulets de canon"}, {ID: "filets", Name: "Filets de capture"}},
			PowderReserveMax: 10,
		},
		Hold:        Inventory{Title: "Cale"},
		Entrepot:    Inventory{Title: EntrepotTitle},
		Permissions: DefaultPermissions(),
	}
	Normalize(&d)
	return d
}

// Normalize corrige tout le document (valeurs bornées, listes jamais nulles).
func Normalize(d *Doc) {
	d.Name = text(d.Name, maxShortText)
	if d.Name == "" {
		d.Name = "Arpenteur"
	}
	d.Number = clamp(d.Number, 0, 999)
	d.FormerOwner = text(d.FormerOwner, maxShortText)
	NormalizeBuild(&d.Build)
	if d.Pending != nil {
		NormalizeWorks(d.Pending)
	}
	d.History = normalizeHistory(d.History)
	NormalizeExpedition(&d.Expedition)
	NormalizeCrew(&d.Crew)
	NormalizeCombat(&d.Combat)
	NormalizeOrders(&d.Orders)
	NormalizeInventory(&d.Hold, "Cale")
	migrateCave(d)
	NormalizeInventory(&d.Entrepot, EntrepotTitle)
	NormalizeMap(&d.Map)
	NormalizePermissions(&d.Permissions)
	if d.Log == nil {
		d.Log = []LogEntry{}
	}
	if len(d.Log) > maxLog {
		d.Log = d.Log[len(d.Log)-maxLog:]
	}
}

func NormalizeBuild(b *Build) {
	def := DefaultBuild()
	b.Allure = oneOf(b.Allure, Allures, def.Allure)
	b.Quille.Type = oneOf(b.Quille.Type, keys(QuilleMaterials), "simple")
	b.Quille.Material = oneOf(b.Quille.Material, QuilleMaterials[b.Quille.Type], QuilleMaterials[b.Quille.Type][0])
	b.Coque.Type = oneOf(b.Coque.Type, keys(CoqueMaterials), "legere")
	b.Coque.Material = oneOf(b.Coque.Material, CoqueMaterials[b.Coque.Type], CoqueMaterials[b.Coque.Type][0])
	b.Mats.Type = oneOf(b.Mats.Type, MastTypes, def.Mats.Type)
	b.Mats.SailColor = color(b.Mats.SailColor, def.Mats.SailColor)
	b.Mats.FlagColor = color(b.Mats.FlagColor, def.Mats.FlagColor)
	b.Mats.FlagEmblem = oneOf(b.Mats.FlagEmblem, FlagEmblems, "aucun")
	b.Ponts = clamp(b.Ponts, 1, 3)
	b.Poupe.Material = oneOf(b.Poupe.Material, AllMaterials, def.Poupe.Material)
	b.Poupe.Gouvernail = oneOf(b.Poupe.Gouvernail, Gouvernails, def.Poupe.Gouvernail)
	b.Poupe.Luminaires = oneOf(b.Poupe.Luminaires, Luminaires, def.Poupe.Luminaires)
	b.Proue.Sculpture = oneOf(b.Proue.Sculpture, Sculptures, "aucune")
	b.Proue.Material = oneOf(b.Proue.Material, ProwMaterials, def.Proue.Material)
	bands := []string{}
	for _, c := range b.Deco.Bands {
		if len(bands) < maxBands && hexColor.MatchString(c) {
			bands = append(bands, strings.ToLower(c))
		}
	}
	b.Deco.Bands = bands
	b.Deco.Trim = color(b.Deco.Trim, def.Deco.Trim)
	b.Tenue.Color = color(b.Tenue.Color, def.Tenue.Color)
	b.Tenue.Accent = color(b.Tenue.Accent, def.Tenue.Accent)
	rooms := []Room{}
	seen := map[string]bool{}
	for _, r := range b.Rooms {
		if len(rooms) >= maxRooms {
			break
		}
		r.ID = uniqueID(r.ID, seen)
		r.Kind = oneOf(r.Kind, RoomKinds, "autre")
		r.Name = text(r.Name, maxShortText)
		r.Deck = oneOf(r.Deck, RoomDecks, "inferieur")
		r.Space = clamp(r.Space, 1, 4)
		r.Cost = text(r.Cost, maxShortText)
		r.Time = text(r.Time, maxShortText)
		rooms = append(rooms, r)
	}
	b.Rooms = rooms
}

func NormalizeWorks(w *Works) {
	w.Label = text(w.Label, maxShortText)
	w.Cost = text(w.Cost, maxShortText)
	w.Duration = text(w.Duration, maxShortText)
	w.StartedAt = text(w.StartedAt, 40)
	NormalizeBuild(&w.Build)
}

func normalizeHistory(list []Upgrade) []Upgrade {
	out := []Upgrade{}
	seen := map[string]bool{}
	if len(list) > maxHistory {
		list = list[len(list)-maxHistory:]
	}
	for _, u := range list {
		u.ID = uniqueID(u.ID, seen)
		u.At = text(u.At, 40)
		u.Label = text(u.Label, maxShortText)
		u.Cost = text(u.Cost, maxShortText)
		NormalizeBuild(&u.Build)
		out = append(out, u)
	}
	return out
}

func NormalizeExpedition(e *Expedition) {
	e.Number = clamp(e.Number, 0, 9999)
	e.Coupons = clamp(e.Coupons, -99999, 999999)
	e.CouponsNote = text(e.CouponsNote, maxShortText)
	e.PatronQuest = text(e.PatronQuest, maxText)
	e.Other = text(e.Other, maxText)
	e.Players = text(e.Players, maxText)
	fields := []Field{}
	for _, f := range e.Fields {
		if len(fields) >= maxFields {
			break
		}
		f.Label = text(f.Label, maxShortText)
		f.Value = text(f.Value, maxText)
		if f.Label != "" || f.Value != "" {
			fields = append(fields, f)
		}
	}
	e.Fields = fields
}

func NormalizeCrew(c *Crew) {
	c.Capacity = clamp(c.Capacity, 0, maxMembers)
	c.FatigueMax = clamp(c.FatigueMax, 1, 100)
	c.RespectMax = clamp(c.RespectMax, 1, 100)
	if c.RespectOverride != nil {
		v := clamp(*c.RespectOverride, 0, c.RespectMax)
		c.RespectOverride = &v
	}
	members := []Member{}
	seen := map[string]bool{}
	for _, m := range c.Members {
		if len(members) >= maxMembers {
			break
		}
		m.ID = uniqueID(m.ID, seen)
		m.Name = text(m.Name, maxShortText)
		if m.Name == "" {
			m.Name = "Sans nom"
		}
		m.PlayerName = text(m.PlayerName, maxShortText)
		if m.UserID != nil && *m.UserID <= 0 {
			m.UserID = nil
		}
		m.Sex = text(m.Sex, 40)
		m.Race = text(m.Race, 40)
		m.Loyalty = text(m.Loyalty, 40)
		m.Combat = clamp(m.Combat, 0, 4)
		m.Extraction = clamp(m.Extraction, 0, 4)
		m.Entretien = clamp(m.Entretien, 0, 4)
		m.Expertise = clamp(m.Expertise, 0, 4)
		m.Post = text(m.Post, 40)
		m.GoodPost = text(m.GoodPost, 40)
		m.BadPost = text(m.BadPost, 40)
		m.Price = text(m.Price, 40)
		m.Coupons = text(m.Coupons, 20)
		m.VieMax = clamp(m.VieMax, 0, 9999)
		m.Vie = clamp(m.Vie, 0, 9999)
		m.Fatigue = clamp(m.Fatigue, 0, c.FatigueMax)
		m.Respect = clamp(m.Respect, 0, c.RespectMax)
		m.Note = text(m.Note, maxText)
		members = append(members, m)
	}
	c.Members = members
}

func normalizeBattery(b *Battery) {
	b.Slots = clamp(b.Slots, 0, 99)
	b.Installed = clamp(b.Installed, 0, b.Slots)
	b.Loaded = clamp(b.Loaded, 0, b.Installed)
	b.Primed = clamp(b.Primed, 0, b.Installed)
}

func NormalizeCombat(c *Combat) {
	c.ConstitutionMax = clamp(c.ConstitutionMax, 1, 999)
	c.Constitution = clamp(c.Constitution, 0, c.ConstitutionMax)
	c.RepairPartsMax = clamp(c.RepairPartsMax, 0, 999)
	c.RepairParts = clamp(c.RepairParts, 0, c.RepairPartsMax)
	decks := []Deck{}
	seen := map[string]bool{}
	for _, d := range c.Decks {
		if len(decks) >= maxDecks {
			break
		}
		d.ID = uniqueID(d.ID, seen)
		d.Name = text(d.Name, 40)
		if d.Name == "" {
			d.Name = "Pont"
		}
		normalizeBattery(&d.Guns.A1)
		normalizeBattery(&d.Guns.A2)
		normalizeBattery(&d.Guns.A3)
		decks = append(decks, d)
	}
	c.Decks = decks
	ammo := []Ammo{}
	seen = map[string]bool{}
	for _, a := range c.Ammo {
		if len(ammo) >= maxAmmo {
			break
		}
		a.ID = uniqueID(a.ID, seen)
		a.Name = text(a.Name, 40)
		a.Count = clamp(a.Count, 0, 99999)
		ammo = append(ammo, a)
	}
	c.Ammo = ammo
	c.PowderReserveMax = clamp(c.PowderReserveMax, 0, 999)
	c.PowderReserve = clamp(c.PowderReserve, 0, c.PowderReserveMax)
	barrels := []Barrel{}
	seen = map[string]bool{}
	for _, b := range c.Barrels {
		if len(barrels) >= maxBarrels {
			break
		}
		b.ID = uniqueID(b.ID, seen)
		b.Max = clamp(b.Max, 1, 99)
		b.Uses = clamp(b.Uses, 0, b.Max)
		barrels = append(barrels, b)
	}
	c.Barrels = barrels
	if c.LastSalvo != nil {
		s := c.LastSalvo
		s.At = text(s.At, 40)
		s.Guns = clamp(s.Guns, 0, 999)
		s.Ammo = text(s.Ammo, 40)
		s.Side = text(s.Side, 2)
		s.By = text(s.By, maxShortText)
		s.Result = text(s.Result, maxShortText)
	}
}

func NormalizeOrders(o *Orders) {
	o.Step = clamp(o.Step, 0, 7)
	o.Ammo = text(o.Ammo, 40)
	if o.Target != nil {
		o.Target.X = clampF(o.Target.X, -1000, 1000)
		o.Target.Y = clampF(o.Target.Y, -1000, 1000)
		o.Target.Label = text(o.Target.Label, 40)
	}
}

// EntrepotTitle : nom par défaut de l'entrepôt.
const EntrepotTitle = "Entrepôt"

// migrateCave verse l'ancienne cave dans l'entrepôt : les parties créées
// avant le renommage gardent leurs objets, leur description et leur
// capacité. Le nom par défaut « Cave » devient « Entrepôt » ; un nom choisi
// par le groupe est conservé.
func migrateCave(d *Doc) {
	old := d.LegacyCave
	d.LegacyCave = nil
	if old == nil {
		return
	}
	cur := d.Entrepot
	if len(cur.Items) > 0 || cur.Description != "" || cur.Capacity > 0 {
		return // déjà migrée : l'entrepôt fait foi
	}
	d.Entrepot = *old
	if t := strings.TrimSpace(d.Entrepot.Title); t == "" || strings.EqualFold(t, "Cave") {
		d.Entrepot.Title = EntrepotTitle
	}
}

func NormalizeInventory(inv *Inventory, defTitle string) {
	inv.Title = text(inv.Title, maxShortText)
	if inv.Title == "" {
		inv.Title = defTitle
	}
	inv.Description = text(inv.Description, maxLongText)
	inv.Capacity = clampF(inv.Capacity, 0, 1e6)
	items := []Item{}
	seen := map[string]bool{}
	for _, it := range inv.Items {
		if len(items) >= maxItems {
			break
		}
		it.ID = uniqueID(it.ID, seen)
		it.Type = text(it.Type, 40)
		it.Name = text(it.Name, maxShortText)
		if it.Name == "" {
			it.Name = "Objet"
		}
		it.Effect = text(it.Effect, maxText)
		it.Weight = clampF(it.Weight, 0, 1e6)
		it.Rarity = oneOf(strings.ToUpper(strings.TrimSpace(it.Rarity)), Rarities, "")
		it.Price = text(it.Price, 40)
		if it.Coupons != nil {
			v := clamp(*it.Coupons, 0, 999999)
			it.Coupons = &v
		}
		items = append(items, it)
	}
	inv.Items = items
}

func NormalizeMap(m *MapState) {
	m.Sector = strings.ToUpper(text(m.Sector, 12))
	m.Destination = strings.ToUpper(text(m.Destination, 12))
	names := map[string]string{}
	for k, v := range m.SectorNames {
		k = strings.ToUpper(text(k, 12))
		v = text(v, maxShortText)
		if k != "" && v != "" && len(names) < 64 {
			names[k] = v
		}
	}
	m.SectorNames = names
	trail := []TrailStep{}
	if len(m.Trail) > maxTrail {
		m.Trail = m.Trail[len(m.Trail)-maxTrail:]
	}
	for _, t := range m.Trail {
		t.Sector = text(t.Sector, 12)
		t.At = text(t.At, 40)
		if t.Sector != "" {
			trail = append(trail, t)
		}
	}
	m.Trail = trail
	m.ImageURL = text(m.ImageURL, 300)
	if m.ImageURL != "" && !strings.HasPrefix(m.ImageURL, "/api/") {
		m.ImageURL = ""
	}
	if m.Ship != nil {
		m.Ship.X = clampF(m.Ship.X, 0, 1)
		m.Ship.Y = clampF(m.Ship.Y, 0, 1)
	}
	m.Heading = math.Mod(clampF(m.Heading, -3600, 3600)+3600, 360)
	if m.Mood != "dusk" && m.Mood != "night" {
		m.Mood = ""
	}
	m.Hangar = strings.ToUpper(text(m.Hangar, 12))
	m.Entrepot = strings.ToUpper(text(m.Entrepot, 12))
	if t := m.Travel; t != nil {
		t.From = strings.ToUpper(text(t.From, 12))
		t.To = strings.ToUpper(text(t.To, 12))
		t.Duration = clamp(t.Duration, 5, 120)
		t.StartedAt = text(t.StartedAt, 40)
		if _, err := time.Parse(time.RFC3339Nano, t.StartedAt); err != nil || t.From == "" || t.To == "" || t.From == t.To {
			m.Travel = nil
		}
	}
	m.Spot = text(m.Spot, 40)
	if t := m.Hop; t != nil {
		t.From = text(t.From, 40)
		t.To = text(t.To, 40)
		t.Duration = clamp(t.Duration, 5, 120)
		t.StartedAt = text(t.StartedAt, 40)
		if _, err := time.Parse(time.RFC3339Nano, t.StartedAt); err != nil || t.From == "" || t.To == "" || t.From == t.To {
			m.Hop = nil
		}
	}
	markers := []Marker{}
	seen := map[string]bool{}
	for _, mk := range m.Markers {
		if len(markers) >= maxMarkers {
			break
		}
		mk.ID = uniqueID(mk.ID, seen)
		mk.Label = text(mk.Label, maxShortText)
		mk.Kind = oneOf(mk.Kind, MarkerKinds, "repere")
		mk.Sector = text(mk.Sector, 12)
		mk.Note = text(mk.Note, maxText)
		if mk.X != nil {
			v := clampF(*mk.X, 0, 1)
			mk.X = &v
		}
		if mk.Y != nil {
			v := clampF(*mk.Y, 0, 1)
			mk.Y = &v
		}
		if (mk.X == nil) != (mk.Y == nil) {
			mk.X, mk.Y = nil, nil
		}
		markers = append(markers, mk)
	}
	m.Markers = markers
}

// --- Outils ------------------------------------------------------------------

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func color(c, def string) string {
	if hexColor.MatchString(c) {
		return strings.ToLower(c)
	}
	return def
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clampF(v, lo, hi float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return lo
	}
	return math.Max(lo, math.Min(hi, v))
}

// text : chaîne nettoyée (espaces de bord retirés) et tronquée à max caractères.
func text(s string, max int) string {
	s = strings.TrimSpace(strings.ToValidUTF8(s, ""))
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:max]))
}

func oneOf(v string, allowed []string, def string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

func keys(m map[string][]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// uniqueID garde l'identifiant fourni s'il est valide et pas encore vu,
// sinon en génère un nouveau.
func uniqueID(id string, seen map[string]bool) string {
	if !idPattern.MatchString(id) || seen[id] {
		id = NewID()
		for seen[id] {
			id = NewID()
		}
	}
	seen[id] = true
	return id
}

// NewID : identifiant court aléatoire.
func NewID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
