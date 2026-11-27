/**
 * Version du site chargée dans la page, comparée à la version déployée.
 *
 * Au build, Vite injecte `__APP_VERSION__` dans le code et écrit la même
 * valeur dans `dist/version.json` (voir vite.config.ts). Une page ouverte
 * avant un déploiement garde l'ancienne valeur en mémoire alors que le
 * serveur sert le nouveau `version.json` : on le détecte et on bloque la page
 * jusqu'à l'actualisation, pour que tous les joueurs jouent sur la même version.
 */

declare const __APP_VERSION__: string | undefined;

/** Version compilée dans la page ; vide en développement et dans les tests. */
export const LOADED_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

/** Intervalle de vérification de secours (la reconnexion WebSocket déclenche aussi une vérification). */
export const CHECK_INTERVAL_MS = 60_000;

const CHECK_EVENT = 'jdr:version-check';

/** Lit la version déployée ; null si elle est inconnue (dev, réseau coupé, réponse invalide). */
export async function fetchDeployedVersion(
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === 'object' &&
      typeof (data as { version?: unknown }).version === 'string'
    ) {
      return (data as { version: string }).version || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Vrai si la page doit être actualisée. Une version inconnue ne bloque jamais. */
export function isOutdated(loaded: string, deployed: string | null): boolean {
  return loaded !== '' && deployed !== null && deployed !== loaded;
}

/** Demande une vérification immédiate (ex. après une reconnexion au serveur). */
export function requestVersionCheck() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHECK_EVENT));
  }
}

export interface VersionWatchOptions {
  onOutdated: (deployed: string) => void;
  loaded?: string;
  fetchVersion?: () => Promise<string | null>;
  intervalMs?: number;
}

/**
 * Surveille la version déployée : toutes les minutes, au retour sur l'onglet,
 * au retour du réseau et sur demande (requestVersionCheck). Appelle onOutdated
 * une seule fois, puis s'arrête. Retourne la fonction d'arrêt.
 */
export function startVersionWatch(opts: VersionWatchOptions): () => void {
  const loaded = opts.loaded ?? LOADED_VERSION;
  if (!loaded) return () => {};
  const fetchVersion = opts.fetchVersion ?? (() => fetchDeployedVersion());
  let stopped = false;
  let running = false;

  const check = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const deployed = await fetchVersion();
      if (!stopped && isOutdated(loaded, deployed)) {
        stop();
        opts.onOutdated(deployed as string);
      }
    } finally {
      running = false;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  const onCheck = () => void check();

  const timer = setInterval(onCheck, opts.intervalMs ?? CHECK_INTERVAL_MS);
  window.addEventListener(CHECK_EVENT, onCheck);
  window.addEventListener('online', onCheck);
  document.addEventListener('visibilitychange', onVisible);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    window.removeEventListener(CHECK_EVENT, onCheck);
    window.removeEventListener('online', onCheck);
    document.removeEventListener('visibilitychange', onVisible);
  }

  void check();
  return stop;
}
