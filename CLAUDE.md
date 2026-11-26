# Index du projet (pour les assistants IA)

Table de jeu de rôle en ligne : un MJ et ses joueurs partagent une carte, des
jetons, un brouillard de guerre, un chat, des dés et de la musique en temps
réel. Les parties « JDR GEMMA » peuvent ajouter une **aventure** (aujourd'hui :
« Désert de Keld », dont le cœur est l'**arpenteur**, le vaisseau des sables du
groupe).

Ce fichier sert de carte : lis-le avant de chercher dans le code. Garde-le à
jour quand tu crées, déplaces ou renommes un dossier.

- Langue : code en anglais, commentaires, textes d'interface et commits en français.
- Backend : Go (chi, PostgreSQL, WebSocket gorilla), dans `backend/`.
- Frontend : React 18, TypeScript, Vite, Tailwind, three.js, dans `frontend/`.

## Commandes

| But | Commande (depuis la racine) |
| --- | --- |
| Lancer en local | `npm run dev` (backend :4000, frontend :5173, proxy `/api`) |
| Tout tester | `npm test` (Go a besoin de la base `jdr_test`) |
| Frontend seul | `cd frontend && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` |
| Backend seul | `cd backend && go build ./... && go vet ./... && go test ./...` |
| Bout en bout | `cd e2e && E2E_BASE_URL=http://localhost:5173 npx playwright test` |

La CI (`.github/workflows/ci.yml`) lance exactement ces étapes, plus gofmt,
golangci-lint et shellcheck. Le déploiement (`deploy.yml`, scripts dans
`deploy/`) ne part qu'après une CI verte sur `main`.

## Frontend : `frontend/src/`

Rangé en couches. **Une couche n'importe que les couches au-dessus d'elle
dans cette liste** (jamais l'inverse) :

1. `shared/` : briques génériques, sans rien savoir du jeu.
2. `core/` : ce qui fait marcher le site (comptes, API, temps réel, table).
3. `adventures/` : une aventure GEMMA par dossier.
4. `pages/` puis `app/` : routes et assemblage.

Alias d'import : `@/` = `frontend/src/` (tsconfig `paths`, `vite.config.ts`,
`vitest.config.ts`). Dans une même tranche (`core/tabletop`,
`adventures/arpenteur`…) on importe en relatif ; entre tranches, avec `@/`.

```
app/            App.tsx (routes), main.tsx (point d'entrée, cf. index.html), index.css
pages/          une page par route : AuthPage, GameLobbyPage (/games), NewGamePage
                (/nouvelle-partie), TabletopPage (/table/:gameId), ResourcesPage,
                LibraryPage, WikiPage (/guide), LabPage (/labo, labo 3D), pages d'erreur
shared/
  theme/        thèmes de couleurs (variables CSS) et useTheme
  ui/           Modal, ErrorPageLayout, ThemePicker, icons (toutes les icônes SVG)
  utils/        errorMessage, mapCoords
core/
  api/          client.ts : client axios, un objet par ressource (AuthAPI, GamesAPI, MusicAPI…)
  auth/         AuthContext, useAuth, actAs (« incarner » un joueur), ProfileModal
  realtime/     protocol.ts (messages WebSocket typés), connection.ts, gameStore.ts
                (reducer pur de l'état partagé), useGameSession.ts
  types/        game.ts (MapData, etc.)
  tabletop/     la table : MapCanvas, MapEditor, FogLayer + fog/, TokenPanel, fiches
                (CharacterSheet*, MonsterSheetView), dés (DiceBar, DiceRollOverlay),
                chat (ChatFeed, feed.ts), barres (TopBar, GmToolbar, SidePanel),
                documents (Handout*), notes, musique (MusicControls, useAmbientMusic,
                useSyncedAudio), présence, règle (RulerLayer), parties test (TestPanel)
  guide/        guide intégré : GuideDrawer, GuideView, guideMarkup (format), content.ts (articles)
adventures/
  catalog.ts    catalogue de la page « Nouvelle partie » (modes + aventures + affiches)
  arpenteur/    aventure « Désert de Keld »
    index.ts    point d'entrée public : types et valeurs par défaut du document
    model/      données et règles, sans React ni 3D : types.ts (ArpenteurDoc), catalog.ts,
                defaults.ts, logic.ts (droits, prix, canons), travel.ts, keld.ts (carte),
                spots.ts, mapActions.ts, shipGeometry.ts, useArpenteur.ts (hook d'état)
    ui/         composants React : ArpenteurView (vue principale, chargée à la demande),
                panneaux (Atelier, Combat, Crew, Inventory, Map, Overview, Sector, Settings),
                ShipCutaway / ShipProfile (vues 2D), ShipScene3D, WorldMap3D, ZoneMap3D, ui.tsx
    render/     moteur 3D propre à l'arpenteur : renderer, stage, shaders, shipModel,
                nav, cinema, biomes, city, hangar, environment, voidRealm
    scene/      scènes three.js : threeBackend, worldMap, zoneMap, cabin, crewCast,
                native/ (décor procédural), ref/ (scène de référence, navire, voiles)
test/setup.ts   initialisation Vitest
```

