import type { Allure, Build, Material } from '../arpenteur/types';
import { MeshBuilder, P, type Mat, type MeshData } from './geometry';
import {
  chain,
  cross,
  identity,
  linear,
  normalize,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  sub,
  transformDir,
  transformPoint,
  translation,
  type Mat4,
  type Vec3,
} from './math';

// Modèle 3D procédural de l'arpenteur. Repère : x vers la proue, y vers le
// haut, z vers tribord. Pont principal autour de y = 0, unités en mètres.

type Bow = 'horn' | 'blade' | 'round' | 'pod' | 'ram' | 'tall' | 'spur';
type CastleShape = 'box' | 'dome' | 'slope' | 'tower';

interface CastleSpec {
  a: number;
  b: number;
  h: number;
  shape: CastleShape;
  /** Largeur relative à la coque. */
  w?: number;
}

interface PodSpec {
  s: number;
  kind: 'lift' | 'rear' | 'angled';
  size: number;
}

interface AllureSpec {
  L: number;
  B: number;
  D: number;
  transom: number;
  sternRise: number;
  bow: Bow;
  bowStart: number;
  sheerBow: number;
  sheerStern: number;
  castles: CastleSpec[];
  masts: number[];
  chimneys: number[];
  reactor: number;
  pods: PodSpec[];
}

const SPECS: Record<Allure, AllureSpec> = {
  escorteur: {
    L: 45.6,
    B: 8,
    D: 5.2,
    transom: 0.62,
    sternRise: 1.2,
    bow: 'horn',
    bowStart: 0.62,
    sheerBow: 4.5,
    sheerStern: 1.2,
    castles: [{ a: 0, b: 0.22, h: 3.2, shape: 'box' }],
    masts: [0.4, 0.55, 0.7],
    chimneys: [0.31],
    reactor: 0.48,
    pods: [
      { s: 0.25, kind: 'lift', size: 0.9 },
      { s: 0.72, kind: 'lift', size: 0.85 },
      { s: 0.04, kind: 'rear', size: 0.8 },
    ],
  },
  survivor: {
    L: 52.8,
    B: 9.5,
    D: 6.4,
    transom: 0.8,
    sternRise: 0.8,
    bow: 'pod',
    bowStart: 0.72,
    sheerBow: 1.2,
    sheerStern: 0.6,
    castles: [
      { a: 0, b: 0.3, h: 7.5, shape: 'box' },
      { a: 0.84, b: 0.97, h: 2.2, shape: 'box', w: 0.8 },
    ],
    masts: [0.45, 0.6, 0.73],
    chimneys: [0.36],
    reactor: 0.53,
    pods: [
      { s: 0.28, kind: 'lift', size: 1.05 },
      { s: 0.7, kind: 'lift', size: 1 },
      { s: 0.02, kind: 'rear', size: 1 },
    ],
  },
  protector: {
    L: 55.2,
    B: 10,
    D: 6.8,
    transom: 0.72,
    sternRise: 1.4,
    bow: 'round',
    bowStart: 0.66,
    sheerBow: 2,
    sheerStern: 1.4,
    castles: [
      { a: 0, b: 0.32, h: 6, shape: 'dome' },
      { a: 0.82, b: 0.95, h: 2.4, shape: 'box', w: 0.85 },
    ],
    masts: [0.46, 0.6, 0.74],
    chimneys: [0.37],
    reactor: 0.53,
    pods: [
      { s: 0.3, kind: 'lift', size: 1.05 },
      { s: 0.72, kind: 'lift', size: 1 },
      { s: 0.02, kind: 'rear', size: 1.1 },
    ],
  },
  bombardier: {
    L: 56.4,
    B: 10,
    D: 6.8,
    transom: 0.85,
    sternRise: 0.6,
    bow: 'spur',
    bowStart: 0.7,
    sheerBow: 1.5,
    sheerStern: 0.4,
    castles: [
      { a: 0, b: 0.2, h: 10, shape: 'tower', w: 0.9 },
      { a: 0.86, b: 0.97, h: 4.2, shape: 'tower', w: 0.75 },
    ],
    masts: [0.36, 0.52, 0.7],
    chimneys: [0.27, 0.6],
    reactor: 0.44,
    pods: [
      { s: 0.26, kind: 'lift', size: 1.05 },
      { s: 0.74, kind: 'lift', size: 1 },
      { s: 0.02, kind: 'rear', size: 1.1 },
    ],
  },
  fleche: {
    L: 57.6,
    B: 7.6,
    D: 4.6,
    transom: 0.6,
    sternRise: 1,
    bow: 'blade',
    bowStart: 0.5,
    sheerBow: 1.8,
    sheerStern: 0.8,
    castles: [{ a: 0, b: 0.24, h: 4.2, shape: 'slope' }],
    masts: [0.38, 0.52, 0.65],
    chimneys: [0.3],
    reactor: 0.45,
    pods: [
      { s: 0.24, kind: 'angled', size: 0.85 },
      { s: 0.62, kind: 'angled', size: 0.85 },
      { s: 0.02, kind: 'rear', size: 0.9 },
    ],
  },
  forteresse: {
    L: 55.2,
    B: 11,
    D: 7,
    transom: 0.85,
    sternRise: 0.6,
    bow: 'horn',
    bowStart: 0.72,
    sheerBow: 2.2,
    sheerStern: 0.6,
    castles: [
      { a: 0, b: 0.12, h: 3, shape: 'box' },
      { a: 0.36, b: 0.62, h: 7.5, shape: 'tower', w: 0.88 },
      { a: 0.84, b: 0.95, h: 2.6, shape: 'box', w: 0.8 },
    ],
    masts: [0.24, 0.49, 0.74],
    chimneys: [0.42, 0.56],
    reactor: 0.66,
    pods: [
      { s: 0.2, kind: 'lift', size: 1 },
      { s: 0.49, kind: 'lift', size: 1.15 },
      { s: 0.78, kind: 'lift', size: 0.95 },
    ],
  },
  enforceur: {
    L: 57.6,
    B: 10,
    D: 6.6,
    transom: 0.9,
    sternRise: 0.4,
    bow: 'ram',
    bowStart: 0.8,
    sheerBow: 0.4,
    sheerStern: 0.4,
    castles: [
      { a: 0, b: 0.2, h: 3.6, shape: 'box' },
      { a: 0.66, b: 0.94, h: 8.5, shape: 'tower', w: 0.92 },
    ],
    masts: [0.32, 0.44, 0.56],
    chimneys: [0.5],
    reactor: 0.25,
    pods: [
      { s: 0.3, kind: 'angled', size: 1 },
      { s: 0.6, kind: 'angled', size: 0.95 },
      { s: 0.02, kind: 'rear', size: 1.1 },
    ],
  },
  gouverneur: {
    L: 55.2,
    B: 9.5,
    D: 6.2,
    transom: 0.7,
    sternRise: 1.6,
    bow: 'tall',
    bowStart: 0.64,
    sheerBow: 3.4,
    sheerStern: 1.6,
    castles: [{ a: 0, b: 0.4, h: 8, shape: 'slope' }],
    masts: [0.46, 0.6, 0.74],
    chimneys: [0.5],
    reactor: 0.66,
    pods: [
      { s: 0.22, kind: 'angled', size: 1 },
      { s: 0.5, kind: 'lift', size: 0.95 },
      { s: 0.78, kind: 'lift', size: 0.9 },
    ],
  },
};

const MATS: Record<Material, { hex: string; metal: boolean; rough: number }> = {
  beaulou: { hex: '#cdb48a', metal: false, rough: 0.72 },
  chene: { hex: '#7d5030', metal: false, rough: 0.7 },
  sombrefer: { hex: '#3e2a1e', metal: false, rough: 0.65 },
  cuivre: { hex: '#c27a45', metal: true, rough: 0.38 },
  fer: { hex: '#8d939b', metal: true, rough: 0.45 },
  boisfer: { hex: '#6e4a2c', metal: false, rough: 0.68 },
  acier: { hex: '#5a636e', metal: true, rough: 0.32 },
};

const AETHER = linear('#4fe6ff');
const WARM = linear('#ffb45a');
const FIRE = linear('#ff7a2a');

