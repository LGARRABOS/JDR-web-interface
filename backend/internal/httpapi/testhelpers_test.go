package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"jdr-backend/internal/storage"
)

func setupTestServer(t *testing.T) http.Handler {
	t.Helper()
	db := storage.OpenTestDB(t)
	handler, err := NewServer(db, "")
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	return handler
}

// testSession représente une session authentifiée avec un jeu créé.
type testSession struct {
	Handler    http.Handler
	Cookies    []*http.Cookie
	GameID     int64
	MapID      int64
	InviteCode string
}

// setupAuthAndGame crée un utilisateur, le connecte, crée une partie et une carte.
func setupAuthAndGame(t *testing.T) *testSession {
	t.Helper()
	handler := setupTestServer(t)

	// Register
	regBody := map[string]string{
		"email":       "mj@test.com",
		"password":    "pass123",
		"displayName": "MJ Test",
	}
	regJSON, _ := json.Marshal(regBody)
	regReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regJSON))
	regReq.Header.Set("Content-Type", "application/json")
	regRR := httptest.NewRecorder()
	handler.ServeHTTP(regRR, regReq)
	if regRR.Code != http.StatusCreated {
		t.Fatalf("register: got %d", regRR.Code)
	}

	// Login
	loginBody := map[string]string{"email": "mj@test.com", "password": "pass123"}
	loginJSON, _ := json.Marshal(loginBody)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginJSON))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRR := httptest.NewRecorder()
	handler.ServeHTTP(loginRR, loginReq)
	if loginRR.Code != http.StatusOK {
		t.Fatalf("login: got %d", loginRR.Code)
	}
	cookies := loginRR.Result().Cookies()

	// Create game
	gameBody := map[string]string{"name": "Test Game"}
	gameJSON, _ := json.Marshal(gameBody)
	gameReq := httptest.NewRequest(http.MethodPost, "/api/games", bytes.NewReader(gameJSON))
	gameReq.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		gameReq.AddCookie(c)
	}
	gameRR := httptest.NewRecorder()
	handler.ServeHTTP(gameRR, gameReq)
	if gameRR.Code != http.StatusCreated {
		t.Fatalf("create game: got %d", gameRR.Code)
	}
	var gameResp struct {
		Game struct {
			ID         int64  `json:"id"`
			InviteCode string `json:"inviteCode"`
		} `json:"game"`
	}
	if err := json.NewDecoder(gameRR.Body).Decode(&gameResp); err != nil {
		t.Fatalf("decode game: %v", err)
	}
	gameID := gameResp.Game.ID
	inviteCode := gameResp.Game.InviteCode

	// Create map
	mapBody := map[string]interface{}{
		"name":     "Test Map",
		"imageUrl": "https://via.placeholder.com/800x600",
		"width":    800,
		"height":   600,
		"gridSize": 50,
	}
	mapJSON, _ := json.Marshal(mapBody)
	mapReq := httptest.NewRequest(http.MethodPost, "/api/games/"+strconv.FormatInt(gameID, 10)+"/maps", bytes.NewReader(mapJSON))
	mapReq.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		mapReq.AddCookie(c)
	}
	mapRR := httptest.NewRecorder()
	handler.ServeHTTP(mapRR, mapReq)
	if mapRR.Code != http.StatusCreated {
		t.Fatalf("create map: got %d", mapRR.Code)
	}
	var mapResp struct {
		Map struct {
			ID int64 `json:"id"`
		} `json:"map"`
	}
	if err := json.NewDecoder(mapRR.Body).Decode(&mapResp); err != nil {
		t.Fatalf("decode map: %v", err)
	}
	mapID := mapResp.Map.ID

	return &testSession{
		Handler:    handler,
		Cookies:    cookies,
		GameID:     gameID,
		MapID:      mapID,
		InviteCode: inviteCode,
	}
}

// addCookies ajoute les cookies de session à la requête.
func (s *testSession) addCookies(req *http.Request) {
	for _, c := range s.Cookies {
		req.AddCookie(c)
	}
}
