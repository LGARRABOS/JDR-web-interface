package httpapi

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

func (s *Server) registerTokenRoutes() {
	s.mux.Route("/api/maps/{mapId}/tokens", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireMapAccess)
		r.Get("/", s.handleListTokens)
		r.Post("/", s.handleCreateToken)
	})
	s.mux.Route("/api/tokens/{id}", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Patch("/", s.handleUpdateToken)
		r.Delete("/", s.handleDeleteToken)
	})
}

var tokenColors = []string{
	"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
	"#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#84cc16",
}

func (s *Server) handleListTokens(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	if mapID == 0 {
		mapIDStr := chi.URLParam(r, "mapId")
		var err error
		mapID, err = strconv.ParseInt(mapIDStr, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
			return
		}
	}

	gameID := getGameIDFromContext(r)
	u := s.getSessionUser(r)
	role := getGameRoleFromContext(r)
	if gameID == 0 || role == "" {
		var ok bool
		gameID, role, ok = s.getMapAccess(mapID, u.ID)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
			return
		}
	}

	if role == "PLAYER" && u.ID > 0 {
		var count int
		_ = s.db.QueryRow("SELECT 1 FROM tokens WHERE map_id = ? AND owner_user_id = ?", mapID, u.ID).Scan(&count)
		if count == 0 {
			var charName sql.NullString
			_ = s.db.QueryRow("SELECT character_name FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&charName)
			tokenName := u.DisplayName
			if charName.Valid && charName.String != "" {
				tokenName = charName.String
			}
			color := tokenColors[int(u.ID)%len(tokenColors)]
			var id int64
			res, insertErr := s.db.Exec(`
				INSERT INTO tokens (map_id, created_by, owner_user_id, kind, name, color, x, y, visible_to_players)
				SELECT ?, ?, ?, 'PJ', ?, ?, 100, 100, 1
				WHERE NOT EXISTS (SELECT 1 FROM tokens WHERE map_id = ? AND owner_user_id = ? AND kind = 'PJ')
			`, mapID, u.ID, u.ID, tokenName, color, mapID, u.ID)
			inserted := false
			if insertErr != nil {
				if !isUniqueViolation(insertErr) {
					// erreur non récupérable, on continue sans auto-création
				}
			} else if rows, raErr := res.RowsAffected(); raErr == nil && rows > 0 {
				inserted = true
			}
			if queryErr := s.db.QueryRow("SELECT id FROM tokens WHERE map_id = ? AND owner_user_id = ? AND kind = 'PJ'", mapID, u.ID).Scan(&id); queryErr != nil {
				id = 0
			}
			if id > 0 && inserted {
				var t domain.Token
				var ownerID sql.NullInt64
				var iconURL sql.NullString
				var visible int
				var hp, maxHp, mana, maxMana sql.NullInt64
				var width, height sql.NullInt64
				var elemID sql.NullInt64
				var iconPosX, iconPosY int
				var iconScale float64
				var attackRange sql.NullInt64
				var statusEffectsJSON string
				_ = s.db.QueryRow(`
					SELECT id, map_id, created_by, owner_user_id, kind, name, color, icon_url, x, y, visible_to_players, hp, max_hp, mana, max_mana, width, height, COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1), attack_range, element_id, COALESCE(status_effects::text, '[]')
					FROM tokens WHERE id = ?
				`, id).Scan(&t.ID, &t.MapID, &t.CreatedBy, &ownerID, &t.Kind, &t.Name, &t.Color, &iconURL, &t.X, &t.Y, &visible, &hp, &maxHp, &mana, &maxMana, &width, &height, &iconPosX, &iconPosY, &iconScale, &attackRange, &elemID, &statusEffectsJSON)
				_ = json.Unmarshal([]byte(statusEffectsJSON), &t.StatusEffects)
				t.IconPosX = iconPosX
				t.IconPosY = iconPosY
				t.IconScale = iconScale
				if attackRange.Valid {
					ar := int(attackRange.Int64)
					t.AttackRange = &ar
				}

				if elemID.Valid {
					t.ElementID = &elemID.Int64
				}
				if width.Valid {
					w := int(width.Int64)
					t.Width = &w
				}
				if height.Valid {
					h := int(height.Int64)
					t.Height = &h
				}
				if hp.Valid {
					h := int(hp.Int64)
					t.Hp = &h
				}
				if maxHp.Valid {
					m := int(maxHp.Int64)
					t.MaxHp = &m
				}
				if mana.Valid {
					m := int(mana.Int64)
					t.Mana = &m
				}
				if maxMana.Valid {
					m := int(maxMana.Int64)
					t.MaxMana = &m
				}
				t.OwnerUserID = &u.ID
				t.VisibleToPlayers = true
				if iconURL.Valid {
					t.IconURL = iconURL.String
				}
				s.hub.Broadcast(gameID, "token.created", t)
			}
		}
	}

	rows, err := s.db.Query(`
		SELECT id, map_id, created_by, owner_user_id, kind, name, color, icon_url, x, y, visible_to_players, hp, max_hp, mana, max_mana, width, height, COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1), attack_range, element_id, COALESCE(status_effects::text, '[]')
		FROM tokens WHERE map_id = ?
	`, mapID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var tokens []*domain.Token
	for rows.Next() {
		var t domain.Token
		var ownerID, elemID sql.NullInt64
		var iconURL sql.NullString
		var visible int
		var hp, maxHp, mana, maxMana, width, height sql.NullInt64
		var iconPosX, iconPosY int
		var iconScale float64
		var attackRange sql.NullInt64
		var statusEffectsJSON string
		if err := rows.Scan(&t.ID, &t.MapID, &t.CreatedBy, &ownerID, &t.Kind, &t.Name, &t.Color, &iconURL, &t.X, &t.Y, &visible, &hp, &maxHp, &mana, &maxMana, &width, &height, &iconPosX, &iconPosY, &iconScale, &attackRange, &elemID, &statusEffectsJSON); err != nil {
			continue
		}
		_ = json.Unmarshal([]byte(statusEffectsJSON), &t.StatusEffects)
		t.IconPosX = iconPosX
		t.IconPosY = iconPosY
		t.IconScale = iconScale
		if attackRange.Valid {
			ar := int(attackRange.Int64)
			t.AttackRange = &ar
		}
		if ownerID.Valid {
			t.OwnerUserID = &ownerID.Int64
		}
		if elemID.Valid {
			t.ElementID = &elemID.Int64
		}
		if iconURL.Valid {
			t.IconURL = iconURL.String
		}
		t.VisibleToPlayers = visible == 1
		if hp.Valid {
			h := int(hp.Int64)
			t.Hp = &h
		}
		if maxHp.Valid {
			m := int(maxHp.Int64)
			t.MaxHp = &m
		}
		if mana.Valid {
			m := int(mana.Int64)
			t.Mana = &m
		}
		if maxMana.Valid {
			m := int(maxMana.Int64)
			t.MaxMana = &m
		}
		if width.Valid {
			w := int(width.Int64)
			t.Width = &w
		}
		if height.Valid {
			h := int(height.Int64)
			t.Height = &h
		}
		tokens = append(tokens, &t)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"tokens": tokens})
}

