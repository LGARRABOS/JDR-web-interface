import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Scénarios multijoueurs : un MJ et un joueur, chacun dans son propre navigateur
 * (cookies séparés), sur la même partie. On vérifie que ce que fait l'un
 * apparaît chez l'autre, sans recharger la page.
 */

const PASSWORD = 'motdepasse';

function uniqueEmail(name: string) {
  return `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

async function expectOk(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string) {
  expect(res.ok(), `${what} : HTTP ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Crée un compte et ouvre une session dans un nouveau navigateur. */
async function newPlayer(browser: Browser, displayName: string) {
  const context = await browser.newContext();
  const email = uniqueEmail(displayName);
  await expectOk(
    await context.request.post('/api/auth/register', { data: { email, password: PASSWORD, displayName } }),
    'inscription'
  );
  await expectOk(await context.request.post('/api/auth/login', { data: { email, password: PASSWORD } }), 'connexion');
  return context;
}

interface Table {
  gm: BrowserContext;
  player: BrowserContext;
  gmPage: Page;
  playerPage: Page;
  gameId: number;
  mapId: number;
}

/** Prépare une partie avec une carte affichée, un MJ et une joueuse « Alice ». */
async function setupTable(browser: Browser): Promise<Table> {
  const gm = await newPlayer(browser, 'Maitre');
  const { game } = await expectOk(
    await gm.request.post('/api/games', { data: { name: `Partie e2e ${Date.now()}` } }),
    'création de partie'
  );
  const { map } = await expectOk(
    await gm.request.post(`/api/games/${game.id}/maps`, {
      data: { name: 'Crypte', imageUrl: '/favicon.png', width: 800, height: 600, gridSize: 50 },
    }),
    'création de carte'
  );
  await expectOk(
    await gm.request.patch(`/api/games/${game.id}/current-map`, { data: { mapId: map.id } }),
    'affichage de la carte'
  );

  const player = await newPlayer(browser, 'Alice');
  await expectOk(await player.request.post('/api/games/join', { data: { inviteCode: game.inviteCode } }), 'rejoindre');

  const gmPage = await gm.newPage();
  const playerPage = await player.newPage();
  await Promise.all([gmPage.goto(`/table/${game.id}`), playerPage.goto(`/table/${game.id}`)]);
  // La table est prête quand le nom de la partie s'affiche (instantané reçu).
  await expect(gmPage.getByText(game.name)).toBeVisible();
  await expect(playerPage.getByText(game.name)).toBeVisible();

  return { gm, player, gmPage, playerPage, gameId: game.id, mapId: map.id };
}

const token = (page: Page, name: string) => page.locator(`[data-token][title="${name}"]`);

test.describe('table de jeu multijoueur', () => {
  let t: Table;

  test.beforeEach(async ({ browser }) => {
    t = await setupTable(browser);
  });

  test.afterEach(async () => {
    await t.gm.close();
    await t.player.close();
  });

  test('le chat et les dés sont partagés en direct, et conservés après rechargement', async () => {
    await t.gmPage.locator('#chat-input').fill('Bienvenue dans la crypte');
    await t.gmPage.locator('#chat-input').press('Enter');
    await expect(t.playerPage.getByText('Bienvenue dans la crypte')).toBeVisible();

    // La joueuse lance un d20 depuis la barre de dés : le MJ voit le jet dans son chat.
    await t.playerPage.getByRole('button', { name: 'Lancer' }).click();
    await expect(t.gmPage.getByText(/^1d20 · \d+$/)).toBeVisible();

    // Après rechargement, l'historique revient avec l'instantané.
    await t.playerPage.reload();
    await expect(t.playerPage.getByText('Bienvenue dans la crypte')).toBeVisible();
    await expect(t.playerPage.getByText(/^1d20 · \d+$/)).toBeVisible();
  });

  test('un jeton caché par le MJ est invisible pour les joueurs jusqu’à sa révélation', async () => {
    const { token: created } = await expectOk(
      await t.gm.request.post(`/api/maps/${t.mapId}/tokens`, {
        data: { name: 'Embuscade', x: 300, y: 300, visibleToPlayers: false },
      }),
      'création du jeton'
    );

    await expect(token(t.gmPage, 'Embuscade')).toBeVisible();
    await expect(token(t.playerPage, 'Embuscade')).toHaveCount(0);

    await expectOk(
      await t.gm.request.patch(`/api/tokens/${created.id}`, { data: { visibleToPlayers: true } }),
      'révélation'
    );
    await expect(token(t.playerPage, 'Embuscade')).toBeVisible();

    await expectOk(
      await t.gm.request.patch(`/api/tokens/${created.id}`, { data: { visibleToPlayers: false } }),
      'masquage'
    );
    await expect(token(t.playerPage, 'Embuscade')).toHaveCount(0);

    // L'API ne doit pas non plus le donner au joueur.
    const list = await t.player.request.get(`/api/maps/${t.mapId}/tokens`);
    expect(await list.text()).not.toContain('Embuscade');
  });

  test('la joueuse a son jeton et peut le voir après sa connexion', async () => {
    await expect(token(t.playerPage, 'Alice')).toBeVisible();
    await expect(token(t.gmPage, 'Alice')).toBeVisible();
  });

  test('le MJ donne la main : la joueuse voit que c’est son tour', async () => {
    await t.gmPage.getByRole('button', { name: 'Tour de jeu' }).click();
    await t.gmPage.getByRole('dialog', { name: 'Tour de jeu' }).getByRole('button', { name: 'Alice' }).click();

    await expect(t.playerPage.getByText(/C'est ton tour, Alice/)).toBeVisible();
    await expect(t.gmPage.getByText(/Tour de/)).toBeVisible();

    // L'état du tour est gardé par le serveur : il survit au rechargement.
    await t.playerPage.reload();
    await expect(t.playerPage.getByText(/C'est ton tour, Alice/)).toBeVisible();
  });

  test('changer de carte met à jour la table de la joueuse', async () => {
    const { map } = await expectOk(
      await t.gm.request.post(`/api/games/${t.gameId}/maps`, {
        data: { name: 'Forêt', imageUrl: '/favicon.png', width: 800, height: 600, gridSize: 50 },
      }),
      'seconde carte'
    );
    await t.gmPage.getByLabel('Carte affichée').selectOption(String(map.id));
    await expect(t.playerPage.getByText('Forêt')).toBeVisible();
    // La joueuse a automatiquement un jeton sur la nouvelle carte.
    await expect(token(t.playerPage, 'Alice')).toBeVisible();
  });

  test('la présence suit les connexions', async () => {
    await expect(t.gmPage.getByText('Alice connecté')).toBeAttached();
    await t.playerPage.close();
    await expect(t.gmPage.getByText('Alice hors ligne')).toBeAttached();
  });
});

test('un utilisateur extérieur ne peut pas ouvrir la table', async ({ browser }) => {
  const gm = await newPlayer(browser, 'Maitre');
  const { game } = await expectOk(await gm.request.post('/api/games', { data: { name: 'Privée' } }), 'partie');
  const outsider = await newPlayer(browser, 'Intrus');
  const res = await outsider.request.get(`/api/games/${game.id}`);
  expect(res.status()).toBe(403);
  await gm.close();
  await outsider.close();
});
