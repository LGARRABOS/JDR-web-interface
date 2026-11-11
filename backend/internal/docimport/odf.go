package docimport

import (
	"bytes"
	"encoding/xml"
	"io"
	"strconv"
	"strings"
)

// LibreOffice / OpenDocument : tout le contenu est dans content.xml.

// odfText lit le texte d'un élément (paragraphe, titre, cellule) jusqu'à sa
// fermeture, en gérant espaces, tabulations et retours à la ligne.
func odfText(dec *xml.Decoder, start xml.StartElement) (string, error) {
	var b strings.Builder
	depth := 1
	for depth > 0 {
		tok, err := dec.Token()
		if err != nil {
			return "", err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			switch t.Name.Local {
			case "s":
				n, _ := strconv.Atoi(attr(t, "c"))
				b.WriteString(strings.Repeat(" ", max(n, 1)))
			case "tab":
				b.WriteString("\t")
			case "line-break":
				b.WriteString("\n")
			case "note": // notes de bas de page : ignorées
				if err := dec.Skip(); err != nil {
					return "", err
				}
				depth--
			}
		case xml.CharData:
			b.Write(t)
		case xml.EndElement:
			depth--
			if depth > 0 && (t.Name.Local == "p" || t.Name.Local == "h") {
				b.WriteString("\n")
			}
		}
	}
	_ = start
	return strings.TrimRight(b.String(), "\n"), nil
}

func odfContent(data []byte) (*xml.Decoder, error) {
	zr, err := openZip(data)
	if err != nil {
		return nil, err
	}
	raw, ok := readZipFile(zr, "content.xml")
	if !ok {
		return nil, ErrUnreadable
	}
	return xml.NewDecoder(bytes.NewReader(raw)), nil
}

func parseOdt(data []byte) (*Content, error) {
	dec, err := odfContent(data)
	if err != nil {
		return nil, err
	}
	c := &Content{Kind: "document"}
	inBody := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrUnreadable
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		if se.Name.Local == "text" && se.Name.Space != "" && !inBody {
			inBody = true // office:text
			continue
		}
		if !inBody {
			continue
		}
		switch se.Name.Local {
		case "h":
			txt, err := odfText(dec, se)
			if err != nil {
				return nil, ErrUnreadable
			}
			lvl, _ := strconv.Atoi(attr(se, "outline-level"))
			if txt != "" {
				c.Blocks = append(c.Blocks, Block{Type: "heading", Level: min(max(lvl, 1), 6), Runs: plainRuns(txt)})
			}
		case "p":
			txt, err := odfText(dec, se)
			if err != nil {
				return nil, ErrUnreadable
			}
			if strings.TrimSpace(txt) != "" {
				c.Blocks = append(c.Blocks, Block{Type: "paragraph", Runs: plainRuns(txt)})
			}
		case "list":
			items, err := odfList(dec)
			if err != nil {
				return nil, ErrUnreadable
			}
			if len(items) > 0 {
				c.Blocks = append(c.Blocks, Block{Type: "list", Items: items})
			}
		case "table":
			rows, err := odfTable(dec)
			if err != nil {
				return nil, ErrUnreadable
			}
			if len(rows) > 0 {
				c.Blocks = append(c.Blocks, Block{Type: "table", Rows: rows})
			}
		}
	}
	return c, nil
}

// odfList lit une liste (les sous-listes sont aplaties).
func odfList(dec *xml.Decoder) ([][]Run, error) {
	var items [][]Run
	depth := 1
	for depth > 0 {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "p" || t.Name.Local == "h" {
				txt, err := odfText(dec, t)
				if err != nil {
					return nil, err
				}
				if strings.TrimSpace(txt) != "" {
					items = append(items, plainRuns(txt))
				}
				continue
			}
			depth++
		case xml.EndElement:
			depth--
		}
	}
	return items, nil
}

// odfTable lit un tableau (texte ou tableur) en tenant compte des lignes et
// cellules répétées, limitées pour ne pas exploser.
func odfTable(dec *xml.Decoder) ([][]string, error) {
	var rows [][]string
	var row []string
	rowRepeat := 1
	depth := 1
	for depth > 0 {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "table-row":
				row = nil
				rowRepeat, _ = strconv.Atoi(attr(t, "number-rows-repeated"))
				rowRepeat = min(max(rowRepeat, 1), MaxRows)
				depth++
			case "table-cell", "covered-table-cell":
				repeat, _ := strconv.Atoi(attr(t, "number-columns-repeated"))
				repeat = min(max(repeat, 1), MaxCols)
				txt, err := odfText(dec, t)
				if err != nil {
					return nil, err
				}
				if txt == "" {
					if v := attr(t, "value"); v != "" {
						txt = formatNumber(v)
					}
				}
				for i := 0; i < repeat && len(row) < MaxCols*2; i++ {
					row = append(row, txt)
				}
			default:
				depth++
			}
		case xml.EndElement:
			depth--
			if t.Name.Local == "table-row" {
				empty := true
				for _, v := range row {
					if v != "" {
						empty = false
						break
					}
				}
				// Les lignes vides répétées (souvent des milliers) ne comptent qu'une fois.
				if empty {
					rowRepeat = 1
				}
				for i := 0; i < rowRepeat && len(rows) < MaxRows+1; i++ {
					rows = append(rows, append([]string(nil), row...))
				}
			}
		}
	}
	return rows, nil
}

func parseOds(data []byte) (*Content, error) {
	dec, err := odfContent(data)
	if err != nil {
		return nil, err
	}
	c := &Content{Kind: "sheet"}
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrUnreadable
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == "table" {
			name := attr(se, "name")
			rows, err := odfTable(dec)
			if err != nil {
				return nil, ErrUnreadable
			}
			c.Sheets = append(c.Sheets, Sheet{Name: name, Rows: rows})
		}
	}
	if len(c.Sheets) == 0 {
		return nil, ErrUnreadable
	}
	return c, nil
}
