package postgres

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Open ouvre une connexion PostgreSQL via l'URL donnée.
func Open(url string) (*sql.DB, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return db, nil
}

// AutoMigrate crée les tables et colonnes pour PostgreSQL.
func AutoMigrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS games (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			invite_code TEXT NOT NULL UNIQUE,
			owner_id INTEGER NOT NULL,
			is_gemma INTEGER NOT NULL DEFAULT 0,
			current_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS game_players (
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('MJ','PLAYER')),
			character_name TEXT,
			PRIMARY KEY(game_id, user_id),
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS maps (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			image_url TEXT NOT NULL,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			grid_size INTEGER NOT NULL DEFAULT 50,
			tags TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS tokens (
			id SERIAL PRIMARY KEY,
			map_id INTEGER NOT NULL,
			created_by INTEGER NOT NULL,
			owner_user_id INTEGER,
			kind TEXT NOT NULL CHECK(kind IN ('PJ','PNJ','OBJET')),
			name TEXT NOT NULL,
			color TEXT NOT NULL DEFAULT '#6b7280',
			icon_url TEXT,
			x DOUBLE PRECISION NOT NULL DEFAULT 0,
			y DOUBLE PRECISION NOT NULL DEFAULT 0,
			visible_to_players INTEGER NOT NULL DEFAULT 1,
			hp INTEGER,
			max_hp INTEGER,
			mana INTEGER,
			max_mana INTEGER,
			width INTEGER,
			height INTEGER,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
			FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS fog_patches (
			id SERIAL PRIMARY KEY,
			map_id INTEGER NOT NULL,
			shape_type TEXT NOT NULL CHECK(shape_type IN ('rect','polygon')),
			shape_data TEXT NOT NULL,
			revealed INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS game_messages (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('MJ','PLAYER')),
			content TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS dice_rolls (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			expression TEXT NOT NULL,
			result INTEGER NOT NULL,
			details TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS game_character_sheets (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			filename TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(game_id, user_id),
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS game_music (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			filename TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS game_elements (
			id SERIAL PRIMARY KEY,
			game_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			image_url TEXT NOT NULL,
			category TEXT NOT NULL CHECK(category IN ('monster','decor')),
			tags TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS map_elements (
			id SERIAL PRIMARY KEY,
			map_id INTEGER NOT NULL,
			image_url TEXT NOT NULL,
			x DOUBLE PRECISION NOT NULL DEFAULT 0,
			y DOUBLE PRECISION NOT NULL DEFAULT 0,
			width INTEGER NOT NULL DEFAULT 50,
			height INTEGER NOT NULL DEFAULT 50,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
		)`,
	}

	// games référence maps, mais maps référence games. On crée games sans current_map_id d'abord.
	// Ordre: users, games (sans current_map_id), game_players, maps, puis ALTER games.
	// En fait games a FK vers maps, et maps a FK vers games. PostgreSQL permet de créer
	// games sans la FK current_map_id, puis ALTER pour l'ajouter. Simplifions:
	// 1. users
	// 2. games (sans current_map_id)
	// 3. game_players
	// 4. maps
	// 5. ALTER games ADD current_map_id
	// 6. tokens, fog_patches, etc.

	// Réorganiser: games ne peut pas avoir current_map_id au départ car maps n'existe pas.
	createGames := `CREATE TABLE IF NOT EXISTS games (
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		invite_code TEXT NOT NULL UNIQUE,
		owner_id INTEGER NOT NULL,
		is_gemma INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
	)`

	orderedStmts := []string{
		// users first
		stmts[0],
		createGames,
		stmts[2], // game_players
		stmts[3], // maps
		`ALTER TABLE games ADD COLUMN current_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL`,
		`ALTER TABLE games ADD COLUMN token_movement_locked INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE games ADD COLUMN fog_vision_radius INTEGER NOT NULL DEFAULT 0`,
		stmts[4], // tokens
		stmts[5], // fog_patches
		stmts[6], // game_messages
		stmts[7], // dice_rolls
		`ALTER TABLE dice_rolls ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`,
		stmts[8], // game_character_sheets
		stmts[9], // game_music
		`ALTER TABLE game_music ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`,
		`UPDATE game_music gm SET user_id = g.owner_id FROM games g WHERE g.id = gm.game_id AND gm.user_id IS NULL`,
		stmts[10], // game_elements
		`ALTER TABLE game_elements ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`,
		`UPDATE game_elements ge SET user_id = g.owner_id FROM games g WHERE g.id = ge.game_id AND ge.user_id IS NULL`,
		stmts[11], // map_elements
		`ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_kind_check`,
		`ALTER TABLE tokens ADD CONSTRAINT tokens_kind_check CHECK (kind IN ('PJ','PNJ','OBJET','MORT'))`,
		`ALTER TABLE game_elements ADD COLUMN description TEXT`,
		`ALTER TABLE game_elements ADD COLUMN unique_trait TEXT`,
		`ALTER TABLE game_elements ADD COLUMN loot TEXT`,
		`ALTER TABLE game_elements ADD COLUMN max_hp INTEGER`,
		`ALTER TABLE game_elements ADD COLUMN max_mana INTEGER`,
		`ALTER TABLE game_elements ADD COLUMN icon_pos_x INTEGER DEFAULT 50`,
		`ALTER TABLE game_elements ADD COLUMN icon_pos_y INTEGER DEFAULT 50`,
		`ALTER TABLE tokens ADD COLUMN element_id INTEGER REFERENCES game_elements(id) ON DELETE SET NULL`,
		`ALTER TABLE game_character_sheets ADD COLUMN data JSONB`,
		`ALTER TABLE game_character_sheets ALTER COLUMN filename DROP NOT NULL`,
		`ALTER TABLE game_character_sheets ALTER COLUMN storage_path DROP NOT NULL`,
		`ALTER TABLE game_character_sheets ALTER COLUMN mime_type DROP NOT NULL`,
		`ALTER TABLE tokens ADD COLUMN icon_pos_x INTEGER DEFAULT 50`,
		`ALTER TABLE tokens ADD COLUMN icon_pos_y INTEGER DEFAULT 50`,
		`ALTER TABLE game_elements ADD COLUMN icon_scale REAL DEFAULT 1`,
		`ALTER TABLE tokens ADD COLUMN icon_scale REAL DEFAULT 1`,
	}

	for _, stmt := range orderedStmts {
		if _, err := db.Exec(stmt); err != nil {
			errLower := strings.ToLower(err.Error())
			if strings.Contains(errLower, "already exists") ||
				strings.Contains(errLower, "existe déjà") ||
				strings.Contains(errLower, "duplicate column") ||
				strings.Contains(errLower, "42701") { // SQLSTATE: duplicate_column
				continue
			}
			return fmt.Errorf("migrate: %w", err)
		}
	}

	// Index partiel pour tokens PJ unique
	_, _ = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_pj_unique ON tokens(map_id, owner_user_id) WHERE kind = 'PJ' AND owner_user_id IS NOT NULL`)

	return nil
}
