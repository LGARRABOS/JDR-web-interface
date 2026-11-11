import { addPatch } from '../fog/fog';
import type { MapData, Token } from '../types/game';
import type { ConnectionStatus } from './connection';
import {
  EMPTY_LIVE,
  type ChatMessage,
  type DiceRoll,
  type Envelope,
  type GameInfo,
  type Handout,
  type LiveState,
  type MapViewState,
  type Member,
  type RulerLine,
  type Scene,
} from './protocol';

const MAX_MESSAGES = 200;
const MAX_ROLLS = 100;

export interface RollDisplay extends DiceRoll {
  /** Change à chaque lancer, pour relancer l'animation même si le résultat est identique. */
  key: number;
}

export interface GameState {
  connection: ConnectionStatus;
  failedAttempts: number;
  /** true dès que le premier instantané a été reçu. */
  ready: boolean;
  you: Member | null;
  game: GameInfo | null;
  maps: MapData[];
  /** Carte affichée avec ses jetons et décors. */
  scene: Scene | null;
  messages: ChatMessage[];
  /** Historique des jets (du plus ancien au plus récent). */
  rolls: DiceRoll[];
  players: Member[];
  presence: Member[];
  live: LiveState;
  /** Décalage horloge serveur - horloge locale (ms). */
  serverOffsetMs: number;
  lastRoll: RollDisplay | null;
  lastRollHidden: RollDisplay | null;
  /** Jeton en cours de déplacement local : ses x/y locaux priment sur ceux du serveur. */
  draggingTokenId: number | null;
  /** Mesures en cours des autres participants. */
  rulers: RulerLine[];
  /** Documents visibles (tous pour le MJ). */
  handouts: Handout[];
  /** Document que le MJ vient de montrer : ouvert chez tout le monde. */
  openHandoutId: number | null;
}

export const initialGameState: GameState = {
  connection: 'connecting',
  failedAttempts: 0,
  ready: false,
  you: null,
  game: null,
  maps: [],
  scene: null,
  messages: [],
  rolls: [],
  players: [],
  presence: [],
  live: EMPTY_LIVE,
  serverOffsetMs: 0,
  lastRoll: null,
  lastRollHidden: null,
  draggingTokenId: null,
  rulers: [],
  handouts: [],
  openHandoutId: null,
};

let rollKey = 0;

function upsertById<T extends { id: number }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

function addRoll(list: DiceRoll[], roll: DiceRoll): DiceRoll[] {
  if (list.some((r) => r.id === roll.id)) return list;
  return [
    ...list,
    { ...roll, createdAt: roll.createdAt ?? new Date().toISOString() },
  ].slice(-MAX_ROLLS);
}

function removeById<T extends { id: number }>(list: T[], id: number): T[] {
  return list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list;
}

function upsertMember(list: Member[], m: Member): Member[] {
  const idx = list.findIndex((x) => x.userId === m.userId);
  if (idx < 0) return [...list, m];
  const next = list.slice();
  next[idx] = { ...next[idx], ...m };
  return next;
}

function withScene(
  state: GameState,
  update: (scene: Scene) => Scene
): GameState {
  if (!state.scene) return state;
  return { ...state, scene: update(state.scene) };
}

function onCurrentMap(state: GameState, mapId: number | undefined) {
  return !!state.scene && (mapId === undefined || mapId === state.scene.map.id);
}

function mergeDraggedToken(state: GameState, incoming: Token): Token {
  if (state.draggingTokenId !== incoming.id || !state.scene) return incoming;
  const local = state.scene.tokens.find((t) => t.id === incoming.id);
  return local ? { ...incoming, x: local.x, y: local.y } : incoming;
}

/**
 * Applique un événement serveur à l'état. Fonction pure : tous les événements
 * sont idempotents (les rejouer donne le même résultat).
 */
