#!/bin/bash
# jdr-install-runtime.sh - Prépare un conteneur LXC pour recevoir l'app Table JDR
# déjà compilée par le runner CI (pas de Go ni de Node dans le conteneur).
# Exécuté dans le CT (via pct exec, voir jdr.sh), en root.
#
# Variable requise : JDR_DEPLOY_PUBKEY = clé SSH publique du runner.
#
# Organisation sur le disque :
#   /opt/jdr/releases/<sha>/  une version (binaire "server" + dossier "dist")
#   /opt/jdr/current          lien vers la version active
#   /opt/jdr/data/            données persistantes (uploads : cartes, musiques...)
#   /etc/jdr/jdr.env          configuration et secrets

set -euo pipefail

if [ -z "${JDR_DEPLOY_PUBKEY:-}" ]; then
    echo "Erreur: JDR_DEPLOY_PUBKEY (clé publique SSH du runner) est requise."
    exit 1
fi

BASE=/opt/jdr
APP_USER=jdr

echo "==> Installation des paquets..."
apt-get update
apt-get install -y curl openssl ca-certificates sudo openssh-server postgresql postgresql-contrib
systemctl enable --now postgresql ssh

echo "==> Utilisateur ${APP_USER}..."
if ! id "${APP_USER}" &>/dev/null; then
    useradd --system --create-home --home-dir "${BASE}" --shell /bin/bash "${APP_USER}"
fi
mkdir -p "${BASE}/releases" "${BASE}/data" "${BASE}/.ssh"
touch "${BASE}/.ssh/authorized_keys"
grep -qxF "${JDR_DEPLOY_PUBKEY}" "${BASE}/.ssh/authorized_keys" || echo "${JDR_DEPLOY_PUBKEY}" >> "${BASE}/.ssh/authorized_keys"
chmod 700 "${BASE}/.ssh"
chmod 600 "${BASE}/.ssh/authorized_keys"
chown -R "${APP_USER}:${APP_USER}" "${BASE}"

# Le runner peut seulement redémarrer le service, rien d'autre en root.
cat > /etc/sudoers.d/jdr << 'SUDO'
jdr ALL=(root) NOPASSWD: /usr/bin/systemctl restart jdr, /usr/bin/systemctl is-active jdr
SUDO
chmod 440 /etc/sudoers.d/jdr
visudo -cf /etc/sudoers.d/jdr

echo "==> Base PostgreSQL..."
JDR_DB_USER="jdr"
JDR_DB_NAME="jdr"
if [ -z "${JDR_DB_PASS:-}" ] && [ -f /etc/jdr/jdr.env ]; then
    JDR_DB_PASS=$(sed -n 's#^DATABASE_URL=postgres://[^:]*:\([^@]*\)@.*#\1#p' /etc/jdr/jdr.env)
fi
JDR_DB_PASS="${JDR_DB_PASS:-$(openssl rand -hex 16)}"
runuser -u postgres -- psql -c "CREATE USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" 2>/dev/null || true
runuser -u postgres -- psql -c "ALTER USER ${JDR_DB_USER} WITH PASSWORD '${JDR_DB_PASS}';" >/dev/null
runuser -u postgres -- psql -c "CREATE DATABASE ${JDR_DB_NAME} OWNER ${JDR_DB_USER};" 2>/dev/null || true

echo "==> Configuration /etc/jdr/jdr.env..."
mkdir -p /etc/jdr
if [ ! -f /etc/jdr/jdr.env ]; then
    cat > /etc/jdr/jdr.env << ENV
DATABASE_URL=postgres://${JDR_DB_USER}:${JDR_DB_PASS}@localhost:5432/${JDR_DB_NAME}?sslmode=disable
# Clé fixe : sans elle, tout le monde est déconnecté à chaque redémarrage.
SESSION_SECRET=$(openssl rand -hex 32)
STATIC_DIR=${BASE}/current/dist
# Décommenter si l'app est servie en HTTPS (via le reverse proxy) :
# HTTPS=true
# CORS_ORIGIN=https://jdr.exemple.fr
ENV
else
    echo "    Fichier existant conservé."
fi
chown root:"${APP_USER}" /etc/jdr/jdr.env
chmod 640 /etc/jdr/jdr.env

echo "==> Service systemd..."
cat > /etc/systemd/system/jdr.service << SVC
[Unit]
Description=Table JDR
After=network.target postgresql.service
Requires=postgresql.service
# Ne démarre qu'après le premier déploiement par le runner.
ConditionPathExists=${BASE}/current/server

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${BASE}/data
EnvironmentFile=/etc/jdr/jdr.env
ExecStart=${BASE}/current/server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload
systemctl enable jdr

echo ""
echo "==> Conteneur prêt. Il attend le premier déploiement du runner."
echo "    IP : $(hostname -I | awk '{print $1}')  (à mettre dans la variable GitHub JDR_HOST)"
