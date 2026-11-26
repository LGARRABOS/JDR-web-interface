package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"jdr-backend/internal/adventures/arpenteur"
	"jdr-backend/internal/docimport"
	"jdr-backend/internal/realtime"
)

// Mode GEMMA « Arpenteur » : le groupe commande un vaisseau des sables. Son
// état (construction, équipage, canons, cale, cave, carte) tient dans un
// document JSON par partie, modifié section par section selon les postes
// occupés par les personnages des joueurs (voir internal/adventures/arpenteur).

const (
	gemmaVariantArpenteur = "arpenteur"
	uploadsArpenteurBase  = "uploads/arpenteur"
	maxArpenteurImport    = 10 << 20
	maxArpenteurImage     = 15 << 20
	maxArpenteurPatch     = 2 << 20
)

// arpenteurLocks : un verrou par partie, pour que deux modifications
// simultanées (lecture → modification → écriture) ne s'écrasent pas.
var arpenteurLocks sync.Map

func lockArpenteur(gameID int64) func() {
	v, _ := arpenteurLocks.LoadOrStore(gameID, &sync.Mutex{})
	mu := v.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

// arpenteurPayload : document et version, tel qu'envoyé aux clients.
type arpenteurPayload struct {
	Arpenteur arpenteur.Doc `json:"arpenteur"`
	Version   int64         `json:"version"`
}

func (s *Server) registerArpenteurRoutes() {
	s.mux.Route("/api/games/{gameId}/arpenteur", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Use(s.requireGameAccess)
		r.Use(s.requireArpenteurGame)
		r.Get("/", s.handleGetArpenteur)
		r.Patch("/", s.handlePatchArpenteur)
		r.With(s.requireGM).Post("/import", s.handleImportArpenteur)
		r.With(s.requireGM).Post("/image", s.handleArpenteurImage)
		r.With(s.requireGM).Post("/reset", s.handleResetArpenteur)
		r.Get("/file/{filename}", s.handleArpenteurFile)
	})
}

func (s *Server) gemmaVariant(gameID int64) string {
	var v string
	_ = s.db.QueryRow("SELECT COALESCE(gemma_variant, '') FROM games WHERE id = ? AND COALESCE(is_gemma, 0) = 1", gameID).Scan(&v)
	return v
}

