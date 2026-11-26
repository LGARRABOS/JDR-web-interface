import type { Build } from '../model/types';
import { Stage } from './stage';

// Miniatures 3D : un seul moteur hors écran rend les navires à la suite et
// garde les images en cache (atelier, évolution).

let stage: Stage | null = null;
let canvas: HTMLCanvasElement | null = null;
let failed = false;
let chain: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();
const MAX_CACHE = 80;

export interface ThumbOptions {
  width?: number;
  height?: number;
  scaffolding?: boolean;
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

/** Image (data URL) du navire, ou null si la 3D est indisponible. */
export function renderThumb(
  build: Build,
  opts: ThumbOptions = {}
): Promise<string | null> {
  const w = opts.width ?? 480;
  const h = opts.height ?? 270;
  const key = JSON.stringify([build, w, h, !!opts.scaffolding]);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = chain.then(
    () =>
      new Promise<string | null>((resolve) => {
        // Laisse respirer l'interface entre deux rendus.
        setTimeout(() => {
          const again = cache.get(key);
          if (again) return resolve(again);
          const st = ensureStage();
          if (!st || !canvas) return resolve(null);
          try {
            st.setSize(w, h);
            st.setShip(build, { scaffolding: opts.scaffolding });
            st.render(2, { yaw: 0.55, elevation: 0.12, margin: 1.06 });
            const url = canvas.toDataURL('image/jpeg', 0.86);
            if (cache.size >= MAX_CACHE)
              cache.delete(cache.keys().next().value as string);
            cache.set(key, url);
            resolve(url);
          } catch {
            failed = true;
            resolve(null);
          }
        }, 0);
      })
  );
  chain = job.catch(() => null);
  return job;
}

export function thumbsAvailable() {
  return !failed;
}
