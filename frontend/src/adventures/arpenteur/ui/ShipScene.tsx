import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { installedGuns } from '../model/logic';
import { shipGeometry } from '../model/shipGeometry';
import type { ArpenteurDoc, Build } from '../model/types';
import { cutawayBounds, ShipCutaway, type CutawayTarget } from './ShipCutaway';
import { SHIP_STYLE, ShipProfile } from './ShipProfile';

// Scène animée : l'arpenteur glisse au-dessus des dunes. Le ciel et le sable
// prennent les teintes du désert où il se trouve (Mahibori bleu, Palubori
// rouge, Forabori violet).

export type DesertId = 'mahibori' | 'palubori' | 'forabori' | 'keld';

export function desertOf(sector: string): DesertId {
  switch (sector.trim().toUpperCase()[0]) {
    case 'M':
      return 'mahibori';
    case 'P':
      return 'palubori';
    case 'F':
      return 'forabori';
    default:
      return 'keld';
  }
}

const PALETTES: Record<
  DesertId,
  {
    sky: [string, string, string];
    sun: string;
    far: string;
    mid: string;
    near: string;
    nearDark: string;
    dust: string;
  }
> = {
  mahibori: {
    sky: ['#0d1c33', '#2f5878', '#e7c99c'],
    sun: '#fff1cf',
    far: '#4a5d75',
    mid: '#b99c78',
    near: '#d8bb8c',
    nearDark: '#b8966a',
    dust: '#e9d6b4',
  },
  palubori: {
    sky: ['#260d1c', '#8a3a2b', '#f3a85c'],
    sun: '#ffe2a6',
    far: '#6a2f2b',
    mid: '#b5643f',
    near: '#cf8352',
    nearDark: '#a95f36',
    dust: '#efc39a',
  },
  forabori: {
    sky: ['#160e2b', '#58397a', '#e9b2a2'],
    sun: '#ffe6dc',
    far: '#4a3560',
    mid: '#9a7088',
    near: '#b98e92',
    nearDark: '#93677a',
    dust: '#e6c9c9',
  },
  keld: {
    sky: ['#1b2140', '#6c5872', '#f1c78b'],
    sun: '#fff0c9',
    far: '#5c4d63',
    mid: '#c49a62',
    near: '#e0b97a',
    nearDark: '#bf9356',
    dust: '#f0dcb2',
  },
};

const W = 1600;
const H = 640;
const GROUND = 560;

/** Zoom et décalage de la coupe (unités de la scène). */
interface CutView {
  z: number;
  x: number;
  y: number;
}
const CUT_HOME: CutView = { z: 1, x: 0, y: 0 };
const CUT_MAX = 4;
/** Le plan ne sort pas du cadre : décalage limité selon le zoom. */
function clampCut(c: CutView): CutView {
  const lx = ((c.z - 1) * W) / 2;
  const ly = ((c.z - 1) * H) / 2;
  return {
    z: c.z,
    x: Math.min(lx, Math.max(-lx, c.x)),
    y: Math.min(ly, Math.max(-ly, c.y)),
  };
}
function toSvgOf(el: SVGSVGElement, cx: number, cy: number) {
  const m = el.getScreenCTM();
  return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : null;
}

const SCENE_STYLE = `
.arp-scene .arp-far{animation:arp-scroll 150s linear infinite}
.arp-scene .arp-mid{animation:arp-scroll 70s linear infinite}
.arp-scene .arp-near{animation:arp-scroll 26s linear infinite}
.arp-scene .arp-wind{animation:arp-wind 1.7s linear infinite}
.arp-scene .arp-dust{animation:arp-dust 2.8s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.arp-scene .arp-shadow{animation:arp-shadow 5.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.arp-scene .arp-twinkle{animation:arp-twinkle 3s ease-in-out infinite}
.arp-scene .arp-sunpulse{animation:arp-sunpulse 7s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.arp-scene .arp-bob{animation:arp-bob 5.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 60%}
.arp-scene .arp-fade{animation:arp-fadein .5s ease-out both}
@keyframes arp-scroll{from{transform:translateX(0)}to{transform:translateX(-${W}px)}}
@keyframes arp-wind{from{transform:translateX(0)}to{transform:translateX(-${W + 200}px)}}
@keyframes arp-dust{0%{transform:translate(0,0) scale(.35);opacity:.75}100%{transform:translate(-540px,-34px) scale(3.2);opacity:0}}
@keyframes arp-shadow{0%,100%{transform:scaleX(1);opacity:.42}50%{transform:scaleX(.93);opacity:.32}}
@keyframes arp-twinkle{0%,100%{opacity:.25}50%{opacity:.9}}
@keyframes arp-sunpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes arp-fadein{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.arp-scene *{animation:none!important}}
`;

