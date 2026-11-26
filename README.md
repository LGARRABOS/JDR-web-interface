# Table JDR

Table de jeu de rôle en ligne, auto-hébergée : le Maître du Jeu et ses joueurs partagent la même table, synchronisée en temps réel.

## Fonctionnalités

- **Cartes interactives** : import d'images, pions, décors, règle de mesure, changement de scène pour tout le monde.
- **Brouillard de guerre** : peint par le MJ, filtré côté serveur (un joueur ne reçoit jamais ce qu'il ne doit pas voir).
- **Chat et dés** partagés, fiches de personnage et de monstre, notes, documents à montrer aux joueurs (Word, LibreOffice, Excel, CSV, texte).
- **Musique d'ambiance** synchronisée entre tous les navigateurs.
- **Parties test** et « incarner un joueur » pour préparer une séance seul.
- **Guide intégré** (`/guide`).
- **Deux modes de partie** : JDR standard, ou JDR GEMMA avec des **aventures**. La première, *Désert de Keld*, ajoute l'**arpenteur**, le vaisseau des sables du groupe : équipage, atelier, combat, cale, carte du désert et vues 3D (three.js).

## Stack

| | |
| --- | --- |
| Backend | Go, chi, PostgreSQL, WebSocket (gorilla) |
| Frontend | React 18, TypeScript, Vite, Tailwind, three.js |
| Tests | `go test`, Vitest, Playwright (bout en bout) |
| Déploiement | GitHub Actions + runner auto-hébergé, conteneur Proxmox |

## Démarrage en local

Prérequis : Go, Node.js et PostgreSQL avec une base `jdr` (et `jdr_test` pour les tests).

```bash
createdb jdr && createdb jdr_test   # une fois
npm run setup                       # installe les dépendances du frontend
npm run dev                         # backend + frontend
```

- Frontend : http://localhost:5173 (Vite redirige `/api` vers le backend)
- Backend : http://localhost:4000 (santé : `/healthz`)

`npm run dev` utilise `postgres://jdr:jdr@localhost:5432/jdr` par défaut.

### Variables d'environnement (backend)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | connexion PostgreSQL (obligatoire) |
| `SESSION_SECRET` | clé des cookies de session, 32 caractères aléatoires ou plus |
| `STATIC_DIR` | dossier du frontend compilé à servir (ex. `./frontend/dist`) |
| `HTTPS` / `ENV=production` | cookies sécurisés derrière un proxy HTTPS |
| `CORS_ORIGIN` | origines autorisées, séparées par des virgules |
| `TEST_DATABASE_URL` | base des tests Go (défaut : `jdr_test`) |

## Organisation du code

```
backend/
  cmd/server/              point d'entrée
  internal/httpapi/        routes REST, un fichier par ressource
  internal/realtime/       hub WebSocket
  internal/storage/        PostgreSQL et schéma
  internal/adventures/     une aventure GEMMA par dossier (arpenteur/)
frontend/src/
  shared/                  briques génériques (thèmes, UI, utilitaires)
  core/                    ce qui fait marcher le site (API, comptes, temps réel, table, guide)
  adventures/<aventure>/   une aventure GEMMA par dossier (model, ui, render, scene)
  pages/  app/             routes et assemblage
e2e/                       tests Playwright
deploy/                    scripts Proxmox, runner et mise en production
```

Côté frontend, une couche n'importe que les couches au-dessus d'elle (`shared` → `core` → `adventures` → `pages`), et l'alias `@/` pointe sur `frontend/src/`.

La carte détaillée (rôle de chaque dossier, routes, fichiers à garder alignés entre front et back, ajout d'une aventure) est dans [`CLAUDE.md`](CLAUDE.md).

## Temps réel : comment l'état est synchronisé

Le **serveur est la seule source de vérité**. Aucun client (même le MJ) ne détient d'état que les autres doivent lui demander.

1. Le client ouvre `GET /api/ws?gameId=<id>` (cookie de session). Le serveur vérifie l'appartenance à la partie.
2. Le serveur envoie **`sync.snapshot`** : partie, cartes, scène affichée (carte, jetons, décors), chat, joueurs, présence, et l'état « live » (vue de la carte, musique, tour en cours). Les jetons cachés ne sont jamais envoyés aux joueurs.
3. Ensuite, chaque modification (faite via l'API REST ou une action WebSocket du MJ) est diffusée sous forme d'**événements idempotents** (remplacement ou suppression d'un objet entier).
4. En cas de coupure ou de client trop lent, la connexion est fermée ; le client se reconnecte et reçoit un nouvel instantané. Il n'y a donc rien à « rattraper ».
5. Le serveur envoie un `ping` toutes les 25 s ; le client répond `pong` et considère la connexion morte s'il n'a rien reçu depuis 45 s.

Côté frontend, `src/core/realtime/` contient le protocole typé (`protocol.ts`), la connexion (`connection.ts`) et le store (`gameStore.ts`, un reducer pur testé). Les composants envoient des commandes et affichent l'état du store ; ils ne modifient jamais eux-mêmes l'état partagé (sauf affichage optimiste pendant un glisser-déposer).

Le protocole est défini à deux endroits qui doivent rester alignés : `backend/internal/realtime/protocol.go` et `frontend/src/core/realtime/protocol.ts`.

## Tests et CI

```bash
npm test               # tests backend (base jdr_test requise) + frontend
npm run lint           # go vet + tsc + ESLint
npm run format:check   # Prettier
npm run build          # binaire Go + frontend compilé

# Bout en bout, application lancée avec `npm run dev` :
cd e2e && npm install && npx playwright install chromium
E2E_BASE_URL=http://localhost:5173 npx playwright test
```

Chaque push et chaque pull request sur `main` lancent la CI (GitHub Actions) :

| Job | Vérifie |
| --- | --- |
| Backend | `gofmt`, build, `go vet`, tests avec PostgreSQL et détecteur de concurrence (`-race`), couverture, golangci-lint |
| Frontend | types (`tsc`), ESLint, Prettier, tests unitaires (Vitest), build |
| Bout en bout | l'application complète avec une vraie base ; Playwright ouvre un navigateur **MJ** et un navigateur **joueur** et vérifie la synchronisation (chat, dés, jetons cachés, tour de jeu, changement de carte, présence, rechargement) |
| Scripts de déploiement | shellcheck |

Le déploiement (workflow **Deploy**) ne se lance qu'après une CI entièrement verte.

## Déploiement automatique (Proxmox + runner CI)

Chaque push sur `main` lance la CI (sur GitHub) ; si elle passe, le workflow **Deploy** compile l'app sur le runner auto-hébergé et l'envoie sur le conteneur JDR, puis vérifie `/healthz` et revient à la version précédente en cas d'échec.

```
GitHub (CI) ──ok──> runner « homelab » (build Go + frontend) ──SSH──> CT JDR (/opt/jdr/current)
```

### 1. Machine runner (une fois, sert à tous les projets)

Créez un CT ou une VM Debian 12 sur le Proxmox (2 vCPU, 4 Go RAM, 30 Go disque conseillés), puis en root :

```bash
# Jeton : GitHub > dépôt > Settings > Actions > Runners > New self-hosted runner
bash install-runner.sh LGARRABOS/JDR-web-interface <JETON>
```

Le script affiche la **clé SSH publique du runner** : gardez-la pour l'étape 2.
Pour un autre projet, relancez-le avec l'autre dépôt (un runner de plus sur la même machine).
Astuce : avec une organisation GitHub (gratuite), un seul runner suffit pour tous les dépôts (`bash install-runner.sh <organisation> <JETON>`).

> Dépôt public : dans *Settings > Actions > General*, activez « Require approval for all outside collaborators », pour qu'une pull request externe ne puisse pas exécuter de code sur votre runner.

### 2. Conteneur JDR

Sur l'hôte Proxmox :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr.sh)"
```

Collez la clé publique du runner quand elle est demandée : le conteneur est alors préparé sans Go ni Node (PostgreSQL, utilisateur `jdr`, service systemd, secrets dans `/etc/jdr/jdr.env`).

### 3. GitHub

- *Settings > Secrets and variables > Actions > Variables* : `JDR_HOST` = IP du conteneur.
- Onglet *Actions* > **Deploy** > *Run workflow* pour le premier déploiement (ensuite c'est automatique).

### Organisation du conteneur

| Chemin | Contenu |
| --- | --- |
| `/opt/jdr/current` | lien vers la version active |
| `/opt/jdr/releases/<version>` | les 5 dernières versions (binaire + frontend) |
| `/opt/jdr/data/uploads` | cartes, musiques, fiches… (conservées entre les versions) |
| `/etc/jdr/jdr.env` | `DATABASE_URL`, `SESSION_SECRET`, `HTTPS`… |

Retour manuel à une version : `ln -sfn /opt/jdr/releases/<version> /opt/jdr/current && systemctl restart jdr`.

### Reverse proxy Nginx

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

Si le site est en HTTPS, décommentez `HTTPS=true` dans `/etc/jdr/jdr.env` (cookies sécurisés) puis `systemctl restart jdr`.

### Installation sans runner (ancien mode)

Laissez la clé vide dans `jdr.sh` : l'app est compilée dans le conteneur, et se met à jour avec :

```bash
pct exec <CTID> -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/LGARRABOS/JDR-web-interface/main/deploy/proxmox/jdr-update.sh)"
```
