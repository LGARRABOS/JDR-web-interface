import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { GameConnection } from './connection';
import { GameStore, type GameState } from './gameStore';
import type { ClientAction } from './protocol';

export interface GameSession {
  store: GameStore;
  state: GameState;
  /** Envoie une action temps réel (retourne false si hors ligne). */
  send: (action: ClientAction) => boolean;
  /** Redemande l'état complet au serveur (ex. après l'échec d'une requête). */
  resync: () => void;
}

/**
 * Ouvre une session temps réel sur une partie : une connexion WebSocket et un
 * store alimenté uniquement par le serveur.
 */
export function useGameSession(gameId: number): GameSession {
  const store = useMemo(() => new GameStore(), [gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const connRef = useRef<GameConnection | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const conn = new GameConnection({
      gameId,
      onMessage: store.dispatch,
      onStatus: (status, attempts) => store.setConnection(status, attempts),
    });
    connRef.current = conn;
    conn.start();
    return () => {
      conn.stop();
      if (connRef.current === conn) connRef.current = null;
    };
  }, [gameId, store]);

  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );
  const send = useCallback(
    (action: ClientAction) => connRef.current?.send(action) ?? false,
    []
  );
  const resync = useCallback(() => connRef.current?.resync(), []);

  // Un onglet resté en arrière-plan peut avoir manqué des messages (navigateur
  // en veille, connexion coupée sans prévenir) : au retour, on redemande l'état.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt != null && Date.now() - hiddenAt > 10_000) {
        hiddenAt = null;
        connRef.current?.resync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { store, state, send, resync };
}