func (s *Server) requireArpenteurGame(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.gemmaVariant(getGameIDFromContext(r)) != gemmaVariantArpenteur {
			writeJSON(w, http.StatusNotFound, map[string]string{"message": "Le mode Arpenteur n'est pas activé pour cette partie"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// loadArpenteur lit le document de la partie (créé au premier accès).
func (s *Server) loadArpenteur(gameID int64) (arpenteur.Doc, int64, error) {
	var raw string
	var version int64
	err := s.db.QueryRow("SELECT data::text, version FROM arpenteurs WHERE game_id = ?", gameID).Scan(&raw, &version)
	if errors.Is(err, sql.ErrNoRows) {
		d := arpenteur.Default()
		b, _ := json.Marshal(d)
		if _, err := s.db.Exec("INSERT INTO arpenteurs (game_id, data) VALUES (?, ?::jsonb) ON CONFLICT (game_id) DO NOTHING", gameID, string(b)); err != nil {
			return arpenteur.Doc{}, 0, err
		}
		err = s.db.QueryRow("SELECT data::text, version FROM arpenteurs WHERE game_id = ?", gameID).Scan(&raw, &version)
	}
	if err != nil {
		return arpenteur.Doc{}, 0, err
	}
	d := arpenteur.Default()
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return arpenteur.Doc{}, 0, err
	}
	arpenteur.Normalize(&d)
	return d, version, nil
}

func (s *Server) saveArpenteur(gameID int64, d arpenteur.Doc) (int64, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return 0, err
	}
	var version int64
	err = s.db.QueryRow(
		"UPDATE arpenteurs SET data = ?::jsonb, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE game_id = ? RETURNING version",
		string(b), gameID,
	).Scan(&version)
	return version, err
}

// arpenteurFor : ce que voit ce participant (les repères cachés restent au MJ).
func arpenteurFor(d arpenteur.Doc, version int64, gm bool) arpenteurPayload {
	if !gm {
		d = d.ForPlayers()
	}
	return arpenteurPayload{Arpenteur: d, Version: version}
}

func (s *Server) broadcastArpenteur(gameID int64, d arpenteur.Doc, version int64) {
	gmView := arpenteurFor(d, version, true)
	playerView := arpenteurFor(d, version, false)
	s.hub.BroadcastFunc(gameID, func(m realtime.Member) (string, any, bool) {
		if m.IsGM() {
			return "arpenteur.state", gmView, true
		}
		return "arpenteur.state", playerView, true
	})
}

// actorName : nom affiché dans le journal (personnage, sinon pseudo).
func (s *Server) actorName(gameID, userID int64) string {
	if m, ok := s.resolveMember(gameID, userID); ok {
		if m.CharacterName != "" {
			return m.CharacterName
		}
		return m.DisplayName
	}
	return ""
}

func (s *Server) handleGetArpenteur(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	d, version, err := s.loadArpenteur(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	writeJSON(w, http.StatusOK, arpenteurFor(d, version, s.isGMRequest(r)))
}

type arpenteurPatchReq struct {
	Section string          `json:"section"`
	Value   json.RawMessage `json:"value"`
	// Log : ligne ajoutée au journal de bord (« Cap sur M3 »…).
	Log string `json:"log"`
}

func (s *Server) handlePatchArpenteur(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	u := s.getSessionUser(r)
	gm := s.isGMRequest(r)
	var req arpenteurPatchReq
	if err := json.NewDecoder(io.LimitReader(r.Body, maxArpenteurPatch)).Decode(&req); err != nil || len(req.Value) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Requête invalide"})
		return
	}

	unlock := lockArpenteur(gameID)
	defer unlock()
	d, _, err := s.loadArpenteur(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	if !d.CanEdit(req.Section, u.ID, gm) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Votre poste ne permet pas de modifier cette partie de l'arpenteur"})
		return
	}
	prevSalvo := int64(0)
	if d.Combat.LastSalvo != nil {
		prevSalvo = d.Combat.LastSalvo.ID
	}
	apply := func() error {
		if req.Section == arpenteur.SectionCrewSelf && !gm {
			return d.ApplySelf(req.Value, u.ID)
		}
		return d.Apply(req.Section, req.Value, gm)
	}
	if err := apply(); err != nil {
		msg := "Données invalides"
		if errors.Is(err, arpenteur.ErrUnknownSection) {
			msg = "Section inconnue"
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": msg})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	who := s.actorName(gameID, u.ID)
	// Nouvelle salve : le serveur signe l'auteur et l'heure.
	if sv := d.Combat.LastSalvo; sv != nil && sv.ID != prevSalvo {
		sv.By, sv.At = who, now
	}
	d.AppendLog(now, who, req.Log)
	version, err := s.saveArpenteur(gameID, d)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	s.broadcastArpenteur(gameID, d, version)
	writeJSON(w, http.StatusOK, arpenteurFor(d, version, gm))
}

// handleImportArpenteur : le MJ importe le classeur de son groupe (Excel,
// LibreOffice ou CSV). Les sections trouvées remplacent les actuelles.
func (s *Server) handleImportArpenteur(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if err := r.ParseMultipartForm(maxArpenteurImport); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 10 Mo)"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier manquant"})
		return
	}
	defer file.Close()
	switch docimport.Kind(header.Filename) {
	case "sheet":
	case "legacy":
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Ancien format Excel (.xls) : enregistrez le classeur en .xlsx, ou exportez-le depuis Google Sheets."})
		return
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Choisissez un classeur : Excel (.xlsx), LibreOffice (.ods) ou CSV."})
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxArpenteurImport+1))
	if err != nil || len(data) > maxArpenteurImport {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier trop volumineux (max 10 Mo)"})
		return
	}
	content, err := docimport.Parse(header.Filename, data)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Impossible de lire ce classeur : " + err.Error()})
		return
	}
	res := arpenteur.ImportContent(content, s.arpenteurPlayerRefs(gameID))
	if res.Crew == nil && res.Combat == nil && res.Hold == nil && res.Cave == nil && res.Expedition == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Aucun tableau d'arpenteur reconnu (équipage, combat, cale ou cave)."})
		return
	}

	unlock := lockArpenteur(gameID)
	defer unlock()
	d, _, err := s.loadArpenteur(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	d.ApplyImport(res)
	u := s.getSessionUser(r)
	d.AppendLog(time.Now().UTC().Format(time.RFC3339), s.actorName(gameID, u.ID), "Import du classeur « "+filepath.Base(header.Filename)+" »")
	version, err := s.saveArpenteur(gameID, d)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	s.broadcastArpenteur(gameID, d, version)
	writeJSON(w, http.StatusOK, map[string]any{"summary": res.Summary, "arpenteur": d, "version": version})
}

