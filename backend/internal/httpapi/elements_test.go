package httpapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
)

// Minimal 1x1 PNG (89 bytes)
var minimalPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
	0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
	0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
	0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
	0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
	0x44, 0xae, 0x42, 0x60, 0x82,
}

func TestHandleListElements(t *testing.T) {
	sess := setupAuthAndGame(t)
	gameIDStr := strconv.FormatInt(sess.GameID, 10)

	req := httptest.NewRequest(http.MethodGet, "/api/games/"+gameIDStr+"/elements", nil)
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("list elements: got status %d, want %d", rr.Code, http.StatusOK)
	}
	var resp struct {
		Elements []interface{} `json:"elements"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Elements != nil && len(resp.Elements) != 0 {
		t.Errorf("expected 0 elements, got %d", len(resp.Elements))
	}
}

func TestHandleUploadAndListAndDeleteElement(t *testing.T) {
	origDir, _ := os.Getwd()
	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })

	sess := setupAuthAndGame(t)
	gameIDStr := strconv.FormatInt(sess.GameID, 10)

	// Upload element
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "test.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(minimalPNG); err != nil {
		t.Fatalf("write png: %v", err)
	}
	_ = writer.WriteField("name", "Gobelin")
	_ = writer.WriteField("category", "monster")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/games/"+gameIDStr+"/elements/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("upload element: got status %d, want %d, body: %s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	var uploadResp struct {
		Element struct {
			ID       int64  `json:"id"`
			Name     string `json:"name"`
			Category string `json:"category"`
		} `json:"element"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&uploadResp); err != nil {
		t.Fatalf("decode upload: %v", err)
	}
	if uploadResp.Element.Name != "Gobelin" {
		t.Errorf("element name: got %s, want Gobelin", uploadResp.Element.Name)
	}
	if uploadResp.Element.Category != "monster" {
		t.Errorf("element category: got %s, want monster", uploadResp.Element.Category)
	}
	elementID := uploadResp.Element.ID

	// List elements
	req2 := httptest.NewRequest(http.MethodGet, "/api/games/"+gameIDStr+"/elements", nil)
	sess.addCookies(req2)
	rr2 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("list: got %d", rr2.Code)
	}
	var listResp struct {
		Elements []struct {
			ID       int64  `json:"id"`
			Name     string `json:"name"`
			Category string `json:"category"`
		} `json:"elements"`
	}
	if err := json.NewDecoder(rr2.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listResp.Elements) != 1 {
		t.Errorf("list: got %d elements, want 1", len(listResp.Elements))
	}

	// Delete element
	req3 := httptest.NewRequest(http.MethodDelete, "/api/games/"+gameIDStr+"/elements/"+strconv.FormatInt(elementID, 10), nil)
	sess.addCookies(req3)
	rr3 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Errorf("delete: got %d", rr3.Code)
	}

	// List again - should be empty
	req4 := httptest.NewRequest(http.MethodGet, "/api/games/"+gameIDStr+"/elements", nil)
	sess.addCookies(req4)
	rr4 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr4, req4)
	var listResp2 struct {
		Elements []interface{} `json:"elements"`
	}
	_ = json.NewDecoder(rr4.Body).Decode(&listResp2)
	if len(listResp2.Elements) != 0 {
		t.Errorf("after delete: got %d elements, want 0", len(listResp2.Elements))
	}
}

func TestHandleUploadElementForbiddenFormat(t *testing.T) {
	origDir, _ := os.Getwd()
	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })

	sess := setupAuthAndGame(t)
	gameIDStr := strconv.FormatInt(sess.GameID, 10)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "test.txt")
	part.Write([]byte("not an image"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/games/"+gameIDStr+"/elements/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("upload invalid format: got %d, want 400", rr.Code)
	}
}
