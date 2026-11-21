// Les déserts de Keld, d'après le croquis « Chasseurs de Draals —
// Composition des déserts » : trois déserts découpés en sous-régions, les
// traversées possibles entre sous-régions et les trajets ville ↔ désert.
// Coordonnées dans le repère du croquis (2000 × 1420).

export type DesertKey = 'mahibori' | 'palubori' | 'forabori';

export interface Region {
  id: string;
  desert: DesertKey;
  label: { x: number; y: number };
  points: [number, number][];
}

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  capital?: boolean;
}

export const DESERTS: Record<DesertKey, { name: string; color: string }> = {
  mahibori: { name: 'Mahibori', color: '#5b8fd1' },
  palubori: { name: 'Palubori', color: '#d0563f' },
  forabori: { name: 'Forabori', color: '#9a6ad0' },
};

export const REGIONS: Region[] = [
  {
    id: 'M1',
    desert: 'mahibori',
    label: { x: 905, y: 330 },
    points: [
      [865, 185],
      [1000, 240],
      [1020, 270],
      [990, 290],
      [975, 450],
      [905, 455],
      [825, 410],
      [770, 330],
      [845, 250],
    ],
  },
  {
    id: 'M2',
    desert: 'mahibori',
    label: { x: 715, y: 455 },
    points: [
      [770, 330],
      [825, 410],
      [820, 520],
      [760, 580],
      [610, 500],
      [615, 385],
    ],
  },
  {
    id: 'M3',
    desert: 'mahibori',
    label: { x: 905, y: 545 },
    points: [
      [825, 410],
      [905, 455],
      [975, 450],
      [1040, 630],
      [790, 620],
      [760, 580],
      [820, 520],
    ],
  },
  {
    id: 'P1',
    desert: 'palubori',
    label: { x: 940, y: 760 },
    points: [
      [790, 700],
      [900, 660],
      [1050, 660],
      [1110, 770],
      [980, 860],
      [870, 830],
      [755, 905],
      [640, 895],
    ],
  },
  {
    id: 'P2',
    desert: 'palubori',
    label: { x: 650, y: 1000 },
    points: [
      [640, 895],
      [755, 905],
      [700, 990],
      [730, 1050],
      [800, 1120],
      [660, 1135],
      [580, 1020],
    ],
  },
  {
    id: 'P3',
    desert: 'palubori',
    label: { x: 810, y: 985 },
    points: [
      [755, 905],
      [870, 830],
      [980, 860],
      [890, 960],
      [880, 1080],
      [800, 1120],
      [730, 1050],
      [700, 990],
    ],
  },
  {
    id: 'P4',
    desert: 'palubori',
    label: { x: 990, y: 935 },
    points: [
      [980, 860],
      [1110, 770],
      [1210, 840],
      [1215, 890],
      [1070, 935],
      [1030, 1040],
      [880, 1080],
      [890, 960],
    ],
  },
  {
    id: 'F1',
    desert: 'forabori',
    label: { x: 1400, y: 560 },
    points: [
      [1290, 510],
      [1430, 435],
      [1530, 450],
      [1510, 550],
      [1530, 575],
      [1470, 640],
      [1290, 730],
    ],
  },
  {
    id: 'F2',
    desert: 'forabori',
    label: { x: 1610, y: 680 },
    points: [
      [1530, 450],
      [1650, 540],
      [1740, 880],
      [1615, 860],
      [1585, 730],
      [1470, 640],
      [1530, 575],
      [1510, 550],
    ],
  },
  {
    id: 'F3',
    desert: 'forabori',
    label: { x: 1430, y: 800 },
    points: [
      [1290, 730],
      [1470, 640],
      [1585, 730],
      [1615, 860],
      [1550, 895],
      [1470, 860],
      [1385, 950],
      [1280, 800],
    ],
  },
  {
    id: 'F4',
    desert: 'forabori',
    label: { x: 1570, y: 1010 },
    points: [
      [1385, 950],
      [1470, 860],
      [1550, 895],
      [1615, 860],
      [1740, 880],
      [1680, 1100],
      [1530, 1125],
    ],
  },
];

export const CITIES: City[] = [
  { id: 'ZENIT', name: 'Zenit', x: 855, y: 205 },
  { id: 'FREMIS', name: 'Fremis', x: 545, y: 470 },
  { id: 'DARRAKIS', name: 'Darrakis', x: 830, y: 660 },
  { id: 'FARDEL', name: 'Fardel', x: 335, y: 880 },
  { id: 'RAKDOS', name: 'Rakdos', x: 430, y: 1075, capital: true },
  { id: 'KARTOUM', name: 'Kartoum', x: 1110, y: 985 },
  { id: 'DELROSIS', name: 'Delrosis', x: 1480, y: 400 },
  { id: 'GARKAL', name: 'Garkal', x: 1800, y: 1010 },
  { id: 'CITE-SUD', name: 'Cité du sud', x: 1550, y: 1225 },
];

