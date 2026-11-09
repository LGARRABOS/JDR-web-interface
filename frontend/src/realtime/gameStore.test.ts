import { describe, expect, it } from 'vitest';
import type { Token } from '../types/game';
import {
  applyEvent,
  GameStore,
  initialGameState,
  type GameState,
} from './gameStore';
import type { Envelope, ServerEvent, SnapshotPayload } from './protocol';

function env(e: ServerEvent, serverTime = 1_000): Envelope {
  return { ...e, gameId: 1, serverTime } as Envelope;
}

const map1 = {
  id: 10,
  gameId: 1,
  name: 'Taverne',
  imageUrl: '/a.png',
  width: 800,
  height: 600,
  gridSize: 50,
};
const map2 = {
  id: 11,
  gameId: 1,
  name: 'Forêt',
  imageUrl: '/b.png',
  width: 800,
  height: 600,
  gridSize: 50,
};

function token(id: number, extra: Partial<Token> = {}): Token {
  return {
    id,
    mapId: 10,
    kind: 'PNJ',
    name: `T${id}`,
    color: '#fff',
    x: 0,
    y: 0,
    visibleToPlayers: true,
    ...extra,
  };
}

function snapshot(over: Partial<SnapshotPayload['state']> = {}): Envelope {
  return env({
    type: 'sync.snapshot',
    payload: {
      you: {
        userId: 2,
        displayName: 'Alice',
        characterName: '',
        role: 'PLAYER',
      },
      state: {
        game: {
          id: 1,
          name: 'Partie',
          ownerId: 1,
          isGemma: false,
          tokenMovementLocked: false,
          fogVisionRadius: 0,
          currentMapId: 10,
        },
        maps: [map1, map2],
        scene: { map: map1, tokens: [token(1), token(2)], mapElements: [] },
        messages: [],
        players: [
          { userId: 1, displayName: 'MJ', characterName: '', role: 'MJ' },
          {
            userId: 2,
            displayName: 'Alice',
            characterName: '',
            role: 'PLAYER',
          },
        ],
        ...over,
      },
      live: {
        view: { scale: 2, offsetX: 5, offsetY: 6 },
        music: {
          trackId: 3,
          playing: true,
          position: 10,
          volume: 0.5,
          updatedAt: 900,
        },
        turnPlayerId: 2,
      },
      presence: [
        { userId: 1, displayName: 'MJ', characterName: '', role: 'MJ' },
      ],
    },
  });
}

function ready(): GameState {
  return applyEvent(initialGameState, snapshot(), 1_000);
}

