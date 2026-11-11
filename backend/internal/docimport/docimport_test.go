package docimport

import (
	"archive/zip"
	"bytes"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func makeZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(content))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

const wns = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`

func TestDocx(t *testing.T) {
	doc := `<w:document ` + wns + `><w:body>
	<w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>La crypte</w:t></w:r></w:p>
	<w:p><w:r><w:t xml:space="preserve">Une porte </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>scellée</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>
	<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Torche</w:t></w:r></w:p>
	<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Corde</w:t></w:r></w:p>
	<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nom</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>PV</w:t></w:r></w:p></w:tc></w:tr>
	<w:tr><w:tc><w:p><w:r><w:t>Goule</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>22</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
	<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Suite</w:t></w:r></w:p>
	</w:body></w:document>`
	c, err := Parse("aventure.docx", makeZip(t, map[string]string{"word/document.xml": doc}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Kind != "document" || len(c.Blocks) != 5 {
		t.Fatalf("blocs : %+v", c.Blocks)
	}
	if b := c.Blocks[0]; b.Type != "heading" || b.Level != 1 || runsText(b.Runs) != "La crypte" {
		t.Fatalf("titre : %+v", b)
	}
	want := []Run{{Text: "Une porte "}, {Text: "scellée", Bold: true}, {Text: "."}}
	if !reflect.DeepEqual(c.Blocks[1].Runs, want) {
		t.Fatalf("paragraphe : %+v", c.Blocks[1].Runs)
	}
	if b := c.Blocks[2]; b.Type != "list" || len(b.Items) != 2 || !b.Items[1][0].Italic {
		t.Fatalf("liste : %+v", b)
	}
	if b := c.Blocks[3]; b.Type != "table" || !reflect.DeepEqual(b.Rows, [][]string{{"Nom", "PV"}, {"Goule", "22"}}) {
		t.Fatalf("tableau : %+v", b)
	}
	if b := c.Blocks[4]; b.Level != 2 {
		t.Fatalf("titre 2 : %+v", b)
	}
}

func TestXlsx(t *testing.T) {
	files := map[string]string{
		"xl/workbook.xml": `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
			<sheet name="Bestiaire" sheetId="1" r:id="rId1"/><sheet name="Butin" sheetId="2" r:id="rId2"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
		"xl/sharedStrings.xml":       `<sst><si><t>Nom</t></si><si><t>PV</t></si><si><r><t>Gob</t></r><r><t>elin</t></r></si></sst>`,
		"xl/worksheets/sheet1.xml": `<worksheet><sheetData>
			<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
			<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>7.0000000000000009</v></c><c r="D2" t="inlineStr"><is><t>note</t></is></c></row>
			<row r="40"><c r="A40" s="1"/></row>
		</sheetData></worksheet>`,
		"xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
	}
	c, err := Parse("donnees.xlsx", makeZip(t, files))
	if err != nil {
		t.Fatal(err)
	}
	if c.Kind != "sheet" || len(c.Sheets) != 2 || c.Sheets[0].Name != "Bestiaire" {
		t.Fatalf("feuilles : %+v", c.Sheets)
	}
	want := [][]string{{"Nom", "PV", "", ""}, {"Gobelin", "7", "", "note"}}
	if !reflect.DeepEqual(c.Sheets[0].Rows, want) {
		t.Fatalf("lignes : %q", c.Sheets[0].Rows)
	}
	if c.Sheets[1].Rows[0][0] != "VRAI" {
		t.Fatalf("booléen : %q", c.Sheets[1].Rows)
	}
}

const odfNS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"`

func TestOdt(t *testing.T) {
	content := `<office:document-content ` + odfNS + `><office:body><office:text>
		<text:h text:outline-level="1">Chapitre</text:h>
		<text:p>Il fait<text:s text:c="2"/>nuit.</text:p>
		<text:list><text:list-item><text:p>Épée</text:p></text:list-item><text:list-item><text:p>Bouclier</text:p></text:list-item></text:list>
		<table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table>
	</office:text></office:body></office:document-content>`
	c, err := Parse("notes.odt", makeZip(t, map[string]string{"content.xml": content}))
	if err != nil {
		t.Fatal(err)
	}
	types := []string{}
	for _, b := range c.Blocks {
		types = append(types, b.Type)
	}
	if !reflect.DeepEqual(types, []string{"heading", "paragraph", "list", "table"}) {
		t.Fatalf("blocs : %v", types)
	}
	if runsText(c.Blocks[1].Runs) != "Il fait  nuit." || len(c.Blocks[2].Items) != 2 {
		t.Fatalf("contenu : %+v", c.Blocks)
	}
}

