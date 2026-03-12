import { useEffect, useRef, useCallback, useState } from 'react';

interface GameSocketMessage {
  gameId?: number;
  type?: string;
  payload?: unknown;
}

type MessageHandler = (payload: unknown) => void;

export function useGameSocket(
  gameId: number | null,
  handlers: Record<string, MessageHandler>
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  const gameIdRef = useRef(gameId);
  const intentionalCloseRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  handlersRef.current = handlers;
  gameIdRef.current = gameId;

  const connect = useCallback(() => {
    if (!gameId || gameId <= 0) return null;

    intentionalCloseRef.current = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Toujours utiliser le host de la page pour que les cookies de session soient envoyés (même origine)
    const ws = new WebSocket(`${protocol}//${host}/api/ws`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', gameId }));
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (!intentionalCloseRef.current && gameIdRef.current === gameId) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as GameSocketMessage;
        const msgGameId = Number(msg.gameId);
        const currentGameId = Number(gameIdRef.current);
        if (Number.isNaN(msgGameId) || msgGameId !== currentGameId) return;
        const fn = handlersRef.current[msg.type ?? ''];
        if (fn) fn(msg.payload);
      } catch {
        // ignore
      }
    };

    wsRef.current = ws;
    return ws;
  }, [gameId]);

  const send = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const ws = wsRef.current;
      const gid = gameIdRef.current;
      if (ws?.readyState === WebSocket.OPEN && gid) {
        try {
          ws.send(JSON.stringify({ action, gameId: gid, ...payload }));
        } catch {
          // ignore
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!gameId || gameId <= 0) return;

    intentionalCloseRef.current = false;
    const initialDelay = 400;
    const connectTimeoutRef = setTimeout(() => {
      connect();
    }, initialDelay);

    return () => {
      intentionalCloseRef.current = true;
      clearTimeout(connectTimeoutRef);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ action: 'unsubscribe', gameId }));
          } catch {
            // WebSocket peut être invalide (CLOSING/CLOSED)
          }
        }
        try {
          ws.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [connect, gameId]);

  return { connected, send };
}
