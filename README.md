# Table JDR

Interface web de jeu de rôle avec espace Maître du Jeu et joueurs : cartes interactives, pions, brouillard de guerre, chat et lancers de dés en temps réel.

## Stack

- **Backend** : Go, Chi, SQLite, WebSocket (Gorilla)
- **Frontend** : React, Vite, TypeScript, Tailwind

## Démarrage

```bash
# Installation (frontend)
npm run setup

# Lancer backend et frontend
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