export function applyEvent(
  state: GameState,
  env: Envelope,
  receivedAt: number = Date.now()
): GameState {
  const serverOffsetMs = env.serverTime
    ? env.serverTime - receivedAt
    : state.serverOffsetMs;

  switch (env.type) {
    case 'sync.snapshot': {
      const { you, state: snap, live, presence } = env.payload;
      return {
        ...state,
        ready: true,
        you,
        game: snap.game,
        maps: snap.maps ?? [],
        scene: snap.scene
          ? {
              map: snap.scene.map,
              tokens: snap.scene.tokens ?? [],
              mapElements: snap.scene.mapElements ?? [],
              fog: snap.scene.fog ?? null,
            }
          : null,
        messages: (snap.messages ?? []).slice(-MAX_MESSAGES),
        rolls: (snap.rolls ?? []).slice(-MAX_ROLLS),
        players: snap.players ?? [],
        presence: presence ?? [],
        live: {
          ...EMPTY_LIVE,
          ...live,
          music: { ...EMPTY_LIVE.music, ...live?.music },
        },
        serverOffsetMs,
        draggingTokenId: null,
        rulers: [],
        handouts: snap.handouts ?? [],
      };
    }

    case 'ping':
      return state;

    // Joueurs : liste complète des jetons visibles (brouillard modifié…).
    case 'scene.tokens': {
      const { mapId, tokens } = env.payload;
      if (!onCurrentMap(state, mapId)) return state;
      return withScene(state, (sc) => ({
        ...sc,
        tokens: tokens.map((t) =>
          // Le jeton qu'on fait glisser garde sa position locale.
          t.id === state.draggingTokenId
            ? (sc.tokens.find((x) => x.id === t.id) ?? t)
            : t
        ),
      }));
    }

    case 'ruler': {
      const line = env.payload;
      const others = state.rulers.filter((r) => r.userId !== line.userId);
      if (!line.from || !line.to || !onCurrentMap(state, line.mapId)) {
        return others.length === state.rulers.length
          ? state
          : { ...state, rulers: others };
      }
      return { ...state, rulers: [...others, line] };
    }

    case 'handout.created':
    case 'handout.updated': {
      const h = env.payload;
      const isGM = state.you?.role === 'MJ';
      // Un document que le MJ cache disparaît chez les joueurs.
      if (!isGM && !h.shown) {
        return {
          ...state,
          handouts: state.handouts.filter((x) => x.id !== h.id),
          openHandoutId:
            state.openHandoutId === h.id ? null : state.openHandoutId,
        };
      }
      return { ...state, handouts: upsertById(state.handouts, h) };
    }
    case 'handout.deleted':
      return {
        ...state,
        handouts: state.handouts.filter((x) => x.id !== env.payload.id),
        openHandoutId:
          state.openHandoutId === env.payload.id ? null : state.openHandoutId,
      };
    case 'handout.shown':
      return {
        ...state,
        handouts: upsertById(state.handouts, env.payload),
        // Le MJ sait ce qu'il vient de montrer : seuls les joueurs le voient s'ouvrir.
        openHandoutId:
          state.you?.role === 'MJ' ? state.openHandoutId : env.payload.id,
      };

    case 'fog.state': {
      const fog = env.payload;
      if (!onCurrentMap(state, fog.mapId)) return state;
      return withScene(state, (sc) => ({ ...sc, fog }));
    }
    case 'fog.patch': {
      const p = env.payload;
      if (!onCurrentMap(state, p.mapId)) return state;
      return withScene(state, (sc) => ({
        ...sc,
        fog: addPatch(
          sc.fog ?? { mapId: p.mapId, enabled: true, patches: [] },
          p
        ),
      }));
    }

    case 'presence.joined':
      return { ...state, presence: upsertMember(state.presence, env.payload) };
    case 'presence.left':
      return {
        ...state,
        presence: state.presence.filter((m) => m.userId !== env.payload.userId),
        rulers: state.rulers.filter((r) => r.userId !== env.payload.userId),
      };
    case 'presence.updated': {
      const m = env.payload;
      const players = state.players.some((p) => p.userId === m.userId)
        ? upsertMember(state.players, m)
        : state.players;
      const you =
        state.you?.userId === m.userId ? { ...state.you, ...m } : state.you;
      const presence = state.presence.some((p) => p.userId === m.userId)
        ? upsertMember(state.presence, m)
        : state.presence;
      return { ...state, players, presence, you };
    }

    case 'map.view':
      return { ...state, live: { ...state.live, view: env.payload } };
    case 'music.state':
      return {
        ...state,
        serverOffsetMs,
        live: { ...state.live, music: env.payload },
      };
    case 'turn.highlight':
      return {
        ...state,
        live: { ...state.live, turnPlayerId: env.payload.playerId ?? null },
      };

    case 'token.created':
    case 'token.updated': {
      const t = env.payload;
      if (!onCurrentMap(state, t.mapId)) return state;
      return withScene(state, (s) => ({
        ...s,
        tokens: upsertById(s.tokens, mergeDraggedToken(state, t)),
      }));
    }
    case 'token.deleted': {
      const { id, mapId } = env.payload;
      if (!onCurrentMap(state, mapId)) return state;
      return withScene(state, (s) => ({
        ...s,
        tokens: removeById(s.tokens, id),
      }));
    }

    case 'map_element.created':
    case 'map_element.updated': {
      const el = env.payload;
      if (!onCurrentMap(state, el.mapId)) return state;
      return withScene(state, (s) => ({
        ...s,
        mapElements: upsertById(s.mapElements, el),
      }));
    }
    case 'map_element.deleted': {
      const { id, mapId } = env.payload;
      if (!onCurrentMap(state, mapId)) return state;
      return withScene(state, (s) => ({
        ...s,
        mapElements: removeById(s.mapElements, id),
      }));
    }

    case 'map.created':
    case 'map.updated': {
      const m = env.payload;
      const inList = state.maps.some((x) => x.id === m.id);
      const belongs = state.game ? m.gameId === state.game.id : true;
      const maps = inList || belongs ? upsertById(state.maps, m) : state.maps;
      const scene =
        state.scene && state.scene.map.id === m.id
          ? { ...state.scene, map: m }
          : state.scene;
      return { ...state, maps, scene };
    }
    case 'map.deleted': {
      const { mapId } = env.payload;
      const isCurrent = state.scene?.map.id === mapId;
      return {
        ...state,
        maps: removeById(state.maps, mapId),
        scene: isCurrent ? null : state.scene,
        game:
          state.game && state.game.currentMapId === mapId
            ? { ...state.game, currentMapId: null }
            : state.game,
      };
    }
    case 'map.displayed': {
      const scene = env.payload;
      return {
        ...state,
        scene: {
          map: scene.map,
          tokens: scene.tokens ?? [],
          mapElements: scene.mapElements ?? [],
          fog: scene.fog ?? null,
        },
        rulers: [],
        game: state.game
          ? { ...state.game, currentMapId: scene.map.id }
          : state.game,
        live: { ...state.live, view: null },
        draggingTokenId: null,
      };
    }

    case 'game.settings':
      return state.game
        ? { ...state, game: { ...state.game, ...env.payload } }
        : state;

    case 'chat.message': {
      const m = env.payload;
      if (state.messages.some((x) => x.id === m.id)) return state;
      // Sans heure, le message serait rangé en tête du fil.
      const withTime = m.createdAt
        ? m
        : { ...m, createdAt: new Date(receivedAt).toISOString() };
      return {
        ...state,
        messages: [...state.messages, withTime].slice(-MAX_MESSAGES),
      };
    }

    case 'dice.rolled':
    case 'dice.rolled.hidden': {
      const hidden = env.type === 'dice.rolled.hidden';
      const roll: DiceRoll = { ...env.payload, hidden };
      const rolls = addRoll(state.rolls, roll);
      const last = hidden ? state.lastRollHidden : state.lastRoll;
      if (last?.id === roll.id)
        return rolls === state.rolls ? state : { ...state, rolls };
      const display = { ...roll, key: ++rollKey };
      return hidden
        ? { ...state, rolls, lastRollHidden: display }
        : { ...state, rolls, lastRoll: display };
    }

    default: {
      const unknown: never = env;
      void unknown;
      return state;
    }
  }
}

