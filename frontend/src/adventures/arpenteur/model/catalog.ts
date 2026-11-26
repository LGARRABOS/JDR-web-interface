import type {
  Allure,
  FlagEmblem,
  GunType,
  Gouvernail,
  Luminaires,
  MarkerKind,
  Material,
  MastType,
  ProwMaterial,
  RoomDeck,
  RoomKind,
  Sculpture,
  Section,
} from './types';

// Catalogues de l'arbre des choix. Les valeurs doivent rester alignées avec
// backend/internal/adventures/arpenteur/normalize.go.

export const ALLURES: { id: Allure; label: string; hint: string }[] = [
  {
    id: 'escorteur',
    label: 'Escorteur',
    hint: 'Coque courte, proue en corne relevée.',
  },
  {
    id: 'survivor',
    label: 'Survivor',
    hint: 'Château arrière massif, nacelle de proue.',
  },
  {
    id: 'protector',
    label: 'Protector',
    hint: 'Galion équilibré, château en dôme, coque profonde.',
  },
  {
    id: 'bombardier',
    label: 'Bombardier',
    hint: 'Tour de tir à la poupe, batteries étagées.',
  },
  {
    id: 'fleche',
    label: 'Flèche',
    hint: 'Longue coque basse, lame de proue effilée.',
  },
  {
    id: 'forteresse',
    label: 'Forteresse',
    hint: 'Bastion central, double propulseur.',
  },
  {
    id: 'enforceur',
    label: 'Enforceur',
    hint: 'Tour avant blindée, crochet sous la proue.',
  },
  {
    id: 'gouverneur',
    label: 'Gouverneur',
    hint: 'Haute poupe inclinée, silhouette élégante.',
  },
];

/** Teintes des matériaux : base, ombre, veinage / reflets. */
export const MATERIALS: Record<
  Material,
  {
    label: string;
    hint: string;
    base: string;
    dark: string;
    line: string;
    metal?: boolean;
    patina?: string;
  }
> = {
  beaulou: {
    label: 'Bois de Beaulou',
    hint: 'blanc',
    base: '#e6dcc4',
    dark: '#b3a585',
    line: '#c9bc9c',
  },
  chene: {
    label: 'Bois de Chêne',
    hint: 'marron',
    base: '#8c5b34',
    dark: '#5c3a1f',
    line: '#6f4627',
  },
  sombrefer: {
    label: 'Bois de Sombrefer',
    hint: 'marron noir sombre',
    base: '#3d2b22',
    dark: '#1f1510',
    line: '#2c1e17',
  },
  cuivre: {
    label: 'Cuivre soudé',
    hint: 'orange et vert',
    base: '#b8692e',
    dark: '#7a4119',
    line: '#d08a4a',
    metal: true,
    patina: '#4f9a83',
  },
  fer: {
    label: 'Fer forgé',
    hint: 'gris',
    base: '#70757c',
    dark: '#43474d',
    line: '#8b9097',
    metal: true,
  },
  boisfer: {
    label: 'Bois et fer forgé',
    hint: 'marron et lignes grises',
    base: '#7a5130',
    dark: '#4f321c',
    line: '#9aa1a8',
  },
  acier: {
    label: 'Acier infusé',
    hint: 'noirâtre brillant',
    base: '#25282e',
    dark: '#121417',
    line: '#6b7785',
    metal: true,
  },
};

export const QUILLE_TYPES = {
  simple: {
    label: 'Quille simple',
    materials: ['beaulou', 'chene', 'sombrefer'] as Material[],
  },
  lourde: {
    label: 'Quille lourde',
    materials: ['cuivre', 'fer', 'acier'] as Material[],
  },
};

export const COQUE_TYPES = {
  legere: {
    label: 'Coque légère',
    materials: ['beaulou', 'chene', 'sombrefer'] as Material[],
  },
  renforcee: {
    label: 'Coque renforcée',
    materials: ['cuivre', 'boisfer', 'acier'] as Material[],
  },
};

