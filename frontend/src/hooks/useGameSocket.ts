import { useEffect, useRef, useCallback, useState } from 'react';

interface GameSocketMessage {
  gameId: number;
  type: string;
  payload: unknown;
}

type MessageHandler = (payload: unknown) => void;

export function useGameSocket(
  gameId: number | null,
  handlers: Record<string, MessageHandler>
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!gameId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/api/ws`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', gameId }));
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg: GameSocketMessage = JSON.parse(event.data);
        if (msg.gameId !== gameId) return;
        const fn = handlersRef.current[msg.type];
        if (fn) fn(msg.payload);
      } catch {
        // ignore
      }
    };

    wsRef.current = ws;
  }, [gameId]);

  const send = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && gameId) {
        try {
          ws.send(JSON.stringify({ action, gameId, ...payload }));
        } catch {
          // ignore
        }
      }
    },
    [gameId]
  );

  useEffect(() => {
    connect();
    return () => {
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
