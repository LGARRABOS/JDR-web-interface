import { useMemo, useState } from 'react';
import { MARKER_KINDS } from '../../arpenteur/catalog';
import { travelEase, type TravelNow } from '../../arpenteur/travel';
import {
  CITIES,
  COAST,
  CROSSINGS,
  DESERTS,
  MOUNTAINS,
  REGIONS,
  ROUTES,
  nodeName,
  nodePosition,
} from '../../arpenteur/keld';
import type { Marker } from '../../arpenteur/types';

// Carte schématique des déserts de Keld : sous-régions, traversées, trajets
// ville ↔ désert, position de l'arpenteur, cap et sillage.

const STYLE = `
.arp-map .arp-route-anim{animation:arp-dash 1.2s linear infinite}
.arp-map .arp-pulse{animation:arp-pulse 2s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.arp-map .arp-reach{animation:arp-dash 1.6s linear infinite}
.arp-map .arp-float{animation:arp-float 3s ease-in-out infinite}
@keyframes arp-dash{to{stroke-dashoffset:-28}}
@keyframes arp-pulse{0%{transform:scale(.5);opacity:.9}100%{transform:scale(2.4);opacity:0}}
@keyframes arp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.arp-map *{animation:none!important}}
`;

function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d + ' Z';
}

function poly(pts: [number, number][]): string {
  return `M${pts.map((p) => p.join(',')).join(' L')} Z`;
}

function rand(seed: number) {
  const x = Math.sin(seed * 45.17 + 3.3) * 43758.5453;
  return x - Math.floor(x);
}

