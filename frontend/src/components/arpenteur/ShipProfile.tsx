import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { MATERIALS, PROW_MATERIALS } from '../../arpenteur/catalog';
import {
  mastHeight,
  mastPositions,
  shipGeometry,
  type PropShape,
  type ShipGeometry,
} from '../../arpenteur/shipGeometry';
import type { Build, Material } from '../../arpenteur/types';

// L'arpenteur vu de profil, dessiné à partir de sa construction : allure,
// matériaux, mâts, ponts, poupe, proue, décorations et tenue de l'équipage.
// Repère : pont principal à y = 0, poupe à gauche, proue à droite.

export interface ShipProfileProps {
  build: Build;
  /** Animations (voiles, drapeau, propulseurs, équipage). */
  animate?: boolean;
  /** Canons installés (fûts visibles aux sabords). */
  guns?: number;
  /** Silhouettes d'équipage sur le pont. */
  crew?: number;
  /** Dégâts de 0 (intact) à 1 (épave). */
  damage?: number;
  /** Change à chaque salve : rejoue l'animation de tir. */
  salvoKey?: number | null;
  /** Travaux en cours : échafaudages. */
  scaffolding?: boolean;
  /** Voiles estompées (vue en coupe). */
  ghost?: boolean;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Pseudo-aléatoire stable (mêmes rivets, mêmes planches à chaque rendu). */
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      )
    );
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const SHIP_STYLE = `
.arp-anim .arp-bob{animation:arp-bob 5.2s ease-in-out infinite;transform-box:view-box;transform-origin:500px 60px}
.arp-anim .arp-sail{animation:arp-billow 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 0%}
.arp-anim .arp-sail.r{transform-origin:100% 0%}
.arp-anim .arp-flame{animation:arp-flame .18s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}
.arp-anim .arp-flame.slow{animation-duration:.27s}
.arp-anim .arp-glow{animation:arp-glow 2.6s ease-in-out infinite}
.arp-anim .arp-crew{animation:arp-crew 1.9s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.arp-anim .arp-smoke{animation:arp-smoke 3.6s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
.arp-anim .arp-fire{animation:arp-fire .35s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
.arp-anim .arp-hook{animation:arp-hook 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0%}
.arp-anim .arp-blink{animation:arp-blink 1.2s steps(2) infinite}
.arp-recoil{animation:arp-recoil .5s ease-out 1}
.arp-flash{animation:arp-flash .6s ease-out 1 both;transform-box:fill-box;transform-origin:0% 50%}
.arp-puff{animation:arp-puff 2.2s ease-out 1 both;transform-box:fill-box;transform-origin:50% 50%}
@keyframes arp-bob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-7px) rotate(-.6deg)}}
@keyframes arp-billow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(1.035)}}
@keyframes arp-flame{from{transform:scaleY(.82);opacity:.85}to{transform:scaleY(1.12);opacity:1}}
@keyframes arp-glow{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes arp-crew{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes arp-smoke{0%{transform:translate(0,0) scale(.4);opacity:0}15%{opacity:.7}100%{transform:translate(-70px,-120px) scale(2.4);opacity:0}}
@keyframes arp-fire{from{transform:scaleY(.8)}to{transform:scaleY(1.15)}}
@keyframes arp-hook{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes arp-blink{0%{opacity:1}100%{opacity:.2}}
@keyframes arp-recoil{0%{transform:translateX(0)}20%{transform:translateX(-9px)}100%{transform:translateX(0)}}
@keyframes arp-flash{0%{transform:scale(.2);opacity:1}40%{transform:scale(1.3);opacity:1}100%{transform:scale(1.6);opacity:0}}
@keyframes arp-puff{0%{transform:translate(0,0) scale(.3);opacity:.9}100%{transform:translate(-60px,-36px) scale(3);opacity:0}}
@media (prefers-reduced-motion:reduce){.arp-anim *{animation:none!important}}
`;