export const MAST_TYPES: { id: MastType; label: string; hint: string }[] = [
  { id: 'simple', label: 'Mât simple', hint: 'Un grand mât.' },
  { id: 'double', label: 'Mâts doubles', hint: 'Grand mât et mât de misaine.' },
  { id: 'triple', label: 'Mâts triples', hint: 'Trois mâts, comme un galion.' },
  {
    id: 'pique',
    label: 'Mâts en pique',
    hint: 'Deux mâts inclinés, voiles latines effilées.',
  },
];

export const PONTS: { id: 1 | 2 | 3; label: string; hint: string }[] = [
  {
    id: 1,
    label: 'Taille 1',
    hint: 'Grand pont, pont inférieur, cale (3 ponts)',
  },
  { id: 2, label: 'Taille 2', hint: '+ pont supérieur (4 ponts)' },
  { id: 3, label: 'Taille 3', hint: '+ sous-pont (5 ponts)' },
];

export const EMBLEMS: { id: FlagEmblem; label: string }[] = [
  { id: 'aucun', label: 'Aucun' },
  { id: 'soleil', label: 'Soleil' },
  { id: 'crane', label: 'Crâne' },
  { id: 'etoile', label: 'Étoile' },
  { id: 'croissant', label: 'Croissant' },
  { id: 'griffes', label: 'Griffes' },
];

export const GOUVERNAILS: { id: Gouvernail; label: string }[] = [
  { id: 'classique', label: 'Classique' },
  { id: 'sculpte', label: 'Sculpté' },
  { id: 'renforce', label: 'Renforcé (fer)' },
];

export const LUMINAIRES: { id: Luminaires; label: string }[] = [
  { id: 'aucun', label: 'Aucun' },
  { id: 'lanternes', label: 'Lanternes à huile' },
  { id: 'aether', label: "Globes d'Aether" },
  { id: 'braseros', label: 'Braseros' },
];

export const SCULPTURES: { id: Sculpture; label: string }[] = [
  { id: 'aucune', label: 'Pas de sculpture' },
  { id: 'humanoide', label: 'Humanoïde' },
  { id: 'monstre', label: 'Monstre' },
  { id: 'animal', label: 'Animal' },
];

export const PROW_MATERIALS: Record<
  ProwMaterial,
  { label: string; base: string; dark: string }
> = {
  flotte: { label: 'Bois flotté', base: '#b9a98c', dark: '#857559' },
  renforce: { label: 'Bois renforcé', base: '#7d5634', dark: '#4e331d' },
  cuivreor: { label: 'Cuivre et or', base: '#d6a440', dark: '#9c6a22' },
};

export const ROOM_KINDS: { id: RoomKind; label: string }[] = [
  { id: 'jeux', label: 'Salle de jeux' },
  { id: 'fumoir', label: 'Fumoir' },
  { id: 'plaisance', label: 'Chambre de plaisance' },
  { id: 'sauna', label: 'Sauna' },
  { id: 'torture', label: 'Chambre de torture' },
  { id: 'chambre', label: 'Chambre personnalisée' },
  { id: 'exposition', label: "Salle d'exposition" },
  { id: 'autre', label: 'Autre' },
];

export const ROOM_DECKS: { id: RoomDeck; label: string; minPonts: number }[] = [
  { id: 'superieur', label: 'Pont supérieur', minPonts: 2 },
  { id: 'grand', label: 'Grand pont', minPonts: 1 },
  { id: 'inferieur', label: 'Pont inférieur', minPonts: 1 },
  { id: 'souspont', label: 'Sous-pont', minPonts: 3 },
  { id: 'cale', label: 'Cale', minPonts: 1 },
];

export const MARKER_KINDS: { id: MarkerKind; label: string; color: string }[] =
  [
    { id: 'mission', label: 'Mission', color: '#e3b341' },
    { id: 'danger', label: 'Danger', color: '#e2614d' },
    { id: 'ville', label: 'Ville', color: '#d8cfbf' },
    { id: 'tresor', label: 'Trésor', color: '#9fd27a' },
    { id: 'repere', label: 'Repère', color: '#7fb5e6' },
  ];

/** Postes de l'équipage (cabines essentielles). */
export const POSTS = [
  'Capitaine',
  'Contremaître',
  'Maître canonnier',
  'Chirurgien',
  'Guetteur',
  'Combattant',
  'Mousse',
];

