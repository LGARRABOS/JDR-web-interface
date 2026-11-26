// Partie test : le MJ peut « jouer en tant que » un joueur fictif. Le choix
// vaut pour cet onglet seulement (sessionStorage) et pour la table de cette
// partie : ailleurs, on redevient soi-même.

const KEY = 'jdr-act-as';
/** Paramètre d'URL pour ouvrir un onglet directement en tant qu'un joueur fictif. */
export const ACT_AS_PARAM = 'jouerEnTantQue';

export interface ActAs {
  gameId: number;
  userId: number;
  name: string;
}

export function getActAs(): ActAs | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ActAs;
    return v && v.gameId > 0 && v.userId > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setActAs(v: ActAs | null) {
  try {
    if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible : l'incarnation ne tient pas au rechargement.
  }
}

/** Partie dont la table est affichée (d'après l'URL), ou 0. */
export function tableGameId(pathname = window.location.pathname): number {
  const m = /^\/table\/(\d+)/.exec(pathname);
  return m ? Number(m[1]) : 0;
}

/** Incarnation en cours, seulement sur la table de sa partie. */
export function activeActAs(): ActAs | null {
  const a = getActAs();
  return a && tableGameId() === a.gameId ? a : null;
}

/**
 * À appeler avant le premier rendu : lit « ?jouerEnTantQue=id:nom » (nouvel
 * onglet ouvert depuis le panneau de test) puis l'efface de l'URL.
 */
export function readActAsFromUrl() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get(ACT_AS_PARAM);
  if (raw === null) return;
  const gameId = tableGameId(url.pathname);
  const [id, ...rest] = raw.split(':');
  const userId = Number(id);
  if (gameId && userId > 0)
    setActAs({ gameId, userId, name: rest.join(':') || 'Joueur fictif' });
  else if (raw === '' || raw === 'mj') setActAs(null);
  url.searchParams.delete(ACT_AS_PARAM);
  window.history.replaceState(
    window.history.state,
    '',
    url.pathname + url.search + url.hash
  );
}

/** Change d'identité puis recharge la page pour tout repartir proprement. */
export function switchActAs(v: ActAs | null) {
  setActAs(v);
  window.location.reload();
}