/** Traversées possibles entre sous-régions (dans les deux sens). */
export const CROSSINGS: [string, string][] = [
  ['M1', 'M2'],
  ['M1', 'M3'],
  ['M2', 'M3'],
  ['P1', 'P2'],
  ['P1', 'P3'],
  ['P1', 'P4'],
  ['P2', 'P3'],
  ['P3', 'P4'],
  ['F1', 'F3'],
  ['F2', 'F3'],
  ['F3', 'F4'],
  // Passage entre le Palubori et le Forabori.
  ['P4', 'F3'],
];

/** Trajets ville ↔ désert. */
export const ROUTES: [string, string][] = [
  ['ZENIT', 'M1'],
  ['FREMIS', 'M2'],
  ['DARRAKIS', 'M3'],
  ['DARRAKIS', 'P1'],
  ['RAKDOS', 'P2'],
  ['KARTOUM', 'P4'],
  ['DELROSIS', 'F1'],
  ['GARKAL', 'F4'],
  ['CITE-SUD', 'F4'],
];

/** Côtes de Keld (simplifiées). */
export const COAST: [number, number][] = [
  [140, 340],
  [185, 480],
  [260, 410],
  [330, 420],
  [360, 330],
  [440, 260],
  [560, 230],
  [690, 170],
  [780, 200],
  [845, 165],
  [1000, 222],
  [1040, 300],
  [1180, 340],
  [1310, 350],
  [1430, 290],
  [1520, 330],
  [1560, 405],
  [1660, 450],
  [1700, 520],
  [1870, 500],
  [1960, 560],
  [1985, 700],
  [1975, 860],
  [1930, 960],
  [1810, 1040],
  [1720, 1130],
  [1690, 1250],
  [1600, 1330],
  [1500, 1320],
  [1420, 1250],
  [1380, 1150],
  [1270, 1100],
  [1150, 1080],
  [1060, 1100],
  [980, 1150],
  [800, 1170],
  [620, 1150],
  [520, 1110],
  [470, 1130],
  [470, 1200],
  [400, 1300],
  [330, 1280],
  [250, 1150],
  [200, 1000],
  [240, 880],
  [180, 800],
  [230, 640],
  [300, 560],
  [240, 500],
  [170, 470],
];

/** Chaînes de montagnes (zones où dessiner des sommets). */
export const MOUNTAINS: { x: number; y: number; w: number; h: number }[] = [
  { x: 1060, y: 340, w: 190, h: 400 },
  { x: 440, y: 650, w: 300, h: 320 },
  { x: 1720, y: 560, w: 220, h: 420 },
  { x: 1190, y: 920, w: 300, h: 300 },
];

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function cityById(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

/** Position (x, y) d'une sous-région ou d'une ville. */
export function nodePosition(id: string): { x: number; y: number } | null {
  const r = regionById(id);
  if (r) return r.label;
  const c = cityById(id);
  return c ? { x: c.x, y: c.y } : null;
}

/** Nom affiché : nom donné par le groupe, sinon nom par défaut. */
/**
 * Position inconnue (la mer de brume d'Aether) : secteur vide sur la carte,
 * « ? » comme départ ou arrivée d'un voyage par portail.
 */
export const UNKNOWN = '?';
export const isUnknown = (id: string) => !id.trim() || id.trim() === UNKNOWN;

export function nodeName(id: string, names: Record<string, string>): string {
  if (isUnknown(id)) return 'Position inconnue';
  const custom = names[id.toUpperCase()];
  if (custom) return custom;
  return cityById(id)?.name ?? id;
}

/** Destinations directes depuis une position (traversées et trajets). */
export function neighbors(
  id: string
): { id: string; via: 'traversee' | 'trajet' }[] {
  const out: { id: string; via: 'traversee' | 'trajet' }[] = [];
  for (const [a, b] of CROSSINGS) {
    if (a === id) out.push({ id: b, via: 'traversee' });
    if (b === id) out.push({ id: a, via: 'traversee' });
  }
  for (const [c, r] of ROUTES) {
    if (c === id) out.push({ id: r, via: 'trajet' });
    if (r === id) out.push({ id: c, via: 'trajet' });
  }
  return out;
}

export function isKnownNode(id: string): boolean {
  return !!regionById(id) || !!cityById(id);
}
