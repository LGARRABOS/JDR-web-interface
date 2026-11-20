// Document de l'arpenteur. Doit rester aligné avec backend/internal/arpenteur/doc.go.

export type Allure =
  | 'escorteur'
  | 'survivor'
  | 'protector'
  | 'bombardier'
  | 'fleche'
  | 'forteresse'
  | 'enforceur'
  | 'gouverneur';

export type Material =
  | 'beaulou'
  | 'chene'
  | 'sombrefer'
  | 'cuivre'
  | 'fer'
  | 'boisfer'
  | 'acier';

export type MastType = 'simple' | 'double' | 'triple' | 'pique';
export type FlagEmblem =
  | 'aucun'
  | 'soleil'
  | 'crane'
  | 'etoile'
  | 'croissant'
  | 'griffes';
export type Gouvernail = 'classique' | 'sculpte' | 'renforce';
export type Luminaires = 'aucun' | 'lanternes' | 'aether' | 'braseros';
export type Sculpture = 'aucune' | 'humanoide' | 'monstre' | 'animal';
export type ProwMaterial = 'flotte' | 'renforce' | 'cuivreor';
export type RoomKind =
  | 'jeux'
  | 'fumoir'
  | 'plaisance'
  | 'sauna'
  | 'torture'
  | 'chambre'
  | 'exposition'
  | 'autre';
export type RoomDeck =
  | 'superieur'
  | 'grand'
  | 'inferieur'
  | 'souspont'
  | 'cale';
export type MarkerKind = 'mission' | 'danger' | 'ville' | 'tresor' | 'repere';

export interface Build {
  allure: Allure;
  quille: { type: 'simple' | 'lourde'; material: Material };
  coque: { type: 'legere' | 'renforcee'; material: Material };
  mats: {
    type: MastType;
    sailColor: string;
    flagColor: string;
    flagEmblem: FlagEmblem;
  };
  ponts: 1 | 2 | 3;
  poupe: { material: Material; gouvernail: Gouvernail; luminaires: Luminaires };
  proue: { sculpture: Sculpture; material: ProwMaterial };
  deco: { bands: string[]; trim: string };
  tenue: { color: string; accent: string };
  rooms: Room[];
}

export interface Room {
  id: string;
  kind: RoomKind;
  name: string;
  deck: RoomDeck;
  space: number;
  cost: string;
  time: string;
}

export interface Works {
  label: string;
  cost: string;
  duration: string;
  startedAt: string;
  build: Build;
}

export interface Upgrade {
  id: string;
  at: string;
  label: string;
  cost: string;
  build: Build;
}

export interface Expedition {
  number: number;
  coupons: number;
  couponsNote: string;
  patronQuest: string;
  other: string;
  players: string;
  fields: { label: string; value: string }[];
}

export interface CrewMember {
  id: string;
  name: string;
  playerName: string;
  pc: boolean;
  userId: number | null;
  sex: string;
  race: string;
  loyalty: string;
  combat: number;
  extraction: number;
  entretien: number;
  expertise: number;
  post: string;
  goodPost: string;
  badPost: string;
  price: string;
  coupons: string;
  vie: number;
  vieMax: number;
  fatigue: number;
  respect: number;
  sortie: boolean;
  note: string;
}

export interface Crew {
  capacity: number;
  respectOverride: number | null;
  fatigueMax: number;
  respectMax: number;
  members: CrewMember[];
}

export type GunType = 'A1' | 'A2' | 'A3';

export interface Battery {
  slots: number;
  installed: number;
  loaded: number;
  primed: number;
}

export interface Deck {
  id: string;
  name: string;
  available: boolean;
  guns: Record<GunType, Battery>;
}

export interface Ammo {
  id: string;
  name: string;
  count: number;
}

export interface Barrel {
  id: string;
  uses: number;
  max: number;
}

export interface Salvo {
  id: number;
  at: string;
  guns: number;
  ammo: string;
  side: string;
  by: string;
  result: string;
}

export interface Combat {
  constitution: number;
  constitutionMax: number;
  repairParts: number;
  repairPartsMax: number;
  decks: Deck[];
  ammo: Ammo[];
  powderReserve: number;
  powderReserveMax: number;
  barrels: Barrel[];
  lastSalvo: Salvo | null;
}

export interface Target {
  x: number;
  y: number;
  label: string;
}

export interface Orders {
  step: number;
  ammo: string;
  target: Target | null;
}

export interface Item {
  id: string;
  type: string;
  name: string;
  effect: string;
  weight: number;
  rarity: '' | 'S' | 'A' | 'B' | 'C' | 'D';
  price: string;
  coupons: number | null;
}

export interface Inventory {
  title: string;
  description: string;
  capacity: number;
  items: Item[];
}

export interface Marker {
  id: string;
  label: string;
  kind: MarkerKind;
  sector: string;
  note: string;
  x: number | null;
  y: number | null;
  hidden: boolean;
}

export interface MapState {
  sector: string;
  destination: string;
  sectorNames: Record<string, string>;
  trail: { sector: string; at: string }[];
  imageUrl: string;
  ship: { x: number; y: number } | null;
  heading: number;
  markers: Marker[];
  /** Voyage en cours (ou le dernier) : animé chez tous les joueurs. */
  travel?: Travel | null;
}

export interface Travel {
  from: string;
  to: string;
  /** Heure de départ (ISO), fixée par le serveur. */
  startedAt: string;
  /** Durée en secondes. */
  duration: number;
}

export interface Perm {
  posts: string[];
  fallback: string[];
}

export interface LogEntry {
  at: string;
  by: string;
  text: string;
}

export interface ArpenteurDoc {
  name: string;
  number: number;
  formerOwner: string;
  build: Build;
  pending: Works | null;
  history: Upgrade[];
  expedition: Expedition;
  crew: Crew;
  combat: Combat;
  orders: Orders;
  hold: Inventory;
  cave: Inventory;
  map: MapState;
  permissions: Record<string, Perm>;
  log: LogEntry[];
}

export type Section =
  | 'ship'
  | 'expedition'
  | 'crew'
  | 'crewHealth'
  | 'combat'
  | 'orders'
  | 'hold'
  | 'cave'
  | 'map'
  | 'permissions';

/** Contenu de la section « ship ». */
export interface ShipSection {
  name: string;
  number: number;
  formerOwner: string;
  build: Build;
  pending: Works | null;
  history: Upgrade[];
}

export interface HealthUpdate {
  id: string;
  vie: number;
  fatigue: number;
}

export interface ArpenteurPayload {
  arpenteur: ArpenteurDoc;
  version: number;
}

export interface ImportSummary {
  crew: number;
  hold: number;
  cave: number;
  combat: boolean;
  expedition: boolean;
  ignored: string[];
}
