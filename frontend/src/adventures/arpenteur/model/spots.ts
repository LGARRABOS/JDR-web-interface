import { isUnknown } from './keld';
import type { MapState } from './types';
import { routeLength, STOP_DX, STOP_DZ, wrapC } from '../render/nav';

// Lieux-dits : endroits nommés d'une zone où l'arpenteur peut se rendre sans
// changer de zone. Il quitte le large (ou un autre lieu-dit), navigue, puis
// s'arrête devant le repère du lieu.
//
// Pour l'instant, seuls des lieux de test existent, dans la position inconnue
// (mer de brume d'Aether). Les vrais lieux des zones M1, M2… viendront ici.

/** Repère 3D affiché sur place (voir scene3d/native/landmarks.ts). */
export type SpotLook = 'arche' | 'epave' | 'aiguille' | 'sanctuaire';

export interface Spot {
  id: string;
  name: string;
  /** Zone (sous-région) du lieu ; '?' : la position inconnue. */
  zone: string;
  look: SpotLook;
  /**
   * Position du repère dans la zone (m) : x le long de la zone (qui se
   * répète tous les ZONE_PERIOD m), z vers bâbord (< 0, côté opposé à la
   * caméra) pour qu'on le voie de loin par-delà le navire.
   */
  x: number;
  z: number;
  /** Une ligne d'ambiance, affichée sur la carte et à l'arrivée. */
  blurb: string;
}

/** Le large : hors de tout lieu-dit. */
export const OPEN = '~';
/** Longueur d'une zone (m) : en croisière, on repasse devant ses lieux-dits. */
export const ZONE_PERIOD = 4400;

export const SPOTS: Spot[] = [
  {
    id: 'arche-brisee',
    name: "L'Arche brisée",
    zone: '?',
    look: 'arche',
    x: 0,
    z: -900,
    blurb: 'Une arche de pierre colossale, coupée en deux au-dessus du vide.',
  },
  {
    id: 'epave-du-veilleur',
    name: 'Épave du Veilleur',
    zone: '?',
    look: 'epave',
    x: 1300,
    z: -2300,
    blurb:
      'Un vieil arpenteur échoué sur un îlot, ses mâts brisés dans la brume.',
  },
  {
    id: 'aiguille-de-cristal',
    name: 'Aiguille de cristal',
    zone: '?',
    look: 'aiguille',
    x: 2500,
    z: -1100,
    blurb: "Une gerbe de cristaux d'Aether qui flotte et luit dans la brume.",
  },
  {
    id: 'sanctuaire-suspendu',
    name: 'Sanctuaire suspendu',
    zone: '?',
    look: 'sanctuaire',
    x: 3500,
    z: -2600,
    blurb: 'Un temple en ruine sur une île dont la brume coule en cascades.',
  },
];

const norm = (zone: string) =>
  isUnknown(zone) ? '?' : zone.trim().toUpperCase();

/** Lieux-dits d'une zone. */
export const spotsOf = (zone: string) =>
  SPOTS.filter((s) => s.zone === norm(zone));

/** Lieu-dit par identifiant (null : le large ou inconnu). */
export const spotById = (id: string | undefined | null) =>
  (id && SPOTS.find((s) => s.id === id)) || null;

/** Nom à afficher (« Au large » hors lieu-dit). */
export const spotName = (id: string | undefined | null) =>
  spotById(id)?.name ?? 'Au large';

/**
 * Durée d'un trajet (secondes) : selon la longueur de la route, pas toujours
 * la même. Depuis le large, la position exacte du navire n'est pas connue :
 * on compte une distance d'approche moyenne.
 */
export function hopSeconds(from: string, to: string) {
  const a = spotById(from),
    b = spotById(to);
  const stop = (s: Spot) => ({ x: s.x + STOP_DX, z: s.z + STOP_DZ });
  let len: number;
  if (a && b) {
    const sa = stop(a),
      sb = stop(b);
    len = routeLength(
      { ...sa, h: 0 },
      { x: sa.x + wrapC(sb.x - sa.x, ZONE_PERIOD), z: sb.z }
    );
  } else if (b) len = Math.hypot(1500, stop(b).z) * 1.2;
  else if (a)
    len = routeLength(
      { ...stop(a), h: 0 },
      { x: stop(a).x + Math.max(1200, Math.abs(stop(a).z) * 1.6), z: 0 }
    );
  else len = 1200;
  return Math.round(Math.min(90, Math.max(12, 8 + len / 70)));
}

/**
 * Départ vers un lieu-dit (ou vers le large avec OPEN) : nouvel état de la
 * carte (trajet horodaté par le serveur) et ligne du journal.
 */
export function hopTo(
  map: MapState,
  to: string
): { next: MapState; log: string } {
  const here = map.spot ?? '';
  const s = spotById(to);
  return {
    next: {
      ...map,
      spot: s ? s.id : '',
      hop: {
        from: here || OPEN,
        to: s ? s.id : OPEN,
        startedAt: new Date().toISOString(),
        duration: hopSeconds(here, s ? s.id : OPEN),
      },
    },
    log: s
      ? `L'arpenteur fait route vers ${s.name}`
      : "L'arpenteur reprend le large",
  };
}
