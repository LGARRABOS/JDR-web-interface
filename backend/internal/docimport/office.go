package docimport

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const maxZipEntry = 64 << 20 // garde-fou contre les archives piégées

func openZip(data []byte) (*zip.Reader, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, ErrUnreadable
	}
	return zr, nil
}

func readZipFile(zr *zip.Reader, name string) ([]byte, bool) {
	for _, f := range zr.File {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				return nil, false
			}
			defer rc.Close()
			b, err := io.ReadAll(io.LimitReader(rc, maxZipEntry))
			return b, err == nil
		}
	}
	return nil, false
}

// --- Word (.docx) ------------------------------------------------------------

var headingStyle = regexp.MustCompile(`(?i)^(heading|titre|berschrift|título|titolo)\s*([1-6])$`)

// docxPara accumule un paragraphe Word.
type docxPara struct {
	runs    []Run
	style   string
	outline int // niveau de plan (0 = aucun)
	list    bool
}

func (p *docxPara) headingLevel() int {
	if m := headingStyle.FindStringSubmatch(strings.ReplaceAll(p.style, " ", "")); m != nil {
		n, _ := strconv.Atoi(m[2])
		return n
	}
	if strings.EqualFold(p.style, "Title") || strings.EqualFold(p.style, "Titre") {
		return 1
	}
	return p.outline
}

func parseDocx(data []byte) (*Content, error) {
	zr, err := openZip(data)
	if err != nil {
		return nil, err
	}
	doc, ok := readZipFile(zr, "word/document.xml")
	if !ok {
		return nil, ErrUnreadable
	}
	c := &Content{Kind: "document"}
	dec := xml.NewDecoder(bytes.NewReader(doc))

	var (
		para      *docxPara
		inRun     bool
		bold, ita bool
		inText    bool
		tableRows [][]string // tableau en cours (premier niveau)
		row       []string
		cell      *strings.Builder
		tblDepth  int
		list      [][]Run
	)
	flushList := func() {
		if len(list) > 0 {
			c.Blocks = append(c.Blocks, Block{Type: "list", Items: list})
			list = nil
		}
	}
	endPara := func() {
		p := para
		para = nil
		if p == nil {
			return
		}
		runs := joinRuns(p.runs)
		if tblDepth > 0 {
			if cell != nil {
				if cell.Len() > 0 {
					cell.WriteString("\n")
				}
				cell.WriteString(runsText(runs))
			}
			return
		}
		if len(runs) == 0 {
			return
		}
		if p.list {
			list = append(list, runs)
			return
		}
		flushList()
		if lvl := p.headingLevel(); lvl > 0 {
			c.Blocks = append(c.Blocks, Block{Type: "heading", Level: min(lvl, 6), Runs: runs})
			return
		}
		c.Blocks = append(c.Blocks, Block{Type: "paragraph", Runs: runs})
	}

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrUnreadable
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "tbl":
				tblDepth++
				if tblDepth == 1 {
					flushList()
					tableRows = nil
				}
			case "tr":
				if tblDepth == 1 {
					row = nil
				}
			case "tc":
				if tblDepth == 1 {
					cell = &strings.Builder{}
				}
			case "p":
				para = &docxPara{}
			case "pStyle":
				if para != nil {
					para.style = attr(t, "val")
				}
			case "outlineLvl":
				if para != nil {
					n, _ := strconv.Atoi(attr(t, "val"))
					para.outline = n + 1
				}
			case "numPr":
				if para != nil {
					para.list = true
				}
			case "r":
				inRun, bold, ita = true, false, false
			case "b":
				if inRun && attr(t, "val") != "0" && attr(t, "val") != "false" {
					bold = true
				}
			case "i":
				if inRun && attr(t, "val") != "0" && attr(t, "val") != "false" {
					ita = true
				}
			case "t":
				inText = true
			case "tab":
				if para != nil && inRun {
					para.runs = append(para.runs, Run{Text: "\t", Bold: bold, Italic: ita})
				}
			case "br", "cr":
				if para != nil && inRun {
					para.runs = append(para.runs, Run{Text: "\n", Bold: bold, Italic: ita})
				}
			}
		case xml.CharData:
			if inText && para != nil {
				para.runs = append(para.runs, Run{Text: string(t), Bold: bold, Italic: ita})
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "r":
				inRun = false
			case "p":
				endPara()
			case "tc":
				if tblDepth == 1 && cell != nil {
					row = append(row, cell.String())
					cell = nil
				}
			case "tr":
				if tblDepth == 1 {
					tableRows = append(tableRows, row)
				}
			case "tbl":
				if tblDepth == 1 && len(tableRows) > 0 {
					c.Blocks = append(c.Blocks, Block{Type: "table", Rows: tableRows})
				}
				tblDepth--
			}
		}
	}
	flushList()
	return c, nil
}

func attr(t xml.StartElement, local string) string {
	for _, a := range t.Attr {
		if a.Name.Local == local {
			return a.Value
		}
	}
	return ""
}

// --- Excel (.xlsx) -----------------------------------------------------------

