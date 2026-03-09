package httpapi

import (
	"database/sql"
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/domain"
)

func (s *Server) registerRollRoutes() {
	s.mux.Route("/api/games/{gameId}/roll", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Post("/", s.handleRoll)
	})
	s.mux.Route("/api/games/{gameId}/rolls", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Get("/", s.handleListRolls)
	})
}

type rollReq struct {
	Expression string `json:"expression"`
}

func (s *Server) handleRoll(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	u := s.getSessionUser(r)
	var role string
	var characterName sql.NullString
	_ = s.db.QueryRow("SELECT role, character_name FROM game_players WHERE game_id = ? AND user_id = ?", gameID, u.ID).Scan(&role, &characterName)
	displayName := u.DisplayName
	if characterName.Valid && characterName.String != "" {
		displayName = characterName.String
	}

	var req rollReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Expression == "" {
		req.Expression = "1d20"
	}

	result, details, err := parseAndRoll(req.Expression)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Expression invalide: " + err.Error()})
		return
	}

	res, err := s.db.Exec(
		"INSERT INTO dice_rolls (game_id, user_id, expression, result, details) VALUES (?, ?, ?, ?, ?)",
		gameID, u.ID, req.Expression, result, details,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	id, _ := res.LastInsertId()

	roll := &domain.DiceRoll{
		ID: id, GameID: gameID, UserID: u.ID,
		Expression: req.Expression, Result: result, Details: details,
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"roll": roll})

	payload := map[string]interface{}{
		"id": id, "gameId": gameID, "userId": u.ID,
		"expression": req.Expression, "result": result, "details": details,
		"displayName": displayName,
	}
	s.hub.Broadcast(gameID, "dice.rolled", payload)
}

func (s *Server) handleListRolls(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if gameID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "gameId requis"})
		return
	}

	rows, err := s.db.Query(`
		SELECT id, game_id, user_id, expression, result, details, created_at
		FROM dice_rolls WHERE game_id = ?
		ORDER BY created_at DESC LIMIT 50
	`, gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	defer rows.Close()

	var rolls []*domain.DiceRoll
	for rows.Next() {
		var roll domain.DiceRoll
		if err := rows.Scan(&roll.ID, &roll.GameID, &roll.UserID, &roll.Expression, &roll.Result, &roll.Details, &roll.CreatedAt); err != nil {
			continue
		}
		rolls = append(rolls, &roll)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"rolls": rolls})
}

// parseAndRoll parse une expression du type "2d6+3" ou "1d20" et retourne (résultat, détails, err).
func parseAndRoll(expr string) (int, string, error) {
	expr = strings.TrimSpace(strings.ToLower(expr))
	// Format simple: NdM ou NdM+K
	var n, m, mod int
	_, err := parseDiceExpr(expr, &n, &m, &mod)
	if err != nil {
		return 0, "", err
	}

	sum := mod
	var parts []string
	for i := 0; i < n; i++ {
		v := rand.Intn(m) + 1
		sum += v
		parts = append(parts, strconv.Itoa(v))
	}
	details := strings.Join(parts, "+")
	if mod != 0 {
		details += " + " + strconv.Itoa(mod)
	}
	return sum, details, nil
}

func parseDiceExpr(s string, n, m, mod *int) (int, error) {
	*n, *m, *mod = 1, 20, 0
	idx := strings.Index(s, "d")
	if idx < 0 {
		return 0, nil // pas une expr dés
	}
	if idx > 0 {
		*n, _ = strconv.Atoi(strings.TrimSpace(s[:idx]))
		if *n <= 0 {
			*n = 1
		}
	}
	rest := s[idx+1:]
	plus := strings.Index(rest, "+")
	minus := strings.Index(rest, "-")
	if plus >= 0 && (minus < 0 || plus < minus) {
		*m, _ = strconv.Atoi(strings.TrimSpace(rest[:plus]))
		*mod, _ = strconv.Atoi(strings.TrimSpace(rest[plus+1:]))
	} else if minus >= 0 {
		*m, _ = strconv.Atoi(strings.TrimSpace(rest[:minus]))
		v, _ := strconv.Atoi(strings.TrimSpace(rest[minus+1:]))
		*mod = -v
	} else {
		*m, _ = strconv.Atoi(strings.TrimSpace(rest))
	}
	if *m <= 0 {
		*m = 20
	}
	return 0, nil
}
