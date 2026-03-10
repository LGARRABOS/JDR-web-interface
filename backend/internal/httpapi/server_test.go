package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"jdr-backend/internal/storage"
)

func TestHealthz(t *testing.T) {
	db := storage.OpenTestDB(t)
	handler, err := NewServer(db, "")
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("healthz: got status %d, want %d", rr.Code, http.StatusOK)
	}
	if body := rr.Body.String(); body != `{"status":"ok"}` {
		t.Errorf("healthz: got body %q", body)
	}
}