function surfaceMat(m: Material, deck = false): Mat {
  const d = MATS[m];
  if (d.metal)
    return {
      p: m === 'cuivre' ? P.PATINA : P.PLATES,
      color: linear(d.hex),
      metal: 1,
      rough: d.rough,
    };
  return {
    p: deck ? P.DECK : P.WOOD,
    color: linear(d.hex),
    metal: 0,
    rough: d.rough,
  };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Matrice à partir d'une base (colonnes x, y, z) et d'une origine. */
function basis(o: Vec3, x: Vec3, y: Vec3, z: Vec3): Mat4 {
  const m = identity();
  m.set([
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    o[0],
    o[1],
    o[2],
    1,
  ]);
  return m;
}

/** Oriente l'axe Y local selon d. */
function alignY(o: Vec3, d: Vec3): Mat4 {
  const y = normalize(d);
  const ref: Vec3 = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const z = normalize(cross(ref, y));
  const x = cross(y, z);
  return basis(o, x, y, z);
}

export class Hull {
  readonly s: AllureSpec;
  readonly D: number;
  constructor(
    readonly allure: Allure,
    readonly ponts: number
  ) {
    this.s = SPECS[allure];
    this.D = this.s.D * (ponts >= 3 ? 1.25 : ponts === 2 ? 1.12 : 1);
  }
  get L() {
    return this.s.L;
  }
  x(s: number) {
    return -this.s.L / 2 + s * this.s.L;
  }
  sOf(x: number) {
    return (x + this.s.L / 2) / this.s.L;
  }
  bowT(s: number) {
    return Math.max(0, (s - this.s.bowStart) / (1 - this.s.bowStart));
  }
  halfBeam(s: number) {
    const { B, transom, bow } = this.s;
    let hb =
      (B / 2) * (transom + (1 - transom) * Math.pow(smooth(0, 0.3, s), 0.6));
    const t = this.bowT(s);
    if (t > 0) {
      const k =
        bow === 'blade'
          ? 1 - Math.pow(t, 1.15)
          : bow === 'round'
            ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)))
            : bow === 'pod'
              ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.2)))
              : bow === 'ram'
                ? 1 - Math.pow(t, 2.4)
                : 1 - Math.pow(t, 1.6);
      hb *= Math.max(0.015, k);
    }
    return hb;
  }
  deckY(s: number) {
    const { sheerBow, sheerStern, bow } = this.s;
    let y =
      1.6 * sheerStern * Math.pow(1 - s, 3) + 1.3 * sheerBow * Math.pow(s, 4);
    if (bow === 'horn') y += 3 * Math.pow(this.bowT(s), 3);
    return y;
  }
  keelY(s: number) {
    const D = this.D;
    const { bow, sternRise } = this.s;
    let y = -D + sternRise * (1 - smooth(0, 0.2, s));
    const t = this.bowT(s);
    const rise =
      bow === 'horn'
        ? D * 1.05 * Math.pow(t, 2)
        : bow === 'blade'
          ? D * 0.95 * Math.pow(t, 1.5)
          : bow === 'round'
            ? D * 0.85 * Math.pow(t, 2.6)
            : bow === 'pod'
              ? D * 0.55 * Math.pow(t, 3.5)
              : bow === 'ram'
                ? D * 0.12 * t
                : bow === 'tall'
                  ? D * 1 * Math.pow(t, 1.7)
                  : D * 0.9 * Math.pow(t, 2);
    return y + rise;
  }
  /** Point de la coque, côté tribord, v ∈ [0, 1] de la quille au pont. */
  point(s: number, v: number): Vec3 {
    const yK = this.keelY(s);
    const yD = this.deckY(s);
    const hb = this.halfBeam(s);
    const yM = yK + (yD - yK) * 0.55;
    let y: number;
    let z: number;
    if (v < 0.66) {
      const phi = (v / 0.66) * (Math.PI / 2);
      z = hb * Math.pow(Math.sin(phi), 0.9);
      y = yM - (yM - yK) * Math.pow(Math.cos(phi), 0.95);
    } else {
      const t = (v - 0.66) / 0.34;
      z = hb * (1 - 0.06 * t * t);
      y = yM + (yD - yM) * t;
    }
    return [this.x(s), y, z];
  }
  /** Normale extérieure (tribord). */
  normal(s: number, v: number): Vec3 {
    const e = 1e-3;
    const du = sub(
      this.point(Math.min(1, s + e), v),
      this.point(Math.max(0, s - e), v)
    );
    const dv = sub(
      this.point(s, Math.min(1, v + e)),
      this.point(s, Math.max(0, v - e))
    );
    return normalize(cross(du, dv));
  }
  /** v pour une hauteur donnée (recherche dichotomique). */
  vAt(s: number, y: number) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (this.point(s, m)[1] < y) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  }
  get bulwark() {
    return 1.15;
  }
}

export interface ShipParts {
  body: MeshData;
  glows: MeshData;
  fans: { mesh: MeshData; place: Mat4; speed: number }[];
  /** Tuyères (repère du navire) : lumière d'Aether et poussière au sol. */
  nozzles: { pos: Vec3; dir: Vec3; size: number }[];
  /** Sommets des cheminées (fumée). */
  stacks: Vec3[];
  /** Point d'ancrage de la caméra et rayon englobant. */
  center: Vec3;
  radius: number;
  top: number;
  bottom: number;
}

export interface ShipOptions {
  guns?: number;
  crew?: number;
  night?: boolean;
}

