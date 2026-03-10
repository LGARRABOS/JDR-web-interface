#!/bin/bash
# jdr-update.sh - Mise à jour de l'app Table JDR
# Exécutable dans le CT ou via: pct exec <CTID> -- bash -c "$(curl -fsSL ...)"
#
# Quand lancé via curl, le script exécuté est la version en cache. Après git pull,
# on re-exécute avec --build-only pour utiliser la version à jour du dépôt.

set -e

INSTALL_DIR="/opt/jdr"
BUILD_ONLY="${1:-}"

if [ ! -d "${INSTALL_DIR}" ]; then
    echo "Erreur: ${INSTALL_DIR} introuvable. L'application n'est pas installée."
    exit 1
fi

cd "${INSTALL_DIR}" || exit 1

if [ "${BUILD_ONLY}" != "--build-only" ]; then
    echo "==> Vérification des mises à jour..."
    git fetch origin
    BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

    if [ "${BEHIND}" = "0" ]; then
        echo "    Déjà à jour."
        git log -1 --oneline
        exit 0
    fi

    echo "==> Mise à jour (${BEHIND} commit(s) en attente)..."
    git pull origin main

    # Re-exécuter ce script depuis le dépôt (version à jour)
    exec bash "${INSTALL_DIR}/deploy/proxmox/jdr-update.sh" --build-only
fi

echo "==> Rebuild de l'application..."
npm ci
(cd frontend && npm ci) || exit 1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
# Build backend avec chemin absolu (go peut être hors PATH en pct exec)
if [ -x /usr/local/go/bin/go ]; then
  (cd backend && /usr/local/go/bin/go build ./cmd/server) || { echo "Erreur: build backend échoué."; exit 1; }
elif command -v go &>/dev/null; then
  (cd backend && go build ./cmd/server) || { echo "Erreur: build backend échoué."; exit 1; }
else
  echo "Erreur: Go introuvable. Exécutez jdr-install.sh pour une installation complète."
  exit 1
fi
# Build frontend
(cd frontend && npm run build) || { echo "Erreur: build frontend échoué."; exit 1; }

echo "==> Redémarrage du service..."
systemctl restart jdr

echo ""
echo "==> Mise à jour terminée."
echo "    Version: $(git log -1 --oneline)"
