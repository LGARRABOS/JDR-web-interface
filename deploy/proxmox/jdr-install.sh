#!/bin/bash
# jdr-install.sh - Installation de l'app Table JDR dans un conteneur LXC
# Exécuté dans le CT (via pct exec ou SSH)

set -e

REPO_URL="https://github.com/LGARRABOS/JDR-web-interface.git"
INSTALL_DIR="/opt/jdr"
GO_VERSION="1.21.13"
NODE_VERSION="20"

echo "==> Mise à jour et installation des paquets de base..."
apt-get update
apt-get install -y curl git build-essential gcc libc6-dev

echo "==> Installation de Go ${GO_VERSION}..."
if ! command -v go &>/dev/null || ! go version | grep -qE 'go1\.(2[1-9]|[3-9][0-9])'; then
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
JDR_DB_PASS="${JDR_DB_PASS:-$(openssl rand -hex 16)}"
sudo -u postgres psql -c "CREATE USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" 2>/dev/null || true
# Toujours mettre à jour le mot de passe (au cas où l'utilisateur existait déjà)
sudo -u postgres psql -c "ALTER USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${JDR_DB_NAME} OWNER ${JDR_DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${JDR_DB_NAME} TO ${JDR_DB_USER};" 2>/dev/null || true

echo "==> Clonage du dépôt..."
rm -rf "${INSTALL_DIR}"
git clone "${REPO_URL}" "${INSTALL_DIR}"
cd "${INSTALL_DIR}" || exit 1

echo "==> Build de l'application..."
npm ci
(cd frontend && npm ci) || exit 1
# Limiter l'usage mémoire de Node pendant le build (évite OOM sur CT avec 1 Go RAM)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
npm run build

echo "==> Création des dossiers data et uploads..."
mkdir -p "${INSTALL_DIR}/backend/data" "${INSTALL_DIR}/backend/uploads"

# Sauvegarder le mot de passe DB pour référence (ne pas committer)
echo "${JDR_DB_PASS}" > "${INSTALL_DIR}/.dbpass"
chmod 600 "${INSTALL_DIR}/.dbpass"

# URL PostgreSQL pour l'app
DATABASE_URL="postgres://${JDR_DB_USER}:${JDR_DB_PASS}@localhost:5432/${JDR_DB_NAME}?sslmode=disable"

echo "==> Création du service systemd..."
cat > /etc/systemd/system/jdr.service << SVC
[Unit]
Description=Table JDR - Backend Go
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDir=/opt/jdr/backend
ExecStart=/opt/jdr/backend/server
Environment=STATIC_DIR=/opt/jdr/frontend/dist
Environment=DATABASE_URL=${DATABASE_URL}
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
