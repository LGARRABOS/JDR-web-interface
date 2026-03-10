package main

import (
	"log"
	"net/http"
	"os"

	"jdr-backend/internal/httpapi"
	"jdr-backend/internal/storage"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatalf("DATABASE_URL requis. Ex: postgres://jdr:jdr@localhost:5432/jdr?sslmode=disable")
	}

	appDB, rawDB, err := storage.Open(dbURL)
	if err != nil {
		log.Fatalf("unable to open database: %v", err)
	}
	defer rawDB.Close()

	if err := storage.AutoMigrate(rawDB, dbURL); err != nil {
		log.Fatalf("unable to migrate database: %v", err)
	}

	staticDir := os.Getenv("STATIC_DIR")
	handler, err := httpapi.NewServer(appDB, staticDir)
	if err != nil {
		log.Fatalf("unable to create HTTP server: %v", err)
	}

	addr := ":4000"
	log.Printf("JDR backend listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

