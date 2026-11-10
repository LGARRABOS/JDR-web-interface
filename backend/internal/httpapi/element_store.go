package httpapi

import (
	"database/sql"
	"encoding/json"

	"jdr-backend/internal/domain"
)

// Lecture des éléments de bibliothèque (monstres, décors) : une seule liste de
// colonnes et une seule fonction de scan.

const elementColumns = `id, game_id, name, image_url, category, COALESCE(tags, '[]'), created_at,
	COALESCE(description, ''), COALESCE(unique_trait, ''), COALESCE(loot, ''), max_hp, max_mana,
	COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1),
	player_fields::text`

// Rubriques d'une fiche monstre que le MJ peut montrer aux joueurs.
const (
	FieldName        = "name"
	FieldImage       = "image"
	FieldDescription = "description"
	FieldUniqueTrait = "uniqueTrait"
	FieldLoot        = "loot"
	FieldStats       = "stats"
)

var allPlayerFields = []string{FieldName, FieldImage, FieldDescription, FieldUniqueTrait, FieldLoot, FieldStats}

// Par défaut, un monstre vaincu révèle son nom, son image et sa description.
var defaultPlayerFields = []string{FieldName, FieldImage, FieldDescription}

func scanElement(sc rowScanner) (*domain.GameElement, error) {
	var e domain.GameElement
	var tagsJSON string
	var maxHp, maxMana sql.NullInt64
	var fields sql.NullString
	if err := sc.Scan(&e.ID, &e.GameID, &e.Name, &e.ImageURL, &e.Category, &tagsJSON, &e.CreatedAt,
		&e.Description, &e.UniqueTrait, &e.Loot, &maxHp, &maxMana,
		&e.IconPosX, &e.IconPosY, &e.IconScale, &fields); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(tagsJSON), &e.Tags)
	e.MaxHp = nullIntPtr(maxHp)
	e.MaxMana = nullIntPtr(maxMana)
	e.PlayerFields = defaultPlayerFields
	if fields.Valid && fields.String != "" {
		var f []string
		if json.Unmarshal([]byte(fields.String), &f) == nil {
			e.PlayerFields = normalizePlayerFields(f)
		}
	}
	return &e, nil
}

func (s *Server) getElement(id int64) (*domain.GameElement, error) {
	return scanElement(s.db.QueryRow("SELECT "+elementColumns+" FROM game_elements WHERE id = ?", id))
}

// normalizePlayerFields ne garde que les rubriques connues, sans doublon, dans
// un ordre stable.
func normalizePlayerFields(in []string) []string {
	want := map[string]bool{}
	for _, f := range in {
		want[f] = true
	}
	out := []string{}
	for _, f := range allPlayerFields {
		if want[f] {
			out = append(out, f)
		}
	}
	return out
}

// elementForPlayers retourne une copie de la fiche réduite aux rubriques
// rendues visibles par le MJ.
func elementForPlayers(e *domain.GameElement) *domain.GameElement {
	show := map[string]bool{}
	for _, f := range e.PlayerFields {
		show[f] = true
	}
	out := &domain.GameElement{
		ID:           e.ID,
		GameID:       e.GameID,
		Category:     e.Category,
		CreatedAt:    e.CreatedAt,
		IconPosX:     e.IconPosX,
		IconPosY:     e.IconPosY,
		IconScale:    e.IconScale,
		PlayerFields: e.PlayerFields,
		Name:         "Créature inconnue",
	}
	if show[FieldName] {
		out.Name = e.Name
	}
	if show[FieldImage] {
		out.ImageURL = e.ImageURL
	}
	if show[FieldDescription] {
		out.Description = e.Description
	}
	if show[FieldUniqueTrait] {
		out.UniqueTrait = e.UniqueTrait
	}
	if show[FieldLoot] {
		out.Loot = e.Loot
	}
	if show[FieldStats] {
		out.MaxHp, out.MaxMana = e.MaxHp, e.MaxMana
	}
	return out
}

// isDefeatedInGame indique si un monstre de cette bibliothèque est vaincu et
// visible sur une carte de la partie (ou sur la carte qu'elle affiche).
func (s *Server) isDefeatedInGame(gameID, elementID int64) bool {
	var ok int
	_ = s.db.QueryRow(`
		SELECT 1 FROM tokens t
		JOIN maps m ON m.id = t.map_id
		WHERE t.element_id = ? AND t.kind = 'MORT' AND t.visible_to_players = 1
		  AND (m.game_id = ? OR m.id = (SELECT current_map_id FROM games WHERE id = ?))
		LIMIT 1`, elementID, gameID, gameID).Scan(&ok)
	return ok == 1
}
