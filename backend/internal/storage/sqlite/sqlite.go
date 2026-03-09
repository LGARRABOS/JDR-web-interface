package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

// OpenInMemory ouvre une base SQLite en mémoire (pour les tests).
func OpenInMemory() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("open sqlite memory: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}

// Open ouvre (et crée si besoin) la base SQLite au chemin donné.
func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}

// AutoMigrate crée les tables minimales pour démarrer.
func AutoMigrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS games (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			invite_code TEXT NOT NULL UNIQUE,
			owner_id INTEGER NOT NULL,
			is_gemma INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS game_players (
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('MJ','PLAYER')),
			character_name TEXT,
			PRIMARY KEY(game_id, user_id),
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS maps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			image_url TEXT NOT NULL,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			grid_size INTEGER NOT NULL DEFAULT 50,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			map_id INTEGER NOT NULL,
			created_by INTEGER NOT NULL,
			owner_user_id INTEGER,
			kind TEXT NOT NULL CHECK(kind IN ('PJ','PNJ','OBJET')),
			name TEXT NOT NULL,
			color TEXT NOT NULL DEFAULT '#6b7280',
			icon_url TEXT,
			x REAL NOT NULL DEFAULT 0,
			y REAL NOT NULL DEFAULT 0,
			visible_to_players INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
			FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
		);`,
		`CREATE TABLE IF NOT EXISTS fog_patches (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			map_id INTEGER NOT NULL,
			shape_type TEXT NOT NULL CHECK(shape_type IN ('rect','polygon')),
			shape_data TEXT NOT NULL,
			revealed INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS game_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('MJ','PLAYER')),
			content TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS dice_rolls (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			expression TEXT NOT NULL,
			result INTEGER NOT NULL,
			details TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS game_character_sheets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			filename TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(game_id, user_id),
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS game_music (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id INTEGER NOT NULL,
			filename TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
		);`,
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	// Migration : ajouter is_gemma si la table games existe déjà sans cette colonne
	if _, err := db.Exec("ALTER TABLE games ADD COLUMN is_gemma INTEGER NOT NULL DEFAULT 0"); err != nil {
		// Ignorer si la colonne existe déjà (nouvelle install)
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("migrate is_gemma: %w", err)
		}
	}
	// Migration : ajouter character_name à game_players
	if _, err := db.Exec("ALTER TABLE game_players ADD COLUMN character_name TEXT"); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("migrate character_name: %w", err)
		}
	}
	// Migration : ajouter current_map_id à games
	if _, err := db.Exec("ALTER TABLE games ADD COLUMN current_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL"); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("migrate current_map_id: %w", err)
		}
	}
	// Migration : ajouter hp et max_hp aux tokens (ennemis)
	if _, err := db.Exec("ALTER TABLE tokens ADD COLUMN hp INTEGER"); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("migrate tokens hp: %w", err)
		}
	}
	if _, err := db.Exec("ALTER TABLE tokens ADD COLUMN max_hp INTEGER"); err != nil {
		if !strings.Contains(err.Error(), "duplicate column") {
			return fmt.Errorf("migrate tokens max_hp: %w", err)
		}
	}
	// Index unique : un seul token PJ par joueur par carte (évite les doublons)
	if _, err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_pj_unique ON tokens(map_id, owner_user_id) WHERE kind = 'PJ' AND owner_user_id IS NOT NULL"); err != nil {
		// Ignorer si index existe ou si la table a des doublons (nettoyage manuel possible)
		if !strings.Contains(err.Error(), "already exists") && !strings.Contains(err.Error(), "duplicate") && !strings.Contains(err.Error(), "UNIQUE") {
			return fmt.Errorf("migrate idx_tokens_pj_unique: %w", err)
		}
	}
	return nil
}