describe('applyEvent', () => {
  it("l'instantané remplace tout l'état", () => {
    const s = ready();
    expect(s.ready).toBe(true);
    expect(s.scene?.tokens).toHaveLength(2);
    expect(s.live.view?.scale).toBe(2);
    expect(s.live.music.trackId).toBe(3);
    expect(s.live.turnPlayerId).toBe(2);
    expect(s.presence).toHaveLength(1);
  });

  it('un nouvel instantané efface les données obsolètes', () => {
    const s1 = applyEvent(
      ready(),
      env({ type: 'token.created', payload: token(99) })
    );
    expect(s1.scene?.tokens.some((t) => t.id === 99)).toBe(true);
    const s2 = applyEvent(s1, snapshot());
    expect(s2.scene?.tokens.some((t) => t.id === 99)).toBe(false);
  });

  it('les événements de jeton sont idempotents', () => {
    const e = env({ type: 'token.updated', payload: token(1, { x: 42 }) });
    const once = applyEvent(ready(), e);
    const twice = applyEvent(once, e);
    expect(twice.scene?.tokens).toEqual(once.scene?.tokens);
    expect(twice.scene?.tokens.find((t) => t.id === 1)?.x).toBe(42);

    const created = env({ type: 'token.created', payload: token(3) });
    const c2 = applyEvent(applyEvent(ready(), created), created);
    expect(c2.scene?.tokens.filter((t) => t.id === 3)).toHaveLength(1);
  });

  it('ignore les jetons des autres cartes', () => {
    const s = applyEvent(
      ready(),
      env({ type: 'token.created', payload: token(5, { mapId: 11 }) })
    );
    expect(s.scene?.tokens.some((t) => t.id === 5)).toBe(false);
  });

  it('supprime un jeton', () => {
    const s = applyEvent(
      ready(),
      env({ type: 'token.deleted', payload: { id: 1, mapId: 10 } })
    );
    expect(s.scene?.tokens.map((t) => t.id)).toEqual([2]);
  });

  it('garde la position locale du jeton en cours de déplacement', () => {
    const store = new GameStore();
    store.dispatch(snapshot());
    store.setDragging(1);
    store.moveTokenLocally(1, 300, 400);
    store.dispatch(
      env({ type: 'token.updated', payload: token(1, { x: 0, y: 0, hp: 5 }) })
    );
    const t = store.getState().scene?.tokens.find((x) => x.id === 1);
    expect(t?.x).toBe(300);
    expect(t?.hp).toBe(5);
  });

  it('map.displayed remplace la scène et réinitialise la vue', () => {
    const s = applyEvent(
      ready(),
      env({
        type: 'map.displayed',
        payload: {
          map: map2,
          tokens: [token(7, { mapId: 11 })],
          mapElements: [],
        },
      })
    );
    expect(s.scene?.map.id).toBe(11);
    expect(s.scene?.tokens.map((t) => t.id)).toEqual([7]);
    expect(s.game?.currentMapId).toBe(11);
    expect(s.live.view).toBeNull();
  });

  it('map.updated met à jour la carte affichée', () => {
    const s = applyEvent(
      ready(),
      env({ type: 'map.updated', payload: { ...map1, name: 'Auberge' } })
    );
    expect(s.scene?.map.name).toBe('Auberge');
    expect(s.maps.find((m) => m.id === 10)?.name).toBe('Auberge');
  });

  it('map.deleted retire la carte affichée', () => {
    const s = applyEvent(
      ready(),
      env({ type: 'map.deleted', payload: { mapId: 10 } })
    );
    expect(s.scene).toBeNull();
    expect(s.maps.map((m) => m.id)).toEqual([11]);
    expect(s.game?.currentMapId).toBeNull();
  });

  it('game.settings fusionne les réglages', () => {
    const s = applyEvent(
      ready(),
      env({ type: 'game.settings', payload: { fogVisionRadius: 120 } })
    );
    expect(s.game?.fogVisionRadius).toBe(120);
    expect(s.game?.tokenMovementLocked).toBe(false);
  });

  it('dédoublonne les messages du chat', () => {
    const m = env({
      type: 'chat.message',
      payload: { id: 1, userId: 2, role: 'PLAYER', content: 'Salut' },
    });
    const s = applyEvent(applyEvent(ready(), m), m);
    expect(s.messages).toHaveLength(1);
  });

  it('présence : arrivée, mise à jour du nom, départ', () => {
    let s = applyEvent(
      ready(),
      env({
        type: 'presence.joined',
        payload: {
          userId: 2,
          displayName: 'Alice',
          characterName: '',
          role: 'PLAYER',
        },
      })
    );
    expect(s.presence).toHaveLength(2);
    s = applyEvent(
      s,
      env({
        type: 'presence.updated',
        payload: {
          userId: 2,
          displayName: 'Alice',
          characterName: 'Elara',
          role: 'PLAYER',
        },
      })
    );
    expect(s.presence.find((p) => p.userId === 2)?.characterName).toBe('Elara');
    expect(s.players.find((p) => p.userId === 2)?.characterName).toBe('Elara');
    expect(s.you?.characterName).toBe('Elara');
    s = applyEvent(s, env({ type: 'presence.left', payload: { userId: 2 } }));
    expect(s.presence).toHaveLength(1);
  });

  it("calcule le décalage d'horloge avec le serveur", () => {
    const s = applyEvent(initialGameState, snapshot(), 400);
    expect(s.serverOffsetMs).toBe(600);
  });

  it('un lancer reçu deux fois ne relance pas l’animation', () => {
    const roll = env({
      type: 'dice.rolled',
      payload: { id: 4, userId: 2, expression: '1d20', result: 12 },
    });
    const s1 = applyEvent(ready(), roll);
    const s2 = applyEvent(s1, roll);
    expect(s2.lastRoll?.key).toBe(s1.lastRoll?.key);
  });

  it("garde l'historique des jets, jets cachés compris", () => {
    let s = applyEvent(
      ready(),
      env({
        type: 'dice.rolled',
        payload: { id: 10, userId: 2, expression: '1d20', result: 15 },
      })
    );
    s = applyEvent(
      s,
      env({
        type: 'dice.rolled.hidden',
        payload: { id: 11, userId: 1, expression: '1d8', result: 3 },
      })
    );
    s = applyEvent(
      s,
      env({
        type: 'dice.rolled',
        payload: { id: 10, userId: 2, expression: '1d20', result: 15 },
      })
    );
    expect(s.rolls.map((r) => r.id)).toEqual([10, 11]);
    expect(s.rolls[1].hidden).toBe(true);
    expect(s.lastRollHidden?.id).toBe(11);
  });
});
