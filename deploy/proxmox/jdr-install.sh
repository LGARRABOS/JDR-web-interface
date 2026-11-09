#!/bin/bash
# jdr-install.sh - Installation de l'app Table JDR dans un conteneur LXC
# Exécuté dans le CT (via pct exec ou SSH)

set -e

REPO_URL="https://github.com/LGARRABOS/JDR-web-interface.git"
INSTALL_DIR="/opt/jdr"
GO_VERSION="1.24.7"
NODE_VERSION="20"

echo "==> Mise à jour et installation des paquets de base..."
apt-get update
apt-get install -y curl git build-essential gcc libc6-dev openssl ca-certificates

echo "==> Installation de Go ${GO_VERSION}..."
if ! command -v go &>/dev/null || ! go version | grep -qE 'go1\.(2[4-9]|[3-9][0-9])'; then
    cd /tmp || exit 1
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go.tar.gz
    rm go.tar.gz
    export PATH="/usr/local/go/bin:$PATH"
    # shellcheck disable=SC2016
    echo 'export PATH="/usr/local/go/bin:$PATH"' >> /etc/profile.d/go.sh
fi
export PATH="/usr/local/go/bin:${PATH}"

echo "==> Installation de Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null || ! node -v | grep -qE 'v(2[0-9]|[3-9][0-9])'; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
fi

echo "==> Installation de PostgreSQL..."
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Créer l'utilisateur et la base pour l'app
JDR_DB_USER="jdr"
JDR_DB_NAME="jdr"
# Réutiliser le mot de passe existant si l'app est déjà configurée (sinon la base deviendrait inaccessible).
if [ -z "${JDR_DB_PASS:-}" ] && [ -f /etc/jdr/jdr.env ]; then
    JDR_DB_PASS=$(sed -n 's#^DATABASE_URL=postgres://[^:]*:\([^@]*\)@.*#\1#p' /etc/jdr/jdr.env)
fi
JDR_DB_PASS="${JDR_DB_PASS:-$(openssl rand -hex 16)}"
runuser -u postgres -- psql -c "CREATE USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" 2>/dev/null || true
# Toujours mettre à jour le mot de passe (au cas où l'utilisateur existait déjà)
runuser -u postgres -- psql -c "ALTER USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" 2>/dev/null || true
runuser -u postgres -- psql -c "CREATE DATABASE ${JDR_DB_NAME} OWNER ${JDR_DB_USER};" 2>/dev/null || true
runuser -u postgres -- psql -c "GRANT ALL PRIVILEGES ON DATABASE ${JDR_DB_NAME} TO ${JDR_DB_USER};" 2>/dev/null || true

echo "==> Clonage du dépôt..."
if [ -d "${INSTALL_DIR}/.git" ]; then
    # Ne jamais supprimer une installation existante : elle contient les uploads (cartes, musiques).
    echo "    ${INSTALL_DIR} existe déjà : mise à jour au lieu d'une réinstallation."
    git -C "${INSTALL_DIR}" pull --ff-only origin main
else
    git clone "${REPO_URL}" "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}" || exit 1

echo "==> Build de l'application..."
npm ci
(cd frontend && npm ci) || exit 1
# Limiter l'usage mémoire de Node pendant le build (évite OOM sur CT avec 1 Go RAM)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
npm run build

echo "==> Création des dossiers data et uploads..."
mkdir -p "${INSTALL_DIR}/backend/data" "${INSTALL_DIR}/backend/uploads"

# Configuration (secrets) hors du dépôt : /etc/jdr/jdr.env
mkdir -p /etc/jdr
if [ ! -f /etc/jdr/jdr.env ]; then
    cat > /etc/jdr/jdr.env << ENV
DATABASE_URL=postgres://${JDR_DB_USER}:${JDR_DB_PASS}@localhost:5432/${JDR_DB_NAME}?sslmode=disable
# Clé fixe : sans elle, tout le monde est déconnecté à chaque redémarrage.
SESSION_SECRET=$(openssl rand -hex 32)
STATIC_DIR=/opt/jdr/frontend/dist
# Décommenter si l'app est servie en HTTPS (via le reverse proxy) :
# HTTPS=true
# CORS_ORIGIN=https://jdr.exemple.fr
ENV
    chmod 600 /etc/jdr/jdr.env
else
    echo "    /etc/jdr/jdr.env existe déjà : conservé."
fi

echo "==> Création du service systemd..."
cat > /etc/systemd/system/jdr.service << 'SVC'
[Unit]
Description=Table JDR - Backend Go
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/jdr/backend
EnvironmentFile=/etc/jdr/jdr.env
ExecStart=/opt/jdr/backend/server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

echo "==> Activation et démarrage du service..."
systemctl daemon-reload
systemctl enable --now jdr

echo ""
echo "==> Installation terminée."
echo "    L'application est accessible sur http://<IP_CT>:4000"
echo "    Configurez votre reverse proxy Nginx pour pointer vers ce port."
