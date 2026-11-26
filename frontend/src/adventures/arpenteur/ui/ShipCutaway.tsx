import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { MATERIALS, loyaltyColor } from '../model/catalog';
import { canonicalPost, foldKey, initials } from '../model/logic';
import type { ArpenteurDoc, Build, RoomDeck, RoomKind } from '../model/types';
import { ALLURE_SPECS, Hull } from '../render/shipModel';

// Vue en coupe de l'arpenteur, façon maison de poupée : la silhouette suit le
// modèle 3D (coque galbée, tonture, châteaux, mâts, propulseurs) et chaque
// salle est meublée (hamacs, fourneau, canons, barils, coffres…), avec les
// membres d'équipage à leur poste. Chaque salle est cliquable et renvoie à
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
    | 'extra'
    | 'charts'
    | 'lookout'
    | 'forecastle';
  /** Pont dont les canons sont montrés. */
  deck?: string;
  /** Pièce ajoutée à l'atelier : son type. */
  extra?: RoomKind;
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

/** Ce qui compose le navire : ponts armés et postes occupés. */
interface Fit {
  /** Pont disponible avec des emplacements de canons. */
  guns: (deck: string) => boolean;
  /** Poste occupé par au moins un membre. */
  has: (post: string) => boolean;
}

function fitOf(doc: ArpenteurDoc): Fit {
  const posts = new Set(doc.crew.members.map((m) => canonicalPost(m.post)));
  return {
    guns: (id) => {
      const d = doc.combat.decks.find((x) => x.id === id);
      return (
        !!d &&
        d.available &&
        d.guns.A1.slots + d.guns.A2.slots + d.guns.A3.slots > 0
      );
    },
    has: (p) => posts.has(p),
  };
}

/**
 * Ponts intérieurs (du haut vers le bas) selon la taille du navire et ce qui
 * le compose : canons seulement sur les ponts armés, cabines des seuls
 * postes occupés, pièces construites à l'atelier.
 */
function levels(build: Build, fit: Fit): Level[] {
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
  // Canons du pont inférieur, s'il est armé.
  inf.rooms.splice(2, 0, {
    id: 'canons-inf',
    label: 'Canons inférieurs',
    short: 'Canons',
    weight: 2.2,
    target: 'combat',
    kind: 'guns',
    deck: 'inferieur',
  });
  const list =
    build.ponts >= 3
      ? [sup, grand, inf, sous, cale]
      : build.ponts === 2
        ? [sup, grand, inf, cale]
        : [grand, inf, cale];
  // Seulement ce que le navire possède.
  const armed = ['superieur', 'grand', 'inferieur'].some(fit.guns);
  for (const l of list)
    l.rooms = l.rooms.filter((r) =>
      r.post
        ? fit.has(r.post)
        : r.kind === 'guns'
          ? fit.guns(r.deck ?? '')
          : r.kind === 'ammo' || r.kind === 'powder'
            ? armed
            : true
    );
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
      extra: r.kind,
    });
  }
  // Pont resté vide (ni canons ni cabines) : entrepôt.
  for (const l of list)
    if (l.rooms.length === 0)
      l.rooms.push({
        id: `entrepot-${l.id}`,
        label: 'Entrepôt',
        weight: 2,
        target: 'hold',
        kind: 'food',
      });
  return list;
}

interface Props {
  doc: ArpenteurDoc;
  build: Build;
  onRoom?: (target: CutawayTarget) => void;
}

/** Échelles : unités SVG par mètre (horizontal ; vertical, un peu exagéré). */
const U = 20;
/** Sous le pont (coque, un peu exagérée) et au-dessus (tonture, châteaux). */
const V = 33;
const VC = 22;
const f = (n: number) => Math.round(n * 10) / 10;
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

type Pt = [number, number];

interface CastleGeom {
  a: number;
  b: number;
  h: number;
  shape: string;
  stepped: boolean;
  split: number;
  /** Hauteur (m) du château en s. */
  height: (s: number) => number;
  hLow: (s: number) => number;
  path: string;
}

/** Silhouette en coupe, d'après la coque 3D. */
function profile(build: Build) {
  const hull = new Hull(build.allure, build.ponts);
  const spec = ALLURE_SPECS[build.allure];
  const deckRef = hull.deckY(0.47);
  const X = (s: number, v = 1) => (hull.x(s) + hull.shift(s, v)) * U;
  const Y = (ym: number) => {
    const v = deckRef - ym;
    return v > 0 ? v * V : v * VC;
  };
  const P = (s: number, v: number): Pt => {
    const p = hull.point(s, v);
    return [p[0] * U, Y(p[1])];
  };
  const deck = (s: number) => Y(hull.deckY(s));
  const keel = (s: number) => Y(hull.keelY(s));
  const N = 60;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) pts.push(P(i / N, 1));
  for (let i = 1; i <= 12; i++) pts.push(P(1, 1 - i / 12));
  for (let i = N - 1; i >= 0; i--) pts.push(P(i / N, 0));
  for (let i = 1; i < 12; i++) pts.push(P(0, i / 12));
  const outline = `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')} Z`;
  const keelPath = `M${Array.from({ length: N + 1 }, (_, i) => P(i / N, 0))
    .map((p) => `${f(p[0])},${f(p[1] + 2)}`)
    .join(' L')}`;

  // Châteaux : mêmes règles que le modèle 3D (dunette étagée, tours, gaillard).
  const castles: CastleGeom[] = spec.castles.map((c) => {
    const sa = c.a === 0 ? 0.004 : c.a;
    const stepped =
      (c.shape === 'box' || c.shape === 'dome') &&
      c.a < 0.05 &&
      c.b - c.a > 0.17 &&
      c.h >= 3;
    const split = stepped ? sa + (c.b - sa) * 0.55 : c.b;
    const hUp = (s: number) => {
      if (c.shape === 'slope')
        return c.h * (1 - 0.8 * smooth(c.a + (c.b - c.a) * 0.25, c.b, s)) + 0.6;
      const rel = (s - c.a) / (c.b - c.a);
      const toEnd = c.a < 0.05 ? 1 - rel : c.b > 0.95 ? rel : 0;
      return c.h * (0.9 + 0.22 * toEnd * toEnd);
    };
    const hLow = (s: number) => Math.max(2.2, hUp(s) * 0.52);
    const height = (s: number) =>
      stepped && s > split + 1e-6 ? hLow(s) : hUp(s);
    const top: Pt[] = [];
    const M = 24;
    for (let i = 0; i <= M; i++) {
      const s = sa + ((c.b - sa) * i) / M;
      if (stepped && i > 0 && s > split && top.length) {
        const prev = sa + ((c.b - sa) * (i - 1)) / M;
        if (prev <= split) {
          top.push([X(split), deck(split) - hUp(split) * VC]);
          top.push([X(split), deck(split) - hLow(split) * VC]);
        }
      }
      // Surplomb de la poupe (le mur arrière penche vers l'extérieur).
      const lean = c.a < 0.05 ? (1 - smooth(sa, sa + 0.07, s)) * 1.4 * U : 0;
      top.push([X(s) - lean, deck(s) - height(s) * VC]);
    }
    const base: Pt[] = [];
    for (let i = M; i >= 0; i--) {
      const s = sa + ((c.b - sa) * i) / M;
      base.push([X(s), deck(s) + 2]);
    }
    const path = `M${[...top, ...base].map((p) => `${f(p[0])},${f(p[1])}`).join(' L')} Z`;
    return {
      a: sa,
      b: c.b,
      h: c.h,
      shape: c.shape,
      stepped,
      split,
      height,
      hLow,
      path,
    };
  });

  // Encombrement (sans la mâture, qui sort du cadre en s'estompant).
  let minY = Math.min(...pts.map((p) => p[1]));
  for (const c of castles)
    for (let i = 0; i <= 20; i++) {
      const s = c.a + ((c.b - c.a) * i) / 20;
      minY = Math.min(minY, deck(s) - c.height(s) * VC - 26);
    }
  const maxY = Math.max(...pts.map((p) => p[1])) + 2.6 * U;
  const minX = Math.min(...pts.map((p) => p[0])) - 30;
  const maxX = Math.max(...pts.map((p) => p[0])) + 10;
  return {
    hull,
    spec,
    X,
    Y,
    deck,
    keel,
    outline,
    keelPath,
    castles,
    bounds: { minX, maxX, minY, maxY },
  };
}

/** Cadre de la coupe (unités SVG), pour la placer dans la scène. */
export function cutawayBounds(build: Build) {
  return profile(build).bounds;
}

interface Box {
  key: string;
  def: RoomDef;
  /** Contour de la salle. */
  path: string;
  x0: number;
  x1: number;
  /** Plafond et plancher au centre de la salle. */
  top: number;
  floor: number;
  /** Plancher (y) à l'abscisse x. */
  floorAt: (x: number) => number;
  /** La salle est contre le tableau arrière (fenêtres de poupe). */
  stern?: boolean;
}

