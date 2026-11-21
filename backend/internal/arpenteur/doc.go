// Package arpenteur décrit l'arpenteur d'une partie GEMMA « Arpenteur » : le
// vaisseau des sables commun au groupe, son équipage, son armement, sa cale,
// sa cave et sa position dans les déserts de Keld.
//
// L'état complet tient dans un seul document JSON (une ligne par partie). Il
// est modifié section par section : chaque section a ses propres droits
// (voir perm.go) et est normalisée par le serveur avant d'être enregistrée.
package arpenteur

// Doc : l'état complet de l'arpenteur. Doit rester aligné avec le type
// ArpenteurDoc de frontend/src/arpenteur/types.ts.
type Doc struct {
	Name        string      `json:"name"`
	Number      int         `json:"number"`
	FormerOwner string      `json:"formerOwner"`
	Build       Build       `json:"build"`
	Pending     *Works      `json:"pending"`
	History     []Upgrade   `json:"history"`
	Expedition  Expedition  `json:"expedition"`
	Crew        Crew        `json:"crew"`
	Combat      Combat      `json:"combat"`
	Orders      Orders      `json:"orders"`
	Hold        Inventory   `json:"hold"`
	Cave        Inventory   `json:"cave"`
	Map         MapState    `json:"map"`
	Permissions Permissions `json:"permissions"`
	Log         []LogEntry  `json:"log"`
}

// --- Construction (atelier) --------------------------------------------------

// Build : la construction du navire, d'après l'arbre des choix.
type Build struct {
	Allure string `json:"allure"`
	Quille Part   `json:"quille"`
	Coque  Part   `json:"coque"`
	Mats   Masts  `json:"mats"`
	Ponts  int    `json:"ponts"`
	Poupe  Stern  `json:"poupe"`
	Proue  Prow   `json:"proue"`
	Deco   Deco   `json:"deco"`
	Tenue  Outfit `json:"tenue"`
	Rooms  []Room `json:"rooms"`
}

// Part : quille ou coque (type puis matériau).
type Part struct {
	Type     string `json:"type"`
	Material string `json:"material"`
}

type Masts struct {
	Type       string `json:"type"`
	SailColor  string `json:"sailColor"`
	FlagColor  string `json:"flagColor"`
	FlagEmblem string `json:"flagEmblem"`
}

type Stern struct {
	Material   string `json:"material"`
	Gouvernail string `json:"gouvernail"`
	Luminaires string `json:"luminaires"`
}

type Prow struct {
	Sculpture string `json:"sculpture"`
	Material  string `json:"material"`
}

// Deco : travail du designer décorateur.
type Deco struct {
	Bands []string `json:"bands"`
	Trim  string   `json:"trim"`
}

// Outfit : code vestimentaire de l'équipage (tailleur).
type Outfit struct {
	Color  string `json:"color"`
	Accent string `json:"accent"`
}

// Room : pièce ou activité ajoutée au navire.
type Room struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Deck  string `json:"deck"`
	Space int    `json:"space"`
	Cost  string `json:"cost"`
	Time  string `json:"time"`
}

// Works : travaux en cours au chantier (la construction visée).
type Works struct {
	Label     string `json:"label"`
	Cost      string `json:"cost"`
	Duration  string `json:"duration"`
	StartedAt string `json:"startedAt"`
	Build     Build  `json:"build"`
}

// Upgrade : une étape de l'évolution du navire.
type Upgrade struct {
	ID    string `json:"id"`
	At    string `json:"at"`
	Label string `json:"label"`
	Cost  string `json:"cost"`
	Build Build  `json:"build"`
}

// --- Expédition --------------------------------------------------------------

type Expedition struct {
	Number      int     `json:"number"`
	Coupons     int     `json:"coupons"`
	CouponsNote string  `json:"couponsNote"`
	PatronQuest string  `json:"patronQuest"`
	Other       string  `json:"other"`
	Players     string  `json:"players"`
	Fields      []Field `json:"fields"`
}

// Field : information libre (« Ravitaillement : … »).
type Field struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// --- Équipage ----------------------------------------------------------------

type Crew struct {
	Capacity int `json:"capacity"`
	// RespectOverride : respect moyen fixé à la main (sinon calculé).
	RespectOverride *int     `json:"respectOverride"`
	FatigueMax      int      `json:"fatigueMax"`
	RespectMax      int      `json:"respectMax"`
	Members         []Member `json:"members"`
}

type Member struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PlayerName string `json:"playerName"`
	// PC : personnage d'un joueur (ne prend pas de place d'équipage).
	PC bool `json:"pc"`
	// UserID : joueur de la partie qui incarne ce membre (droits par poste).
	UserID     *int64 `json:"userId"`
	Sex        string `json:"sex"`
	Race       string `json:"race"`
	Loyalty    string `json:"loyalty"`
	Combat     int    `json:"combat"`
	Extraction int    `json:"extraction"`
	Entretien  int    `json:"entretien"`
	Expertise  int    `json:"expertise"`
	Post       string `json:"post"`
	GoodPost   string `json:"goodPost"`
	BadPost    string `json:"badPost"`
	Price      string `json:"price"`
	Coupons    string `json:"coupons"`
	Vie        int    `json:"vie"`
	VieMax     int    `json:"vieMax"`
	Fatigue    int    `json:"fatigue"`
	Respect    int    `json:"respect"`
	// Sortie : fait partie de l'équipage de sortie.
	Sortie bool   `json:"sortie"`
	Note   string `json:"note"`
}

