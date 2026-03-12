package domain

// User représente un utilisateur.
type User struct {
	ID           int64  `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	DisplayName  string `json:"displayName"`
}

// Game représente une partie.
type Game struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	InviteCode string `json:"inviteCode"`
	OwnerID    int64  `json:"ownerId"`
}

// GamePlayer lie un utilisateur à une partie avec un rôle.
type GamePlayer struct {
	GameID int64  `json:"gameId"`
	UserID int64  `json:"userId"`
	Role   string `json:"role"` // MJ ou PLAYER
}

// Map représente une carte de jeu.
type Map struct {
	ID        int64    `json:"id"`
	GameID    int64    `json:"gameId"`
	Name      string   `json:"name"`
	ImageURL  string   `json:"imageUrl"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
	GridSize  int      `json:"gridSize"`
	Tags      []string `json:"tags,omitempty"`
}

// Token représente un pion sur la carte.
type Token struct {
	ID               int64   `json:"id"`
	MapID            int64   `json:"mapId"`
	CreatedBy        int64   `json:"createdBy"`
	OwnerUserID      *int64  `json:"ownerUserId,omitempty"`
	Kind             string  `json:"kind"` // PJ, PNJ, OBJET, MORT (vaincu)
	Name             string  `json:"name"`
	Color            string  `json:"color"`
	IconURL          string  `json:"iconUrl,omitempty"`
	X                float64 `json:"x"`
	Y                float64 `json:"y"`
	Width            *int    `json:"width,omitempty"`
	Height           *int    `json:"height,omitempty"`
	VisibleToPlayers bool    `json:"visibleToPlayers"`
	Hp               *int    `json:"hp,omitempty"`       // PV actuels
	MaxHp            *int    `json:"maxHp,omitempty"`   // PV max
	Mana             *int    `json:"mana,omitempty"`    // Mana actuel
	MaxMana          *int    `json:"maxMana,omitempty"` // Mana max
}

// GameElement représente un élément de la bibliothèque (monstre ou décor).
type GameElement struct {
	ID        int64    `json:"id"`
	GameID    int64    `json:"gameId"`
	Name      string   `json:"name"`
	ImageURL  string   `json:"imageUrl"`
	Category  string   `json:"category"` // monster, decor
	Tags      []string `json:"tags,omitempty"`
	CreatedAt string   `json:"createdAt"`
}

// MapElement représente un élément de décor fixe sur une carte.
type MapElement struct {
	ID        int64   `json:"id"`
	MapID     int64   `json:"mapId"`
	ImageURL  string  `json:"imageUrl"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	CreatedAt string  `json:"createdAt"`
}

// FogPatch représente une zone de brouillard de guerre.
type FogPatch struct {
	ID        int64  `json:"id"`
	MapID     int64  `json:"mapId"`
	ShapeType string `json:"shapeType"` // rect, polygon
	ShapeData string `json:"shapeData"` // JSON: {x,y,w,h} ou {points:[[x,y],...]}
	Revealed  bool   `json:"revealed"`
}

// GameMessage représente un message de chat.
type GameMessage struct {
	ID        int64  `json:"id"`
	GameID    int64  `json:"gameId"`
	UserID    int64  `json:"userId"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

// DiceRoll représente un lancer de dés.
type DiceRoll struct {
	ID         int64  `json:"id"`
	GameID     int64  `json:"gameId"`
	UserID     int64  `json:"userId"`
	Expression string `json:"expression"`
	Result     int    `json:"result"`
	Details    string `json:"details,omitempty"`
	CreatedAt  string `json:"createdAt"`
}