export function buildShip(build: Build, opts: ShipOptions = {}): ShipParts {
  const hull = new Hull(build.allure, build.ponts);
  const S = hull.s;
  const b = new MeshBuilder();
  const g = new MeshBuilder();
  const fans: ShipParts['fans'] = [];
  const nozzles: ShipParts['nozzles'] = [];
  const trim = linear(build.deco.trim);
  const brass: Mat = { p: P.BRASS, color: trim, metal: 1, rough: 0.3 };
  const copper: Mat = {
    p: P.COPPER,
    color: linear('#c47a44'),
    metal: 1,
    rough: 0.34,
  };
  const iron: Mat = {
    p: P.IRON,
    color: linear('#3a3d42'),
    metal: 0.85,
    rough: 0.5,
  };
  const darkIron: Mat = {
    p: P.IRON,
    color: linear('#1e2024'),
    metal: 0.7,
    rough: 0.55,
  };
  const rope: Mat = {
    p: P.PLAIN,
    color: linear('#3a2c1e'),
    metal: 0,
    rough: 0.9,
  };
  const hullMat = surfaceMat(build.coque.material);
  const castleMat = surfaceMat(build.poupe.material);
  const deckMat: Mat = {
    p: P.DECK,
    color: linear('#9a7650'),
    metal: 0,
    rough: 0.75,
  };
  const sheath: Mat = {
    p: P.PLATES,
    color: linear('#b06a3c'),
    metal: 1,
    rough: 0.45,
  };
  const sail: Mat = {
    p: P.SAIL,
    color: linear(build.mats.sailColor),
    metal: 0,
    rough: 0.9,
  };
  const lum = build.poupe.luminaires;
  const lampColor =
    lum === 'aether' ? AETHER : lum === 'braseros' ? FIRE : WARM;
  const lampEmit = lum === 'aucun' ? 0 : opts.night ? 5 : 2.4;
  const glass: Mat = {
    p: P.GLASS,
    color: lampColor,
    metal: 0,
    rough: 0.05,
    emit: lum === 'aucun' ? 0 : opts.night ? 3.2 : 1.4,
  };
  const aether = (e: number): Mat => ({
    p: P.EMIT,
    color: AETHER,
    metal: 0,
    rough: 0.4,
    emit: e,
  });

  // --- Coque -----------------------------------------------------------------
  const NU = 90;
  const NV = 26;
  const G0 = hull.D * 1.6 + 5;
  for (const side of [1, -1]) {
    const WL = 0.4;
    b.grid(
      NU,
      Math.round(NV * WL),
      (u, v) => {
        const p = hull.point(u, v * WL);
        return [p[0], p[1], p[2] * side];
      },
      sheath,
      { uv: (u, v) => [hull.x(u), (1 - v * WL) * G0], flip: side < 0 }
    );
    b.grid(
      NU,
      Math.round(NV * (1 - WL)),
      (u, v) => {
        const p = hull.point(u, WL + v * (1 - WL));
        return [p[0], p[1], p[2] * side];
      },
      hullMat,
      {
        uv: (u, v) => [hull.x(u), (1 - WL - v * (1 - WL)) * G0],
        flip: side < 0,
      }
    );
    // Pavois.
    b.grid(
      NU,
      2,
      (u, v) => {
        const p = hull.point(u, 1);
        const z = p[2] * (1 - 0.02 * v);
        return [p[0], p[1] + v * hull.bulwark, z * side];
      },
      castleMat.p === P.WOOD || castleMat.p === P.DECK ? hullMat : hullMat,
      { uv: (u, v) => [hull.x(u), -v * hull.bulwark], flip: side < 0 }
    );
    b.grid(
      NU,
      2,
      (u, v) => {
        const p = hull.point(u, 1);
        const z = Math.max(0, p[2] - 0.22);
        return [p[0], p[1] + (1 - v) * hull.bulwark, z * side];
      },
      deckMat,
      { uv: (u, v) => [hull.x(u), v], flip: side < 0 }
    );
  }
  // Pont.
  b.grid(
    NU,
    6,
    (u, v) => {
      const p = hull.point(u, 1);
      const w = Math.max(0, p[2] - 0.22);
      const z = (v * 2 - 1) * w;
      return [p[0], p[1] + 0.05 * (1 - (v * 2 - 1) ** 2) * 2, z];
    },
    deckMat,
    { uv: (u, v) => [hull.x(u), (v * 2 - 1) * hull.halfBeam(u)], flip: true }
  );
  // Tableau arrière.
  {
    const ring: Vec3[] = [];
    for (let i = 0; i <= NV; i++) ring.push(hull.point(0, i / NV));
    const c: Vec3 = [hull.x(0), (hull.keelY(0) + hull.deckY(0)) / 2, 0];
    const n: Vec3 = [-1, 0, 0];
    const ci = b.vertex(c, n, [0, c[1]], hullMat);
    for (const side of [1, -1]) {
      const ids = ring.map((p) =>
        b.vertex([p[0], p[1], p[2] * side], n, [p[2] * side, p[1]], hullMat)
      );
      for (let i = 0; i < ids.length - 1; i++) b.tri(ci, ids[i], ids[i + 1]);
    }
    const top = hull.point(0, 1);
    b.push(translation(top[0] - 0.01, top[1], 0));
    b.box(0.06, hull.bulwark, top[2] * 2, hullMat);
    b.pop();
  }
  // Ceintures de laiton et bandes peintes, en relief sur la coque.
  const strip = (
    v0: number,
    v1: number,
    mat: Mat,
    out = 0.06,
    s0 = 0.005,
    s1 = 0.995
  ) => {
    for (const side of [1, -1]) {
      b.grid(
        70,
        1,
        (u, v) => {
          const s = s0 + (s1 - s0) * u;
          const vv = v0 + (v1 - v0) * v;
          const p = hull.point(s, vv);
          const n = hull.normal(s, vv);
          return [
            p[0] + n[0] * out,
            p[1] + n[1] * out,
            (p[2] + n[2] * out) * side,
          ];
        },
        mat,
        { uv: (u, v) => [u * hull.L, v], flip: side < 0 }
      );
    }
  };
  strip(0.985, 1, brass, 0.08);
  strip(0.83, 0.85, brass, 0.07);
  strip(
    0.395,
    0.415,
    { p: P.IRON, color: linear('#24201c'), metal: 0.6, rough: 0.5 },
    0.05
  );
  if (build.coque.type === 'renforcee') {
    strip(0.55, 0.575, iron, 0.08);
    strip(0.36, 0.385, iron, 0.08);
  }
  build.deco.bands.forEach((c, i) =>
    strip(
      0.74 - i * 0.05,
      0.765 - i * 0.05,
      { p: P.PLAIN, color: linear(c), metal: 0, rough: 0.6 },
      0.05
    )
  );
  // Rambarde de laiton.
  for (const side of [1, -1]) {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 60; i++) {
      const p = hull.point(i / 60, 1);
      pts.push([p[0], p[1] + hull.bulwark + 0.05, (p[2] - 0.1) * side]);
    }
    b.tube(pts, 0.09, 6, brass);
  }
  // Quille.
  {
    const heavy = build.quille.type === 'lourde';
    const km = surfaceMat(build.quille.material);
    const a = 0.12;
    const e = 0.82;
    const drop = heavy ? 1.6 : 1;
    b.grid(
      40,
      2,
      (u, v) => {
        const s = a + (e - a) * u;
        const y =
          hull.keelY(s) + 0.3 - v * drop * Math.pow(Math.sin(Math.PI * u), 0.5);
        return [hull.x(s), y, 0.18 * (1 - v * 0.5)];
      },
      km,
      { uv: (u, v) => [u * 30, v] }
    );
    b.grid(
      40,
      2,
      (u, v) => {
        const s = a + (e - a) * u;
        const y =
          hull.keelY(s) + 0.3 - v * drop * Math.pow(Math.sin(Math.PI * u), 0.5);
        return [hull.x(s), y, -0.18 * (1 - v * 0.5)];
      },
      km,
      { uv: (u, v) => [u * 30, v], flip: true }
    );
    if (heavy) {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const s = a + (e - a) * u;
        pts.push([
          hull.x(s),
          hull.keelY(s) + 0.3 - drop * Math.pow(Math.sin(Math.PI * u), 0.5),
          0,
        ]);
      }
      b.tube(pts, 0.12, 6, brass);
    }
  }
  // Gouvernail.
  {
    const x0 = hull.x(0) - 0.2;
    const yk = hull.keelY(0.02);
    const rm =
      build.poupe.gouvernail === 'renforce'
        ? iron
        : surfaceMat(build.poupe.material);
    b.grid(
      6,
      6,
      (u, v) => [x0 - u * 2.8 * (0.6 + 0.4 * v), yk + 2 - v * 5.2, 0.12],
      rm,
      { uv: (u, v) => [u * 3, v * 5] }
    );
    b.grid(
      6,
      6,
      (u, v) => [x0 - u * 2.8 * (0.6 + 0.4 * v), yk + 2 - v * 5.2, -0.12],
      rm,
      { uv: (u, v) => [u * 3, v * 5], flip: true }
    );
    for (const t of [0.15, 0.5, 0.85]) {
      b.push(translation(x0 - 0.2, yk + 2 - t * 5.2, 0));
      b.box(
        0.8,
        0.22,
        0.34,
        build.poupe.gouvernail === 'sculpte' ? brass : iron
      );
      b.pop();
    }
  }

  // --- Châteaux ------------------------------------------------------------------
  const roofs: {
    a: number;
    b: number;
    y: (s: number) => number;
    w: (s: number) => number;
    shape: CastleShape;
  }[] = [];
  for (const c of S.castles) {
    const wf = c.w ?? 0.97;
    const height = (s: number) => {
      if (c.shape === 'slope')
        return c.h * (1 - 0.8 * smooth(c.a + (c.b - c.a) * 0.25, c.b, s)) + 0.6;
      return c.h;
    };
    const width = (s: number) => Math.max(0.6, (hull.halfBeam(s) - 0.25) * wf);
    const base = (s: number) => hull.deckY(s);
    const r = 0.5;
    const sec = (s: number, t: number): Vec3 => {
      // t parcourt la section : flanc tribord, toit, flanc bâbord.
      const w = width(s);
      const y0 = base(s) - 0.05;
      const y1 = y0 + height(s);
      const per = 2 * (y1 - y0 - r) + 2 * (w - r) + Math.PI * r;
      let d = t * per;
      const x = hull.x(s);
      if (d < y1 - y0 - r) return [x, y0 + d, w];
      d -= y1 - y0 - r;
      if (d < (Math.PI / 2) * r) {
        const a = d / r;
        return [x, y1 - r + Math.sin(a) * r, w - r + Math.cos(a) * r];
      }
      d -= (Math.PI / 2) * r;
      if (d < 2 * (w - r)) return [x, y1, w - r - d];
      d -= 2 * (w - r);
      if (d < (Math.PI / 2) * r) {
        const a = d / r + Math.PI / 2;
        return [x, y1 - r + Math.sin(a) * r, -(w - r) + Math.cos(a) * r];
      }
      d -= (Math.PI / 2) * r;
      return [x, y1 - r - d, -w];
    };
    const sa = c.a === 0 ? 0.004 : c.a;
    const tumble = (p: Vec3, s: number): Vec3 => {
      const f = (p[1] - base(s)) / height(s);
      return [p[0], p[1], p[2] * (1 - 0.07 * f)];
    };
    const sec0 = sec;
    const secT = (s: number, t: number) => tumble(sec0(s, t), s);
    b.grid(
      Math.max(8, Math.round((c.b - sa) * 80)),
      40,
      (u, t) => secT(sa + (c.b - sa) * u, t),
      castleMat,
      {
        uv: (u, t) => {
          const p = secT(sa + (c.b - sa) * u, t);
          return [p[0], p[1] + Math.abs(p[2]) * (t > 0.3 && t < 0.7 ? 1 : 0)];
        },
        flip: true,
      }
    );
    // Murs d'extrémité.
    for (const [s, dir] of [
      [sa, -1],
      [c.b, 1],
    ] as const) {
      const ring: Vec3[] = [];
      for (let i = 0; i <= 40; i++) ring.push(secT(s, i / 40));
      const cy = base(s) + height(s) / 2;
      const ci = b.vertex([hull.x(s), cy, 0], [dir, 0, 0], [0, cy], castleMat);
      const ids = ring.map((p) =>
        b.vertex(p, [dir, 0, 0], [p[2], p[1]], castleMat)
      );
      for (let i = 0; i < ids.length - 1; i++)
        dir > 0 ? b.tri(ci, ids[i], ids[i + 1]) : b.tri(ci, ids[i + 1], ids[i]);
      // Fenêtres du mur arrière / avant.
      const w = width(s);
      const n = Math.max(1, Math.floor((w * 2 - 1.2) / 1.6));
      const rows = height(s) > 5 ? 2 : 1;
      for (let row = 0; row < rows; row++)
        for (let k = 0; k < n; k++) {
          const z = -w + 0.6 + (k + 0.5) * ((w * 2 - 1.2) / n);
          const y = base(s) + height(s) - 1.6 - row * 2.2;
          if (y < base(s) + 0.8) continue;
          window(
            b,
            [hull.x(s) + dir * 0.03, y, z],
            [dir, 0, 0],
            0.7,
            1.1,
            glass,
            brass
          );
        }
    }
    // Fenêtres des flancs.
    for (const side of [1, -1]) {
      const len = (c.b - sa) * hull.L;
      const n = Math.max(1, Math.floor((len - 1.4) / 2));
      for (let k = 0; k < n; k++) {
        const s = sa + ((k + 0.5) / n) * (c.b - sa);
        const h = height(s);
        const rows = h > 6.5 ? 3 : h > 4 ? 2 : h > 2.2 ? 1 : 0;
        for (let row = 0; row < rows; row++) {
          const y = base(s) + h - 1.5 - row * 2.2;
          if (y < base(s) + 0.9) continue;
          window(
            b,
            [
              hull.x(s),
              y,
              (width(s) * (1 - 0.07 * ((y - base(s)) / h)) + 0.04) * side,
            ],
            [0, 0, side],
            0.75,
            1.15,
            glass,
            brass
          );
        }
      }
    }
    // Pilastres et bandeau entre les étages de fenêtres.
    for (const side of [1, -1]) {
      const len = (c.b - sa) * hull.L;
      const n = Math.max(1, Math.floor((len - 1.4) / 2));
      for (let k2 = 0; k2 <= n; k2++) {
        const s = sa + (k2 / n) * (c.b - sa) * 0.999 + 0.0005;
        const h = height(s);
        if (h < 2.2) continue;
        const y0 = base(s) + 0.2;
        const pts: Vec3[] = [];
        for (let i = 0; i <= 6; i++) {
          const y = y0 + ((h - 0.4) * i) / 6;
          pts.push([
            hull.x(s),
            y,
            (width(s) * (1 - 0.07 * ((y - base(s)) / h)) + 0.06) * side,
          ]);
        }
        b.tube(
          pts,
          0.11,
          5,
          castleMat.metal > 0.5
            ? brass
            : {
                ...castleMat,
                color: [
                  castleMat.color[0] * 0.7,
                  castleMat.color[1] * 0.7,
                  castleMat.color[2] * 0.7,
                ],
              }
        );
      }
      if (c.h > 4.2) {
        const pts: Vec3[] = [];
        for (let i = 0; i <= 20; i++) {
          const s = sa + ((c.b - sa) * i) / 20;
          const h = height(s);
          const y = base(s) + h - 2.65;
          if (y < base(s) + 1) continue;
          pts.push([
            hull.x(s),
            y,
            (width(s) * (1 - 0.07 * ((y - base(s)) / h)) + 0.07) * side,
          ]);
        }
        if (pts.length > 2) b.tube(pts, 0.09, 5, brass);
      }
    }
    // Corniche de laiton sur le toit.
    for (const side of [1, -1]) {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 20; i++) {
        const s = sa + ((c.b - sa) * i) / 20;
        pts.push([
          hull.x(s),
          base(s) + height(s) + 0.02,
          (width(s) * 0.93 - 0.05) * side,
        ]);
      }
      b.tube(pts, 0.1, 6, brass);
    }
    roofs.push({
      a: sa,
      b: c.b,
      y: (s) => base(s) + height(s),
      w: width,
      shape: c.shape,
    });
    if (c.shape === 'dome') {
      const s = (sa + c.b) / 2;
      const y = base(s) + height(s);
      const rx = ((c.b - sa) * hull.L) / 2 - 0.6;
      const rz = width(s) - 0.3;
      b.push(chain(translation(hull.x(s), y, 0), scaling(rx, 2.6, rz)));
      b.sphere(
        1,
        40,
        { p: P.PATINA, color: linear('#b8703e'), metal: 1, rough: 0.4 },
        true
      );
      for (let k = 0; k < 12; k++) {
        b.push(rotationY((k / 12) * Math.PI * 2));
        const arc: Vec3[] = [];
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * (Math.PI / 2);
          arc.push([Math.cos(a) * 1.005, Math.sin(a) * 1.005, 0]);
        }
        b.tube(arc, 0.025, 4, brass);
        b.pop();
      }
      b.pop();
      // Coupole vitrée.
      b.push(translation(hull.x(s), y + 2.5, 0));
      b.sphere(1.6, 28, { ...glass, emit: (glass.emit ?? 0) * 0.6 }, true);
      for (let k = 0; k < 8; k++) {
        b.push(rotationY((k / 8) * Math.PI * 2));
        b.push(chain(rotationZ(-0.02), scaling(1.62, 1.62, 1.62)));
        const arc: Vec3[] = [];
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * (Math.PI / 2);
          arc.push([Math.cos(a), Math.sin(a), 0]);
        }
        b.tube(arc, 0.04, 5, brass);
        b.pop();
        b.pop();
      }
      b.push(translation(0, 1.6, 0));
      b.sphere(0.25, 12, brass);
      b.pop();
      b.pop();
    }
    if (c.shape === 'tower' || (c.shape === 'box' && c.h > 6))
      crenels(
        b,
        hull,
        sa,
        c.b,
        (s) => base(s) + height(s),
        (s) => width(s) * 0.93,
        iron
      );
  }

  // --- Sabords et canons ------------------------------------------------------------
  const guns = Math.max(0, opts.guns ?? 0);
  const rows = 1 + Math.max(0, build.ponts - 1);
  let armed = guns;
  for (let row = 0; row < rows; row++) {
    const yRel = -1.3 - row * 1.6;
    for (const side of [1, -1]) {
      for (let s = 0.14; s < 0.86; s += 2.4 / hull.L) {
        if (Math.abs(s - S.reactor) < 0.06) continue;
        const y = hull.deckY(s) + yRel;
        if (y < hull.keelY(s) + 1.2) continue;
        const v = hull.vAt(s, y);
        const p = hull.point(s, v);
        const n = hull.normal(s, v);
        const pp: Vec3 = [p[0], p[1], p[2] * side];
        const nn: Vec3 = [n[0], n[1], n[2] * side];
        const gun = armed > 0;
        if (gun) armed--;
        b.push(
          alignY(
            [pp[0] + nn[0] * 0.02, pp[1] + nn[1] * 0.02, pp[2] + nn[2] * 0.02],
            nn
          )
        );
        b.torus(0.42, 0.08, 18, 6, brass);
        b.cylinder(0.36, 0.04, 14, gun ? darkIron : iron);
        if (gun) {
          b.cylinder(0.15, 1.1, 10, darkIron, true);
          b.push(translation(0, 1.05, 0));
          b.torus(0.17, 0.05, 10, 4, brass);
          b.pop();
        }
        b.pop();
      }
    }
  }

  // --- Cœur d'Aether -------------------------------------------------------------------
  {
    const s = S.reactor;
    const x = hull.x(s);
    const y = hull.deckY(s);
    b.push(translation(x, y, 0));
    b.cylinder(1.9, 0.6, 28, iron);
    b.push(translation(0, 0.6, 0));
    b.cylinder(1.05, 3.2, 28, aether(4.5));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.push(translation(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3));
      b.cylinder(0.07, 3.2, 6, brass, false);
      b.pop();
    }
    for (const yy of [0.15, 1.6, 3.05]) {
      b.push(translation(0, yy, 0));
      b.torus(1.32, 0.12, 32, 8, brass);
      b.pop();
    }
    b.push(translation(0, 3.2, 0));
    b.lathe(
      [
        [1.5, 0],
        [1.5, 0.25],
        [1.1, 0.7],
        [0.4, 1.1],
        [0.25, 1.6],
        [0, 1.65],
      ],
      28,
      brass
    );
    b.push(translation(0, 1.9, 0));
    b.sphere(0.35, 14, aether(6));
    b.pop();
    b.pop();
    b.pop();
    b.pop();
    // Hublots d'Aether sur les flancs.
    for (const side of [1, -1])
      for (const ds of [-0.05, 0.05]) {
        const ss = s + ds;
        const v = hull.vAt(ss, hull.deckY(ss) - hull.D * 0.42);
        const p = hull.point(ss, v);
        const n = hull.normal(ss, v);
        b.push(alignY([p[0], p[1], p[2] * side], [n[0], n[1], n[2] * side]));
        b.torus(0.95, 0.18, 28, 8, brass);
        b.cylinder(0.92, 0.05, 24, aether(3.5));
        for (let k = 0; k < 4; k++) {
          b.push(chain(translation(0, 0.07, 0), rotationY((k * Math.PI) / 4)));
          b.box(1.8, 0.06, 0.08, brass);
          b.pop();
        }
        b.pop();
      }
  }

  // --- Cheminées --------------------------------------------------------------------------
  const stacks: Vec3[] = [];
  for (const s of S.chimneys) {
    const x = hull.x(s);
    const y = hull.deckY(s);
    stacks.push([x, y + 7.6, 0]);
    b.push(translation(x, y, 0));
    b.lathe(
      [
        [0, 0],
        [0.85, 0],
        [0.75, 0.6],
        [0.72, 6.6],
        [0.95, 7.2],
        [0.95, 7.5],
        [0.78, 7.5],
        [0.78, 7.2],
      ],
      24,
      iron
    );
    for (const yy of [1.5, 3.2, 5.2]) {
      b.push(translation(0, yy, 0));
      b.torus(0.78, 0.1, 24, 6, brass);
      b.pop();
    }
    b.pop();
  }

  // --- Mâts, vergues, voiles, gréement -----------------------------------------------------------------
  const mastType = build.mats.type;
  const mastS =
    mastType === 'simple'
      ? [S.masts[1]]
      : mastType === 'double' || mastType === 'pique'
        ? [S.masts[0] + (S.masts[1] - S.masts[0]) * 0.4, S.masts[2]]
        : S.masts;
  const mainIdx = mastS.length === 3 ? 1 : 0;
  let top = 0;
  const wood: Mat = {
    p: P.WOOD,
    color: linear('#6a4a2e'),
    metal: 0,
    rough: 0.7,
  };
  mastS.forEach((s, i) => {
    const x = hull.x(s);
    const y0 = hull.deckY(s);
    const H = mastType === 'pique' ? 24 : i === mainIdx ? 28 : 23.5;
    const rake = mastType === 'pique' ? 0.22 : 0.04;
    top = Math.max(top, y0 + H);
    b.push(chain(translation(x, y0, 0), rotationZ(rake)));
    b.lathe(
      [
        [0.42, -1],
        [0.36, H * 0.5],
        [0.22, H],
        [0, H + 0.05],
      ],
      12,
      wood
    );
    for (let k = 1; k < 6; k++) {
      b.push(translation(0, (H * k) / 6, 0));
      b.torus(0.4 - k * 0.03, 0.06, 12, 4, brass);
      b.pop();
    }
    if (mastType === 'pique') {
      // Voile aileron à lattes, dans l'axe du navire.
      const sw = 14;
      b.grid(
        14,
        10,
        (u, v) => {
          const yy = 3 + v * (H - 4);
          const span =
            sw *
            (1 - v * 0.75) *
            Math.pow(Math.sin(Math.min(1, u * 1.05) * (Math.PI / 2)), 1);
          const cut = 1 - 0.18 * Math.sin(u * Math.PI * 4) * u;
          return [-span * cut, yy, Math.sin(u * Math.PI) * 0.6 * (1 - v)];
        },
        sail,
        { uv: (u, v) => [u * sw, v * (H - 4)] }
      );
      for (let k = 1; k < 5; k++) {
        const v = k / 5;
        const yy = 3 + v * (H - 4);
        b.tube(
          [
            [0, yy, 0],
            [-sw * (1 - v * 0.75), yy + 1.5, 0],
          ],
          0.07,
          5,
          iron
        );
      }
    } else {
      const sc = i === mainIdx ? 1 : 0.86;
      const tiers = [
        [0.27, 0.52, 15],
        [0.55, 0.75, 11.5],
        [0.78, 0.92, 8],
      ];
      for (const [t0, t1, w0] of tiers) {
        const w = w0 * sc * (S.B / 10);
        const ya = H * t1;
        const yb = H * t0;
        b.push(translation(0, ya, 0));
        b.push(rotationX(Math.PI / 2));
        b.push(translation(0, -w / 2 - 0.4, 0));
        b.cylinder(0.16, w + 0.8, 8, wood);
        b.pop();
        b.pop();
        b.pop();
        b.grid(
          10,
          8,
          (u, v) => {
            const z = (u - 0.5) * w * (1 + v * 0.12);
            const yy = ya - 0.2 - v * (ya - yb - 0.3);
            const belly =
              Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.2) * 1.9;
            return [0.3 + belly, yy, z];
          },
          sail,
          { uv: (u, v) => [u * w, v * (ya - yb) * 4] }
        );
      }
      // Nid de pie.
      if (i === mainIdx) {
        b.push(translation(0, H * 0.8, 0));
        b.lathe(
          [
            [0, 0],
            [1.1, 0],
            [1.25, 0.15],
            [1.25, 1.1],
            [1.1, 1.2],
          ],
          18,
          copper
        );
        b.pop();
      }
    }
    b.pop();
    // Haubans.
    const tx = x - Math.sin(rake) * H;
    const ty = y0 + Math.cos(rake) * H;
    for (const side of [1, -1])
      for (const ds of [-0.025, 0, 0.025]) {
        const ss = Math.min(0.99, Math.max(0.01, s + ds));
        const p = hull.point(ss, 1);
        b.tube(
          [
            [tx, ty * 0.98 - 1, 0],
            [p[0], p[1] + hull.bulwark, (p[2] - 0.1) * side],
          ],
          0.035,
          3,
          rope
        );
      }
    // Étai vers la proue ou le mât suivant.
    const next = mastS[i + 1];
    if (next !== undefined)
      b.tube(
        [
          [tx, ty - 0.5, 0],
          [hull.x(next), hull.deckY(next) + 4, 0],
        ],
        0.04,
        3,
        rope
      );
    else {
      const bp = hull.point(0.995, 1);
      b.tube(
        [
          [tx, ty - 0.5, 0],
          [bp[0], bp[1] + hull.bulwark, 0],
        ],
        0.04,
        3,
        rope
      );
    }
    // Pavillon ou flamme.
    if (i === mainIdx) flag(b, [tx, ty, 0], build);
    else pennant(b, [tx, ty, 0], linear(build.mats.flagColor));
  });

  // --- Propulseurs ----------------------------------------------------------------------------
  for (const pod of S.pods) {
    const s = pod.s;
    const sz = pod.size;
    for (const side of pod.kind === 'rear' ? [1, -1] : [1, -1]) {
      let place: Mat4;
      let attach: Vec3;
      if (pod.kind === 'rear') {
        const p = hull.point(0.03, 0.5);
        const pos: Vec3 = [hull.x(0) - 1.2, p[1] - 0.4, p[2] * 0.75 * side];
        place = alignY(pos, [1, 0, 0]);
        attach = [hull.x(0.06), p[1], p[2] * 0.85 * side];
      } else {
        const v = 0.42;
        const p = hull.point(s, v);
        const off = hull.halfBeam(s) + 3.2 * sz;
        const pos: Vec3 = [p[0], p[1] - 1.2 * sz, off * side];
        const dir: Vec3 =
          pod.kind === 'angled' ? normalize([0.45, 1, 0]) : [0, 1, 0];
        place = alignY(pos, dir);
        attach = [p[0], p[1] + 0.6, p[2] * side];
        // Bras de suspension.
        const top: Vec3 = [pos[0], pos[1] + 1.6 * sz, pos[2] - 0.2 * side];
        b.tube(
          [
            attach,
            [
              (attach[0] + top[0]) / 2,
              attach[1] + 0.5,
              (attach[2] + top[2]) / 2,
            ],
            top,
          ],
          0.32 * sz,
          10,
          iron
        );
        b.tube(
          [
            [attach[0], attach[1] - 1.8, attach[2]],
            [pos[0], pos[1] - 0.2, pos[2] - 0.6 * side],
          ],
          0.16 * sz,
          8,
          brass
        );
      }
      b.push(chain(place, scaling(sz, sz, sz)));
      nacelle(b, copper, brass, iron, aether);
      b.pop();
      if (pod.kind === 'rear')
        b.tube(
          [attach, [place[12] + 0.5, place[13] + 0.6, place[14]]],
          0.3,
          8,
          iron
        );
      // Soufflante : tourne autour de l'axe du propulseur.
      const fan = new MeshBuilder();
      for (let k = 0; k < 9; k++) {
        fan.push(chain(rotationY((k / 9) * Math.PI * 2), rotationX(0.35)));
        fan.push(translation(0.42, 0, 0));
        fan.box(0.72, 0.04, 0.26, {
          p: P.IRON,
          color: linear('#9aa0a8'),
          metal: 1,
          rough: 0.35,
        });
        fan.pop();
        fan.pop();
      }
      fan.sphere(0.2, 10, brass);
      fans.push({
        mesh: fan.build(),
        place: chain(place, scaling(sz, sz, sz), translation(0, 2.35, 0)),
        speed: 14 * (side > 0 ? 1 : -1),
      });
      const pm = chain(place, scaling(sz, sz, sz));
      nozzles.push({
        pos: transformPoint(pm, [0, -3.2, 0]),
        dir: normalize(transformDir(place, [0, -1, 0])),
        size: sz,
      });
      // Panache.
      g.push(chain(place, scaling(sz, sz, sz)));
      plume(g, 0.62, 1.6, 8);
      g.pop();
    }
  }

  // --- Figure de proue, lanternes, signes distinctifs --------------------------------------------------
  figurehead(b, hull, build, brass);
  lanterns(b, hull, roofs, lum, lampColor, lampEmit, brass, iron);
  features(b, hull, build, roofs, {
    brass,
    iron,
    darkIron,
    copper,
    aether,
    glass,
  });
  crew(b, hull, roofs, opts.crew ?? 0, build);
  deckGear(b, hull, roofs, iron, brass);

  const bottom = hull.keelY(0.5) - 10;
  return {
    body: b.build(),
    glows: g.build(),
    fans,
    nozzles,
    stacks,
    center: [0, (top + bottom) / 2, 0],
    radius: Math.max(hull.L / 2 + 4, (top - bottom) / 2),
    top,
    bottom,
  };
}

