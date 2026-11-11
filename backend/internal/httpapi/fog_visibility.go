package httpapi

import (
	"jdr-backend/internal/domain"
	"jdr-backend/internal/realtime"
)

// Ce que les joueurs voient sous le brouillard, calculé par le serveur : un
// ennemi caché n'est pas envoyé du tout (même logique que frontend/src/fog/fog.ts).

func fogPatchContains(p *fogPatch, x, y float64) bool {
	if p.Shape == "ellipse" {
		rx, ry := p.W/2, p.H/2
		if rx <= 0 || ry <= 0 {
			return false
		}
		dx, dy := (x-(p.X+rx))/rx, (y-(p.Y+ry))/ry
		return dx*dx+dy*dy <= 1
	}
	return x >= p.X && x <= p.X+p.W && y >= p.Y && y <= p.Y+p.H
}

func fogRevealed(st *fogState, x, y float64) bool {
	if st == nil || !st.Enabled {
		return true
	}
	for i := len(st.Patches) - 1; i >= 0; i-- {
		if fogPatchContains(st.Patches[i], x, y) {
			return st.Patches[i].Reveal
		}
	}
	return false
}

// pointVisibleToPlayers : zones découvertes par le MJ, plus un cercle de vision
// autour des personnages quand il est activé. Sans brouillard ni vision, tout
// est visible.
func pointVisibleToPlayers(st *fogState, radius int, characters [][2]float64, x, y float64) bool {
	vision := radius > 0 && len(characters) > 0
	if vision {
		r := float64(radius)
		for _, c := range characters {
			if (c[0]-x)*(c[0]-x)+(c[1]-y)*(c[1]-y) <= r*r {
				return true
			}
		}
	}
	if st != nil && st.Enabled {
		return fogRevealed(st, x, y)
	}
	return !vision
}

// playerView réunit ce qu'il faut pour filtrer les jetons d'une carte dans une partie.
type playerView struct {
	fog        *fogState
	radius     int
	characters [][2]float64
}

func (v *playerView) sees(t *domain.Token) bool {
	if t.Kind == "PJ" {
		return true // les personnages restent toujours visibles
	}
	return t.VisibleToPlayers && pointVisibleToPlayers(v.fog, v.radius, v.characters, t.X, t.Y)
}

func (s *Server) gameVisionRadius(gameID int64) int {
	var r int
	_ = s.db.QueryRow("SELECT COALESCE(fog_vision_radius, 0) FROM games WHERE id = ?", gameID).Scan(&r)
	return r
}

func (s *Server) loadPlayerView(gameID, mapID int64) *playerView {
	v := &playerView{radius: s.gameVisionRadius(gameID)}
	v.fog, _ = s.getFogState(mapID)
	rows, err := s.db.Query("SELECT x, y FROM tokens WHERE map_id = ? AND kind = 'PJ'", mapID)
	if err != nil {
		return v
	}
	defer rows.Close()
	for rows.Next() {
		var x, y float64
		if rows.Scan(&x, &y) == nil {
			v.characters = append(v.characters, [2]float64{x, y})
		}
	}
	return v
}

// filterTokensForPlayers retire les jetons que les joueurs de cette partie ne voient pas.
func (s *Server) filterTokensForPlayers(gameID, mapID int64, tokens []*domain.Token) []*domain.Token {
	v := s.loadPlayerView(gameID, mapID)
	out := make([]*domain.Token, 0, len(tokens))
	for _, t := range tokens {
		if v.sees(t) {
			out = append(out, t)
		}
	}
	return out
}

// refreshPlayerTokens renvoie aux joueurs la liste complète des jetons visibles
// d'une carte : à appeler quand ce qu'ils voient change d'un coup (brouillard
// modifié, rayon de vision, personnage déplacé avec la vision active).
func (s *Server) refreshPlayerTokens(mapID int64, onlyWithVision bool) {
	for _, gameID := range s.gamesShowingMap(mapID) {
		if onlyWithVision && s.gameVisionRadius(gameID) <= 0 {
			continue
		}
		tokens, err := s.listMapTokens(mapID, false)
		if err != nil {
			continue
		}
		payload := map[string]any{"mapId": mapID, "tokens": s.filterTokensForPlayers(gameID, mapID, tokens)}
		s.hub.BroadcastFunc(gameID, func(m realtime.Member) (string, any, bool) {
			if m.IsGM() {
				return "", nil, false
			}
			return "scene.tokens", payload, true
		})
	}
}
