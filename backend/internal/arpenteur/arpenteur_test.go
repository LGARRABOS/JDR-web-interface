package arpenteur

import (
	"encoding/json"
	"testing"

	"jdr-backend/internal/docimport"
)

func uid(v int64) *int64 { return &v }

func crewDoc() Doc {
	d := Default()
	d.Crew.Members = []Member{
		{ID: "malrik", Name: "Malrik", PC: true, UserID: uid(10), Post: "Capitaine"},
		{ID: "ssythik", Name: "Ssythik Dzan", PC: true, UserID: uid(11), Post: "Chirurgien"},
		{ID: "ehpu", Name: "Ehpu-Ki", Post: "Maître canonnier"},
		{ID: "hezkan", Name: "Hezkan", Post: "Guetteur", Vie: 19, VieMax: 19, Fatigue: 6},
	}
	Normalize(&d)
	return d
}

func TestDefaultIsNormalized(t *testing.T) {
	d := Default()
	if d.Build.Allure != "protector" || d.Build.Ponts != 1 || len(d.Combat.Decks) != 3 {
		t.Fatalf("défaut inattendu : %+v", d.Build)
	}
	if len(d.Permissions) != len(EditableSections) {
		t.Fatalf("droits par défaut incomplets : %v", d.Permissions)
	}
	if d.Crew.Members == nil || d.Hold.Items == nil || d.Map.Markers == nil || d.Log == nil {
		t.Fatal("les listes ne doivent jamais être nulles")
	}
}

func TestCanonicalPost(t *testing.T) {
	cases := map[string]string{
		"Contre-maître":    "Contremaître",
		"contremaitre":     "Contremaître",
		"Maître canonnier": "Maître canonnier",
		"maitre-canonnier": "Maître canonnier",
		"Medecin":          "Chirurgien",
		"Navigateur":       "Navigateur",
		"":                 "",
	}
	for in, want := range cases {
		if got := CanonicalPost(in); got != want {
			t.Errorf("CanonicalPost(%q) = %q, attendu %q", in, got, want)
		}
	}
}

func TestPermissionsByPost(t *testing.T) {
	d := crewDoc()
	if !d.CanEdit(SectionCrew, 10, false) {
		t.Error("le Capitaine gère l'équipage")
	}
	if d.CanEdit(SectionCrew, 11, false) {
		t.Error("le Chirurgien ne recrute pas")
	}
	if !d.CanEdit(SectionCrewHealth, 11, false) || !d.CanEdit(SectionCrewHealth, 10, false) {
		t.Error("le Chirurgien (et qui gère l'équipage) soigne")
	}
	// Le maître canonnier n'est pas un joueur : le Capitaine prend la relève.
	if !d.CanEdit(SectionCombat, 10, false) {
		t.Error("relève du Capitaine sur les canons attendue")
	}
	if d.CanEdit(SectionCombat, 11, false) {
		t.Error("le Chirurgien ne touche pas aux canons")
	}
	// Un joueur devient maître canonnier : la relève tombe.
	d.Crew.Members = append(d.Crew.Members, Member{ID: "destructus", Name: "Destructus", PC: true, UserID: uid(12), Post: "maitre canonnier"})
	Normalize(&d)
	if d.CanEdit(SectionCombat, 10, false) || !d.CanEdit(SectionCombat, 12, false) {
		t.Error("seul le maître canonnier joueur gère les canons")
	}
	if d.CanEdit(SectionPermissions, 10, false) || !d.CanEdit(SectionPermissions, 1, true) {
		t.Error("les droits sont réservés au MJ")
	}
	if d.CanEdit(SectionCrew, 99, false) {
		t.Error("un inconnu ne modifie rien")
	}
}

func TestApplyCrewByPlayerKeepsLinks(t *testing.T) {
	d := crewDoc()
	next := d.Crew
	next.Members = append([]Member{}, d.Crew.Members...)
	next.Members[0].UserID = uid(99) // tentative de changer de joueur
	next.Members[2].UserID = uid(10) // tentative de s'attribuer un PNJ
	next.Members[2].PC = true
	next.Members = append(next.Members, Member{ID: "new", Name: "Recrue", UserID: uid(10), PC: true, Post: "Mousse"})
	raw, _ := json.Marshal(next)
	if err := d.Apply(SectionCrew, raw, false); err != nil {
		t.Fatal(err)
	}
	if *d.Crew.Members[0].UserID != 10 || d.Crew.Members[2].UserID != nil || d.Crew.Members[2].PC {
		t.Fatalf("liens joueurs modifiés : %+v", d.Crew.Members)
	}
	last := d.Crew.Members[len(d.Crew.Members)-1]
	if last.UserID != nil || last.PC {
		t.Fatalf("une recrue ajoutée par un joueur n'est liée à personne : %+v", last)
	}
}

