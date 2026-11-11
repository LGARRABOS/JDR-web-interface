package docimport

import (
	"bytes"
	"encoding/csv"
	"regexp"
	"strings"
	"unicode/utf8"
)

// toUTF8 retire le BOM et convertit le Latin-1 (fichiers Windows) en UTF-8.
func toUTF8(data []byte) string {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if utf8.Valid(data) {
		return string(data)
	}
	r := make([]rune, len(data))
	for i, b := range data {
		r[i] = rune(b)
	}
	return string(r)
}

func normalizeNewlines(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
}

// parseText : un paragraphe par bloc de lignes séparé par une ligne vide.
func parseText(s string) *Content {
	c := &Content{Kind: "document"}
	for _, para := range strings.Split(normalizeNewlines(toUTF8([]byte(s))), "\n\n") {
		if p := strings.TrimSpace(para); p != "" {
			c.Blocks = append(c.Blocks, Block{Type: "paragraph", Runs: plainRuns(p)})
		}
	}
	return c
}

var (
	mdHeading = regexp.MustCompile(`^(#{1,6})\s+(.*?)\s*#*\s*$`)
	mdItem    = regexp.MustCompile(`^\s*(?:[-*+]|\d+[.)])\s+(.*)$`)
	mdTableRe = regexp.MustCompile(`^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$`)
	mdInline  = regexp.MustCompile(`(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)`)
)

// mdRuns gère le gras et l'italique de base.
func mdRuns(s string) []Run {
	var runs []Run
	last := 0
	for _, m := range mdInline.FindAllStringIndex(s, -1) {
		runs = append(runs, Run{Text: s[last:m[0]]})
		tok := s[m[0]:m[1]]
		if strings.HasPrefix(tok, "**") || strings.HasPrefix(tok, "__") {
			runs = append(runs, Run{Text: tok[2 : len(tok)-2], Bold: true})
		} else {
			runs = append(runs, Run{Text: tok[1 : len(tok)-1], Italic: true})
		}
		last = m[1]
	}
	runs = append(runs, Run{Text: s[last:]})
	return joinRuns(runs)
}

func mdCells(line string) []string {
	line = strings.TrimSpace(line)
	line = strings.TrimPrefix(strings.TrimSuffix(line, "|"), "|")
	parts := strings.Split(line, "|")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

// parseMarkdown : titres, listes, tableaux, paragraphes, gras/italique.
func parseMarkdown(s string) *Content {
	c := &Content{Kind: "document"}
	lines := strings.Split(normalizeNewlines(toUTF8([]byte(s))), "\n")
	var para []string
	var items [][]Run
	flush := func() {
		if len(para) > 0 {
			c.Blocks = append(c.Blocks, Block{Type: "paragraph", Runs: mdRuns(strings.Join(para, " "))})
			para = nil
		}
		if len(items) > 0 {
			c.Blocks = append(c.Blocks, Block{Type: "list", Items: items})
			items = nil
		}
	}
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "":
			flush()
		case mdHeading.MatchString(trimmed):
			flush()
			m := mdHeading.FindStringSubmatch(trimmed)
			c.Blocks = append(c.Blocks, Block{Type: "heading", Level: len(m[1]), Runs: mdRuns(m[2])})
		case strings.Contains(trimmed, "|") && i+1 < len(lines) && mdTableRe.MatchString(lines[i+1]):
			flush()
			rows := [][]string{mdCells(trimmed)}
			i += 2
			for ; i < len(lines) && strings.Contains(lines[i], "|"); i++ {
				rows = append(rows, mdCells(lines[i]))
			}
			i--
			c.Blocks = append(c.Blocks, Block{Type: "table", Rows: rows})
		case mdItem.MatchString(line):
			if len(para) > 0 {
				c.Blocks = append(c.Blocks, Block{Type: "paragraph", Runs: mdRuns(strings.Join(para, " "))})
				para = nil
			}
			items = append(items, mdRuns(mdItem.FindStringSubmatch(line)[1]))
		default:
			if len(items) > 0 {
				flush()
			}
			para = append(para, trimmed)
		}
	}
	flush()
	return c
}

// parseCSV devine le séparateur (virgule, point-virgule, tabulation).
func parseCSV(data []byte) (*Content, error) {
	text := normalizeNewlines(toUTF8(data))
	first := text
	if i := strings.IndexByte(text, '\n'); i >= 0 {
		first = text[:i]
	}
	sep := ','
	best := strings.Count(first, ",")
	for _, cand := range []rune{';', '\t'} {
		if n := strings.Count(first, string(cand)); n > best {
			sep, best = cand, n
		}
	}
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = sep
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	var rows [][]string
	for len(rows) <= MaxRows {
		rec, err := r.Read()
		if err != nil {
			break
		}
		rows = append(rows, rec)
	}
	if len(rows) == 0 {
		return nil, ErrUnreadable
	}
	return &Content{Kind: "sheet", Sheets: []Sheet{{Name: "Feuille 1", Rows: rows}}}, nil
}
