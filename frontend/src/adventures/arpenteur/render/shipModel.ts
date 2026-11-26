import type { Allure, Build, Material } from '../model/types';
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

/** Élargissement général des coques (le gréement suit la largeur). */
const BEAM_SCALE = 1.42;

/** Rentrée des murs des châteaux, du pied au toit. */
const CT = 0.12;

export class Hull {
  readonly s: AllureSpec;
  readonly D: number;
  constructor(
    readonly allure: Allure,
    readonly ponts: number
  ) {
    // Coque élargie : plus d'assise et de pont visible quand on tourne autour.
    this.s = { ...SPECS[allure], B: SPECS[allure].B * BEAM_SCALE };
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
    // Plan courbe : pas de partie droite au milieu, arrière qui se resserre.
    const tr = transom * 0.82;
    let hb =
      (B / 2) *
      (tr + (1 - tr) * Math.pow(smooth(0, 0.48, s), 0.55)) *
      (1 - 0.07 * Math.pow((s - 0.52) / 0.48, 2));
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
    // Tonture : le pont se creuse au milieu et se relève aux extrémités.
    let y =
      1.6 * sheerStern * Math.pow(1 - s, 3) +
      1.3 * sheerBow * Math.pow(s, 4) +
      1.1 * Math.pow(Math.abs(s - 0.47) / 0.53, 2.2) -
      0.25;
    if (bow === 'horn') y += 3 * Math.pow(this.bowT(s), 3);
    return y;
  }
  keelY(s: number) {
    const D = this.D;
    const { bow, sternRise } = this.s;
    // Quille en arc : elle remonte doucement vers l'arrière et l'avant.
    const y =
      -D +
      (sternRise + D * 0.18) * (1 - smooth(0, 0.38, s)) +
      D * 0.06 * Math.pow((s - 0.55) * 2, 2);
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
      // Section en V vers les extrémités, en U arrondi au milieu.
      const end = Math.max(0, Math.abs(s - 0.5) * 2 - 0.25) / 0.75;
      const phi = (v / 0.66) * (Math.PI / 2);
      z = hb * Math.pow(Math.sin(phi), 0.85 + 0.9 * end);
      y = yM - (yM - yK) * Math.pow(Math.cos(phi), 0.95);
    } else {
      // Muraille rentrante (« tumblehome ») : la coque se resserre vers le pont.
      const t = (v - 0.66) / 0.34;
      z = hb * (1 + 0.025 * Math.sin(t * Math.PI) - 0.14 * Math.pow(t, 1.7));
      y = yM + (yD - yM) * t;
    }
    return [this.x(s) + this.shift(s, v), y, z];
  }
  /** Élancement : l'étrave s'avance et la poupe déborde en hauteur. */
  shift(s: number, v: number) {
    const k = Math.pow(Math.max(0, v), 1.4);
    const bow = this.s.bow;
    const stem = bow === 'ram' ? 0.4 : bow === 'pod' ? 1.2 : 2.4;
    return (
      Math.pow(this.bowT(s), 2) * k * stem - (1 - smooth(0, 0.14, s)) * k * 1.5
    );
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
  /** Demi-largeur au maître-bau et longueur de coque (m). */
  halfBeam: number;
  length: number;
  /** Équipage animé (repère du navire), et ses couleurs. */
  crew: CrewMember[];
  crewStyle: CrewStyle;
}

export type CrewRole = 'walk' | 'helm' | 'haul' | 'scrub' | 'look' | 'capstan';
export interface CrewMember {
  role: CrewRole;
  /** Position (pied) ; pour « walk », départ du trajet ; pour « capstan », centre. */
  pos: Vec3;
  /** Arrivée du trajet (« walk »). */
  to?: Vec3;
  /** Orientation (radians autour de y, 0 = vers la proue). */
  yaw: number;
  seed: number;
}
export interface CrewStyle {
  body: string;
  accent: string;
}

export interface ShipOptions {
  guns?: number;
  crew?: number;
  night?: boolean;
  /** Dégâts de la coque, de 0 (intacte) à 1. */
  damage?: number;
  /** Échafaudages du chantier en cours. */
  scaffolding?: boolean;
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
    p: P.PATINA,
    color: linear('#9c5a34'),
    metal: 1,
    rough: 0.52,
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
  const lampEmit = lum === 'aucun' ? 0 : opts.night ? 5 : 1.1;
  const glass: Mat = {
    p: P.GLASS,
    color: lampColor,
    metal: 0,
    rough: 0.05,
    emit: lum === 'aucun' ? 0 : opts.night ? 3.2 : 0.55,
  };
  // En plein jour, les lueurs restent visibles sans être surexposées.
  const aether = (e: number): Mat => ({
    p: P.EMIT,
    color: AETHER,
    metal: 0,
    rough: 0.4,
    emit: e * (opts.night ? 0.6 : 0.38),
  });

