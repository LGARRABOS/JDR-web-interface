import { useRef } from 'react';
import { RANGES, SIDE_LABELS, rangeInfo } from '../model/logic';
import type { Target } from '../model/types';

// Schéma des portées, d'après la feuille « portées » : anneaux à 50, 150 et
// 300 m autour de l'arpenteur (vu de dessus, proue vers le haut), positions
// A (avant), B (arrière), C (bâbord), D (tribord) et couloirs de tir.

const R = 330;

function wedge(r1: number, r2: number, a1: number, a2: number): string {
  // Angles en degrés, 0 = devant (haut), sens horaire.
  const pt = (r: number, a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(Math.cos(rad) * r).toFixed(1)},${(Math.sin(rad) * r).toFixed(1)}`;
  };
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${pt(r1, a1)} L${pt(r2, a1)} A${r2},${r2} 0 ${large} 1 ${pt(r2, a2)} L${pt(r1, a2)} A${r1},${r1} 0 ${large} 0 ${pt(r1, a1)} Z`;
}

export function RangeDiagram({
  target,
  onTarget,
  className = '',
}: {
  target: Target | null;
  onTarget?: (t: Target | null) => void;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const info = target ? rangeInfo(target) : null;

  const place = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTarget || !ref.current) return;
    const ctm = ref.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    onTarget({
      x: Math.round(p.x),
      y: Math.round(p.y),
      label: target?.label ?? '',
    });
  };

  const lane = 'rgba(214,72,56,.22)';
  const laneStroke = 'rgba(232,96,76,.75)';
  const { short, medium, long, frontLane, rearLane, beamAngle } = RANGES;
  const ok = info?.inLane;

  return (
    <div className={className}>
      <svg
        ref={ref}
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        className={`w-full h-auto select-none ${onTarget ? 'cursor-crosshair' : ''}`}
        onPointerDown={place}
        role="img"
        aria-label="Schéma des portées"
      >
        <defs>
          <radialGradient id="arp-range-bg">
            <stop offset="0" stopColor="#3a2b1d" />
            <stop offset="1" stopColor="#17110c" />
          </radialGradient>
        </defs>
        <circle r={R} fill="url(#arp-range-bg)" />
        {/* Anneaux */}
        {[long, medium, short].map((r) => (
          <circle
            key={r}
            r={r}
            fill="none"
            stroke={
              r === short ? '#e39a3b' : r === medium ? '#d6483a' : '#8a7a66'
            }
            strokeWidth={r === long ? 1.5 : 2}
            strokeDasharray={
              r === long ? '6 8' : r === medium ? '14 8' : undefined
            }
          />
        ))}
        {/* Courte portée : tous les côtés tirent */}
        <circle r={short} fill="rgba(227,154,59,.16)" />
        {/* Couloirs de tir (50 à 150 m) */}
        <rect
          x={-frontLane}
          y={-medium}
          width={frontLane * 2}
          height={medium - short}
          fill={lane}
          stroke={laneStroke}
          strokeWidth={1.2}
        />
        <rect
          x={-rearLane}
          y={short}
          width={rearLane * 2}
          height={medium - short}
          fill={lane}
          stroke={laneStroke}
          strokeWidth={1.2}
        />
        <path
          d={wedge(short, medium, 90 - beamAngle, 90 + beamAngle)}
          fill={lane}
          stroke={laneStroke}
          strokeWidth={1.2}
        />
        <path
          d={wedge(short, medium, 270 - beamAngle, 270 + beamAngle)}
          fill={lane}
          stroke={laneStroke}
          strokeWidth={1.2}
        />
        {/* Graduations */}
        {[short, medium, long].map((r) => (
          <text
            key={`t${r}`}
            x={r * 0.71 + 6}
            y={-r * 0.71 - 4}
            fill="#e9d8b6"
            fontSize={13}
            opacity={0.85}
            transform={`rotate(45 ${r * 0.71} ${-r * 0.71})`}
          >
            {r} m
          </text>
        ))}
        {/* Arpenteur vu de dessus */}
        <g>
          <path
            d="M0,-24 C9,-18 11,-6 11,6 L10,18 L-10,18 L-11,6 C-11,-6 -9,-18 0,-24 Z"
            fill="#8c5b34"
            stroke="#2a1a10"
            strokeWidth={1.5}
          />
          <rect x={-11.5} y={-6} width={3} height={16} fill="#3a3f45" />
          <rect x={8.5} y={-6} width={3} height={16} fill="#3a3f45" />
          {[
            ['A', 0, -36],
            ['B', 0, 32],
            ['C', -24, 2],
            ['D', 24, 2],
          ].map(([l, x, y]) => (
            <g key={l as string}>
              <circle
                cx={x as number}
                cy={y as number}
                r={8}
                fill="#f1e3c6"
                stroke="#2a1a10"
              />
              <text
                x={x as number}
                y={(y as number) + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#2a1a10"
              >
                {l}
              </text>
            </g>
          ))}
        </g>
        {/* Cible */}
        {target && (
          <g>
            <line
              x1={0}
              y1={0}
              x2={target.x}
              y2={target.y}
              stroke={ok ? '#9fd27a' : '#e2614d'}
              strokeWidth={1.6}
              strokeDasharray="5 5"
            />
            <g transform={`translate(${target.x},${target.y})`}>
              <circle
                r={11}
                fill="none"
                stroke={ok ? '#9fd27a' : '#e2614d'}
                strokeWidth={2.5}
              />
              <line
                x1={-17}
                x2={-6}
                y1={0}
                y2={0}
                stroke={ok ? '#9fd27a' : '#e2614d'}
                strokeWidth={2}
              />
              <line
                x1={6}
                x2={17}
                y1={0}
                y2={0}
                stroke={ok ? '#9fd27a' : '#e2614d'}
                strokeWidth={2}
              />
              <line
                y1={-17}
                y2={-6}
                x1={0}
                x2={0}
                stroke={ok ? '#9fd27a' : '#e2614d'}
                strokeWidth={2}
              />
              <line
                y1={6}
                y2={17}
                x1={0}
                x2={0}
                stroke={ok ? '#9fd27a' : '#e2614d'}
                strokeWidth={2}
              />
              {target.label && (
                <text
                  y={-20}
                  textAnchor="middle"
                  fontSize={13}
                  fill="#f1e3c6"
                  fontWeight={600}
                >
                  {target.label}
                </text>
              )}
            </g>
          </g>
        )}
      </svg>
      {info && (
        <p
          className={`mt-2 text-sm ${ok ? 'text-emerald-300' : 'text-red-300'}`}
        >
          {Math.round(info.distance)} m · {SIDE_LABELS[info.side]} · portée{' '}
          {info.band === 'hors' ? 'dépassée' : info.band}
          {' — '}
          {info.band === 'courte'
            ? 'tous les canons du côté peuvent tirer'
            : ok
              ? 'dans un couloir de tir'
              : info.band === 'hors'
                ? 'hors de vue'
                : 'hors des couloirs de tir'}
        </p>
      )}
    </div>
  );
}
