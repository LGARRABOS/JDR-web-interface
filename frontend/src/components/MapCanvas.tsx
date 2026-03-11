import { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export interface Token {
  id: number;
  mapId: number;
  kind: string;
  name: string;
  color: string;
  iconUrl?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visibleToPlayers: boolean;
  ownerUserId?: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
}

export interface MapData {
  id: number;
  gameId: number;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  tags?: string[];
}

export interface MapView {
  scale: number;
  offset: { x: number; y: number };
}

export interface MapElement {
  id: number;
  mapId: number;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt?: string;
}

interface MapCanvasProps {
  map: MapData | null;
  tokens: Token[];
  mapElements?: MapElement[];
  gameId?: number;
  isGM: boolean;
  currentUserId: number;
  mapView: MapView;
  tokensMovementLocked?: boolean;
  highlightedPlayerId?: number | null;
  connectedUserIds?: number[];
  /** Pour les jetons joueurs : userId -> { displayName, characterName } pour afficher le nom du personnage */
  connectedUsers?: Array<{ userId: number; displayName: string; characterName?: string }>;
  onMapViewChange?: (view: MapView) => void;
  onMapPanEnd?: () => void;
  onTokenMove?: (id: number, x: number, y: number) => void;
  onTokenDragStart?: (id: number) => void;
  onTokenDragEnd?: (id: number, x: number, y: number) => void;
  onTokenCreate?: (x: number, y: number) => void;
  onTokenSelect?: (token: Token | null) => void;
  diceRollOverlay?: React.ReactNode;
}

export function MapCanvas({
  map,
  tokens,
  mapElements = [],
  gameId = 0,
  isGM,
  currentUserId,
  mapView,
  tokensMovementLocked = false,
  highlightedPlayerId = null,
  connectedUserIds = [],
  connectedUsers = [],
  onMapViewChange,
  onMapPanEnd,
  onTokenMove,
  onTokenDragStart,
  onTokenDragEnd,
  onTokenCreate,
  onTokenSelect,
  diceRollOverlay,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { scale, offset } = mapView;
  const dragRef = useRef<{
    tokenId: number;
    startX: number;
    startY: number;
    tokenX: number;
    tokenY: number;
    lastX: number;
    lastY: number;
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
      if (tokensMovementLocked) return false;
      return t.ownerUserId === currentUserId;
    },
    [isGM, currentUserId, tokensMovementLocked]
  );

  const visibleTokens = tokens.filter((t) => isGM || t.visibleToPlayers);

  const fitScaleToViewport = useCallback(() => {
    if (!map || !onMapViewChange || !canvasRef.current) return;
    const vw = canvasRef.current.clientWidth;
    const vh = canvasRef.current.clientHeight;
    if (vw > 0 && vh > 0 && map.width > 0 && map.height > 0) {
      const fitScale = Math.min(vw / map.width, vh / map.height) * 0.95;
      onMapViewChange({
        scale: Math.max(0.25, Math.min(3, fitScale)),
        offset: { x: 0, y: 0 },
      });
    }
  }, [map, onMapViewChange]);

  useEffect(() => {
    if (!map) return;
    const t = setTimeout(() => fitScaleToViewport(), 50);
    return () => clearTimeout(t);
  }, [map, fitScaleToViewport]);

  const updateView = useCallback(
    (updates: Partial<MapView>) => {
      if (!onMapViewChange) return;
      onMapViewChange({
        scale: updates.scale ?? scale,
        offset: updates.offset ?? { ...offset },
      });
    },
    [onMapViewChange, scale, offset]
  );

  const handleWheel = (e: React.WheelEvent) => {
    if (!isGM) return;
    e.preventDefault();
    const newScale = Math.max(0.25, Math.min(3, scale - e.deltaY * 0.002));
    updateView({ scale: newScale });
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
      if (panRef.current && isGM && onMapViewChange) {
        didPanRef.current = true;
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        onMapViewChange({
          scale,
          offset: {
            x: panRef.current.startOffset.x + dx,
            y: panRef.current.startOffset.y + dy,
          },
        });
      }
    },
    [isGM, onMapViewChange, scale]
  );

  const handleMapMouseUp = useCallback(() => {
    if (panRef.current && didPanRef.current && onMapPanEnd) {
      onMapPanEnd();
    }
    panRef.current = null;
  }, [onMapPanEnd]);

  const handleTokenMouseDown = (e: React.MouseEvent, token: Token) => {
    if (!canMove(token) || !onTokenMove) return;
    e.stopPropagation();
    onTokenDragStart?.(token.id);
    dragRef.current = {
      tokenId: token.id,
      startX: e.clientX,
      startY: e.clientY,
      tokenX: token.x,
      tokenY: token.y,
      lastX: token.x,
      lastY: token.y,
    };
  };

  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current || !onTokenMove) return;
      didDragRef.current = true;
      const dx = (e.clientX - dragRef.current.startX) / scale;
      const dy = (e.clientY - dragRef.current.startY) / scale;
      const newX = dragRef.current.tokenX + dx;
      const newY = dragRef.current.tokenY + dy;
      dragRef.current.lastX = newX;
      dragRef.current.lastY = newY;
      pendingMoveRef.current = { x: newX, y: newY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const p = pendingMoveRef.current;
          if (p && dragRef.current) {
            onTokenMove(dragRef.current.tokenId, p.x, p.y);
          }
        });
      }
    },
    [onTokenMove, scale]
  );

  const handleMouseUp = useCallback(() => {
    const wasDragging = dragRef.current;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (wasDragging) {
      onTokenDragEnd?.(
        wasDragging.tokenId,
        wasDragging.lastX,
        wasDragging.lastY
      );
    }
    dragRef.current = null;
    // Reset didDragRef after a tick so click handler can check it
    setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  }, [onTokenDragEnd]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMapMouseMove);
    window.addEventListener('mouseup', handleMapMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMapMouseMove);
      window.removeEventListener('mouseup', handleMapMouseUp);
    };
  }, [handleMapMouseMove, handleMapMouseUp]);

  const placementClickRef = useRef(false);
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isGM || !onTokenCreate || !map) return;
    if ((e.target as HTMLElement).closest('[data-token]')) return;
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (placementClickRef.current) return;
    placementClickRef.current = true;
    const mapRect = mapContainerRef.current?.getBoundingClientRect();
    if (!mapRect) {
      placementClickRef.current = false;
      return;
    }
    const x = ((e.clientX - mapRect.left) * map.width) / mapRect.width;
    const y = ((e.clientY - mapRect.top) * map.height) / mapRect.height;
    if (x >= 0 && y >= 0 && x <= map.width && y <= map.height) {
      onTokenCreate(x, y);
    }
    setTimeout(() => {
      placementClickRef.current = false;
    }, 300);
  };

  if (!map) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-fantasy-bg text-fantasy-muted-soft text-center px-4 gap-4 relative">
        {diceRollOverlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            {diceRollOverlay}
          </div>
        )}
        <p>
          {onTokenCreate
            ? "Aucune carte. Ajoutez une carte pour afficher les jetons."
            : 'Aucune carte pour le moment. Le MJ en ajoutera une.'}
        </p>
        {onTokenCreate && gameId > 0 && (
          <Link
            to={`/table/${gameId}/resources`}
            className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium transition-colors"
          >
            Ajouter une carte →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="flex-1 overflow-hidden relative bg-fantasy-bg select-none"
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
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-1">
          <button
            type="button"
            onClick={() => updateView({ scale: Math.min(3, scale * 1.2) })}
            className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm font-bold text-fantasy-text-soft"
            title="Zoom avant"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => updateView({ scale: Math.max(0.25, scale / 1.2) })}
            className="px-2 py-1 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm font-bold text-fantasy-text-soft"
            title="Zoom arrière"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => fitScaleToViewport()}
            className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs text-fantasy-text-soft"
            title="Ajuster à la fenêtre"
          >
            ⊡
          </button>
          <button
            type="button"
            onClick={() => updateView({ scale: 1, offset: { x: 0, y: 0 } })}
            className="px-2 py-0.5 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-xs text-fantasy-text-soft"
            title="Zoom 1:1"
          >
            1:1
          </button>
        </div>
      )}
      {diceRollOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          {diceRollOverlay}
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
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
          {mapElements.map((el) => (
            <div
              key={el.id}
              className="absolute pointer-events-none"
              style={{
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <img
                src={el.imageUrl}
                alt=""
                className="w-full h-full object-contain select-none"
                draggable={false}
              />
            </div>
          ))}
          {visibleTokens.map((t) => {
            const displayName =
              t.ownerUserId != null
                ? connectedUsers.find((u) => u.userId === t.ownerUserId)
                    ?.characterName ||
                  connectedUsers.find((u) => u.userId === t.ownerUserId)
                    ?.displayName ||
                  t.name
                : t.name;
            return (
              <div
                key={t.id}
                data-token
                className="absolute cursor-grab flex flex-col items-center select-none"
                style={{
                  left: t.x,
                  top: t.y,
                  transform: 'translate(-50%, -50%)',
                  minWidth: t.width ?? 56,
                  minHeight: t.height ?? 56,
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTokenMouseDown(e, t);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTokenSelect && !didDragRef.current) onTokenSelect(t);
                }}
                title={displayName}
              >
                {(t.hp != null || t.maxHp != null || t.mana != null || t.maxMana != null) && (
                  <div className="mb-0.5 flex gap-1.5 text-[9px] font-medium text-fantasy-text-soft pointer-events-none">
                    {(t.hp != null || t.maxHp != null) && (
                      <span>PV {t.hp ?? '—'}</span>
                    )}
                    {(t.mana != null || t.maxMana != null) && (
                      <span>Mana {t.mana ?? '—'}</span>
                    )}
                  </div>
                )}
                {t.iconUrl ? (
                  <div
                    className="rounded-full overflow-hidden flex-shrink-0 pointer-events-none"
                    style={{
                      width: t.width ?? 56,
                      height: t.height ?? 56,
                      border: `2px solid ${canMove(t) ? '#f59e0b' : 'transparent'}`,
                      boxShadow:
                        highlightedPlayerId != null &&
                        t.ownerUserId === highlightedPlayerId
                          ? '0 0 12px 4px rgba(234, 179, 8, 0.8)'
                          : undefined,
                    }}
                  >
                    <img
                      src={t.iconUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div
                    className="w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center overflow-hidden px-1.5 text-[10px] font-bold text-white pointer-events-none"
                    style={{
                      backgroundColor: t.color,
                      borderColor: canMove(t) ? '#f59e0b' : 'transparent',
                      boxShadow:
                        highlightedPlayerId != null &&
                        t.ownerUserId === highlightedPlayerId
                          ? '0 0 12px 4px rgba(234, 179, 8, 0.8)'
                          : undefined,
                    }}
                  >
                    <span className="truncate w-full text-center leading-tight">
                      {(displayName.length > 20 ? `${displayName.slice(0, 20)}…` : displayName)}
                    </span>
                  </div>
                )}
                {t.ownerUserId != null &&
                  !connectedUserIds.includes(t.ownerUserId) && (
                    <span className="mt-0.5 text-[8px] font-medium text-fantasy-muted-soft italic pointer-events-none">
                      hors ligne
                    </span>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