function rand(seed: number) {
  const x = Math.sin(seed * 91.17 + 12.3) * 43758.5453;
  return x - Math.floor(x);
}

/** Dune périodique sur W (deux périodes pour un défilement sans couture). */
function dune(base: number, waves: [number, number, number][]): string {
  const pts: string[] = [];
  for (let x = 0; x <= W * 2; x += 16) {
    let y = base;
    for (const [k, a, ph] of waves)
      y -= a * Math.sin((2 * Math.PI * k * x) / W + ph);
    pts.push(`${pts.length ? 'L' : 'M'}${x},${Math.round(y * 10) / 10}`);
  }
  return `${pts.join(' ')} L${W * 2},${H} L0,${H} Z`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) =>
    Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Mesas lointaines : plateaux aux flancs abrupts et sommets irréguliers. */
function mesas(base: number): { body: string; strata: string } {
  const tops: [number, number, number][] = [
    [90, 300, 84],
    [470, 600, 52],
    [880, 1180, 112],
    [1330, 1450, 44],
  ];
  const pts: string[] = [`M0,${base}`];
  const strata: string[] = [];
  for (let rep = 0; rep < 2; rep++) {
    tops.forEach(([a, b, h], i) => {
      const o = rep * W;
      const seed = i * 13;
      pts.push(
        `L${a + o - 70},${base}`,
        `L${a + o - 38},${base - h * 0.45}`,
        `L${a + o - 22},${base - h * 0.62}`,
        `L${a + o - 4},${base - h}`
      );
      for (let x = a + 24; x < b; x += 26)
        pts.push(
          `L${x + o},${Math.round(base - h - (rand(seed + x) - 0.4) * 7)}`
        );
      pts.push(
        `L${b + o},${base - h + 2}`,
        `L${b + o + 18},${base - h * 0.7}`,
        `L${b + o + 30},${base - h * 0.5}`,
        `L${b + o + 64},${base}`
      );
      for (let k = 1; k <= 3; k++) {
        const y = base - h + (h * k) / 4;
        strata.push(
          `M${a + o - 30 + k * 6},${y} L${b + o + 20 - k * 4},${y + (rand(seed + k) - 0.5) * 4}`
        );
      }
    });
  }
  pts.push(`L${W * 2},${base}`, `L${W * 2},${H}`, `L0,${H} Z`);
  return { body: pts.join(' '), strata: strata.join(' ') };
}

export interface ShipSceneProps {
  doc: ArpenteurDoc;
  /** Construction affichée (celle du navire, ou un aperçu : atelier, évolution). */
  build: Build;
  view: 'profil' | 'coupe';
  animate?: boolean;
  scaffolding?: boolean;
  onRoom?: (target: CutawayTarget) => void;
  /** MJ : bascule jour / nuit (absent pour les joueurs). */
  onMood?: (mood: 'dusk' | 'night') => void;
  className?: string;
}

