package arpenteur

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
)

// Postes de l'équipage (cabines essentielles du navire).
var Posts = []string{"Capitaine", "Contremaître", "Maître canonnier", "Chirurgien", "Guetteur", "Combattant", "Mousse"}

// Sections modifiables du document, chacune avec ses droits.
const (
	SectionShip        = "ship"        // atelier : nom, construction, travaux, évolution
	SectionExpedition  = "expedition"  // expédition, coupons, quêtes
	SectionCrew        = "crew"        // recrutement, postes, fiches
	SectionCrewHealth  = "crewHealth"  // vie et fatigue seulement
	SectionCombat      = "combat"      // canons, munitions, poudre, salves
	SectionOrders      = "orders"      // déroulé de la mise à feu, cible
	SectionHold        = "hold"        // cale
	SectionCave        = "cave"        // cave
	SectionMap         = "map"         // carte, cap, repères
	SectionPermissions = "permissions" // droits par poste (MJ seul)
)

// EditableSections : sections dont le MJ peut confier les droits à des postes.
var EditableSections = []string{SectionShip, SectionExpedition, SectionCrew, SectionCrewHealth, SectionCombat, SectionOrders, SectionHold, SectionCave, SectionMap}

// Perm : postes qui modifient une section. Fallback : postes qui la modifient
// quand aucun joueur n'occupe l'un des postes principaux (ex. le Capitaine
// gère les canons si le maître canonnier n'est pas un joueur).
type Perm struct {
	Posts    []string `json:"posts"`
	Fallback []string `json:"fallback"`
}

type Permissions map[string]Perm

// DefaultPermissions : d'après les règles des feuilles de l'arpenteur.
func DefaultPermissions() Permissions {
	return Permissions{
		SectionShip:       {Posts: []string{}, Fallback: []string{}},
		SectionExpedition: {Posts: []string{"Capitaine"}, Fallback: []string{}},
		SectionCrew:       {Posts: []string{"Capitaine", "Contremaître"}, Fallback: []string{}},
		SectionCrewHealth: {Posts: []string{"Chirurgien"}, Fallback: []string{}},
		SectionCombat:     {Posts: []string{"Maître canonnier"}, Fallback: []string{"Capitaine", "Contremaître"}},
		SectionOrders:     {Posts: []string{"Capitaine", "Guetteur", "Contremaître", "Maître canonnier"}, Fallback: []string{}},
		SectionHold:       {Posts: []string{"Capitaine", "Contremaître", "Mousse"}, Fallback: []string{}},
		SectionCave:       {Posts: []string{"Capitaine"}, Fallback: []string{}},
		SectionMap:        {Posts: []string{"Capitaine", "Guetteur"}, Fallback: []string{}},
	}
}

func NormalizePermissions(p *Permissions) {
	def := DefaultPermissions()
	out := Permissions{}
	for _, s := range EditableSections {
		cur, ok := (*p)[s]
		if !ok {
			cur = def[s]
		}
		out[s] = Perm{Posts: canonicalPosts(cur.Posts), Fallback: canonicalPosts(cur.Fallback)}
	}
	*p = out
}

