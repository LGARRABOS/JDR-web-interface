package httpapi

import (
	"encoding/json"
	"math"
	"net/http"
)

// Brouillard de guerre : chaque carte peut être couverte de brouillard. Le MJ
// dessine des zones (rectangles ou ellipses) qui révèlent ou recouvrent la
// carte ; elles s'appliquent dans l'ordre, la dernière zone qui touche un point
// décide s'il est visible.

type fogPatch struct {
	ID     int64   `json:"id"`
	MapID  int64   `json:"mapId"`
	Shape  string  `json:"shape"` // rect, ellipse
	X      float64 `json:"x"`     // coin haut-gauche, coordonnées de la carte
	Y      float64 `json:"y"`
	W      float64 `json:"w"`
	H      float64 `json:"h"`
	Reveal bool    `json:"reveal"` // true : révèle ; false : recouvre
}

type fogState struct {
	MapID   int64       `json:"mapId"`
	Enabled bool        `json:"enabled"`
	Patches []*fogPatch `json:"patches"`
}

type fogShapeData struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

const maxFogPatches = 500

func (s *Server) getFogState(mapID int64) (*fogState, error) {
	st := &fogState{MapID: mapID, Patches: []*fogPatch{}}
	var enabled int
	if err := s.db.QueryRow("SELECT COALESCE(fog_enabled, 0) FROM maps WHERE id = ?", mapID).Scan(&enabled); err != nil {
		return nil, err
	}
	st.Enabled = enabled == 1
	rows, err := s.db.Query(
		"SELECT id, shape_type, shape_data, revealed FROM fog_patches WHERE map_id = ? ORDER BY id", mapID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p fogPatch
		var data string
		var revealed int
		if err := rows.Scan(&p.ID, &p.Shape, &data, &revealed); err != nil {
			return nil, err
		}
		var d fogShapeData
		if json.Unmarshal([]byte(data), &d) != nil {
			continue // anciennes zones au format inconnu
		}
		p.MapID, p.X, p.Y, p.W, p.H, p.Reveal = mapID, d.X, d.Y, d.W, d.H, revealed == 1
		st.Patches = append(st.Patches, &p)
	}
	return st, rows.Err()
}

// broadcastFogState envoie l'état complet du brouillard aux parties qui
// affichent la carte.
func (s *Server) broadcastFogState(mapID int64) *fogState {
	st, err := s.getFogState(mapID)
	if err != nil {
		return nil
	}
	s.broadcastMapEvent(mapID, "fog.state", st)
	s.refreshPlayerTokens(mapID, false)
	return st
}

func (s *Server) handleGetFog(w http.ResponseWriter, r *http.Request) {
	st, err := s.getFogState(getMapIDFromContext(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"fog": st})
}

type fogPatchReq struct {
	Shape  string  `json:"shape"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	W      float64 `json:"w"`
	H      float64 `json:"h"`
	Reveal bool    `json:"reveal"`
}

// normalizeFogRect remet un rectangle dessiné dans n'importe quel sens à
// l'endroit (largeur et hauteur positives).
func normalizeFogRect(x, y, w, h float64) (float64, float64, float64, float64) {
	if w < 0 {
		x, w = x+w, -w
	}
	if h < 0 {
		y, h = y+h, -h
	}
	return x, y, w, h
}

func validFogNumber(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && math.Abs(v) < 1e7
}

func (s *Server) handleAddFogPatch(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	var req fogPatchReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}
	if req.Shape == "" {
		req.Shape = "rect"
	}
	if req.Shape != "rect" && req.Shape != "ellipse" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Forme inconnue"})
		return
	}
	for _, v := range []float64{req.X, req.Y, req.W, req.H} {
		if !validFogNumber(v) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Zone invalide"})
			return
		}
	}
	x, y, wd, ht := normalizeFogRect(req.X, req.Y, req.W, req.H)
	if wd < 1 || ht < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Zone trop petite"})
		return
	}
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM fog_patches WHERE map_id = ?", mapID).Scan(&count)
	if count >= maxFogPatches {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Trop de zones : utilisez « Tout révéler » ou « Tout cacher » pour repartir de zéro"})
		return
	}

	data, _ := json.Marshal(fogShapeData{X: x, Y: y, W: wd, H: ht})
	revealed := 0
	if req.Reveal {
		revealed = 1
	}
	var id int64
	if err := s.db.QueryRow(
		"INSERT INTO fog_patches (map_id, shape_type, shape_data, revealed) VALUES (?, ?, ?, ?) RETURNING id",
		mapID, req.Shape, string(data), revealed,
	).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	p := &fogPatch{ID: id, MapID: mapID, Shape: req.Shape, X: x, Y: y, W: wd, H: ht, Reveal: req.Reveal}
	writeJSON(w, http.StatusCreated, map[string]any{"patch": p})
	s.broadcastMapEvent(mapID, "fog.patch", p)
	s.refreshPlayerTokens(mapID, false)
}

// handleUndoFog retire la dernière zone dessinée.
func (s *Server) handleUndoFog(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	if _, err := s.db.Exec(
		"DELETE FROM fog_patches WHERE id = (SELECT MAX(id) FROM fog_patches WHERE map_id = ?)", mapID,
	); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"fog": s.broadcastFogState(mapID)})
}

// handleResetFog efface toutes les zones. Avec revealAll, la carte entière est
// révélée (une seule zone couvrant tout), sinon elle est entièrement cachée.
func (s *Server) handleResetFog(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	var req struct {
		RevealAll bool `json:"revealAll"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if _, err := s.db.Exec("DELETE FROM fog_patches WHERE map_id = ?", mapID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if req.RevealAll {
		m, err := s.getMap(mapID)
		if err == nil {
			data, _ := json.Marshal(fogShapeData{X: 0, Y: 0, W: float64(m.Width), H: float64(m.Height)})
			_, _ = s.db.Exec(
				"INSERT INTO fog_patches (map_id, shape_type, shape_data, revealed) VALUES (?, 'rect', ?, 1)",
				mapID, string(data),
			)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"fog": s.broadcastFogState(mapID)})
}

// handleSetFogEnabled active ou coupe le brouillard sur la carte.
func (s *Server) handleSetFogEnabled(w http.ResponseWriter, r *http.Request) {
	mapID := getMapIDFromContext(r)
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "enabled requis"})
		return
	}
	v := 0
	if *req.Enabled {
		v = 1
	}
	if _, err := s.db.Exec("UPDATE maps SET fog_enabled = ? WHERE id = ?", v, mapID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"fog": s.broadcastFogState(mapID)})
}