// arpenteurPlayerRefs : joueurs de la partie (pseudo et nom de personnage).
func (s *Server) arpenteurPlayerRefs(gameID int64) []arpenteur.PlayerRef {
	rows, err := s.db.Query(
		`SELECT u.id, u.display_name, COALESCE(gp.character_name, '')
		 FROM game_players gp JOIN users u ON u.id = gp.user_id
		 WHERE gp.game_id = ? AND gp.role <> 'MJ'`, gameID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []arpenteur.PlayerRef{}
	for rows.Next() {
		var p arpenteur.PlayerRef
		var display, character string
		if rows.Scan(&p.UserID, &display, &character) == nil {
			p.Names = []string{display, character}
			out = append(out, p)
		}
	}
	return out
}

// handleArpenteurImage : image de la carte illustrée du monde.
func (s *Server) handleArpenteurImage(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	if err := r.ParseMultipartForm(maxArpenteurImage); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Image trop volumineuse (max 15 Mo)"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Image manquante"})
		return
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedMapExtensions[ext] && ext != ".webp" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Format non autorisé (png, jpg, gif, webp)"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxArpenteurImage+1))
	if err != nil || len(data) > maxArpenteurImage {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Image trop volumineuse (max 15 Mo)"})
		return
	}
	if ext != ".webp" {
		if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier image invalide"})
			return
		}
	} else if !strings.HasPrefix(http.DetectContentType(data), "image/webp") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Fichier image invalide"})
		return
	}
	dir := filepath.Join(uploadsArpenteurBase, strconv.FormatInt(gameID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}

	unlock := lockArpenteur(gameID)
	defer unlock()
	d, _, err := s.loadArpenteur(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	d.Map.ImageURL = "/api/games/" + strconv.FormatInt(gameID, 10) + "/arpenteur/file/" + name
	version, err := s.saveArpenteur(gameID, d)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	s.broadcastArpenteur(gameID, d, version)
	writeJSON(w, http.StatusOK, arpenteurFor(d, version, true))
}

func (s *Server) handleArpenteurFile(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	name := chi.URLParam(r, "filename")
	if name == "" || strings.Contains(name, "..") || filepath.Base(name) != name {
		http.Error(w, "Fichier invalide", http.StatusBadRequest)
		return
	}
	f, err := os.Open(filepath.Join(uploadsArpenteurBase, strconv.FormatInt(gameID, 10), name))
	if err != nil {
		http.Error(w, "Fichier introuvable", http.StatusNotFound)
		return
	}
	defer f.Close()
	var mod time.Time
	if st, err := f.Stat(); err == nil {
		mod = st.ModTime()
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, name, mod, f)
}

// handleResetArpenteur : repartir d'un arpenteur neuf (MJ).
func (s *Server) handleResetArpenteur(w http.ResponseWriter, r *http.Request) {
	gameID := getGameIDFromContext(r)
	unlock := lockArpenteur(gameID)
	defer unlock()
	if _, _, err := s.loadArpenteur(gameID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	d := arpenteur.Default()
	version, err := s.saveArpenteur(gameID, d)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Erreur serveur"})
		return
	}
	s.broadcastArpenteur(gameID, d, version)
	writeJSON(w, http.StatusOK, arpenteurFor(d, version, true))
}