func canonicalPosts(list []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, p := range list {
		c := CanonicalPost(p)
		if c != "" && !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	return out
}

// CanonicalPost : « contre-maître », « Contremaitre » → « Contremaître ».
// Un poste inconnu est gardé tel quel (nettoyé).
func CanonicalPost(p string) string {
	k := FoldKey(p)
	if k == "" {
		return ""
	}
	switch k {
	case "medecin":
		return "Chirurgien"
	case "canonnier", "maitrecanonier":
		return "Maître canonnier"
	}
	for _, c := range Posts {
		if FoldKey(c) == k {
			return c
		}
	}
	return text(p, 40)
}

// FoldKey : minuscules, sans accents, sans espaces ni tirets.
func FoldKey(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if f, ok := accentFold[r]; ok {
			b.WriteString(f)
		} else if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

var accentFold = map[rune]string{
	'à': "a", 'â': "a", 'ä': "a", 'á': "a", 'ã': "a", 'å': "a",
	'é': "e", 'è': "e", 'ê': "e", 'ë': "e",
	'î': "i", 'ï': "i", 'í': "i", 'ì': "i",
	'ô': "o", 'ö': "o", 'ó': "o", 'ò': "o", 'õ': "o",
	'ù': "u", 'û': "u", 'ü': "u", 'ú': "u",
	'ç': "c", 'ñ': "n", 'ÿ': "y", 'œ': "oe", 'æ': "ae",
}

// userPosts : postes (clés repliées) des membres incarnés par ce joueur.
func (d *Doc) userPosts(userID int64) map[string]bool {
	out := map[string]bool{}
	for _, m := range d.Crew.Members {
		if m.UserID != nil && *m.UserID == userID && m.Post != "" {
			out[FoldKey(CanonicalPost(m.Post))] = true
		}
	}
	return out
}

// playerHoldsAny : un joueur occupe-t-il l'un de ces postes ?
func (d *Doc) playerHoldsAny(posts []string) bool {
	want := map[string]bool{}
	for _, p := range posts {
		want[FoldKey(p)] = true
	}
	for _, m := range d.Crew.Members {
		if m.UserID != nil && want[FoldKey(CanonicalPost(m.Post))] {
			return true
		}
	}
	return false
}

// CanEdit : ce participant peut-il modifier la section ?
func (d *Doc) CanEdit(section string, userID int64, isGM bool) bool {
	if isGM {
		return true
	}
	if section == SectionPermissions {
		return false
	}
	if section == SectionCrewHealth && d.CanEdit(SectionCrew, userID, false) {
		return true
	}
	perm, ok := d.Permissions[section]
	if !ok {
		return false
	}
	mine := d.userPosts(userID)
	for _, p := range perm.Posts {
		if mine[FoldKey(p)] {
			return true
		}
	}
	if len(perm.Fallback) > 0 && !d.playerHoldsAny(perm.Posts) {
		for _, p := range perm.Fallback {
			if mine[FoldKey(p)] {
				return true
			}
		}
	}
	return false
}

// Rights : sections modifiables par ce participant (pour l'interface).
func (d *Doc) Rights(userID int64, isGM bool) map[string]bool {
	out := map[string]bool{}
	for _, s := range append(append([]string{}, EditableSections...), SectionPermissions) {
		out[s] = d.CanEdit(s, userID, isGM)
	}
	return out
}

// ShipSection : contenu de la section « ship ».
type ShipSection struct {
	Name        string    `json:"name"`
	Number      int       `json:"number"`
	FormerOwner string    `json:"formerOwner"`
	Build       Build     `json:"build"`
	Pending     *Works    `json:"pending"`
	History     []Upgrade `json:"history"`
}

// HealthUpdate : soins d'un membre (section crewHealth).
type HealthUpdate struct {
	ID      string `json:"id"`
	Vie     int    `json:"vie"`
	Fatigue int    `json:"fatigue"`
}

var ErrUnknownSection = errors.New("section inconnue")

// Apply remplace une section par la valeur reçue (droits vérifiés avant).
// Pour un joueur, les liens membre ↔ joueur et les repères cachés sont
// conservés tels quels : ils restent du ressort du MJ.
func (d *Doc) Apply(section string, raw json.RawMessage, isGM bool) error {
	switch section {
	case SectionShip:
		var v ShipSection
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Name, d.Number, d.FormerOwner = v.Name, v.Number, v.FormerOwner
		d.Build, d.Pending, d.History = v.Build, v.Pending, v.History
	case SectionExpedition:
		var v Expedition
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Expedition = v
	case SectionCrew:
		var v Crew
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		if !isGM {
			keepPlayerLinks(&v, d.Crew)
		}
		d.Crew = v
	case SectionCrewHealth:
		var v []HealthUpdate
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		for _, h := range v {
			for i := range d.Crew.Members {
				if d.Crew.Members[i].ID == h.ID {
					d.Crew.Members[i].Vie = h.Vie
					d.Crew.Members[i].Fatigue = h.Fatigue
				}
			}
		}
	case SectionCombat:
		var v Combat
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Combat = v
	case SectionOrders:
		var v Orders
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Orders = v
	case SectionHold:
		var v Inventory
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Hold = v
	case SectionCave:
		var v Inventory
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Cave = v
	case SectionMap:
		var v MapState
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		if !isGM {
			keepHiddenMarkers(&v, d.Map)
			// Le hangar s'achète à la table : seul le MJ l'attribue.
			v.Hangar = d.Map.Hangar
		}
		now := time.Now()
		v.Travel = stamp(v.Travel, d.Map.Travel, now)
		v.Hop = stamp(v.Hop, d.Map.Hop, now)
		d.Map = v
	case SectionPermissions:
		var v Permissions
		if err := json.Unmarshal(raw, &v); err != nil {
			return err
		}
		d.Permissions = v
	default:
		return ErrUnknownSection
	}
	Normalize(d)
	return nil
}

// keepPlayerLinks : un joueur ne peut ni lier un membre à un joueur ni
// changer qui est un personnage joueur.
func keepPlayerLinks(next *Crew, prev Crew) {
	byID := map[string]Member{}
	for _, m := range prev.Members {
		byID[m.ID] = m
	}
	for i := range next.Members {
		if old, ok := byID[next.Members[i].ID]; ok {
			next.Members[i].UserID = old.UserID
			next.Members[i].PC = old.PC
		} else {
			next.Members[i].UserID = nil
			next.Members[i].PC = false
		}
	}
}

// stamp : l'heure de départ d'un voyage (ou d'un trajet vers un lieu-dit)
// est fixée par le serveur (même référence pour tous les joueurs) et ne peut
// plus être modifiée ensuite.
func stamp(t, prev *Travel, now time.Time) *Travel {
	if t == nil {
		return nil
	}
	if prev != nil && prev.From == t.From && prev.To == t.To && prev.StartedAt != "" {
		t.StartedAt = prev.StartedAt
		t.Duration = prev.Duration
		return t
	}
	t.StartedAt = now.UTC().Format(time.RFC3339Nano)
	return t
}

// keepHiddenMarkers : les repères cachés (que le joueur ne voit pas) sont
// conservés ; ceux qu'il envoie sont toujours visibles.
func keepHiddenMarkers(next *MapState, prev MapState) {
	hidden := []Marker{}
	taken := map[string]bool{}
	for _, m := range prev.Markers {
		if m.Hidden {
			hidden = append(hidden, m)
			taken[m.ID] = true
		}
	}
	visible := []Marker{}
	for _, m := range next.Markers {
		if taken[m.ID] {
			continue
		}
		m.Hidden = false
		visible = append(visible, m)
	}
	next.Markers = append(visible, hidden...)
}

// ForPlayers : copie du document sans ce que le MJ cache aux joueurs.
func (d Doc) ForPlayers() Doc {
	out := d
	markers := []Marker{}
	for _, m := range d.Map.Markers {
		if !m.Hidden {
			markers = append(markers, m)
		}
	}
	out.Map.Markers = markers
	return out
}

// AppendLog ajoute une ligne au journal de bord.
func (d *Doc) AppendLog(at, by, line string) {
	line = text(line, 200)
	if line == "" {
		return
	}
	d.Log = append(d.Log, LogEntry{At: at, By: text(by, maxShortText), Text: line})
	if len(d.Log) > maxLog {
		d.Log = d.Log[len(d.Log)-maxLog:]
	}
}
