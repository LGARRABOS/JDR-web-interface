# Chronicles of Eternita

Chronicles of Eternita est une table virtuelle privée pensée pour les campagnes de jeu de rôle. Elle fournit un backend Node.js + MongoDB et un frontend React + Tailwind permettant de jouer localement avec synchronisation temps réel.

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
- MongoDB en local (`mongodb://localhost:27017/eternita` par défaut)

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

## Fonctionnalités clés

- Authentification JWT (inscription/connexion)
- Gestion simplifiée des fiches de personnages (nom, PV, mana, image)
- Téléversement local de cartes avec Multer (stockées dans `backend/uploads`)
- Carte interactive avec jetons déplaçables (MJ)
- Lancer de dés synchrone via Socket.IO (`/roll 1d20+3`)
- Synchronisation temps réel des positions et des résultats de dés

## Architecture technique

### Backend

- Express, Mongoose et Socket.IO
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
- Persistances des jetons / états de carte dans MongoDB
- Permissions avancées (MJ, co-MJ, joueurs spectateurs)
- Support de plusieurs cartes par campagne et navigation entre elles

## Licence

Projet privé réservé à l'usage de la table Eternita.