export function ShipScene({
  doc,
  build,
  view,
  animate = true,
  scaffolding = false,
  onRoom,
  className,
}: ShipSceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = PALETTES[desertOf(doc.map.sector)];
  const g = shipGeometry(build.allure, build.ponts);
  const damage =
    1 - doc.combat.constitution / Math.max(1, doc.combat.constitutionMax);
  const guns = installedGuns(doc.combat).installed;

  const layers = useMemo(
    () => ({
      far: mesas(GROUND - 108),
      haze: dune(GROUND - 84, [
        [3, 8, 1.1],
        [7, 4, 0.3],
      ]),
      mid: dune(GROUND - 52, [
        [2, 16, 0.4],
        [5, 7, 1.9],
        [9, 3, 0.2],
      ]),
      near: dune(GROUND + 4, [
        [1, 10, 2.2],
        [3, 9, 0.7],
        [7, 4, 1.3],
      ]),
      stars: Array.from(
        { length: 36 },
        (_, i) =>
          [
            rand(i) * W,
            rand(i + 50) * 210,
            0.6 + rand(i + 99) * 1.3,
            rand(i + 7) * 3,
          ] as const
      ),
      wind: Array.from(
        { length: 14 },
        (_, i) =>
          [
            W + rand(i + 3) * 300,
            300 + rand(i + 20) * 280,
            40 + rand(i + 40) * 90,
            rand(i + 60) * 1.7,
          ] as const
      ),
    }),
    []
  );

  // Profil : le navire tient dans la scène, au-dessus du sol ; coupe : on zoome sur la coque.
  const profileScale = Math.min(0.95, 525 / (380 + g.bounds.maxY));
  const hover = 70;
  const ptx = W / 2 - 500 * profileScale;
  const pty = GROUND - hover - g.bounds.maxY * profileScale;
  const cb = useMemo(() => cutawayBounds(build), [build]);
  const cutH = cb.maxY - cb.minY;
  // La coupe tient dans une bande centrale : visible même quand la scène est rognée.
  const cutScale = Math.min(1.55, 1200 / (cb.maxX - cb.minX), 420 / cutH);
  const ctx = W / 2 + 60 - ((cb.minX + cb.maxX) / 2) * cutScale;
  const cty = H / 2 - ((cb.minY + cb.maxY) / 2) * cutScale + 6;

  // Poussière soulevée par les propulseurs (au sol, sous chaque tuyère).
  const dust = g.props.map((pr) => ptx + pr.cx * profileScale);

  // Coupe : zoom (molette, pincement, boutons) et déplacement (glisser),
  // pour lire les noms des salles. Un glissé n'ouvre pas la salle survolée.
  const svgRef = useRef<SVGSVGElement>(null);
  const [cut, setCut] = useState<CutView>(CUT_HOME);
  const coupe = view === 'coupe';
  useEffect(() => setCut(CUT_HOME), [coupe]);
  const toSvg = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : null;
  };
  const zoomAt = (px: number, py: number, f: number) =>
    setCut((c) => {
      const z = Math.min(CUT_MAX, Math.max(1, c.z * f));
      const qx = (px - W / 2 - c.x) / c.z + W / 2;
      const qy = (py - H / 2 - c.y) / c.z + H / 2;
      return clampCut({
        z,
        x: px - W / 2 - (qx - W / 2) * z,
        y: py - H / 2 - (qy - H / 2) * z,
      });
    });
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const el = svgRef.current;
    if (!coupe || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvgOf(el, e.clientX, e.clientY);
      if (p) zoomRef.current(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [coupe]);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: false, d: 0 });
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!coupe) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) drag.current = { moved: false, d: 0 };
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      drag.current.d = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!coupe || !prev) return;
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const p = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (p && drag.current.d > 0) zoomAt(p.x, p.y, d / drag.current.d);
      drag.current.d = d;
      drag.current.moved = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < 2) return;
    if (!drag.current.moved) svgRef.current?.setPointerCapture(e.pointerId);
    drag.current.moved = true;
    setCut((c) => clampCut({ ...c, x: c.x + dx / m.a, y: c.y + dy / m.d }));
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    ptrs.current.delete(e.pointerId);
  };

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={coupe ? 'absolute inset-0 w-full h-full' : className}
      role="img"
      aria-label={`Arpenteur ${doc.name}`}
      style={
        coupe
          ? {
              touchAction: cut.z > 1 ? 'none' : 'pan-y',
              cursor: cut.z > 1 ? 'grab' : undefined,
            }
          : undefined
      }
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.stopPropagation();
          drag.current.moved = false;
        }
      }}
    >
      <style>{SCENE_STYLE + SHIP_STYLE}</style>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.55" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <radialGradient id={`${uid}-sun`}>
          <stop offset="0" stopColor={p.sun} stopOpacity="1" />
          <stop offset="0.18" stopColor={p.sun} stopOpacity="0.95" />
          <stop offset="0.4" stopColor={p.sky[2]} stopOpacity="0.35" />
          <stop offset="1" stopColor={p.sky[2]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.near} />
          <stop offset="1" stopColor={p.nearDark} />
        </linearGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="45%" r="75%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={`${uid}-dust`}>
          <stop offset="0" stopColor={p.dust} stopOpacity="0.55" />
          <stop offset="0.6" stopColor={p.dust} stopOpacity="0.22" />
          <stop offset="1" stopColor={p.dust} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-shadow`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className={animate ? 'arp-scene' : undefined}>
        <rect width={W} height={H} fill={`url(#${uid}-sky)`} />
        {layers.stars.map(([x, y, r, d], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#fff"
            className="arp-twinkle"
            style={{ animationDelay: `${-d}s` }}
            opacity={0.5}
          />
        ))}
        <circle
          cx={1180}
          cy={GROUND - 150}
          r={260}
          fill={`url(#${uid}-sun)`}
          className="arp-sunpulse"
        />
        <g className="arp-far">
          <path d={layers.far.body} fill={mix(p.far, p.sky[2], 0.3)} />
          <path
            d={layers.far.strata}
            stroke={mix(p.far, p.sky[2], 0.55)}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
          />
        </g>
        <g className="arp-far" style={{ animationDuration: '110s' }}>
          <path
            d={layers.haze}
            fill={mix(p.mid, p.sky[2], 0.45)}
            opacity={0.9}
          />
        </g>
        <g className="arp-mid">
          <path d={layers.mid} fill={p.mid} />
        </g>
        <g className="arp-near">
          <path d={layers.near} fill={`url(#${uid}-near)`} />
          {Array.from({ length: 24 }, (_, i) => (
            <path
              key={i}
              d={`M${(i * W) / 12 + 30},${GROUND + 40 + (i % 3) * 18} q40,-8 80,0`}
              stroke={p.nearDark}
              strokeWidth={2}
              fill="none"
              opacity={0.5}
            />
          ))}
        </g>

        {view === 'profil' ? (
          <g key="profil" className="arp-fade">
            <ellipse
              cx={W / 2}
              cy={GROUND + 6}
              rx={420 * profileScale}
              ry={26}
              fill={`url(#${uid}-shadow)`}
              className="arp-shadow"
            />
            {animate &&
              dust.map((x, i) =>
                [0, 1, 2].map((k) => (
                  <circle
                    key={`${i}-${k}`}
                    cx={x}
                    cy={GROUND - 4}
                    r={22}
                    fill={`url(#${uid}-dust)`}
                    className="arp-dust"
                    style={{ animationDelay: `${-(k * 0.93 + i * 0.37)}s` }}
                  />
                ))
              )}
            <g transform={`translate(${ptx},${pty}) scale(${profileScale})`}>
              <g className="arp-bob">
                <ShipProfile
                  build={build}
                  animate={animate}
                  guns={guns}
                  crew={doc.crew.members.length}
                  damage={damage}
                  salvoKey={doc.combat.lastSalvo?.id ?? null}
                  scaffolding={scaffolding}
                />
              </g>
            </g>
          </g>
        ) : (
          <g key="coupe" className="arp-fade">
            <rect width={W} height={H} fill="#0b0705" opacity={0.55} />
            <g
              transform={`translate(${W / 2 + cut.x},${H / 2 + cut.y}) scale(${cut.z}) translate(${-W / 2},${-H / 2})`}
            >
              <g transform={`translate(${ctx},${cty}) scale(${cutScale})`}>
                <ShipCutaway doc={doc} build={build} onRoom={onRoom} />
              </g>
            </g>
          </g>
        )}

        {view === 'profil' &&
          layers.wind.map(([x, y, len, d], i) => (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x + len}
              y2={y}
              stroke="#fff"
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeLinecap="round"
              className="arp-wind"
              style={{ animationDelay: `${-d}s` }}
            />
          ))}
        <rect
          width={W}
          height={H}
          fill={`url(#${uid}-vignette)`}
          style={{ pointerEvents: 'none' }}
        />
      </g>
    </svg>
  );
  if (!coupe) return svg;
  const btn =
    'h-8 w-8 rounded-full text-[#cdb68c] hover:bg-white/10 font-heading text-base leading-none flex items-center justify-center';
  const center = (f: number) => zoomAt(W / 2, H / 2, f);
  return (
    <div className={className}>
      {svg}
      <div className="absolute top-14 right-3 sm:top-16 sm:right-5 arp-lever rounded-full p-1 flex flex-col gap-0.5">
        <button
          type="button"
          className={btn}
          onClick={() => center(1.35)}
          title="Zoomer"
          aria-label="Zoomer sur la coupe"
        >
          +
        </button>
        <button
          type="button"
          className={`${btn} ${cut.z > 1 ? '' : 'opacity-50'}`}
          onClick={() => center(1 / 1.35)}
          disabled={cut.z <= 1}
          title="Dézoomer"
          aria-label="Dézoomer la coupe"
        >
          −
        </button>
        <button
          type="button"
          className={`${btn} ${cut.z > 1 ? 'arp-lever-on' : 'opacity-50'}`}
          onClick={() => setCut(CUT_HOME)}
          disabled={cut.z <= 1}
          title="Vue d'ensemble"
          aria-label="Revenir à la vue d'ensemble de la coupe"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