function window(
  b: MeshBuilder,
  c: Vec3,
  n: Vec3,
  w: number,
  h: number,
  glass: Mat,
  frame: Mat
) {
  const z = normalize(n);
  const y: Vec3 = [0, 1, 0];
  const x = normalize(cross(y, z));
  b.push(basis(c, x, y, z));
  // Vitre cintrée.
  b.grid(
    4,
    6,
    (u, v) => {
      const xx = (u - 0.5) * w;
      const top = h / 2 + Math.sqrt(Math.max(0, (w / 2) ** 2 - xx * xx)) * 0.9;
      return [xx, -h / 2 + v * (top + h / 2), 0];
    },
    glass,
    { uv: (u, v) => [u, v] }
  );
  b.push(translation(0, -h / 2 - 0.08, 0.02));
  b.box(w + 0.3, 0.12, 0.12, frame);
  b.pop();
  for (const sx of [-1, 1]) {
    b.push(translation(sx * (w / 2 + 0.05), -h / 2, 0.02));
    b.box(0.1, h, 0.1, frame);
    b.pop();
  }
  b.push(translation(0, -h / 2, 0.03));
  b.box(0.05, h + w * 0.45, 0.05, frame);
  b.pop();
  b.pop();
}

function crenels(
  b: MeshBuilder,
  hull: Hull,
  a: number,
  e: number,
  y: (s: number) => number,
  w: (s: number) => number,
  mat: Mat
) {
  for (const side of [1, -1]) {
    for (let s = a + 0.01; s < e - 0.005; s += 1.4 / hull.L) {
      b.push(translation(hull.x(s), y(s), (w(s) - 0.3) * side));
      b.box(0.7, 0.9, 0.5, mat);
      b.pop();
    }
  }
}