type createTokenReq struct {
	Kind             string  `json:"kind"`
	Name             string  `json:"name"`
	Color            string  `json:"color"`
	IconURL          string  `json:"iconUrl"`
	X                float64 `json:"x"`
	Y                float64 `json:"y"`
	Width            *int    `json:"width"`
	Height           *int    `json:"height"`
	OwnerUserID      *int64  `json:"ownerUserId"`
	VisibleToPlayers bool    `json:"visibleToPlayers"`
	Hp               *int    `json:"hp"`
	MaxHp            *int    `json:"maxHp"`
	Mana             *int    `json:"mana"`
	MaxMana          *int    `json:"maxMana"`
	ElementID        *int64  `json:"elementId"`
}

func (s *Server) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	gameID := getGameIDFromContext(r)
	if mapID == 0 {
		mapIDStr := chi.URLParam(r, "mapId")
		var err error
		mapID, err = strconv.ParseInt(mapIDStr, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
			return
		}
	}
	if gameID == 0 {
		var err error
		gameID, err = s.getMapGameID(mapID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"message": "Carte introuvable"})
			return
		}
	}

	u := s.getSessionUser(r)
	role := getGameRoleFromContext(r)
	if role == "" {
		var ok bool
		_, role, ok = s.getMapAccess(mapID, u.ID)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
			return
		}
	}
	if role != "MJ" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Réservé au MJ"})
		return
	}

	var req createTokenReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Kind == "" {
		req.Kind = "PNJ"
	}
	if req.Name == "" {
		req.Name = "Token"
	}
	if req.Color == "" {
		req.Color = "#6b7280"
	}
	visible := 0
	if req.VisibleToPlayers {
		visible = 1
	}

	iconPosX, iconPosY := 50, 50
	iconScale := 1.0
	if req.ElementID != nil {
		var ex, ey int
		var es float64
		if err := s.db.QueryRow("SELECT COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1) FROM game_elements WHERE id = ?", *req.ElementID).Scan(&ex, &ey, &es); err == nil {
			iconPosX, iconPosY, iconScale = ex, ey, es
		}
	}

	var id int64
	err := s.db.QueryRow(`
		INSERT INTO tokens (map_id, created_by, owner_user_id, kind, name, color, icon_url, x, y, visible_to_players, hp, max_hp, mana, max_mana, width, height, icon_pos_x, icon_pos_y, icon_scale, element_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
	`, mapID, u.ID, nullInt64(req.OwnerUserID), req.Kind, req.Name, req.Color, nullString(req.IconURL), req.X, req.Y, visible, nullInt(req.Hp), nullInt(req.MaxHp), nullInt(req.Mana), nullInt(req.MaxMana), nullInt(req.Width), nullInt(req.Height), iconPosX, iconPosY, iconScale, nullInt64(req.ElementID)).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	t := &domain.Token{
		ID:               id,
		MapID:             mapID,
		CreatedBy:         u.ID,
		OwnerUserID:       req.OwnerUserID,
		Kind:              req.Kind,
		Name:              req.Name,
		Color:             req.Color,
		IconURL:           req.IconURL,
		X:                 req.X,
		Y:                 req.Y,
		Width:             req.Width,
		Height:            req.Height,
		IconPosX:          iconPosX,
		IconPosY:          iconPosY,
		IconScale:         iconScale,
		VisibleToPlayers:  req.VisibleToPlayers,
		Hp:                req.Hp,
		MaxHp:             req.MaxHp,
		Mana:              req.Mana,
		MaxMana:           req.MaxMana,
		ElementID:         req.ElementID,
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"token": t})
	s.hub.Broadcast(gameID, "token.created", t)
}

