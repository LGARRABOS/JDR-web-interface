import { isUnknown } from './keld';
import type { MapState } from './types';
import { routeLength, stopOffset, wrapC } from '../render/nav';

// Points d'intérêt : endroits nommés d'une zone où l'arpenteur peut se rendre
// sans changer de zone. Il quitte le large (ou un autre point d'intérêt),
// navigue, puis s'arrête devant le repère du lieu.
//
// Position inconnue (mer de brume d'Aether) : quatre lieux. Mahibori : M1 à
// M3. Palubori : P1 (champs volcaniques ensablés) et P4 (faille rocheuse).
// Les autres zones viendront ici.

/** Repère 3D affiché sur place (voir scene/native/landmarks.ts). */
export type SpotLook =
  | 'arche'
  | 'epave'
  | 'aiguille'
  | 'sanctuaire'
  | 'orgues'
  | 'aspizos'
  | 'faille'
  | 'etangs'
  | 'lagon'
  | 'cascade'
  | 'sylvabaob'
  | 'troupeaux'
  | 'barkhane'
  | 'kraigs';

/**
 * Repères posés sur le sable (les autres flottent dans la brume) : rayon de
 * l'esplanade aplanie autour d'eux (m). La faille, elle, perce le sable.
 */
export const GROUND_LOOKS: Partial<Record<SpotLook, number>> = {
  orgues: 80,
  aspizos: 130,
  faille: 0,
  etangs: 100,
  lagon: 150,
  cascade: 110,
  sylvabaob: 90,
  troupeaux: 140,
  barkhane: 120,
  kraigs: 120,
};
/** Grande faille : demi-longueur et demi-largeur (m), le long de x. */
export const RIFT = { hx: 340, hz: 85 };

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

/** Le large : hors de tout point d'intérêt. */
export const OPEN = '~';
/** Longueur d'une zone (m) : en croisière, on repasse devant ses points d'intérêt. */
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
  // Mahibori — M1 : l'Odur des sables, les Mawarennes.
  {
    id: 'grand-lagon',
    name: 'Le Grand Lagon des Mawarennes',
    zone: 'M1',
    look: 'lagon',
    x: 600,
    z: -760,
    blurb:
      "Le plus vaste des lagons azur nichés entre les dunes blanches : de l'eau, de l'ombre et du repos après la traversée.",
  },
  {
    id: 'chutes-odur',
    name: "Les Chutes de l'Odur",
    zone: 'M1',
    look: 'cascade',
    x: 2600,
    z: -640,
    blurb:
      "Le fleuve de sable fin franchit un ressaut de grès blanc et s'y déverse comme une cascade d'eau dorée.",
  },
  // M2 : Grand Sylvabaob, savane des grands troupeaux.
  {
    id: 'grand-sylvabaob',
    name: 'Le Grand Sylvabaob',
    zone: 'M2',
    look: 'sylvabaob',
    x: 500,
    z: -720,
    blurb:
      'Le plus vieux et le plus grand sylvabaob de Keld : plus de cent mètres, un refuge pour les Keldiens comme pour les bêtes.',
  },
  {
    id: 'point-eau-troupeaux',
    name: "Le Point d'eau des grands troupeaux",
    zone: 'M2',
    look: 'troupeaux',
    x: 2600,
    z: -660,
    blurb:
      'Une mare au milieu des herbes sèches où les grands troupeaux font halte pendant leurs migrations.',
  },
  // M3 : bande de barkhanes, formations de kraigs.
  {
    id: 'grande-barkhane',
    name: 'La Grande Barkhane',
    zone: 'M3',
    look: 'barkhane',
    x: 500,
    z: -820,
    blurb:
      "Un croissant de sable haut de plus de cent mètres : les Arpenteurs s'en servent de tremplin pour planer.",
  },
  {
    id: 'kraigs-caravanes',
    name: 'Le Repos des caravanes',
    zone: 'M3',
    look: 'kraigs',
    x: 2600,
    z: -660,
    blurb:
      'Une forêt de kraigs sculptés par le vent : un repère fixe dans les dunes, et une ombre où les caravanes font halte.',
  },
  // Palubori — P1 : champs volcaniques ensablés.
  {
    id: 'orgues-noires',
    name: 'Les Orgues noires',
    zone: 'P1',
    look: 'orgues',
    x: 500,
    z: -780,
    blurb:
      "Des milliers de colonnes de basalte, serrées comme des tuyaux d'orgue, percent le sable : la trace d'un ancien volcan, riche en minerais.",
  },
  {
    id: 'detente-aspizos',
    name: "Zone de détente d'Aspizos",
    zone: 'P1',
    look: 'aspizos',
    x: 2600,
    z: -640,
    blurb:
      'Petites dunes de terre, de sable et de sel : les gros lézards des sables viennent y soigner leur peau.',
  },
  // Palubori — P4 : faille rocheuse, étangs de la mort noire.
  {
    id: 'grande-faille',
    name: 'La Grande Faille',
    zone: 'P4',
    look: 'faille',
    x: 400,
    z: -770,
    blurb:
      "Le désert tranché en deux : le sable se jette dans un gouffre de plusieurs centaines de mètres. Une mine s'accroche au bord.",
  },
  {
    id: 'etangs-mort-noire',
    name: 'Étangs de la mort noire',
    zone: 'P4',
    look: 'etangs',
    x: 2700,
    z: -660,
    blurb:
      "Des mares rouges et noirâtres où remontent des bulles : l'odeur repousse presque toutes les bêtes.",
  },
];

const norm = (zone: string) =>
  isUnknown(zone) ? '?' : zone.trim().toUpperCase();

/** Points d'intérêt d'une zone. */
export const spotsOf = (zone: string) =>
  SPOTS.filter((s) => s.zone === norm(zone));

/** Point d'intérêt par identifiant (null : le large ou inconnu). */
export const spotById = (id: string | undefined | null) =>
  (id && SPOTS.find((s) => s.id === id)) || null;

/** Nom à afficher (« Au large » hors point d'intérêt). */
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
  const stop = (s: Spot) => {
    const [dx, dz] = stopOffset(s.look);
    return { x: s.x + dx, z: s.z + dz };
  };
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
 * Départ vers un point d'intérêt (ou vers le large avec OPEN) : nouvel état de la
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