func parseXlsx(data []byte) (*Content, error) {
	zr, err := openZip(data)
	if err != nil {
		return nil, err
	}
	wb, ok := readZipFile(zr, "xl/workbook.xml")
	if !ok {
		return nil, ErrUnreadable
	}
	shared := xlsxSharedStrings(zr)

	// Feuilles dans l'ordre du classeur, et leurs fichiers.
	type sheetRef struct{ name, rid string }
	var refs []sheetRef
	dec := xml.NewDecoder(bytes.NewReader(wb))
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == "sheet" {
			refs = append(refs, sheetRef{name: attr(se, "name"), rid: attr(se, "id")})
		}
	}
	targets := map[string]string{}
	if rels, ok := readZipFile(zr, "xl/_rels/workbook.xml.rels"); ok {
		dec := xml.NewDecoder(bytes.NewReader(rels))
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			if se, ok := tok.(xml.StartElement); ok && se.Name.Local == "Relationship" {
				target := attr(se, "Target")
				if strings.HasPrefix(target, "/") {
					target = strings.TrimPrefix(target, "/")
				} else {
					target = path.Join("xl", target)
				}
				targets[attr(se, "Id")] = target
			}
		}
	}

	c := &Content{Kind: "sheet"}
	for i, ref := range refs {
		file := targets[ref.rid]
		if file == "" {
			file = "xl/worksheets/sheet" + strconv.Itoa(i+1) + ".xml"
		}
		raw, ok := readZipFile(zr, file)
		if !ok {
			continue
		}
		rows, err := xlsxSheet(raw, shared)
		if err != nil {
			return nil, err
		}
		c.Sheets = append(c.Sheets, Sheet{Name: ref.name, Rows: rows})
	}
	if len(c.Sheets) == 0 {
		return nil, ErrUnreadable
	}
	return c, nil
}

func xlsxSharedStrings(zr *zip.Reader) []string {
	raw, ok := readZipFile(zr, "xl/sharedStrings.xml")
	if !ok {
		return nil
	}
	var out []string
	var cur strings.Builder
	inSI, inT, inRPh := false, false, false
	dec := xml.NewDecoder(bytes.NewReader(raw))
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "si":
				inSI = true
				cur.Reset()
			case "t":
				inT = true
			case "rPh": // indications phonétiques : ignorées
				inRPh = true
			}
		case xml.CharData:
			if inSI && inT && !inRPh {
				cur.Write(t)
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "si":
				inSI = false
				out = append(out, cur.String())
			case "t":
				inT = false
			case "rPh":
				inRPh = false
			}
		}
	}
	return out
}

// colIndex convertit la référence d'une cellule (« C12 ») en numéro de colonne.
func colIndex(ref string) int {
	n := 0
	for _, r := range ref {
		if r < 'A' || r > 'Z' {
			break
		}
		n = n*26 + int(r-'A'+1)
	}
	return n - 1
}

func xlsxSheet(raw []byte, shared []string) ([][]string, error) {
	type cellPos struct{ r, c int }
	values := map[cellPos]string{}
	maxR, maxC := -1, -1
	var (
		rowIdx     = -1
		col        int
		typ        string
		inV, inIs  bool
		inIsT      bool
		val        strings.Builder
		haveCell   bool
		nextColRow int
	)
	dec := xml.NewDecoder(bytes.NewReader(raw))
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrUnreadable
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "row":
				if r, err := strconv.Atoi(attr(t, "r")); err == nil {
					rowIdx = r - 1
				} else {
					rowIdx++
				}
				nextColRow = 0
			case "c":
				haveCell = true
				typ = attr(t, "t")
				if ref := attr(t, "r"); ref != "" {
					col = colIndex(ref)
				} else {
					col = nextColRow
				}
				nextColRow = col + 1
				val.Reset()
			case "v":
				inV = true
			case "is":
				inIs = true
			case "t":
				if inIs {
					inIsT = true
				}
			}
		case xml.CharData:
			if inV || inIsT {
				val.Write(t)
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "v":
				inV = false
			case "t":
				inIsT = false
			case "is":
				inIs = false
			case "c":
				if !haveCell || rowIdx < 0 || rowIdx >= MaxRows || col < 0 || col >= MaxCols*2 {
					haveCell = false
					continue
				}
				v := val.String()
				switch typ {
				case "s":
					if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && i >= 0 && i < len(shared) {
						v = shared[i]
					}
				case "b":
					if v == "1" {
						v = "VRAI"
					} else {
						v = "FAUX"
					}
				case "", "n":
					v = formatNumber(v)
				}
				if v != "" {
					values[cellPos{rowIdx, col}] = v
					maxR, maxC = max(maxR, rowIdx), max(maxC, col)
				}
				haveCell = false
			}
		}
	}
	rows := make([][]string, maxR+1)
	for i := range rows {
		rows[i] = make([]string, maxC+1)
	}
	keys := make([]cellPos, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].r < keys[j].r })
	for _, k := range keys {
		rows[k.r][k.c] = values[k]
	}
	return rows, nil
}

// formatNumber retire le bruit des nombres flottants (0.30000000000000004).
func formatNumber(v string) string {
	f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil {
		return v
	}
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if len(s) > 15 {
		s = strconv.FormatFloat(f, 'g', 12, 64)
	}
	return s
}
