#!/bin/bash
# jdr-update.sh - Mise à jour de l'app Table JDR
# Exécutable dans le CT ou via: pct exec <CTID> -- bash -c "$(curl -fsSL ...)"

set -e

INSTALL_DIR="/opt/jdr"
# Go et Node peuvent être hors PATH en session non-interactive (pct exec)
[ -f /etc/profile.d/go.sh ] && . /etc/profile.d/go.sh
export PATH="/usr/local/go/bin:${PATH}"

if [ ! -d "${INSTALL_DIR}" ]; then
    echo "Erreur: ${INSTALL_DIR} introuvable. L'application n'est pas installée."
    exit 1
fi

cd "${INSTALL_DIR}" || exit 1

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

echo "==> Rebuild de l'application..."
npm ci
(cd frontend && npm ci) || exit 1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
npm run build

echo "==> Redémarrage du service..."
systemctl restart jdr

echo ""
echo "==> Mise à jour terminée."
echo "    Version: $(git log -1 --oneline)"
