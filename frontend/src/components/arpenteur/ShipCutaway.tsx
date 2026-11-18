import { useId, useState, type ReactElement } from 'react';
import { MATERIALS, loyaltyColor } from '../../arpenteur/catalog';
import { canonicalPost, foldKey, initials } from '../../arpenteur/logic';
import {
  mastPositions,
  scanline,
  shipGeometry,
} from '../../arpenteur/shipGeometry';
import type { ArpenteurDoc, Build, RoomDeck } from '../../arpenteur/types';

// Vue en coupe de l'arpenteur, d'après le plan du galion de base : château
// arrière, ponts intérieurs et cale. Chaque salle est cliquable et renvoie à
// l'onglet qui la gère (équipage, canons, cale…).

export type CutawayTarget =
  | 'crew'
  | 'combat'
  | 'hold'
  | 'cave'
  | 'map'
  | 'atelier';

interface RoomDef {
  id: string;
  label: string;
  short?: string;
  weight: number;
  target?: CutawayTarget;
  /** Poste dont les membres occupent la cabine. */
  post?: string;
  kind?:
    | 'guns'
    | 'powder'
    | 'ammo'
    | 'food'
    | 'loot'
    | 'quarters'
    | 'jail'
    | 'kitchen'
    | 'extra';
  /** Pont dont les canons sont montrés. */
  deck?: string;
}

interface Level {
  id: RoomDeck;
  label: string;
  rooms: RoomDef[];
}

const CABIN_POSTS = [
  'Capitaine',
  'Contremaître',
  'Maître canonnier',
  'Chirurgien',
  'Guetteur',
];

/** Ponts intérieurs (du haut vers le bas) selon la taille du navire. */
function levels(build: Build): Level[] {
  const sup: Level = {
    id: 'superieur',
    label: 'Pont supérieur',
    rooms: [
      {
        id: 'cab-guetteur',
        label: 'Cabine du guetteur',
        short: 'Guetteur',
        weight: 1,
        target: 'map',
        post: 'Guetteur',
      },
      {
        id: 'canons-sup',
        label: 'Canons supérieurs',
        short: 'Canons',
        weight: 3,
        target: 'combat',
        kind: 'guns',
        deck: 'superieur',
      },
      {
        id: 'cab-canonnier',
        label: 'Cabine du maître canonnier',
        short: 'Maître canonnier',
        weight: 1.2,
        target: 'combat',
        post: 'Maître canonnier',
      },
    ],
  };
  const grand: Level = {
    id: 'grand',
    label: 'Grand pont',
    rooms: [
      {
        id: 'canons-arr',
        label: 'Canons arrières',
        short: 'Canons arr.',
        weight: 1.1,
        target: 'combat',
        kind: 'guns',
        deck: 'grand',
      },
      ...(build.ponts < 2
        ? [
            {
              id: 'cab-canonnier',
              label: 'Cabine du maître canonnier',
              short: 'Maître canonnier',
              weight: 1.2,
              target: 'combat' as const,
              post: 'Maître canonnier',
            },
          ]
        : []),
      {
        id: 'canons-flanc',
        label: 'Canons de flanc',
        short: 'Canons de flanc',
        weight: 3.4,
        target: 'combat',
        kind: 'guns',
        deck: 'grand',
      },
      {
        id: 'canons-av',
        label: 'Canons avant',
        short: 'Canons av.',
        weight: 1.1,
        target: 'combat',
        kind: 'guns',
        deck: 'grand',
      },
    ],
  };
  const inf: Level = {
    id: 'inferieur',
    label: 'Pont inférieur',
    rooms: [
      {
        id: 'cuisines',
        label: 'Cuisines',
        weight: 1.3,
        target: 'hold',
        kind: 'kitchen',
      },
      {
        id: 'cab-chirurgien',
        label: 'Cabine du chirurgien',
        short: 'Chirurgien',
        weight: 1.1,
        target: 'crew',
        post: 'Chirurgien',
      },
      ...(build.ponts < 2
        ? [
            {
              id: 'cab-guetteur',
              label: 'Cabine du guetteur',
              short: 'Guetteur',
              weight: 0.9,
              target: 'map' as const,
              post: 'Guetteur',
            },
          ]
        : []),
      {
        id: 'quartiers',
        label: "Quartiers de l'équipage",
        short: 'Équipage',
        weight: 2.6,
        target: 'crew',
        kind: 'quarters',
      },
      {
        id: 'butins',
        label: 'Salle aux butins',
        short: 'Butins',
        weight: 1.1,
        target: 'cave',
        kind: 'loot',
      },
    ],
  };
  const sous: Level = { id: 'souspont', label: 'Sous-pont', rooms: [] };
  const cale: Level = {
    id: 'cale',
    label: 'Cale',
    rooms: [
      {
        id: 'nourriture',
        label: 'Réserve de nourriture',
        short: 'Nourriture',
        weight: 1.4,
        target: 'hold',
        kind: 'food',
      },
      {
        id: 'munitions',
        label: 'Cale aux munitions',
        short: 'Munitions',
        weight: 1.2,
        target: 'combat',
        kind: 'ammo',
      },
      {
        id: 'poudre',
        label: 'Cale à poudre',
        short: 'Poudre',
        weight: 1,
        target: 'combat',
        kind: 'powder',
      },
      { id: 'geoles', label: 'Geôles', weight: 0.9, kind: 'jail' },
    ],
  };
  const list =
    build.ponts >= 3
      ? [sup, grand, inf, sous, cale]
      : build.ponts === 2
        ? [sup, grand, inf, cale]
        : [grand, inf, cale];
  // Pièces ajoutées à l'atelier, sur leur pont (ou le plus proche existant).
  for (const r of build.rooms) {
    const lvl =
      list.find((l) => l.id === r.deck) ??
      list.find((l) => l.id === 'inferieur')!;
    lvl.rooms.push({
      id: `room-${r.id}`,
      label: r.name || r.kind,
      weight: 0.6 + r.space * 0.45,
      target: 'atelier',
      kind: 'extra',
    });
  }
  if (build.ponts >= 3 && sous.rooms.length === 0) {
    sous.rooms.push({
      id: 'entrepot',
      label: 'Entrepôt',
      weight: 2,
      target: 'hold',
      kind: 'food',
    });
  }
  return list;
}