  // --- Coque -----------------------------------------------------------------
  const NU = 140;
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
    const tops: number[] = [];
    for (const side of [1, -1]) {
      const ids = ring.map((p) =>
        b.vertex([p[0], p[1], p[2] * side], n, [p[2] * side, p[1]], hullMat)
      );
      // Même orientation (vers l'arrière) des deux côtés.
      for (let i = 0; i < ids.length - 1; i++)
        if (side > 0) b.tri(ci, ids[i], ids[i + 1]);
        else b.tri(ci, ids[i + 1], ids[i]);
      tops.push(ids[ids.length - 1]);
    }
    // Les deux demi-éventails s'arrêtent au livet : on referme le haut du
    // tableau, entre le centre et les deux coins du pont (sinon, trou en V).
    b.tri(ci, tops[1], tops[0]);
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
  // Préceintes : épaisses ceintures de bois sombre, en saillie sur le bordé
  // (la plus haute borde le pont).
  const wale: Mat = {
    p: P.WOOD,
    color: linear('#3a2a1d'),
    metal: 0,
    rough: 0.85,
  };
  strip(0.975, 1, wale, 0.12);
  strip(0.81, 0.845, wale, 0.16);
  strip(0.895, 0.925, wale, 0.14);
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
    const sa = c.a === 0 ? 0.004 : c.a;
    // Château de poupe en deux niveaux : gaillard bas sur toute la longueur,
    // dunette plus haute sur l'arrière (comme sur un galion).
    const stepped =
      (c.shape === 'box' || c.shape === 'dome') &&
      c.a < 0.05 &&
      c.b - c.a > 0.17 &&
      c.h >= 3;
    const split = stepped ? sa + (c.b - sa) * 0.55 : c.b;
    const hUp = (s: number) => {
      if (c.shape === 'slope')
        return c.h * (1 - 0.8 * smooth(c.a + (c.b - c.a) * 0.25, c.b, s)) + 0.6;
      // Le toit prolonge la tonture : il se relève vers l'extrémité du navire.
      const rel = (s - c.a) / (c.b - c.a);
      const toEnd = c.a < 0.05 ? 1 - rel : c.b > 0.95 ? rel : 0;
      return c.h * (0.9 + 0.22 * toEnd * toEnd);
    };
    const hLow = (s: number) => Math.max(2.2, hUp(s) * 0.52);
    const height = (s: number) =>
      stepped && s > split + 1e-6 ? hLow(s) : hUp(s);
    // Plan arrondi aux extrémités du château (galerie de poupe galbée).
    const width = (s: number) => {
      const e = Math.min(
        1,
        Math.abs((s - (c.a + c.b) / 2) / ((c.b - c.a) / 2))
      );
      const round = 0.6 + 0.4 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 4)));
      return Math.max(0.6, (hull.halfBeam(s) - 0.25) * wf * round);
    };
    const base = (s: number) => hull.deckY(s);
    const r = Math.min(0.9, c.h * 0.16);
    // Les murs suivent l'élancement de la coque au niveau du pont.
    const cx = (s: number) => hull.x(s) + hull.shift(s, 1);
    const sec = (s: number, t: number): Vec3 => {
      // t parcourt la section : flanc tribord, toit, flanc bâbord.
      const w = width(s);
      const y0 = base(s) - 0.05;
      const y1 = y0 + height(s);
      const per = 2 * (y1 - y0 - r) + 2 * (w - r) + Math.PI * r;
      let d = t * per;
      const x = cx(s);
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
    // Murs rentrants (même pente pour les deux niveaux), mur arrière en surplomb.
    const tumble = (p: Vec3, s: number): Vec3 => {
      const f = Math.max(0, (p[1] - base(s)) / hUp(s));
      let x = p[0];
      if (c.a < 0.05) x -= (1 - smooth(sa, sa + 0.07, s)) * f * f * 1.4;
      if (c.b > 0.95) x += smooth(c.b - 0.07, c.b, s) * f * f * 1.0;
      return [x, p[1], p[2] * (1 - CT * f)];
    };
    const secT = (s: number, t: number) => tumble(sec(s, t), s);
    const zAt = (s: number, y: number) =>
      width(s) * (1 - CT * ((y - base(s)) / hUp(s)));
    const ranges: [number, number][] = stepped
      ? [
          [sa, split],
          [split + 1e-5, c.b],
        ]
      : [[sa, c.b]];
    const trimMat: Mat = {
      ...castleMat,
      color: [
        castleMat.color[0] * 0.55,
        castleMat.color[1] * 0.55,
        castleMat.color[2] * 0.55,
      ],
    };
    for (const [r0, r1] of ranges)
      b.grid(
        Math.max(6, Math.round((r1 - r0) * 80)),
        40,
        (u, t) => secT(r0 + (r1 - r0) * u, t),
        castleMat,
        {
          uv: (u, t) => {
            const p = secT(r0 + (r1 - r0) * u, t);
            return [p[0], p[1] + Math.abs(p[2]) * (t > 0.3 && t < 0.7 ? 1 : 0)];
          },
          flip: true,
        }
      );
    // Murs d'extrémité (et front de la dunette au-dessus du gaillard).
    const ends: [number, number, number][] = [[sa, -1, 0]];
    if (stepped) ends.push([split, 1, hLow(split) + 0.5]);
    ends.push([c.b, 1, 0]);
    for (const [s, dir, minH] of ends) {
      const ring: Vec3[] = [];
      for (let i = 0; i <= 40; i++) ring.push(secT(s, i / 40));
      const cy = base(s) + height(s) / 2;
      const ci = b.vertex([cx(s), cy, 0], [dir, 0, 0], [0, cy], castleMat);
      const ids = ring.map((p) =>
        b.vertex(p, [dir, 0, 0], [p[2], p[1]], castleMat)
      );
      // Le contour (flanc, toit, flanc) ne comprend pas le bas du mur : le
      // dernier triangle le referme (sinon, trou triangulaire sous le balcon).
      const last = ids.length - 1;
      for (let i = 0; i < last; i++) {
        if (dir > 0) b.tri(ci, ids[i], ids[i + 1]);
        else b.tri(ci, ids[i + 1], ids[i]);
      }
      if (dir > 0) b.tri(ci, ids[last], ids[0]);
      else b.tri(ci, ids[0], ids[last]);
      const front = stepped && s === split;
      const w = width(s);
      const n = Math.max(1, Math.floor((w * 2 - 1.2) / 1.8));
      const rows = height(s) - minH > 4.5 ? 2 : 1;
      for (let row = 0; row < rows; row++)
        for (let k = 0; k < n; k++) {
          const z = -w + 0.6 + (k + 0.5) * ((w * 2 - 1.2) / n);
          const y = base(s) + height(s) - 1.6 - row * 2.2;
          if (y < base(s) + Math.max(0.8, minH)) continue;
          if (front && Math.abs(z) < 1) continue;
          window(
            b,
            [cx(s) + dir * 0.03, y, z],
            [dir, 0, 0],
            0.6,
            1.0,
            glass,
            brass
          );
        }
      // Porte de la dunette, encadrée de laiton.
      if (front) {
        const y = base(s) + hLow(s);
        b.push(translation(cx(s) + 0.04, y, 0));
        b.box(0.1, 2.1, 1.2, trimMat);
        b.pop();
        b.push(
          chain(translation(cx(s) + 0.1, y + 2.1, 0), rotationZ(Math.PI / 2))
        );
        b.cylinder(0.07, 0.04, 6, brass);
        b.pop();
        b.tube(
          [
            [cx(s) + 0.1, y, -0.66],
            [cx(s) + 0.1, y + 2.2, -0.66],
            [cx(s) + 0.1, y + 2.2, 0.66],
            [cx(s) + 0.1, y, 0.66],
          ],
          0.06,
          5,
          brass
        );
      }
    }
    // Fenêtres des flancs : une rangée par niveau.
    for (const side of [1, -1]) {
      for (const [r0, r1] of ranges) {
        const len = (r1 - r0) * hull.L;
        const n = Math.max(1, Math.floor((len - 1.2) / 2.8));
        for (let k = 0; k < n; k++) {
          const s = r0 + ((k + 0.5) / n) * (r1 - r0);
          const h = height(s);
          if (h < 2.2) continue;
          const y = base(s) + h - 1.4;
          window(
            b,
            [cx(s), y, (zAt(s, y) + 0.04) * side],
            [0, 0, side],
            0.6,
            0.95,
            glass,
            brass
          );
        }
      }
    }
    // Moulure sombre sous chaque toit, et rambarde ajourée (montants, main courante).
    const rail = (pts: Vec3[], posts = true) => {
      if (posts)
        for (const p of pts) {
          b.push(translation(p[0], p[1] - 0.95, p[2]));
          b.cylinder(0.055, 0.95, 6, brass);
          b.pop();
        }
      b.tube(pts, 0.07, 6, brass);
    };
    for (const [r0, r1] of ranges) {
      const n = Math.max(3, Math.round(((r1 - r0) * hull.L) / 1.2));
      for (const side of [1, -1]) {
        const top: Vec3[] = [];
        const mold: Vec3[] = [];
        for (let k = 0; k <= n; k++) {
          const s = r0 + ((r1 - r0) * k) / n;
          const y = base(s) + height(s);
          const xx = secT(s, 0.5)[0];
          top.push([xx, y + 0.95, (zAt(s, y) - 0.15) * side]);
          mold.push([xx, y - 0.25, (zAt(s, y - 0.25) + 0.06) * side]);
        }
        rail(top);
        b.tube(mold, 0.13, 6, trimMat);
      }
      // Rambarde en travers à l'avant de chaque niveau.
      const s = r1;
      const y = base(s) + height(s) + 0.95;
      const w = zAt(s, y - 0.95) - 0.15;
      const xs = cx(s) - 0.15;
      const across: Vec3[] = [];
      for (let k = 0; k <= 6; k++) across.push([xs, y, -w + (2 * w * k) / 6]);
      rail(across);
    }
    // Rambarde arrière.
    {
      const y = base(sa) + height(sa) + 0.95;
      const w = zAt(sa, y - 0.95) - 0.15;
      const xs = secT(sa, 0.5)[0] + 0.2;
      const pts: Vec3[] = [];
      for (let k = 0; k <= 6; k++) pts.push([xs, y, -w + (2 * w * k) / 6]);
      rail(pts);
    }
    // Poupe : balcon de la galerie arrière et tourelles d'angle (bouteilles).
    if (c.a < 0.05 && hUp(sa) > 4.2) {
      const fb = 0.42;
      const yb = base(sa) + hUp(sa) * fb;
      const xw = cx(sa) - fb * fb * 1.4;
      const wb = zAt(sa, yb) * 0.85;
      b.push(translation(xw - 0.55, yb - 0.14, 0));
      b.box(1.2, 0.14, wb * 2, trimMat);
      b.pop();
      const pts: Vec3[] = [];
      for (let k = 0; k <= 8; k++)
        pts.push([xw - 1.1, yb + 0.9, -wb + (2 * wb * k) / 8]);
      rail(pts);
      for (const side of [1, -1]) {
        const s = sa + 0.03;
        const y0 = base(s) + hUp(s) * 0.28;
        const hg = hUp(s) * 0.5;
        const z = (zAt(s, y0 + hg * 0.5) + 0.25) * side;
        const x = cx(s) - 0.15;
        b.push(translation(x, y0, z));
        b.lathe(
          [
            [0, -1.1],
            [0.45, -0.85],
            [0.95, -0.1],
            [0.95, hg],
            [0.75, hg + 0.35],
            [0.35, hg + 0.85],
            [0, hg + 1.2],
          ],
          18,
          castleMat
        );
        for (const yy of [0, hg]) {
          b.push(translation(0, yy, 0));
          b.torus(0.97, 0.06, 18, 4, brass);
          b.pop();
        }
        b.pop();
        window(
          b,
          [x, y0 + hg * 0.5, z + 0.96 * side],
          [0, 0, side],
          0.5,
          0.85,
          glass,
          brass
        );
      }
    }
    roofs.push({
      a: sa,
      b: c.b,
      y: (s) => base(s) + height(s),
      w: width,
      shape: c.shape,
    });
    if (c.shape === 'dome') {
      // Dôme de cuivre posé sur un tambour octogonal en bois percé de
      // fenêtres, ceinturé de moulures : il fait corps avec la dunette.
      const s = (sa + split) / 2;
      const y = base(s) + height(s);
      const x = cx(s);
      const R = Math.max(
        1.2,
        Math.min(2.3, width(s) - 1.1, ((split - sa) * hull.L) / 2 - 1.2)
      );
      const H = 1.3;
      b.push(translation(x, y - 0.05, 0));
      b.lathe(
        [
          [R + 0.3, 0],
          [R + 0.3, 0.22],
          [R, 0.22],
          [R, H],
          [R + 0.16, H],
          [R + 0.16, H + 0.16],
          [R * 0.98, H + 0.16],
        ],
        8,
        castleMat
      );
      b.pop();
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) / 8) * Math.PI * 2;
        const rr = R * Math.cos(Math.PI / 8) + 0.02;
        window(
          b,
          [x + Math.cos(a) * rr, y + 0.75, Math.sin(a) * rr],
          [Math.cos(a), 0, Math.sin(a)],
          0.42,
          0.7,
          glass,
          brass
        );
      }
      const dome: Mat = {
        p: P.PATINA,
        color: linear('#b0703e'),
        metal: 0.85,
        rough: 0.62,
      };
      b.push(chain(translation(x, y + H + 0.1, 0), scaling(1, 0.85, 1)));
      b.sphere(R, 32, dome, true);
      for (let k = 0; k < 8; k++) {
        b.push(rotationY(((k + 0.5) / 8) * Math.PI * 2));
        const arc: Vec3[] = [];
        for (let i2 = 0; i2 <= 12; i2++) {
          const a = (i2 / 12) * (Math.PI / 2);
          arc.push([Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0]);
        }
        b.tube(arc, 0.05, 4, brass);
        b.pop();
      }
      b.pop();
      // Petite lanterne vitrée au sommet.
      const yt = y + H + 0.1 + R * 0.85;
      b.push(translation(x, yt - 0.05, 0));
      b.cylinder(0.32, 0.12, 12, brass);
      b.push(translation(0, 0.12, 0));
      b.cylinder(0.24, 0.5, 8, { ...glass, emit: (glass.emit ?? 0) * 0.8 });
      b.pop();
      b.push(translation(0, 0.62, 0));
      b.lathe(
        [
          [0.34, 0],
          [0.2, 0.22],
          [0.04, 0.42],
          [0, 0.5],
        ],
        8,
        dome
      );
      b.pop();
      b.pop();
    }
    if (c.shape === 'tower' || (c.shape === 'box' && c.h > 6))
      crenels(
        b,
        hull,
        sa,
        split,
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
        b.torus(0.5, 0.1, 18, 6, brass);
        if (gun) {
          // Sabord ouvert, pièce en batterie : fût bien visible, renfort et
          // bouche évasée.
          b.cylinder(0.42, 0.03, 14, darkIron);
          b.cylinder(0.27, 0.5, 12, darkIron, true);
          b.push(translation(0, 0.5, 0));
          b.torus(0.26, 0.07, 12, 5, brass);
          b.cylinder(0.21, 1.25, 12, darkIron, true);
          b.pop();
          b.push(translation(0, 1.7, 0));
          b.lathe(
            [
              [0.21, 0],
              [0.29, 0.12],
              [0.28, 0.22],
              [0.12, 0.22],
              [0.12, 0],
            ],
            12,
            darkIron
          );
          b.pop();
        } else {
          // Sabord fermé : mantelet de bois cerclé.
          b.cylinder(0.43, 0.07, 14, hullMat);
          b.cylinder(0.12, 0.11, 8, iron);
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
      // Brigantine (voile aurique) sur le mât arrière, à la place de la basse voile.
      const spanker = i === 0 && mastS.length > 1;
      // Vergues brassées : les voiles prennent le vent de biais.
      const brace = -(0.26 + i * 0.04);
      const tiers = [
        [0.27, 0.52, 15],
        [0.55, 0.75, 11.5],
        [0.78, 0.92, 8],
      ];
      for (const [t0, t1, w0] of tiers) {
        if (spanker && t0 < 0.3) continue;
        b.push(rotationY(brace));
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
        // Voile carrée : gonflée au centre, bordure basse relevée entre les écoutes,
        // bords tendus par la ralingue.
        b.grid(
          22,
          16,
          (u, v) => {
            // Voile pleine : surface bombée, tenue droite le long de la vergue,
            // creux maximal vers les deux tiers, bordure basse ramenée vers la
            // vergue inférieure ; les bords latéraux avancent aussi un peu.
            const c = u * 2 - 1;
            const depth = Math.min(3.4, w * 0.21);
            const fv = Math.pow(Math.sin(Math.PI * (v * 0.8 + 0.02)), 0.7);
            const across = 1 - 0.72 * c * c;
            const z =
              c *
              (w / 2) *
              (1 + v * 0.12) *
              (1 - 0.07 * fv) *
              (1 - 0.05 * Math.sin(Math.PI * v));
            const foot = (1 - c * c) * 0.7 * v * v;
            const yy = ya - 0.2 - v * (ya - yb - 0.3) + foot;
            const belly =
              depth * across * fv +
              Math.sin(u * 9 + v * 3) * 0.05 * (1 - c * c);
            return [0.25 + belly, yy, z];
          },
          (u, v) =>
            flutter(sail, Math.sqrt(1 - (u * 2 - 1) ** 2) * Math.pow(v, 0.8)),
          { uv: (u, v) => [u * w, v * (ya - yb) * 4] }
        );
        b.pop();
      }
      if (spanker) {
        const s0 = hull.sOf(x);
        const bl = Math.min(8.5, s0 * hull.L * 0.62);
        let clear = 3.5;
        for (const r of roofs)
          for (let k = 0; k <= 8; k++) {
            const ss = hull.sOf(x - (bl * k) / 8);
            if (ss >= r.a && ss <= r.b)
              clear = Math.max(clear, r.y(ss) - y0 + 1.6);
          }
        const yl0 = Math.min(clear, H * 0.4);
        const yl1 = Math.max(yl0 + 5, H * 0.52);
        const gaff: Vec3 = [-bl * 0.82, yl1 + 2.2, 0];
        const boom: Vec3 = [-bl, yl0, 0];
        foreAft(
          b,
          [-0.45, yl0 + 0.2, 0],
          [-0.45, yl1, 0],
          gaff,
          boom,
          sail,
          1.5
        );
        b.tube([[-0.3, yl1, 0], gaff], 0.12, 6, wood);
        b.tube([[-0.3, yl0, 0], boom], 0.14, 6, wood);
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
    for (const side of [1, -1]) {
      const feet: Vec3[] = [];
      for (const ds of [-0.025, 0, 0.025]) {
        const ss = Math.min(0.99, Math.max(0.01, s + ds));
        const p = hull.point(ss, 1);
        const foot: Vec3 = [p[0], p[1] + hull.bulwark, (p[2] - 0.1) * side];
        feet.push(foot);
        b.tube([[tx, ty * 0.98 - 1, 0], foot], 0.035, 3, rope);
      }
      // Enfléchures : échelons de corde entre les haubans, sur le bas du gréement.
      const top: Vec3 = [tx, ty * 0.98 - 1, 0];
      const at = (f: Vec3, t: number): Vec3 => [
        f[0] + (top[0] - f[0]) * t,
        f[1] + (top[1] - f[1]) * t,
        f[2] + (top[2] - f[2]) * t,
      ];
      for (let t = 0.06; t < 0.55; t += 0.045)
        b.tube(
          [at(feet[0], t), at(feet[1], t), at(feet[2], t)],
          0.018,
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
      const T: Vec3 = [tx, ty - 0.5, 0];
      const B: Vec3 = [bp[0], bp[1] + hull.bulwark, 0];
      b.tube([T, B], 0.04, 3, rope);
      // Focs triangulaires le long de l'étai.
      const on = (t: number): Vec3 => [
        T[0] + (B[0] - T[0]) * t,
        T[1] + (B[1] - T[1]) * t,
        0,
      ];
      if (mastType !== 'pique')
        [
          [0.3, 0.88, 0.42, 0],
          [0.52, 0.97, 0.18, 0.5],
        ].forEach(([h, t, back, dz]) => {
          const head = on(h);
          const tack = on(t);
          const cx = tack[0] - (tack[0] - x) * back - 1.5;
          const clew: Vec3 = [
            cx,
            hull.deckY(hull.sOf(cx)) + hull.bulwark + 2.2,
            dz,
          ];
          head[2] = dz;
          tack[2] = dz;
          foreAft(b, tack, head, head, clew, sail, 1.2);
        });
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
  const gear = deckGear(b, hull, roofs, iron, brass, {
    masts: mastS,
    stacks: S.chimneys,
    reactor: S.reactor,
    turret: build.allure === 'escorteur' ? 0.82 : null,
  });
  const crewMembers = crewPlan(
    hull,
    roofs,
    opts.crew ?? 0,
    mastS.map((m) => hull.x(m)),
    gear
  );
  if (opts.scaffolding) scaffold(b, hull, iron);
  damage(b, hull, opts.damage ?? 0, stacks);

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
    crew: crewMembers,
    halfBeam: hull.halfBeam(0.5),
    length: hull.L,
    crewStyle: { body: build.tenue.color, accent: build.tenue.accent },
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

/** Matériau de toile portant le poids d'animation du vent (voir le shader). */
const flutter = (m: Mat, w: number): Mat => ({ ...m, emit: w });

/** Voile aurique ou triangulaire (clew = head pour un triangle), creusée côté z. */
function foreAft(
  b: MeshBuilder,
  luffBottom: Vec3,
  luffTop: Vec3,
  leechTop: Vec3,
  leechBottom: Vec3,
  mat: Mat,
  belly: number
) {
  const lerp = (a: Vec3, c: Vec3, t: number): Vec3 => [
    a[0] + (c[0] - a[0]) * t,
    a[1] + (c[1] - a[1]) * t,
    a[2] + (c[2] - a[2]) * t,
  ];
  for (const side of [1, -1])
    b.grid(
      12,
      12,
      (u, v) => {
        const p = lerp(
          lerp(luffBottom, leechBottom, u),
          lerp(luffTop, leechTop, u),
          v
        );
        const d =
          Math.sin(Math.PI * Math.min(1, u * 1.15)) *
          Math.sin(Math.PI * v * 0.92 + 0.1);
        return [p[0], p[1], p[2] + d * belly + side * 0.004];
      },
      (u, v) =>
        flutter(
          mat,
          Math.sin(Math.PI * Math.min(1, u * 1.15)) *
            Math.sin(Math.PI * v * 0.92 + 0.1)
        ),
      { uv: (u, v) => [u * 8, v * 30], flip: side < 0 }
    );
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
    { p: P.EMIT, color: linear('#3fd8ff'), metal: 0, rough: 1, emit: 0.85 },
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
    { p: P.EMIT, color: linear('#e8ffff'), metal: 0, rough: 1, emit: 1.3 },
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
  // L'emblème est peint dans la toile (couleur par sommet) pour onduler avec elle.
  const emblem = build.mats.flagEmblem !== 'aucun';
  const light = linear('#f0e2c0');
  b.grid(
    28,
    14,
    (u, v) => [-u * 4.4, 3.1 - v * 2.6, Math.sin(u * 5 + v) * 0.35 * u],
    (u, v) => {
      const d = Math.hypot((u - 0.5) * 4.4, (v - 0.5) * 2.6);
      const k = emblem ? 1 - smooth(0.48, 0.6, d) : 0;
      return {
        p: P.SAIL,
        color: [
          c[0] + (light[0] - c[0]) * k,
          c[1] + (light[1] - c[1]) * k,
          c[2] + (light[2] - c[2]) * k,
        ],
        metal: 0,
        rough: 0.85,
        emit: 1 + u,
      };
    },
    { uv: (u, v) => [u * 4, v * 2] }
  );
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
    (u) => ({ p: P.SAIL, color: c, metal: 0, rough: 0.85, emit: 1 + u }),
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

/**
 * Accastillage du pont, disposé comme sur un vrai navire : écoutilles entre
 * les mâts avec leur cargaison arrimée, râteliers à cabillots et glènes au
 * pied des mâts, manches à air de part et d'autre des cheminées et du cœur
 * d'Aether, tonneaux en rangs contre le pavois, cabestan à l'avant, roue et
 * habitacle devant la dunette, canots sur bossoirs dans les grands espaces
 * libres. Rien ne se chevauche : chaque élément réserve sa place.
 */
function deckGear(
  b: MeshBuilder,
  hull: Hull,
  roofs: Roof[],
  iron: Mat,
  brass: Mat,
  o: {
    masts: number[];
    stacks: number[];
    reactor: number;
    turret: number | null;
  }
): { helm: number; capstan: number | null } {
  let capstan: number | null = null;
  const L = hull.L;
  const wood = (hex: string, rough = 0.8): Mat => ({
    p: P.WOOD,
    color: linear(hex),
    metal: 0,
    rough,
  });
  const crate = wood('#8a6a42');
  const darkWood = wood('#4a3220');
  const rope: Mat = {
    p: P.PLAIN,
    color: linear('#8a7458'),
    metal: 0,
    rough: 1,
  };
  const grate: Mat = {
    p: P.IRON,
    color: linear('#1c1712'),
    metal: 0.2,
    rough: 0.9,
  };
  const canvas: Mat = {
    p: P.SAIL,
    color: linear('#b8a888'),
    metal: 0,
    rough: 0.9,
  };

  // Places déjà prises sur le pont : (s, z, rayon en m).
  const taken: [number, number, number][] = [];
  const reserve = (s: number, z: number, r: number) => taken.push([s, z, r]);
  const clear = (s: number, z: number, r: number) =>
    s > 0.06 &&
    s < 0.94 &&
    !roofs.some((rf) => s > rf.a - (r + 1) / L && s < rf.b + (r + 1) / L) &&
    !taken.some(([ts, tz, tr]) => Math.hypot((s - ts) * L, z - tz) < r + tr);
  const halfAt = (s: number) => Math.max(1, hull.point(s, 1)[2] - 0.7);
  const at = (s: number, z: number) => translation(hull.x(s), hull.deckY(s), z);
  for (const m of o.masts) reserve(m, 0, 1.3);
  for (const c of o.stacks) reserve(c, 0, 1.4);
  reserve(o.reactor, 0, 2.6);
  if (o.turret !== null) reserve(o.turret, 0, 2.6);

  const barrel = () => {
    b.lathe(
      [
        [0, 0],
        [0.36, 0],
        [0.43, 0.45],
        [0.36, 0.9],
        [0, 0.9],
      ],
      12,
      crate
    );
    for (const y of [0.15, 0.75]) {
      b.push(translation(0, y, 0));
      b.torus(0.4, 0.03, 12, 4, iron);
      b.pop();
    }
  };
  const coil = (r = 0.45) => {
    for (let k = 0; k < 3; k++) {
      b.push(translation(0, 0.05 + k * 0.07, 0));
      b.torus(r - k * 0.08, 0.05, 14, 4, rope);
      b.pop();
    }
  };
  const vent = (ry: number) => {
    b.push(rotationY(ry));
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
    b.pop();
  };

  // 1. Pied des mâts : râtelier à cabillots en fer à cheval et glènes de cordage.
  for (const m of o.masts) {
    if (roofs.some((rf) => m > rf.a && m < rf.b)) continue;
    b.push(at(m, 0));
    const pins: Vec3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * 0.15 + (k / 8) * Math.PI * 1.7;
      pins.push([Math.cos(a) * 1.15, 0.85, Math.sin(a) * 1.15]);
    }
    b.tube(pins, 0.09, 6, darkWood);
    for (const p of [pins[0], pins[4], pins[8]]) {
      b.push(translation(p[0], 0, p[2]));
      b.cylinder(0.08, 0.85, 6, darkWood);
      b.pop();
    }
    for (let k = 0; k <= 8; k += 2) {
      b.push(translation(pins[k][0], 0.8, pins[k][2]));
      b.cylinder(0.035, 0.35, 5, brass);
      b.pop();
    }
    for (const sz of [1, -1]) {
      b.push(translation(-0.9, 0, sz * 1.45));
      coil(0.38);
      b.pop();
    }
    b.pop();
    reserve(m, 0, 1.9);
  }

  // 2. Manches à air de part et d'autre des cheminées et du cœur d'Aether.
  for (const [c, dz] of [
    ...o.stacks.map((c) => [c, 1.9] as const),
    [o.reactor, 3] as const,
  ]) {
    for (const side of [1, -1]) {
      const z = side * Math.min(dz, halfAt(c) - 0.6);
      if (!clear(c, z, 0.5)) continue;
      b.push(at(c, z));
      vent(side > 0 ? Math.PI : 0);
      b.pop();
      reserve(c, z, 0.6);
    }
  }

  // 3. Écoutilles dans les intervalles libres de l'axe, cargaison arrimée autour.
  const axis = [
    ...taken
      .filter(([, z]) => z === 0)
      .map(([s, , r]) => [s - r / L, s + r / L] as const),
  ];
  for (const rf of roofs) axis.push([rf.a - 1.5 / L, rf.b + 1.5 / L]);
  axis.push([0, 0.08], [0.92, 1]);
  axis.sort((a, c) => a[0] - c[0]);
  const gaps: [number, number][] = [];
  let cur = 0;
  for (const [a, c] of axis) {
    if (a > cur) gaps.push([cur, a]);
    cur = Math.max(cur, c);
  }
  let boats = 0;
  let house = false;
  for (const [g0, g1] of gaps.sort((a, c) => c[1] - c[0] - (a[1] - a[0]))) {
    const len = (g1 - g0) * L;
    if (len < 3.4) continue;
    const sm = (g0 + g1) / 2;
    if (!house && len > 11) {
      // Rouf de la cuisine dans le plus grand espace : cabine et tuyau de poêle.
      house = true;
      const dl = Math.min(len - 5, 6);
      const dw = Math.min(halfAt(sm) * 0.7, 3);
      b.push(at(sm + 1 / L, 0));
      b.box(dl, 2.1, dw * 2, darkWood);
      b.push(translation(0, 2.1, 0));
      b.box(dl + 0.4, 0.18, dw * 2 + 0.4, wood('#6a4a2e'));
      b.push(translation(dl * 0.25, 0.18, dw * 0.4));
      b.cylinder(0.18, 1.6, 8, iron);
      b.pop();
      b.pop();
      for (const sz of [1, -1])
        for (const dx of [-dl * 0.25, dl * 0.25]) {
          b.push(translation(dx, 1.1, sz * (dw + 0.02)));
          b.box(0.6, 0.55, 0.06, {
            p: P.EMIT,
            color: linear('#ffb45a'),
            metal: 0,
            rough: 1,
            emit: 0.6,
          });
          b.pop();
        }
      b.push(translation(dl / 2 + 0.03, 0, 0));
      b.box(0.06, 1.8, 0.9, wood('#3a2616'));
      b.pop();
      b.pop();
      reserve(sm + 1 / L, 0, Math.max(dl, dw * 2) / 2 + 0.5);
      if (boats < 2) {
        boats++;
        lifeboats(sm);
      }
      // L'écoutille va dans la partie restante.
      const g2: [number, number] = [sm + (dl / 2 + 1.6) / L, g1];
      if ((g2[1] - g2[0]) * L < 3.4) continue;
      hatchAt((g2[0] + g2[1]) / 2, (g2[1] - g2[0]) * L);
      continue;
    }
    hatchAt(sm, len);
    if (boats < 2 && len > 5) {
      boats++;
      lifeboats(sm);
    }
  }

  function hatchAt(sm: number, len: number) {
    const hl = Math.min(len - 1.6, 5.5);
    const hw = Math.min(halfAt(sm) * 0.55, 2.4);
    // Écoutille : hiloire de bois et caillebotis.
    b.push(at(sm, 0));
    b.box(hl, 0.45, hw * 2, darkWood);
    b.push(translation(0, 0.45, 0));
    b.box(hl - 0.3, 0.03, hw * 2 - 0.3, grate);
    const nb = Math.max(3, Math.round(hl / 0.45));
    for (let k = 0; k < nb; k++) {
      b.push(
        translation(-hl / 2 + 0.15 + (k + 0.5) * ((hl - 0.3) / nb), 0.03, 0)
      );
      b.box(0.14, 0.06, hw * 2 - 0.3, darkWood);
      b.pop();
    }
    b.pop();
    b.pop();
    reserve(sm, 0, Math.max(hl, hw * 2) / 2 + 0.4);
    // Caisses empilées et bâchées à un coin, tonneaux à l'autre.
    const cs = sm + (hl / 2 + 1) / L;
    const cz = hw * 0.6;
    if (clear(cs, cz, 0.9)) {
      b.push(chain(at(cs, cz), rotationY(0.1)));
      b.box(1.1, 0.9, 1.1, crate);
      b.push(translation(0.3, 0.9, -0.1));
      b.box(0.9, 0.75, 0.9, crate);
      b.pop();
      b.push(translation(-0.75, 0, 0.6));
      b.box(0.8, 0.7, 0.8, crate);
      b.pop();
      b.push(translation(0.1, 0.92, 0.1));
      b.box(1.25, 0.04, 1.25, canvas);
      b.pop();
      b.pop();
      reserve(cs, cz, 1.2);
    }
    const ks = sm - (hl / 2 + 0.9) / L;
    const kz = -hw * 0.5;
    if (clear(ks, kz, 0.9))
      for (const [dx, dz] of [
        [0, 0],
        [0.85, 0],
        [0.42, 0.75],
      ]) {
        b.push(at(ks + dx / L, kz + dz));
        barrel();
        b.pop();
        reserve(ks + dx / L, kz + dz, 0.5);
      }
  }

  // 4. Tonneaux en rangs le long du pavois, glènes près des haubans.
  for (let s = 0.12; s < 0.9; s += 2.2 / L)
    for (const side of [1, -1]) {
      const z = side * (halfAt(s) - 0.15);
      if (!clear(s, z, 1.1)) continue;
      const kind = Math.floor((s * 97 + (side > 0 ? 3 : 0)) % 3);
      if (kind === 0) {
        for (let k = 0; k < 3; k++) {
          b.push(at(s + (k - 1) * (0.85 / L), z));
          barrel();
          b.pop();
        }
        reserve(s, z, 1.4);
      } else if (kind === 1) {
        b.push(at(s, z));
        coil(0.5);
        b.pop();
        reserve(s, z, 0.7);
      }
    }

  // 5. Cabestan à l'avant du mât de misaine, sur l'axe.
  const fore = Math.max(...o.masts);
  for (const sc of [fore + 5 / L, fore + 7 / L, 0.84, 0.78]) {
    if (!clear(sc, 0, 1.3)) continue;
    b.push(at(sc, 0));
    b.lathe(
      [
        [0, 0],
        [0.75, 0],
        [0.52, 0.3],
        [0.46, 1],
        [0.72, 1.1],
        [0, 1.15],
      ],
      14,
      brass
    );
    for (let k = 0; k < 6; k++) {
      b.push(
        chain(
          translation(0, 0.95, 0),
          rotationY((k / 6) * Math.PI * 2),
          rotationZ(Math.PI / 2)
        )
      );
      b.cylinder(0.05, 1.4, 5, darkWood, false);
      b.pop();
    }
    b.pop();
    reserve(sc, 0, 1.6);
    capstan = sc;
    break;
  }

  // 6. Roue et habitacle de compas devant la dunette.
  const aft = roofs.find((r) => r.a < 0.05);
  const hs = aft ? aft.b + 1.6 / L : 0.1;
  b.push(at(hs, 0));
  b.box(0.5, 1.1, 0.5, wood('#5a3a22', 0.7));
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
  // Habitacle : colonne de bois et dôme de laiton.
  b.push(translation(1.4, 0, 0));
  b.lathe(
    [
      [0.3, 0],
      [0.22, 0.9],
      [0.32, 1.05],
      [0.28, 1.25],
      [0, 1.38],
    ],
    12,
    brass
  );
  b.pop();
  b.pop();
  reserve(hs, 0, 2);
  return { helm: hs, capstan };

  function lifeboats(s: number) {
    const boat = wood('#9a7048', 0.7);
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
          rope
        );
      }
      reserve(s, (pt[2] - 0.5) * side, 2.4);
    }
  }
}

/**
 * Équipage : où se tient chacun et ce qu'il fait. L'animation se fait à
 * l'image (Stage) : marche sur le pont, barre, cabestan, drisses, brosse,
 * vigie sur la dunette. Au moins trois personnes pour que le navire vive.
 */
function crewPlan(
  hull: Hull,
  roofs: Roof[],
  count: number,
  mastX: number[],
  gear: { helm: number; capstan: number | null }
): CrewMember[] {
  const n = Math.min(12, Math.max(3, count));
  const out: CrewMember[] = [];
  const free = (s: number) =>
    s > 0.1 &&
    s < 0.9 &&
    !roofs.some((r) => s > r.a - 0.025 && s < r.b + 0.025);
  const at = (s: number, z: number): Vec3 => [hull.x(s), hull.deckY(s), z];
  const sOfX = (x: number) => hull.sOf(x);
  const aft = roofs.find((r) => r.a < 0.05);
  const hs = gear.helm;
  // 1. Barreur, derrière la roue, face à la proue.
  out.push({
    role: 'helm',
    pos: [hull.x(hs) - 0.55, hull.deckY(hs), 0],
    yaw: 0,
    seed: 1,
  });
  // 2. Cabestan, poussé en tournant.
  if (gear.capstan !== null)
    out.push({ role: 'capstan', pos: at(gear.capstan, 0), yaw: 0, seed: 2 });
  // 3. Vigie sur la dunette.
  if (aft) {
    const sv = aft.a + (aft.b - aft.a) * 0.18;
    out.push({
      role: 'look',
      pos: [hull.x(sv), aft.y(sv), aft.w(sv) * 0.45],
      yaw: 0.6,
      seed: 3,
    });
  }
  // Intervalles libres du pont pour les marcheurs.
  const spans: [number, number][] = [];
  let st = -1;
  for (let k = 0; k <= 200; k++) {
    const s = k / 200;
    if (free(s) && st < 0) st = s;
    if ((!free(s) || k === 200) && st >= 0) {
      if (s - st > 0.08) spans.push([st, s - 0.005]);
      st = -1;
    }
  }
  let k = 0;
  while (out.length < n && k < 60) {
    const seed = 10 + k;
    const r1 = rand(seed * 7 + 1);
    const r2 = rand(seed * 13 + 5);
    const role: CrewRole = (['walk', 'haul', 'walk', 'scrub'] as const)[k % 4];
    k++;
    if (role === 'haul') {
      const mx = mastX[(k >> 2) % mastX.length];
      if (mx === undefined) continue;
      const side = r1 < 0.5 ? 1 : -1;
      const s = sOfX(mx + 0.5);
      if (!free(s)) continue;
      out.push({
        role,
        pos: [mx + 0.5, hull.deckY(s), side * 1.15],
        yaw: side * (Math.PI / 2),
        seed,
      });
      continue;
    }
    if (!spans.length) break;
    const [a, b] = spans[Math.floor(r1 * spans.length) % spans.length];
    const hb = (s: number) => Math.max(0.8, hull.halfBeam(s) - 1.4);
    if (role === 'walk') {
      const s0 = a + 0.01;
      const s1 = b - 0.01;
      const z = (r2 * 2 - 1) * Math.min(hb(s0), hb(s1));
      const zz = Math.abs(z) < 1.2 ? Math.sign(z || 1) * 1.4 : z;
      out.push({ role, pos: at(s0, zz), to: at(s1, zz), yaw: 0, seed });
    } else {
      const s = a + (b - a) * r2;
      const z = (r1 * 2 - 1) * hb(s);
      out.push({ role, pos: at(s, z), yaw: r1 * 6.28, seed });
    }
  }
  return out;
}

/** Pièces d'un matelot (pivots : hanche pour le tronc et les jambes, épaule pour les bras). */
export function crewMeshes(style: CrewStyle) {
  const body: Mat = {
    p: P.PLAIN,
    color: linear(style.body),
    metal: 0,
    rough: 0.85,
  };
  const accent: Mat = {
    p: P.PLAIN,
    color: linear(style.accent),
    metal: 0,
    rough: 0.7,
  };
  const skin: Mat = {
    p: P.PLAIN,
    color: linear('#c8956a'),
    metal: 0,
    rough: 0.7,
  };
  const shirt: Mat = {
    p: P.SAIL,
    color: linear('#e4dccb'),
    metal: 0,
    rough: 0.9,
  };
  const trousers: Mat = {
    p: P.PLAIN,
    color: linear('#3b3027'),
    metal: 0,
    rough: 0.9,
  };
  const dark: Mat = {
    p: P.PLAIN,
    color: linear('#1c1714'),
    metal: 0,
    rough: 0.8,
  };
  // Tronc (de la hanche, y = 0, aux épaules) + tête et chapeau.
  const torso = new MeshBuilder();
  torso.lathe(
    [
      [0, -0.05],
      [0.2, -0.05],
      [0.22, 0.15],
      [0.2, 0.32],
      [0.25, 0.52],
      [0.24, 0.6],
      [0.08, 0.66],
      [0, 0.66],
    ],
    10,
    body
  );
  torso.push(translation(0, 0.08, 0));
  torso.torus(0.215, 0.04, 10, 4, accent);
  torso.pop();
  torso.push(translation(0, 0.68, 0));
  torso.cylinder(0.07, 0.08, 6, skin);
  torso.pop();
  torso.push(translation(0, 0.86, 0));
  torso.sphere(0.13, 10, skin);
  torso.push(translation(0, 0.08, 0));
  torso.cylinder(0.21, 0.025, 10, dark);
  torso.cylinder(0.12, 0.17, 10, dark);
  torso.pop();
  torso.pop();
  // Jambe (pend de la hanche) avec botte.
  const leg = new MeshBuilder();
  leg.push(translation(0, -0.86, 0));
  leg.cylinder(0.075, 0.86, 6, trousers);
  leg.box(0.26, 0.14, 0.12, dark);
  leg.pop();
  leg.push(translation(0.04, -0.86, 0));
  leg.pop();
  // Bras (pend de l'épaule) avec main.
  const arm = new MeshBuilder();
  arm.push(translation(0, -0.6, 0));
  arm.cylinder(0.055, 0.6, 6, shirt);
  arm.sphere(0.065, 6, skin);
  arm.pop();
  return { torso: torso.build(), leg: leg.build(), arm: arm.build() };
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

/** Échafaudages de bois sur tribord et grue de chantier. */
function scaffold(b: MeshBuilder, hull: Hull, iron: Mat) {
  const wood: Mat = {
    p: P.WOOD,
    color: linear('#b08a5a'),
    metal: 0,
    rough: 0.85,
  };
  const s0 = 0.34;
  const s1 = 0.74;
  const yb = hull.keelY(0.5) - 0.5;
  const yt = hull.deckY(0.5) + 6;
  for (const side of [1, -1]) {
    const zAt = (s: number) => (hull.halfBeam(s) + 1.3) * side;
    const poles: number[] = [];
    for (let s = s0; s <= s1 + 1e-6; s += 3.2 / hull.L) poles.push(s);
    for (const s of poles) {
      b.push(translation(hull.x(s), yb, zAt(s)));
      b.cylinder(0.12, yt - yb, 6, wood, false);
      b.pop();
    }
    for (let y = yb + 1.5; y < yt; y += 2.6) {
      for (let i = 0; i < poles.length - 1; i++) {
        const sa = poles[i];
        const sb = poles[i + 1];
        const x = (hull.x(sa) + hull.x(sb)) / 2;
        b.push(translation(x, y, (zAt(sa) + zAt(sb)) / 2));
        b.box(hull.x(sb) - hull.x(sa) + 0.4, 0.14, 0.9, wood);
        b.pop();
      }
    }
    for (let i = 0; i < poles.length - 1; i++) {
      const up = i % 2 === 0;
      b.tube(
        [
          [hull.x(poles[i]), up ? yb + 1.5 : yt - 1, zAt(poles[i])],
          [hull.x(poles[i + 1]), up ? yt - 1 : yb + 1.5, zAt(poles[i + 1])],
        ],
        0.06,
        4,
        iron
      );
    }
  }
  // Grue de chantier.
  const cs = s1 + 0.04;
  const base: [number, number, number] = [hull.x(cs), hull.deckY(cs), 0];
  b.push(translation(base[0], base[1], 0));
  b.cylinder(0.25, 13, 8, iron, false);
  b.pop();
  const tip: [number, number, number] = [base[0] - 9, base[1] + 13.5, 5];
  b.tube([[base[0], base[1] + 12.5, 0], tip], 0.18, 6, iron);
  b.tube([tip, [tip[0], tip[1] - 7, tip[2]]], 0.03, 3, {
    p: P.PLAIN,
    color: linear('#3a2c1e'),
    metal: 0,
    rough: 0.9,
  });
  b.push(translation(tip[0], tip[1] - 8.4, tip[2]));
  b.box(1.4, 1.2, 1.4, wood);
  b.pop();
}

/** Brèches dans la coque, feux et fumées selon les dégâts. */
function damage(b: MeshBuilder, hull: Hull, amount: number, stacks: Vec3[]) {
  const n = Math.round(Math.max(0, Math.min(1, amount)) * 8);
  if (!n) return;
  const charred: Mat = {
    p: P.IRON,
    color: linear('#0c0a09'),
    metal: 0,
    rough: 1,
  };
  const splinter: Mat = {
    p: P.WOOD,
    color: linear('#3a2616'),
    metal: 0,
    rough: 0.95,
  };
  const fire: Mat = {
    p: P.EMIT,
    color: linear('#ff7a2a'),
    metal: 0,
    rough: 1,
    emit: 6,
  };
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const s = 0.2 + rand(i * 7 + 3) * 0.62;
    const v = 0.5 + rand(i * 13 + 5) * 0.38;
    // Brèche épousant la coque : bord déchiqueté, bordé enfoncé et noirci au
    // centre, auréole de brûlure autour, échardes qui pointent vers l'extérieur.
    const r = 0.7 + rand(i * 3) * 0.7;
    const p0 = hull.point(s, v);
    const p1 = hull.point(s, Math.min(1, v + 0.01));
    const perV =
      0.01 /
      Math.max(0.05, Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
    const edge = (a: number) =>
      r *
      (0.72 +
        0.28 * Math.sin(a * 5 + i) * Math.sin(a * 3 - i * 2) +
        0.12 * Math.sin(a * 11 + i));
    const onHull = (a: number, rho: number, depth: number): Vec3 => {
      const d = edge(a) * rho;
      const ss = s + (Math.cos(a) * d * 1.2) / hull.L;
      const vv = Math.min(0.99, Math.max(0.02, v + Math.sin(a) * d * perV));
      const p = hull.point(ss, vv);
      const n = hull.normal(ss, vv);
      return [
        p[0] + n[0] * depth,
        p[1] + n[1] * depth,
        (p[2] + n[2] * depth) * side,
      ];
    };
    const flip = side < 0;
    // Intérieur enfoncé et carbonisé.
    b.grid(
      28,
      5,
      (u, w) =>
        onHull(u * Math.PI * 2, 1 - w, -0.45 * (1 - (1 - w) ** 2) + 0.02),
      charred,
      { flip: !flip }
    );
    // Auréole de bois brûlé autour de la brèche.
    b.grid(
      28,
      3,
      (u, w) => onHull(u * Math.PI * 2, 1 + w * 0.55, 0.025 - w * 0.015),
      { ...splinter, color: linear('#24170e') },
      { flip }
    );
    // Échardes le long du bord.
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rand(i + k) * 0.4;
      const at = onHull(a, 1, 0.02);
      const n = hull.normal(s, v);
      const out: Vec3 = [
        Math.cos(a) * 0.5 + n[0] * 0.7,
        Math.sin(a) * 0.5 + n[1] * 0.7,
        n[2] * 0.7 * side,
      ];
      b.push(alignY(at, out));
      b.lathe(
        [
          [0.08, 0],
          [0.035, 0.35 + rand(i * 5 + k) * 0.45],
          [0, 0.7],
        ],
        4,
        splinter
      );
      b.pop();
    }
    if (amount >= 0.5 && i % 2 === 0) {
      const d: Vec3 = [
        hull.x(s),
        hull.deckY(s) + 0.4,
        (hull.halfBeam(s) - 1.4) * side,
      ];
      b.push(translation(d[0], d[1], d[2]));
      b.sphere(0.45, 8, fire);
      b.push(translation(0.2, 0.5, 0));
      b.sphere(0.3, 8, fire);
      b.pop();
      b.pop();
      stacks.push([d[0], d[1] + 0.8, d[2]]);
    } else if (amount >= 0.3 && i < 3) {
      stacks.push([
        hull.x(s),
        hull.deckY(s) + 0.5,
        (hull.halfBeam(s) - 1.5) * side,
      ]);
    }
  }
}
