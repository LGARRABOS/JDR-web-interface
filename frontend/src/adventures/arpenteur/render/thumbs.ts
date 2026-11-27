import type { Build } from '../model/types';
import { Stage } from './stage';

// Miniatures 3D : un seul moteur hors écran rend les navires à la suite et
// garde les images en cache (atelier, évolution).
//
// Fabriquer un navire bloque la page un moment (plusieurs centaines de ms sur
// une petite machine). Pour ne pas geler l'interface :
//  - les rendus attendent un moment de calme (requestIdleCallback) et
//    laissent passer une image entre la fabrication et la photo ;
//  - une miniature qui n'est plus affichée est retirée de la file ;
//  - les images sont gardées dans le navigateur (IndexedDB) : un navire déjà
//    photographié ne se refabrique plus, même après un rechargement.

let stage: Stage | null = null;
let canvas: HTMLCanvasElement | null = null;
let failed = false;
let chain: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();
const MAX_CACHE = 80;
/** Change quand le rendu des navires change (invalide les images gardées). */
const VERSION = 1;

export interface ThumbOptions {
  width?: number;
  height?: number;
  scaffolding?: boolean;
  /** Annule le rendu s'il n'a pas encore commencé. */
  signal?: AbortSignal;
}

function ensureStage(): Stage | null {
  if (stage || failed) return stage;
  try {
    canvas = document.createElement('canvas');
    stage = new Stage(canvas, { preserve: true });
    stage.setEnvironment('mahibori', 'dusk');
  } catch {
    failed = true;
    stage = null;
  }
  return stage;
}

// --- Images gardées dans le navigateur (IndexedDB) ---

const DB = 'arp-thumbs';
const STORE = 'thumbs';
const MAX_STORED = 300;
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function loadStored(key: string): Promise<string | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () =>
        resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function store(key: string, url: string) {
  const d = await db();
  if (!d) return;
  try {
    const os = d.transaction(STORE, 'readwrite').objectStore(STORE);
    os.put(url, key);
    // Ménage : au-delà de MAX_STORED images, on retire les plus anciennes.
    const count = os.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_STORED;
      if (extra <= 0) return;
      os.openCursor().onsuccess = (e) => {
        const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur || extra-- <= 0) return;
        cur.delete();
        cur.continue();
      };
    };
  } catch {
    // stockage plein ou indisponible : l'image reste en mémoire
  }
}

function remember(key: string, url: string) {
  if (cache.size >= MAX_CACHE)
    cache.delete(cache.keys().next().value as string);
  cache.set(key, url);
}

// --- Ordonnancement ---

/** Attend un moment où la page ne fait rien (ou 1,5 s au plus). */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback)
      w.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 50);
  });
}

/** Laisse le navigateur afficher une image. */
const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  );

/** Image (data URL) du navire, ou null si la 3D est indisponible. */
export function renderThumb(
  build: Build,
  opts: ThumbOptions = {}
): Promise<string | null> {
  const w = opts.width ?? 480;
  const h = opts.height ?? 270;
  const key = JSON.stringify([VERSION, build, w, h, !!opts.scaffolding]);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = chain.then(async (): Promise<string | null> => {
    if (opts.signal?.aborted) return null;
    const again = cache.get(key);
    if (again) return again;
    const stored = await loadStored(key);
    if (stored) {
      remember(key, stored);
      return stored;
    }
    await whenIdle();
    if (opts.signal?.aborted) return null;
    const st = ensureStage();
    if (!st || !canvas) return null;
    try {
      st.setSize(w, h);
      st.setShip(build, { scaffolding: opts.scaffolding });
      // La fabrication du navire est faite : une image passe avant la photo.
      await nextFrame();
      st.render(2, { yaw: 0.55, elevation: 0.12, margin: 1.06 });
      const url = canvas.toDataURL('image/jpeg', 0.86);
      remember(key, url);
      void store(key, url);
      return url;
    } catch {
      failed = true;
      return null;
    }
  });
  chain = job.catch(() => null);
  return job;
}

export function thumbsAvailable() {
  return !failed;
}
