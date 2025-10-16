import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const MapCanvas = ({ mapImage, tokens, onTokenMove }) => {
  const containerRef = useRef(null);
  const tokensRef = useRef(tokens);
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const updatePosition = useCallback(
    (event) => {
      if (!draggingId) {
        return;
      }
      const token = tokensRef.current.find((item) => item.id === draggingId);
      if (!token?.draggable) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
      onTokenMove?.({ id: draggingId, x: xPercent, y: yPercent });
    },
    [draggingId, onTokenMove]
  );

  const handlePointerDown = (id) => (event) => {
    const token = tokensRef.current.find((item) => item.id === id);
    if (!token?.draggable) {
      return;
    }
    event.preventDefault();
    setDraggingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!draggingId) {
      return;
    }
    updatePosition(event);
  };

  const handlePointerUp = (event) => {
    if (!draggingId) {
      return;
    }
    updatePosition(event);
    setDraggingId(null);
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
          className="absolute -translate-x-1/2 -translate-y-1/2 select-none"
        >
          <div
            className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 ${
              token.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
            style={{
              borderColor: token.type === 'enemy' ? 'transparent' : token.color || '#34d399'
            }}
          >
            {token.type === 'enemy' && token.image ? (
              <img src={token.image} alt={token.label} className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-slate-900"
                style={{ backgroundColor: token.color || '#34d399' }}
              >
                {token.label.slice(0, 3)}
              </div>
            )}
          </div>
          <p className="pointer-events-none mt-1 text-center text-[10px] font-semibold uppercase text-emerald-200">
            {token.label}
          </p>
        </div>
      ))}
    </div>
  );
};

export default MapCanvas;
