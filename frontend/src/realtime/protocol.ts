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
  | { type: 'fog.updated'; payload: unknown };

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
  | { action: 'turn.highlight'; playerId: number | null };

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
  'fog.updated',
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