export function ShipProfile({
  build,
  animate = true,
  guns = 0,
  crew = 0,
  damage = 0,
  salvoKey = null,
  scaffolding = false,
  ghost = false,
}: ShipProfileProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = shipGeometry(build.allure, build.ponts);
  const coque = MATERIALS[build.coque.material];
  const poupe = MATERIALS[build.poupe.material];
  const ids = {
    clip: `${uid}-clip`,
    sternClip: `${uid}-stern`,
    shade: `${uid}-shade`,
    sheen: `${uid}-sheen`,
    sail: `${uid}-sail`,
    flame: `${uid}-flame`,
    nacelle: `${uid}-nacelle`,
    gold: `${uid}-gold`,
  };

  // Salve : on rejoue l'animation quand la clé change (pas au premier rendu).
  const [firing, setFiring] = useState<number | null>(null);
  const firstKey = useRef(salvoKey);
  useEffect(() => {
    if (salvoKey == null || salvoKey === firstKey.current) return;
    firstKey.current = salvoKey;
    setFiring(salvoKey);
    const t = setTimeout(() => setFiring(null), 2400);
    return () => clearTimeout(t);
  }, [salvoKey]);

  const masts = mastPositions(g, build.mats.type);

  return (
    <g className={animate ? 'arp-anim' : undefined}>
      <defs>
        <clipPath id={ids.clip}>
          <path d={g.outline} />
        </clipPath>
        <clipPath id={ids.sternClip}>
          <rect
            x={g.bounds.minX - 10}
            y={g.bounds.minY - 10}
            width={g.sternEnd - g.bounds.minX + 10}
            height={-g.bounds.minY + 12}
          />
        </clipPath>
        <linearGradient id={ids.shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.sail} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(build.mats.sailColor, -0.22)} />
          <stop offset="0.45" stopColor={build.mats.sailColor} />
          <stop offset="1" stopColor={shade(build.mats.sailColor, -0.12)} />
        </linearGradient>
        <linearGradient id={ids.flame} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9ffff" />
          <stop offset="0.25" stopColor="#6ff2ff" />
          <stop offset="0.7" stopColor="#1fb3c9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0e7f99" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.nacelle} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2b2420" />
          <stop offset="0.4" stopColor="#6b5a46" />
          <stop offset="1" stopColor="#241d18" />
        </linearGradient>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc86" />
          <stop offset="0.5" stopColor="#d6a440" />
          <stop offset="1" stopColor="#8c5c1c" />
        </linearGradient>
      </defs>

      <g
        className={firing != null ? 'arp-recoil' : undefined}
        key={firing ?? 'still'}
      >
        <Rigging g={g} masts={masts} build={build} ghost={ghost} />
        <Masts
          g={g}
          masts={masts}
          build={build}
          sailFill={`url(#${ids.sail})`}
          ghost={ghost}
          animate={animate}
        />
        {g.props.map((p, i) => (
          <Exhaust key={`ex${i}`} p={p} fill={`url(#${ids.flame})`} i={i} />
        ))}

        {/* Coque */}
        <path d={g.outline} fill={coque.base} />
        <g clipPath={`url(#${ids.clip})`}>
          <Texture g={g} material={build.coque.material} seed={1} />
          <g clipPath={`url(#${ids.sternClip})`}>
            <rect
              x={g.bounds.minX}
              y={g.bounds.minY}
              width={g.sternEnd - g.bounds.minX}
              height={-g.bounds.minY + 4}
              fill={poupe.base}
            />
            <Texture g={g} material={build.poupe.material} seed={7} />
          </g>
          <rect
            x={g.bounds.minX}
            y={-3}
            width={g.bounds.maxX - g.bounds.minX}
            height={4}
            fill={shade(coque.dark, -0.3)}
            opacity={0.7}
          />
          {build.deco.bands.map((c, i) => (
            <rect
              key={`band${i}`}
              x={g.bounds.minX}
              y={12 + i * 11}
              width={g.bounds.maxX - g.bounds.minX}
              height={7}
              fill={c}
              opacity={0.92}
            />
          ))}
          {build.coque.type === 'renforcee' && (
            <rect
              x={g.bounds.minX}
              y={g.depth * 0.62}
              width={g.bounds.maxX - g.bounds.minX}
              height={5}
              fill="#2a2d31"
              opacity={0.85}
            />
          )}
          {g.armor && (
            <rect
              x={g.armor.x - 6}
              y={g.armor.y1}
              width={12}
              height={g.armor.y2 - g.armor.y1}
              fill="#3a3f45"
              stroke="#1d2024"
              strokeWidth={1.5}
            />
          )}
          {(coque.metal || build.coque.type === 'renforcee') && (
            <rect
              x={g.bounds.minX}
              y={g.bounds.minY}
              width={g.bounds.maxX - g.bounds.minX}
              height={g.depth - g.bounds.minY}
              fill={`url(#${ids.sheen})`}
            />
          )}
          <GunStrips g={g} guns={guns} trim={build.deco.trim} />
          <SternWindows g={g} build={build} />
          <rect
            x={g.bounds.minX}
            y={g.bounds.minY}
            width={g.bounds.maxX - g.bounds.minX}
            height={g.depth - g.bounds.minY}
            fill={`url(#${ids.shade})`}
          />
          <Damage g={g} damage={damage} />
        </g>
        <path
          d={g.outline}
          fill="none"
          stroke={shade(coque.dark, -0.35)}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <Keel g={g} build={build} />
        <Rail g={g} trim={build.deco.trim} />
        <Rudder g={g} build={build} />
        <Figurehead g={g} build={build} gold={`url(#${ids.gold})`} />
        {g.props.map((p, i) => (
          <Nacelle
            key={`pr${i}`}
            p={p}
            fill={`url(#${ids.nacelle})`}
            trim={build.deco.trim}
          />
        ))}
        <Lights g={g} build={build} />
        <Crew g={g} masts={masts} count={crew} build={build} />
        <Smoke g={g} damage={damage} />
        {scaffolding && <Scaffold g={g} />}
        {firing != null && <Salvo g={g} />}
      </g>
    </g>
  );
}

// --- Gréement -------------------------------------------------------------------

function Rigging({
  g,
  masts,
  build,
  ghost,
}: {
  g: ShipGeometry;
  masts: number[];
  build: Build;
  ghost: boolean;
}) {
  const lines: [number, number, number, number][] = [];
  masts.forEach((x, i) => {
    const h = mastHeight(i, masts.length, build.mats.type);
    const rake = build.mats.type === 'pique' ? h * 0.2 : 0;
    const tx = x - rake;
    const ty = -h;
    if (i === 0) lines.push([tx, ty, g.stern.x + 20, g.topAt(g.stern.x + 20)]);
    if (i === masts.length - 1) lines.push([tx, ty, g.bow.x - 6, g.bow.y]);
    if (i < masts.length - 1) {
      const nx = masts[i + 1];
      lines.push([tx, ty, nx, g.topAt(nx) - 40]);
    }
    for (const dx of [-36, -20, 20, 36])
      lines.push([tx + rake * 0.4, ty * 0.62, x + dx, g.topAt(x + dx)]);
  });
  return (
    <g stroke="#1a130e" strokeWidth={0.8} opacity={ghost ? 0.25 : 0.55}>
      {lines.map(([a, b, c, d], i) => (
        <line key={i} x1={f(a)} y1={f(b)} x2={f(c)} y2={f(d)} />
      ))}
    </g>
  );
}