function nacelle(
  b: MeshBuilder,
  body: Mat,
  brass: Mat,
  iron: Mat,
  aether: (e: number) => Mat
) {
  b.lathe(
    [
      [0.78, 2.6],
      [0.98, 2.5],
      [1.12, 2.1],
      [1.16, 0.8],
      [1.12, -0.9],
      [0.98, -1.7],
      [0.82, -2.1],
    ],
    28,
    body
  );
  b.lathe(
    [
      [0.82, -2.1],
      [0.9, -2.5],
      [0.78, -2.8],
      [0.62, -2.7],
    ],
    28,
    iron
  );
  b.push(translation(0, -2.62, 0));
  b.cylinder(0.62, 0.02, 24, aether(7));
  b.pop();
  b.push(translation(0, 2.55, 0));
  b.torus(0.86, 0.13, 28, 8, brass);
  b.cylinder(
    0.78,
    -1.4,
    20,
    { p: P.IRON, color: linear('#121212'), metal: 0.3, rough: 0.8 },
    false
  );
  b.pop();
  for (const y of [1.6, 0.2, -1.2]) {
    b.push(translation(0, y, 0));
    b.torus(1.16, 0.09, 28, 6, brass);
    b.pop();
  }
  // Ailerons.
  for (let k = 0; k < 4; k++) {
    b.push(
      chain(
        rotationY((k * Math.PI) / 2 + Math.PI / 4),
        translation(1.2, -1.4, 0)
      )
    );
    b.grid(2, 2, (u, v) => [u * 0.7, v * 1.8 - u * 0.5, 0], iron, {
      uv: (u, v) => [u, v],
    });
    b.pop();
  }
  // Jauge.
  b.push(chain(translation(0, 0.9, 1.15), rotationX(Math.PI / 2)));
  b.cylinder(0.28, 0.06, 16, brass);
  b.push(translation(0, 0.065, 0));
  b.cylinder(0.22, 0.01, 16, {
    p: P.PLAIN,
    color: linear('#efe6cf'),
    metal: 0,
    rough: 0.5,
  });
  b.pop();
  b.pop();
  // Anneaux d'Aether sous la tuyère.
  [-3.4, -4.5, -5.9].forEach((y, i) => {
    b.push(translation(0, y, 0));
    b.torus(0.72 + i * 0.22, 0.06 - i * 0.012, 32, 6, aether(5 - i * 1.2));
    b.pop();
  });
}

