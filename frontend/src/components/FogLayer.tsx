import { useState } from 'react';
import type { FogPatch, FogShape, FogState, Point } from '../fog/fog';
import { rectFromCorners } from '../fog/fog';

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FogLayerProps {
  /** Taille logique du conteneur de la carte. */
  mapW: number;
  mapH: number;
  /** Zone occupée par l'image dans le conteneur. */
  content: ContentRect;
  fog: FogState | null | undefined;
  visionRadius: number;
  characters: Point[];
  /** 1 pour les joueurs (opaque), plus faible pour le MJ. */
  opacity: number;
  zIndex: number;
  maskId: string;
}

function Shape({
  p,
  fill,
}: {
  p: Pick<FogPatch, 'shape' | 'x' | 'y' | 'w' | 'h'>;
  fill: string;
}) {
  if (p.shape === 'ellipse') {
    return (
      <ellipse
        cx={p.x + p.w / 2}
        cy={p.y + p.h / 2}
        rx={p.w / 2}
        ry={p.h / 2}
        fill={fill}
      />
    );
  }
  return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={fill} />;
}

/**
 * Couche de brouillard : tout est couvert, sauf les zones révélées par le MJ
 * (dans l'ordre où il les a dessinées) et la vision autour des personnages.
 */
export function FogLayer({
  mapW,
  mapH,
  content,
  fog,
  visionRadius,
  characters,
  opacity,
  zIndex,
  maskId,
}: FogLayerProps) {
  const fogOn = !!fog?.enabled;
  const vision = visionRadius > 0 && characters.length > 0;
  if (!fogOn && !vision) return null;
  // Coordonnées de la carte -> zone de l'image dans le conteneur.
  const toContent = `translate(${content.left} ${content.top}) scale(${
    content.width / mapW
  } ${content.height / mapH})`;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: mapW, height: mapH, zIndex }}
      data-testid="fog-layer"
    >
      <svg
        width={mapW}
        height={mapH}
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <mask id={maskId}>
            <rect width={mapW} height={mapH} fill="white" />
            <g transform={toContent}>
              {fogOn &&
                (fog?.patches ?? []).map((p) => (
                  <Shape key={p.id} p={p} fill={p.reveal ? 'black' : 'white'} />
                ))}
              {vision &&
                characters.map((c, i) => (
                  <circle
                    key={i}
                    cx={c.x}
                    cy={c.y}
                    r={visionRadius}
                    fill="black"
                  />
                ))}
            </g>
          </mask>
        </defs>
        <rect
          width={mapW}
          height={mapH}
          style={{ fill: 'rgb(var(--c-bg))', opacity }}
          mask={`url(#${maskId})`}
        />
      </svg>
    </div>
  );
}

interface FogDrawOverlayProps {
  mapW: number;
  mapH: number;
  content: ContentRect;
  shape: FogShape;
  reveal: boolean;
  /** Convertit une position écran en coordonnées de la carte. */
  toMap: (clientX: number, clientY: number) => Point;
  onDraw: (zone: {
    shape: FogShape;
    x: number;
    y: number;
    w: number;
    h: number;
    reveal: boolean;
  }) => void;
}

/** Zone de dessin du MJ : glisser pour révéler ou recouvrir. */
export function FogDrawOverlay({
  mapW,
  mapH,
  content,
  shape,
  reveal,
  toMap,
  onDraw,
}: FogDrawOverlayProps) {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const rect = start && end ? rectFromCorners(start, end) : null;
  const toContent = `translate(${content.left} ${content.top}) scale(${
    content.width / mapW
  } ${content.height / mapH})`;
  return (
    <div
      className="absolute inset-0"
      style={{ width: mapW, height: mapH, zIndex: 25, cursor: 'crosshair' }}
      data-testid="fog-draw"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = toMap(e.clientX, e.clientY);
        setStart(p);
        setEnd(p);
      }}
      onPointerMove={(e) => {
        if (start) setEnd(toMap(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (rect && rect.w >= 4 && rect.h >= 4)
          onDraw({ shape, reveal, ...rect });
        setStart(null);
        setEnd(null);
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {rect && (
        <svg
          width={mapW}
          height={mapH}
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <g transform={toContent}>
            <Shape
              p={{ shape, ...rect }}
              fill={
                reveal ? 'rgb(var(--c-accent) / 0.25)' : 'rgb(0 0 0 / 0.45)'
              }
            />
          </g>
        </svg>
      )}
    </div>
  );
}