interface Props {
  doc: ArpenteurDoc;
  build: Build;
  onRoom?: (target: CutawayTarget) => void;
}

const f = (n: number) => Math.round(n * 10) / 10;

export function ShipCutaway({ doc, build, onRoom }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const g = shipGeometry(build.allure, build.ponts);
  const coque = MATERIALS[build.coque.material];
  const wall = 9;
  const interior = levels(build);
  const bottom = g.depth - 14;
  const levelH = (bottom - 4) / interior.length;
  const masts = mastPositions(g, build.mats.type);

  // Membres par poste (cabines) ; les autres logent dans les quartiers.
  const byPost = new Map<string, typeof doc.crew.members>();
  const quarters: typeof doc.crew.members = [];
  for (const m of doc.crew.members) {
    const p = canonicalPost(m.post);
    if (CABIN_POSTS.includes(p)) byPost.set(p, [...(byPost.get(p) ?? []), m]);
    else quarters.push(m);
  }

  const els: ReactElement[] = [];
  const labels: ReactElement[] = [];

  const room = (
    key: string,
    def: RoomDef,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const active = hover === key;
    const clickable = !!def.target && !!onRoom;
    const base = Math.min(13, h / 4.2);
    const label =
      w < def.label.length * base * 0.58 ? (def.short ?? def.label) : def.label;
    let lines = [label];
    if (w < label.length * base * 0.58 && h > 34) lines = splitLabel(label);
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.max(6.5, Math.min(base, (w - 6) / (longest * 0.6)));
    els.push(
      <g
        key={key}
        onPointerEnter={() => setHover(key)}
        onPointerLeave={() => setHover((h0) => (h0 === key ? null : h0))}
        onClick={clickable ? () => onRoom!(def.target!) : undefined}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
      >
        <title>{def.label}</title>
        <rect
          x={f(x + 1.5)}
          y={f(y + 1.5)}
          width={f(Math.max(0, w - 3))}
          height={f(Math.max(0, h - 3))}
          rx={2}
          fill={`url(#${uid}-room)`}
          stroke={active ? '#f0c869' : '#120b07'}
          strokeWidth={active ? 2.2 : 1.2}
        />
        {active && (
          <rect
            x={f(x + 1.5)}
            y={f(y + 1.5)}
            width={f(w - 3)}
            height={f(h - 3)}
            rx={2}
            fill="#f0c869"
            opacity={0.12}
          />
        )}
        <RoomContent
          def={def}
          x={x}
          y={y}
          w={w}
          h={h}
          doc={doc}
          members={
            def.post
              ? (byPost.get(def.post) ?? [])
              : def.kind === 'quarters'
                ? quarters
                : []
          }
        />
      </g>
    );
    labels.push(
      <text
        key={`t${key}`}
        x={f(x + w / 2)}
        y={f(y + 4 + fs)}
        textAnchor="middle"
        fontSize={fs}
        fill={active ? '#ffe3a1' : '#f1e3c6'}
        style={{
          pointerEvents: 'none',
          fontFamily: 'Cinzel, serif',
          fontWeight: 600,
        }}
      >
        {lines.map((l, i) => (
          <tspan key={i} x={f(x + w / 2)} dy={i ? fs * 1.05 : 0}>
            {l}
          </tspan>
        ))}
      </text>
    );
  };

  // Château arrière : cabines du capitaine et du contremaître.
  const castleTop = Math.min(
    ...g.polygon.filter((p) => p[0] < g.sternEnd).map((p) => p[1])
  );
  if (castleTop < -40) {
    const y1 = castleTop + 14;
    const yMid = (y1 - 2) / 2;
    const xs = scanline(g.polygon, yMid);
    const xL = (xs[0] ?? g.bounds.minX) + wall;
    const xR = Math.min(g.sternEnd, xs[xs.length - 1] ?? g.sternEnd) - wall;
    const cut = xL + (xR - xL) * 0.56;
    room(
      'cab-capitaine',
      {
        id: 'cab-capitaine',
        label: 'Cabine du capitaine',
        short: 'Capitaine',
        weight: 1,
        target: 'crew',
        post: 'Capitaine',
      },
      xL,
      y1,
      cut - xL,
      -y1 - 2
    );
    room(
      'cab-contremaitre',
      {
        id: 'cab-contremaitre',
        label: 'Cabine du contremaître',
        short: 'Contremaître',
        weight: 1,
        target: 'crew',
        post: 'Contremaître',
      },
      cut,
      y1,
      xR - cut,
      -y1 - 2
    );
  }
  // Tour de proue (Bombardier, Enforceur…) : batterie avant.
  let xr = g.bow.x - 8;
  while (xr > g.sternEnd + 60 && g.topAt(xr) > -45) xr -= 6;
  let xl = xr;
  while (xl > g.sternEnd + 40 && g.topAt(xl) < -45) xl -= 6;
  if (xr - xl > 60 && xr > g.sternEnd + 120) {
    const top =
      Math.min(
        ...g.polygon.filter((p) => p[0] > xl && p[0] < xr + 10).map((p) => p[1])
      ) + 14;
    const xs = scanline(g.polygon, top / 2);
    const right = Math.min(xr, (xs[xs.length - 1] ?? xr) - wall);
    room(
      'tour-proue',
      {
        id: 'tour-proue',
        label: 'Batterie haute',
        short: 'Batterie',
        weight: 1,
        target: 'combat',
        kind: 'guns',
        deck: 'grand',
      },
      xl + 10,
      top,
      right - xl - 10,
      -top - 2
    );
  }

  // Ponts intérieurs.
  const floors: ReactElement[] = [];
  interior.forEach((lvl, li) => {
    const y1 = 2 + li * levelH;
    const y2 = y1 + levelH;
    const xa = scanline(g.polygon, y1 + 3);
    const xm = scanline(g.polygon, y1 + levelH * 0.55);
    if (xa.length < 2 || xm.length < 2) return;
    // Les salles suivent la coque à mi-hauteur ; le bordage recouvre les angles.
    const xL = Math.max(xa[0], xm[0]) + wall;
    const xR = Math.min(xa[xa.length - 1], xm[xm.length - 1]) - wall;
    const total = lvl.rooms.reduce((s, r) => s + r.weight, 0);
    let x = xL;
    lvl.rooms.forEach((r) => {
      const w = ((xR - xL) * r.weight) / total;
      room(`${lvl.id}-${r.id}`, r, x, y1, w, levelH);
      x += w;
    });
    floors.push(
      <g key={lvl.id}>
        <line
          x1={f(xa[0])}
          y1={f(y2)}
          x2={f(xa[xa.length - 1])}
          y2={f(y2)}
          stroke="#5b3d26"
          strokeWidth={3}
        />
        <text
          x={f(g.bounds.minX - 14)}
          y={f((y1 + y2) / 2 + 4)}
          textAnchor="end"
          fontSize={12}
          fill="#e9d8b6"
          opacity={0.85}
          style={{ fontFamily: 'Cinzel, serif' }}
        >
          {lvl.label}
        </text>
      </g>
    );
  });

  return (
    <g>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path d={g.outline} />
        </clipPath>
        <linearGradient id={`${uid}-room`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a301d" />
          <stop offset="1" stopColor="#2a1a10" />
        </linearGradient>
      </defs>
      {/* Mâts fantômes au-dessus du pont */}
      {masts.map((x) => (
        <rect
          key={x}
          x={x - 4}
          y={-260}
          width={8}
          height={262}
          fill="#3b2a1d"
          opacity={0.35}
        />
      ))}
      <path d={g.outline} fill="#1d130c" />
      <g clipPath={`url(#${uid}-clip)`}>
        {els}
        {masts.map((x) => (
          <rect
            key={`m${x}`}
            x={x - 5}
            y={g.topAt(x)}
            width={10}
            height={g.bottomAt(x) - g.topAt(x)}
            fill="#5a3e28"
            opacity={0.55}
            style={{ pointerEvents: 'none' }}
          />
        ))}
        <path
          d={g.outline}
          fill="none"
          stroke={coque.base}
          strokeWidth={wall * 2}
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
        <path
          d={g.outline}
          fill="none"
          stroke={coque.dark}
          strokeWidth={2}
          style={{ pointerEvents: 'none' }}
        />
        <line
          x1={g.bounds.minX}
          y1={0}
          x2={g.bounds.maxX}
          y2={0}
          stroke="#6b4a2f"
          strokeWidth={4}
          style={{ pointerEvents: 'none' }}
        />
        <path
          d={g.keel}
          fill="none"
          stroke={MATERIALS[build.quille.material].base}
          strokeWidth={12}
          style={{ pointerEvents: 'none' }}
        />
      </g>
      {floors}
      {labels}
      <path d={g.outline} fill="none" stroke="#0e0906" strokeWidth={2.4} />
    </g>
  );
}

function splitLabel(label: string): string[] {
  const words = label.split(' ');
  if (words.length < 2) return [label];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** Contenu d'une salle : occupants, canons, barils, munitions… */
function RoomContent({
  def,
  x,
  y,
  w,
  h,
  doc,
  members,
}: {
  def: RoomDef;
  x: number;
  y: number;
  w: number;
  h: number;
  doc: ArpenteurDoc;
  members: ArpenteurDoc['crew']['members'];
}) {
  const baseY = y + h - 7;
  const cx = x + w / 2;
  if (members.length) {
    const r = Math.min(8, h / 5);
    const shown = members.slice(
      0,
      Math.max(1, Math.floor((w - 8) / (r * 2.3)))
    );
    const start = cx - ((shown.length - 1) * r * 2.3) / 2;
    return (
      <g style={{ pointerEvents: 'none' }}>
        {shown.map((m, i) => (
          <g key={m.id}>
            <circle
              cx={f(start + i * r * 2.3)}
              cy={f(baseY - r)}
              r={r}
              fill="#1b120c"
              stroke={loyaltyColor(m.loyalty, foldKey)}
              strokeWidth={2}
            />
            <text
              x={f(start + i * r * 2.3)}
              y={f(baseY - r + r * 0.38)}
              textAnchor="middle"
              fontSize={r * 0.95}
              fill="#f4e6c8"
              style={{ fontWeight: 700 }}
            >
              {initials(m.name)}
            </text>
          </g>
        ))}
      </g>
    );
  }
  const icons = (
    n: number,
    draw: (ix: number, iy: number, k: number) => ReactElement,
    size: number
  ) => {
    const max = Math.max(0, Math.floor((w - 10) / (size + 3)));
    const count = Math.min(n, max);
    const start = cx - ((count - 1) * (size + 3)) / 2;
    return (
      <g style={{ pointerEvents: 'none' }}>
        {Array.from({ length: count }, (_, k) =>
          draw(start + k * (size + 3), baseY, k)
        )}
      </g>
    );
  };
  switch (def.kind) {
    case 'guns': {
      const deck = doc.combat.decks.find((d) => d.id === def.deck);
      const n = deck
        ? deck.guns.A1.installed +
          deck.guns.A2.installed +
          deck.guns.A3.installed
        : 0;
      const per =
        def.id === 'canons-flanc'
          ? n
          : def.id === 'tour-proue'
            ? Math.min(n, 2)
            : Math.min(n, 1);
      return icons(
        per,
        (ix, iy, k) => (
          <g key={k}>
            <rect
              x={ix - 6}
              y={iy - 6}
              width={13}
              height={5}
              rx={2}
              fill="#3a3f45"
            />
            <circle cx={ix - 3} cy={iy} r={2.4} fill="#6b4a2f" />
            <circle cx={ix + 4} cy={iy} r={2.4} fill="#6b4a2f" />
          </g>
        ),
        14
      );
    }
    case 'powder':
      return icons(
        doc.combat.powderReserve,
        (ix, iy, k) => (
          <g key={k}>
            <rect
              x={ix - 4}
              y={iy - 11}
              width={8}
              height={11}
              rx={2.5}
              fill="#7a5130"
              stroke="#2a1a10"
            />
            <line
              x1={ix - 4}
              y1={iy - 7}
              x2={ix + 4}
              y2={iy - 7}
              stroke="#2a1a10"
            />
            <line
              x1={ix - 4}
              y1={iy - 3}
              x2={ix + 4}
              y2={iy - 3}
              stroke="#2a1a10"
            />
          </g>
        ),
        8
      );
    case 'ammo': {
      const total = doc.combat.ammo.reduce((s, a) => s + a.count, 0);
      return icons(
        Math.min(24, Math.ceil(total / 2)),
        (ix, iy, k) => (
          <circle key={k} cx={ix} cy={iy - 3} r={3} fill="#2e3236" />
        ),
        6
      );
    }
    case 'loot':
      return icons(
        Math.min(8, doc.cave.items.length),
        (ix, iy, k) => (
          <path
            key={k}
            d={`M${ix},${iy - 9} l4,4 l-4,5 l-4,-5 Z`}
            fill={['#e8bd4f', '#7fb5e6', '#b48cf0', '#9fd27a'][k % 4]}
          />
        ),
        8
      );
    case 'food':
    case 'kitchen': {
      const n = doc.hold.items.filter((i) =>
        /rago|nugget|légume|legume|fruit|rassasie|caisson de/i.test(
          `${i.name} ${i.effect}`
        )
      ).length;
      return icons(
        Math.min(10, def.kind === 'kitchen' ? Math.min(2, n) : n),
        (ix, iy, k) => (
          <rect
            key={k}
            x={ix - 5}
            y={iy - 9}
            width={10}
            height={9}
            fill="#8c6a43"
            stroke="#2a1a10"
          />
        ),
        10
      );
    }
    case 'jail':
      return (
        <g stroke="#6d7278" strokeWidth={1.6} style={{ pointerEvents: 'none' }}>
          {Array.from(
            { length: Math.max(2, Math.floor((w - 12) / 7)) },
            (_, k) => (
              <line
                key={k}
                x1={f(x + 8 + k * 7)}
                y1={f(y + h * 0.45)}
                x2={f(x + 8 + k * 7)}
                y2={f(y + h - 4)}
              />
            )
          )}
        </g>
      );
    default:
      return null;
  }
}
