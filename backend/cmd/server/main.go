package main

import (
	"log"
	"net/http"

	"jdr-backend/internal/httpapi"
	"jdr-backend/internal/storage/sqlite"
)

func main() {
	db, err := sqlite.Open("data/game.db")
	if err != nil {
		log.Fatalf("unable to open database: %v", err)
	}
	defer db.Close()

	if err := sqlite.AutoMigrate(db); err != nil {
		log.Fatalf("unable to migrate database: %v", err)
	}

	handler, err := httpapi.NewServer(db)
	if err != nil {
		log.Fatalf("unable to create HTTP server: %v", err)
	}

	addr := ":4000"
	log.Printf("JDR backend listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

