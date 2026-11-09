#!/bin/bash
# install-runner.sh - Installe un runner GitHub Actions auto-hébergé sur une
# machine Debian/Ubuntu (VM ou LXC Proxmox). Prévu pour servir tous vos projets.
# Exécuté en root sur la machine runner.
#
# Usage : install-runner.sh <cible> <jeton> [labels]
#   <cible>  "proprietaire/depot" (runner pour un dépôt)
#            ou "organisation"     (runner partagé par tous les dépôts de l'organisation)
#   <jeton>  jeton d'enregistrement : GitHub > Settings > Actions > Runners > New self-hosted runner
#   [labels] labels supplémentaires (défaut : homelab)
#
# Relancer le script avec une autre cible ajoute un runner de plus sur la même
# machine (un dossier et un service par cible).
#
# Les outils de build (Go, Node...) ne sont pas installés ici : les workflows les
# installent eux-mêmes avec actions/setup-go, actions/setup-node, etc.

set -euo pipefail

TARGET="${1:?Usage: install-runner.sh <proprietaire/depot|organisation> <jeton> [labels]}"
TOKEN="${2:?jeton requis}"
LABELS="${3:-homelab}"
RUNNER_USER=runner

case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) echo "Architecture non supportée : $(uname -m)"; exit 1 ;;
esac

echo "==> Paquets de base..."
apt-get update
apt-get install -y curl git tar jq rsync openssh-client build-essential ca-certificates sudo

echo "==> Utilisateur ${RUNNER_USER}..."
if ! id "${RUNNER_USER}" &>/dev/null; then
    useradd --create-home --shell /bin/bash "${RUNNER_USER}"
fi
RUNNER_HOME=$(getent passwd "${RUNNER_USER}" | cut -d: -f6)

# Clé SSH utilisée par les workflows pour déployer sur vos serveurs.
if [ ! -f "${RUNNER_HOME}/.ssh/id_ed25519" ]; then
    runuser -u "${RUNNER_USER}" -- mkdir -p "${RUNNER_HOME}/.ssh"
    runuser -u "${RUNNER_USER}" -- ssh-keygen -t ed25519 -N "" -C "runner@$(hostname)" -f "${RUNNER_HOME}/.ssh/id_ed25519"
fi

echo "==> Téléchargement du runner GitHub Actions..."
VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')
NAME=$(echo "${TARGET}" | tr '/' '-')
DIR="/opt/actions-runner/${NAME}"
if [ -f "${DIR}/.runner" ]; then
    echo "Erreur: un runner est déjà configuré dans ${DIR}."
    echo "Pour le remplacer : cd ${DIR} && ./svc.sh stop && ./svc.sh uninstall && sudo -u ${RUNNER_USER} ./config.sh remove --token <jeton>"
    exit 1
fi
mkdir -p "${DIR}"
curl -fsSL -o /tmp/actions-runner.tgz \
    "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-${ARCH}-${VERSION}.tar.gz"
tar -xzf /tmp/actions-runner.tgz -C "${DIR}"
rm -f /tmp/actions-runner.tgz
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${DIR}"
"${DIR}/bin/installdependencies.sh"

echo "==> Enregistrement auprès de GitHub (${TARGET})..."
cd "${DIR}" || exit 1
runuser -u "${RUNNER_USER}" -- ./config.sh --unattended \
    --url "https://github.com/${TARGET}" \
    --token "${TOKEN}" \
    --name "$(hostname)-${NAME}" \
    --labels "${LABELS}" \
    --work _work

echo "==> Installation du service..."
./svc.sh install "${RUNNER_USER}"
./svc.sh start

echo ""
echo "=========================================="
echo "  Runner installé : $(hostname)-${NAME} (labels : self-hosted, linux, ${LABELS})"
echo "=========================================="
echo ""
echo "Clé SSH publique du runner (à donner aux serveurs sur lesquels il déploie) :"
echo ""
cat "${RUNNER_HOME}/.ssh/id_ed25519.pub"
echo ""
