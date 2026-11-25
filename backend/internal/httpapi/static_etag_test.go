package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestStaticFilesUseContentETag(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "models"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	glb := filepath.Join(dir, "models", "a.glb")
	if err := os.WriteFile(glb, []byte("modele"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := spaFileServer(dir)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/models/a.glb", nil))
	tag := rec.Header().Get("ETag")
	if rec.Code != http.StatusOK || tag == "" {
		t.Fatalf("première requête : code %d, ETag %q", rec.Code, tag)
	}

	// Même contenu après un « déploiement » (date de modification changée) : 304.
	later := mustStat(t, glb).ModTime().Add(3600e9)
	if err := os.Chtimes(glb, later, later); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/models/a.glb", nil)
	req.Header.Set("If-None-Match", tag)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("contenu inchangé : code %d, attendu 304", rec.Code)
	}

	// Contenu modifié : nouvelle empreinte, fichier renvoyé.
	if err := os.WriteFile(glb, []byte("modele v2"), 0o644); err != nil {
		t.Fatal(err)
	}
	req = httptest.NewRequest(http.MethodGet, "/models/a.glb", nil)
	req.Header.Set("If-None-Match", tag)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Header().Get("ETag") == tag {
		t.Fatalf("contenu modifié : code %d, ETag %q", rec.Code, rec.Header().Get("ETag"))
	}
}

func mustStat(t *testing.T, p string) os.FileInfo {
	t.Helper()
	fi, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	return fi
}