Tests : fichiers `*.test.ts` à côté du code testé (Vitest + jsdom).

### Ajouter une aventure GEMMA

1. Créer `adventures/<nom>/` avec `index.ts`, `model/`, `ui/` (et `render/`, `scene/` si 3D).
2. L'ajouter dans `adventures/catalog.ts` (`GemmaVariant`, liste `ADVENTURES`) avec son
   affiche dans `frontend/public/posters/`.
3. Brancher sa vue dans `pages/TabletopPage.tsx` en `lazy(() => import(...))`, comme l'arpenteur.
4. Côté serveur : un paquet `backend/internal/adventures/<nom>/` et ses routes dans `httpapi`.

## Backend : `backend/`

```
cmd/server/main.go          démarrage : config, base, serveur HTTP
internal/
  domain/                   types partagés (User, Game…)
  storage/                  ouverture de la base ; postgres/postgres.go = schéma (CREATE TABLE)
  realtime/                 hub WebSocket : hub.go, client.go, protocol.go, origin.go
  docimport/                conversion Word/ODF/Excel/CSV/texte en contenu affichable
  httpapi/                  toutes les routes REST, un fichier par ressource :
                            server.go (montage), auth, games, maps, fog*, tokens,
                            elements, map_elements, character_sheets, messages, rolls,
                            music, notes, handouts, library, testgames (parties test),
                            snapshot.go (instantané envoyé à la connexion),
                            session, middleware, hardening, cors, static_etag,
                            arpenteur.go (routes de l'aventure)
  adventures/
    arpenteur/              document de l'arpenteur : doc.go (types), normalize.go,
                            perm.go (droits par section), importxlsx.go (import de fiche)
```

Routes principales : `/api/auth/*`, `/api/games/*`, `/api/maps/*`,
`/api/games/{id}/arpenteur/*`, WebSocket `GET /api/ws?gameId=…`, santé `/healthz`.

## Points à garder alignés entre front et back

| Sujet | Backend | Frontend |
| --- | --- | --- |
| Protocole temps réel | `internal/realtime/protocol.go`, `httpapi/snapshot.go` | `core/realtime/protocol.ts` |
| Document de l'arpenteur | `internal/adventures/arpenteur/doc.go` | `adventures/arpenteur/model/types.ts` |
| Catalogue et valeurs par défaut | `internal/adventures/arpenteur/normalize.go` | `adventures/arpenteur/model/catalog.ts`, `defaults.ts` |
| Droits de l'arpenteur | `internal/adventures/arpenteur/perm.go` | `adventures/arpenteur/model/logic.ts` |
| Visibilité sous le brouillard | `httpapi/fog_visibility.go` | `core/tabletop/fog/fog.ts` |

## Principes

- Le **serveur est la seule source de vérité** : les composants envoient des commandes
  et affichent le store (`core/realtime/gameStore.ts`), ils ne modifient pas l'état
  partagé eux-mêmes. Détails dans `README.md`, section « Temps réel ».
- Les jetons cachés et le brouillard sont filtrés côté serveur avant l'envoi aux joueurs.
- Un document de l'arpenteur par partie, modifié section par section et normalisé par le
  serveur.