export function ShipCutaway({ doc, build, onRoom }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const pr = profile(build);
  const { X, deck, keel, spec } = pr;
  const coque = MATERIALS[build.coque.material];
  const poupe = MATERIALS[build.poupe.material];
  const quille = MATERIALS[build.quille.material];
  const fit = fitOf(doc);
  const interior = levels(build, fit);

  // Membres par poste (cabines) ; les autres logent dans les quartiers.
  const byPost = new Map<string, typeof doc.crew.members>();
  const quarters: typeof doc.crew.members = [];
  for (const m of doc.crew.members) {
    const p = canonicalPost(m.post);
    if (CABIN_POSTS.includes(p)) byPost.set(p, [...(byPost.get(p) ?? []), m]);
    else quarters.push(m);
  }

  // --- Découpage : ponts intérieurs qui suivent la tonture ---------------------
  const boxes: Box[] = [];
  const depthMid = keel(0.5) - deck(0.5);
  const hLev = (depthMid - 6) / interior.length;
  // Planchers : la tonture s'atténue en descendant (salles moins penchées).
  const floorY = (k: number, s: number) =>
    k === 0 ? deck(s) + 3 : deck(0.5) + (deck(s) - deck(0.5)) * 0.3 + k * hLev;
  const sAt = (x: number) => {
    // Inverse approché de X(s) (monotone).
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (X(m) < x) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const floorLines: string[] = [];
  const levelMarks: { label: string; y: number; x: number }[] = [];
  interior.forEach((lvl, li) => {
    const ceil = (s: number) => floorY(li, s);
    const last = li === interior.length - 1;
    const bottom = (s: number) => (last ? keel(s) - 4 : floorY(li + 1, s));
    // Étendue utile : assez de hauteur sous plafond, au-dessus de la quille.
    const ok = (s: number) =>
      keel(s) - (last ? ceil(s) + 30 : bottom(s) + 6) > 0;
    let s0 = 0.02;
    while (s0 < 0.5 && !ok(s0)) s0 += 0.005;
    let s1 = 0.995;
    while (s1 > 0.5 && !ok(s1)) s1 -= 0.005;
    if (s1 - s0 < 0.1) return;
    const total = lvl.rooms.reduce((t, r) => t + r.weight, 0);
    let sa = s0;
    lvl.rooms.forEach((r) => {
      const sb = sa + ((s1 - s0) * r.weight) / total;
      const top: Pt[] = [];
      const bot: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const s = sa + ((sb - sa) * i) / 10;
        top.push([X(s), ceil(s)]);
        bot.push([X(s), bottom(s)]);
      }
      const sc = (sa + sb) / 2;
      boxes.push({
        key: `${lvl.id}-${r.id}`,
        def: r,
        path: `M${[...top, ...bot.reverse()].map((p) => `${f(p[0])},${f(p[1])}`).join(' L')} Z`,
        x0: X(sa),
        x1: X(sb),
        top: ceil(sc),
        floor: Math.min(bottom(sc), keel(sc) - 8),
        floorAt: (x: number) => {
          const s = sAt(x);
          return Math.min(bottom(s), keel(s) - 8);
        },
        stern: sa < 0.05,
      });
      sa = sb;
    });
    if (!last) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const s = i / 40;
        pts.push([X(s), floorY(li + 1, s)]);
      }
      floorLines.push(`M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')}`);
    }
    levelMarks.push({
      label: lvl.label,
      y: (ceil(s0) + bottom(s0)) / 2,
      x: X(s0),
    });
  });

  // --- Châteaux : cabines des officiers, batterie haute, gaillard ---------------
  pr.castles.forEach((c, ci) => {
    const stern = c.a < 0.05;
    const base = (s: number) => deck(s) - 2;
    const roof = (s: number) => deck(s) - c.height(s) * VC + 8;
    const mk = (
      def: RoomDef,
      sa: number,
      sb: number,
      y0: (s: number) => number,
      y1: (s: number) => number,
      atStern = false
    ) => {
      const top: Pt[] = [];
      const bot: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const s = sa + ((sb - sa) * i) / 8;
        top.push([X(s), y0(s)]);
        bot.push([X(s), y1(s)]);
      }
      const sc = (sa + sb) / 2;
      boxes.push({
        key: `c${ci}-${def.id}`,
        def,
        path: `M${[...top, ...bot.reverse()].map((p) => `${f(p[0])},${f(p[1])}`).join(' L')} Z`,
        x0: X(sa),
        x1: X(sb),
        top: y0(sc),
        floor: y1(sc),
        floorAt: (x: number) => y1(sAt(x)),
        stern: atStern,
      });
    };
    const capitaine: RoomDef = {
      id: 'cab-capitaine',
      label: 'Cabine du capitaine',
      short: 'Capitaine',
      weight: 1,
      target: 'crew',
      post: 'Capitaine',
    };
    const contremaitre: RoomDef = {
      id: 'cab-contremaitre',
      label: 'Cabine du contremaître',
      short: 'Contremaître',
      weight: 1,
      target: 'crew',
      post: 'Contremaître',
    };
    // Postes vacants : la pièce change d'usage.
    const capRoom: RoomDef = fit.has('Capitaine')
      ? capitaine
      : {
          id: 'carre',
          label: 'Carré des officiers',
          short: 'Carré',
          weight: 1,
          target: 'map',
          kind: 'charts',
        };
    const cmRoom: RoomDef = fit.has('Contremaître')
      ? contremaitre
      : {
          id: 'reserve-poupe',
          label: 'Réserve',
          weight: 1,
          target: 'hold',
          kind: 'food',
        };
    const sa = c.a + 0.012;
    const sb = c.b - 0.008;
    if (stern) {
      if (c.stepped) {
        // Dunette : le capitaine en haut, à l'arrière ; dessous, le
        // contremaître et la salle des cartes.
        const mid = (s: number) => deck(s) - c.hLow(s) * VC;
        mk(capRoom, sa, c.split - 0.006, roof, mid, true);
        mk(cmRoom, sa, c.split - 0.006, (s) => mid(s) + 4, base, true);
        mk(
          {
            id: 'cartes',
            label: 'Salle des cartes',
            short: 'Cartes',
            weight: 1,
            target: 'map',
            kind: 'charts',
          },
          c.split + 0.006,
          sb,
          roof,
          base
        );
      } else if (c.h >= 5) {
        const mid = (s: number) => (roof(s) + base(s)) / 2;
        mk(capRoom, sa, sb, roof, mid, true);
        mk(cmRoom, sa, sb, (s) => mid(s) + 4, base, true);
      } else {
        const cut = sa + (sb - sa) * 0.56;
        mk(capRoom, sa, cut, roof, base, true);
        mk(cmRoom, cut, sb, roof, base);
      }
    } else if (c.shape === 'tower' || c.h >= 4) {
      // Batterie haute : les canons du pont supérieur quand le navire n'a pas
      // de pont supérieur intérieur ; sinon la tour sert de poste d'observation.
      const battery: RoomDef =
        fit.guns('superieur') && build.ponts < 2
          ? {
              id: 'tour-proue',
              label: 'Batterie haute',
              short: 'Batterie',
              weight: 1,
              target: 'combat',
              kind: 'guns',
              deck: 'superieur',
            }
          : {
              id: 'observation',
              label: "Poste d'observation",
              short: 'Observation',
              weight: 1,
              target: 'map',
              kind: 'lookout',
            };
      if (c.h >= 7) {
        const mid = (s: number) => (roof(s) + base(s)) / 2;
        mk(
          {
            id: 'observation',
            label: "Poste d'observation",
            short: 'Observation',
            weight: 1,
            target: 'map',
            kind: 'lookout',
          },
          sa,
          sb,
          roof,
          mid
        );
        mk(
          battery.kind === 'guns'
            ? battery
            : {
                id: 'reserve-proue',
                label: 'Réserve',
                weight: 1,
                target: 'hold',
                kind: 'food',
              },
          sa,
          sb,
          (s) => mid(s) + 4,
          base
        );
      } else mk(battery, sa, sb, roof, base);
    } else
      mk(
        {
          id: 'gaillard',
          label: "Gaillard d'avant",
          short: 'Gaillard',
          weight: 1,
          kind: 'forecastle',
        },
        sa,
        sb,
        roof,
        base
      );
  });

  // --- Dessin --------------------------------------------------------------------
  const roomEls: ReactElement[] = [];
  const plaques: ReactElement[] = [];
  const hoverPlaque: ReactElement[] = [];
  for (const bx of boxes) {
    const active = hover === bx.key;
    const clickable = !!bx.def.target && !!onRoom;
    const members = bx.def.post
      ? (byPost.get(bx.def.post) ?? [])
      : bx.def.kind === 'quarters'
        ? quarters
        : [];
    roomEls.push(
      <g
        key={bx.key}
        onPointerEnter={() => setHover(bx.key)}
        onPointerLeave={() => setHover((h0) => (h0 === bx.key ? null : h0))}
        onClick={clickable ? () => onRoom!(bx.def.target!) : undefined}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
      >
        <title>{bx.def.label}</title>
        <path d={bx.path} fill={`url(#${uid}-wall)`} />
        <path d={bx.path} fill={`url(#${uid}-planks)`} opacity={0.55} />
        {/* Lanterne et sa lumière chaude. */}
        <ellipse
          cx={f((bx.x0 + bx.x1) / 2)}
          cy={f(bx.top + (bx.floor - bx.top) * 0.35)}
          rx={f(Math.min(90, (bx.x1 - bx.x0) * 0.6))}
          ry={f((bx.floor - bx.top) * 0.7)}
          fill={`url(#${uid}-glow)`}
          style={{ pointerEvents: 'none' }}
        />
        <g style={{ pointerEvents: 'none' }}>
          <Furniture bx={bx} doc={doc} build={build} members={members} />
        </g>
        <path
          d={bx.path}
          fill={active ? '#f0c869' : 'transparent'}
          fillOpacity={active ? 0.13 : 0}
          stroke={active ? '#f0c869' : '#120b07'}
          strokeWidth={active ? 2.4 : 1.6}
        />
      </g>
    );
    // Plaque de laiton avec le nom de la salle ; survolée, elle grandit et
    // montre le nom complet, par-dessus les salles voisines.
    const w = bx.x1 - bx.x0;
    const fs = active ? 19 : 12.5;
    const label =
      !active && w - 12 < bx.def.label.length * fs * 0.62
        ? (bx.def.short ?? bx.def.label)
        : bx.def.label;
    const tw = active
      ? label.length * fs * 0.62 + 18
      : Math.min(w - 8, label.length * fs * 0.62 + 12);
    if (tw > 20)
      (active ? hoverPlaque : plaques).push(
        <g key={`p${bx.key}`} style={{ pointerEvents: 'none' }}>
          <rect
            x={f((bx.x0 + bx.x1) / 2 - tw / 2)}
            y={f(bx.top + 4)}
            width={f(tw)}
            height={fs + 6}
            rx={3}
            fill="#1a110a"
            fillOpacity={0.82}
            stroke={active ? '#f0c869' : '#8a6a3a'}
            strokeWidth={active ? 1.4 : 0.8}
          />
          <text
            x={f((bx.x0 + bx.x1) / 2)}
            y={f(bx.top + 5 + fs)}
            textAnchor="middle"
            fontSize={fs}
            fill={active ? '#ffe3a1' : '#f1e3c6'}
            textLength={
              label.length * fs * 0.62 > tw - 8 ? f(tw - 8) : undefined
            }
            lengthAdjust="spacingAndGlyphs"
            style={{ fontFamily: 'Cinzel, serif', fontWeight: 600 }}
          >
            {label}
          </text>
        </g>
      );
  }

  // Cloisons entre salles (planches verticales).
  const bulkheads = boxes.map((bx) => (
    <line
      key={`b${bx.key}`}
      x1={f(bx.x1)}
      y1={f(bx.top)}
      x2={f(bx.x1)}
      y2={f(bx.floorAt(bx.x1 - 1))}
      stroke="#3a2617"
      strokeWidth={3}
    />
  ));

  // Mâts : de l'emplanture sur la quille jusqu'au-dessus du pont.
  const mastEls = spec.masts.map((s, k) => {
    const x = X(s);
    const yTop = deck(s) - (11 + (k === 1 ? 2 : 0)) * U;
    return (
      <g key={`m${s}`} style={{ pointerEvents: 'none' }}>
        <rect
          x={f(x - 5)}
          y={f(yTop)}
          width={10}
          height={f(keel(s) - yTop - 4)}
          fill={`url(#${uid}-mast)`}
        />
        {[0.25, 0.55, 0.8].map((t) => (
          <rect
            key={t}
            x={f(x - 5.6)}
            y={f(yTop + (deck(s) - yTop) * t)}
            width={11.2}
            height={2.2}
            fill="#b8893a"
            opacity={0.6}
          />
        ))}
        {/* Vergue et voile ferlée, estompées vers le haut. */}
        <rect
          x={f(x - 60)}
          y={f(yTop + 30)}
          width={120}
          height={4}
          rx={2}
          fill="#5a3e28"
          opacity={0.35}
        />
        <path
          d={`M${f(x - 56)},${f(yTop + 34)} q56,14 112,0 l0,6 q-56,12 -112,0 Z`}
          fill="#e8dcc0"
          opacity={0.18}
        />
      </g>
    );
  });

  // Échelles et écoutilles entre les ponts, à l'écart des mâts.
  const ladders: ReactElement[] = [];
  const ladderS = [0.42, 0.66].map((s) =>
    spec.masts.some((m) => Math.abs(m - s) < 0.04) ? s + 0.05 : s
  );
  interior.slice(0, -1).forEach((_, li) => {
    const s = ladderS[li % 2];
    const x = X(s);
    const y0 = floorY(li, s);
    const y1 = floorY(li + 1, s);
    const y2 = Math.min(floorY(li + 2, s), keel(s) - 8);
    ladders.push(
      <g key={`l${li}`} style={{ pointerEvents: 'none' }}>
        <rect
          x={f(x - 10)}
          y={f(y1 - 2.5)}
          width={20}
          height={5}
          fill="#120b07"
        />
        <line
          x1={f(x - 7)}
          y1={f(y1 - 10)}
          x2={f(x - 9)}
          y2={f(y2)}
          stroke="#8a6a44"
          strokeWidth={2.2}
        />
        <line
          x1={f(x + 7)}
          y1={f(y1 - 10)}
          x2={f(x + 9)}
          y2={f(y2)}
          stroke="#8a6a44"
          strokeWidth={2.2}
        />
        {Array.from({ length: Math.floor((y2 - y1 + 10) / 7) }, (_, k) => (
          <line
            key={k}
            x1={f(x - 8)}
            y1={f(y1 - 6 + k * 7)}
            x2={f(x + 8)}
            y2={f(y1 - 6 + k * 7)}
            stroke="#a07c50"
            strokeWidth={1.6}
          />
        ))}
        {li === 0 && (
          <rect
            x={f(x - 12)}
            y={f(y0 - 3)}
            width={24}
            height={4}
            fill="#3a2617"
          />
        )}
      </g>
    );
  });

  // Pont supérieur : pavois, roue de gouvernail, cabestan, cœur d'Aether.
  const rail: ReactElement[] = [];
  {
    const inCastle = (s: number) =>
      pr.castles.some((c) => s > c.a - 0.005 && s < c.b + 0.005);
    for (let i = 0; i <= 90; i++) {
      const s = 0.01 + (i / 90) * 0.975;
      if (inCastle(s)) continue;
      rail.push(
        <line
          key={`r${i}`}
          x1={f(X(s))}
          y1={f(deck(s))}
          x2={f(X(s))}
          y2={f(deck(s) - 18)}
          stroke="#b8893a"
          strokeWidth={1.4}
          opacity={0.8}
        />
      );
    }
    const top: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const s = i / 60;
      top.push([X(s), deck(s) - 18]);
    }
    rail.push(
      <path
        key="rail"
        d={`M${top.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')}`}
        fill="none"
        stroke="#b8893a"
        strokeWidth={2}
        opacity={0.75}
      />
    );
    // Rambardes sur les châteaux.
    pr.castles.forEach((c, ci) => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const s = c.a + ((c.b - c.a) * i) / 16;
        pts.push([X(s), deck(s) - c.height(s) * VC - 16]);
      }
      rail.push(
        <path
          key={`cr${ci}`}
          d={`M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')}`}
          fill="none"
          stroke="#b8893a"
          strokeWidth={1.8}
          opacity={0.75}
        />
      );
    });
  }
  const deckProps: ReactElement[] = [];
  {
    // Roue de gouvernail à l'avant de la dunette.
    const st = pr.castles.find((c) => c.a < 0.05);
    const sh = st ? Math.min(st.b - 0.03, st.a + 0.15) : 0.12;
    const yh = st ? deck(sh) - st.height(sh) * VC : deck(sh);
    const xh = X(sh);
    deckProps.push(
      <g key="helm">
        <line
          x1={f(xh)}
          y1={f(yh)}
          x2={f(xh)}
          y2={f(yh - 18)}
          stroke="#5a3e28"
          strokeWidth={3}
        />
        <circle
          cx={f(xh)}
          cy={f(yh - 22)}
          r={10}
          fill="none"
          stroke="#7a5534"
          strokeWidth={2.4}
        />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return (
            <line
              key={k}
              x1={f(xh + Math.cos(a) * 3)}
              y1={f(yh - 22 + Math.sin(a) * 3)}
              x2={f(xh + Math.cos(a) * 14)}
              y2={f(yh - 22 + Math.sin(a) * 14)}
              stroke="#7a5534"
              strokeWidth={1.6}
            />
          );
        })}
      </g>
    );
    // Cœur d'Aether sur le pont, conduite vers la cale.
    const sr = spec.reactor;
    const xr = X(sr);
    const yr = deck(sr);
    deckProps.push(
      <g key="aether">
        <rect
          x={f(xr - 13)}
          y={f(yr - 50)}
          width={26}
          height={50}
          rx={5}
          fill="#2e2a27"
          stroke="#b8893a"
          strokeWidth={1.6}
        />
        <rect
          x={f(xr - 8)}
          y={f(yr - 45)}
          width={16}
          height={40}
          rx={4}
          fill="#6fe8ff"
          opacity={0.85}
        />
        <rect
          x={f(xr - 8)}
          y={f(yr - 45)}
          width={16}
          height={40}
          rx={4}
          fill={`url(#${uid}-aether)`}
        />
        {[-38, -26, -14].map((d) => (
          <rect
            key={d}
            x={f(xr - 14)}
            y={f(yr + d)}
            width={28}
            height={2.6}
            fill="#b8893a"
          />
        ))}
        <path
          d={`M${f(xr - 15)},${f(yr - 50)} L${f(xr)},${f(yr - 64)} L${f(xr + 15)},${f(yr - 50)} Z`}
          fill="#a8603a"
        />
      </g>
    );
    // Cheminées.
    for (const s of spec.chimneys) {
      const x = X(s);
      const y = deck(s);
      deckProps.push(
        <g key={`ch${s}`}>
          <rect
            x={f(x - 7)}
            y={f(y - 64)}
            width={14}
            height={64}
            fill="#3a3430"
          />
          <rect
            x={f(x - 9)}
            y={f(y - 68)}
            width={18}
            height={6}
            fill="#b8893a"
          />
          <circle
            cx={f(x + 6)}
            cy={f(y - 80)}
            r={9}
            fill="#d8ccb8"
            opacity={0.25}
          />
          <circle
            cx={f(x + 16)}
            cy={f(y - 96)}
            r={12}
            fill="#d8ccb8"
            opacity={0.15}
          />
        </g>
      );
    }
    // Cabestan entre les mâts.
    const sc = (spec.masts[0] + spec.masts[1]) / 2;
    if (Math.abs(sc - sr) > 0.05) {
      const x = X(sc);
      const y = deck(sc);
      deckProps.push(
        <g key="cap">
          <rect
            x={f(x - 7)}
            y={f(y - 20)}
            width={14}
            height={20}
            rx={3}
            fill="#6a4a2e"
          />
          <rect
            x={f(x - 16)}
            y={f(y - 17)}
            width={32}
            height={3}
            fill="#8a6a44"
          />
        </g>
      );
    }
  }

  // Propulseurs sous la coque.
  const pods = spec.pods.map((pd, k) => {
    const s = pd.s;
    const x = X(s);
    const y = keel(s);
    const sz = pd.size * U;
    if (pd.kind === 'rear') {
      const xs = X(0, 0.3);
      const ys = keel(0.02) - 0.6 * V;
      return (
        <g key={`pod${k}`} style={{ pointerEvents: 'none' }}>
          <rect
            x={f(xs - sz * 2.2)}
            y={f(ys - sz * 0.55)}
            width={f(sz * 2.4)}
            height={f(sz * 1.1)}
            rx={f(sz * 0.4)}
            fill="#7a6040"
            stroke="#b8893a"
            strokeWidth={1.4}
          />
          <ellipse
            cx={f(xs - sz * 2.2)}
            cy={f(ys)}
            rx={f(sz * 0.25)}
            ry={f(sz * 0.5)}
            fill="#6fe8ff"
            opacity={0.85}
          />
          <ellipse
            cx={f(xs - sz * 2.6)}
            cy={f(ys)}
            rx={f(sz * 0.6)}
            ry={f(sz * 0.4)}
            fill={`url(#${uid}-jet)`}
          />
        </g>
      );
    }
    const tilt = pd.kind === 'angled' ? -20 : 0;
    return (
      <g
        key={`pod${k}`}
        transform={`rotate(${tilt} ${f(x)} ${f(y)})`}
        style={{ pointerEvents: 'none' }}
      >
        <rect
          x={f(x - 3)}
          y={f(y - 4)}
          width={6}
          height={f(sz * 0.7)}
          fill="#3a3430"
        />
        <rect
          x={f(x - sz * 0.6)}
          y={f(y + sz * 0.5)}
          width={f(sz * 1.2)}
          height={f(sz * 1.5)}
          rx={f(sz * 0.45)}
          fill="#7a6040"
          stroke="#b8893a"
          strokeWidth={1.4}
        />
        <rect
          x={f(x - sz * 0.62)}
          y={f(y + sz * 1.1)}
          width={f(sz * 1.24)}
          height={2.2}
          fill="#b8893a"
        />
        <ellipse
          cx={f(x)}
          cy={f(y + sz * 2)}
          rx={f(sz * 0.5)}
          ry={f(sz * 0.18)}
          fill="#6fe8ff"
          opacity={0.9}
        />
        <ellipse
          cx={f(x)}
          cy={f(y + sz * 2.4)}
          rx={f(sz * 0.55)}
          ry={f(sz * 0.5)}
          fill={`url(#${uid}-jet)`}
        />
      </g>
    );
  });

  const clipCastles = pr.castles.map((c, i) => <path key={i} d={c.path} />);

  return (
    <g>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path d={pr.outline} />
          {clipCastles}
        </clipPath>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5e3d24" />
          <stop offset="0.75" stopColor="#3e2716" />
          <stop offset="1" stopColor="#2a1a0f" />
        </linearGradient>
        <pattern
          id={`${uid}-planks`}
          width="60"
          height="9"
          patternUnits="userSpaceOnUse"
        >
          <rect width="60" height="9" fill="none" />
          <line
            x1="0"
            y1="8.5"
            x2="60"
            y2="8.5"
            stroke="#1e130b"
            strokeWidth="1"
          />
          <line
            x1="22"
            y1="0"
            x2="22"
            y2="8.5"
            stroke="#1e130b"
            strokeWidth="0.8"
          />
          <rect
            x="34"
            y="2"
            width="20"
            height="3"
            fill="#6e4a2c"
            opacity="0.35"
          />
        </pattern>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor="#ffc46a" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#ffa040" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffa040" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-mast`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3e28" stopOpacity="0" />
          <stop offset="0.25" stopColor="#5a3e28" stopOpacity="0.85" />
          <stop offset="1" stopColor="#4a3220" stopOpacity="1" />
        </linearGradient>
        <linearGradient id={`${uid}-aether`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#2aa8d8" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id={`${uid}-jet`}>
          <stop offset="0" stopColor="#9ff4ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#6fe8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {mastEls}
      {/* Fond de la coque et des châteaux. */}
      <path d={pr.outline} fill="#1d130c" />
      {pr.castles.map((c, i) => (
        <path key={`cb${i}`} d={c.path} fill="#1d130c" />
      ))}
      {pods}
      <g clipPath={`url(#${uid}-clip)`}>
        {/* Charpente visible là où il n'y a pas de salle : bordé, membrures. */}
        <path
          d={pr.outline}
          fill={`url(#${uid}-planks)`}
          opacity={0.4}
          style={{ pointerEvents: 'none' }}
        />
        {Array.from({ length: 46 }, (_, i) => {
          const sr = 0.01 + (i / 45) * 0.98;
          return (
            <line
              key={`rib${i}`}
              x1={f(X(sr))}
              y1={f(deck(sr) - 4)}
              x2={f(X(sr))}
              y2={f(keel(sr) + 4)}
              stroke="#3a2617"
              strokeWidth={4}
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}
        {roomEls}
        {bulkheads}
        {floorLines.map((d, i) => (
          <g key={`fl${i}`} style={{ pointerEvents: 'none' }}>
            <path d={d} fill="none" stroke="#6b4a2f" strokeWidth={6} />
            <path
              d={d}
              fill="none"
              stroke="#8a6440"
              strokeWidth={1.4}
              transform="translate(0,-2.2)"
            />
          </g>
        ))}
        {ladders}
        {spec.masts.map((s) => (
          <rect
            key={`mi${s}`}
            x={f(X(s) - 5)}
            y={f(deck(s))}
            width={10}
            height={f(keel(s) - deck(s))}
            fill="#5a3e28"
            stroke="#2a1a10"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
        ))}
      </g>
      {/* Bordé coupé : coque, châteaux, quille. */}
      <path
        d={pr.outline}
        fill="none"
        stroke={coque.base}
        strokeWidth={9}
        strokeLinejoin="round"
        style={{ pointerEvents: 'none' }}
      />
      <path
        d={pr.outline}
        fill="none"
        stroke={coque.dark}
        strokeWidth={2}
        transform="translate(0,0)"
        style={{ pointerEvents: 'none' }}
      />
      {pr.castles.map((c, i) => (
        <g key={`cw${i}`} style={{ pointerEvents: 'none' }}>
          <path
            d={c.path}
            fill="none"
            stroke={poupe.base}
            strokeWidth={7}
            strokeLinejoin="round"
          />
          <path d={c.path} fill="none" stroke={poupe.dark} strokeWidth={1.6} />
        </g>
      ))}
      <path
        d={pr.keelPath}
        fill="none"
        stroke={quille.base}
        strokeWidth={10}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      {/* Pont supérieur. */}
      <path
        d={`M${Array.from({ length: 61 }, (_, i) => `${f(X(i / 60))},${f(deck(i / 60))}`).join(' L')}`}
        fill="none"
        stroke="#7a5534"
        strokeWidth={5}
        style={{ pointerEvents: 'none' }}
      />
      <g style={{ pointerEvents: 'none' }}>
        {rail}
        {deckProps}
      </g>
      {plaques}
      {hoverPlaque}
      {levelMarks.map((m) => (
        <text
          key={m.label}
          x={f(pr.bounds.minX - 6)}
          y={f(m.y + 4)}
          textAnchor="end"
          fontSize={12}
          fill="#e9d8b6"
          opacity={0.85}
          style={{ fontFamily: 'Cinzel, serif', pointerEvents: 'none' }}
        >
          {m.label}
        </text>
      ))}
      <path
        d={pr.outline}
        fill="none"
        stroke="#0e0906"
        strokeWidth={1.6}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}

// --- Mobilier des salles ---------------------------------------------------------

type Member = ArpenteurDoc['crew']['members'][number];

/** Personnage debout (pieds en x, y), pastille d'initiales au-dessus. */
function Person({
  x,
  y,
  m,
  k,
}: {
  x: number;
  y: number;
  m: Member;
  k: number;
}) {
  const coats = ['#7a3a2a', '#2f4f5a', '#5a4a2a', '#3a3a5a', '#2f5a3a'];
  const coat = coats[k % coats.length];
  const ring = loyaltyColor(m.loyalty, foldKey);
  return (
    <g>
      <line
        x1={f(x - 2.4)}
        y1={f(y)}
        x2={f(x - 2)}
        y2={f(y - 12)}
        stroke="#2a1a10"
        strokeWidth={3}
      />
      <line
        x1={f(x + 2.4)}
        y1={f(y)}
        x2={f(x + 2)}
        y2={f(y - 12)}
        stroke="#2a1a10"
        strokeWidth={3}
      />
      <rect
        x={f(x - 5)}
        y={f(y - 25)}
        width={10}
        height={14}
        rx={3}
        fill={coat}
      />
      <circle cx={f(x)} cy={f(y - 29)} r={4.2} fill="#d8b48a" />
      <circle
        cx={f(x)}
        cy={f(y - 45)}
        r={10}
        fill="#1b120c"
        stroke={ring}
        strokeWidth={2}
      />
      {POST_ICONS[canonicalPost(m.post)]?.(x, y - 45) ?? (
        <text
          x={f(x)}
          y={f(y - 41.8)}
          textAnchor="middle"
          fontSize={8.6}
          fill="#f4e6c8"
          style={{ fontWeight: 700 }}
        >
          {initials(m.name)}
        </text>
      )}
      <title>
        {[m.name, canonicalPost(m.post)].filter(Boolean).join(' · ')}
      </title>
    </g>
  );
}

/** Emblème du poste dans la bulle (centre cx, cy ; rayon utile ≈ 6). */
const POST_ICONS: Record<string, (cx: number, cy: number) => ReactElement> = {
  // Tricorne.
  Capitaine: (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}>
      <path
        d="M-6.2,1.6 Q-4.5,-4.6 0,-3.6 Q4.5,-4.6 6.2,1.6 Q0,4.2 -6.2,1.6 Z"
        fill="#1a1410"
        stroke="#e8bd4f"
        strokeWidth={0.9}
      />
      <circle cx={0} cy={-0.6} r={1.1} fill="#e8bd4f" />
    </g>
  ),
  // Sifflet de maître d'équipage.
  Contremaître: (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}>
      <path
        d="M-5.5,-1.6 L2,-1.6 A2.6,2.6 0 1 1 2,3.6 L-5.5,1.2 Z"
        fill="#c9a24a"
        stroke="#f4e6c8"
        strokeWidth={0.6}
      />
      <circle cx={2.6} cy={1} r={1} fill="#1b120c" />
      <path
        d="M-5.5,-0.2 Q-6.8,-4 -3,-5.2"
        fill="none"
        stroke="#f4e6c8"
        strokeWidth={0.7}
      />
    </g>
  ),
  // Canon sur son affût.
  'Maître canonnier': (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}>
      <path
        d="M-5.8,-1.6 L4.6,-3.4 L5.2,-0.8 L-5.4,1.2 Z"
        fill="#2b2b2e"
        stroke="#bfc3c7"
        strokeWidth={0.6}
      />
      <circle
        cx={-1.6}
        cy={2.6}
        r={2.2}
        fill="#7a5130"
        stroke="#f4e6c8"
        strokeWidth={0.5}
      />
      <circle cx={-1.6} cy={2.6} r={0.6} fill="#f4e6c8" />
    </g>
  ),
  // Trousse de secours.
  Chirurgien: (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}>
      <path
        d="M-2,-4.2 h4 v1.4"
        fill="none"
        stroke="#f4e6c8"
        strokeWidth={0.8}
      />
      <rect x={-5.4} y={-3} width={10.8} height={7.4} rx={1.4} fill="#f4efe6" />
      <rect x={-1} y={-1.8} width={2} height={5} fill="#c8352b" />
      <rect x={-2.5} y={-0.3} width={5} height={2} fill="#c8352b" />
    </g>
  ),
  // Longue-vue.
  Guetteur: (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25) rotate(-25)`}>
      <rect x={-6} y={-1.2} width={4.4} height={2.4} fill="#c9a24a" />
      <rect x={-1.8} y={-1.6} width={4.2} height={3.2} fill="#7a5130" />
      <rect x={2.4} y={-2.1} width={3.6} height={4.2} rx={0.6} fill="#c9a24a" />
    </g>
  ),
  // Sabres croisés.
  Combattant: (cx, cy) => (
    <g
      transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}
      strokeLinecap="round"
    >
      <path d="M-4.6,4.4 L4.4,-4.6" stroke="#dfe3e6" strokeWidth={1.3} />
      <path d="M4.6,4.4 L-4.4,-4.6" stroke="#dfe3e6" strokeWidth={1.3} />
      <path
        d="M-5.6,2.4 L-2.4,5.6 M5.6,2.4 L2.4,5.6"
        stroke="#c9a24a"
        strokeWidth={1.3}
      />
    </g>
  ),
  // Seau et serpillière.
  Mousse: (cx, cy) => (
    <g transform={`translate(${f(cx)},${f(cy)}) scale(1.25)`}>
      <path d="M2.8,-5.6 L0.6,1" stroke="#c9a24a" strokeWidth={1} />
      <path
        d="M-5,-0.6 L1.6,-0.6 L0.8,5 L-4.2,5 Z"
        fill="#7a5130"
        stroke="#f4e6c8"
        strokeWidth={0.5}
      />
      <path d="M-5,1.2 L1.4,1.2" stroke="#c9a24a" strokeWidth={0.7} />
    </g>
  ),
};

function Barrel({
  x,
  y,
  s = 1,
  c = '#7a5130',
}: {
  x: number;
  y: number;
  s?: number;
  c?: string;
}) {
  return (
    <g>
      <rect
        x={f(x - 6 * s)}
        y={f(y - 15 * s)}
        width={f(12 * s)}
        height={f(15 * s)}
        rx={f(4 * s)}
        fill={c}
        stroke="#2a1a10"
        strokeWidth={0.8}
      />
      <line
        x1={f(x - 6 * s)}
        y1={f(y - 11 * s)}
        x2={f(x + 6 * s)}
        y2={f(y - 11 * s)}
        stroke="#2a2420"
        strokeWidth={1.4}
      />
      <line
        x1={f(x - 6 * s)}
        y1={f(y - 4 * s)}
        x2={f(x + 6 * s)}
        y2={f(y - 4 * s)}
        stroke="#2a2420"
        strokeWidth={1.4}
      />
    </g>
  );
}

function Crate({
  x,
  y,
  w = 14,
  h = 12,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
}) {
  return (
    <g>
      <rect
        x={f(x - w / 2)}
        y={f(y - h)}
        width={w}
        height={h}
        fill="#8c6a43"
        stroke="#2a1a10"
        strokeWidth={0.9}
      />
      <line
        x1={f(x - w / 2)}
        y1={f(y - h)}
        x2={f(x + w / 2)}
        y2={f(y)}
        stroke="#5a4028"
        strokeWidth={1}
      />
      <line
        x1={f(x - w / 2)}
        y1={f(y)}
        x2={f(x + w / 2)}
        y2={f(y - h)}
        stroke="#5a4028"
        strokeWidth={1}
      />
    </g>
  );
}

function Lantern({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line
        x1={f(x)}
        y1={f(y)}
        x2={f(x)}
        y2={f(y + 6)}
        stroke="#2a2420"
        strokeWidth={1}
      />
      <rect
        x={f(x - 3.2)}
        y={f(y + 6)}
        width={6.4}
        height={8}
        rx={1.5}
        fill="#ffcf7a"
        stroke="#6b4a2f"
        strokeWidth={1}
      />
      <circle cx={f(x)} cy={f(y + 10)} r={7} fill="#ffcf7a" opacity={0.25} />
    </g>
  );
}

function Cannon({ x, y }: { x: number; y: number }) {
  // Vu de face : affût, roues et gueule tournée vers le sabord.
  return (
    <g>
      <path
        d={`M${f(x - 11)},${f(y - 3)} L${f(x - 8)},${f(y - 12)} L${f(x + 8)},${f(y - 12)} L${f(x + 11)},${f(y - 3)} Z`}
        fill="#5a3a22"
        stroke="#2a1a10"
        strokeWidth={0.8}
      />
      <circle cx={f(x - 7)} cy={f(y - 3)} r={3} fill="#3a2617" />
      <circle cx={f(x + 7)} cy={f(y - 3)} r={3} fill="#3a2617" />
      <circle
        cx={f(x)}
        cy={f(y - 15)}
        r={6.5}
        fill="#2e3236"
        stroke="#5a6068"
        strokeWidth={1.4}
      />
      <circle cx={f(x)} cy={f(y - 15)} r={3} fill="#0c0d0e" />
    </g>
  );
}

function Furniture({
  bx,
  doc,
  build,
  members,
}: {
  bx: Box;
  doc: ArpenteurDoc;
  build: Build;
  members: Member[];
}) {
  const { def } = bx;
  const w = bx.x1 - bx.x0;
  const cx = (bx.x0 + bx.x1) / 2;
  const fy = bx.floor;
  const h = bx.floor - bx.top;
  const out: ReactNode[] = [];
  const at = (t: number) => bx.x0 + w * t;
  const flo = (x: number) => bx.floorAt(x);
  // Lanterne au plafond.
  out.push(<Lantern key="lan" x={cx} y={bx.top + 18} />);

  // Fenêtres de poupe / sabords dans le mur du fond.
  const port = (x: number, y: number, k: string, sky = true) => (
    <g key={k}>
      <rect
        x={f(x - 6)}
        y={f(y - 6)}
        width={12}
        height={10}
        fill={sky ? '#9fc4d8' : '#1a120c'}
        opacity={sky ? 0.55 : 1}
        stroke="#2a1a10"
        strokeWidth={1.2}
      />
      <line
        x1={f(x)}
        y1={f(y - 6)}
        x2={f(x)}
        y2={f(y + 4)}
        stroke="#2a1a10"
        strokeWidth={0.8}
      />
    </g>
  );

  const placePeople = (x0: number, x1: number) => {
    const n = members.length;
    if (!n) return;
    const space = 20;
    const fit = Math.max(1, Math.floor((x1 - x0) / space));
    const shown = members.slice(0, fit);
    const start = (x0 + x1) / 2 - ((shown.length - 1) * space) / 2;
    shown.forEach((m, i) => {
      const x = start + i * space;
      out.push(<Person key={m.id} x={x} y={flo(x)} m={m} k={i} />);
    });
    if (n > fit)
      out.push(
        <text
          key="more"
          x={f(x1 - 4)}
          y={f(flo(x1 - 4) - 30)}
          textAnchor="end"
          fontSize={9}
          fill="#f1e3c6"
          style={{ fontWeight: 700 }}
        >
          +{n - fit}
        </text>
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
        def.id === 'canons-flanc' || def.id === 'canons-inf'
          ? n
          : def.id === 'tour-proue'
            ? Math.min(n, 2)
            : Math.min(n, 1);
      const slots = Math.max(1, Math.min(8, Math.floor((w - 16) / 30)));
      for (let k = 0; k < slots; k++) {
        const x = bx.x0 + 8 + ((k + 0.5) * (w - 16)) / slots;
        const y = flo(x);
        out.push(port(x, y - 22, `po${k}`, k >= per));
        if (k < per) out.push(<Cannon key={`c${k}`} x={x} y={y} />);
      }
      // Boulets en pyramide et refouloir.
      if (w > 60) {
        const x = bx.x1 - 12;
        const y = flo(x);
        [
          [0, 0],
          [5, 0],
          [-5, 0],
          [2.5, -4.5],
          [-2.5, -4.5],
          [0, -9],
        ].forEach(([dx, dy], k) =>
          out.push(
            <circle
              key={`b${k}`}
              cx={f(x + dx)}
              cy={f(y - 2.4 + dy)}
              r={2.4}
              fill="#2e3236"
            />
          )
        );
      }
      break;
    }
    case 'powder': {
      const n = doc.combat.powderReserve;
      const fit = Math.max(0, Math.floor((w - 20) / 14));
      for (let k = 0; k < Math.min(n, fit * 2); k++) {
        const row = Math.floor(k / fit);
        const x = bx.x0 + 14 + (k % fit) * 14 + row * 7;
        out.push(<Barrel key={`p${k}`} x={x} y={flo(x) - row * 15} />);
      }
      out.push(
        <g key="warn">
          <circle cx={f(bx.x1 - 10)} cy={f(bx.top + 26)} r={4} fill="#ff5a3a" />
          <circle
            cx={f(bx.x1 - 10)}
            cy={f(bx.top + 26)}
            r={10}
            fill="#ff5a3a"
            opacity={0.2}
          />
        </g>
      );
      break;
    }
    case 'ammo': {
      const total = doc.combat.ammo.reduce((s, a) => s + a.count, 0);
      const piles = Math.max(
        1,
        Math.min(Math.floor((w - 20) / 24), Math.ceil(total / 6))
      );
      for (let p = 0; p < piles; p++) {
        const x = bx.x0 + 16 + p * 24;
        const y = flo(x);
        const rows = Math.min(4, 1 + Math.floor(total / (piles * 3)));
        for (let r = 0; r < rows; r++)
          for (let i = 0; i < rows - r; i++)
            out.push(
              <circle
                key={`a${p}-${r}-${i}`}
                cx={f(x + (i - (rows - r - 1) / 2) * 5.2)}
                cy={f(y - 2.6 - r * 4.5)}
                r={2.6}
                fill="#2e3236"
                stroke="#4a5058"
                strokeWidth={0.5}
              />
            );
      }
      out.push(<Crate key="ac" x={bx.x1 - 14} y={flo(bx.x1 - 14)} />);
      break;
    }
    case 'food': {
      const n = Math.max(
        2,
        Math.min(
          12,
          doc.hold.items.filter((i) =>
            /rago|nugget|légume|legume|fruit|rassasie|caisson de/i.test(
              `${i.name} ${i.effect}`
            )
          ).length + 2
        )
      );
      for (let k = 0; k < n; k++) {
        const x =
          bx.x0 + 14 + (k % Math.max(1, Math.floor((w - 24) / 16))) * 16;
        const row = Math.floor(k / Math.max(1, Math.floor((w - 24) / 16)));
        if (row > 1) break;
        out.push(
          k % 3 === 2 ? (
            <Barrel key={`f${k}`} x={x} y={flo(x) - row * 12} c="#6a4a2e" />
          ) : (
            <Crate key={`f${k}`} x={x} y={flo(x) - row * 12} />
          )
        );
      }
      // Jambons et saucissons pendus.
      for (let k = 0; k < Math.min(4, Math.floor(w / 30)); k++) {
        const x = bx.x0 + 20 + k * 22;
        out.push(
          <g key={`h${k}`}>
            <line
              x1={f(x)}
              y1={f(bx.top + 4)}
              x2={f(x)}
              y2={f(bx.top + 14)}
              stroke="#2a1a10"
            />
            <ellipse
              cx={f(x)}
              cy={f(bx.top + 19)}
              rx={3.4}
              ry={6}
              fill="#8a3a2a"
            />
          </g>
        );
      }
      break;
    }
    case 'kitchen': {
      const x = at(0.3);
      const y = flo(x);
      out.push(
        <g key="stove">
          <rect
            x={f(x - 16)}
            y={f(y - 20)}
            width={32}
            height={20}
            fill="#6a3a2a"
            stroke="#2a1a10"
          />
          <rect
            x={f(x - 9)}
            y={f(y - 12)}
            width={18}
            height={9}
            rx={2}
            fill="#ff8a3a"
          />
          <rect
            x={f(x - 9)}
            y={f(y - 12)}
            width={18}
            height={9}
            rx={2}
            fill="#ffd27a"
            opacity={0.4}
          />
          <rect
            x={f(x + 7)}
            y={f(bx.top)}
            width={6}
            height={f(y - 20 - bx.top)}
            fill="#3a3430"
          />
          <path
            d={`M${f(x - 12)},${f(y - 20)} q0,-9 9,-9 l6,0 q9,0 9,9 Z`}
            fill="#4a4a4a"
          />
          <circle
            cx={f(x - 3)}
            cy={f(y - 32)}
            r={5}
            fill="#e8e0d0"
            opacity={0.25}
          />
        </g>
      );
      const xt = at(0.72);
      out.push(
        <g key="table">
          <rect
            x={f(xt - 16)}
            y={f(flo(xt) - 12)}
            width={32}
            height={3}
            fill="#8a6a44"
          />
          <line
            x1={f(xt - 13)}
            y1={f(flo(xt) - 9)}
            x2={f(xt - 13)}
            y2={f(flo(xt))}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <line
            x1={f(xt + 13)}
            y1={f(flo(xt) - 9)}
            x2={f(xt + 13)}
            y2={f(flo(xt))}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <ellipse
            cx={f(xt - 6)}
            cy={f(flo(xt) - 14)}
            rx={4}
            ry={2}
            fill="#c9a227"
          />
          <rect
            x={f(xt + 3)}
            y={f(flo(xt) - 19)}
            width={5}
            height={7}
            fill="#d8ccb0"
          />
        </g>
      );
      for (let k = 0; k < 3; k++)
        out.push(
          <g key={`pan${k}`}>
            <line
              x1={f(at(0.55) + k * 9)}
              y1={f(bx.top + 4)}
              x2={f(at(0.55) + k * 9)}
              y2={f(bx.top + 12)}
              stroke="#2a1a10"
            />
            <circle
              cx={f(at(0.55) + k * 9)}
              cy={f(bx.top + 16)}
              r={3.6}
              fill="#5a5a5a"
            />
          </g>
        );
      break;
    }
    case 'quarters': {
      // Hamacs entre les barrots, coffres de marin.
      const nH = Math.max(
        2,
        Math.min(Math.floor((w - 20) / 26), doc.crew.members.length || 3)
      );
      for (let k = 0; k < nH; k++) {
        const x0 = bx.x0 + 10 + k * ((w - 20) / nH);
        const x1 = x0 + (w - 20) / nH - 4;
        const yh = bx.top + Math.min(22, h * 0.35);
        out.push(
          <g key={`hm${k}`}>
            <line
              x1={f(x0)}
              y1={f(bx.top)}
              x2={f(x0 + 2)}
              y2={f(yh)}
              stroke="#6b4a2f"
              strokeWidth={1}
            />
            <line
              x1={f(x1)}
              y1={f(bx.top)}
              x2={f(x1 - 2)}
              y2={f(yh)}
              stroke="#6b4a2f"
              strokeWidth={1}
            />
            <path
              d={`M${f(x0 + 2)},${f(yh)} Q${f((x0 + x1) / 2)},${f(yh + 9)} ${f(x1 - 2)},${f(yh)}`}
              fill="none"
              stroke="#d8c8a6"
              strokeWidth={3}
            />
          </g>
        );
        out.push(
          <rect
            key={`ch${k}`}
            x={f((x0 + x1) / 2 - 6)}
            y={f(flo((x0 + x1) / 2) - 7)}
            width={12}
            height={7}
            rx={1.5}
            fill="#5a3a22"
            stroke="#2a1a10"
            strokeWidth={0.8}
          />
        );
      }
      placePeople(bx.x0 + 8, bx.x1 - 8);
      break;
    }
    case 'jail': {
      out.push(
        <rect
          key="bench"
          x={f(bx.x0 + 8)}
          y={f(fy - 8)}
          width={f(Math.min(26, w * 0.5))}
          height={3}
          fill="#6a4a2e"
        />
      );
      out.push(
        <ellipse
          key="straw"
          cx={f(cx + 6)}
          cy={f(fy - 1.5)}
          rx={12}
          ry={2.5}
          fill="#c9a24a"
          opacity={0.7}
        />
      );
      for (let x = bx.x0 + 6; x < bx.x1 - 4; x += 6)
        out.push(
          <line
            key={`bar${x}`}
            x1={f(x)}
            y1={f(bx.top + 20)}
            x2={f(x)}
            y2={f(flo(x))}
            stroke="#6d7278"
            strokeWidth={1.6}
          />
        );
      out.push(
        <line
          key="barh"
          x1={f(bx.x0 + 4)}
          y1={f(bx.top + 20)}
          x2={f(bx.x1 - 4)}
          y2={f(bx.top + 20)}
          stroke="#6d7278"
          strokeWidth={2}
        />
      );
      break;
    }
    case 'loot': {
      const n = Math.min(4, Math.max(1, Math.ceil(doc.cave.items.length / 3)));
      for (let k = 0; k < n; k++) {
        const x = bx.x0 + 16 + k * 26;
        if (x > bx.x1 - 12) break;
        const y = flo(x);
        out.push(
          <g key={`ch${k}`}>
            <ellipse
              cx={f(x)}
              cy={f(y - 10)}
              rx={14}
              ry={9}
              fill="#ffd25a"
              opacity={0.22}
            />
            <rect
              x={f(x - 10)}
              y={f(y - 11)}
              width={20}
              height={11}
              fill="#6a3a1e"
              stroke="#c9a227"
              strokeWidth={1.2}
            />
            <path
              d={`M${f(x - 10)},${f(y - 11)} q10,-9 20,0`}
              fill="#7a4a26"
              stroke="#c9a227"
              strokeWidth={1.2}
            />
            <circle cx={f(x - 3)} cy={f(y - 13)} r={2} fill="#ffd25a" />
            <circle cx={f(x + 3)} cy={f(y - 14)} r={2} fill="#ffd25a" />
          </g>
        );
      }
      doc.cave.items.slice(0, 6).forEach((_, k) => {
        const x = bx.x1 - 10 - k * 7;
        out.push(
          <path
            key={`g${k}`}
            d={`M${f(x)},${f(flo(x) - 9)} l3.5,3.5 l-3.5,4.5 l-3.5,-4.5 Z`}
            fill={['#e8bd4f', '#7fb5e6', '#b48cf0', '#9fd27a'][k % 4]}
          />
        );
      });
      break;
    }
    case 'charts': {
      const x = cx;
      const y = flo(x);
      out.push(
        <g key="map">
          <rect
            x={f(x - 22)}
            y={f(y - 13)}
            width={44}
            height={3}
            fill="#8a6a44"
          />
          <rect
            x={f(x - 18)}
            y={f(y - 15)}
            width={30}
            height={2.4}
            fill="#e8dcc0"
          />
          <line
            x1={f(x - 19)}
            y1={f(y - 10)}
            x2={f(x - 19)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <line
            x1={f(x + 19)}
            y1={f(y - 10)}
            x2={f(x + 19)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <circle cx={f(x + 16)} cy={f(y - 18)} r={4} fill="#b8893a" />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={f(bx.x0 + 6 + k * 5)}
              y={f(y - 16)}
              width={3.5}
              height={16}
              rx={1.5}
              fill="#e8dcc0"
              opacity={0.8}
            />
          ))}
        </g>
      );
      break;
    }
    case 'lookout': {
      for (let k = 0; k < Math.max(1, Math.floor(w / 28)); k++)
        out.push(port(bx.x0 + 14 + k * 28, bx.top + h * 0.5, `lw${k}`));
      const x = cx;
      const y = flo(x);
      out.push(
        <g key="scope">
          <line
            x1={f(x)}
            y1={f(y)}
            x2={f(x - 6)}
            y2={f(y - 16)}
            stroke="#5a3e28"
            strokeWidth={1.6}
          />
          <line
            x1={f(x)}
            y1={f(y)}
            x2={f(x + 6)}
            y2={f(y - 16)}
            stroke="#5a3e28"
            strokeWidth={1.6}
          />
          <rect
            x={f(x - 12)}
            y={f(y - 22)}
            width={24}
            height={5}
            rx={2}
            fill="#b8893a"
            transform={`rotate(-14 ${f(x)} ${f(y - 19)})`}
          />
        </g>
      );
      break;
    }
    case 'forecastle': {
      // Guindeau, chaîne d'ancre et cordages lovés.
      const x = at(0.4);
      const y = flo(x);
      out.push(
        <g key="windlass">
          <rect
            x={f(x - 14)}
            y={f(y - 10)}
            width={28}
            height={8}
            rx={4}
            fill="#6a4a2e"
          />
          <rect
            x={f(x - 16)}
            y={f(y - 12)}
            width={4}
            height={12}
            fill="#3a2617"
          />
          <rect
            x={f(x + 12)}
            y={f(y - 12)}
            width={4}
            height={12}
            fill="#3a2617"
          />
          <path
            d={`M${f(x + 14)},${f(y - 6)} q14,8 22,0`}
            fill="none"
            stroke="#5a6068"
            strokeWidth={2.4}
            strokeDasharray="3 1.5"
          />
          <ellipse
            cx={f(at(0.8))}
            cy={f(flo(at(0.8)) - 3)}
            rx={9}
            ry={3.5}
            fill="none"
            stroke="#d8c8a6"
            strokeWidth={2.4}
          />
        </g>
      );
      break;
    }
    case 'extra':
      out.push(<ExtraRoom key="x" bx={bx} kind={def.extra ?? 'autre'} />);
      break;
    default: {
      // Cabines d'officiers.
      const post = def.post;
      const xb = bx.stern ? at(0.22) : at(0.75);
      const yb = flo(xb);
      if (bx.stern)
        for (let k = 0; k < Math.max(1, Math.floor(w / 34)); k++)
          out.push(port(bx.x0 + 14 + k * 30, bx.top + h * 0.42, `sw${k}`));
      // Couchette.
      out.push(
        <g key="bunk">
          <rect
            x={f(xb - 16)}
            y={f(yb - 9)}
            width={32}
            height={6}
            rx={1.5}
            fill="#5a3a22"
          />
          <rect
            x={f(xb - 15)}
            y={f(yb - 12)}
            width={30}
            height={4}
            rx={2}
            fill="#c8b48a"
          />
          <rect
            x={f(xb - 15)}
            y={f(yb - 13)}
            width={8}
            height={4}
            rx={2}
            fill="#e8dcc0"
          />
          <rect
            x={f(xb - 17)}
            y={f(yb - 3)}
            width={34}
            height={3}
            fill="#3a2617"
          />
        </g>
      );
      const xd = bx.stern ? at(0.62) : at(0.32);
      const yd = flo(xd);
      if (post === 'Chirurgien') {
        out.push(
          <g key="surg">
            <rect
              x={f(xd - 14)}
              y={f(yd - 11)}
              width={28}
              height={3}
              fill="#d8ccb0"
            />
            <line
              x1={f(xd - 11)}
              y1={f(yd - 8)}
              x2={f(xd - 11)}
              y2={f(yd)}
              stroke="#5a3e28"
              strokeWidth={2}
            />
            <line
              x1={f(xd + 11)}
              y1={f(yd - 8)}
              x2={f(xd + 11)}
              y2={f(yd)}
              stroke="#5a3e28"
              strokeWidth={2}
            />
            {[0, 1, 2, 3].map((k) => (
              <rect
                key={k}
                x={f(bx.x0 + 6 + k * 6)}
                y={f(bx.top + 24)}
                width={4}
                height={6}
                rx={1}
                fill={['#9fd27a', '#7fb5e6', '#e88a5a', '#d8c8a6'][k]}
              />
            ))}
            <rect
              x={f(bx.x0 + 4)}
              y={f(bx.top + 30)}
              width={28}
              height={2}
              fill="#5a3e28"
            />
          </g>
        );
      } else if (post === 'Maître canonnier') {
        out.push(
          <g key="rack">
            <rect
              x={f(xd - 12)}
              y={f(yd - 26)}
              width={24}
              height={2.4}
              fill="#5a3e28"
            />
            {[0, 1, 2, 3].map((k) => (
              <line
                key={k}
                x1={f(xd - 9 + k * 6)}
                y1={f(yd - 24)}
                x2={f(xd - 9 + k * 6)}
                y2={f(yd - 4)}
                stroke="#3a3f45"
                strokeWidth={2}
              />
            ))}
            <Barrel x={xd + 18} y={yd} s={0.7} />
          </g>
        );
      } else if (post === 'Guetteur') {
        out.push(
          <g key="scope">
            <rect
              x={f(xd - 14)}
              y={f(yd - 11)}
              width={28}
              height={3}
              fill="#8a6a44"
            />
            <rect
              x={f(xd - 11)}
              y={f(yd - 13)}
              width={18}
              height={2}
              fill="#e8dcc0"
            />
            <rect
              x={f(xd - 2)}
              y={f(yd - 22)}
              width={18}
              height={4}
              rx={2}
              fill="#b8893a"
              transform={`rotate(-20 ${f(xd)} ${f(yd - 20)})`}
            />
          </g>
        );
      } else {
        // Bureau avec carte, chaise, coffre (capitaine, contremaître).
        out.push(
          <g key="desk">
            <rect
              x={f(xd - 14)}
              y={f(yd - 12)}
              width={28}
              height={12}
              fill="#6a4a2e"
              stroke="#2a1a10"
              strokeWidth={0.8}
            />
            <rect
              x={f(xd - 11)}
              y={f(yd - 14)}
              width={16}
              height={2.4}
              fill="#e8dcc0"
            />
            <rect
              x={f(xd + 7)}
              y={f(yd - 17)}
              width={2}
              height={5}
              fill="#c9a227"
            />
            <rect
              x={f(xd + 16)}
              y={f(yd - 15)}
              width={8}
              height={15}
              fill="#5a3a22"
            />
            {post === 'Capitaine' && (
              <>
                <circle
                  cx={f(xd - 22)}
                  cy={f(yd - 12)}
                  r={5}
                  fill="#5a7a9a"
                  stroke="#b8893a"
                  strokeWidth={1.2}
                />
                <line
                  x1={f(xd - 22)}
                  y1={f(yd - 7)}
                  x2={f(xd - 22)}
                  y2={f(yd)}
                  stroke="#b8893a"
                  strokeWidth={1.4}
                />
              </>
            )}
          </g>
        );
      }
      placePeople(
        Math.min(xb, xd) + 18,
        Math.max(xb, xd) - 18 > Math.min(xb, xd) + 18
          ? Math.max(xb, xd) - 18
          : Math.min(xb, xd) + 40
      );
      break;
    }
  }
  // Cabines sans occupant : rien de plus ; les autres salles accueillent
  // leurs membres éventuels déjà placés plus haut.
  void build;
  return <>{out}</>;
}

/** Pièces ajoutées à l'atelier. */
function ExtraRoom({ bx, kind }: { bx: Box; kind: RoomKind }) {
  const w = bx.x1 - bx.x0;
  const cx = (bx.x0 + bx.x1) / 2;
  const y = bx.floorAt(cx);
  switch (kind) {
    case 'sauna':
      return (
        <g>
          <rect
            x={f(bx.x0 + 6)}
            y={f(y - 8)}
            width={f(w - 12)}
            height={3}
            fill="#c8a070"
          />
          <rect
            x={f(cx - 7)}
            y={f(y - 14)}
            width={14}
            height={14}
            fill="#4a4a4a"
          />
          {[0, 1, 2].map((k) => (
            <circle
              key={k}
              cx={f(cx - 6 + k * 6)}
              cy={f(y - 22 - k * 4)}
              r={5}
              fill="#f0ece4"
              opacity={0.25}
            />
          ))}
        </g>
      );
    case 'jeux':
      return (
        <g>
          <rect
            x={f(cx - 16)}
            y={f(y - 12)}
            width={32}
            height={3}
            fill="#2f5a3a"
          />
          <line
            x1={f(cx - 12)}
            y1={f(y - 9)}
            x2={f(cx - 12)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <line
            x1={f(cx + 12)}
            y1={f(y - 9)}
            x2={f(cx + 12)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <rect
            x={f(cx - 6)}
            y={f(y - 15)}
            width={4}
            height={3}
            fill="#f1e3c6"
          />
          <rect
            x={f(cx + 2)}
            y={f(y - 15)}
            width={4}
            height={3}
            fill="#f1e3c6"
          />
        </g>
      );
    case 'fumoir':
      return (
        <g>
          <rect
            x={f(cx - 18)}
            y={f(y - 10)}
            width={14}
            height={10}
            rx={3}
            fill="#7a3a2a"
          />
          <rect
            x={f(cx + 4)}
            y={f(y - 10)}
            width={14}
            height={10}
            rx={3}
            fill="#7a3a2a"
          />
          <circle
            cx={f(cx)}
            cy={f(y - 24)}
            r={8}
            fill="#d8ccb8"
            opacity={0.18}
          />
        </g>
      );
    case 'torture':
      return (
        <g>
          <rect
            x={f(cx - 14)}
            y={f(y - 9)}
            width={28}
            height={4}
            fill="#5a3a22"
          />
          <circle
            cx={f(cx - 14)}
            cy={f(y - 7)}
            r={4}
            fill="none"
            stroke="#6d7278"
            strokeWidth={1.6}
          />
          <circle
            cx={f(cx + 14)}
            cy={f(y - 7)}
            r={4}
            fill="none"
            stroke="#6d7278"
            strokeWidth={1.6}
          />
        </g>
      );
    case 'exposition':
      return (
        <g>
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect
                x={f(bx.x0 + 10 + (k * (w - 20)) / 3)}
                y={f(y - 12)}
                width={10}
                height={12}
                fill="#5a3a22"
              />
              <rect
                x={f(bx.x0 + 11 + (k * (w - 20)) / 3)}
                y={f(y - 20)}
                width={8}
                height={8}
                fill="#9fc4d8"
                opacity={0.5}
              />
            </g>
          ))}
        </g>
      );
    default:
      return (
        <g>
          <rect
            x={f(cx - 14)}
            y={f(y - 10)}
            width={28}
            height={3}
            fill="#8a6a44"
          />
          <line
            x1={f(cx - 11)}
            y1={f(y - 7)}
            x2={f(cx - 11)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <line
            x1={f(cx + 11)}
            y1={f(y - 7)}
            x2={f(cx + 11)}
            y2={f(y)}
            stroke="#5a3e28"
            strokeWidth={2}
          />
          <rect
            x={f(cx + 16)}
            y={f(y - 16)}
            width={10}
            height={16}
            fill="#6a3a2a"
          />
        </g>
      );
  }
}