// --- Combat ------------------------------------------------------------------

type Combat struct {
	Constitution     int      `json:"constitution"`
	ConstitutionMax  int      `json:"constitutionMax"`
	RepairParts      int      `json:"repairParts"`
	RepairPartsMax   int      `json:"repairPartsMax"`
	Decks            []Deck   `json:"decks"`
	Ammo             []Ammo   `json:"ammo"`
	PowderReserve    int      `json:"powderReserve"`
	PowderReserveMax int      `json:"powderReserveMax"`
	Barrels          []Barrel `json:"barrels"`
	LastSalvo        *Salvo   `json:"lastSalvo"`
}

type Deck struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Guns      Guns   `json:"guns"`
}

// Guns : les trois types de canons (A1 artillerie, A2 pivotant, A3 obusier).
type Guns struct {
	A1 Battery `json:"A1"`
	A2 Battery `json:"A2"`
	A3 Battery `json:"A3"`
}

// Battery : emplacements, canons installés, chargés (munition) et amorcés (poudre).
type Battery struct {
	Slots     int `json:"slots"`
	Installed int `json:"installed"`
	Loaded    int `json:"loaded"`
	Primed    int `json:"primed"`
}

type Ammo struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Barrel : baril de poudre monté sur le pont.
type Barrel struct {
	ID   string `json:"id"`
	Uses int    `json:"uses"`
	Max  int    `json:"max"`
}

// Salvo : dernière salve tirée (rejouée en animation chez tout le monde).
type Salvo struct {
	ID     int64  `json:"id"`
	At     string `json:"at"`
	Guns   int    `json:"guns"`
	Ammo   string `json:"ammo"`
	Side   string `json:"side"`
	By     string `json:"by"`
	Result string `json:"result"`
}

// Orders : déroulé de la mise à feu et cible (partagés par les postes concernés).
type Orders struct {
	// Step : étape en cours du déroulé (0 = pas de tir en cours, 1 à 7).
	Step int `json:"step"`
	// Ammo : munition à charger, choisie par le Capitaine (identifiant).
	Ammo   string  `json:"ammo"`
	Target *Target `json:"target"`
}

// Target : cible en mètres, relative au navire (y négatif = devant).
type Target struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Label string  `json:"label"`
}

// --- Cale et cave ------------------------------------------------------------

type Inventory struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Capacity    float64 `json:"capacity"`
	Items       []Item  `json:"items"`
}

type Item struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	Name    string  `json:"name"`
	Effect  string  `json:"effect"`
	Weight  float64 `json:"weight"`
	Rarity  string  `json:"rarity"`
	Price   string  `json:"price"`
	Coupons *int    `json:"coupons"`
}

// --- Carte -------------------------------------------------------------------

type MapState struct {
	// Sector : sous-région où se trouve l'arpenteur (« M2 ») ; Destination : cap.
	Sector      string `json:"sector"`
	Destination string `json:"destination"`
	// SectorNames : nom donné à une sous-région (« M2 » → « Le Désert du phare vert »).
	SectorNames map[string]string `json:"sectorNames"`
	Trail       []TrailStep       `json:"trail"`
	ImageURL    string            `json:"imageUrl"`
	Ship        *Point            `json:"ship"`
	Heading     float64           `json:"heading"`
	Markers     []Marker          `json:"markers"`
	// Travel : voyage en cours (ou le dernier), pour l'animer chez tous les joueurs.
	Travel *Travel `json:"travel"`
	// Mood : moment de la journée imposé par le MJ ("" = selon l'heure).
	Mood string `json:"mood"`
	// Hangar : secteur de la ville où l'équipage possède son hangar ("" : aucun).
	// Attribué par le MJ ; le navire s'y amarre et l'atelier n'y travaille que là.
	Hangar string `json:"hangar"`
}

// Travel : départ de From vers To à StartedAt (horodaté par le serveur),
// pour une durée en secondes. Sector vaut déjà To pendant le voyage.
type Travel struct {
	From      string `json:"from"`
	To        string `json:"to"`
	StartedAt string `json:"startedAt"`
	Duration  int    `json:"duration"`
}

type TrailStep struct {
	Sector string `json:"sector"`
	At     string `json:"at"`
}

// Point : position normalisée (0 à 1) sur la carte illustrée.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Marker struct {
	ID     string   `json:"id"`
	Label  string   `json:"label"`
	Kind   string   `json:"kind"`
	Sector string   `json:"sector"`
	Note   string   `json:"note"`
	X      *float64 `json:"x"`
	Y      *float64 `json:"y"`
	Hidden bool     `json:"hidden"`
}

// --- Journal -----------------------------------------------------------------

type LogEntry struct {
	At   string `json:"at"`
	By   string `json:"by"`
	Text string `json:"text"`
}
