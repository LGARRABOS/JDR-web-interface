import type { Travel } from './types';

// Voyages d'un secteur à l'autre : le départ est horodaté par le serveur et
// chaque écran calcule où en est le navire, pour que tout le groupe voie le
// même trajet (scène 3D et carte du réseau).

/** Durée d'un voyage entre deux positions voisines (secondes). */
export const TRAVEL_SECONDS = 25;

export interface TravelNow {
  from: string;
  to: string;
  /** Progression de 0 (départ) à 1 (arrivée). */
  p: number;
  /** Secondes restantes. */
  remaining: number;
  start: number;
  duration: number;
}

/** Voyage en cours à l'instant `now`, ou null s'il est terminé (ou absent). */
export function travelNow(
  t: Travel | null | undefined,
  now = Date.now()
): TravelNow | null {
  if (!t || !t.from || !t.to || t.from === t.to) return null;
  const start = Date.parse(t.startedAt);
  const duration = Math.max(1, t.duration) * 1000;
  if (!Number.isFinite(start)) return null;
  const p = (now - start) / duration;
  if (p >= 1) return null;
  const q = Math.max(0, p);
  return {
    from: t.from,
    to: t.to,
    p: q,
    remaining: Math.ceil((1 - q) * (duration / 1000)),
    start,
    duration,
  };
}

/** Position sur le trajet (0..1) : départ en douceur, arrivée en douceur. */
export function travelEase(p: number) {
  const u = Math.min(1, Math.max(0, p));
  return u * u * (3 - 2 * u);
}