function plume(g: MeshBuilder, r0: number, r1: number, len: number) {
  g.grid(
    16,
    10,
    (u, v) => {
      const a = u * Math.PI * 2;
      const r = r0 + (r1 - r0) * Math.pow(v, 0.8);
      return [Math.cos(a) * r, -2.75 - v * len, Math.sin(a) * r];
    },
    { p: P.EMIT, color: linear('#3fd8ff'), metal: 0, rough: 1, emit: 1.6 },
    { uv: (u, v) => [u * 6, v] }
  );
  g.grid(
    12,
    6,
    (u, v) => {
      const a = u * Math.PI * 2;
      const r = r0 * 0.5 * (1 - v * 0.6);
      return [Math.cos(a) * r, -2.75 - v * len * 0.45, Math.sin(a) * r];
    },
    { p: P.EMIT, color: linear('#e8ffff'), metal: 0, rough: 1, emit: 2.5 },
    { uv: (u, v) => [u * 6, v] }
  );
}

function flag(b: MeshBuilder, top: Vec3, build: Build) {
  const c = linear(build.mats.flagColor);
  b.push(translation(top[0], top[1], top[2]));
  b.cylinder(
    0.06,
    3.2,
    6,
    { p: P.IRON, color: linear('#2a2a2a'), metal: 0.5, rough: 0.6 },
    false
  );
  b.grid(
    10,
    5,
    (u, v) => [-u * 4.4, 3.1 - v * 2.6, Math.sin(u * 5 + v) * 0.35 * u],
    { p: P.SAIL, color: c, metal: 0, rough: 0.85 },
    { uv: (u, v) => [u * 4, v * 2] }
  );
  // Emblème : disque clair au centre du pavillon.
  if (build.mats.flagEmblem !== 'aucun') {
    b.push(
      chain(
        translation(-2.2, 1.8, Math.sin(2.5 + 0.5) * 0.35 * 0.5 + 0.06),
        rotationX(Math.PI / 2)
      )
    );
    b.cylinder(0.55, 0.02, 16, {
      p: P.PLAIN,
      color: linear('#f0e2c0'),
      metal: 0,
      rough: 0.7,
    });
    b.pop();
  }
  b.pop();
}

function pennant(b: MeshBuilder, top: Vec3, c: Vec3) {
  b.push(translation(top[0], top[1], top[2]));
  b.grid(
    8,
    2,
    (u, v) => [
      -u * 4.5,
      -0.1 - (v - 0.5) * 0.7 * (1 - u * 0.9),
      Math.sin(u * 6) * 0.25 * u,
    ],
    { p: P.SAIL, color: c, metal: 0, rough: 0.85 },
    { uv: (u, v) => [u * 4, v] }
  );
  b.pop();
}

function figurehead(b: MeshBuilder, hull: Hull, build: Build, brass: Mat) {
  const kind = build.proue.sculpture;
  if (kind === 'aucune') return;
  const m: Mat =
    build.proue.material === 'cuivreor'
      ? brass
      : build.proue.material === 'renforce'
        ? { p: P.IRON, color: linear('#5a5a5e'), metal: 0.8, rough: 0.45 }
        : { p: P.WOOD, color: linear('#a88a64'), metal: 0, rough: 0.7 };
  const s = 0.985;
  const p = hull.point(s, 0.78);
  b.push(chain(translation(p[0] + 0.4, p[1], 0), rotationZ(-0.55)));
  if (kind === 'monstre') {
    b.push(scaling(1, 1, 0.8));
    b.lathe(
      [
        [0.9, 0],
        [0.75, 1.6],
        [0.6, 3],
        [0.35, 4.2],
        [0, 4.6],
      ],
      14,
      m
    );
    b.pop();
    for (const sz of [-1, 1]) {
      b.push(
        chain(
          translation(-0.3, 3.4, 0.35 * sz),
          rotationZ(0.9),
          rotationX(0.4 * sz)
        )
      );
      b.lathe(
        [
          [0.18, 0],
          [0.08, 1.2],
          [0, 1.6],
        ],
        6,
        m
      );
      b.pop();
      b.push(translation(0.35, 3.6, 0.32 * sz));
      b.sphere(0.13, 8, {
        p: P.EMIT,
        color: AETHER,
        metal: 0,
        rough: 0.4,
        emit: 6,
      });
      b.pop();
    }
  } else if (kind === 'humanoide') {
    b.lathe(
      [
        [0.55, 0],
        [0.62, 1.2],
        [0.45, 2.4],
        [0.2, 2.7],
        [0, 2.7],
      ],
      14,
      m
    );
    b.push(translation(0, 3.1, 0));
    b.sphere(0.42, 12, m);
    b.pop();
    for (const sz of [-1, 1]) {
      b.tube(
        [
          [0, 2.3, 0.4 * sz],
          [0.6, 3.6, 0.7 * sz],
          [0.9, 4.6, 0.5 * sz],
        ],
        0.13,
        6,
        m
      );
    }
  } else {
    b.lathe(
      [
        [0.7, 0],
        [0.7, 1.4],
        [0.5, 2.4],
        [0, 2.6],
      ],
      14,
      m
    );
    b.push(translation(0.1, 3, 0));
    b.sphere(0.65, 14, m);
    for (let k = 0; k < 12; k++) {
      b.push(chain(rotationX((k / 12) * Math.PI * 2), translation(0, 0.7, 0)));
      b.lathe(
        [
          [0.2, 0],
          [0, 0.55],
        ],
        5,
        m
      );
      b.pop();
    }
    b.pop();
  }
  b.pop();
}

