#!/bin/bash
# jdr.sh - Création d'un CT Proxmox et installation de l'app Table JDR
# Exécuté sur l'hôte Proxmox
#
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr.sh)"

set -e

INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr-install.sh"
DEFAULT_CTID="100"
DEFAULT_HOSTNAME="jdr"
DEFAULT_MEMORY="512"
DEFAULT_DISK="2"
DEFAULT_STORAGE="local"
DEFAULT_BRIDGE="vmbr0"

echo "=========================================="
echo "  Table JDR - Déploiement Proxmox LXC"
echo "=========================================="
echo ""

# Vérifier qu'on est sur Proxmox
if ! command -v pveversion &>/dev/null; then
    echo "Erreur: Ce script doit être exécuté sur un hôte Proxmox VE."
    echo "Vérifiez que pveversion est disponible."
    exit 1
fi

echo "Proxmox VE détecté: $(pveversion)"
echo ""

# Paramètres (valeurs par défaut ou saisie)
read -r -p "ID du conteneur [${DEFAULT_CTID}]: " CTID
CTID=${CTID:-$DEFAULT_CTID}

read -r -p "Hostname [${DEFAULT_HOSTNAME}]: " HOSTNAME
HOSTNAME=${HOSTNAME:-$DEFAULT_HOSTNAME}

read -r -p "RAM (Mo) [${DEFAULT_MEMORY}]: " MEMORY
MEMORY=${MEMORY:-$DEFAULT_MEMORY}

read -r -p "Disque (Go) [${DEFAULT_DISK}]: " DISK
DISK=${DISK:-$DEFAULT_DISK}

read -r -p "Stockage [${DEFAULT_STORAGE}]: " STORAGE
STORAGE=${STORAGE:-$DEFAULT_STORAGE}

read -r -p "Bridge réseau [${DEFAULT_BRIDGE}]: " BRIDGE
BRIDGE=${BRIDGE:-$DEFAULT_BRIDGE}

echo ""
read -r -p "IP statique (vide = DHCP) [DHCP]: " STATIC_IP
echo ""

# Vérifier que le CT n'existe pas déjà
if pct status "${CTID}" &>/dev/null; then
    echo "Erreur: Le conteneur ${CTID} existe déjà."
    exit 1
fi

# Télécharger le template Debian 12 si nécessaire
echo "==> Vérification du template Debian 12..."
TEMPLATE_PATH=$(pveam list "${STORAGE}" 2>/dev/null | grep debian-12-standard | head -1 | awk '{print $1}')
if [ -z "${TEMPLATE_PATH}" ]; then
    echo "    Téléchargement du template..."
    pveam update
    TEMPLATE=$(pveam available | grep debian-12-standard | head -1 | awk '{print $1}')
    if [ -z "${TEMPLATE}" ]; then
        echo "Erreur: Impossible de trouver le template Debian 12."
        exit 1
    fi
    pveam download "${STORAGE}" "${TEMPLATE}"
    TEMPLATE_PATH="${STORAGE}:vztmpl/${TEMPLATE}"
fi

# Création du CT
echo "==> Création du conteneur ${CTID}..."
NET_CFG="name=eth0,bridge=${BRIDGE}"
if [ -n "${STATIC_IP}" ]; then
    read -r -p "Passerelle (gw): " GATEWAY
    NET_CFG="${NET_CFG},ip=${STATIC_IP}/24,gw=${GATEWAY}"
else
    NET_CFG="${NET_CFG},ip=dhcp"
fi

pct create "${CTID}" "${TEMPLATE_PATH}" \
    --hostname "${HOSTNAME}" \
    --memory "${MEMORY}" \
    --cores 1 \
    --rootfs "${STORAGE}:${DISK}" \
    --net0 "${NET_CFG}" \
    --features nesting=1 \
    --unprivileged 1

echo "==> Démarrage du conteneur..."
pct start "${CTID}"

echo "==> Attente du démarrage réseau..."
sleep 5
for ((i=1; i<=30; i++)); do
    if pct exec "${CTID}" -- ip route get 1.1.1.1 &>/dev/null; then
        break
    fi
    sleep 1
done

echo "==> Installation de l'application dans le CT..."
pct exec "${CTID}" -- bash -c "$(curl -fsSL "${INSTALL_SCRIPT_URL}")"

# Récupérer l'IP
CT_IP=$(pct exec "${CTID}" -- hostname -I | awk '{print $1}')

echo ""
echo "=========================================="
echo "  Installation terminée avec succès !"
echo "=========================================="
echo ""
echo "  L'application est accessible sur :"
echo "  http://${CT_IP}:4000"
echo ""
echo "  Configurez votre reverse proxy Nginx pour proxy vers :"
echo "  http://${CT_IP}:4000"
echo ""
echo "  Mise à jour :"
echo "  pct exec ${CTID} -- bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr-update.sh)\""
echo ""
