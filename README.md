# Table JDR

Interface web de jeu de rôle avec espace Maître du Jeu et joueurs : cartes interactives, pions, brouillard de guerre, chat et lancers de dés en temps réel.

## Stack

- **Backend** : Go, Chi, PostgreSQL, WebSocket (Gorilla)
- **Frontend** : React, Vite, TypeScript, Tailwind

## Démarrage

```bash
# Prérequis : PostgreSQL avec base jdr (et jdr_test pour les tests)
# createdb jdr && createdb jdr_test

# Installation (frontend)
npm run setup

# Lancer backend et frontend (utilise postgres://jdr:jdr@localhost:5432/jdr par défaut)
npm run dev
```

- Backend : http://localhost:4000
- Frontend : http://localhost:5173

## Structure

- `backend/` : API REST + WebSocket (Go)
- `frontend/` : Interface React

## CI

Les pushes sur `main` et `master` déclenchent une pipeline GitHub Actions qui exécute :

- **Backend** : build, `go vet`, tests
- **Frontend** : build, lint (ESLint), tests (Vitest)

## Scripts

```bash
npm run build   # Build backend + frontend
npm run lint    # Lint backend (go vet) + frontend (ESLint)
npm run test    # Tests backend + frontend
```

## Déploiement Proxmox

Installation en une commande sur un hôte Proxmox VE (création d’un conteneur LXC Debian 12) :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr.sh)"
```

L’application écoute sur le port 4000 dans le CT. Configurez votre reverse proxy Nginx pour proxy vers `http://<IP_CT>:4000` :

```nginx
location / {
    proxy_pass http://<IP_CT>:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Mise à jour (depuis l’hôte Proxmox ou dans le CT) :

```bash
pct exec <CTID> -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr-update.sh)"
```