type Roof = {
  a: number;
  b: number;
  y: (s: number) => number;
  w: (s: number) => number;
  shape: CastleShape;
};

function lanterns(
  b: MeshBuilder,
  hull: Hull,
  roofs: Roof[],
  lum: Build['poupe']['luminaires'],
  color: Vec3,
  emit: number,
  brass: Mat,
  iron: Mat
) {
  if (lum === 'aucun') return;
  const spots: Vec3[] = [];
  const r = roofs[0];
  if (r && r.a < 0.05) {
    spots.push(
      [hull.x(0.01), r.y(0.01) + 0.2, r.w(0.01) - 0.3],
      [hull.x(0.01), r.y(0.01) + 0.2, -(r.w(0.01) - 0.3)]
    );
  }
  const bp = hull.point(0.97, 1);
  spots.push([bp[0], bp[1] + hull.bulwark + 0.2, 0]);
  if (lum === 'aether')
    for (let s = 0.3; s < 0.85; s += 0.18) {
      const p = hull.point(s, 1);
      spots.push(
        [p[0], p[1] + hull.bulwark + 0.2, p[2] - 0.15],
        [p[0], p[1] + hull.bulwark + 0.2, -(p[2] - 0.15)]
      );
    }
  for (const sp of spots) {
    b.push(translation(sp[0], sp[1], sp[2]));
    b.cylinder(0.06, 0.8, 6, iron, false);
    b.push(translation(0, 0.8, 0));
    if (lum === 'braseros') {
      b.lathe(
        [
          [0, 0],
          [0.4, 0.1],
          [0.5, 0.5],
        ],
        10,
        iron
      );
      b.push(translation(0, 0.35, 0));
      b.sphere(0.32, 10, {
        p: P.EMIT,
        color,
        metal: 0,
        rough: 1,
        emit: emit * 1.4,
      });
      b.pop();
    } else {
      b.cylinder(0.22, 0.55, 10, {
        p: P.EMIT,
        color,
        metal: 0,
        rough: 1,
        emit,
      });
      b.push(translation(0, 0.55, 0));
      b.lathe(
        [
          [0.3, 0],
          [0.12, 0.3],
          [0, 0.4],
        ],
        10,
        brass
      );
      b.pop();
      b.lathe(
        [
          [0.3, -0.05],
          [0.3, 0.02],
        ],
        10,
        brass
      );
    }
    b.pop();
    b.pop();
  }
}

function deckGear(
  b: MeshBuilder,
  hull: Hull,
  roofs: Roof[],
  iron: Mat,
  brass: Mat
) {
  const crate: Mat = {
    p: P.WOOD,
    color: linear('#8a6a42'),
    metal: 0,
    rough: 0.8,
  };
  const free = (s: number) =>
    !roofs.some((r) => s > r.a - 0.03 && s < r.b + 0.03);
  const items: [number, number, 'box' | 'barrel' | 'vent'][] = [
    [0.43, 0.5, 'barrel'],
    [0.445, 0.6, 'barrel'],
    [0.57, -0.55, 'box'],
    [0.68, 0.45, 'box'],
    [0.79, -0.4, 'barrel'],
    [0.4, -0.55, 'vent'],
    [0.63, 0.62, 'vent'],
    [0.75, -0.62, 'vent'],
  ];
  for (const [s, zf, kind] of items) {
    if (!free(s)) continue;
    const p = hull.point(s, 1);
    const z = zf * (p[2] - 0.6);
    b.push(translation(p[0], hull.deckY(s), z));
    if (kind === 'box') b.box(1, 0.9, 1, crate);
    else if (kind === 'barrel') {
      b.lathe(
        [
          [0, 0],
          [0.38, 0],
          [0.45, 0.45],
          [0.38, 0.9],
          [0, 0.9],
        ],
        12,
        crate
      );
      for (const y of [0.15, 0.75]) {
        b.push(translation(0, y, 0));
        b.torus(0.42, 0.03, 12, 4, iron);
        b.pop();
      }
    } else {
      // Manche à air.
      b.cylinder(0.22, 1.6, 12, brass, false);
      b.push(chain(translation(0, 1.6, 0), rotationZ(-Math.PI / 2)));
      b.lathe(
        [
          [0.22, 0],
          [0.26, 0.3],
          [0.42, 0.65],
          [0.5, 0.75],
        ],
        14,
        brass
      );
      b.lathe(
        [
          [0.2, 0.05],
          [0.44, 0.72],
        ],
        14,
        { p: P.IRON, color: linear('#141414'), metal: 0.2, rough: 0.8 }
      );
      b.pop();
    }
    b.pop();
  }
  // Cabestan.
  const p = hull.point(0.82, 1);
  b.push(translation(p[0], hull.deckY(0.82), 0));
  b.lathe(
    [
      [0, 0],
      [0.7, 0],
      [0.5, 0.3],
      [0.45, 1],
      [0.7, 1.1],
      [0, 1.15],
    ],
    14,
    brass
  );
  b.pop();
  // Barre à roue, devant le château arrière.
  const aft = roofs.find((r) => r.a < 0.05);
  const hs = aft ? aft.b + 0.025 : 0.08;
  b.push(translation(hull.x(hs), hull.deckY(hs), 0));
  b.box(0.5, 1.1, 0.5, {
    p: P.WOOD,
    color: linear('#5a3a22'),
    metal: 0,
    rough: 0.7,
  });
  b.push(chain(translation(0.3, 1.5, 0), rotationZ(Math.PI / 2)));
  b.torus(0.75, 0.06, 24, 6, brass);
  for (let k = 0; k < 8; k++) {
    b.push(rotationY((k / 8) * Math.PI * 2));
    b.push(rotationZ(Math.PI / 2));
    b.cylinder(0.035, 1, 5, brass, false);
    b.pop();
    b.pop();
  }
  b.pop();
  b.pop();
  // Canots sur bossoirs.
  const boat: Mat = {
    p: P.WOOD,
    color: linear('#9a7048'),
    metal: 0,
    rough: 0.7,
  };
  for (const s of [0.38, 0.66]) {
    if (!free(s)) continue;
    for (const side of [1, -1]) {
      const pt = hull.point(s, 1);
      const z = (pt[2] + 1.1) * side;
      const y = hull.deckY(s) + hull.bulwark + 0.6;
      b.push(
        chain(
          translation(pt[0], y, z),
          rotationX(Math.PI),
          scaling(2.6, 0.75, 0.85)
        )
      );
      b.sphere(1, 18, boat, true);
      b.pop();
      for (const dx of [-2, 2]) {
        b.tube(
          [
            [pt[0] + dx, hull.deckY(s), (pt[2] - 0.3) * side],
            [pt[0] + dx, y + 1.6, (pt[2] + 0.2) * side],
            [pt[0] + dx, y + 1.5, z],
          ],
          0.07,
          5,
          iron
        );
        b.tube(
          [
            [pt[0] + dx, y + 1.5, z],
            [pt[0] + dx * 0.9, y + 0.1, z],
          ],
          0.02,
          3,
          { p: P.PLAIN, color: linear('#3a2c1e'), metal: 0, rough: 0.9 }
        );
      }
    }
  }
}

function crew(
  b: MeshBuilder,
  hull: Hull,
  roofs: Roof[],
  count: number,
  build: Build
) {
  const n = Math.min(10, Math.max(0, count));
  const body: Mat = {
    p: P.PLAIN,
    color: linear(build.tenue.color),
    metal: 0,
    rough: 0.85,
  };
  const accent: Mat = {
    p: P.PLAIN,
    color: linear(build.tenue.accent),
    metal: 0,
    rough: 0.7,
  };
  const skin: Mat = {
    p: P.PLAIN,
    color: linear('#c8956a'),
    metal: 0,
    rough: 0.7,
  };
  const hat: Mat = {
    p: P.PLAIN,
    color: linear('#1c1714'),
    metal: 0,
    rough: 0.8,
  };
  const free = (s: number) =>
    !roofs.some((r) => s > r.a - 0.02 && s < r.b + 0.02);
  let placed = 0;
  for (let i = 0; i < 40 && placed < n; i++) {
    const s = 0.2 + rand(i * 7 + 1) * 0.65;
    if (!free(s)) continue;
    const p = hull.point(s, 1);
    const z = (rand(i * 13 + 2) * 2 - 1) * (p[2] - 1.2);
    b.push(
      chain(translation(p[0], hull.deckY(s), z), rotationY(rand(i) * 6.28))
    );
    b.lathe(
      [
        [0.22, 0],
        [0.26, 0.9],
        [0.3, 1.35],
        [0.18, 1.5],
        [0, 1.5],
      ],
      8,
      body
    );
    b.push(translation(0, 1.1, 0));
    b.torus(0.29, 0.05, 8, 4, accent);
    b.pop();
    b.push(translation(0, 1.72, 0));
    b.sphere(0.2, 8, skin);
    b.push(translation(0, 0.12, 0));
    b.cylinder(0.3, 0.03, 10, hat);
    b.cylinder(0.17, 0.3, 10, hat);
    b.pop();
    b.pop();
    b.pop();
    placed++;
  }
}

