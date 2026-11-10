package httpapi

import "testing"

func TestSpawnPositionsCentered(t *testing.T) {
	pos := spawnPositions(1, 1000, 800, 50)
	if len(pos) != 1 || pos[0] != [2]float64{500, 400} {
		t.Fatalf("un seul jeton doit être au centre, obtenu %v", pos)
	}

	pos = spawnPositions(5, 1000, 800, 50)
	if len(pos) != 5 {
		t.Fatalf("attendu 5 positions, obtenu %d", len(pos))
	}
	minX, maxX, minY, maxY := 1e9, -1e9, 1e9, -1e9
	seen := map[[2]float64]bool{}
	for _, p := range pos {
		if p[0] < 0 || p[0] > 1000 || p[1] < 0 || p[1] > 800 {
			t.Fatalf("position hors carte : %v", p)
		}
		if seen[p] {
			t.Fatalf("deux jetons au même endroit : %v", p)
		}
		seen[p] = true
		minX, maxX = min(minX, p[0]), max(maxX, p[0])
		minY, maxY = min(minY, p[1]), max(maxY, p[1])
	}
	if (minX+maxX)/2 != 500 || (minY+maxY)/2 != 400 {
		t.Fatalf("le groupe doit être centré, obtenu %v", pos)
	}
}

func TestSpawnPositionsSmallMap(t *testing.T) {
	for _, p := range spawnPositions(9, 100, 100, 50) {
		if p[0] < 0 || p[0] > 100 || p[1] < 0 || p[1] > 100 {
			t.Fatalf("position hors d'une petite carte : %v", p)
		}
	}
}