type updateTokenReq struct {
	X                *float64            `json:"x"`
	Y                *float64            `json:"y"`
	Name             *string             `json:"name"`
	Color            *string             `json:"color"`
	IconURL          *string             `json:"iconUrl"`
	Width            *int                `json:"width"`
	Height           *int                `json:"height"`
	IconPosX         *int                `json:"iconPosX"`
	IconPosY         *int                `json:"iconPosY"`
	IconScale        *float64            `json:"iconScale"`
	AttackRange      *int                `json:"attackRange"`
	VisibleToPlayers *bool               `json:"visibleToPlayers"`
	Hp               *int                `json:"hp"`
	MaxHp            *int                `json:"maxHp"`
	Mana             *int                `json:"mana"`
	MaxMana          *int                `json:"maxMana"`
	StatusEffects    *[]domain.StatusEffect `json:"statusEffects"`
}

func (s *Server) handleUpdateToken(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	u := s.getSessionUser(r)
	_, gameID, kind, ownerUserID, err := s.getTokenContext(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Token introuvable"})
		return
	}

	role, member := s.getUserGameRole(gameID, u.ID)
	if !member {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	var req updateTokenReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	movementLocked := s.isTokenMovementLocked(gameID)
	if role != "MJ" {
		if movementLocked {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Déplacement des jetons verrouillé"})
			return
		}
		if kind != "PJ" || ownerUserID == nil || *ownerUserID != u.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
			return
		}
	}
	if movementLocked && role != "MJ" && (req.X != nil || req.Y != nil) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Seul le MJ peut déplacer les jetons"})
		return
	}

	currentKind := kind
	convertToMort := req.Hp != nil && *req.Hp == 0 && currentKind == "PNJ"

	updates := []string{}
	args := []interface{}{}
	if req.X != nil {
		updates = append(updates, "x = ?")
		args = append(args, *req.X)
	}
	if req.Y != nil {
		updates = append(updates, "y = ?")
		args = append(args, *req.Y)
	}
	if req.Name != nil {
		updates = append(updates, "name = ?")
		args = append(args, *req.Name)
	}
	if req.Color != nil {
		updates = append(updates, "color = ?")
		args = append(args, *req.Color)
	}
	if req.VisibleToPlayers != nil {
		v := 0
		if *req.VisibleToPlayers {
			v = 1
		}
		updates = append(updates, "visible_to_players = ?")
		args = append(args, v)
	}
	if convertToMort {
		updates = append(updates, "kind = ?", "hp = NULL", "max_hp = NULL", "mana = NULL", "max_mana = NULL")
		args = append(args, "MORT")
	} else {
		if req.Hp != nil {
			updates = append(updates, "hp = ?")
			args = append(args, *req.Hp)
		}
		if req.MaxHp != nil {
			updates = append(updates, "max_hp = ?")
			args = append(args, *req.MaxHp)
		}
		if req.Mana != nil {
			updates = append(updates, "mana = ?")
			args = append(args, *req.Mana)
		}
		if req.MaxMana != nil {
			updates = append(updates, "max_mana = ?")
			args = append(args, *req.MaxMana)
		}
	}
	if req.StatusEffects != nil {
		statusJSON, _ := json.Marshal(*req.StatusEffects)
		updates = append(updates, "status_effects = ?::jsonb")
		args = append(args, string(statusJSON))
	}
	if req.IconURL != nil {
		updates = append(updates, "icon_url = ?")
		args = append(args, *req.IconURL)
	}
	if req.Width != nil {
		updates = append(updates, "width = ?")
		args = append(args, *req.Width)
	}
	if req.Height != nil {
		updates = append(updates, "height = ?")
		args = append(args, *req.Height)
	}
	if req.IconPosX != nil {
		updates = append(updates, "icon_pos_x = ?")
		args = append(args, *req.IconPosX)
	}
	if req.IconPosY != nil {
		updates = append(updates, "icon_pos_y = ?")
		args = append(args, *req.IconPosY)
	}
	if req.IconScale != nil {
		updates = append(updates, "icon_scale = ?")
		args = append(args, *req.IconScale)
	}
	if req.AttackRange != nil {
		updates = append(updates, "attack_range = ?")
		args = append(args, *req.AttackRange)
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucune modification"})
		return
	}
	args = append(args, id)

	_, err = s.db.Exec("UPDATE tokens SET "+joinStrings(updates, ", ")+" WHERE id = ?", args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	var t domain.Token
	var ownerID, elemID sql.NullInt64
	var iconURL sql.NullString
	var visible int
	var hp, maxHp, mana, maxMana, width, height sql.NullInt64
	var iconPosX, iconPosY int
	var iconScale float64
	var attackRange sql.NullInt64
	var statusEffectsJSON string
	_ = s.db.QueryRow(`
		SELECT id, map_id, created_by, owner_user_id, kind, name, color, icon_url, x, y, visible_to_players, hp, max_hp, mana, max_mana, width, height, COALESCE(icon_pos_x, 50), COALESCE(icon_pos_y, 50), COALESCE(icon_scale, 1), attack_range, element_id, COALESCE(status_effects::text, '[]')
		FROM tokens WHERE id = ?
	`, id).Scan(&t.ID, &t.MapID, &t.CreatedBy, &ownerID, &t.Kind, &t.Name, &t.Color, &iconURL, &t.X, &t.Y, &visible, &hp, &maxHp, &mana, &maxMana, &width, &height, &iconPosX, &iconPosY, &iconScale, &attackRange, &elemID, &statusEffectsJSON)
	_ = json.Unmarshal([]byte(statusEffectsJSON), &t.StatusEffects)
	t.IconPosX = iconPosX
	t.IconPosY = iconPosY
	t.IconScale = iconScale
	if attackRange.Valid {
		ar := int(attackRange.Int64)
		t.AttackRange = &ar
	}
	if ownerID.Valid {
		t.OwnerUserID = &ownerID.Int64
	}
	if elemID.Valid {
		t.ElementID = &elemID.Int64
	}
	if iconURL.Valid {
		t.IconURL = iconURL.String
	}
	t.VisibleToPlayers = visible == 1
	if hp.Valid {
		h := int(hp.Int64)
		t.Hp = &h
	}
	if maxHp.Valid {
		m := int(maxHp.Int64)
		t.MaxHp = &m
	}
	if mana.Valid {
		m := int(mana.Int64)
		t.Mana = &m
	}
	if maxMana.Valid {
		m := int(maxMana.Int64)
		t.MaxMana = &m
	}
	if width.Valid {
		w := int(width.Int64)
		t.Width = &w
	}
	if height.Valid {
		h := int(height.Int64)
		t.Height = &h
	}
	// Sync token → fiche personnage et game_players pour les jetons PJ (nom, hp, maxHp)
	if t.Kind == "PJ" && t.OwnerUserID != nil {
		if req.Name != nil {
			_, _ = s.db.Exec("UPDATE game_players SET character_name = ? WHERE game_id = ? AND user_id = ?", *req.Name, gameID, *t.OwnerUserID)
			s.hub.Broadcast(gameID, "character.updated", map[string]interface{}{"userId": *t.OwnerUserID, "characterName": *req.Name})
		}
		var dataJSON []byte
		err := s.db.QueryRow("SELECT data FROM game_character_sheets WHERE game_id = ? AND user_id = ?", gameID, *t.OwnerUserID).Scan(&dataJSON)
		if err == nil && len(dataJSON) > 0 {
			var data map[string]interface{}
			if json.Unmarshal(dataJSON, &data) == nil {
				changed := false
				if req.Name != nil {
					if identite, ok := data["identite"].(map[string]interface{}); ok {
						identite["nom"] = *req.Name
						changed = true
					} else {
						data["identite"] = map[string]interface{}{"nom": *req.Name}
						changed = true
					}
				}
				if req.Hp != nil || req.MaxHp != nil || req.Mana != nil || req.MaxMana != nil {
					if stats, ok := data["statsCombat"].(map[string]interface{}); ok {
						if req.Hp != nil {
							stats["vie"] = strconv.Itoa(*req.Hp)
							changed = true
						}
						if req.MaxHp != nil {
							stats["vieMax"] = strconv.Itoa(*req.MaxHp)
							changed = true
						}
						if req.Mana != nil {
							stats["aether"] = strconv.Itoa(*req.Mana)
							changed = true
						}
						if req.MaxMana != nil {
							stats["aetherMax"] = strconv.Itoa(*req.MaxMana)
							changed = true
						}
					} else {
						stats := make(map[string]interface{})
						if req.Hp != nil {
							stats["vie"] = strconv.Itoa(*req.Hp)
							changed = true
						}
						if req.MaxHp != nil {
							stats["vieMax"] = strconv.Itoa(*req.MaxHp)
							changed = true
						}
						if req.Mana != nil {
							stats["aether"] = strconv.Itoa(*req.Mana)
							changed = true
						}
						if req.MaxMana != nil {
							stats["aetherMax"] = strconv.Itoa(*req.MaxMana)
							changed = true
						}
						if changed {
							data["statsCombat"] = stats
						}
					}
				}
				if changed {
					newJSON, _ := json.Marshal(data)
					_, _ = s.db.Exec("UPDATE game_character_sheets SET data = ?::jsonb WHERE game_id = ? AND user_id = ?", string(newJSON), gameID, *t.OwnerUserID)
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"token": t})
	s.hub.Broadcast(gameID, "token.updated", t)
}

func (s *Server) handleDeleteToken(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ID invalide"})
		return
	}

	u := s.getSessionUser(r)
	_, gameID, kind, ownerUserID, err := s.getTokenContext(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Token introuvable"})
		return
	}

	role, member := s.getUserGameRole(gameID, u.ID)
	if !member {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
		return
	}

	if role != "MJ" {
		if s.isTokenMovementLocked(gameID) {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Suppression des jetons verrouillée"})
			return
		}
		if kind != "PJ" || ownerUserID == nil || *ownerUserID != u.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Accès refusé"})
			return
		}
	}

	_, err = s.db.Exec("DELETE FROM tokens WHERE id = ?", id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Supprimé"})
	s.hub.Broadcast(gameID, "token.deleted", map[string]interface{}{"id": id})
}

func nullInt64(p *int64) interface{} {
	if p == nil {
		return nil
	}
	return *p
}

func nullInt(p *int) interface{} {
	if p == nil {
		return nil
	}
	return *p
}

func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	out := ss[0]
	for i := 1; i < len(ss); i++ {
		out += sep + ss[i]
	}
	return out
}