func TestApplyCrewHealthOnlyTouchesHealth(t *testing.T) {
	d := crewDoc()
	raw, _ := json.Marshal([]HealthUpdate{{ID: "hezkan", Vie: 12, Fatigue: 99}})
	if err := d.Apply(SectionCrewHealth, raw, false); err != nil {
		t.Fatal(err)
	}
	h := d.Crew.Members[3]
	if h.Vie != 12 || h.Fatigue != d.Crew.FatigueMax || h.Post != "Guetteur" {
		t.Fatalf("soins mal appliqués : %+v", h)
	}
}

func TestHiddenMarkers(t *testing.T) {
	d := Default()
	d.Map.Markers = []Marker{{ID: "a", Label: "Oasis"}, {ID: "b", Label: "Repaire secret", Hidden: true}}
	Normalize(&d)
	if got := d.ForPlayers().Map.Markers; len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("les joueurs ne voient pas les repères cachés : %+v", got)
	}
	// Un joueur renvoie la carte (sans le repère caché) et tente d'écraser « b ».
	next := d.ForPlayers().Map
	next.Markers = append(next.Markers, Marker{ID: "b", Label: "Écrasé"}, Marker{ID: "c", Label: "Épave", Hidden: true})
	raw, _ := json.Marshal(next)
	if err := d.Apply(SectionMap, raw, false); err != nil {
		t.Fatal(err)
	}
	byID := map[string]Marker{}
	for _, m := range d.Map.Markers {
		byID[m.ID] = m
	}
	if byID["b"].Label != "Repaire secret" || !byID["b"].Hidden {
		t.Errorf("repère caché altéré : %+v", byID["b"])
	}
	if byID["c"].Hidden {
		t.Error("un joueur ne crée pas de repère caché")
	}
}

func TestNormalizeBounds(t *testing.T) {
	d := Default()
	d.Combat.Decks[0].Guns.A1 = Battery{Slots: 4, Installed: 9, Loaded: 7, Primed: -2}
	d.Combat.Constitution = 50
	d.Build.Quille = Part{Type: "lourde", Material: "chene"}
	d.Build.Mats.SailColor = "rouge"
	d.Build.Ponts = 7
	Normalize(&d)
	b := d.Combat.Decks[0].Guns.A1
	if b.Installed != 4 || b.Loaded != 4 || b.Primed != 0 {
		t.Errorf("batterie mal bornée : %+v", b)
	}
	if d.Combat.Constitution != d.Combat.ConstitutionMax {
		t.Error("constitution bornée au maximum")
	}
	if d.Build.Quille.Material != "cuivre" {
		t.Errorf("une quille lourde n'est pas en chêne : %q", d.Build.Quille.Material)
	}
	if d.Build.Mats.SailColor != "#e8dcc0" || d.Build.Ponts != 3 {
		t.Errorf("construction mal normalisée : %+v", d.Build)
	}
}

func TestApplyUnknownSection(t *testing.T) {
	d := Default()
	if err := d.Apply("treasure", json.RawMessage(`{}`), true); err != ErrUnknownSection {
		t.Fatalf("erreur attendue, obtenu %v", err)
	}
}

