import { useState } from 'react';
import type { RulerPoint } from '../../realtime/protocol';
import { formatCells, rulerCells } from './ruler';

export interface DrawnRuler {
  key: string;
  from: RulerPoint;
  to: RulerPoint;
  color: string;
  /** Nom affiché sous la mesure des autres participants. */
  label?: string;
}

interface RulerLayerProps {
  mapW: number;
  mapH: number;
  gridSize: number;
  /** Échelle d'affichage de la carte : textes et traits gardent leur taille. */
  viewScale: number;
  rulers: DrawnRuler[];
  /** Position dans le conteneur d'un point de la carte. */
  toContainer: (p: RulerPoint) => { left: number; top: number };
}

/** Mesures affichées sur la carte (la sienne et celles des autres). */
export function RulerLayer({
  mapW,
  mapH,
  gridSize,
  viewScale,
  rulers,
  toContainer,
}: RulerLayerProps) {
  if (rulers.length === 0) return null;
  const k = 1 / (viewScale || 1);
  return (
    <svg
      width={mapW}
      height={mapH}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 24, overflow: 'visible' }}
      data-testid="ruler-layer"
    >
      {rulers.map((r) => {
        const a = toContainer(r.from);
        const b = toContainer(r.to);
        const text = formatCells(rulerCells(r.from, r.to, gridSize));
        const mx = (a.left + b.left) / 2;
        const my = (a.top + b.top) / 2;
        return (
          <g key={r.key}>
            <line
              x1={a.left}
              y1={a.top}
              x2={b.left}
              y2={b.top}
              stroke="rgb(0 0 0 / 0.55)"
              strokeWidth={6 * k}
              strokeLinecap="round"
            />
            <line
              x1={a.left}
              y1={a.top}
              x2={b.left}
              y2={b.top}
              stroke={r.color}
              strokeWidth={3 * k}
              strokeDasharray={`${10 * k} ${6 * k}`}
              strokeLinecap="round"
            />
            <circle cx={a.left} cy={a.top} r={5 * k} fill={r.color} />
            <circle
              cx={b.left}
              cy={b.top}
              r={6 * k}
              fill="none"
              stroke={r.color}
              strokeWidth={3 * k}
            />
            <g transform={`translate(${mx} ${my - 18 * k}) scale(${k})`}>
              <rect
                x={-48}
                y={-14}
                width={96}
                height={r.label ? 40 : 28}
                rx={8}
                fill="rgb(0 0 0 / 0.75)"
              />
              <text
                textAnchor="middle"
                y={5}
                fill="white"
                fontSize={15}
                fontWeight={700}
              >
                {text}
              </text>
              {r.label && (
                <text
                  textAnchor="middle"
                  y={20}
                  fill="rgb(255 255 255 / 0.75)"
                  fontSize={11}
                >
                  {r.label}
                </text>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

interface RulerDrawOverlayProps {
  mapW: number;
  mapH: number;
  toMap: (clientX: number, clientY: number) => RulerPoint;
  /** Appelé pendant le geste, puis avec null quand il se termine. */
  onChange: (line: { from: RulerPoint; to: RulerPoint } | null) => void;
}

/** Zone de mesure : glisser (souris ou doigt) pour mesurer une distance. */
export function RulerDrawOverlay({
  mapW,
  mapH,
  toMap,
  onChange,
}: RulerDrawOverlayProps) {
  const [start, setStart] = useState<RulerPoint | null>(null);
  return (
    <div
      className="absolute inset-0"
      style={{
        width: mapW,
        height: mapH,
        zIndex: 26,
        cursor: 'crosshair',
        touchAction: 'none',
      }}
      data-testid="ruler-draw"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const p = toMap(e.clientX, e.clientY);
        setStart(p);
        onChange({ from: p, to: p });
      }}
      onPointerMove={(e) => {
        if (start) onChange({ from: start, to: toMap(e.clientX, e.clientY) });
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setStart(null);
        onChange(null);
      }}
      onPointerCancel={() => {
        setStart(null);
        onChange(null);
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
