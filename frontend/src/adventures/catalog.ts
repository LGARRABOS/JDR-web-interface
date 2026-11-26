// Catalogue de la page « Nouvelle partie » : les deux modes de jeu et les
// aventures GEMMA. Pour ajouter une aventure : une entrée ici et son affiche
// (portrait 2:3, environ 800 × 1200) dans public/posters/.

export type GemmaVariant = '' | 'arpenteur' | 'eternita';

export interface Poster {
  id: string;
  title: string;
  /** Petite ligne au-dessus du titre (genre, univers). */
  kicker: string;
  /** Accroche sous le titre. */
  tagline: string;
  /** Image de l'affiche (dossier public). */
  image: string;
  /** Teinte du halo et des filets de l'affiche. */
  accent: string;
}

export interface Mode extends Poster {
  gemma: boolean;
}

export interface Adventure extends Poster {
  variant: GemmaVariant;
  /** Ce que l'aventure ajoute à la table (liste courte). */
  features: string[];
  /** Phrase pour l'option « données d'exemple ». */
  sample?: string;
}

export const MODES: Mode[] = [
  {
    id: 'standard',
    gemma: false,
    title: 'JDR standard',
    kicker: 'Tout univers',
    tagline:
      'Une table libre pour vos propres histoires : carte, fiches, dés, musique.',
    image: '/posters/standard.jpg',
    accent: '#e8bd4f',
  },
  {
    id: 'gemma',
    gemma: true,
    title: 'JDR GEMMA',
    kicker: "L'univers GEMMA",
    tagline:
      "Règles et fiches dédiées, la jauge d'Aether, et des aventures prêtes à jouer.",
    image: '/posters/gemma.jpg',
    accent: '#7ff3ff',
  },
];

export const ADVENTURES: Adventure[] = [
  {
    id: 'libre',
    variant: '',
    title: 'Table libre',
    kicker: 'GEMMA',
    tagline: "Les règles de GEMMA, et le monde qu'il vous plaira d'inventer.",
    image: '/posters/gemma-libre.jpg',
    accent: '#c9a2ff',
    features: [
      'Fiches de personnage GEMMA',
      "Jauge d'Aether, portée d'attaque",
      'Lancers au centre de la carte',
    ],
  },
  {
    id: 'desert-de-keld',
    variant: 'arpenteur',
    title: 'Désert de Keld',
    kicker: 'Aventure GEMMA',
    tagline:
      "À bord d'un arpenteur, traversez les déserts de Keld de cité en cité.",
    image: '/posters/desert-de-keld.jpg',
    accent: '#ff9b52',
    features: [
      'Le vaisseau des sables du groupe',
      'Équipage, canons, cale et atelier',
      'Carte 3D des déserts et lieux-dits',
    ],
    sample: 'un navire et son équipage',
  },
  {
    id: 'eternita',
    variant: 'eternita',
    title: 'Eternita',
    kicker: 'Aventure GEMMA',
    tagline: "Une nouvelle aventure dans l'univers GEMMA.",
    image: '/posters/eternita.jpg',
    accent: '#8fb4ff',
    features: [
      'Fiches de personnage GEMMA',
      "Jauge d'Aether, portée d'attaque",
      'Lancers au centre de la carte',
    ],
  },
];

/** Aventure d'une partie GEMMA (table libre si inconnue). */
export function adventureOf(variant?: string): Adventure {
  return ADVENTURES.find((a) => a.variant === (variant ?? '')) ?? ADVENTURES[0];
}

/** Affiche d'une partie : son aventure GEMMA, ou le JDR standard. */
export function posterOfGame(isGemma?: boolean, variant?: string): Poster {
  return isGemma ? adventureOf(variant) : MODES[0];
}
