import { useCallback, useEffect, useRef, useState } from 'react';

export interface Token {
  id: number;
  mapId: number;
  kind: string;
  name: string;
  color: string;
  x: number;
  y: number;
  visibleToPlayers: boolean;
  ownerUserId?: number;
  hp?: number;
  maxHp?: number;
}

export interface MapData {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
}

interface MapCanvasProps {
  map: MapData | null;
  tokens: Token[];
  isGM: boolean;
  currentUserId: number;
  onTokenMove?: (id: number, x: number, y: number) => void;
  onTokenCreate?: (x: number, y: number) => void;
  onTokenSelect?: (token: Token | null) => void;
}

export function MapCanvas({
  map,
  tokens,
  isGM,
  currentUserId,
  onTokenMove,
  onTokenCreate,
  onTokenSelect,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    tokenId: number;
    startX: number;
    startY: number;
    tokenX: number;
    tokenY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
  } | null>(null);
  const didPanRef = useRef(false);
  const didDragRef = useRef(false);

  const canMove = useCallback(
    (t: Token) => {
      if (isGM) return true;
      return t.ownerUserId === currentUserId;
    },
    [isGM, currentUserId]
  );

  const visibleTokens = tokens.filter((t) => isGM || t.visibleToPlayers);

  const handleWheel = (e: React.WheelEvent) => {
    if (!isGM) return;
    e.preventDefault();
    setScale((s) => Math.max(0.25, Math.min(3, s - e.deltaY * 0.002)));
  };

  const handleMapMouseDown = (e: React.MouseEvent) => {
    if (!isGM) return;
    if ((e.target as HTMLElement).closest('[data-token]')) return;
    if (e.button === 0) {
      didPanRef.current = false;
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffset: { ...offset },
      };
    }
  };

  const handleMapMouseMove = useCallback(
    (e: MouseEvent) => {
      if (panRef.current && isGM) {
        didPanRef.current = true;
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        setOffset({
          x: panRef.current.startOffset.x + dx,
          y: panRef.current.startOffset.y + dy,
        });
      }
    },
    [isGM]
  );

  const handleMapMouseUp = () => {
    panRef.current = null;
  };

  const handleTokenMouseDown = (e: React.MouseEvent, token: Token) => {
    if (!canMove(token) || !onTokenMove) return;
    e.stopPropagation();
    dragRef.current = {
      tokenId: token.id,
      startX: e.clientX,
      startY: e.clientY,
      tokenX: token.x,
      tokenY: token.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current || !onTokenMove) return;
      didDragRef.current = true;
      const dx = (e.clientX - dragRef.current.startX) / scale;
      const dy = (e.clientY - dragRef.current.startY) / scale;
      onTokenMove(
        dragRef.current.tokenId,
        dragRef.current.tokenX + dx,
        dragRef.current.tokenY + dy
      );
    },
    [onTokenMove, scale]
  );

  const handleMouseUp = () => {
    dragRef.current = null;
    // Reset didDragRef after a tick so click handler can check it
    setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMapMouseMove);
    window.addEventListener('mouseup', handleMapMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMapMouseMove);
      window.removeEventListener('mouseup', handleMapMouseUp);
    };
  }, [handleMapMouseMove]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isGM || !onTokenCreate || !map) return;
    // Ne pas créer si on a cliqué sur un token ou si on vient de déplacer la carte
    if ((e.target as HTMLElement).closest('[data-token]')) return;
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    const mapRect = mapContainerRef.current?.getBoundingClientRect();
    if (!mapRect) return;
    const x = ((e.clientX - mapRect.left) * map.width) / mapRect.width;
    const y = ((e.clientY - mapRect.top) * map.height) / mapRect.height;
    if (x >= 0 && y >= 0 && x <= map.width && y <= map.height) {
      onTokenCreate(x, y);
    }
  };

  if (!map) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-500 text-center px-4">
        {onTokenCreate
          ? 'Ajoutez une carte avec le bouton "+ Carte" pour commencer.'
          : 'Aucune carte pour le moment. Le MJ en ajoutera une.'}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="flex-1 overflow-hidden relative bg-slate-900"
      onWheel={handleWheel}
      style={{
        cursor: dragRef.current
          ? 'grabbing'
          : panRef.current && isGM
            ? 'grabbing'
            : isGM
              ? 'grab'
              : 'default',
      }}
    >
      {isGM && (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-lg bg-slate-800/90 p-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s * 1.2))}
            className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 text-sm font-bold"
            title="Zoom avant"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.25, s / 1.2))}
            className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 text-sm font-bold"
            title="Zoom arrière"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-500 text-xs"
            title="Réinitialiser"
          >
            1:1
          </button>
        </div>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        <div
          ref={mapContainerRef}
          className="relative"
          style={{ width: map.width, height: map.height }}
          onMouseDown={handleMapMouseDown}
          onClick={handleCanvasClick}
          title={
            isGM && onTokenCreate ? 'Cliquez pour placer le token' : undefined
          }
        >
          <img
            src={map.imageUrl}
            alt={map.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
          {visibleTokens.map((t) => (
            <div
              key={t.id}
              data-token
              className="absolute rounded-full border-2 cursor-pointer flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-white select-none whitespace-nowrap"
              style={{
                left: t.x,
                top: t.y,
                transform: 'translate(-50%, -50%)',
                backgroundColor: t.color,
                borderColor: canMove(t) ? '#f59e0b' : 'transparent',
              }}
              onMouseDown={(e) => handleTokenMouseDown(e, t)}
              onClick={(e) => {
                e.stopPropagation();
                if (isGM && onTokenSelect && !didDragRef.current)
                  onTokenSelect(t);
              }}
              title={
                t.kind === 'PNJ' && t.maxHp != null
                  ? `${t.name} — PV: ${t.hp ?? t.maxHp}/${t.maxHp}`
                  : t.name
              }
            >
              <span>{t.name}</span>
              {t.kind === 'PNJ' && t.maxHp != null && (
                <span className="text-[10px] opacity-90 shrink-0">
                  {t.hp ?? t.maxHp}/{t.maxHp}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
