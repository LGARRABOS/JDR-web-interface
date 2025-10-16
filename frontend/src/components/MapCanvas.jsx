import { useCallback, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const MapCanvas = ({ mapImage, tokens, onTokenMove, isMJ }) => {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const updatePosition = useCallback(
    (event) => {
      if (!dragging || !isMJ) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
      onTokenMove?.({ id: dragging, x: xPercent, y: yPercent });
    },
    [dragging, isMJ, onTokenMove]
  );

  const handlePointerDown = (id) => (event) => {
    if (!isMJ) {
      return;
    }
    event.preventDefault();
    setDragging(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragging) {
      return;
    }
    updatePosition(event);
  };

  const handlePointerUp = (event) => {
    if (!dragging) {
      return;
    }
    updatePosition(event);
    setDragging(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {mapImage ? (
        <img src={mapImage} alt="Carte" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-500">Aucune carte chargée</div>
      )}
      {tokens.map((token) => (
        <div
          key={token.id}
          onPointerDown={handlePointerDown(token.id)}
          style={{
            left: `${token.x}%`,
            top: `${token.y}%`
          }}
          className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-full border-2 border-emerald-400 bg-slate-800 text-xs font-semibold uppercase ${
            isMJ ? 'cursor-grab' : 'cursor-default'
          }`}
        >
          {token.label.slice(0, 3)}
        </div>
      ))}
    </div>
  );
};

export default MapCanvas;
