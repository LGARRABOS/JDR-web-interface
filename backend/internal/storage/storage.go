package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/jmoiron/sqlx"
	"jdr-backend/internal/storage/postgres"
)

var ErrNoDatabaseURL = errors.New("DATABASE_URL requis (ex: postgres://jdr:jdr@localhost:5432/jdr?sslmode=disable)")

// DB est l'interface utilisée par l'API. Les requêtes avec ? sont converties en $1, $2.
type DB interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	Query(query string, args ...interface{}) (*sql.Rows, error)
	QueryRow(query string, args ...interface{}) *sql.Row
}

type rebindDB struct {
	db     *sql.DB
	rebind func(string) string
}

func (r *rebindDB) Exec(query string, args ...interface{}) (sql.Result, error) {
	return r.db.Exec(r.rebind(query), args...)
}

func (r *rebindDB) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return r.db.Query(r.rebind(query), args...)
}

func (r *rebindDB) QueryRow(query string, args ...interface{}) *sql.Row {
	return r.db.QueryRow(r.rebind(query), args...)
}

// Open ouvre une connexion PostgreSQL et retourne un DB prêt pour l'API.
func Open(dbURL string) (DB, *sql.DB, error) {
	if dbURL == "" || (!strings.HasPrefix(dbURL, "postgres://") && !strings.HasPrefix(dbURL, "postgresql://")) {
		return nil, nil, fmt.Errorf("%w", ErrNoDatabaseURL)
	}
	raw, err := postgres.Open(dbURL)
	if err != nil {
		return nil, nil, err
	}
	sqlxDB := sqlx.NewDb(raw, "pgx")
	return &rebindDB{db: raw, rebind: sqlxDB.Rebind}, raw, nil
}

// AutoMigrate applique les migrations sur la base PostgreSQL.
func AutoMigrate(db *sql.DB, _ string) error {
	return postgres.AutoMigrate(db)
}

// OpenTestDB ouvre une base PostgreSQL pour les tests (jdr_test par défaut).
// Créez la base avec: createdb jdr_test
func OpenTestDB(t testing.TB) DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = "postgres://jdr:jdr@localhost:5432/jdr_test?sslmode=disable"
	}
	appDB, rawDB, err := Open(url)
	if err != nil {
		t.Skipf("PostgreSQL requis pour les tests: %v (créez la base: createdb jdr_test)", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	if err := postgres.AutoMigrate(rawDB); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	truncateAll(t, appDB)
	return appDB
}

func truncateAll(t testing.TB, db DB) {
	t.Helper()
	tables := []string{
		"map_elements", "game_elements", "tokens", "fog_patches", "maps",
		"game_character_sheets", "game_music", "game_messages", "dice_rolls",
		"game_players", "games", "users",
	}
	for _, tbl := range tables {
		_, _ = db.Exec("TRUNCATE TABLE " + tbl + " CASCADE")
	}
}
