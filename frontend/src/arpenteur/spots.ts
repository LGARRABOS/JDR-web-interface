import { isUnknown } from './keld';

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
  /** Une ligne d'ambiance, affichée sur la carte et à l'arrivée. */
  blurb: string;
}

/** Le large : hors de tout lieu-dit. */
export const OPEN = '~';
/** Durée d'un trajet vers un lieu-dit (secondes). */
export const HOP_SECONDS = 18;

export const SPOTS: Spot[] = [
  {
    id: 'arche-brisee',
    name: "L'Arche brisée",
    zone: '?',
    look: 'arche',
    blurb: 'Une arche de pierre colossale, coupée en deux au-dessus du vide.',
  },
  {
    id: 'epave-du-veilleur',
    name: 'Épave du Veilleur',
    zone: '?',
    look: 'epave',
    blurb:
      'Un vieil arpenteur échoué sur un îlot, ses mâts brisés dans la brume.',
  },
  {
    id: 'aiguille-de-cristal',
    name: 'Aiguille de cristal',
    zone: '?',
    look: 'aiguille',
    blurb: "Une gerbe de cristaux d'Aether qui flotte et luit dans la brume.",
  },
  {
    id: 'sanctuaire-suspendu',
    name: 'Sanctuaire suspendu',
    zone: '?',
    look: 'sanctuaire',
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