type Listener = () => void;

/** Petit store externe (compatible useSyncExternalStore). */
export class GameStore {
  private state: GameState = initialGameState;
  private listeners = new Set<Listener>();

  getState = (): GameState => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispatch = (env: Envelope) => {
    this.set(applyEvent(this.state, env));
  };

  setConnection(connection: ConnectionStatus, failedAttempts: number) {
    if (
      this.state.connection === connection &&
      this.state.failedAttempts === failedAttempts
    )
      return;
    this.set({ ...this.state, connection, failedAttempts });
  }

  // --- Modifications locales (optimistes) ---------------------------------

  /** Déplacement local d'un jeton pendant un glisser-déposer. */
  moveTokenLocally(id: number, x: number, y: number) {
    this.set(
      withScene(this.state, (s) => ({
        ...s,
        tokens: s.tokens.map((t) => (t.id === id ? { ...t, x, y } : t)),
      }))
    );
  }

  patchTokenLocally(id: number, patch: Partial<Token>) {
    this.set(
      withScene(this.state, (s) => ({
        ...s,
        tokens: s.tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }))
    );
  }

  setDragging(id: number | null) {
    if (this.state.draggingTokenId === id) return;
    this.set({ ...this.state, draggingTokenId: id });
  }

  /** Ferme (ou ouvre) un document chez soi uniquement. */
  setOpenHandout(id: number | null) {
    if (this.state.openHandoutId === id) return;
    this.set({ ...this.state, openHandoutId: id });
  }

  /** Document créé, modifié ou supprimé par soi-même (réponse HTTP). */
  upsertHandoutLocally(h: Handout) {
    this.set({ ...this.state, handouts: upsertById(this.state.handouts, h) });
  }

  removeHandoutLocally(id: number) {
    this.set({
      ...this.state,
      handouts: this.state.handouts.filter((x) => x.id !== id),
    });
  }

  setLocalView(view: MapViewState) {
    this.set({ ...this.state, live: { ...this.state.live, view } });
  }

  patchGameLocally(patch: Partial<GameInfo>) {
    if (!this.state.game) return;
    this.set({ ...this.state, game: { ...this.state.game, ...patch } });
  }

  /** Affiche un lancer fait par soi-même (réponse HTTP), sans attendre le serveur. */
  showOwnRoll(roll: DiceRoll, hidden: boolean) {
    const entry: DiceRoll = {
      ...roll,
      hidden,
      createdAt: roll.createdAt ?? new Date().toISOString(),
    };
    const rolls = addRoll(this.state.rolls, entry);
    const display = { ...entry, key: ++rollKey };
    this.set(
      hidden
        ? { ...this.state, rolls, lastRollHidden: display }
        : { ...this.state, rolls, lastRoll: display }
    );
  }

  private set(next: GameState) {
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }
}
