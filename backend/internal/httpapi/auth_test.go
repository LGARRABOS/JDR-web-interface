package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleRegister(t *testing.T) {
	handler := setupTestServer(t)

	body := map[string]string{
		"email":       "test@example.com",
		"password":    "secret123",
		"displayName": "Test User",
	}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("register: got status %d, want %d", rr.Code, http.StatusCreated)
	}
	var resp struct {
		User struct {
			ID          int64  `json:"id"`
			Email       string `json:"email"`
			DisplayName string `json:"displayName"`
		} `json:"user"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.User.Email != "test@example.com" {
		t.Errorf("register: got email %s", resp.User.Email)
	}
}

func TestHandleRegisterMissingFields(t *testing.T) {
	handler := setupTestServer(t)

	body := map[string]string{"email": "test@example.com"}
	jsonBody, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("register missing fields: got status %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestHandleLogin(t *testing.T) {
	handler := setupTestServer(t)

	// Register first
	regBody := map[string]string{
		"email":       "login@example.com",
		"password":    "pass123",
		"displayName": "Login User",
	}
	regJSON, _ := json.Marshal(regBody)
	regReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regJSON))
	regReq.Header.Set("Content-Type", "application/json")
	regRR := httptest.NewRecorder()
	handler.ServeHTTP(regRR, regReq)
	if regRR.Code != http.StatusCreated {
		t.Fatalf("register failed: %d", regRR.Code)
	}

	// Login
	loginBody := map[string]string{"email": "login@example.com", "password": "pass123"}
	loginJSON, _ := json.Marshal(loginBody)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginJSON))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRR := httptest.NewRecorder()
	handler.ServeHTTP(loginRR, loginReq)

	if loginRR.Code != http.StatusOK {
		t.Errorf("login: got status %d, want %d", loginRR.Code, http.StatusOK)
	}
}

func TestHandleLoginWrongPassword(t *testing.T) {
	handler := setupTestServer(t)

	regBody := map[string]string{
		"email":       "wrong@example.com",
		"password":    "correct",
		"displayName": "User",
	}
	regJSON, _ := json.Marshal(regBody)
	regReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regJSON))
	regReq.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(httptest.NewRecorder(), regReq)

	loginBody := map[string]string{"email": "wrong@example.com", "password": "wrong"}
	loginJSON, _ := json.Marshal(loginBody)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginJSON))
	loginReq.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, loginReq)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("login wrong password: got status %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

