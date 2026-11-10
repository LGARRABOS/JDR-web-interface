import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { FogDrawOverlay, FogLayer } from './FogLayer';
import { CharacterFigure } from './tabletop/CharacterFigure';
import { facingFromKey } from './tabletop/character';
import {
  clientToMapCoords,
  getImageContentRect,
  mapCoordsToContainer,
} from '../utils/mapCoords';
import { isVisibleToPlayers, type FogShape, type FogState } from '../fog/fog';
import type {
  MapData,
  MapElement,
  MapView,
  StatusEffect,
  Token,
} from '../types/game';

export type { MapData, MapElement, MapView, StatusEffect, Token };

interface MapCanvasProps {
  map: MapData | null;
  tokens: Token[];
  mapElements?: MapElement[];
  gameId?: number;
  isGM: boolean;
  currentUserId: number;
  mapView: MapView;
  tokensMovementLocked?: boolean;
  fogVisionRadius?: number;
  highlightedPlayerId?: number | null;
  connectedUserIds?: number[];
  /** Pour les jetons joueurs : userId -> { displayName, characterName } pour afficher le nom du personnage */
  connectedUsers?: Array<{
    userId: number;
    displayName: string;
    characterName?: string;
  }>;
  onMapViewChange?: (view: MapView) => void;
  /** true si une vue partagée existe déjà : pas de recadrage automatique. */
  hasSharedView?: boolean;
  /** Incrémenter pour recadrer la carte sur la fenêtre (bouton « Recentrer »). */
  fitSignal?: number;
  /** Contenu de la fiche rapide affichée au-dessus du jeton sélectionné. */
  renderTokenPopup?: (
    token: Token,
    displayName: string,
    close: () => void
  ) => React.ReactNode;
  onMapPanEnd?: () => void;
  onTokenMove?: (id: number, x: number, y: number) => void;
  onTokenDragStart?: (id: number) => void;
  onTokenDragEnd?: (id: number, x: number, y: number) => void;
  onTokenCreate?: (x: number, y: number) => void;
  onTokenSelect?: (token: Token | null) => void;
  onTokenDoubleClick?: (token: Token) => void;
  selectedToken?: Token | null;
  diceRollOverlay?: React.ReactNode;
  /** Brouillard de guerre de la carte. */
  fog?: FogState | null;
  /** Outil de brouillard actif (MJ) : glisser sur la carte dessine une zone. */
  fogTool?: { shape: FogShape; reveal: boolean } | null;
  /** Tourner un personnage (flèches du clavier sur le jeton sélectionné). */
  onTokenFace?: (id: number, facing: number) => void;
  onFogDraw?: (zone: {
    shape: FogShape;
    x: number;
    y: number;
    w: number;
    h: number;
    reveal: boolean;
  }) => void;
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
  fogVisionRadius = 0,
  highlightedPlayerId = null,
  connectedUserIds = [],
  connectedUsers = [],
  onMapViewChange,
  hasSharedView = false,
  fitSignal = 0,
  renderTokenPopup,
  onMapPanEnd,
  onTokenMove,
  onTokenDragStart,
  onTokenDragEnd,
  onTokenCreate,
  onTokenSelect,
  onTokenDoubleClick,
  selectedToken = null,
  diceRollOverlay,
  fog = null,
  fogTool = null,
  onFogDraw,
  onTokenFace,
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
  const lastTokenClickRef = useRef<{ tokenId: number; time: number } | null>(
    null
  );
  const [inspectedTokenId, setInspectedTokenId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // Taille réelle de l'image, mémorisée avec l'URL à laquelle elle correspond :
  // sans ça, la taille de la carte précédente restait utilisée après un
  // changement de carte (placement et déplacement des jetons décalés).
  const [imageNaturalSize, setImageNaturalSize] = useState<{
    src: string;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const src = map?.imageUrl;
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImageNaturalSize({ src, w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [map?.imageUrl]);

  const naturalSize =
    imageNaturalSize && imageNaturalSize.src === map?.imageUrl
      ? imageNaturalSize
      : null;
  const imgW = naturalSize?.w ?? map?.width ?? 1;
  const imgH = naturalSize?.h ?? map?.height ?? 1;

  const canMove = useCallback(
    (t: Token) => {
      if (isGM) return true;
      if (tokensMovementLocked) return false;
      return t.ownerUserId === currentUserId;
    },
    [isGM, currentUserId, tokensMovementLocked]
  );

  const pjTokens = tokens.filter((t) => t.kind === 'PJ');
  // Côté joueur, un jeton caché par le MJ ou sous le brouillard n'est pas
  // affiché (ni cliquable). Les personnages restent toujours visibles.
  const visibleTokens = tokens.filter(
    (t) =>
      isGM ||
      (t.visibleToPlayers &&
        (t.kind === 'PJ' ||
          isVisibleToPlayers(fog, fogVisionRadius, pjTokens, t.x, t.y)))
  );
  const fogMaskId = `fog-mask-${map?.id ?? 0}`;

  const mapId = map?.id;
  const mapWidth = map?.width ?? 0;
  const mapHeight = map?.height ?? 0;
  const fitScaleToViewport = useCallback(() => {
    if (!mapId || !onMapViewChange || !canvasRef.current) return;
    const vw = canvasRef.current.clientWidth;
    const vh = canvasRef.current.clientHeight;
    if (vw > 0 && vh > 0 && mapWidth > 0 && mapHeight > 0) {
      const fitScale = Math.min(vw / mapWidth, vh / mapHeight) * 0.95;
      onMapViewChange({
        scale: Math.max(0.25, Math.min(3, fitScale)),
        offset: { x: 0, y: 0 },
      });
    }
  }, [mapId, mapWidth, mapHeight, onMapViewChange]);

  // Recadrage automatique (MJ) quand une nouvelle carte est affichée, sauf si
  // une vue partagée existe déjà (ex. le MJ recharge la page en pleine partie).
  const hasSharedViewRef = useRef(hasSharedView);
  hasSharedViewRef.current = hasSharedView;
  useEffect(() => {
    if (!mapId || !isGM || hasSharedViewRef.current) return;
    const runFit = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitScaleToViewport());
      });
    };
    const t = setTimeout(runFit, 100);
    return () => clearTimeout(t);
  }, [mapId, fitScaleToViewport, isGM]);

  useEffect(() => {
    if (fitSignal > 0) fitScaleToViewport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

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
      setIsPanning(true);
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
    setIsPanning(false);
  }, [onMapPanEnd]);

  const handleTokenMouseDown = (e: React.MouseEvent, token: Token) => {
    if (!canMove(token) || !onTokenMove) return;
    e.stopPropagation();
    setIsDragging(true);
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
      if (!dragRef.current || !onTokenMove || !map || !mapContainerRef.current)
        return;
      didDragRef.current = true;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const start = clientToMapCoords(
        dragRef.current.startX,
        dragRef.current.startY,
        rect,
        map.width,
        map.height,
        imgW,
        imgH
      );
      const current = clientToMapCoords(
        e.clientX,
        e.clientY,
        rect,
        map.width,
        map.height,
        imgW,
        imgH
      );
      const newX = dragRef.current.tokenX + (current.x - start.x);
      const newY = dragRef.current.tokenY + (current.y - start.y);
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
    [onTokenMove, map, imgW, imgH]
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
    setIsDragging(false);
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
  // Flèches du clavier : le personnage sélectionné regarde dans cette direction
  // (son joueur ou le MJ). Ignoré pendant la saisie dans un champ.
  const facingTarget = tokens.find(
    (t) =>
      t.id === inspectedTokenId &&
      t.kind === 'PJ' &&
      (isGM || t.ownerUserId === currentUserId)
  );
  const facingTargetId = facingTarget?.id;
  const facingTargetValue = facingTarget?.facing ?? 0;
  useEffect(() => {
    if (facingTargetId == null || !onTokenFace) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      )
        return;
      const facing = facingFromKey(e.key);
      if (facing == null || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (facing !== facingTargetValue) onTokenFace(facingTargetId, facing);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [facingTargetId, facingTargetValue, onTokenFace]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-token]')) return;
    setInspectedTokenId(null);
    onTokenSelect?.(null);
    if (!isGM || !onTokenCreate || !map) return;
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (placementClickRef.current) return;
    placementClickRef.current = true;
    const containerRect = mapContainerRef.current?.getBoundingClientRect();
    if (
      !containerRect ||
      containerRect.width <= 0 ||
      containerRect.height <= 0
    ) {
      placementClickRef.current = false;
      return;
    }
    const { x, y } = clientToMapCoords(
      e.clientX,
      e.clientY,
      containerRect,
      map.width,
      map.height,
      imgW,
      imgH
    );
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
            ? 'Aucune carte. Ajoutez une carte pour afficher les jetons.'
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
        cursor:
          isDragging || isPanning ? 'grabbing' : isGM ? 'grab' : 'default',
      }}
    >
      {isGM && (
        <div
          className="glass absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-xl p-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => updateView({ scale: Math.max(0.25, scale / 1.2) })}
            className="icon-btn !w-9 !h-9 text-lg"
            aria-label="Dézoomer"
            title="Dézoomer"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => updateView({ scale: 1, offset: { x: 0, y: 0 } })}
            className="min-w-[3.25rem] h-9 rounded-lg text-[13px] text-fantasy-text-soft tabular-nums hover:bg-fantasy-input-soft"
            title="Taille réelle (1:1)"
          >
            {Math.round(scale * 100)} %
          </button>
          <button
            type="button"
            onClick={() => updateView({ scale: Math.min(3, scale * 1.2) })}
            className="icon-btn !w-9 !h-9 text-lg"
            aria-label="Zoomer"
            title="Zoomer"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => fitScaleToViewport()}
            className="icon-btn !w-9 !h-9"
            aria-label="Ajuster à la fenêtre"
            title="Ajuster à la fenêtre"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
            </svg>
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
          {mapElements.map((el) => {
            const pos = mapCoordsToContainer(
              el.x,
              el.y,
              map.width,
              map.height,
              imgW,
              imgH
            );
            return (
              <div
                key={el.id}
                className="absolute pointer-events-none"
                style={{
                  left: pos.left,
                  top: pos.top,
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
            );
          })}
          {selectedToken &&
            selectedToken.kind === 'PJ' &&
            (selectedToken.ownerUserId === currentUserId || isGM) &&
            selectedToken.attackRange != null &&
            selectedToken.attackRange > 0 &&
            map && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  width: map.width,
                  height: map.height,
                  zIndex: 8,
                }}
              >
                <svg
                  width={map.width}
                  height={map.height}
                  className="absolute inset-0 w-full h-full"
                >
                  <circle
                    cx={selectedToken.x}
                    cy={selectedToken.y}
                    r={selectedToken.attackRange * map.gridSize}
                    fill="none"
                    style={{ stroke: 'rgb(var(--c-accent) / 0.6)' }}
                    strokeWidth={2}
                  />
                </svg>
              </div>
            )}
          <FogLayer
            mapW={map.width}
            mapH={map.height}
            content={getImageContentRect(map.width, map.height, imgW, imgH)}
            fog={fog}
            visionRadius={isGM ? 0 : fogVisionRadius}
            characters={pjTokens}
            opacity={isGM ? 0.5 : 1}
            // Joueurs : au-dessus des ennemis, sous les personnages (z 14).
            zIndex={isGM ? 5 : 12}
            maskId={fogMaskId}
          />
          {isGM && fogTool && onFogDraw && (
            <FogDrawOverlay
              mapW={map.width}
              mapH={map.height}
              content={getImageContentRect(map.width, map.height, imgW, imgH)}
              shape={fogTool.shape}
              reveal={fogTool.reveal}
              toMap={(cx, cy) => {
                const rect = mapContainerRef.current?.getBoundingClientRect();
                if (!rect) return { x: 0, y: 0 };
                return clientToMapCoords(
                  cx,
                  cy,
                  rect,
                  map.width,
                  map.height,
                  imgW,
                  imgH
                );
              }}
              onDraw={onFogDraw}
            />
          )}
          {visibleTokens.map((t) => {
            const displayName =
              t.ownerUserId != null
                ? t.name && t.name.trim() !== ''
                  ? t.name
                  : connectedUsers.find((u) => u.userId === t.ownerUserId)
                      ?.characterName ||
                    connectedUsers.find((u) => u.userId === t.ownerUserId)
                      ?.displayName ||
                    t.name
                : t.name;
            const tokenPos = mapCoordsToContainer(
              t.x,
              t.y,
              map.width,
              map.height,
              imgW,
              imgH
            );
            return (
              <div
                key={t.id}
                data-token
                className="absolute cursor-grab flex flex-col items-center select-none"
                style={{
                  left: tokenPos.left,
                  top: tokenPos.top,
                  transform: 'translate(-50%, -50%)',
                  minWidth: t.width ?? 56,
                  minHeight: t.height ?? 56,
                  zIndex: t.kind === 'PJ' ? 14 : 10,
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTokenMouseDown(e, t);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!didDragRef.current) {
                    const now = Date.now();
                    const last = lastTokenClickRef.current;
                    if (
                      last &&
                      last.tokenId === t.id &&
                      now - last.time < 350
                    ) {
                      lastTokenClickRef.current = null;
                      onTokenDoubleClick?.(t);
                      return;
                    }
                    lastTokenClickRef.current = { tokenId: t.id, time: now };
                    const willClose = inspectedTokenId === t.id;
                    setInspectedTokenId(willClose ? null : t.id);
                    onTokenSelect?.(willClose ? null : t);
                  }
                }}
                title={
                  t.kind === 'PJ' &&
                  t.ownerUserId === currentUserId &&
                  (t.attackRange ?? 0) > 0
                    ? `${displayName} — Cliquez pour afficher la portée d'attaque`
                    : displayName
                }
              >
                {t.kind === 'MORT' ? (
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0 pointer-events-none text-2xl"
                    style={{
                      width: t.width ?? 56,
                      height: t.height ?? 56,
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      border: '2px solid #6b7280',
                    }}
                    title={`${displayName} (vaincu)`}
                  >
                    💀
                  </div>
                ) : t.kind === 'PJ' ? (
                  <>
                    <CharacterFigure
                      color={t.color}
                      facing={t.facing ?? 0}
                      size={t.width ?? 56}
                      seed={t.ownerUserId ?? t.id}
                      ring={canMove(t) ? 'rgb(var(--c-accent))' : undefined}
                      glow={
                        highlightedPlayerId != null &&
                        t.ownerUserId === highlightedPlayerId
                      }
                    />
                    <span className="mt-0.5 max-w-[120px] truncate px-1.5 rounded bg-black/55 text-[11px] font-semibold text-white leading-4 pointer-events-none">
                      {displayName}
                    </span>
                  </>
                ) : t.iconUrl ? (
                  <div
                    className="rounded-full overflow-hidden flex-shrink-0 pointer-events-none"
                    style={{
                      width: t.width ?? 56,
                      height: t.height ?? 56,
                      border: `2px solid ${canMove(t) ? 'rgb(var(--c-accent))' : 'transparent'}`,
                      boxShadow:
                        highlightedPlayerId != null &&
                        t.ownerUserId === highlightedPlayerId
                          ? '0 0 12px 4px rgb(var(--c-accent) / 0.8)'
                          : undefined,
                    }}
                  >
                    <img
                      src={t.iconUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition:
                          t.iconPosX != null && t.iconPosY != null
                            ? `${t.iconPosX}% ${t.iconPosY}%`
                            : undefined,
                        transform:
                          t.iconScale != null && t.iconScale !== 1
                            ? `scale(${t.iconScale})`
                            : undefined,
                        transformOrigin:
                          t.iconPosX != null && t.iconPosY != null
                            ? `${t.iconPosX}% ${t.iconPosY}%`
                            : undefined,
                      }}
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div
                    className="w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center overflow-hidden px-1.5 text-[10px] font-bold text-white pointer-events-none"
                    style={{
                      backgroundColor: t.color,
                      borderColor: canMove(t)
                        ? 'rgb(var(--c-accent))'
                        : 'transparent',
                      boxShadow:
                        highlightedPlayerId != null &&
                        t.ownerUserId === highlightedPlayerId
                          ? '0 0 12px 4px rgb(var(--c-accent) / 0.8)'
                          : undefined,
                    }}
                  >
                    <span className="truncate w-full text-center leading-tight">
                      {displayName.length > 20
                        ? `${displayName.slice(0, 20)}…`
                        : displayName}
                    </span>
                  </div>
                )}
                {t.ownerUserId != null &&
                  !connectedUserIds.includes(t.ownerUserId) &&
                  t.kind !== 'MORT' && (
                    <span className="mt-0.5 text-[8px] font-medium text-fantasy-muted-soft italic pointer-events-none">
                      hors ligne
                    </span>
                  )}
              </div>
            );
          })}
          {inspectedTokenId != null &&
            (() => {
              const t = visibleTokens.find(
                (tok) => tok.id === inspectedTokenId
              );
              if (!t) return null;
              const popupName =
                t.ownerUserId != null
                  ? connectedUsers.find((u) => u.userId === t.ownerUserId)
                      ?.characterName ||
                    connectedUsers.find((u) => u.userId === t.ownerUserId)
                      ?.displayName ||
                    t.name
                  : t.name;
              const popupPos = mapCoordsToContainer(
                t.x,
                t.y,
                map.width,
                map.height,
                imgW,
                imgH
              );
              if (renderTokenPopup) {
                const close = () => {
                  setInspectedTokenId(null);
                  onTokenSelect?.(null);
                };
                return (
                  <div
                    className="absolute z-30"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                    style={{
                      left: popupPos.left,
                      top: popupPos.top - (t.height ?? 56) / 2 - 10,
                      // Taille constante quel que soit le zoom de la carte.
                      transform: `translate(-50%, -100%) scale(${1 / scale})`,
                      transformOrigin: 'bottom center',
                    }}
                  >
                    {renderTokenPopup(t, popupName, close)}
                  </div>
                );
              }
              return (
                <div
                  className="absolute z-30 rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-2 shadow-lg text-sm min-w-[120px]"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    left: popupPos.left,
                    top: popupPos.top - (t.height ?? 56) / 2 - 4,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="font-medium text-fantasy-text-soft truncate">
                    {popupName}
                    {t.kind === 'MORT' && (
                      <span className="text-fantasy-muted-soft ml-1">
                        (vaincu)
                      </span>
                    )}
                  </div>
                  {t.kind !== 'MORT' &&
                    (t.hp != null ||
                      t.maxHp != null ||
                      t.mana != null ||
                      t.maxMana != null) && (
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="text-xs text-fantasy-muted-soft space-y-0.5">
                          {(t.hp != null || t.maxHp != null) && (
                            <div>
                              PV {t.hp ?? '—'} / {t.maxHp ?? '—'}
                            </div>
                          )}
                          {(t.mana != null || t.maxMana != null) && (
                            <div>
                              Mana {t.mana ?? '—'} / {t.maxMana ?? '—'}
                            </div>
                          )}
                        </div>
                        {(t.kind === 'PNJ' || t.kind === 'MORT') &&
                          t.elementId != null &&
                          onTokenDoubleClick && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTokenDoubleClick(t);
                              }}
                              className="shrink-0 p-1 rounded bg-fantasy-accent/80 hover:bg-fantasy-accent text-fantasy-bg text-xs"
                              title="Ouvrir la fiche monstre"
                            >
                              📋
                            </button>
                          )}
                      </div>
                    )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
