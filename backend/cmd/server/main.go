package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	// Délais : protège des connexions lentes (slowloris). Pas de WriteTimeout,
	// qui couperait le WebSocket et les longs téléchargements de musique.
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}

	// Arrêt propre (déploiement) : on finit les requêtes en cours.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		log.Printf("arrêt demandé, fin des requêtes en cours…")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	log.Printf("JDR backend listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}
