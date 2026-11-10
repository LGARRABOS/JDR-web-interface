package httpapi

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"jdr-backend/internal/domain"
	"jdr-backend/internal/realtime"
)

// Instantané de partie envoyé par WebSocket à chaque (re)connexion.
// Doit rester aligné avec le type GameSnapshot de frontend/src/realtime/protocol.ts.

type snapshotGame struct {
	ID                  int64  `json:"id"`
	Name                string `json:"name"`
	InviteCode          string `json:"inviteCode,omitempty"`
	OwnerID             int64  `json:"ownerId"`
	IsGemma             bool   `json:"isGemma"`
	TokenMovementLocked bool   `json:"tokenMovementLocked"`
	FogVisionRadius     int    `json:"fogVisionRadius"`
	CurrentMapID        *int64 `json:"currentMapId"`
}

// mapScene regroupe tout ce qui est affiché sur la carte courante.
type mapScene struct {
	Map         *domain.Map          `json:"map"`
	Tokens      []*domain.Token      `json:"tokens"`
	MapElements []*domain.MapElement `json:"mapElements"`
	Fog         *fogState            `json:"fog"`
}

type snapshotPlayer struct {
	UserID        int64  `json:"userId"`
	DisplayName   string `json:"displayName"`
	CharacterName string `json:"characterName"`
	Role          string `json:"role"`
}

type gameSnapshot struct {
	Game     snapshotGame             `json:"game"`
	Maps     []*domain.Map            `json:"maps"`
	Scene    *mapScene                `json:"scene"`
	Messages []map[string]interface{} `json:"messages"`
	Rolls    []map[string]interface{} `json:"rolls"`
	Players  []snapshotPlayer         `json:"players"`
}

func (s *Server) resolveMember(gameID, userID int64) (realtime.Member, bool) {
	var m realtime.Member
	var characterName sql.NullString
	err := s.db.QueryRow(
		`SELECT u.id, u.display_name, gp.character_name, gp.role
		 FROM game_players gp JOIN users u ON u.id = gp.user_id
		 WHERE gp.game_id = ? AND gp.user_id = ?`,
		gameID, userID,
	).Scan(&m.UserID, &m.DisplayName, &characterName, &m.Role)
	if err != nil {
		return realtime.Member{}, false
	}
	m.CharacterName = characterName.String
	return m, true
}

func (s *Server) buildSnapshot(gameID int64, m realtime.Member) (any, error) {
	var snap gameSnapshot
	var isGemma, locked int
	var currentMapID sql.NullInt64
	err := s.db.QueryRow(
		`SELECT id, name, invite_code, owner_id, COALESCE(is_gemma, 0), COALESCE(token_movement_locked, 0),
		        COALESCE(fog_vision_radius, 0), current_map_id
		 FROM games WHERE id = ?`, gameID,
	).Scan(&snap.Game.ID, &snap.Game.Name, &snap.Game.InviteCode, &snap.Game.OwnerID, &isGemma, &locked,
		&snap.Game.FogVisionRadius, &currentMapID)
	if err != nil {
		return nil, fmt.Errorf("game: %w", err)
	}
	snap.Game.IsGemma = isGemma == 1
	snap.Game.TokenMovementLocked = locked == 1
	if !m.IsGM() {
		snap.Game.InviteCode = ""
	}

	if snap.Maps, err = s.listGameMaps(gameID); err != nil {
		return nil, fmt.Errorf("maps: %w", err)
	}

	// Carte affichée : la carte choisie par le MJ, sinon la première carte de la partie.
	var sceneMapID int64
	if currentMapID.Valid {
		sceneMapID = currentMapID.Int64
		id := sceneMapID
		snap.Game.CurrentMapID = &id
	} else if len(snap.Maps) > 0 {
		sceneMapID = snap.Maps[0].ID
	}
	if sceneMapID != 0 {
		if !m.IsGM() {
			if t := s.ensurePlayerToken(sceneMapID, gameID, m.UserID); t != nil {
				s.broadcastToken("token.created", t)
			}
		}
		if snap.Scene, err = s.buildScene(sceneMapID, m.IsGM()); err != nil {
			return nil, fmt.Errorf("scene: %w", err)
		}
	}

	if snap.Messages, err = s.listRecentMessages(gameID); err != nil {
		return nil, fmt.Errorf("messages: %w", err)
	}
	if snap.Rolls, err = s.listRecentRolls(gameID, m.IsGM()); err != nil {
		return nil, fmt.Errorf("rolls: %w", err)
	}
	if snap.Players, err = s.listSnapshotPlayers(gameID); err != nil {
		return nil, fmt.Errorf("players: %w", err)
	}
	return snap, nil
}

func (s *Server) buildScene(mapID int64, forGM bool) (*mapScene, error) {
	m, err := s.getMap(mapID)
	if err != nil {
		return nil, err
	}
	tokens, err := s.listMapTokens(mapID, forGM)
	if err != nil {
		return nil, err
	}
	elements, err := s.listMapElements(mapID)
	if err != nil {
		return nil, err
	}
	fog, err := s.getFogState(mapID)
	if err != nil {
		return nil, err
	}
	return &mapScene{Map: m, Tokens: tokens, MapElements: elements, Fog: fog}, nil
}

// broadcastMapDisplayed prévient tous les clients du changement de carte en
// leur envoyant directement la nouvelle scène (filtrée selon le rôle).
func (s *Server) broadcastMapDisplayed(gameID, mapID int64) {
	s.ensurePlayerTokensForMap(mapID, gameID)
	s.recenterPlayerTokens(mapID)
	s.hub.ResetMapView(gameID)
	gmScene, err := s.buildScene(mapID, true)
	if err != nil {
		return
	}
	playerScene, err := s.buildScene(mapID, false)
	if err != nil {
		return
	}
	s.hub.BroadcastFunc(gameID, func(m realtime.Member) (string, any, bool) {
		if m.IsGM() {
			return "map.displayed", gmScene, true
		}
		return "map.displayed", playerScene, true
	})
}

