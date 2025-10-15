import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '../App.jsx';

const defaultTokens = [];

const MapCanvas = ({ mapImage, tokens = defaultTokens, onTokenMove, onCreateToken }) => {
  const canvasRef = useRef(null);
  const [draggingToken, setDraggingToken] = useState(null);
  const { user } = useAuth();
  const isMJ = user?.isGameMaster;

  const computedTokens = useMemo(() => tokens ?? defaultTokens, [tokens]);

  const handleMouseDown = useCallback(
    (event, token) => {
      if (!isMJ || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      setDraggingToken({
        id: token.id,
        offsetX: event.clientX - rect.left - token.x,
        offsetY: event.clientY - rect.top - token.y,
      });
    },
    [isMJ],
  );

  const handleMouseMove = useCallback(
    (event) => {
      if (!draggingToken || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = event.clientX - rect.left - draggingToken.offsetX;
      const newY = event.clientY - rect.top - draggingToken.offsetY;
      onTokenMove({ id: draggingToken.id, x: newX, y: newY });
    },
    [draggingToken, onTokenMove],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingToken(null);
  }, []);

  const handleDoubleClick = useCallback(
    (event) => {
      if (!isMJ || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      onCreateToken({ x, y });
    },
    [isMJ, onCreateToken],
  );

  return (
    <div
      ref={canvasRef}
      className="relative bg-slate-800 border border-slate-700 rounded overflow-hidden"
      style={{ minHeight: 400 }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {mapImage ? (
        <img
          src={mapImage}
          alt="Carte"
          className="w-full h-full object-contain pointer-events-none select-none"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          Aucune carte pour le moment. Le MJ peut en téléverser une.
        </div>
      )}
      {computedTokens.map((token) => (
        <div
          key={token.id}
          onMouseDown={(event) => handleMouseDown(event, token)}
          className={[
            'absolute w-12 h-12 rounded-full border-2 border-accent bg-accent/80 flex items-center justify-center text-xs text-white select-none',
            isMJ ? 'cursor-move' : 'cursor-default',
          ].join(' ')}
          style={{ transform: `translate(${token.x}px, ${token.y}px)` }}
        >
          {token.name || 'Token'}
        </div>
      ))}
    </div>
  );
};

export default MapCanvas;
