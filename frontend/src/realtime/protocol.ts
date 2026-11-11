/**
 * Protocole WebSocket entre le serveur et les clients.
 * Doit rester aligné avec backend/internal/realtime/protocol.go et
 * backend/internal/httpapi/snapshot.go.
 *
 * Principe : le serveur est la seule source de vérité.
 * - À chaque (re)connexion il envoie `sync.snapshot` avec l'état complet.
 * - Ensuite il envoie des événements idempotents (remplacement / suppression
 *   d'objets entiers), qu'on peut rejouer sans risque.
 */

import type { FogPatch, FogState } from '../fog/fog';
import type { MapData, MapElement, Token } from '../types/game';

export type Role = 'MJ' | 'PLAYER';

export interface Member {
  userId: number;
  displayName: string;
  characterName: string;
  role: Role | string;
}

export interface MapViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MusicState {
  trackId: number | null;
  playing: boolean;
  /** Position (secondes) au moment `updatedAt` (ms, horloge serveur). */
  position: number;
  volume: number;
  updatedAt: number;
}

export interface LiveState {
  view: MapViewState | null;
  music: MusicState;
  turnPlayerId: number | null;
}

export interface GameInfo {
  id: number;
  name: string;
  inviteCode?: string;
  ownerId: number;
  isGemma: boolean;
  tokenMovementLocked: boolean;
  fogVisionRadius: number;
  currentMapId: number | null;
}

export interface Scene {
  map: MapData;
  tokens: Token[];
  mapElements: MapElement[];
  /** Brouillard de guerre de la carte (absent des anciens serveurs). */
  fog?: FogState | null;
}

export interface ChatMessage {
  id: number;
  gameId?: number;
  userId: number;
  role: string;
  content: string;
  createdAt?: string;
  displayName?: string;
}

export interface DiceRoll {
  id: number;
  userId: number;
  expression: string;
  result: number;
  details?: string;
  displayName?: string;
  hidden?: boolean;
  createdAt?: string;
}

export interface GameSnapshot {
  game: GameInfo;
  maps: MapData[];
  scene: Scene | null;
  messages: ChatMessage[];
  rolls?: DiceRoll[];
  players: Member[];
  /** Documents : tous pour le MJ, seulement ceux montrés pour un joueur. */
  handouts?: Handout[];
}

/** Point de la carte (mêmes unités que les jetons). */
export interface RulerPoint {
  x: number;
  y: number;
}

/** Mesure en cours d'un participant (from/to nuls : terminée). */
export interface RulerLine {
  userId: number;
  mapId: number;
  from: RulerPoint | null;
  to: RulerPoint | null;
}

/** Document que le MJ peut montrer aux joueurs (lettre, plan, portrait…). */
export interface Handout {
  id: number;
  gameId: number;
  title: string;
  body: string;
  imageUrl: string;
  /** text (texte/image) ou fichier importé : document, sheet, pdf. */
  kind?: 'text' | 'document' | 'sheet' | 'pdf';
  /** Fichier d'origine (téléchargeable) et son nom. */
  fileUrl?: string;
  fileName?: string;
  /** Contenu converti disponible (documents et tableurs). */
  hasContent?: boolean;
  shown: boolean;
  createdAt: string;
}

/** Morceau de texte d'un document importé. */
export interface DocRun {
  t: string;
  b?: boolean;
  i?: boolean;
}

export interface DocBlock {
  type: 'heading' | 'paragraph' | 'list' | 'table';
  level?: number;
  runs?: DocRun[];
  items?: DocRun[][];
  rows?: string[][];
}

/** Contenu d'un document ou d'un tableur importé. */
export interface ImportedContent {
  kind: 'document' | 'sheet';
  blocks?: DocBlock[];
  sheets?: { name: string; rows: string[][] }[];
  truncated?: boolean;
}

export interface SnapshotPayload {
  you: Member;
  state: GameSnapshot;
  live: LiveState;
  presence: Member[];
}

export type GameSettings = Partial<
  Pick<GameInfo, 'tokenMovementLocked' | 'fogVisionRadius'>
>;