interface Kit {
  brass: Mat;
  iron: Mat;
  darkIron: Mat;
  copper: Mat;
  aether: (e: number) => Mat;
  glass: Mat;
}

function features(
  b: MeshBuilder,
  hull: Hull,
  build: Build,
  roofs: Roof[],
  k: Kit
) {
  switch (build.allure) {
    case 'bombardier': {
      // Mortiers sur les deux tours.
      for (const r of [roofs[0], roofs[1]]) {
        if (!r) continue;
        const s = (r.a + r.b) / 2;
        b.push(translation(hull.x(s), r.y(s), 0));
        b.cylinder(1.6, 0.6, 20, k.iron);
        b.push(
          chain(translation(0, 0.9, 0), rotationZ(r.a < 0.1 ? -0.6 : 0.6))
        );
        b.lathe(
          [
            [0.9, -0.4],
            [0.95, 0],
            [0.8, 2.6],
            [0.95, 2.8],
            [0.95, 3.1],
            [0.7, 3.1],
            [0.7, 1],
          ],
          20,
          k.brass
        );
        b.pop();
        b.pop();
      }
      break;
    }
    case 'fleche': {
      // Lance d'Aether.
      const p = hull.point(1, 1);
      const tip: Vec3 = [p[0] + 9, p[1] + 2.5, 0];
      b.tube([[p[0] - 3, p[1] + 0.6, 0], tip], 0.18, 8, k.brass);
      for (const t of [0.35, 0.55, 0.75]) {
        const c: Vec3 = [
          p[0] - 3 + (tip[0] - p[0] + 3) * t,
          p[1] + 0.6 + (tip[1] - p[1] - 0.6) * t,
          0,
        ];
        b.push(alignY(c, [12, 1.9, 0]));
        b.torus(0.55 - t * 0.3, 0.07, 18, 5, k.brass);
        b.pop();
      }
      b.push(translation(tip[0], tip[1], 0));
      b.sphere(0.4, 12, k.aether(8));
      b.pop();
      break;
    }
    case 'forteresse': {
      const r = roofs[1];
      if (!r) break;
      // Projecteur et paratonnerre à bobine.
      const s = r.b - 0.04;
      b.push(translation(hull.x(s), r.y(s), 0));
      b.cylinder(0.5, 0.8, 12, k.iron);
      b.push(chain(translation(0, 1.5, 0), rotationZ(-Math.PI / 2 + 0.15)));
      b.lathe(
        [
          [0.7, -0.8],
          [0.9, -0.4],
          [0.9, 0.6],
          [1.05, 0.8],
        ],
        18,
        k.brass
      );
      b.push(translation(0, 0.8, 0));
      b.cylinder(0.95, 0.02, 18, {
        p: P.EMIT,
        color: linear('#fff3d0'),
        metal: 0,
        rough: 1,
        emit: 5,
      });
      b.pop();
      b.pop();
      b.pop();
      const sa = r.a + 0.05;
      b.push(translation(hull.x(sa), r.y(sa), 0));
      b.cylinder(0.12, 6, 8, k.iron, false);
      for (const y of [2.5, 3.4, 4.3]) {
        b.push(translation(0, y, 0));
        b.torus(0.55 - (y - 2.5) * 0.12, 0.08, 16, 5, k.copper);
        b.pop();
      }
      b.push(translation(0, 6.2, 0));
      b.sphere(0.45, 14, k.aether(7));
      b.pop();
      b.pop();
      break;
    }
    case 'enforceur': {
      // Éperon hérissé et visière.
      const yk = hull.keelY(1) + 0.6;
      const x = hull.x(1);
      for (const [dy, dz, len] of [
        [0, 0, 4.5],
        [1.2, 0.9, 3],
        [1.2, -0.9, 3],
        [-1, 0, 3],
      ]) {
        b.push(chain(translation(x - 1, yk + dy, dz), rotationZ(-Math.PI / 2)));
        b.lathe(
          [
            [0.55, 0],
            [0.45, len * 0.4],
            [0, len],
          ],
          10,
          k.darkIron
        );
        b.pop();
      }
      const r = roofs[1];
      if (r) {
        for (const side of [1, -1]) {
          const sv = (r.a + r.b) / 2;
          const y = r.y(sv) - 1.3;
          b.grid(
            10,
            1,
            (u, v) => {
              const s = r.a + 0.02 + (r.b - r.a - 0.04) * u;
              return [hull.x(s), y + v * 0.9, (r.w(s) + 0.08) * side];
            },
            k.darkIron,
            { uv: (u, v) => [u * 10, v], flip: side < 0 }
          );
          b.grid(
            10,
            1,
            (u, v) => {
              const s = r.a + 0.05 + (r.b - r.a - 0.1) * u;
              return [hull.x(s), y + 0.35 + v * 0.2, (r.w(s) + 0.12) * side];
            },
            k.aether(4),
            { uv: (u, v) => [u * 10, v], flip: side < 0 }
          );
        }
      }
      break;
    }
    case 'gouverneur': {
      // Balcon de poupe et blason.
      const r = roofs[0];
      const x = hull.x(0);
      const y = hull.deckY(0) + 2.2;
      const w = hull.halfBeam(0.02) - 0.4;
      b.push(translation(x - 1.2, y, 0));
      b.box(2.4, 0.2, w * 2, k.brass);
      b.pop();
      const pts: Vec3[] = [
        [x, y + 1.1, w],
        [x - 2.3, y + 1.1, w],
        [x - 2.3, y + 1.1, -w],
        [x, y + 1.1, -w],
      ];
      b.tube(pts, 0.07, 5, k.brass);
      for (let z = -w; z <= w + 0.01; z += 0.7) {
        b.push(translation(x - 2.3, y, z));
        b.cylinder(0.04, 1.1, 5, k.brass, false);
        b.pop();
      }
      if (r) {
        for (const side of [1, -1]) {
          const s = (r.a + r.b) * 0.42;
          b.push(
            chain(
              translation(
                hull.x(s),
                hull.deckY(s) + 3.2,
                (r.w(s) + 0.1) * side
              ),
              rotationX((side * Math.PI) / 2)
            )
          );
          b.lathe(
            [
              [0, 0],
              [1.1, 0],
              [1.1, 0.12],
              [0, 0.12],
            ],
            6,
            {
              p: P.PLAIN,
              color: linear(build.mats.flagColor),
              metal: 0,
              rough: 0.6,
            }
          );
          b.torus(1.12, 0.12, 6, 5, k.brass);
          b.pop();
        }
      }
      break;
    }
    case 'survivor': {
      // Grue de récupération.
      const r = roofs[0];
      if (!r) break;
      const s = r.b - 0.04;
      const x = hull.x(s);
      const y = r.y(s);
      b.push(translation(x, y, 0));
      b.cylinder(0.9, 1.2, 14, k.iron);
      b.pop();
      const tip: Vec3 = [x + 11, y + 6.5, 2.5];
      b.tube([[x, y + 1, 0], tip], 0.35, 8, k.iron);
      b.tube(
        [
          [x - 0.5, y + 1, 0.4],
          [tip[0] - 1, tip[1] - 0.3, tip[2] + 0.2],
        ],
        0.12,
        6,
        k.brass
      );
      b.tube([tip, [tip[0], tip[1] - 6, tip[2]]], 0.04, 3, k.iron);
      b.push(translation(tip[0], tip[1] - 7.4, tip[2]));
      b.box(1.6, 1.4, 1.6, k.copper);
      b.pop();
      break;
    }
    case 'protector':
      break;
    default: {
      // Escorteur : tourelle rotative sur le gaillard.
      const s = 0.82;
      const x = hull.x(s);
      const y = hull.deckY(s);
      b.push(translation(x, y, 0));
      b.lathe(
        [
          [0, 0],
          [1.5, 0],
          [1.5, 0.5],
          [1.2, 1.4],
          [0, 1.6],
        ],
        20,
        k.brass
      );
      for (const dz of [-0.35, 0.35]) {
        b.push(
          chain(translation(0.6, 0.9, dz), rotationZ(-Math.PI / 2 + 0.05))
        );
        b.cylinder(0.16, 3.2, 10, k.darkIron);
        b.pop();
      }
      b.pop();
    }
  }
}

export { SPECS as ALLURE_SPECS };
