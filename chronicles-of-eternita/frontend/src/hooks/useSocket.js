import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

const useSocket = (enabled = true) => {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const instance = io(SOCKET_URL, {
      withCredentials: true
    });
    socketRef.current = instance;
    setSocket(instance);

    return () => {
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [enabled]);

  return socket;
};

export default useSocket;