func TestOdsRepeats(t *testing.T) {
	content := `<office:document-content ` + odfNS + `><office:body><office:spreadsheet>
		<table:table table:name="PJ">
			<table:table-row><table:table-cell><text:p>Nom</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell></table:table-row>
			<table:table-row><table:table-cell office:value="12.5"/></table:table-row>
			<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
		</table:table>
	</office:spreadsheet></office:body></office:document-content>`
	c, err := Parse("pj.ods", makeZip(t, map[string]string{"content.xml": content}))
	if err != nil {
		t.Fatal(err)
	}
	want := [][]string{{"Nom", "x", "x"}, {"12.5", "", ""}}
	if len(c.Sheets) != 1 || c.Sheets[0].Name != "PJ" || !reflect.DeepEqual(c.Sheets[0].Rows, want) {
		t.Fatalf("feuille : %+v", c.Sheets)
	}
}

func TestCSVAndText(t *testing.T) {
	c, err := Parse("liste.csv", []byte("\xef\xbb\xbfNom;Prix\r\n\"Potion; grande\";5\r\n"))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(c.Sheets[0].Rows, [][]string{{"Nom", "Prix"}, {"Potion; grande", "5"}}) {
		t.Fatalf("csv : %q", c.Sheets[0].Rows)
	}
	// Latin-1 (fichier enregistré sous Windows)
	c, _ = Parse("lisez.txt", []byte("Caf\xe9\n\nDeuxi\xe8me"))
	if len(c.Blocks) != 2 || runsText(c.Blocks[0].Runs) != "Café" {
		t.Fatalf("texte : %+v", c.Blocks)
	}
}

func TestMarkdown(t *testing.T) {
	md := "# Titre\n\nTexte **gras** et *italique*.\n\n- un\n- deux\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"
	c, err := Parse("regles.md", []byte(md))
	if err != nil {
		t.Fatal(err)
	}
	types := []string{}
	for _, b := range c.Blocks {
		types = append(types, b.Type)
	}
	if !reflect.DeepEqual(types, []string{"heading", "paragraph", "list", "table"}) {
		t.Fatalf("blocs : %v", types)
	}
	if !c.Blocks[1].Runs[1].Bold || !c.Blocks[1].Runs[3].Italic {
		t.Fatalf("styles : %+v", c.Blocks[1].Runs)
	}
	if !reflect.DeepEqual(c.Blocks[3].Rows, [][]string{{"A", "B"}, {"1", "2"}}) {
		t.Fatalf("tableau : %q", c.Blocks[3].Rows)
	}
}

func TestErrorsAndKinds(t *testing.T) {
	if _, err := Parse("vieux.doc", []byte("x")); !errors.Is(err, ErrLegacy) {
		t.Fatalf("ancien format : %v", err)
	}
	if _, err := Parse("casse.docx", []byte("pas un zip")); !errors.Is(err, ErrUnreadable) {
		t.Fatalf("fichier abîmé : %v", err)
	}
	if _, err := Parse("x.exe", nil); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("format inconnu : %v", err)
	}
	for name, kind := range map[string]string{"a.DOCX": "document", "b.ods": "sheet", "c.pdf": "pdf", "d.png": "image", "e.zip": ""} {
		if got := Kind(name); got != kind {
			t.Errorf("Kind(%s) = %q, attendu %q", name, got, kind)
		}
	}
}

func TestTrimLimits(t *testing.T) {
	rows := make([][]string, MaxRows+10)
	for i := range rows {
		rows[i] = []string{strings.Repeat("x", 3)}
	}
	c := &Content{Kind: "sheet", Sheets: []Sheet{{Name: "S", Rows: rows}}}
	c.trim()
	if len(c.Sheets[0].Rows) != MaxRows || !c.Truncated {
		t.Fatalf("limite de lignes non appliquée : %d", len(c.Sheets[0].Rows))
	}
}