func (s *Server) getMap(mapID int64) (*domain.Map, error) {
	var m domain.Map
	var tagsJSON string
	err := s.db.QueryRow(
		`SELECT id, game_id, name, image_url, width, height, grid_size, COALESCE(tags, '[]')
		 FROM maps WHERE id = ?`, mapID,
	).Scan(&m.ID, &m.GameID, &m.Name, &m.ImageURL, &m.Width, &m.Height, &m.GridSize, &tagsJSON)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(tagsJSON), &m.Tags)
	return &m, nil
}

func (s *Server) listGameMaps(gameID int64) ([]*domain.Map, error) {
	rows, err := s.db.Query(
		`SELECT id, game_id, name, image_url, width, height, grid_size, COALESCE(tags, '[]')
		 FROM maps WHERE game_id = ? ORDER BY id`, gameID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	maps := []*domain.Map{}
	for rows.Next() {
		var m domain.Map
		var tagsJSON string
		if err := rows.Scan(&m.ID, &m.GameID, &m.Name, &m.ImageURL, &m.Width, &m.Height, &m.GridSize, &tagsJSON); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(tagsJSON), &m.Tags)
		maps = append(maps, &m)
	}
	return maps, rows.Err()
}

func (s *Server) listMapElements(mapID int64) ([]*domain.MapElement, error) {
	rows, err := s.db.Query(
		"SELECT id, map_id, image_url, x, y, width, height, created_at FROM map_elements WHERE map_id = ? ORDER BY id",
		mapID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	elements := []*domain.MapElement{}
	for rows.Next() {
		var e domain.MapElement
		if err := rows.Scan(&e.ID, &e.MapID, &e.ImageURL, &e.X, &e.Y, &e.Width, &e.Height, &e.CreatedAt); err != nil {
			return nil, err
		}
		elements = append(elements, &e)
	}
	return elements, rows.Err()
}

// listRecentMessages retourne les 100 derniers messages, du plus ancien au plus récent.
func (s *Server) listRecentMessages(gameID int64) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(`
		SELECT gm.id, gm.game_id, gm.user_id, gm.role, gm.content, gm.created_at,
			COALESCE(NULLIF(gp.character_name, ''), u.display_name) as display_name
		FROM game_messages gm
		JOIN users u ON u.id = gm.user_id
		LEFT JOIN game_players gp ON gp.game_id = gm.game_id AND gp.user_id = gm.user_id
		WHERE gm.game_id = ?
		ORDER BY gm.created_at DESC, gm.id DESC
		LIMIT 100
	`, gameID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []map[string]interface{}{}
	for rows.Next() {
		var id, gid, userID int64
		var role, content, createdAt, displayName string
		if err := rows.Scan(&id, &gid, &userID, &role, &content, &createdAt, &displayName); err != nil {
			return nil, err
		}
		messages = append(messages, map[string]interface{}{
			"id":          id,
			"gameId":      gid,
			"userId":      userID,
			"role":        role,
			"content":     content,
			"createdAt":   createdAt,
			"displayName": displayName,
		})
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, rows.Err()
}

func (s *Server) listSnapshotPlayers(gameID int64) ([]snapshotPlayer, error) {
	rows, err := s.db.Query(
		`SELECT u.id, u.display_name, COALESCE(gp.character_name, ''), gp.role
		 FROM game_players gp JOIN users u ON u.id = gp.user_id
		 WHERE gp.game_id = ? ORDER BY gp.role DESC, u.id`, gameID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	players := []snapshotPlayer{}
	for rows.Next() {
		var p snapshotPlayer
		if err := rows.Scan(&p.UserID, &p.DisplayName, &p.CharacterName, &p.Role); err != nil {
			return nil, err
		}
		players = append(players, p)
	}
	return players, rows.Err()
}

// listRecentRolls retourne les 50 derniers jets, du plus ancien au plus récent.
// Les jets cachés ne sont inclus que pour le MJ.
func (s *Server) listRecentRolls(gameID int64, forGM bool) ([]map[string]interface{}, error) {
	q := `
		SELECT r.id, r.user_id, r.expression, r.result, COALESCE(r.details, ''), r.hidden, r.created_at,
			COALESCE(NULLIF(gp.character_name, ''), u.display_name)
		FROM dice_rolls r
		JOIN users u ON u.id = r.user_id
		LEFT JOIN game_players gp ON gp.game_id = r.game_id AND gp.user_id = r.user_id
		WHERE r.game_id = ?`
	if !forGM {
		q += " AND r.hidden = 0"
	}
	rows, err := s.db.Query(q+" ORDER BY r.created_at DESC, r.id DESC LIMIT 50", gameID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rolls := []map[string]interface{}{}
	for rows.Next() {
		var id, userID int64
		var result, hidden int
		var expression, details, createdAt, displayName string
		if err := rows.Scan(&id, &userID, &expression, &result, &details, &hidden, &createdAt, &displayName); err != nil {
			return nil, err
		}
		rolls = append(rolls, map[string]interface{}{
			"id":          id,
			"userId":      userID,
			"expression":  expression,
			"result":      result,
			"details":     details,
			"hidden":      hidden == 1,
			"createdAt":   createdAt,
			"displayName": displayName,
		})
	}
	for i, j := 0, len(rolls)-1; i < j; i, j = i+1, j-1 {
		rolls[i], rolls[j] = rolls[j], rolls[i]
	}
	return rolls, rows.Err()
}
