package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"sync"
	"time"
)

// Empreinte du contenu des fichiers statiques (modèles 3D, textures…).
//
// Le serveur de fichiers de Go ne fournit que Last-Modified, que chaque
// déploiement remet à zéro : les navigateurs retéléchargeaient alors toutes
// les ressources (plusieurs dizaines de Mo) après chaque mise en ligne. Avec
// une empreinte du contenu, un fichier inchangé répond 304 et reste en cache.

type etagEntry struct {
	size  int64
	mtime time.Time
	tag   string
}

var etags sync.Map // chemin → etagEntry

// contentETag renvoie l'ETag (fort) du fichier, calculé une fois par version
// du fichier (taille + date de modification), ou "" en cas d'erreur.
func contentETag(path string, info os.FileInfo) string {
	if e, ok := etags.Load(path); ok {
		ent := e.(etagEntry)
		if ent.size == info.Size() && ent.mtime.Equal(info.ModTime()) {
			return ent.tag
		}
	}
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return ""
	}
	tag := `"` + hex.EncodeToString(h.Sum(nil)[:12]) + `"`
	etags.Store(path, etagEntry{size: info.Size(), mtime: info.ModTime(), tag: tag})
	return tag
}