export const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'ship', label: 'Atelier', hint: 'Nom, construction, travaux' },
  { id: 'expedition', label: 'Expédition', hint: 'Numéro, coupons, quêtes' },
  { id: 'crew', label: 'Équipage', hint: 'Recrutement, postes, fiches' },
  { id: 'crewHealth', label: 'Soins', hint: "Vie et fatigue de l'équipage" },
  { id: 'combat', label: 'Canons', hint: 'Canons, munitions, poudre, tirs' },
  { id: 'orders', label: 'Ordres de tir', hint: 'Déroulé, cible, munition' },
  { id: 'hold', label: 'Cale', hint: 'Inventaire du navire' },
  { id: 'cave', label: 'Cave', hint: 'Stockage en ville' },
  { id: 'map', label: 'Carte', hint: 'Cap, déplacements, repères' },
];

export const GUN_TYPES: { id: GunType; label: string }[] = [
  { id: 'A1', label: "Canon d'artillerie" },
  { id: 'A2', label: 'Canon pivotant' },
  { id: 'A3', label: 'Obusier' },
];

/** Déroulé d'une séance de mise à feu (feuille Combat). */
export const FIRE_STEPS: { title: string; detail: string; posts: string[] }[] =
  [
    {
      title: 'Lance et donne la position',
      detail: 'Le guetteur repère la cible.',
      posts: ['Guetteur'],
    },
    {
      title: 'Zone de repositionnement et munition',
      detail: 'Le capitaine choisit où aller et quoi charger.',
      posts: ['Capitaine'],
    },
    {
      title: "Repositionne l'arpenteur",
      detail: 'Le contremaître manœuvre le navire.',
      posts: ['Contremaître'],
    },
    {
      title: 'Prépare les canons',
      detail: 'Chargement et poudre.',
      posts: ['Maître canonnier'],
    },
    {
      title: 'Ordre de tir',
      detail: "Feu ! Puis retour sur la réussite de l'attaque.",
      posts: ['Capitaine', 'Guetteur'],
    },
    {
      title: 'Dégâts finaux',
      detail: 'Les dés sont lancés pour tout le monde.',
      posts: [],
    },
    {
      title: 'Mise à jour de la feuille',
      detail: 'Munitions et poudre se décomptent toutes seules.',
      posts: [],
    },
  ];

export const SKILLS: {
  id: 'combat' | 'extraction' | 'entretien' | 'expertise';
  label: string;
  short: string;
}[] = [
  { id: 'combat', label: 'Combat', short: 'Combat' },
  { id: 'extraction', label: 'Extraction des ressources', short: 'Extraction' },
  {
    id: 'entretien',
    label: 'Entretien et réparation navire',
    short: 'Entretien',
  },
  { id: 'expertise', label: 'Expertise terrain et faune', short: 'Expertise' },
];

export const SKILL_LEVELS = ['—', 'Faible', 'Moyen', 'Fort', 'Expert'];

export const RARITY_COLORS: Record<string, string> = {
  S: '#e8bd4f',
  A: '#b48cf0',
  B: '#6aa8f0',
  C: '#7fc49a',
  D: '#a39b8b',
};

const LOYALTY_KNOWN: Record<string, string> = {
  tonnerrenocturne: '#7f8cf0',
  bufflerouge: '#e05b4b',
  brasierdemoniaque: '#ef8a3c',
  absolue: '#e8bd4f',
};

const PALETTE = [
  '#7fb5e6',
  '#9fd27a',
  '#e3b341',
  '#d88ad8',
  '#5fc9b8',
  '#e2876b',
  '#a7a0e8',
];

/** Couleur d'une loyauté (faction) : fixe pour les connues, stable sinon. */
export function loyaltyColor(
  loyalty: string,
  fold: (s: string) => string
): string {
  const k = fold(loyalty);
  if (!k) return '#8a8172';
  if (LOYALTY_KNOWN[k]) return LOYALTY_KNOWN[k];
  if (!/[a-z0-9]/.test(k)) return '#8a8172';
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
