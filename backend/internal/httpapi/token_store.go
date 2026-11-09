package httpapi

import (
	"database/sql"
	"encoding/json"

	"jdr-backend/internal/domain"
	"jdr-backend/internal/realtime"
)

// Lecture des jetons : une seule requête et une seule fonction de scan pour
// tout le backend (auparavant ce code était copié à quatre endroits).

const tokenColumns = `id, map_id, created_by, owner_user_id, kind, name, color, icon_url, x, y,
	visible_to_players, hp, max_hp, mana, max_mana, width, height,
	COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1),
	attack_range, element_id, COALESCE(status_effects::text, '[]')`

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanToken(sc rowScanner) (*domain.Token, error) {
	var t domain.Token
	var ownerID, elemID sql.NullInt64
	var iconURL sql.NullString
	var visible int
	var hp, maxHp, mana, maxMana, width, height, attackRange sql.NullInt64
	var statusEffectsJSON string
	if err := sc.Scan(&t.ID, &t.MapID, &t.CreatedBy, &ownerID, &t.Kind, &t.Name, &t.Color, &iconURL, &t.X, &t.Y,
		&visible, &hp, &maxHp, &mana, &maxMana, &width, &height,
		&t.IconPosX, &t.IconPosY, &t.IconScale,
		&attackRange, &elemID, &statusEffectsJSON); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(statusEffectsJSON), &t.StatusEffects)
	t.VisibleToPlayers = visible == 1
	if ownerID.Valid {
		id := ownerID.Int64
		t.OwnerUserID = &id
	}
	if elemID.Valid {
		id := elemID.Int64
		t.ElementID = &id
	}
	if iconURL.Valid {
		t.IconURL = iconURL.String
	}
	t.Hp = nullIntPtr(hp)
	t.MaxHp = nullIntPtr(maxHp)
	t.Mana = nullIntPtr(mana)
	t.MaxMana = nullIntPtr(maxMana)
	t.Width = nullIntPtr(width)
	t.Height = nullIntPtr(height)
	t.AttackRange = nullIntPtr(attackRange)
	return &t, nil
}

func nullIntPtr(v sql.NullInt64) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int64)
	return &n
}

func (s *Server) getToken(id int64) (*domain.Token, error) {
	return scanToken(s.db.QueryRow("SELECT "+tokenColumns+" FROM tokens WHERE id = ?", id))
}

// listMapTokens retourne les jetons d'une carte. Pour un joueur, les jetons
// cachés par le MJ ne sont pas inclus.
func (s *Server) listMapTokens(mapID int64, forGM bool) ([]*domain.Token, error) {
	q := "SELECT " + tokenColumns + " FROM tokens WHERE map_id = ?"
	if !forGM {
		q += " AND visible_to_players = 1"
	}
	rows, err := s.db.Query(q+" ORDER BY id", mapID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tokens := []*domain.Token{}
	for rows.Next() {
		t, err := scanToken(rows)
		if err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// ensurePlayerToken crée le jeton PJ d'un joueur sur une carte s'il n'existe pas encore.
// Retourne le jeton créé, ou nil s'il existait déjà.
func (s *Server) ensurePlayerToken(mapID, gameID, userID int64) *domain.Token {
	var displayName string
	var charName sql.NullString
	if err := s.db.QueryRow(
		`SELECT u.display_name, gp.character_name FROM users u
		 JOIN game_players gp ON gp.user_id = u.id AND gp.game_id = ?
		 WHERE u.id = ? AND gp.role = 'PLAYER'`,
		gameID, userID,
	).Scan(&displayName, &charName); err != nil {
		return nil
	}
	name := displayName
	if charName.Valid && charName.String != "" {
		name = charName.String
	}
	color := tokenColors[int(userID)%len(tokenColors)]
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO tokens (map_id, created_by, owner_user_id, kind, name, color, x, y, visible_to_players)
		SELECT ?::bigint, ?::bigint, ?::bigint, 'PJ', ?::text, ?::text, 100, 100, 1
		WHERE NOT EXISTS (SELECT 1 FROM tokens WHERE map_id = ? AND owner_user_id = ? AND kind = 'PJ')
		RETURNING id`,
		mapID, userID, userID, name, color, mapID, userID,
	).Scan(&id)
	if err != nil {
		// sql.ErrNoRows : le jeton existe déjà ; violation d'unicité : créé en parallèle.
		return nil
	}
	t, err := s.getToken(id)
	if err != nil {
		return nil
	}
	return t
}

// ensurePlayerTokensForMap crée les jetons PJ manquants de tous les joueurs de la partie.
func (s *Server) ensurePlayerTokensForMap(mapID, gameID int64) []*domain.Token {
	rows, err := s.db.Query("SELECT user_id FROM game_players WHERE game_id = ? AND role = 'PLAYER'", gameID)
	if err != nil {
		return nil
	}
	var userIDs []int64
	for rows.Next() {
		var uid int64
		if rows.Scan(&uid) == nil {
			userIDs = append(userIDs, uid)
		}
	}
	rows.Close()
	var created []*domain.Token
	for _, uid := range userIDs {
		if t := s.ensurePlayerToken(mapID, gameID, uid); t != nil {
			created = append(created, t)
		}
	}
	return created
}

// gamesShowingMap retourne les parties concernées par une carte : sa partie
// d'origine et toutes les parties qui l'affichent (cartes partagées entre parties).
func (s *Server) gamesShowingMap(mapID int64) []int64 {
	rows, err := s.db.Query(
		`SELECT game_id FROM maps WHERE id = ?
		 UNION
		 SELECT id FROM games WHERE current_map_id = ?`,
		mapID, mapID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// broadcastToken diffuse un jeton créé ou modifié. Les joueurs ne reçoivent
// pas les jetons cachés : pour eux, un jeton caché est « supprimé ».
func (s *Server) broadcastToken(eventType string, t *domain.Token) {
	if t == nil {
		return
	}
	deleted := map[string]int64{"id": t.ID, "mapId": t.MapID}
	for _, gameID := range s.gamesShowingMap(t.MapID) {
		s.hub.BroadcastFunc(gameID, func(m realtime.Member) (string, any, bool) {
			if m.IsGM() || t.VisibleToPlayers {
				return eventType, t, true
			}
			return "token.deleted", deleted, true
		})
	}
}

func (s *Server) broadcastTokenDeleted(id, mapID int64) {
	payload := map[string]int64{"id": id, "mapId": mapID}
	for _, gameID := range s.gamesShowingMap(mapID) {
		s.hub.Broadcast(gameID, "token.deleted", payload)
	}
}

// broadcastMapEvent diffuse un événement lié à une carte (éléments de décor, etc.)
// à toutes les parties qui l'affichent.
func (s *Server) broadcastMapEvent(mapID int64, eventType string, payload any) {
	for _, gameID := range s.gamesShowingMap(mapID) {
		s.hub.Broadcast(gameID, eventType, payload)
	}
}

// setCharacterName met à jour le nom de personnage et prévient les clients connectés.
func (s *Server) setCharacterName(gameID, userID int64, name string) error {
	if _, err := s.db.Exec("UPDATE game_players SET character_name = ? WHERE game_id = ? AND user_id = ?", name, gameID, userID); err != nil {
		return err
	}
	s.hub.UpdateMember(gameID, userID, func(m *realtime.Member) { m.CharacterName = name })
	return nil
}