/** Événements envoyés par le serveur. */
export type ServerEvent =
  | { type: 'sync.snapshot'; payload: SnapshotPayload }
  | { type: 'ping'; payload?: undefined }
  | { type: 'presence.joined'; payload: Member }
  | { type: 'presence.left'; payload: { userId: number } }
  | { type: 'presence.updated'; payload: Member }
  | { type: 'map.view'; payload: MapViewState }
  | { type: 'music.state'; payload: MusicState }
  | { type: 'turn.highlight'; payload: { playerId: number | null } }
  | { type: 'token.created'; payload: Token }
  | { type: 'token.updated'; payload: Token }
  | { type: 'token.deleted'; payload: { id: number; mapId?: number } }
  | { type: 'map_element.created'; payload: MapElement }
  | { type: 'map_element.updated'; payload: MapElement }
  | { type: 'map_element.deleted'; payload: { id: number; mapId?: number } }
  | { type: 'map.created'; payload: MapData }
  | { type: 'map.updated'; payload: MapData }
  | { type: 'map.deleted'; payload: { mapId: number } }
  | { type: 'map.displayed'; payload: Scene }
  | { type: 'game.settings'; payload: GameSettings }
  | { type: 'chat.message'; payload: ChatMessage }
  | { type: 'dice.rolled'; payload: DiceRoll }
  | { type: 'dice.rolled.hidden'; payload: DiceRoll }
  | { type: 'fog.state'; payload: FogState }
  | { type: 'fog.patch'; payload: FogPatch }
  | { type: 'ruler'; payload: RulerLine }
  | { type: 'scene.tokens'; payload: { mapId: number; tokens: Token[] } }
  | { type: 'handout.created'; payload: Handout }
  | { type: 'handout.updated'; payload: Handout }
  | { type: 'handout.deleted'; payload: { id: number } }
  | { type: 'handout.shown'; payload: Handout };

export type ServerEventType = ServerEvent['type'];

export type Envelope = ServerEvent & { gameId: number; serverTime: number };

/** Actions envoyées par les clients. */
export type ClientAction =
  | { action: 'pong' }
  | { action: 'sync' }
  | { action: 'map.view'; scale: number; offsetX: number; offsetY: number }
  | { action: 'music.play'; trackId: number; position?: number }
  | { action: 'music.pause'; position?: number }
  | { action: 'music.seek'; position: number }
  | { action: 'music.volume'; volume: number }
  | { action: 'music.stop' }
  | { action: 'turn.highlight'; playerId: number | null }
  | {
      action: 'ruler';
      mapId: number;
      from?: RulerPoint;
      to?: RulerPoint;
    };

const KNOWN_TYPES: ReadonlySet<string> = new Set<ServerEventType>([
  'sync.snapshot',
  'ping',
  'presence.joined',
  'presence.left',
  'presence.updated',
  'map.view',
  'music.state',
  'turn.highlight',
  'token.created',
  'token.updated',
  'token.deleted',
  'map_element.created',
  'map_element.updated',
  'map_element.deleted',
  'map.created',
  'map.updated',
  'map.deleted',
  'map.displayed',
  'game.settings',
  'chat.message',
  'dice.rolled',
  'dice.rolled.hidden',
  'fog.state',
  'fog.patch',
  'ruler',
  'scene.tokens',
  'handout.created',
  'handout.updated',
  'handout.deleted',
  'handout.shown',
]);

/** Décode un message serveur ; retourne null s'il est invalide ou inconnu. */
export function parseEnvelope(raw: string): Envelope | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const msg = data as Partial<Envelope>;
  if (typeof msg.type !== 'string' || !KNOWN_TYPES.has(msg.type)) {
    if (typeof msg.type === 'string') {
      console.warn('[realtime] événement inconnu :', msg.type);
    }
    return null;
  }
  return {
    ...msg,
    gameId: Number(msg.gameId ?? 0),
    serverTime: Number(msg.serverTime ?? Date.now()),
  } as Envelope;
}

export const EMPTY_LIVE: LiveState = {
  view: null,
  music: {
    trackId: null,
    playing: false,
    position: 0,
    volume: 1,
    updatedAt: 0,
  },
  turnPlayerId: null,
};

/** Position réelle de la musique à l'instant `serverNowMs`. */
export function musicPositionAt(music: MusicState, serverNowMs: number) {
  if (!music.playing || !music.updatedAt) return music.position;
  return Math.max(0, music.position + (serverNowMs - music.updatedAt) / 1000);
}