function Masts({
  g,
  masts,
  build,
  sailFill,
  ghost,
  animate,
}: {
  g: ShipGeometry;
  masts: number[];
  build: Build;
  sailFill: string;
  ghost: boolean;
  animate: boolean;
}) {
  const pique = build.mats.type === 'pique';
  const mainIndex = masts.length === 3 ? 1 : 0;
  // Largeur des voiles : elles ne doivent pas se chevaucher d'un mât à l'autre.
  let gap = 220;
  for (let i = 1; i < masts.length; i++)
    gap = Math.min(gap, masts[i] - masts[i - 1]);
  const sailScale = Math.min(1, (gap * 0.94) / 146);
  return (
    <g>
      {masts.map((x, i) => {
        const h = mastHeight(i, masts.length, build.mats.type);
        const base = Math.min(0, g.topAt(x)) + 6;
        const delay = `${-i * 0.7}s`;
        if (pique) {
          const rake = h * 0.2;
          const top: [number, number] = [x - rake, -h];
          const sail = `M${f(top[0] + 4)},${f(top[1] + 14)} L${f(x + 118)},-36 Q${f(x + 50)},-22 ${f(x + 2)},-30 Z`;
          return (
            <g key={i}>
              <line
                x1={x}
                y1={base}
                x2={top[0]}
                y2={top[1]}
                stroke="#3b2a1d"
                strokeWidth={7}
                strokeLinecap="round"
              />
              <path
                d={`M${f(top[0] - 3)},${f(top[1])} l3,-16 l3,16 Z`}
                fill="#c9c2b4"
              />
              <g
                className={animate ? 'arp-sail' : undefined}
                style={{ animationDelay: delay }}
              >
                <path
                  d={sail}
                  fill={sailFill}
                  stroke="#5d4a36"
                  strokeWidth={1.2}
                  opacity={ghost ? 0.18 : 0.96}
                />
                {!ghost && (
                  <path
                    d={`M${f(top[0] + 30)},${f(top[1] + 60)} L${f(x + 90)},-40`}
                    stroke="#000"
                    strokeOpacity={0.12}
                    strokeWidth={2}
                  />
                )}
              </g>
              {i === mainIndex && (
                <Flag x={top[0]} y={top[1] - 16} build={build} />
              )}
            </g>
          );
        }
        // Voiles carrées étagées : basse voile, hunier, perroquet.
        const tiers = [
          { y1: -h * 0.24, y2: -h * 0.5, w1: 132, w2: 146 },
          { y1: -h * 0.53, y2: -h * 0.74, w1: 104, w2: 120 },
          { y1: -h * 0.77, y2: -h * 0.92, w1: 72, w2: 88 },
        ];
        const scale = (i === mainIndex ? 1 : 0.86) * sailScale;
        return (
          <g key={i}>
            <rect
              x={x - 4.5}
              y={-h}
              width={9}
              height={h + base}
              fill="#4a3424"
            />
            <rect
              x={x - 1.5}
              y={-h}
              width={3}
              height={h + base}
              fill="#6e5038"
            />
            {tiers.map((t, ti) => {
              const w1 = t.w1 * scale;
              const w2 = t.w2 * scale;
              const d = `M${f(x - w1 / 2)},${f(t.y1)} L${f(x + w1 / 2)},${f(t.y1)} L${f(x + w2 / 2)},${f(t.y2)} Q${f(x)},${f(t.y2 + 10)} ${f(x - w2 / 2)},${f(t.y2)} Z`;
              return (
                <g key={ti}>
                  <line
                    x1={f(x - w1 / 2 - 8)}
                    y1={f(t.y1)}
                    x2={f(x + w1 / 2 + 8)}
                    y2={f(t.y1)}
                    stroke="#3b2a1d"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                  <g
                    className={animate ? 'arp-sail' : undefined}
                    style={{
                      animationDelay: `${-i * 0.7 - ti * 0.35}s`,
                      transformOrigin: '50% 0%',
                    }}
                  >
                    <path
                      d={d}
                      fill={sailFill}
                      stroke="#5d4a36"
                      strokeWidth={1.1}
                      opacity={ghost ? 0.16 : 0.97}
                    />
                    {!ghost &&
                      [0.25, 0.5, 0.75].map((r) => (
                        <line
                          key={r}
                          x1={f(x - w1 / 2 + w1 * r)}
                          y1={f(t.y1)}
                          x2={f(x - w2 / 2 + w2 * r)}
                          y2={f(t.y2 + (r === 0.5 ? 9 : 6))}
                          stroke="#000"
                          strokeOpacity={0.08}
                          strokeWidth={1.2}
                        />
                      ))}
                  </g>
                </g>
              );
            })}
            {i === mainIndex && (
              <>
                {/* Vigie */}
                <path
                  d={`M${x - 15},${f(-h * 0.76)} h30 l-4,14 h-22 Z`}
                  fill="#5b412c"
                  stroke="#2a1d13"
                  strokeWidth={1.2}
                />
                <Flag x={x} y={-h - 4} build={build} />
              </>
            )}
            {i !== mainIndex && (
              <path
                d={`M${x},${-h - 2} l26,5 l-26,5 Z`}
                fill={build.mats.flagColor}
                opacity={0.9}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Flag({ x, y, build }: { x: number; y: number; build: Build }) {
  const c = build.mats.flagColor;
  const w = 56;
  const h = 32;
  // Le drapeau flotte vers l'arrière (gauche) : le navire file vers la droite.
  const a = `M${x},${y} C${x - w * 0.3},${y - 6} ${x - w * 0.6},${y + 6} ${x - w},${y} L${x - w},${y + h} C${x - w * 0.6},${y + h + 6} ${x - w * 0.3},${y + h - 6} ${x},${y + h} Z`;
  const b = `M${x},${y} C${x - w * 0.3},${y + 6} ${x - w * 0.6},${y - 6} ${x - w},${y + 3} L${x - w},${y + h + 3} C${x - w * 0.6},${y + h - 6} ${x - w * 0.3},${y + h + 6} ${x},${y + h} Z`;
  return (
    <g>
      <line
        x1={x}
        y1={y - 10}
        x2={x}
        y2={y + h + 6}
        stroke="#3b2a1d"
        strokeWidth={3}
      />
      <path d={a} fill={c} stroke={shade(c, -0.4)} strokeWidth={1}>
        <animate
          attributeName="d"
          values={`${a};${b};${a}`}
          dur="1.6s"
          repeatCount="indefinite"
        />
      </path>
      <Emblem
        kind={build.mats.flagEmblem}
        x={x - w / 2}
        y={y + h / 2}
        color={shade(c, 0.75)}
      />
    </g>
  );
}

function Emblem({
  kind,
  x,
  y,
  color,
}: {
  kind: Build['mats']['flagEmblem'];
  x: number;
  y: number;
  color: string;
}) {
  switch (kind) {
    case 'soleil':
      return (
        <g fill={color}>
          <circle cx={x} cy={y} r={5} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={x + Math.cos(a) * 7}
                y1={y + Math.sin(a) * 7}
                x2={x + Math.cos(a) * 10}
                y2={y + Math.sin(a) * 10}
                stroke={color}
                strokeWidth={1.6}
              />
            );
          })}
        </g>
      );
    case 'crane':
      return (
        <g fill={color}>
          <circle cx={x} cy={y - 1.5} r={6} />
          <rect x={x - 3.5} y={y + 2} width={7} height={5} rx={1} />
          <circle cx={x - 2.2} cy={y - 2} r={1.6} fill="#000" opacity={0.6} />
          <circle cx={x + 2.2} cy={y - 2} r={1.6} fill="#000" opacity={0.6} />
        </g>
      );
    case 'etoile':
      return (
        <path
          fill={color}
          d={
            Array.from({ length: 10 }, (_, i) => {
              const r = i % 2 ? 4 : 9;
              const a = -Math.PI / 2 + (i * Math.PI) / 5;
              return `${i ? 'L' : 'M'}${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`;
            }).join(' ') + ' Z'
          }
        />
      );
    case 'croissant':
      return (
        <path
          fill={color}
          d={`M${x + 3},${y - 8} A8,8 0 1 0 ${x + 3},${y + 8} A6,6 0 1 1 ${x + 3},${y - 8} Z`}
        />
      );
    case 'griffes':
      return (
        <g stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
          {[-5, 0, 5].map((d) => (
            <path key={d} d={`M${x + d - 2},${y - 8} q5,8 -1,16`} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

// --- Coque ----------------------------------------------------------------------

function Texture({
  g,
  material,
  seed,
}: {
  g: ShipGeometry;
  material: Material;
  seed: number;
}) {
  const m = MATERIALS[material];
  const { minX, maxX, minY } = g.bounds;
  const x0 = minX;
  const top = minY;
  const els: ReactElement[] = [];
  if (m.metal) {
    // Plaques rivetées.
    let i = 0;
    for (let y = top; y < g.depth; y += 24) {
      const off = (Math.floor((y - top) / 24) % 2) * 26;
      for (let x = x0 - off; x < maxX; x += 52) {
        els.push(
          <rect
            key={`p${i++}`}
            x={f(x)}
            y={f(y)}
            width={52}
            height={24}
            fill="none"
            stroke={m.dark}
            strokeWidth={1.1}
            opacity={0.75}
          />
        );
        els.push(
          <circle
            key={`r${i++}`}
            cx={f(x + 4)}
            cy={f(y + 4)}
            r={1.3}
            fill={m.line}
            opacity={0.8}
          />
        );
        els.push(
          <circle
            key={`r${i++}`}
            cx={f(x + 48)}
            cy={f(y + 4)}
            r={1.3}
            fill={m.line}
            opacity={0.8}
          />
        );
      }
    }
    if (m.patina) {
      for (let k = 0; k < 14; k++) {
        const x = x0 + rand(seed * 31 + k) * (maxX - x0);
        const len = 20 + rand(seed * 17 + k) * 60;
        els.push(
          <path
            key={`pa${k}`}
            d={`M${f(x)},${f(top + rand(k) * 20)} q4,${f(len / 2)} -2,${f(len)}`}
            stroke={m.patina}
            strokeWidth={5 + rand(k + 3) * 6}
            strokeLinecap="round"
            fill="none"
            opacity={0.42}
          />
        );
      }
    }
  } else {
    // Bordages : lignes horizontales et joints décalés.
    let i = 0;
    for (let y = top + 5; y < g.depth; y += 9) {
      els.push(
        <line
          key={`l${i++}`}
          x1={f(x0)}
          y1={f(y)}
          x2={f(maxX)}
          y2={f(y)}
          stroke={m.dark}
          strokeWidth={1}
          opacity={0.55}
        />
      );
      const n = Math.floor((maxX - x0) / 70);
      for (let k = 0; k < n; k++) {
        const x = x0 + k * 70 + rand(seed + y * 7 + k) * 60;
        els.push(
          <line
            key={`j${i++}`}
            x1={f(x)}
            y1={f(y)}
            x2={f(x)}
            y2={f(y + 9)}
            stroke={m.dark}
            strokeWidth={0.8}
            opacity={0.4}
          />
        );
      }
    }
    if (material === 'boisfer') {
      for (let x = x0 + 40; x < maxX; x += 78) {
        els.push(
          <rect
            key={`b${i++}`}
            x={f(x)}
            y={f(top)}
            width={6}
            height={f(g.depth - top)}
            fill={m.line}
            opacity={0.85}
          />
        );
        for (let y = top + 10; y < g.depth; y += 22)
          els.push(
            <circle
              key={`br${i++}`}
              cx={f(x + 3)}
              cy={f(y)}
              r={1.3}
              fill="#33373c"
            />
          );
      }
    }
  }
  return <g>{els}</g>;
}

function GunStrips({
  g,
  guns,
  trim,
}: {
  g: ShipGeometry;
  guns: number;
  trim: string;
}) {
  let remaining = guns;
  return (
    <g>
      {g.strips.map((r, i) => {
        const n = Math.max(1, Math.floor(r.w / 24));
        const step = r.w / n;
        return (
          <g key={i}>
            <rect
              x={f(r.x)}
              y={f(r.y)}
              width={f(r.w)}
              height={f(r.h)}
              rx={2}
              fill="#1b130e"
              opacity={0.55}
            />
            <rect
              x={f(r.x)}
              y={f(r.y)}
              width={f(r.w)}
              height={f(r.h)}
              rx={2}
              fill="none"
              stroke={trim}
              strokeWidth={1.2}
              opacity={0.75}
            />
            {Array.from({ length: n }, (_, k) => {
              const cx = r.x + step * (k + 0.5);
              const size = Math.min(r.h - 4, 11);
              const armed = remaining > 0;
              if (armed) remaining--;
              return (
                <g key={k}>
                  <rect
                    x={f(cx - size / 2)}
                    y={f(r.y + (r.h - size) / 2)}
                    width={f(size)}
                    height={f(size)}
                    fill={armed ? '#0c0806' : '#2b1f17'}
                    stroke="#000"
                    strokeOpacity={0.5}
                    strokeWidth={0.8}
                  />
                  {armed && (
                    <rect
                      x={f(cx - 2)}
                      y={f(r.y + r.h / 2 - 2.5)}
                      width={9}
                      height={5}
                      rx={1.5}
                      fill="#2e3236"
                      stroke="#111"
                      strokeWidth={0.6}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function SternWindows({ g, build }: { g: ShipGeometry; build: Build }) {
  const lit: Record<string, string> = {
    lanternes: '#ffcf70',
    aether: '#8ff3ff',
    braseros: '#ff9a4a',
    aucun: '#3a2c20',
  };
  const color = lit[build.poupe.luminaires];
  const out: ReactElement[] = [];
  for (let x = g.bounds.minX + 22; x < g.sternEnd - 24; x += 24) {
    const top = g.topAt(x);
    if (top > -44) continue;
    const y = top + Math.min(34, -top * 0.38);
    out.push(
      <g key={x}>
        <rect
          x={f(x - 5)}
          y={f(y)}
          width={10}
          height={14}
          rx={4}
          fill={color}
          className={
            build.poupe.luminaires !== 'aucun' ? 'arp-glow' : undefined
          }
          style={{ animationDelay: `${-x / 90}s` }}
        />
        <rect
          x={f(x - 5)}
          y={f(y)}
          width={10}
          height={14}
          rx={4}
          fill="none"
          stroke={build.deco.trim}
          strokeWidth={1.2}
        />
      </g>
    );
  }
  return <g>{out}</g>;
}

function Keel({ g, build }: { g: ShipGeometry; build: Build }) {
  const m = MATERIALS[build.quille.material];
  const heavy = build.quille.type === 'lourde';
  return (
    <g>
      <path
        d={g.keel}
        fill="none"
        stroke={m.dark}
        strokeWidth={heavy ? 12 : 7}
        strokeLinecap="round"
      />
      <path
        d={g.keel}
        fill="none"
        stroke={m.base}
        strokeWidth={heavy ? 7 : 3.5}
        strokeLinecap="round"
      />
      {heavy && (
        <path
          d={g.keel}
          fill="none"
          stroke={m.patina ?? m.line}
          strokeWidth={2.4}
          strokeDasharray="1 14"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** Garde-corps le long du haut de la silhouette, couleur des dorures. */
function Rail({ g, trim }: { g: ShipGeometry; trim: string }) {
  const posts: ReactElement[] = [];
  for (let x = g.bounds.minX + 14; x < g.bow.x - 20; x += 16) {
    const y = g.topAt(x);
    posts.push(
      <line
        key={x}
        x1={f(x)}
        y1={f(y)}
        x2={f(x)}
        y2={f(y - 9)}
        stroke={shade(trim, -0.35)}
        strokeWidth={1.4}
      />
    );
  }
  const line: string[] = [];
  for (let x = g.bounds.minX + 10; x < g.bow.x - 14; x += 8)
    line.push(`${line.length ? 'L' : 'M'}${f(x)},${f(g.topAt(x) - 9)}`);
  return (
    <g>
      {posts}
      <path
        d={line.join(' ')}
        fill="none"
        stroke={trim}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Rudder({ g, build }: { g: ShipGeometry; build: Build }) {
  const m = MATERIALS[build.poupe.material];
  const x = g.stern.x + 4;
  const y = g.stern.y - 30;
  const style = build.poupe.gouvernail;
  const fill = style === 'renforce' ? '#3c4046' : m.base;
  return (
    <g>
      <path
        d={`M${x},${y} L${x - 22},${y + 6} L${x - 26},${y + 58} Q${x - 10},${y + 66} ${x + 2},${y + 50} Z`}
        fill={fill}
        stroke={shade(fill, -0.45)}
        strokeWidth={1.6}
      />
      {style === 'renforce' &&
        [14, 30, 46].map((d) => (
          <line
            key={d}
            x1={x - 24}
            y1={y + d}
            x2={x}
            y2={y + d - 2}
            stroke="#8b9097"
            strokeWidth={2}
          />
        ))}
      {style === 'sculpte' && (
        <path
          d={`M${x - 20},${y + 50} q-14,-4 -10,-18 q4,-10 12,-4`}
          fill="none"
          stroke={build.deco.trim}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Figurehead({
  g,
  build,
  gold,
}: {
  g: ShipGeometry;
  build: Build;
  gold: string;
}) {
  const kind = build.proue.sculpture;
  if (kind === 'aucune') return null;
  const mat = PROW_MATERIALS[build.proue.material];
  const fill = build.proue.material === 'cuivreor' ? gold : mat.base;
  const stroke = mat.dark;
  const { x, y } = g.bow;
  const t = `translate(${f(x - 6)},${f(y + 8)}) rotate(-18) scale(1.75)`;
  if (kind === 'humanoide') {
    return (
      <g transform={t} fill={fill} stroke={stroke} strokeWidth={1.3}>
        <path d="M-6,0 C2,-6 14,-10 22,-20 L26,-16 C20,-6 10,2 2,8 Z" />
        <circle cx={27} cy={-25} r={6} />
        <path d="M14,-12 C22,-22 30,-34 26,-44 L22,-42 C24,-32 16,-24 10,-16 Z" />
      </g>
    );
  }
  if (kind === 'monstre') {
    return (
      <g transform={t} fill={fill} stroke={stroke} strokeWidth={1.3}>
        <path d="M-6,4 C6,-4 16,-14 30,-18 L44,-14 L34,-10 L42,-4 L28,-4 C20,2 10,8 0,12 Z" />
        <path d="M24,-17 L18,-34 L30,-20 Z" />
        <circle cx={32} cy={-14} r={1.8} fill="#ff5a36" stroke="none" />
        <path
          d="M34,-10 l2,4 l2,-4 l2,4"
          fill="none"
          stroke="#fff"
          strokeWidth={1}
        />
      </g>
    );
  }
  return (
    <g transform={t} fill={fill} stroke={stroke} strokeWidth={1.3}>
      <path d="M-6,2 C4,-4 14,-10 22,-14 L26,-6 C16,2 8,8 0,12 Z" />
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M${f(28 + Math.cos(a) * 9)},${f(-14 + Math.sin(a) * 9)} L${f(28 + Math.cos(a + 0.35) * 15)},${f(-14 + Math.sin(a + 0.35) * 15)} L${f(28 + Math.cos(a + 0.7) * 9)},${f(-14 + Math.sin(a + 0.7) * 9)} Z`}
          />
        );
      })}
      <circle cx={28} cy={-14} r={9} />
      <circle cx={31} cy={-16} r={1.6} fill="#2a1a0c" stroke="none" />
    </g>
  );
}

// --- Propulseurs ----------------------------------------------------------------

function Exhaust({ p, fill, i }: { p: PropShape; fill: string; i: number }) {
  return (
    <g transform={`translate(${f(p.cx)},${f(p.cy)}) rotate(${p.angle})`}>
      <ellipse
        cx={0}
        cy={p.h / 2 + p.h * 0.5}
        rx={p.w * 0.42}
        ry={p.h * 0.62}
        fill={fill}
        className={`arp-flame${i % 2 ? ' slow' : ''}`}
        opacity={0.9}
      />
      <ellipse
        cx={0}
        cy={p.h / 2 + 6}
        rx={p.w * 0.6}
        ry={10}
        fill="#8ff8ff"
        opacity={0.35}
        className="arp-glow"
      />
    </g>
  );
}

function Nacelle({
  p,
  fill,
  trim,
}: {
  p: PropShape;
  fill: string;
  trim: string;
}) {
  const { w, h } = p;
  return (
    <g transform={`translate(${f(p.cx)},${f(p.cy)}) rotate(${p.angle})`}>
      {/* Ailerons stabilisateurs */}
      <path
        d={`M${f(-w / 2)},${f(-h * 0.1)} L${f(-w / 2 - w * 0.45)},${f(h * 0.32)} L${f(-w / 2)},${f(h * 0.3)} Z`}
        fill="#3b322a"
        stroke="#14100c"
        strokeWidth={1}
      />
      <path
        d={`M${f(w / 2)},${f(-h * 0.1)} L${f(w / 2 + w * 0.45)},${f(h * 0.32)} L${f(w / 2)},${f(h * 0.3)} Z`}
        fill="#3b322a"
        stroke="#14100c"
        strokeWidth={1}
      />
      <rect
        x={f(-w / 2)}
        y={f(-h / 2)}
        width={f(w)}
        height={f(h)}
        rx={f(w / 2)}
        fill={fill}
        stroke="#120e0b"
        strokeWidth={1.4}
      />
      <rect
        x={f(-w / 2)}
        y={f(-h * 0.12)}
        width={f(w)}
        height={4}
        fill={trim}
        opacity={0.85}
      />
      <rect
        x={f(-w / 2 + 3)}
        y={f(h / 2 - 9)}
        width={f(w - 6)}
        height={8}
        rx={2}
        fill="#1a1512"
      />
      <rect
        x={f(-w / 2 + 5)}
        y={f(h / 2 - 5)}
        width={f(w - 10)}
        height={3}
        fill="#9ff6ff"
        className="arp-glow"
      />
    </g>
  );
}

// --- Lumières, équipage, dégâts -------------------------------------------------

function Lights({ g, build }: { g: ShipGeometry; build: Build }) {
  const kind = build.poupe.luminaires;
  if (kind === 'aucun') return null;
  const spots: [number, number][] = [];
  const sternTop = g.polygon
    .filter((p) => p[0] < g.sternEnd && p[1] < -10)
    .sort((a, b) => a[1] - b[1]);
  if (sternTop[0]) spots.push([g.bounds.minX + 8, g.topAt(g.bounds.minX + 8)]);
  spots.push([g.sternEnd - 10, g.topAt(g.sternEnd - 10)]);
  spots.push([g.bow.x - 18, g.topAt(g.bow.x - 18)]);
  if (kind === 'aether') {
    for (let x = g.sternEnd + 60; x < g.bow.x - 80; x += 130)
      spots.push([x, g.topAt(x)]);
  }
  return (
    <g>
      {spots.map(([x, y], i) => {
        if (kind === 'braseros') {
          return (
            <g key={i} transform={`translate(${f(x)},${f(y - 9)})`}>
              <path d="M-7,0 h14 l-3,7 h-8 Z" fill="#3a2a1e" stroke="#120c08" />
              <path
                d="M-5,0 Q-4,-12 0,-16 Q2,-8 5,0 Z"
                fill="#ff9a3a"
                className="arp-fire"
                style={{ animationDelay: `${-i * 0.13}s` }}
              />
              <path
                d="M-2,0 Q-1,-7 1,-9 Q2,-4 3,0 Z"
                fill="#ffe08a"
                className="arp-fire"
              />
            </g>
          );
        }
        const c = kind === 'aether' ? '#8ff3ff' : '#ffcf70';
        return (
          <g key={i} transform={`translate(${f(x)},${f(y - 12)})`}>
            <circle
              r={13}
              fill={c}
              opacity={0.22}
              className="arp-glow"
              style={{ animationDelay: `${-i * 0.4}s` }}
            />
            <line
              x1={0}
              y1={3}
              x2={0}
              y2={12}
              stroke="#2b1f16"
              strokeWidth={2}
            />
            <circle r={kind === 'aether' ? 4.5 : 3.5} fill={c} />
            {kind === 'lanternes' && (
              <rect
                x={-4.5}
                y={-5.5}
                width={9}
                height={11}
                rx={2}
                fill="none"
                stroke="#2b1f16"
                strokeWidth={1.4}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Crew({
  g,
  masts,
  count,
  build,
}: {
  g: ShipGeometry;
  masts: number[];
  count: number;
  build: Build;
}) {
  const n = Math.min(10, Math.max(0, count));
  if (!n) return null;
  const xs: number[] = [];
  const start = g.sternEnd + 24;
  const end = g.bow.x - 70;
  const step = (end - start) / Math.max(1, n);
  for (let i = 0; i < n; i++) {
    let x = start + step * (i + 0.5) + (rand(i + 3) - 0.5) * step * 0.4;
    for (const m of masts) if (Math.abs(x - m) < 12) x += 16;
    xs.push(x);
  }
  return (
    <g>
      {xs.map((x, i) => {
        const y = g.topAt(x) - 1;
        return (
          <g
            key={i}
            className="arp-crew"
            style={{ animationDelay: `${-rand(i) * 2}s` }}
          >
            <line
              x1={x - 2}
              y1={y}
              x2={x - 2}
              y2={y - 6}
              stroke="#2a1e15"
              strokeWidth={2}
            />
            <line
              x1={x + 2}
              y1={y}
              x2={x + 2}
              y2={y - 6}
              stroke="#2a1e15"
              strokeWidth={2}
            />
            <rect
              x={x - 4.5}
              y={y - 17}
              width={9}
              height={12}
              rx={3}
              fill={build.tenue.color}
            />
            <line
              x1={x - 4}
              y1={y - 15}
              x2={x + 4}
              y2={y - 9}
              stroke={build.tenue.accent}
              strokeWidth={2}
            />
            <circle cx={x} cy={y - 21} r={3.6} fill="#d9ad84" />
          </g>
        );
      })}
    </g>
  );
}

function Damage({ g, damage }: { g: ShipGeometry; damage: number }) {
  const n = Math.round(Math.max(0, Math.min(1, damage)) * 7);
  const out: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    const x =
      g.sternEnd * 0.6 + rand(i * 7 + 1) * (g.bow.x - g.sternEnd * 0.6 - 60);
    const y = 14 + rand(i * 13 + 2) * (g.bottomAt(x) - 40);
    const r = 6 + rand(i * 5) * 5;
    // Brèche : trou aux bords déchiquetés, éclats de bois autour.
    const hole = Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      const rr = r * (k % 2 ? 0.55 : 1) * (0.8 + rand(i * 17 + k) * 0.4);
      return `${k ? 'L' : 'M'}${f(x + Math.cos(a) * rr * 1.3)},${f(y + Math.sin(a) * rr)}`;
    }).join(' ');
    out.push(
      <g key={i}>
        <path
          d={hole}
          fill="#120c09"
          stroke="#c9a77a"
          strokeOpacity={0.5}
          strokeWidth={1.2}
          strokeLinejoin="miter"
        />
        {[0.4, 2.3, 4.1].map((a) => (
          <line
            key={a}
            x1={f(x + Math.cos(a) * r)}
            y1={f(y + Math.sin(a) * r * 0.8)}
            x2={f(x + Math.cos(a) * r * 2.4)}
            y2={f(y + Math.sin(a) * r * 1.6)}
            stroke="#120c09"
            strokeWidth={1.3}
            opacity={0.75}
          />
        ))}
      </g>
    );
  }
  return <g>{out}</g>;
}

function Smoke({ g, damage }: { g: ShipGeometry; damage: number }) {
  if (damage < 0.5) return null;
  const plumes = damage >= 0.75 ? 4 : 2;
  return (
    <g>
      {Array.from({ length: plumes }, (_, i) => {
        const x = g.sternEnd + 40 + rand(i + 11) * (g.bow.x - g.sternEnd - 120);
        const y = g.topAt(x) - 4;
        return (
          <g key={i}>
            {[0, 1, 2].map((k) => (
              <circle
                key={k}
                cx={x}
                cy={y}
                r={9}
                fill="#3a3330"
                className="arp-smoke"
                style={{ animationDelay: `${-k * 1.2 - i * 0.5}s` }}
              />
            ))}
            {damage >= 0.75 && (
              <path
                d={`M${x - 6},${y} Q${x - 4},${y - 16} ${x},${y - 22} Q${x + 3},${y - 10} ${x + 6},${y} Z`}
                fill="#ff8a2e"
                className="arp-fire"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Scaffold({ g }: { g: ShipGeometry }) {
  const x1 = g.sternEnd + (g.bow.x - g.sternEnd) * 0.15;
  const x2 = g.sternEnd + (g.bow.x - g.sternEnd) * 0.7;
  const poles: number[] = [];
  for (let x = x1; x <= x2; x += 46) poles.push(x);
  const wood = '#c9a26b';
  return (
    <g opacity={0.95}>
      {poles.map((x) => (
        <line
          key={x}
          x1={f(x)}
          y1={-120}
          x2={f(x)}
          y2={f(g.bottomAt(x) + 12)}
          stroke={wood}
          strokeWidth={4}
        />
      ))}
      {[-110, -60, -10, 40, 90].map((y) =>
        y < g.depth ? (
          <rect
            key={y}
            x={f(x1 - 6)}
            y={y}
            width={f(x2 - x1 + 12)}
            height={5}
            fill={shade(wood, -0.2)}
          />
        ) : null
      )}
      {poles.slice(0, -1).map((x, i) => (
        <line
          key={`d${x}`}
          x1={f(x)}
          y1={i % 2 ? -110 : -60}
          x2={f(x + 46)}
          y2={i % 2 ? -60 : -110}
          stroke={shade(wood, -0.3)}
          strokeWidth={2}
        />
      ))}
      <line
        x1={f(x2)}
        y1={-120}
        x2={f(x2 + 70)}
        y2={-150}
        stroke={shade(wood, -0.4)}
        strokeWidth={4}
      />
      <g className="arp-hook">
        <line
          x1={f(x2 + 70)}
          y1={-150}
          x2={f(x2 + 70)}
          y2={-70}
          stroke="#2a1e15"
          strokeWidth={1.4}
        />
        <rect
          x={f(x2 + 60)}
          y={-72}
          width={20}
          height={14}
          fill="#7a5130"
          stroke="#2a1e15"
        />
      </g>
      <circle cx={f(x1)} cy={-124} r={4} fill="#ffb347" className="arp-blink" />
    </g>
  );
}

function Salvo({ g }: { g: ShipGeometry }) {
  const ports = useMemo(() => {
    const out: [number, number][] = [];
    for (const r of g.strips) {
      if (r.y < -10) continue;
      const n = Math.max(1, Math.floor(r.w / 24));
      for (let k = 0; k < n; k += 2)
        out.push([r.x + (r.w / n) * (k + 0.5), r.y + r.h / 2]);
    }
    return out.slice(0, 9);
  }, [g]);
  return (
    <g>
      {ports.map(([x, y], i) => (
        <g key={i} style={{ animationDelay: `${i * 0.09}s` }}>
          <path
            className="arp-flash"
            style={{ animationDelay: `${i * 0.09}s` }}
            d={`M${f(x)},${f(y)} l26,-8 l-6,8 l14,0 l-14,6 l8,8 l-28,-6 Z`}
            fill="#ffd36b"
          />
          <circle
            className="arp-puff"
            style={{ animationDelay: `${i * 0.09 + 0.1}s` }}
            cx={f(x + 18)}
            cy={f(y)}
            r={10}
            fill="#cfc6b8"
            opacity={0.8}
          />
        </g>
      ))}
    </g>
  );
}

/** Arpenteur isolé dans son propre <svg> (vignettes de l'atelier et de l'évolution). */
export function ShipThumb({
  build,
  className,
  animate = false,
}: {
  build: Build;
  className?: string;
  animate?: boolean;
}) {
  const g = shipGeometry(build.allure, build.ponts);
  const top = -350;
  const bottom = g.bounds.maxY + 60;
  return (
    <svg
      viewBox={`40 ${top} 940 ${bottom - top}`}
      className={className}
      role="img"
      aria-label="Arpenteur"
    >
      {animate && <style>{SHIP_STYLE}</style>}
      <ShipProfile build={build} animate={animate} crew={0} />
    </svg>
  );
}
