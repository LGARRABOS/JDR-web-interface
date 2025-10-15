# Chronicles of Eternita

Chronicles of Eternita est une table virtuelle privée pensée pour les campagnes de jeu de rôle. Elle fournit un backend Node.js + SQLite et un frontend React + Tailwind permettant de jouer localement avec synchronisation temps réel.

## Structure du projet

```
chronicles-of-eternita/
├── backend/
│   ├── src/
│   ├── uploads/
│   ├── package.json
│   ├── .env.example
│   └── server.js
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
└── README.md
```

## Pré-requis

- Node.js >= 18
- Aucune base à installer : SQLite est embarqué côté backend

## Installation

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run dev

# Frontend
cd ../frontend
npm install
npm run dev
```

Le frontend Vite est accessible sur `http://localhost:5173` et interroge automatiquement l'API sur `http://localhost:4000`.
Le backend crée automatiquement la base SQLite définie dans `SQLITE_PATH` (par défaut `backend/data/eternita.sqlite`).
La variable d'environnement `CORS_ORIGINS` (par défaut `http://localhost:5173`) permet de préciser les origines autorisées pour les requêtes HTTP et WebSocket.

## Tests

Le backend embarque une petite suite de tests unitaires pour garantir la fiabilité du parseur de dés et des utilitaires JWT.

```bash
cd backend
npm test
```

Les tests n'ont pas besoin d'une base SQLite active : ils utilisent uniquement des stubs en mémoire afin de s'exécuter rapidement.

> 💡 Si `npm install` échoue avec un message `No matching version found for sqlite@^5.2.4`, supprimez l'ancien `package-lock.json`
> (et éventuellement le dossier `node_modules`) avant de relancer l'installation. Le backend n'utilise plus le paquet `sqlite`
> mais uniquement `sqlite3@5.1.6`.

## Fonctionnalités clés

- Authentification JWT (inscription/connexion)
- Gestion simplifiée des fiches de personnages (nom, PV, mana, image)
- Téléversement local de cartes avec Multer (stockées dans `backend/uploads`)
- Carte interactive avec jetons déplaçables (MJ)
- Lancer de dés synchrone via Socket.IO (`/roll 1d20+3`)
- Synchronisation temps réel des positions et des résultats de dés

## Architecture technique

### Backend

- Express, SQLite et Socket.IO
- Routes REST :
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/characters`
  - `POST /api/characters`
  - `POST /api/maps/upload`
  - `POST /api/roll`
- Middleware JWT protecteur et rôle MJ basique
- Upload local avec Multer
- Points d'extension prévus pour gérer plusieurs campagnes, cartes et états persistants

### Frontend

- React + Vite + TailwindCSS
- Socket.IO client pour la carte et les dés
- Pages : connexion, inscription, tableau de bord interactif
- Services API Axios et stockage local du token
- Composants modulaires (carte, fiches, uploader, lancer de dés)

## Évolutions possibles

- Gestion multi-campagnes avec sélection côté UI
- Persistances des jetons / états de carte dans SQLite
- Permissions avancées (MJ, co-MJ, joueurs spectateurs)
- Support de plusieurs cartes par campagne et navigation entre elles

## Licence

Projet privé réservé à l'usage de la table Eternita.
