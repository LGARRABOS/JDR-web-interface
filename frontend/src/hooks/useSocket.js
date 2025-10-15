import { useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Hook returning memoized sockets for map and dice interactions. Automatically
 * joins the provided campaign room when available.
 */
export const useSocket = (campaignId = 'default') => {
  const mapSocketRef = useRef();
  const diceSocketRef = useRef();

  const sockets = useMemo(() => {
    mapSocketRef.current = io(`${BASE_URL}/map`, { autoConnect: false });
    diceSocketRef.current = io(`${BASE_URL}/dice`, { autoConnect: false });
    return {
      map: mapSocketRef.current,
      dice: diceSocketRef.current,
    };
  }, []);

  useEffect(() => {
    const mapSocket = mapSocketRef.current;
    const diceSocket = diceSocketRef.current;

    mapSocket.connect();
    diceSocket.connect();

    mapSocket.emit('join-campaign', campaignId);
    diceSocket.emit('join-campaign', campaignId);

    return () => {
      mapSocket.disconnect();
      diceSocket.disconnect();
    };
  }, [campaignId]);

  return sockets;
};
