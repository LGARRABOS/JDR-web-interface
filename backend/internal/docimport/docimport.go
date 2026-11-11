// Package docimport convertit des fichiers créés ailleurs (Word, LibreOffice,
// Excel, CSV, texte) en un contenu simple que l'application sait afficher :
// des blocs (titres, paragraphes, listes, tableaux) pour un document, des
// feuilles (lignes × colonnes) pour un tableur. Uniquement la bibliothèque
// standard : les formats Office modernes sont des archives ZIP de XML.
package docimport

import (
	"errors"
	"path/filepath"
	"strings"
)

// Run est un morceau de texte d'un paragraphe.
type Run struct {
	Text   string `json:"t"`
	Bold   bool   `json:"b,omitempty"`
	Italic bool   `json:"i,omitempty"`
}

// Block est un élément d'un document.
type Block struct {
	Type  string     `json:"type"`            // heading, paragraph, list, table
	Level int        `json:"level,omitempty"` // titres : 1 à 6
	Runs  []Run      `json:"runs,omitempty"`  // titres et paragraphes
	Items [][]Run    `json:"items,omitempty"` // listes
	Rows  [][]string `json:"rows,omitempty"`  // tableaux
}

// Sheet est une feuille de tableur.
type Sheet struct {
	Name string     `json:"name"`
	Rows [][]string `json:"rows"`
}

// Content est le résultat d'une conversion.
type Content struct {
	Kind   string  `json:"kind"` // document, sheet
	Blocks []Block `json:"blocks,omitempty"`
	Sheets []Sheet `json:"sheets,omitempty"`
	// Truncated : le fichier dépassait les limites, seul le début est gardé.
	Truncated bool `json:"truncated,omitempty"`
}

// Limites : au-delà, le contenu est tronqué (le fichier d'origine reste
// téléchargeable).
const (
	MaxBlocks = 5000
	MaxRows   = 5000
	MaxCols   = 100
	MaxCell   = 2000
	MaxSheets = 30
)

// Erreurs renvoyées pour un format non pris en charge ou un fichier illisible.
var (
	ErrUnsupported = errors.New("format non pris en charge")
	ErrLegacy      = errors.New("ancien format Office : enregistrez le fichier en .docx ou .xlsx")
	ErrUnreadable  = errors.New("fichier illisible ou endommagé")
)

// Kind indique ce que deviendra un fichier d'après son extension :
// document, sheet, pdf, image, ou "" s'il n'est pas pris en charge.
func Kind(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".docx", ".odt", ".txt", ".md", ".markdown":
		return "document"
	case ".xlsx", ".ods", ".csv", ".tsv":
		return "sheet"
	case ".pdf":
		return "pdf"
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return "image"
	case ".doc", ".xls", ".ppt":
		return "legacy"
	}
	return ""
}

// Parse convertit un fichier texte ou tableur. Les PDF et images ne passent
// pas par ici : ils sont affichés tels quels.
func Parse(filename string, data []byte) (*Content, error) {
	var (
		c   *Content
		err error
	)
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".docx":
		c, err = parseDocx(data)
	case ".odt":
		c, err = parseOdt(data)
	case ".txt":
		c = parseText(string(data))
	case ".md", ".markdown":
		c = parseMarkdown(string(data))
	case ".xlsx":
		c, err = parseXlsx(data)
	case ".ods":
		c, err = parseOds(data)
	case ".csv", ".tsv":
		c, err = parseCSV(data)
	case ".doc", ".xls":
		return nil, ErrLegacy
	default:
		return nil, ErrUnsupported
	}
	if err != nil {
		return nil, err
	}
	c.trim()
	return c, nil
}

// trim applique les limites et retire les lignes et colonnes vides en fin de
// feuille (les tableurs en déclarent souvent des milliers).
func (c *Content) trim() {
	if len(c.Blocks) > MaxBlocks {
		c.Blocks, c.Truncated = c.Blocks[:MaxBlocks], true
	}
	if len(c.Sheets) > MaxSheets {
		c.Sheets, c.Truncated = c.Sheets[:MaxSheets], true
	}
	for i := range c.Sheets {
		rows, cut := trimGrid(c.Sheets[i].Rows)
		c.Sheets[i].Rows = rows
		c.Truncated = c.Truncated || cut
	}
	for i := range c.Blocks {
		if c.Blocks[i].Type == "table" {
			rows, cut := trimGrid(c.Blocks[i].Rows)
			c.Blocks[i].Rows = rows
			c.Truncated = c.Truncated || cut
		}
	}
}

func trimGrid(rows [][]string) ([][]string, bool) {
	cut := false
	if len(rows) > MaxRows {
		rows, cut = rows[:MaxRows], true
	}
	// Dernière ligne et dernière colonne non vides.
	lastRow, lastCol := -1, -1
	for r, row := range rows {
		for col, v := range row {
			if strings.TrimSpace(v) != "" {
				lastRow = r
				if col > lastCol {
					lastCol = col
				}
			}
		}
	}
	if lastCol+1 > MaxCols {
		lastCol, cut = MaxCols-1, true
	}
	out := make([][]string, 0, lastRow+1)
	for r := 0; r <= lastRow; r++ {
		row := make([]string, lastCol+1)
		for col := 0; col <= lastCol && col < len(rows[r]); col++ {
			v := rows[r][col]
			if len(v) > MaxCell {
				v, cut = v[:MaxCell]+"…", true
			}
			row[col] = v
		}
		out = append(out, row)
	}
	return out, cut
}

// joinRuns fusionne les morceaux voisins de même style et retire les vides.
func joinRuns(runs []Run) []Run {
	out := []Run{}
	for _, r := range runs {
		if r.Text == "" {
			continue
		}
		if n := len(out); n > 0 && out[n-1].Bold == r.Bold && out[n-1].Italic == r.Italic {
			out[n-1].Text += r.Text
			continue
		}
		out = append(out, r)
	}
	return out
}

func runsText(runs []Run) string {
	var b strings.Builder
	for _, r := range runs {
		b.WriteString(r.Text)
	}
	return b.String()
}

func plainRuns(s string) []Run {
	if s == "" {
		return nil
	}
	return []Run{{Text: s}}
}