// Classeur reprenant la structure des feuilles d'un groupe (Arpenteur, Combat,
// Cale, Cave, sauvegarde).
func sampleWorkbook() *docimport.Content {
	title := `Arpenteur 1 - "Darrak-Varis" (Anciennement sous le contrôle de Grisha Rouvaris)`
	return &docimport.Content{Kind: "sheet", Sheets: []docimport.Sheet{
		{Name: "Arpenteur 1", Rows: [][]string{
			{title},
			{"Joueurs : ", "Naoué, Magick, Mathisss"},
			{"Expédition : 2", "Secteur désertique : M2, Le Désert du phare vert"},
			{},
			{"Coupons restants : 68", "A jour", "Quête mécène :"},
			{"équipages : 26", "", "Autre :"},
			{"ravitaillement : "},
			{},
			{"Équipage (5/7 places)", "Respect moyen de l'équipage : 14/20"},
			{"Nom", "Sexe", "Race", "Loyauté", "Combat", "Extraction des ressources", "Entretien et réparation navire", "Expertise terrain et faune", "Poste affecté", "Poste Adéquat", "Poste Inadapté", "Prix", "Prix coupon", "Vie", "Fatigue", "Respect"},
			{"Malrik (Luc)", "Homme", "Humain", "ABSOLUE", "", "", "", "", "Capitaine", "Capitaine", "Medecin", "Gratuit", "0"},
			{"Destructus( Mathis )", "Homme", "Veldaken", "???", "", "", "", "", "Contre-maître"},
			{"Sahnara", "Féminin", "Léonin", "Tonnerre Nocturne", "Expert", "Fort", "Faible", "Moyen", "Chirurgien", "Chirurgien", "Guetteur", "15 PC", "8", "21", "0", "10"},
			{"Hezkan", "Masculin", "Viashino", "Brasier Démoniaque", "Moyen", "Expert", "Faible", "Fort", "Guetteur", "Guetteur", "Chirurgien", "7 PC", "4", "19", "6", "10"},
			{},
			{"Équipage de sortie"},
			{"Hezkan"},
		}},
		{Name: "Combat", Rows: [][]string{
			{title},
			{"Phase de combat en Arpenteur"},
			{},
			{"Constitution de l'Arpenteur", "5/10", "", "Pièces de réparation", "9/10"},
			{},
			{"Résumé - Situation de combat", "Types de canons", "", "", "Armement canons", "", "", "Poudre à canon"},
			{"", "Canons A1", "Canons A2", "Canons A3", "Canons A1", "Canons A2", "Canons A3", "Canons A1", "Canons A2", "Canons A3"},
			{"Grand pont (possible)", "4/6", "0/2", "0/1", "2/4", "X", "X", "2/4", "X", "X"},
			{"Pont Supérieur (impossible)"},
			{"Pont inférieur (impossible)"},
			{},
			{"", "Suivi canons (légende)", "", "", "Suivi munitions", "", "", "Suivi poudre à canon"},
			{"", "A1", "Canon d'artillerie", "", "Type", "Nombre", "", "Réserve cale : 8/10 Barils"},
			{"", "A2", "Canon pivotant", "", "Boulets de canons", "17", "", "Utilisation par baril sur le pont"},
			{"", "A3", "Obusier", "", "Filets de capture", "2", "", "Baril 1", "Baril 2"},
			{"", "", "", "", "", "", "", "5/5", "3/5"},
		}},
		{Name: "Cale Arpenteur 1", Rows: [][]string{
			{title},
			{"Joueurs : ", "X"},
			{"Type", "Nom", "Effet", "Poids*", "Rareté(S/A/B/C/D)", "Prix*", "Coupons"},
			{"Consommable", "Caisson de ragoût de Yakki", "Caisson de 10 pièces.", "10", "D", "3 PA", "15"},
			{"Consommable", "Large poche de venin", "15 munitions empoisonnées.", "3", "b", "18 PC"},
		}},
		{Name: "Cave_Darrakis", Rows: [][]string{
			{"Cave de Darrakis pour le stockage. Accessible par une clé spéciale."},
			{},
			{"Type", "Nom", "Effet", "Poids*", "Rareté(S/A/B/C/D)", "Prix*", "Coupons"},
			{"Trésor", "Dard de scorpion", "Un rare butin", "4", "A", "4 PA", ""},
		}},
		{Name: "SAVE-Combat", Rows: [][]string{{"NE PAS TOUCHER"}, {"Constitution de l'Arpenteur", "46305"}}},
	}}
}

