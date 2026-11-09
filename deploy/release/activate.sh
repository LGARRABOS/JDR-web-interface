#!/bin/bash
# activate.sh - Active une nouvelle version de Table JDR sur le conteneur.
# Envoyé et lancé par le workflow de déploiement (utilisateur jdr, via SSH).
#
# Usage : activate.sh <version> <archive.tgz>
#
# 1. extrait l'archive dans /opt/jdr/releases/<version>
# 2. bascule le lien /opt/jdr/current et redémarre le service
# 3. vérifie /healthz ; en cas d'échec, revient à la version précédente
# 4. garde les 5 dernières versions

set -euo pipefail

VERSION="${1:?version requise}"
ARCHIVE="${2:?archive requise}"
BASE="${JDR_BASE:-/opt/jdr}"
DIR="${BASE}/releases/${VERSION}"
HEALTH_URL="${JDR_HEALTH_URL:-http://127.0.0.1:4000/healthz}"
KEEP=5

switch_to() {
    ln -sfn "$1" "${BASE}/current.new"
    mv -Tf "${BASE}/current.new" "${BASE}/current"
    sudo /usr/bin/systemctl restart jdr
}

healthy() {
    for _ in $(seq 1 30); do
        if curl -fsS --max-time 2 "${HEALTH_URL}" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

echo "==> Extraction de la version ${VERSION}..."
rm -rf "${DIR}"
mkdir -p "${DIR}"
tar -xzf "${ARCHIVE}" -C "${DIR}"
rm -f "${ARCHIVE}"
chmod +x "${DIR}/server"

PREVIOUS=""
if [ -L "${BASE}/current" ]; then
    PREVIOUS=$(readlink -f "${BASE}/current")
fi

echo "==> Activation..."
switch_to "${DIR}"

if healthy; then
    echo "==> Version ${VERSION} en ligne."
else
    echo "!! La nouvelle version ne répond pas sur ${HEALTH_URL}."
    if [ -n "${PREVIOUS}" ] && [ "${PREVIOUS}" != "${DIR}" ]; then
        echo "==> Retour à la version précédente : $(basename "${PREVIOUS}")"
        switch_to "${PREVIOUS}"
        if healthy; then
            echo "    Version précédente rétablie."
        else
            echo "!! La version précédente ne répond pas non plus."
        fi
    fi
    exit 1
fi

# Nettoyage des anciennes versions (jamais la version active).
ACTIVE=$(readlink -f "${BASE}/current")
find "${BASE}/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -rn | awk '{print $2}' | tail -n +$((KEEP + 1)) \
    | while read -r old; do
        [ "${old}" = "${ACTIVE}" ] || rm -rf "${old}"
    done