function between(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function KeldMap({
  current,
  destination,
  names,
  trail,
  markers,
  selected,
  reachable,
  onSelect,
  travel = null,
}: {
  current: string;
  destination: string;
  names: Record<string, string>;
  trail: { sector: string }[];
  markers: Marker[];
  selected: string | null;
  reachable: Set<string>;
  onSelect: (id: string) => void;
  /** Voyage en cours : le navire glisse le long du trajet. */
  travel?: TravelNow | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const peaks = useMemo(() => {
    const out: { x: number; y: number; s: number }[] = [];
    MOUNTAINS.forEach((z, zi) => {
      const n = Math.round((z.w * z.h) / 5200);
      for (let i = 0; i < n; i++)
        out.push({
          x: z.x + rand(zi * 100 + i) * z.w,
          y: z.y + rand(zi * 100 + i + 50) * z.h,
          s: 22 + rand(zi * 7 + i) * 22,
        });
    });
    return out.sort((a, b) => a.y - b.y);
  }, []);
  const from = travel ? nodePosition(travel.from) : null;
  const to = travel ? nodePosition(travel.to) : null;
  const k = travel ? travelEase(travel.p) : 1;
  const here =
    from && to
      ? { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
      : nodePosition(current);
  // Le petit navire regarde dans le sens de la marche.
  const facingLeft = !!(from && to && to.x < from.x);
  const there = destination ? nodePosition(destination) : null;
  const trailPts = trail
    .slice(-12)
    .map((t) => nodePosition(t.sector))
    .filter((p): p is { x: number; y: number } => !!p);

  const markersByNode = new Map<string, Marker[]>();
  for (const m of markers)
    if (m.sector)
      markersByNode.set(m.sector.toUpperCase(), [
        ...(markersByNode.get(m.sector.toUpperCase()) ?? []),
        m,
      ]);

  return (
    <svg
      viewBox="100 130 1920 1240"
      className="w-full h-auto arp-map select-none"
      role="img"
      aria-label="Carte des déserts de Keld"
    >
      <style>{STYLE}</style>
      <defs>
        <radialGradient id="arp-sea" cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#1b2230" />
          <stop offset="1" stopColor="#0d1017" />
        </radialGradient>
        <linearGradient id="arp-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2e22" />
          <stop offset="1" stopColor="#2a2119" />
        </linearGradient>
        <marker
          id="arp-arrow"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#efe2c4" />
        </marker>
        <filter id="arp-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={100} y={130} width={1920} height={1240} fill="url(#arp-sea)" />
      {Array.from({ length: 22 }, (_, i) => (
        <path
          key={i}
          d={`M${120 + rand(i) * 1800},${150 + rand(i + 9) * 1200} q14,-8 28,0 q14,8 28,0`}
          stroke="#3a4a63"
          strokeWidth={2}
          fill="none"
          opacity={0.5}
        />
      ))}
      <path
        d={smoothClosed(COAST)}
        fill="url(#arp-land)"
        stroke="#7a6248"
        strokeWidth={4}
      />
      <path
        d={smoothClosed(COAST)}
        fill="none"
        stroke="#c9b08a"
        strokeWidth={1}
        opacity={0.25}
        transform="translate(0,6)"
      />

      {peaks.map((p, i) => (
        <g key={i} opacity={0.75}>
          <path
            d={`M${p.x - p.s},${p.y + p.s * 0.6} L${p.x},${p.y - p.s * 0.8} L${p.x + p.s},${p.y + p.s * 0.6} Z`}
            fill="#4a3b2c"
            stroke="#6e5a44"
            strokeWidth={1.5}
          />
          <path
            d={`M${p.x},${p.y - p.s * 0.8} L${p.x + p.s},${p.y + p.s * 0.6} L${p.x + p.s * 0.2},${p.y + p.s * 0.6} Z`}
            fill="#2e251c"
          />
        </g>
      ))}

      {REGIONS.map((r) => {
        const color = DESERTS[r.desert].color;
        const active = selected === r.id;
        const hov = hover === r.id;
        const reach = reachable.has(r.id);
        return (
          <g
            key={r.id}
            onClick={() => onSelect(r.id)}
            onPointerEnter={() => setHover(r.id)}
            onPointerLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          >
            <path
              d={poly(r.points)}
              fill={color}
              fillOpacity={active ? 0.45 : hov ? 0.34 : 0.22}
              stroke={active ? '#fff3d6' : color}
              strokeWidth={active ? 4 : 2.5}
              strokeLinejoin="round"
            />
            {reach && (
              <path
                d={poly(r.points)}
                fill="none"
                stroke="#f0c869"
                strokeWidth={3}
                strokeDasharray="10 4"
                className="arp-reach"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}

      {CROSSINGS.map(([a, b]) => {
        const pa = nodePosition(a)!;
        const pb = nodePosition(b)!;
        const s = between(pa, pb, 0.32);
        const e = between(pa, pb, 0.68);
        return (
          <line
            key={`${a}${b}`}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            stroke="#efe2c4"
            strokeWidth={3}
            strokeDasharray="7 6"
            markerStart="url(#arp-arrow)"
            markerEnd="url(#arp-arrow)"
            opacity={0.75}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
      {ROUTES.map(([c, r]) => {
        const pc = nodePosition(c)!;
        const pr = nodePosition(r)!;
        const s = between(pc, pr, 0.14);
        const e = between(pc, pr, 0.62);
        return (
          <line
            key={`${c}${r}`}
            x1={s.x}
            y1={s.y}
            x2={e.x}
            y2={e.y}
            stroke="#d8c6a2"
            strokeWidth={2.5}
            strokeDasharray="2 7"
            strokeLinecap="round"
            markerEnd="url(#arp-arrow)"
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {trailPts.length > 1 && (
        <polyline
          points={trailPts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#f0c869"
          strokeWidth={4}
          strokeOpacity={0.35}
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {trailPts.slice(0, -1).map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={7}
          fill="#f0c869"
          opacity={0.25 + (i / trailPts.length) * 0.5}
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {REGIONS.map((r) => (
        <g key={`l${r.id}`} style={{ pointerEvents: 'none' }}>
          <text
            x={r.label.x}
            y={r.label.y}
            textAnchor="middle"
            fontSize={44}
            fontWeight={700}
            fill="#f6ead0"
            style={{
              fontFamily: 'Cinzel, serif',
              paintOrder: 'stroke',
              stroke: '#1b140e',
              strokeWidth: 6,
            }}
          >
            {r.id}
          </text>
          {names[r.id] && (
            <text
              x={r.label.x}
              y={r.label.y + 30}
              textAnchor="middle"
              fontSize={20}
              fill="#e6d4ad"
              style={{
                fontFamily: 'Cinzel, serif',
                paintOrder: 'stroke',
                stroke: '#1b140e',
                strokeWidth: 4,
              }}
            >
              {names[r.id]}
            </text>
          )}
        </g>
      ))}

      {CITIES.map((c) => {
        const active = selected === c.id;
        const reach = reachable.has(c.id);
        return (
          <g
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={c.x - 16}
              y={c.y - 16}
              width={32}
              height={32}
              fill="#efe2c4"
              stroke={active ? '#f0c869' : reach ? '#f0c869' : '#1b140e'}
              strokeWidth={active ? 5 : 3}
              rx={3}
            />
            {c.capital && (
              <rect
                x={c.x - 8}
                y={c.y - 8}
                width={16}
                height={16}
                fill="#1b140e"
              />
            )}
            <text
              x={c.x}
              y={c.y + 44}
              textAnchor="middle"
              fontSize={24}
              fill="#efe2c4"
              style={{
                fontFamily: 'Cinzel, serif',
                paintOrder: 'stroke',
                stroke: '#14100c',
                strokeWidth: 5,
              }}
            >
              {nodeName(c.id, names)}
            </text>
          </g>
        );
      })}

      {[...markersByNode.entries()].map(([node, list]) => {
        const p = nodePosition(node);
        if (!p) return null;
        return list.slice(0, 6).map((m, i) => {
          const a = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.55;
          const x = p.x + Math.cos(a) * 78;
          const y = p.y + Math.sin(a) * 78 - 20;
          const color =
            MARKER_KINDS.find((k) => k.id === m.kind)?.color ?? '#fff';
          return (
            <g
              key={m.id}
              style={{ pointerEvents: 'none' }}
              opacity={m.hidden ? 0.55 : 1}
            >
              <path
                d={`M${x},${y + 18} C${x - 14},${y} ${x - 12},${y - 16} ${x},${y - 16} C${x + 12},${y - 16} ${x + 14},${y} ${x},${y + 18} Z`}
                fill={color}
                stroke="#14100c"
                strokeWidth={2.5}
                strokeDasharray={m.hidden ? '4 3' : undefined}
              />
              <circle cx={x} cy={y - 3} r={5} fill="#14100c" />
            </g>
          );
        });
      })}

      {here && there && (
        <line
          x1={here.x}
          y1={here.y}
          x2={there.x}
          y2={there.y}
          stroke="#f0c869"
          strokeWidth={5}
          strokeDasharray="14 14"
          className="arp-route-anim"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {there && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={there.x}
            cy={there.y}
            r={26}
            fill="none"
            stroke="#f0c869"
            strokeWidth={4}
            className="arp-pulse"
          />
          <circle
            cx={there.x}
            cy={there.y}
            r={12}
            fill="none"
            stroke="#f0c869"
            strokeWidth={4}
          />
        </g>
      )}
      {from && to && travel && here && (
        <g style={{ pointerEvents: 'none' }}>
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#7ff3ff"
            strokeOpacity={0.35}
            strokeWidth={8}
            strokeLinecap="round"
          />
          <line
            x1={from.x}
            y1={from.y}
            x2={here.x}
            y2={here.y}
            stroke="#7ff3ff"
            strokeWidth={8}
            strokeLinecap="round"
          />
          <text
            x={here.x}
            y={here.y + 44}
            textAnchor="middle"
            fontSize={30}
            fontWeight={700}
            fill="#e8fbff"
            stroke="#0b1418"
            strokeWidth={6}
            paintOrder="stroke"
          >
            {`${travel.remaining} s`}
          </text>
        </g>
      )}
      {here && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={here.x}
            cy={here.y - 64}
            r={30}
            fill="#7ff3ff"
            opacity={0.45}
            className="arp-pulse"
          />
          <g className="arp-float" filter="url(#arp-glow)">
            <g
              transform={`translate(${here.x - 46},${here.y - 140}) scale(0.92)${facingLeft ? ' translate(100,0) scale(-1,1)' : ''}`}
            >
              {/* Petit arpenteur de profil */}
              <path
                d="M8,62 L4,40 L26,38 L30,24 L48,24 L56,40 L92,38 L100,46 L92,62 Q50,76 8,62 Z"
                fill="#8c5b34"
                stroke="#1b140e"
                strokeWidth={3}
              />
              <line
                x1={44}
                y1={38}
                x2={44}
                y2={0}
                stroke="#3b2a1d"
                strokeWidth={4}
              />
              <line
                x1={70}
                y1={40}
                x2={70}
                y2={8}
                stroke="#3b2a1d"
                strokeWidth={4}
              />
              <path
                d="M30,6 L58,6 L60,30 L28,30 Z"
                fill="#efe2c4"
                stroke="#5d4a36"
                strokeWidth={2}
              />
              <path
                d="M58,12 L82,12 L84,32 L56,32 Z"
                fill="#efe2c4"
                stroke="#5d4a36"
                strokeWidth={2}
              />
              <path d="M44,0 L30,4 L44,8 Z" fill="#c0392b" />
              <ellipse
                cx={30}
                cy={74}
                rx={8}
                ry={10}
                fill="#7ff3ff"
                opacity={0.85}
              />
              <ellipse
                cx={70}
                cy={74}
                rx={8}
                ry={10}
                fill="#7ff3ff"
                opacity={0.85}
              />
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}
