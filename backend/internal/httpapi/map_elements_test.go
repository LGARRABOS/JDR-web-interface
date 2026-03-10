package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestHandleListMapElements(t *testing.T) {
	sess := setupAuthAndGame(t)
	mapIDStr := strconv.FormatInt(sess.MapID, 10)

	req := httptest.NewRequest(http.MethodGet, "/api/maps/"+mapIDStr+"/elements", nil)
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("list map elements: got status %d, want %d", rr.Code, http.StatusOK)
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

func TestHandleCreateUpdateDeleteMapElement(t *testing.T) {
	sess := setupAuthAndGame(t)
	mapIDStr := strconv.FormatInt(sess.MapID, 10)

	// Create - imageUrl is stored as-is (no validation that file exists)
	createBody := map[string]interface{}{
		"imageUrl": "https://example.com/img.png",
		"x":        100.0,
		"y":       50.0,
		"width":   50,
		"height":  50,
	}
	createJSON, _ := json.Marshal(createBody)
	req := httptest.NewRequest(http.MethodPost, "/api/maps/"+mapIDStr+"/elements", bytes.NewReader(createJSON))
	req.Header.Set("Content-Type", "application/json")
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("create map element: got status %d, want %d, body: %s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	var createResp struct {
		Element struct {
			ID       int64   `json:"id"`
			MapID    int64   `json:"mapId"`
			ImageURL string  `json:"imageUrl"`
			X        float64 `json:"x"`
			Y        float64 `json:"y"`
			Width    int     `json:"width"`
			Height   int     `json:"height"`
		} `json:"element"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&createResp); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if createResp.Element.X != 100 {
		t.Errorf("x: got %f, want 100", createResp.Element.X)
	}
	elementID := createResp.Element.ID

	// Update
	updateBody := map[string]interface{}{
		"x": 150.0,
		"y": 75.0,
	}
	updateJSON, _ := json.Marshal(updateBody)
	req2 := httptest.NewRequest(http.MethodPatch, "/api/map-elements/"+strconv.FormatInt(elementID, 10), bytes.NewReader(updateJSON))
	req2.Header.Set("Content-Type", "application/json")
	sess.addCookies(req2)
	rr2 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr2, req2)

	if rr2.Code != http.StatusOK {
		t.Errorf("update map element: got %d, body: %s", rr2.Code, rr2.Body.String())
	}
	var updateResp struct {
		Element struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"element"`
	}
	if err := json.NewDecoder(rr2.Body).Decode(&updateResp); err != nil {
		t.Fatalf("decode update: %v", err)
	}
	if updateResp.Element.X != 150 {
		t.Errorf("after update x: got %f, want 150", updateResp.Element.X)
	}

	// List - should have 1 element
	req3 := httptest.NewRequest(http.MethodGet, "/api/maps/"+mapIDStr+"/elements", nil)
	sess.addCookies(req3)
	rr3 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr3, req3)
	var listResp struct {
		Elements []struct {
			ID int64 `json:"id"`
		} `json:"elements"`
	}
	_ = json.NewDecoder(rr3.Body).Decode(&listResp)
	if len(listResp.Elements) != 1 {
		t.Errorf("list: got %d elements, want 1", len(listResp.Elements))
	}

	// Delete
	req4 := httptest.NewRequest(http.MethodDelete, "/api/map-elements/"+strconv.FormatInt(elementID, 10), nil)
	sess.addCookies(req4)
	rr4 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr4, req4)
	if rr4.Code != http.StatusOK {
		t.Errorf("delete: got %d", rr4.Code)
	}

	// List again - should be empty
	req5 := httptest.NewRequest(http.MethodGet, "/api/maps/"+mapIDStr+"/elements", nil)
	sess.addCookies(req5)
	rr5 := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr5, req5)
	var listResp2 struct {
		Elements []interface{} `json:"elements"`
	}
	_ = json.NewDecoder(rr5.Body).Decode(&listResp2)
	if len(listResp2.Elements) != 0 {
		t.Errorf("after delete: got %d elements, want 0", len(listResp2.Elements))
	}
}

func TestHandleCreateMapElementMissingImageUrl(t *testing.T) {
	sess := setupAuthAndGame(t)
	mapIDStr := strconv.FormatInt(sess.MapID, 10)

	createBody := map[string]interface{}{
		"x": 100.0,
		"y": 50.0,
	}
	createJSON, _ := json.Marshal(createBody)
	req := httptest.NewRequest(http.MethodPost, "/api/maps/"+mapIDStr+"/elements", bytes.NewReader(createJSON))
	req.Header.Set("Content-Type", "application/json")
	sess.addCookies(req)
	rr := httptest.NewRecorder()
	sess.Handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("create without imageUrl: got %d, want 400", rr.Code)
	}
}