func TestImportWorkbook(t *testing.T) {
	players := []PlayerRef{{UserID: 7, Names: []string{"Luc", "Malrik"}}, {UserID: 8, Names: []string{"Mathisss"}}}
	res := ImportContent(sampleWorkbook(), players)
	if !res.HasTitle || res.Name != "Darrak-Varis" || res.Number != 1 || res.FormerOwner != "Grisha Rouvaris" {
		t.Fatalf("titre mal lu : %q %d %q", res.Name, res.Number, res.FormerOwner)
	}
	e := res.Expedition
	if e == nil || e.Number != 2 || res.Sector != "M2" || e.Coupons != 68 || e.CouponsNote != "A jour" || e.Players != "Naoué, Magick, Mathisss" {
		t.Fatalf("expédition mal lue : %+v", e)
	}
	if res.SectorName != "Le Désert du phare vert" {
		t.Errorf("nom de secteur : %q", res.SectorName)
	}
	if len(e.Fields) != 2 || e.Fields[0].Label != "équipages" || e.Fields[0].Value != "26" {
		t.Errorf("champs libres : %+v", e.Fields)
	}

	c := res.Crew
	if c == nil || len(c.Members) != 4 || c.Capacity != 7 || c.RespectOverride == nil || *c.RespectOverride != 14 || c.RespectMax != 20 {
		t.Fatalf("équipage mal lu : %+v", c)
	}
	malrik := c.Members[0]
	if malrik.Name != "Malrik" || malrik.PlayerName != "Luc" || !malrik.PC || malrik.UserID == nil || *malrik.UserID != 7 || malrik.BadPost != "Chirurgien" {
		t.Errorf("Malrik : %+v", malrik)
	}
	destructus := c.Members[1]
	if destructus.Name != "Destructus" || destructus.Post != "Contremaître" || destructus.UserID == nil || *destructus.UserID != 8 {
		t.Errorf("Destructus : %+v", destructus)
	}
	sahnara := c.Members[2]
	if sahnara.PC || sahnara.Combat != 4 || sahnara.Extraction != 3 || sahnara.Entretien != 1 || sahnara.Expertise != 2 || sahnara.Vie != 21 || sahnara.VieMax != 21 || sahnara.Respect != 10 {
		t.Errorf("Sahnara : %+v", sahnara)
	}
	if !c.Members[3].Sortie || sahnara.Sortie {
		t.Error("Hezkan seul fait partie de l'équipage de sortie")
	}

	cb := res.Combat
	if cb == nil || cb.Constitution != 5 || cb.ConstitutionMax != 10 || cb.RepairParts != 9 || len(cb.Decks) != 3 {
		t.Fatalf("combat mal lu : %+v", cb)
	}
	grand := cb.Decks[0]
	if grand.ID != "grand" || grand.Name != "Grand pont" || !grand.Available || grand.Guns.A1 != (Battery{Slots: 6, Installed: 4, Loaded: 2, Primed: 2}) || grand.Guns.A2.Slots != 2 || grand.Guns.A3.Slots != 1 {
		t.Errorf("grand pont : %+v", grand)
	}
	if cb.Decks[1].Available || cb.Decks[1].ID != "superieur" {
		t.Errorf("pont supérieur : %+v", cb.Decks[1])
	}
	if len(cb.Ammo) != 2 || cb.Ammo[0].ID != "boulets" || cb.Ammo[0].Count != 17 || cb.Ammo[1].Count != 2 {
		t.Errorf("munitions : %+v", cb.Ammo)
	}
	if cb.PowderReserve != 8 || cb.PowderReserveMax != 10 || len(cb.Barrels) != 2 || cb.Barrels[1].Uses != 3 || cb.Barrels[1].Max != 5 {
		t.Errorf("poudre : %d/%d %+v", cb.PowderReserve, cb.PowderReserveMax, cb.Barrels)
	}

	if res.Hold == nil || len(res.Hold.Items) != 2 || res.Hold.Title != "Cale" {
		t.Fatalf("cale : %+v", res.Hold)
	}
	yakki, venin := res.Hold.Items[0], res.Hold.Items[1]
	if yakki.Weight != 10 || yakki.Price != "3 PA" || yakki.Coupons == nil || *yakki.Coupons != 15 {
		t.Errorf("ragoût : %+v", yakki)
	}
	if venin.Coupons != nil || venin.Rarity != "B" {
		t.Errorf("venin : %+v", venin)
	}
	if res.Cave == nil || len(res.Cave.Items) != 1 || res.Cave.Title != "Cave Darrakis" || res.Cave.Description == "" {
		t.Fatalf("cave : %+v", res.Cave)
	}
	if len(res.Summary.Ignored) != 1 || res.Summary.Ignored[0] != "SAVE-Combat" {
		t.Errorf("feuille de sauvegarde ignorée : %v", res.Summary.Ignored)
	}

	// Application : le secteur reçoit son nom, un membre connu garde son lien.
	d := Default()
	d.Crew.Members = []Member{{ID: "keep", Name: "sahnara", UserID: uid(9), Note: "Fiable"}}
	d.ApplyImport(res)
	if d.Name != "Darrak-Varis" || d.Map.Sector != "M2" || d.Map.SectorNames["M2"] != "Le Désert du phare vert" {
		t.Errorf("import appliqué : %q %v", d.Name, d.Map.SectorNames)
	}
	got := d.Crew.Members[2]
	if got.ID != "keep" || got.UserID == nil || *got.UserID != 9 || got.Note != "Fiable" {
		t.Errorf("membre connu : %+v", got)
	}
}

func TestMatchPlayerAmbiguous(t *testing.T) {
	players := []PlayerRef{{UserID: 1, Names: []string{"Mathis"}}, {UserID: 2, Names: []string{"Mathilde"}}}
	if matchPlayer("Mat", players) != nil {
		t.Error("nom ambigu : aucun lien")
	}
	if got := matchPlayer("Mathilde", players); got == nil || *got != 2 {
		t.Error("Mathilde reconnue")
	}
}
