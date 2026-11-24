import * as THREE from 'three';
import { NATIVE_BEAM } from '../../arpenteur3d/native';
import type { RefMaterials } from './materials';
import { SailRig, type SailSpec } from './sails';
import {
  along,
  bez,
  box,
  cyl,
  grid,
  Kit,
  lathe,
  M,
  sphere,
  sweep,
  torus,
  tube,
} from './kit';
import { PropSet, type PropKind, type PropLib } from './props';

// Navire de référence (gabarit « Protector » : 55 m, 10 m de large).
// Tout est galbé : coque lissée en sections continues (étrave élancée,
// poupe en fer à cheval), châteaux qui épousent le plan de la coque,
// salle des machines aux angles arrondis, dôme lisse nervuré, cheminée
// évasée, mâts et vergues effilés, voiles gonflées bordées de ralingues,
// nacelles horizontales profilées sur bras articulés, tuyauterie courbe.
// Repère : x vers la proue, y vers le haut, z par le travers ; quille à y = 0.

// Objets de décor modélisés (barre, cabestan, tonneaux…) : posés en
// instances quand ils sont chargés, sinon les pièces modelées en code restent.
let P = new PropSet(null);

// Gabarit courant (fixé au début de buildShip) : dimensions et forme.
export let L = 55.2;
let B = 10;
let D = 6.8;
const F = {
  transom: 0.72,
  sternRise: 1.4,
  bowStart: 0.6,
  bowFull: 0.6,
  sheerBow: 2.3,
  sheerStern: 1.3,
  rake: 4.2,
  ram: 0,
  spur: 0,
};
const X = (s: number) => (s - 0.5) * L;

/** Gabarit d'une allure (repris des spécifications du modèle classique). */
export interface HullSpec {
  L: number;
  B: number;
  D: number;
  transom: number;
  sternRise: number;
  bow: string;
  bowStart: number;
  sheerBow: number;
  sheerStern: number;
  castles: { a: number; b: number; h: number; shape: string; w?: number }[];
  masts: number[];
  chimneys: number[];
  reactor: number;
  pods: { s: number; kind: string; size: number }[];
}

export const PROTECTOR: HullSpec = {
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
};

function setForm(sp: HullSpec) {
  L = sp.L;
  // Coque plus ventrue que le modèle classique (rapport longueur/largeur ~4).
  B = sp.B * NATIVE_BEAM;
  D = sp.D;
  F.transom = sp.transom;
  F.sternRise = sp.sternRise;
  F.bowStart = Math.min(0.75, Math.max(0.5, sp.bowStart - 0.04));
  F.sheerBow = Math.min(3.6, sp.sheerBow * 1.1);
  F.sheerStern = Math.min(2, sp.sheerStern);
  // Étrave selon le type de proue.
  const bows: Record<string, [number, number, number, number]> = {
    // élancement, plein de l'avant, éperon de flottaison, éperon médian
    round: [4.2, 0.6, 0, 0],
    horn: [5.6, 0.62, 0, 0],
    blade: [7, 0.85, 0, 0],
    pod: [1.4, 0.35, 0, 0],
    ram: [0.8, 0.55, 4.5, 0],
    tall: [3, 0.55, 0, 0],
    spur: [3.4, 0.62, 0, 3],
  };
  const b = bows[sp.bow] ?? bows.round;
  F.rake = b[0];
  F.bowFull = b[1];
  F.ram = b[2];
  F.spur = b[3];
}
const RAIL = 1.15;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Plan de formes ------------------------------------------------------------

/** Demi-largeur selon s (0 = poupe, 1 = proue) : poupe ronde, proue fine. */
export function halfB(s: number) {
  const bs = F.bowStart;
  if (s > bs)
    return (
      (B / 2) * Math.pow(Math.max(0, 1 - ((s - bs) / (1 - bs)) ** 2), F.bowFull)
    );
  // Poupe ronde : plus pleine quand le tableau du modèle classique est large.
  const st = 0.06 + 0.12 * (1 - F.transom);
  if (s < st) return (B / 2) * Math.sqrt(Math.max(0, 1 - ((st - s) / st) ** 2));
  return B / 2;
}
export function keelY(s: number) {
  let y = 0;
  if (s > 0.74) y += D * 0.55 * ((s - 0.74) / 0.26) ** 2;
  if (s < 0.22)
    y += D * (0.36 + 0.2 * F.sternRise) * ((0.22 - s) / 0.22) ** 2.2;
  return y;
}
export function deckY(s: number) {
  let y = D;
  if (s < 0.3) y += F.sheerStern * ((0.3 - s) / 0.3) ** 2;
  if (s > 0.68) y += F.sheerBow * ((s - 0.68) / 0.32) ** 2;
  return y;
}

/** Point de la coque : t de 0 (quille) à 1 (pont), jusqu'à 1.25 (lisse). */
export function hullPt(s: number, t: number, side = 1): THREE.Vector3 {
  const hb = halfB(s);
  const k = keelY(s),
    d = deckY(s);
  // Exposant des sections : flancs pleins au milieu, V vers la proue.
  const n = 1.8 + 1.2 * sm(0.05, 0.3, s) * (1 - sm(0.58, 0.95, s));
  let y: number, z: number;
  if (t <= 1) {
    const phi = (t * Math.PI) / 2;
    z = hb * Math.pow(Math.sin(phi), 2 / n);
    y = k + (d - k) * (1 - Math.pow(Math.cos(phi), 2 / n));
    // Rentrée des hauts au milieu, évasement (dévers) à la proue.
    z *=
      1 -
      0.05 * sm(0.75, 1, t) * (1 - sm(0.7, 0.95, s)) +
      0.07 * sm(0.72, 1, s) * sm(0.55, 1, t);
  } else {
    const f = (t - 1) / 0.25;
    const z1 = hb * (1 - 0.05 * (1 - sm(0.7, 0.95, s)) + 0.07 * sm(0.72, 1, s));
    z = z1 - 0.1 * f * (1 - sm(0.8, 1, s));
    y = d + f * RAIL;
  }
  // Étrave élancée : la proue s'avance avec la hauteur.
  const h = Math.min(1.2, (y - k) / Math.max(0.5, D + F.sheerBow - k));
  let x = X(s) + F.rake * sm(0.8, 1, s) * h * h;
  if (F.ram)
    x += F.ram * sm(0.86, 1, s) * Math.pow(Math.max(0, 1 - h * 1.6), 3);
  if (F.spur)
    x += F.spur * sm(0.85, 1, s) * Math.exp(-(((h - 0.55) / 0.13) ** 2));
  return V(x, y, z * side);
}

/** Normale extérieure approchée de la coque. */
function hullN(s: number, t: number, side = 1): THREE.Vector3 {
  const ss = Math.min(0.997, Math.max(0.004, s));
  const a = hullPt(ss + 0.002, t, side).sub(hullPt(ss - 0.002, t, side));
  const b = hullPt(ss, t + 0.01, side).sub(hullPt(ss, t - 0.01, side));
  const n = side > 0 ? V().crossVectors(a, b) : V().crossVectors(b, a);
  return n.normalize();
}

/** Normale horizontale (plan) d'un point du pourtour. */
function planN(s: number, side: number): THREE.Vector3 {
  const n = hullN(s, 1.1, side);
  n.y = 0;
  return n.normalize();
}

const SS = (i: number, n: number) => 0.5 - 0.5 * Math.cos((i / n) * Math.PI);

/** Pourtour fermé par la poupe : u de 0 à 1 → (s, bord) de s1 tribord à s1 bâbord. */
function around(u: number, s1: number, s0 = 0): { s: number; side: number } {
  const w = Math.abs(u - 0.5) * 2;
  // Resserré autour de la poupe ronde.
  const f = 1 - Math.cos((w * Math.PI) / 2);
  return { s: s0 + (s1 - s0) * f, side: u < 0.5 ? 1 : -1 };
}

// --- Coque -----------------------------------------------------------------------

function hull(k: Kit, m: RefMaterials) {
  const NS = 200;
  const T_SPLIT = 0.58;
  const arcCache = new Map<string, number>();
  for (const side of [1, -1]) {
    const arc = (s: number, t: number) => {
      const key = `${s.toFixed(5)}:${t.toFixed(4)}`;
      const c = arcCache.get(key);
      if (c !== undefined) return c;
      let a = 0;
      let p = hullPt(s, 0, side);
      const steps = 24;
      for (let q = 1; q <= steps; q++) {
        const np = hullPt(s, (t * q) / steps, side);
        a += np.distanceTo(p);
        p = np;
      }
      arcCache.set(key, a);
      return a;
    };
    const part = (t0: number, t1: number, nt: number, mat: THREE.Material) =>
      k.add(
        mat,
        grid(
          NS,
          nt,
          (i, j) => {
            const s = SS(i, NS);
            const t = t0 + ((t1 - t0) * j) / nt;
            return { p: hullPt(s, t, side), uv: [X(s), arc(s, t)] };
          },
          side < 0
        )
      );
    part(0, T_SPLIT, 26, m.copperSheath);
    part(T_SPLIT, 0.74, 8, m.hullWood);
    part(0.74, 0.9, 8, m.hullBand);
    part(0.9, 1.25, 12, m.hullWood);
    arcCache.clear();
  }
  // Quille et étrave : une pièce continue, arrondie.
  const keel: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++)
    keel.push(hullPt(0.03 + (0.97 * i) / 40, 0, 1).setZ(0));
  for (let j = 1; j <= 12; j++)
    keel.push(hullPt(1, (1.22 * j) / 12, 1).setZ(0));
  k.add(m.paint, tube(keel, 0.22, 160, 10));

  // Pont : suit la tonture, entre les deux murailles. Faces tournées vers le
  // haut (sinon, vu d'au-dessus, le pont disparaît et l'on voit l'intérieur
  // de la coque).
  k.add(
    m.deck,
    grid(
      NS,
      16,
      (i, j) => {
        const s = 0.004 + SS(i, NS) * 0.99;
        const e = hullPt(s, 1, 1);
        const z = -e.z + (2 * e.z * j) / 16;
        return { p: V(e.x, e.y + 0.02, z), uv: [e.x, z] };
      },
      true
    )
  );

  // Préceintes et lisse : bandes continues qui font le tour par la poupe.
  const belt = (
    t: number,
    off: number,
    w: number,
    h: number,
    mat: THREE.Material,
    sMax = 0.985
  ) => {
    const pts: THREE.Vector3[] = [];
    const sides: THREE.Vector3[] = [];
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const { s, side } = around(i / N, sMax);
      const n = hullN(s, Math.min(t, 1.2), side);
      pts.push(hullPt(Math.max(s, 0.0005), t, side).addScaledVector(n, off));
      sides.push(n);
    }
    k.add(
      mat,
      sweep(pts, w, h, V(0, 1, 0), (i) => sides[i])
    );
  };
  belt(T_SPLIT, 0.06, 0.2, 0.42, m.paint, 0.975);
  belt(0.74, 0.07, 0.22, 0.3, m.paint, 0.982);
  belt(0.9, 0.06, 0.18, 0.24, m.paint, 0.985);
  belt(1.25, -0.04, 0.4, 0.16, m.darkWood, 0.99);
  belt(1.0, 0.05, 0.06, 0.1, m.brass, 0.97);
}

// --- Petits éléments ---------------------------------------------------------------

/** Sabords : une rangée par pont, volets relevés, canons à renfort de bouche. */
function gunports(k: Kit, m: RefMaterials, rows: number, perSide: number) {
  const barrel = lathe(
    [
      [0.001, -0.1],
      [0.2, -0.08],
      [0.24, 0.05],
      [0.22, 0.3],
      [0.17, 1.2],
      [0.19, 1.45],
      [0.2, 1.55],
      [0.12, 1.56],
      [0.1, 1.2],
    ],
    32
  );
  const levels = [0.82, 0.66, 0.5].slice(0, Math.max(1, Math.min(3, rows)));
  const n0 = Math.max(2, Math.min(9, perSide));
  for (const tl of levels)
    for (const side of [1, -1])
      for (let g = 0; g < n0; g++) {
        const s = 0.34 + (g + 0.5) * (0.46 / n0) + (tl < 0.8 ? 0.02 : 0);
        const p = hullPt(s, tl, side);
        const n = hullN(s, tl, side);
        const yaw = Math.atan2(n.x, n.z);
        const port = new THREE.Matrix4().compose(
          p.clone().addScaledVector(n, 0.02),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
          V(1, 1, 1)
        );
        k.add(m.paint, box(1.0, 0.85, 0.1, 0.04), port.clone());
        const lid = port
          .clone()
          .multiply(M(0, 0.45, 0.02))
          .multiply(M(1.2, 0, 0))
          .multiply(M(0, 0.43, 0.05));
        k.add(m.hullWood, box(1.05, 0.88, 0.1, 0.035), lid);
        k.add(
          m.castIron,
          barrel.clone(),
          port.clone().multiply(M(0, -0.05, -0.3, Math.PI / 2))
        );
      }
  barrel.dispose();
}

/** Fenêtre cintrée : cadre de laiton profilé, vitre (éclairée la nuit). */
function windowAt(
  k: Kit,
  m: RefMaterials,
  mtx: THREE.Matrix4,
  w = 0.9,
  h = 1.3
) {
  k.add(
    m.glass,
    new THREE.PlaneGeometry(w, h),
    mtx.clone().multiply(M(0, 0, 0.01))
  );
  k.add(
    m.glass,
    new THREE.CircleGeometry(w / 2, 24, 0, Math.PI),
    mtx.clone().multiply(M(0, h / 2, 0.01))
  );
  // Cadre continu (montants + arc) en un seul tube.
  const pts: THREE.Vector3[] = [V(-w / 2, -h / 2, 0.04)];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - (i / 16) * Math.PI;
    pts.push(V(Math.cos(a) * (w / 2), h / 2 + Math.sin(a) * (w / 2), 0.04));
  }
  pts.push(V(w / 2, -h / 2, 0.04));
  const frame = tube(pts, 0.05, 28, 6);
  frame.applyMatrix4(mtx);
  k.add(m.brass, frame);
  k.add(
    m.brass,
    box(w + 0.24, 0.1, 0.16, 0.04),
    mtx.clone().multiply(M(0, -h / 2 - 0.04, 0.05))
  );
  k.add(
    m.brass,
    cyl(0.022, 0.022, h + w * 0.45, 8),
    mtx.clone().multiply(M(0, w * 0.22, 0.05))
  );
  k.add(
    m.brass,
    cyl(0.02, 0.02, w, 8),
    mtx.clone().multiply(M(0, h * 0.15, 0.05, 0, 0, Math.PI / 2))
  );
}

function porthole(k: Kit, m: RefMaterials, mtx: THREE.Matrix4, r = 0.32) {
  k.add(m.brass, torus(r, 0.07, 24, 10), mtx.clone());
  k.add(
    m.glass,
    new THREE.CircleGeometry(r, 24),
    mtx.clone().multiply(M(0, 0, -0.01))
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(
      m.brass,
      new THREE.IcosahedronGeometry(0.035, 0),
      mtx
        .clone()
        .multiply(M(Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), 0.02))
    );
  }
}

/** Garde-corps : chandeliers à pommeau, deux lisses continues. */
function railing(
  k: Kit,
  m: RefMaterials,
  pts: THREE.Vector3[],
  h = 1.0,
  every = 1
) {
  pts.forEach((p, i) => {
    if (i % every && i !== pts.length - 1) return;
    k.add(m.brass, cyl(0.03, 0.04, h, 6, true), M(p.x, p.y + h / 2, p.z));
    k.add(
      m.brass,
      new THREE.IcosahedronGeometry(0.06, 1),
      M(p.x, p.y + h, p.z)
    );
  });
  if (pts.length > 1) {
    const n = Math.min(240, pts.length * 2);
    k.add(
      m.brass,
      tube(
        pts.map((p) => p.clone().setY(p.y + h)),
        0.035,
        n,
        6
      )
    );
    k.add(
      m.brass,
      tube(
        pts.map((p) => p.clone().setY(p.y + h * 0.5)),
        0.025,
        n,
        5
      )
    );
  }
}

/** Luminaires du navire (choisis à la construction). */
let LUM = 'lanternes';

function lantern(k: Kit, m: RefMaterials, p: THREE.Vector3): THREE.Vector3 {
  if (LUM === 'braseros') {
    // Brasero : vasque de laiton sur pied, flammes.
    k.add(
      m.brass,
      lathe(
        [
          [0.001, 0],
          [0.12, 0],
          [0.06, 0.1],
          [0.05, 0.45],
          [0.28, 0.55],
          [0.34, 0.75],
          [0.3, 0.78],
        ],
        24
      ),
      M(p.x, p.y, p.z)
    );
    k.add(
      m.fire,
      lathe(
        [
          [0.26, 0.72],
          [0.2, 0.95],
          [0.1, 1.15],
          [0.001, 1.3],
        ],
        16
      ),
      M(p.x, p.y, p.z)
    );
    return V(p.x, p.y + 1.0, p.z);
  }
  const glass = LUM === 'aether' ? m.aether : m.glass;
  k.add(
    m.brass,
    lathe(
      [
        [0.001, 0],
        [0.2, 0],
        [0.18, 0.06],
        [0.15, 0.08],
      ],
      24
    ),
    M(p.x, p.y, p.z)
  );
  k.add(glass, cyl(0.14, 0.14, 0.38, 24), M(p.x, p.y + 0.27, p.z));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.add(
      m.brass,
      cyl(0.015, 0.015, 0.42, 6),
      M(p.x + Math.cos(a) * 0.16, p.y + 0.27, p.z + Math.sin(a) * 0.16)
    );
  }
  k.add(
    m.brass,
    lathe(
      [
        [0.2, 0],
        [0.17, 0.08],
        [0.08, 0.2],
        [0.03, 0.3],
        [0.001, 0.34],
      ],
      24
    ),
    M(p.x, p.y + 0.46, p.z)
  );
  k.add(m.brass, torus(0.06, 0.015, 12, 6), M(p.x, p.y + 0.86, p.z));
  return V(p.x, p.y + 0.27, p.z);
}

// --- Superstructures ---------------------------------------------------------------

/** Mur courbe le long du pourtour (s0..s1 par la poupe), haut H, rentrée vers le haut. */
function wallAround(
  k: Kit,
  mat: THREE.Material,
  s0: number,
  s1: number,
  inset: number,
  y0: (s: number) => number,
  H: number,
  lean = 0.25,
  aroundStern = true
) {
  const NU = 140,
    NV = 10;
  const pt = (u: number, v: number) => {
    const { s, side } = aroundStern
      ? around(u, s1, s0)
      : { s: s0 + (s1 - s0) * Math.abs(u - 0.5) * 2, side: u < 0.5 ? 1 : -1 };
    const e = hullPt(Math.max(s, 0.0008), 1.25, side);
    const n = planN(s, side);
    const off = inset + lean * v * v;
    return V(e.x - n.x * off, y0(s) + H * v, e.z - n.z * off);
  };
  let acc = 0;
  let prev = pt(0, 0);
  const us: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const p = pt(i / NU, 0);
    acc += p.distanceTo(prev);
    prev = p;
    us.push(acc);
  }
  k.add(
    mat,
    grid(
      NU,
      NV,
      (i, j) => {
        const p = pt(i / NU, j / NV);
        return { p, uv: [us[i], p.y] };
      },
      true
    )
  );
  return pt;
}

/** Château arrière : murailles courbes qui font le tour de la poupe, galerie, dôme. */
function aftCastle(
  k: Kit,
  m: RefMaterials,
  lights: THREE.Vector3[],
  s1 = 0.3,
  Hc = 6,
  shape = 'dome',
  lum = true
) {
  const H = Math.max(3.4, Hc * 0.9);
  const base = (s: number) => deckY(s) + RAIL;
  const pt = wallAround(
    k,
    m.wall ?? m.hullWood,
    0,
    s1,
    0.22,
    base,
    H - RAIL,
    shape === 'slope' ? 1.3 : 0.3
  );
  const top = (u: number) => pt(u, 1);
  // Corniche, bandeau de laiton, toit.
  const N = 140;
  const cornice = Array.from({ length: N + 1 }, (_, i) =>
    top(i / N).add(V(0, 0.05, 0))
  );
  const sideV = (i: number) => {
    const { s, side } = around(i / N, s1);
    return planN(s, side);
  };
  k.add(m.darkWood, sweep(cornice, 0.42, 0.32, V(0, 1, 0), sideV));
  k.add(
    m.brass,
    sweep(
      Array.from({ length: N + 1 }, (_, i) =>
        pt(i / N, 0.32).add(sideV(i).multiplyScalar(0.05))
      ),
      0.1,
      0.12,
      V(0, 1, 0),
      sideV
    )
  );
  // Toit : remplit le plan de la galerie.
  k.add(
    m.deck,
    grid(60, 10, (i, j) => {
      const a = top(0.5 - (0.5 * i) / 60);
      const b = top(0.5 + (0.5 * i) / 60);
      const p = a.clone().lerp(b, j / 10);
      return { p: p.add(V(0, 0.18, 0)), uv: [p.x, p.z] };
    })
  );
  // Fenêtres le long des flancs et autour de la poupe (galerie vitrée).
  const winAt = (u: number, v: number, w: number, h: number) => {
    const p = pt(u, v);
    const a = around(u, s1);
    const n = planN(Math.max(a.s, 0.004), a.side);
    const yaw = Math.atan2(n.x, n.z);
    windowAt(
      k,
      m,
      new THREE.Matrix4().compose(
        p.addScaledVector(n, 0.04),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        V(1, 1, 1)
      ),
      w,
      h
    );
  };
  for (const u of [0.08, 0.15, 0.22, 0.29, 0.71, 0.78, 0.85, 0.92])
    winAt(u, 0.4, 0.8, 1.15);
  for (let i = 0; i < 7; i++) {
    const u = 0.38 + (i / 6) * 0.24;
    winAt(u, 0.28, 0.8, 1.1);
    winAt(u, 0.7, 0.75, 0.95);
  }
  // Balcon de poupe : coursive courbe sur consoles, garde-corps continu.
  const NB = 60;
  const balc = (i: number, off: number) => {
    const u = 0.33 + (0.34 * i) / NB;
    const { s, side } = around(u, s1);
    const e = hullPt(Math.max(s, 0.0008), 1.25, side);
    const n = planN(s, side);
    return V(e.x + n.x * off, base(s) + 0.25, e.z + n.z * off);
  };
  const deckPts = Array.from({ length: NB + 1 }, (_, i) => balc(i, 0.55));
  k.add(
    m.darkWood,
    sweep(deckPts, 1.4, 0.18, V(0, 1, 0), (i) =>
      planN(
        around(0.33 + (0.34 * i) / NB, s1).s,
        around(0.33 + (0.34 * i) / NB, s1).side
      )
    )
  );
  railing(
    k,
    m,
    Array.from({ length: NB + 1 }, (_, i) => balc(i, 1.18)),
    0.95,
    6
  );
  for (let i = 3; i < NB; i += 9) {
    const a = balc(i, 1.0);
    const b = balc(i, -0.2).add(V(0, -1.6, 0));
    k.add(
      m.darkWood,
      tube(
        bez(
          a.clone().add(V(0, -0.1, 0)),
          V(a.x * 0.5 + b.x * 0.5, a.y - 0.2, a.z * 0.5 + b.z * 0.5),
          b,
          10
        ),
        0.09,
        20,
        8
      )
    );
  }
  if (lum)
    for (const u of [0.36, 0.64])
      lights.push(
        lantern(
          k,
          m,
          balc(Math.round(((u - 0.33) / 0.34) * NB), 1.15).add(V(0, 0.95, 0))
        )
      );
  // Façade avant bombée, porte cintrée.
  const xf = hullPt(s1, 1.25, 1).x - 0.05;
  const wf = hullPt(s1, 1.25, 1).z - 0.25;
  const yb = deckY(s1);
  k.add(
    m.wall ?? m.hullWood,
    grid(
      30,
      8,
      (i, j) => {
        const z = -wf + (2 * wf * i) / 30;
        const y = yb + H * (j / 8);
        return { p: V(xf + 0.55 * (1 - (z / wf) ** 2), y, z), uv: [z, y] };
      },
      true
    )
  );
  k.add(m.darkWood, box(0.22, 2.3, 1.3, 0.06), M(xf + 0.6, yb + 1.15, 0));
  k.add(
    m.brass,
    torus(0.68, 0.06, 24, 8, Math.PI),
    M(xf + 0.66, yb + 2.3, 0, 0, Math.PI / 2, 0)
  );
  for (const z of [-2.5, 2.5])
    windowAt(
      k,
      m,
      M(
        xf + 0.55 * (1 - (z / wf) ** 2) + 0.03,
        yb + 3.0,
        z,
        0,
        Math.PI / 2 - (z / wf) * 0.4,
        0
      ),
      0.85,
      1.1
    );
  if (lum) lights.push(lantern(k, m, V(xf + 0.85, yb + 2.5, 1.0)));
  // Garde-corps de dunette (suit le pourtour).
  railing(
    k,
    m,
    Array.from({ length: 41 }, (_, i) =>
      top(i / 40)
        .add(V(0, 0.18, 0))
        .add(sideV(Math.round((i / 40) * N)).multiplyScalar(-0.15))
    ),
    0.9,
    3
  );
  if (shape === 'tower')
    tower(
      k,
      m,
      X(s1 * 0.62),
      deckY(s1 * 0.62) + H + 0.18,
      2.4,
      Math.max(4, Hc * 0.55),
      lights,
      lum
    );
  if (shape !== 'dome') return;
  const dx = X(s1 * 0.56),
    dy = deckY(s1 * 0.56) + H + 0.18;
  // Dôme d'observation : tambour à congés, coupole lisse nervurée, lanterneau.
  k.add(
    m.ironPlates,
    lathe(
      [
        [3.0, 0],
        [3.0, 0.12],
        [2.8, 0.2],
        [2.75, 0.3],
        [2.75, 1.0],
        [2.85, 1.08],
        [2.85, 1.2],
      ],
      64
    ),
    M(dx, dy, 0)
  );
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    porthole(
      k,
      m,
      M(
        dx + Math.cos(a) * 2.77,
        dy + 0.65,
        Math.sin(a) * 2.77,
        0,
        Math.PI / 2 - a,
        0
      ),
      0.2
    );
  }
  const domeProf: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    domeProf.push([2.78 * Math.cos(a), 2.6 * Math.sin(a)]);
  }
  k.add(m.verdigris, lathe(domeProf, 72), M(dx, dy + 1.2, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rib = domeProf.map(([r, y]) =>
      V(
        dx + Math.cos(a) * (r + 0.04),
        dy + 1.2 + y + 0.04,
        Math.sin(a) * (r + 0.04)
      )
    );
    k.add(m.brass, tube(rib.slice(0, 23), 0.06, 40, 8));
  }
  k.add(m.brass, torus(2.84, 0.1, 64, 10), M(dx, dy + 1.22, 0, Math.PI / 2));
  k.add(
    m.brass,
    lathe(
      [
        [0.62, 0],
        [0.62, 0.1],
        [0.5, 0.15],
        [0.5, 0.75],
        [0.62, 0.8],
        [0.5, 0.95],
        [0.25, 1.2],
        [0.05, 1.5],
        [0.001, 1.55],
      ],
      32
    ),
    M(dx, dy + 3.75, 0)
  );
  k.add(m.glass, cyl(0.47, 0.47, 0.55, 32), M(dx, dy + 4.2, 0));
  // Télescope de laiton sur affût.
  k.add(
    m.brass,
    lathe(
      [
        [0.12, 0],
        [0.16, 0.1],
        [0.2, 1.4],
        [0.26, 2.3],
        [0.3, 2.6],
        [0.26, 2.62],
      ],
      24
    ),
    M(dx + 1.0, dy + 2.6, 1.0, 0, 0, -1.1)
  );
}

/** Tour ronde : fût riveté, fenêtres, couronne de laiton, toit conique. */
function tower(
  k: Kit,
  m: RefMaterials,
  x: number,
  y: number,
  r: number,
  h: number,
  lights: THREE.Vector3[],
  lum: boolean
) {
  k.add(
    m.ironPlates,
    lathe(
      [
        [r + 0.2, 0],
        [r + 0.2, 0.15],
        [r, 0.3],
        [r, h],
        [r + 0.25, h + 0.1],
        [r + 0.25, h + 0.35],
      ],
      48
    ),
    M(x, y, 0)
  );
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    windowAt(
      k,
      m,
      M(
        x + Math.cos(a) * (r + 0.02),
        y + h * 0.6,
        Math.sin(a) * (r + 0.02),
        0,
        Math.PI / 2 - a,
        0
      ),
      0.55,
      0.85
    );
  }
  k.add(
    m.brass,
    torus(r + 0.27, 0.07, 48, 8),
    M(x, y + h + 0.36, 0, Math.PI / 2)
  );
  const roof: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    roof.push([
      (r + 0.35) * (1 - f) * (1 - 0.25 * Math.sin(f * Math.PI)),
      h + 0.35 + f * r * 1.5,
    ]);
  }
  k.add(m.verdigris, lathe(roof, 48), M(x, y, 0));
  k.add(
    m.brass,
    lathe(
      [
        [0.08, 0],
        [0.04, 1.2],
        [0.001, 1.3],
      ],
      12
    ),
    M(x, y + h + 0.35 + r * 1.5, 0)
  );
  if (lum) lights.push(lantern(k, m, V(x + r + 0.3, y + 0.3, 0)));
}

/** Rouf central (château au milieu du pont), angles arrondis. */
function midCastle(
  k: Kit,
  m: RefMaterials,
  lights: THREE.Vector3[],
  a: number,
  b: number,
  h: number,
  shape: string,
  w: number,
  lum: boolean
) {
  const sc = (a + b) / 2;
  const len = (b - a) * L;
  const wid = Math.min(halfB(a), halfB(b)) * 2 * w * 0.9;
  const y = deckY(sc);
  const H = Math.max(2.4, shape === 'tower' ? h * 0.55 : h * 0.85);
  k.add(
    m.wall ?? m.hullWood,
    roundedHouse(len, wid, H, shape === 'slope' ? 1.2 : 0.5),
    M(X(sc), y, 0)
  );
  k.add(
    m.darkWood,
    sweep(
      Array.from({ length: 97 }, (_, i) => {
        const th = (i / 96) * Math.PI * 2;
        const c = Math.cos(th),
          sn = Math.sin(th);
        return V(
          X(sc) + Math.sign(c) * Math.pow(Math.abs(c), 0.4) * (len / 2 - 0.1),
          y + H - 0.25,
          Math.sign(sn) * Math.pow(Math.abs(sn), 0.4) * (wid / 2 - 0.1)
        );
      }),
      0.2,
      0.22
    )
  );
  for (const side of [1, -1])
    for (let i = 0; i < Math.max(2, Math.floor(len / 2.6)); i++) {
      const x = X(a) + 1.6 + i * 2.6;
      if (x > X(b) - 1.2) break;
      windowAt(
        k,
        m,
        M(
          x,
          y + H * 0.55,
          side * (wid / 2 + 0.01),
          0,
          side > 0 ? 0 : Math.PI,
          0
        ),
        0.7,
        0.95
      );
    }
  if (shape === 'tower')
    tower(
      k,
      m,
      X(sc),
      y + H,
      Math.min(2.6, wid * 0.32),
      Math.max(3.5, h - H),
      lights,
      lum
    );
}

function forecastle(
  k: Kit,
  m: RefMaterials,
  lights: THREE.Vector3[],
  s0 = 0.84,
  Hc = 2.2,
  shape = 'box',
  lum = true
) {
  const H = Math.max(1.8, Math.min(Hc, 4.4));
  const base = (s: number) => deckY(s) + RAIL;
  // Murailles convergeant vers l'étrave.
  const NU = 60,
    NV = 4;
  const pt = (u: number, v: number) => {
    const side = u < 0.5 ? 1 : -1;
    const w = Math.abs(u - 0.5) * 2;
    const s = 0.995 - (0.995 - s0) * w;
    const e = hullPt(s, 1.25, side);
    const n = planN(s, side);
    const off = 0.22 + 0.15 * v * v;
    return V(e.x - n.x * off, base(s) + (H - RAIL) * v, e.z - n.z * off);
  };
  for (const half of [0, 1])
    k.add(
      m.wall ?? m.hullWood,
      grid(
        NU / 2,
        NV,
        (i, j) => {
          const u = half ? 0.5 + (0.5 * i) / (NU / 2) : (0.5 * i) / (NU / 2);
          const p = pt(u, j / NV);
          return { p, uv: [p.x, p.y] };
        },
        true
      )
    );
  k.add(
    m.deck,
    grid(24, 6, (i, j) => {
      const a = pt(0.5 - 0.5 * (i / 24), 1);
      const b = pt(0.5 + 0.5 * (i / 24), 1);
      const p = a.lerp(b, j / 6);
      return { p, uv: [p.x, p.z] };
    })
  );
  const cornice = Array.from({ length: 41 }, (_, i) =>
    pt(i / 40, 1).add(V(0, 0.04, 0))
  );
  k.add(m.darkWood, tube(cornice, 0.12, 80, 8));
  // Cloison arrière bombée.
  const xa = hullPt(s0, 1.25, 1).x;
  const wa = hullPt(s0, 1.25, 1).z - 0.3;
  const ya = deckY(s0);
  k.add(
    m.wall ?? m.hullWood,
    grid(20, 4, (i, j) => {
      const z = -wa + (2 * wa * i) / 20;
      const y = ya + H * (j / 4);
      return { p: V(xa - 0.4 * (1 - (z / wa) ** 2), y, z), uv: [z, y] };
    })
  );
  k.add(m.darkWood, box(0.15, 1.9, 1.1, 0.05), M(xa - 0.45, ya + 0.95, 0));
  for (const z of [-2.3, 2.3])
    porthole(
      k,
      m,
      M(xa - 0.4 * (1 - (z / wa) ** 2) - 0.03, ya + 1.3, z, 0, -Math.PI / 2, 0),
      0.26
    );
  if (lum) lights.push(lantern(k, m, V(xa - 0.6, ya + H, 0)));
  if (shape === 'tower')
    tower(
      k,
      m,
      X((s0 + 0.95) / 2),
      deckY((s0 + 0.95) / 2) + H,
      1.6,
      Math.max(2.5, Hc - H),
      lights,
      lum
    );
  // Guindeau à tambour galbé.
  const gx = X(0.9),
    gy = deckY(0.9) + H + 0.55;
  if (P.put('guindeau', gx, gy - 0.55, 0, Math.PI / 2)) return;
  k.add(
    m.castIron,
    lathe(
      [
        [0.38, -1.2],
        [0.48, -1.1],
        [0.42, 0],
        [0.48, 1.1],
        [0.38, 1.2],
      ],
      32
    ),
    M(gx, gy, 0, Math.PI / 2)
  );
  for (const z of [-1.25, 1.25])
    k.add(
      m.brass,
      lathe(
        [
          [0.001, -0.06],
          [0.58, -0.06],
          [0.6, 0],
          [0.58, 0.06],
          [0.001, 0.06],
        ],
        32
      ),
      M(gx, gy, z, Math.PI / 2)
    );
}

/** Bloc usiné aux angles arrondis : plan en superellipse, congé sur l'arête du toit. */
function roundedHouse(
  len: number,
  wid: number,
  H: number,
  fillet: number,
  n = 5
): THREE.BufferGeometry {
  const ra = len / 2,
    rb = wid / 2;
  const prof: [number, number][] = [
    [0, 0],
    [0, H - fillet],
  ];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push([fillet * (1 - Math.cos(a)), H - fillet + fillet * Math.sin(a)]);
  }
  for (let i = 1; i <= 4; i++)
    prof.push([
      fillet + (Math.min(ra, rb) - fillet) * (i / 4),
      H + 0.08 * (i / 4),
    ]);
  const NT = 96;
  return grid(
    NT,
    prof.length - 1,
    (i, j) => {
      const th = (i / NT) * Math.PI * 2;
      const c = Math.cos(th),
        s = Math.sin(th);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
        ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const [ins, y] = prof[j];
      return {
        p: V(ex * (ra - ins), y, ez * (rb - ins)),
        uv: [(i / NT) * Math.PI * (ra + rb) * 1.2, y + ins],
      };
    },
    true
  );
}

/** Salle des machines, cheminée évasée, réservoirs, tuyauterie. */
function engines(
  k: Kit,
  m: RefMaterials,
  smoke: THREE.Vector3[],
  steam: THREE.Vector3[],
  lights: THREE.Vector3[],
  sc = 0.37,
  lum = true
) {
  const x0 = X(sc - 0.055),
    x1 = X(sc + 0.06);
  const y0 = deckY(sc);
  const W = 5.6,
    H = 3.0;
  const cx = (x0 + x1) / 2,
    len = x1 - x0;
  k.add(m.ironPlates, roundedHouse(len, W, H, 0.55), M(cx, y0, 0));
  k.add(
    m.paint,
    sweep(
      Array.from({ length: 97 }, (_, i) => {
        const th = (i / 96) * Math.PI * 2;
        const c = Math.cos(th),
          s = Math.sin(th);
        return V(
          cx + Math.sign(c) * Math.pow(Math.abs(c), 0.4) * (len / 2 + 0.05),
          y0 + 0.12,
          Math.sign(s) * Math.pow(Math.abs(s), 0.4) * (W / 2 + 0.05)
        );
      }),
      0.16,
      0.24
    )
  );
  for (const side of [1, -1])
    for (let i = 0; i < 4; i++)
      porthole(
        k,
        m,
        M(
          x0 + 0.95 + i * 1.3,
          y0 + 1.7,
          (W / 2 + 0.01) * side,
          0,
          side > 0 ? 0 : Math.PI,
          0
        ),
        0.26
      );
  // Lanterneau vitré en berceau.
  const sx = cx + 1.4;
  k.add(m.ironPlates, roundedHouse(2.4, 2.4, 0.5, 0.2, 4), M(sx, y0 + H, 0));
  k.add(
    m.glass,
    grid(
      12,
      8,
      (i, j) => {
        const a = Math.PI * (i / 12);
        return {
          p: V(
            sx - 1.0 + 2.0 * (j / 8),
            y0 + H + 0.55 + Math.sin(a) * 0.55,
            Math.cos(a) * 0.95
          ),
          uv: [i, j],
        };
      },
      true
    )
  );
  for (let j = 0; j <= 4; j++) {
    const xx = sx - 1.0 + j * 0.5;
    k.add(
      m.brass,
      torus(0.97, 0.03, 24, 6, Math.PI),
      M(xx, y0 + H + 0.55, 0, 0, Math.PI / 2, 0)
    );
  }
  // Cheminée : fût légèrement conique, couronne évasée à bourrelet.
  const fx = X(sc) - 0.8;
  const fy = y0 + H + 0.1;
  const FH = 10.8;
  const prof: [number, number][] = [
    [1.6, 0],
    [1.6, 0.18],
    [1.3, 0.3],
    [1.22, 0.6],
    [1.08, FH - 2.4],
    [1.12, FH - 1.6],
    [1.3, FH - 0.8],
    [1.55, FH - 0.2],
    [1.66, FH],
    [1.62, FH + 0.12],
    [1.48, FH + 0.08],
    [1.4, FH - 0.1],
  ];
  k.add(m.ironPlates, lathe(prof, 64), M(fx, fy, 0));
  k.add(
    m.castIron,
    lathe(
      [
        [1.38, FH - 0.1],
        [1.2, FH - 0.9],
        [1.0, FH - 2.0],
      ],
      48
    ),
    M(fx, fy, 0)
  );
  for (const f of [0.12, 0.42, 0.68]) {
    const y = 0.6 + (FH - 3) * f;
    const r = 1.22 - (0.14 * (y - 0.6)) / (FH - 3);
    k.add(
      m.brass,
      torus(r + 0.03, 0.09, 64, 10),
      M(fx, fy + y, 0, Math.PI / 2)
    );
  }
  smoke.push(V(fx, fy + FH + 0.6, 0));
  for (const a of [0.6, 2.2, 3.9, 5.5]) {
    const top = V(fx + Math.cos(a) * 1.15, fy + FH * 0.74, Math.sin(a) * 1.15);
    k.add(m.brass, torus(0.08, 0.025, 8, 6), M(top.x, top.y, top.z));
    k.rope(
      top,
      V(fx + Math.cos(a) * 3.2, y0 + H + 0.15, Math.sin(a) * 2.6),
      0.025
    );
  }
  // Réservoirs de vapeur : capsules verticales cerclées, manomètres.
  const capsule = (r: number, h: number): [number, number][] => {
    const p: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
      p.push([r * Math.cos(a), r + r * Math.sin(a)]);
    }
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      p.push([r * Math.cos(a), h - r + r * Math.sin(a)]);
    }
    return p;
  };
  for (const side of [1, -1]) {
    const tx = x1 + 1.6,
      tz = side * 3.1;
    const tank = P.put(
      'reservoir',
      tx,
      y0,
      tz,
      side > 0 ? Math.PI / 2 : -Math.PI / 2
    );
    if (!tank)
      k.add(m.copperSheath, lathe(capsule(0.95, 3.9), 48), M(tx, y0, tz));
    for (const f of tank ? [] : [0.22, 0.5, 0.78])
      k.add(
        m.brass,
        torus(0.97, 0.05, 48, 8),
        M(tx, y0 + 3.9 * f, tz, Math.PI / 2)
      );
    if (!tank)
      k.add(
        m.brass,
        lathe(
          [
            [0.001, 0],
            [0.22, 0],
            [0.24, 0.04],
            [0.22, 0.09],
            [0.001, 0.09],
          ],
          24
        ),
        M(tx - 0.95, y0 + 2.1, tz, 0, 0, Math.PI / 2)
      );
    if (!tank)
      k.add(
        m.glass,
        new THREE.CircleGeometry(0.17, 24),
        M(tx - 1.05, y0 + 2.1, tz, 0, -Math.PI / 2, 0)
      );
    // Conduite courbe vers la salle des machines (brides aux extrémités).
    const a = V(tx, y0 + 3.85, tz);
    const b = V(x1 - 0.15, y0 + 2.4, tz - side * 0.6);
    const pipe = bez(a, V(tx - 0.4, y0 + 5.0, tz - side * 0.3), b, 16);
    k.add(m.brass, tube(pipe, 0.12, 40, 12));
    for (const p of [pipe[1], pipe[pipe.length - 1]])
      k.add(
        m.brass,
        torus(0.15, 0.04, 16, 8),
        along(p, pipe[pipe.length - 1].clone().sub(pipe[0]))
      );
    k.add(
      m.brass,
      lathe(
        [
          [0.08, 0],
          [0.08, 0.7],
          [0.15, 0.75],
          [0.15, 0.9],
          [0.1, 0.95],
        ],
        16
      ),
      M(tx, y0 + 3.9, tz)
    );
    steam.push(V(tx, y0 + 4.95, tz));
  }
  // Évents en col de cygne.
  for (const z of [-1.8, 1.8]) {
    const a = V(x0 + 1.0, y0 + H + 0.4, z);
    const c = V(x0 + 1.0, y0 + H + 1.8, z);
    const e = V(x0 + 1.0, y0 + H + 1.4, z + 0.6 * Math.sign(z));
    k.add(m.brass, tube([a, V(a.x, a.y + 1.0, z), c, e], 0.12, 30, 12));
    k.add(
      m.brass,
      lathe(
        [
          [0.12, 0],
          [0.2, 0.15],
          [0.22, 0.25],
        ],
        16
      ),
      along(e, e.clone().sub(c))
    );
    steam.push(e.clone().add(V(0, -0.1, 0.2 * Math.sign(z))));
  }
  if (lum) lights.push(lantern(k, m, V(x1 + 0.2, y0 + H + 0.35, 0)));
}

/** Cheminée seule (sur un château ou en second fût). */
function funnel(
  k: Kit,
  m: RefMaterials,
  fx: number,
  fy: number,
  FH: number,
  smoke: THREE.Vector3[]
) {
  const prof: [number, number][] = [
    [1.4, 0],
    [1.4, 0.18],
    [1.12, 0.3],
    [1.06, 0.6],
    [0.95, FH - 2.2],
    [0.98, FH - 1.5],
    [1.15, FH - 0.7],
    [1.38, FH - 0.18],
    [1.48, FH],
    [1.44, FH + 0.11],
    [1.3, FH + 0.07],
    [1.24, FH - 0.1],
  ];
  k.add(m.ironPlates, lathe(prof, 64), M(fx, fy, 0));
  k.add(
    m.castIron,
    lathe(
      [
        [1.22, FH - 0.1],
        [1.05, FH - 0.8],
        [0.88, FH - 1.8],
      ],
      48
    ),
    M(fx, fy, 0)
  );
  for (const f of [0.15, 0.5])
    k.add(
      m.brass,
      torus(1.06 - 0.1 * f + 0.03, 0.08, 64, 10),
      M(fx, fy + 0.6 + (FH - 3) * f, 0, Math.PI / 2)
    );
  smoke.push(V(fx, fy + FH + 0.5, 0));
}

/** Cœur d'Aether : cylindre de verre lumineux dans une cage de laiton. */
function reactor(k: Kit, m: RefMaterials, s = 0.53) {
  const x = X(s),
    y = deckY(s);
  k.add(
    m.castIron,
    lathe(
      [
        [1.75, 0],
        [1.75, 0.1],
        [1.6, 0.25],
        [1.55, 0.5],
        [1.2, 0.62],
        [0.9, 0.65],
      ],
      64
    ),
    M(x, y, 0)
  );
  k.add(m.brass, torus(1.58, 0.08, 64, 10), M(x, y + 0.5, 0, Math.PI / 2));
  k.add(m.aether, cyl(0.75, 0.75, 2.6, 48), M(x, y + 1.95, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p0 = V(x + Math.cos(a) * 1.0, y + 0.6, Math.sin(a) * 1.0);
    const p1 = V(x + Math.cos(a) * 1.08, y + 1.95, Math.sin(a) * 1.08);
    const p2 = V(x + Math.cos(a) * 1.0, y + 3.3, Math.sin(a) * 1.0);
    k.add(m.brass, tube([p0, p1, p2], 0.045, 16, 8));
  }
  for (const h of [0.75, 1.95, 3.15])
    k.add(
      m.brass,
      torus(h === 1.95 ? 1.08 : 1.02, 0.06, 64, 10),
      M(x, y + h, 0, Math.PI / 2)
    );
  k.add(
    m.brass,
    lathe(
      [
        [1.15, 0],
        [1.1, 0.12],
        [0.8, 0.35],
        [0.45, 0.6],
        [0.3, 0.75],
        [0.32, 0.85],
        [0.001, 1.1],
      ],
      48
    ),
    M(x, y + 3.3, 0)
  );
}

/** Roue de gouvernail, habitacle du compas. */
function helm(k: Kit, m: RefMaterials, s = 0.33) {
  const x = X(s) + 0.9,
    y = deckY(s);
  if (P.put('barre', x + 0.1, y, 0)) {
    if (!P.put('habitacle', x + 1.6, y, 0)) {
      k.add(m.brass, sphere(0.3, 16, Math.PI / 2), M(x + 1.6, y + 1.0, 0));
      k.add(m.darkWood, cyl(0.3, 0.24, 1.0, 16), M(x + 1.6, y + 0.5, 0));
    }
    return;
  }
  k.add(
    m.darkWood,
    lathe(
      [
        [0.25, 0],
        [0.22, 0.2],
        [0.16, 0.9],
        [0.2, 1.1],
        [0.14, 1.2],
      ],
      24
    ),
    M(x, y, 0)
  );
  const wy = y + 1.35;
  k.add(
    m.darkWood,
    torus(0.75, 0.05, 32, 8),
    M(x + 0.2, wy, 0, 0, Math.PI / 2, 0)
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(
      m.darkWood,
      lathe(
        [
          [0.025, 0],
          [0.04, 0.1],
          [0.025, 0.2],
          [0.03, 0.9],
          [0.001, 0.95],
        ],
        8
      ),
      M(x + 0.2, wy, 0, a, 0, 0)
    );
  }
  k.add(m.brass, sphere(0.12, 12), M(x + 0.2, wy, 0));
  k.add(
    m.darkWood,
    lathe(
      [
        [0.32, 0],
        [0.3, 0.1],
        [0.24, 0.5],
        [0.3, 0.95],
        [0.32, 1.0],
      ],
      24
    ),
    M(x + 1.6, y, 0)
  );
  k.add(m.brass, sphere(0.3, 16, Math.PI / 2), M(x + 1.6, y + 1.0, 0));
}

// --- Mâture et voiles ---------------------------------------------------------------

/** Mât effilé, hune, mât de hune, vergues fuselées. */
function mast(k: Kit, m: RefMaterials, x: number, H: number, withYards = true) {
  const y0 = deckY(x / L + 0.5);
  const h1 = H * 0.58;
  k.add(
    m.spar,
    lathe(
      [
        [0.5, -0.2],
        [0.46, 0.4],
        [0.4, h1 * 0.6],
        [0.33, h1 + 0.6],
        [0.3, h1 + 1.6],
      ],
      32
    ),
    M(x, y0, 0)
  );
  k.add(
    m.brass,
    lathe(
      [
        [0.75, 0],
        [0.7, 0.15],
        [0.5, 0.3],
      ],
      32
    ),
    M(x, y0 + 0.02, 0)
  );
  for (const f of [0.3, 0.6, 0.9])
    k.add(
      m.castIron,
      torus(0.43 - f * 0.08, 0.035, 32, 8),
      M(x, y0 + h1 * f, 0, Math.PI / 2)
    );
  // Hune : plateforme ovale à rebord arrondi.
  const ty = y0 + h1;
  const hune = lathe(
    [
      [0.001, -0.1],
      [1.0, -0.1],
      [1.06, -0.05],
      [1.06, 0.05],
      [1.0, 0.1],
      [0.001, 0.1],
    ],
    48
  );
  hune.scale(1.3, 1, 1.7);
  k.add(m.darkWood, hune, M(x, ty, 0));
  railing(
    k,
    m,
    Array.from({ length: 13 }, (_, i) => {
      const a = Math.PI * 0.5 + (i / 12) * Math.PI;
      return V(x + Math.cos(a) * 1.25 * -1, ty + 0.1, Math.sin(a) * 1.65);
    }),
    0.7,
    3
  );
  // Chouque (chapeau) arrondi et ton du mât de hune.
  k.add(m.darkWood, box(1.3, 0.35, 0.7, 0.12), M(x + 0.25, ty + 1.6, 0));
  const h2 = H - h1;
  k.add(
    m.spar,
    lathe(
      [
        [0.3, -0.6],
        [0.28, 0],
        [0.2, h2 * 0.6],
        [0.13, h2 - 0.3],
        [0.16, h2 - 0.1],
        [0.001, h2 + 0.1],
      ],
      24
    ),
    M(x + 0.35, ty, 0)
  );
  k.add(m.brass, sphere(0.2, 12), M(x + 0.35, y0 + H + 0.2, 0));
  const yards: { y: number; half: number }[] = [];
  const spec: [number, number][] = [
    [0.42, 8.6],
    [0.7, 6.8],
    [0.9, 4.8],
  ];
  const scale = H / 32;
  for (const [f, half] of withYards ? spec : []) {
    const y = y0 + H * f;
    const hl = half * scale;
    const r = 0.2 * Math.sqrt(scale) * (half / 8.6) ** 0.3;
    // Vergue fuselée : épaisse au centre, effilée aux bouts (axe z).
    k.add(
      m.spar,
      lathe(
        [
          [0.001, -hl - 0.5],
          [r * 0.4, -hl - 0.4],
          [r * 0.55, -hl],
          [r, 0],
          [r * 0.55, hl],
          [r * 0.4, hl + 0.4],
          [0.001, hl + 0.5],
        ],
        20
      ),
      M(x + 0.55, y, 0, Math.PI / 2)
    );
    for (const sgn of [1, -1]) {
      // Marchepieds : cordage en feston sous la vergue.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(
          V(x + 0.75, y - 0.35 - Math.sin(t * Math.PI) * 0.3, sgn * hl * t)
        );
      }
      k.add(m.rope, tube(pts, 0.025, 16, 5));
    }
    yards.push({ y, half: hl });
  }
  return { y0, top: y0 + H, hune: ty, yards };
}

interface SailBuf {
  pos: number[];
  uvs: number[];
  wts: number[];
  idx: number[];
}

function sailMesh(b: SailBuf, mat: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  g.setAttribute('sw', new THREE.Float32BufferAttribute(b.wts, 1));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// --- Propulsion -----------------------------------------------------------------------

/**
 * Nacelle horizontale profilée (fuseau en goutte d'eau) : entrée d'air à
 * cône, colliers, tuyère orientable sous le ventre dans son cardan, deux bras
 * articulés et une conduite courbe vers la coque.
 */
function nacelle(
  k: Kit,
  m: RefMaterials,
  s: number,
  side: number,
  size: number,
  nozzles: THREE.Vector3[],
  angled = false
) {
  const hp = hullPt(s, 0.52, side);
  const Ln = 7.4 * size,
    R = 1.15 * size;
  const cx = hp.x,
    cz = hp.z + side * (R + 1.6),
    cy = hp.y - 1.3;
  // Profil (axe Y du tour → axe X du navire) : nez arrondi, ventre plein, queue fuselée.
  const prof: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const r =
      t < 0.3
        ? R * Math.pow(Math.sin((t / 0.3) * (Math.PI / 2)), 0.6)
        : R * (1 - Math.pow((t - 0.3) / 0.7, 2) * 0.62);
    prof.push([Math.max(r, R * 0.32), -Ln / 2 + Ln * (1 - t)]);
  }
  prof.reverse();
  const toX = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  const at = (dx: number, dy = 0, dz = 0) => V(cx + dx, cy + dy, cz + dz);
  const body = lathe(prof, 64);
  body.applyMatrix4(toX);
  k.add(m.ironPlates, body, M(cx, cy, cz));
  // Entrée d'air : lèvre de laiton, grille sombre, cône central.
  const nose = cx + Ln / 2;
  k.add(
    m.brass,
    torus(R * 0.36, 0.09, 32, 10),
    M(nose + 0.02, cy, cz, 0, Math.PI / 2, 0)
  );
  k.add(
    m.castIron,
    new THREE.CircleGeometry(R * 0.33, 32),
    M(nose, cy, cz, 0, Math.PI / 2, 0)
  );
  const spinner = lathe(
    [
      [0.001, 0.55],
      [0.12, 0.45],
      [0.22, 0.2],
      [0.24, 0],
    ],
    32
  );
  spinner.applyMatrix4(toX);
  k.add(m.brass, spinner, M(nose - 0.05, cy, cz));
  // Colliers.
  for (const f of [0.28, 0.0, -0.28]) {
    const t = 0.5 - f; // position le long du profil (0 = nez)
    const r = t < 0.3 ? R : R * (1 - Math.pow((t - 0.3) / 0.7, 2) * 0.62);
    k.add(
      m.brass,
      torus(r + 0.04, 0.07, 48, 10),
      M(cx + f * Ln, cy, cz, 0, Math.PI / 2, 0)
    );
  }
  // Tuyère arrière (échappement) et anneau d'Aether.
  const tail = cx - Ln / 2;
  const ex = lathe(
    [
      [R * 0.32, 0],
      [R * 0.36, -0.3],
      [R * 0.42, -0.7],
    ],
    32
  );
  ex.applyMatrix4(toX);
  k.add(m.castIron, ex, M(tail, cy, cz));
  k.add(
    m.aether,
    torus(R * 0.36, 0.05, 32, 8),
    M(tail - 0.5, cy, cz, 0, Math.PI / 2, 0)
  );
  // Tuyère orientable sous le ventre, dans son cardan.
  const ny = cy - R * 0.95;
  k.add(m.brass, torus(R * 0.62, 0.08, 48, 10), M(cx, ny, cz, 0, 0, 0.12));
  for (const sz of [1, -1])
    k.add(
      m.brass,
      cyl(0.08, 0.08, 0.4, 12),
      M(cx, ny, cz + sz * R * 0.62, Math.PI / 2)
    );
  const bell = lathe(
    [
      [R * 0.42, 0.1],
      [R * 0.46, 0],
      [R * 0.5, -0.4],
      [R * 0.62, -0.9],
      [R * 0.78, -1.25],
      [R * 0.82, -1.32],
    ],
    48
  );
  const bellM = M(cx, ny, cz, 0, 0, angled ? 0.38 : 0.1);
  k.add(m.copperSheath, bell, bellM);
  const inner = lathe(
    [
      [R * 0.8, -1.3],
      [R * 0.6, -0.9],
      [R * 0.44, -0.2],
    ],
    48
  );
  k.add(m.castIron, inner, bellM.clone());
  k.add(
    m.aether,
    torus(R * 0.55, 0.06, 32, 8),
    bellM.clone().multiply(M(0, -0.85, 0, Math.PI / 2))
  );
  nozzles.push(V(0, -1.3, 0).applyMatrix4(bellM));
  // Bras articulés : rotule à la coque, bras courbe, genouillère, collier.
  for (const f of [0.22, -0.22]) {
    const xs = cx + f * Ln;
    const sh = hullPt(s + (f * Ln) / L, 0.6, side);
    const clamp = at(f * Ln, R * 0.7, -side * R * 0.55);
    const knee = V(
      (sh.x + clamp.x) / 2,
      Math.max(sh.y, clamp.y) + 0.6,
      (sh.z + clamp.z) / 2
    );
    k.add(m.brass, sphere(0.32, 16), M(sh.x, sh.y, sh.z));
    k.add(
      m.castIron,
      lathe(
        [
          [0.001, 0],
          [0.45, 0],
          [0.45, 0.12],
          [0.3, 0.2],
          [0.001, 0.22],
        ],
        32
      ),
      along(sh.clone(), hullN(s, 0.6, side))
    );
    k.add(
      m.castIron,
      tube(
        [
          sh,
          V()
            .lerpVectors(sh, knee, 0.5)
            .add(V(0, 0.25, 0)),
          knee,
        ],
        0.2,
        20,
        12
      )
    );
    k.add(
      m.castIron,
      tube(
        [
          knee,
          V()
            .lerpVectors(knee, clamp, 0.5)
            .add(V(0, 0.1, 0)),
          clamp,
        ],
        0.18,
        20,
        12
      )
    );
    k.add(m.brass, sphere(0.28, 16), M(knee.x, knee.y, knee.z));
    k.add(
      m.brass,
      cyl(0.12, 0.12, 0.8, 16),
      M(knee.x, knee.y, knee.z, Math.PI / 2)
    );
    k.add(
      m.brass,
      torus(R * 0.98, 0.1, 48, 10),
      M(xs, cy, cz, 0, Math.PI / 2, 0)
    );
    // Vérin hydraulique : corps et tige.
    const pa = V(sh.x, sh.y - 1.1, sh.z + side * 0.1);
    const pb = at(f * Ln, -R * 0.2, -side * R * 0.9);
    const d = pb.clone().sub(pa);
    k.add(
      m.castIron,
      cyl(0.12, 0.12, d.length() * 0.55, 16),
      along(pa.clone().addScaledVector(d, 0.28), d)
    );
    k.add(
      m.brass,
      cyl(0.06, 0.06, d.length() * 0.5, 12),
      along(pa.clone().addScaledVector(d, 0.74), d)
    );
  }
  // Conduite de vapeur courbe (brides) de la coque au dos de la nacelle.
  const pa = hullPt(s, 0.68, side).addScaledVector(hullN(s, 0.68, side), 0.1);
  const pb = at(0.05 * Ln, R * 0.95, 0);
  const pipe = bez(
    pa,
    V(pa.x, pa.y + 0.4, (pa.z + pb.z) / 2 + side * 0.6),
    pb,
    16
  );
  k.add(m.brass, tube(pipe, 0.14, 40, 12));
  k.add(
    m.brass,
    torus(0.19, 0.05, 16, 8),
    along(pipe[1], pipe[2].clone().sub(pipe[0]))
  );
  k.add(
    m.brass,
    torus(0.19, 0.05, 16, 8),
    along(pipe[15], pipe[16].clone().sub(pipe[14]))
  );
}

/** Hélice de poupe carénée sous le cul rond (l'hélice tourne : objet séparé). */
function sternProp(k: Kit, m: RefMaterials, size = 1.1): THREE.Object3D {
  const x = X(0) - 1.2 * size;
  const y = keelY(0.02) * 0.55;
  const R = 2.0 * (size / 1.1);
  // Carénage annulaire à profil d'aile.
  const duct: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    duct.push([
      R + 0.2 + Math.sin(a) * 0.08 * (1 - Math.cos(a) * 0.4),
      Math.cos(a) * 1.1,
    ]);
  }
  const d = lathe(duct, 72);
  d.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  k.add(m.copperSheath, d, M(x, y, 0));
  for (const dx of [-0.9, 0.9])
    k.add(
      m.brass,
      torus(R + 0.24, 0.06, 64, 10),
      M(x + dx, y, 0, 0, Math.PI / 2, 0)
    );
  // Bras de support galbés vers la coque.
  for (const a of [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6]) {
    const p0 = V(x, y + Math.sin(a) * (R + 0.2), Math.cos(a) * (R + 0.2));
    const p1 = hullPt(0.05, 0.25, Math.cos(a) >= 0 ? 1 : -1);
    p1.z *= Math.abs(Math.cos(a)) * 0.9;
    k.add(
      m.castIron,
      tube(
        bez(
          p0,
          V((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 0.6, (p0.z + p1.z) / 2),
          p1,
          10
        ),
        0.15,
        20,
        10
      )
    );
  }
  const shaftTo = hullPt(0.07, 0.05, 1).setZ(0);
  k.add(
    m.brass,
    tube(
      [
        V(x + 0.3, y, 0),
        V((x + shaftTo.x) / 2, (y + shaftTo.y) / 2, 0),
        shaftTo,
      ],
      0.18,
      16,
      12
    )
  );
  // Hélice : moyeu en ogive et quatre pales vrillées en ellipsoïde.
  const prop = new THREE.Group();
  prop.position.set(x, y, 0);
  const pk = new Kit();
  const hub = lathe(
    [
      [0.001, -0.9],
      [0.25, -0.75],
      [0.42, -0.3],
      [0.45, 0.2],
      [0.35, 0.45],
    ],
    32
  );
  hub.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  pk.add(m.brass, hub);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.SphereGeometry(1, 32, 16);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < p.count; j++) {
      // Pale : longue en y, large en z, fine en x, vrillée avec le rayon.
      const py = (p.getY(j) * 0.5 + 0.5) * R * 0.88 + 0.3;
      let px = p.getX(j) * 0.06,
        pz = p.getZ(j) * 0.42 * (1 - 0.3 * Math.abs(p.getY(j)));
      const tw = 0.9 - (py / R) * 0.5;
      const c = Math.cos(tw),
        sn = Math.sin(tw);
      [px, pz] = [px * c - pz * sn, px * sn + pz * c];
      p.setXYZ(j, px, py, pz);
    }
    g.computeVertexNormals();
    pk.add(m.brass, g, M(0, 0, 0, (i / 4) * Math.PI * 2, 0, 0));
  }
  prop.add(pk.build(m.rope));
  return prop;
}

// --- Assemblage ---------------------------------------------------------------------

export interface RefShip {
  group: THREE.Group;
  props: THREE.Object3D[];
  lights: THREE.Vector3[];
  /** couleur des lanternes (selon les luminaires) */
  lampColor: number;
  smoke: THREE.Vector3[];
  steam: THREE.Vector3[];
  nozzles: THREE.Vector3[];
  sails: THREE.Mesh;
  flags: THREE.Mesh;
  rig: SailRig;
  /** hauteur du pont principal au milieu (pour caler sur le modèle classique) */
  deck: number;
  /** Hauteur où l'on marche (pont ou toit d'un château) à l'abscisse s. */
  walk: (s: number) => number;
  /** Place libre la plus proche (repère du navire) pour un matelot. */
  spot: (
    x: number,
    z: number,
    onRoof: boolean,
    taken?: THREE.Vector3[]
  ) => THREE.Vector3;
  /** Poste du timonier (devant la barre), s'il est sur le pont. */
  helmAt: THREE.Vector3 | null;
  /** Objets de décor modélisés utilisés pour ce navire (null : aucun). */
  propLib: PropLib | null;
}

/** Apparence choisie par l'équipage (reprise de la fiche du navire). */
export interface ShipLook {
  spec: HullSpec;
  mastType: 'simple' | 'double' | 'triple' | 'pique';
  ponts: number;
  guns?: number;
  luminaires: string;
  sculpture: string;
  gouvernail: string;
  flagColor: string;
  emblem: string;
  damage: number;
  scaffolding: boolean;
  /** matériaux recolorés (coque, château, virure, laiton, toile, quille, proue) */
  mats?: Partial<RefMaterials>;
}

export const DEFAULT_LOOK: ShipLook = {
  spec: PROTECTOR,
  mastType: 'triple',
  ponts: 1,
  luminaires: 'lanternes',
  sculpture: 'aucune',
  gouvernail: 'classique',
  flagColor: '#8f1d1d',
  emblem: 'aucun',
  damage: 0,
  scaffolding: false,
};

/** Figure de proue sculptée (ou éperon), dans l'axe de l'étrave. */
/**
 * Détails d'armement : ancres aux bossoirs, canots sur leurs portemanteaux,
 * manches à air, râteliers de cabillots au pied des mâts, habitacle et
 * cloche près de la barre, coffres et glènes de cordage, rivets du doublage.
 */
function details(
  k: Kit,
  m: RefMaterials,
  mastX: number[],
  helmAt: THREE.Vector3 | null,
  roofAt: (s: number) => number | undefined,
  blocks: [number, number, number, number][],
  lum: boolean
) {
  const sOf = (x: number) => x / L + 0.5;
  // Ancres pendues aux bossoirs, de part et d'autre de l'avant.
  for (const side of [1, -1]) {
    const s = 0.88;
    const rail = hullPt(s, 1.18, side);
    const out = hullN(s, 1, side).setY(0).normalize();
    const cat = rail.clone().addScaledVector(out, 1.3);
    k.add(
      m.darkWood,
      box(0.4, 2.2, 0.4, 0.06),
      along(rail.clone().addScaledVector(out, 0.5), out)
    );
    k.add(
      m.darkWood,
      cyl(0.2, 0.22, 1.6, 12),
      along(rail.clone().addScaledVector(out, 0.55), out)
    );
    const top = cat.clone().add(V(0, -0.4, 0));
    const shank = 2.6;
    const modeled = P.put(
      'ancre',
      top.x + 0.2,
      top.y - 2.9,
      top.z,
      Math.PI / 2
    );
    const bot = top
      .clone()
      .add(V(0.25, -shank, 0))
      .addScaledVector(out, 0.35);
    if (!modeled) k.add(m.castIron, tube([top, bot], 0.11, 6, 8));
    if (!modeled)
      k.add(
        m.castIron,
        tube(
          [
            top
              .clone()
              .addScaledVector(out, -0.9)
              .add(V(0, -0.3, 0)),
            top
              .clone()
              .addScaledVector(out, 0.9)
              .add(V(0, -0.3, 0)),
          ],
          0.08,
          4,
          6
        )
      );
    for (const dir of modeled ? [] : [1, -1]) {
      const arm = [
        bot,
        bot.clone().add(V(0.9 * dir, 0.35, 0)),
        bot.clone().add(V(1.15 * dir, 1.0, 0)),
      ];
      k.add(m.castIron, tube(bez(arm[0], arm[1], arm[2], 8), 0.1, 8, 6));
      k.add(
        m.castIron,
        box(0.5, 0.06, 0.45, 0.02),
        M(arm[2].x, arm[2].y, arm[2].z, 0, 0, dir * 0.9)
      );
    }
    k.add(
      m.castIron,
      torus(0.22, 0.05, 12, 6),
      M(top.x, top.y + 0.2, top.z, 0, Math.PI / 2, 0)
    );
    // Chaîne qui rentre par l'écubier.
    const hawse = hullPt(0.93, 0.92, side);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = hawse.clone().lerp(top, t);
      p.y -= Math.sin(Math.PI * t) * 0.8;
      pts.push(p);
    }
    for (let i = 0; i < pts.length - 1; i++)
      k.add(
        m.castIron,
        torus(0.12, 0.035, 8, 4),
        along(
          pts[i].clone().lerp(pts[i + 1], 0.5),
          pts[i + 1].clone().sub(pts[i])
        ).multiply(M(0, 0, 0, Math.PI / 2, i * 1.57, 0))
      );
  }
  // Canots sur portemanteaux, à mi-longueur, au-dessus du bordé.
  for (const side of [1, -1]) {
    const s = 0.47;
    const x = X(s);
    if (roofAt(s) !== undefined) continue;
    const z = side * (halfB(s) + 0.9);
    const y = deckY(s) + 2.6;
    // Coque de bois clair à liston peint, bâche lacée par-dessus.
    const boat = P.put('canot', x, y - 1.05, z);
    if (!boat)
      k.add(
        m.hullWood,
        sphere(1, 20, Math.PI / 2),
        M(x, y, z, Math.PI, 0, 0, V(3.3, 1.0, 1.0))
      );
    if (!boat)
      k.add(
        m.hullBand,
        torus(1, 0.07, 32, 4),
        M(x, y - 0.18, z, Math.PI / 2, 0, 0, V(3.28, 0.97, 1))
      );
    if (!boat)
      k.add(
        m.darkWood,
        torus(1, 0.06, 32, 4),
        M(x, y, z, Math.PI / 2, 0, 0, V(3.32, 1.0, 1))
      );
    if (!boat)
      k.add(
        m.darkWood,
        tube(
          [V(x - 3.3, y, z), V(x, y - 1.02, z), V(x + 3.3, y, z)],
          0.06,
          12,
          4
        )
      );
    if (!boat)
      k.add(
        m.canvas,
        sphere(1, 16, Math.PI / 2),
        M(x, y + 0.02, z, 0, 0, 0, V(3.25, 0.42, 0.97))
      );
    for (const dx of boat ? [] : [-2, -0.7, 0.7, 2])
      k.add(
        m.rope,
        torus(1, 0.025, 16, 3, Math.PI),
        M(x + dx, y + 0.02, z, 0, Math.PI / 2, 0, V(0.98, 0.44, 1))
      );
    for (const dx of [-2.6, 2.6]) {
      const foot = V(x + dx, deckY(s) + 0.6, side * (halfB(s) - 0.4));
      const tip = V(x + dx, y + 1.6, z);
      k.add(
        m.castIron,
        tube(
          bez(foot, V(x + dx, y + 1.9, side * (halfB(s) - 0.2)), tip, 10),
          0.08,
          10,
          6
        )
      );
      k.add(m.rope, cyl(0.025, 0.025, 1.5, 4), M(tip.x, tip.y - 0.75, tip.z));
    }
  }
  // Manches à air : pavillon évasé tourné vers l'avant.
  for (const [s, zf] of [
    [0.42, 0.55],
    [0.42, -0.55],
    [0.66, 0.6],
  ] as const) {
    if (roofAt(s) !== undefined) continue;
    const x = X(s),
      y = deckY(s),
      z = zf * halfB(s);
    if (
      blocks.some(
        ([a, b, zc, hw]) =>
          x > a - 0.6 && x < b + 0.6 && Math.abs(z - zc) < hw + 0.6
      )
    )
      continue;
    if (P.put('manche_air', x + 0.3, y, z)) {
      blocks.push([x - 0.5, x + 1, z, 0.5]);
      continue;
    }
    k.add(m.brass, cyl(0.24, 0.24, 1.8, 16), M(x, y + 0.9, z));
    k.add(
      m.brass,
      tube(
        bez(V(x, y + 1.7, z), V(x, y + 2.3, z), V(x + 0.55, y + 2.35, z), 10),
        0.24,
        10,
        12
      )
    );
    k.add(
      m.brass,
      lathe(
        [
          [0.24, 0],
          [0.32, 0.15],
          [0.5, 0.42],
          [0.56, 0.5],
        ],
        18
      ),
      along(V(x + 0.5, y + 2.35, z), V(1, 0, 0))
    );
    k.add(
      m.paint,
      cyl(0.5, 0.5, 0.02, 18),
      along(V(x + 1.0, y + 2.35, z), V(1, 0, 0))
    );
    blocks.push([x - 0.5, x + 1, z, 0.5]);
  }
  // Râteliers de cabillots au pied des mâts.
  for (const mx of mastX) {
    const s = sOf(mx);
    if (roofAt(s) !== undefined) continue;
    const y = deckY(s);
    for (const side of [1, -1]) {
      const z = side * 1.25;
      if (P.put('ratelier', mx, y, z, side > 0 ? 0 : Math.PI)) continue;
      k.add(m.darkWood, box(2.4, 0.14, 0.26, 0.03), M(mx, y + 0.95, z));
      for (const dx of [-1.05, 1.05])
        k.add(m.darkWood, cyl(0.07, 0.07, 0.95, 8), M(mx + dx, y + 0.47, z));
      for (let i = 0; i < 6; i++) {
        const px = mx - 0.9 + i * 0.36;
        k.add(
          m.darkWood,
          lathe(
            [
              [0.03, 0],
              [0.05, 0.1],
              [0.03, 0.3],
              [0.04, 0.35],
              [0.001, 0.4],
            ],
            8
          ),
          M(px, y + 0.82, z)
        );
        k.add(
          m.rope,
          torus(0.12, 0.03, 10, 4),
          M(px, y + 0.7, z + side * 0.04, 0, Math.PI / 2, 0, V(1, 1.8, 1))
        );
      }
    }
  }
  // Habitacle (compas) et cloche devant la barre.
  if (helmAt && P.has('cloche')) {
    const x = helmAt.x + 2.1;
    P.put('cloche', x + 0.4, helmAt.y, 1.6, Math.PI / 2);
    blocks.push([x - 0.4, x + 0.8, 0.8, 1.4]);
  } else if (helmAt) {
    const x = helmAt.x + 2.1,
      y = helmAt.y;
    k.add(
      m.darkWood,
      lathe(
        [
          [0.3, 0],
          [0.26, 0.1],
          [0.2, 0.9],
          [0.26, 1.0],
          [0.001, 1.0],
        ],
        16
      ),
      M(x, y, 0)
    );
    k.add(m.brass, sphere(0.3, 16, Math.PI / 2), M(x, y + 1.0, 0));
    if (lum) k.add(m.glass, sphere(0.12, 10), M(x, y + 1.15, 0.25));
    const bx = x + 0.4,
      bz = 1.6;
    for (const dz of [-0.35, 0.35])
      k.add(m.darkWood, box(0.12, 1.6, 0.12, 0.02), M(bx, y + 0.8, bz + dz));
    k.add(m.darkWood, box(0.14, 0.14, 0.9, 0.02), M(bx, y + 1.6, bz));
    k.add(
      m.brass,
      lathe(
        [
          [0.001, 0],
          [0.24, 0],
          [0.22, 0.08],
          [0.16, 0.3],
          [0.12, 0.42],
          [0.001, 0.44],
        ],
        18
      ),
      M(bx, y + 1.08, bz)
    );
    blocks.push([x - 0.4, bx + 0.4, 0.8, 1.4]);
  }
  // Coffres et glènes de cordage le long des pavois.
  const spots: [number, number][] = [
    [0.36, 0.72],
    [0.55, -0.74],
    [0.63, 0.74],
    [0.7, -0.7],
    [0.78, 0.66],
  ];
  spots.forEach(([s, zf], i) => {
    if (roofAt(s) !== undefined) return;
    const x = X(s),
      y = deckY(s),
      z = zf * halfB(s);
    if (
      blocks.some(
        ([a, b, zc, hw]) =>
          x > a - 0.4 && x < b + 0.4 && Math.abs(z - zc) < hw + 0.4
      )
    )
      return;
    const ry = zf > 0 ? Math.PI : 0;
    if (P.put(i % 2 ? 'coffre' : 'glene', x, y, z, ry)) {
      blocks.push([x - 0.7, x + 0.7, z, 0.5]);
      return;
    }
    if (i % 2) {
      k.add(m.darkWood, box(1.2, 0.6, 0.7, 0.05), M(x, y + 0.3, z));
      k.add(m.brass, box(1.24, 0.06, 0.74, 0.02), M(x, y + 0.45, z));
      k.add(
        m.darkWood,
        cyl(0.35, 0.35, 1.2, 16, true),
        M(x, y + 0.6, z, 0, 0, Math.PI / 2, V(1, 1, 0.5))
      );
    } else
      for (let q = 0; q < 4; q++)
        k.add(
          m.rope,
          torus(0.42 - q * 0.02, 0.06, 20, 5),
          M(x, y + 0.06 + q * 0.1, z, Math.PI / 2)
        );
    blocks.push([x - 0.7, x + 0.7, z, 0.5]);
  });
  // Rivets du doublage de cuivre : deux rangées le long de la flottaison.
  for (const t of [0.34, 0.46])
    for (const side of [1, -1])
      for (let s = 0.1; s < 0.86; s += 0.012) {
        const p = hullPt(s, t, side).addScaledVector(hullN(s, t, side), 0.02);
        k.add(
          m.brass,
          new THREE.IcosahedronGeometry(0.035, 0),
          M(p.x, p.y, p.z)
        );
      }
}

function figurehead(k: Kit, m: RefMaterials, kind: string) {
  const base = hullPt(1, 0.86, 1)
    .setZ(0)
    .add(V(-0.5, -0.2, 0));
  const dir = V(1, 0.45, 0).normalize();
  const fwd = (d: number, up = 0) =>
    base
      .clone()
      .addScaledVector(dir, d)
      .add(V(0, up, 0));
  const mat = m.prow ?? m.brass;
  if (kind === 'humanoide') {
    // Buste penché vers l'avant, bras le long de l'étrave, tête couronnée.
    k.add(
      mat,
      lathe(
        [
          [0.001, 0],
          [0.42, 0.2],
          [0.5, 0.9],
          [0.4, 1.7],
          [0.22, 2.0],
          [0.001, 2.05],
        ],
        32
      ),
      along(
        fwd(0.2),
        dir
          .clone()
          .add(V(0.4, 0.6, 0))
          .normalize()
      )
    );
    const head = fwd(1.0, 1.7);
    k.add(
      mat,
      sphere(0.34, 20),
      M(head.x, head.y, head.z, 0, 0, -0.3, V(1, 1.15, 1))
    );
    k.add(
      m.brass,
      torus(0.3, 0.05, 24, 8),
      M(head.x - 0.05, head.y + 0.3, head.z, Math.PI / 2, 0.2, 0)
    );
    for (const sd of [-1, 1])
      k.add(
        mat,
        tube(
          bez(
            fwd(0.5, 1.2).add(V(0, 0, sd * 0.4)),
            fwd(0.2, 0.6).add(V(0, 0, sd * 0.55)),
            fwd(-0.6, 0.1).add(V(0, 0, sd * 0.3)),
            10
          ),
          0.12,
          20,
          10
        )
      );
  } else if (kind === 'monstre') {
    // Tête de dragon : mâchoire, cornes recourbées, crête.
    k.add(
      mat,
      lathe(
        [
          [0.001, 0],
          [0.45, 0.3],
          [0.5, 1.0],
          [0.38, 1.9],
          [0.18, 2.6],
          [0.001, 2.8],
        ],
        32
      ),
      along(fwd(0.4), dir)
    );
    k.add(
      mat,
      lathe(
        [
          [0.001, 0],
          [0.22, 0.2],
          [0.18, 1.2],
          [0.001, 1.6],
        ],
        24
      ),
      along(fwd(1.6, -0.45), V(1, 0.1, 0))
    );
    for (const sd of [-1, 1])
      k.add(
        mat,
        tube(
          bez(
            fwd(1.4, 0.35).add(V(0, 0, sd * 0.3)),
            fwd(0.7, 1.3).add(V(0, 0, sd * 0.8)),
            fwd(-0.1, 1.0).add(V(0, 0, sd * 0.5)),
            12
          ),
          0.1,
          24,
          8
        )
      );
    for (let i = 0; i < 5; i++)
      k.add(
        mat,
        lathe(
          [
            [0.12, 0],
            [0.001, 0.5],
          ],
          12
        ),
        M(
          fwd(1.2 - i * 0.45, 0.45 - i * 0.08).x,
          fwd(1.2 - i * 0.45, 0.45 - i * 0.08).y,
          0,
          0,
          0,
          -0.4
        )
      );
  } else if (kind === 'animal') {
    // Tête de bélier aux cornes enroulées.
    k.add(
      mat,
      lathe(
        [
          [0.001, 0],
          [0.4, 0.25],
          [0.42, 0.9],
          [0.25, 1.6],
          [0.001, 1.75],
        ],
        32
      ),
      along(fwd(0.6), dir)
    );
    for (const sd of [-1, 1]) {
      const c = fwd(1.0, 0.45).add(V(0, 0, sd * 0.45));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 1.7;
        const r = 0.55 * (1 - i / 34);
        pts.push(
          c
            .clone()
            .add(
              V(
                -Math.cos(a) * r + 0.2,
                -Math.sin(a) * r,
                sd * (0.05 + i * 0.012)
              )
            )
        );
      }
      k.add(mat, tube(pts, 0.11, 48, 10));
    }
  } else {
    const ram = lathe(
      [
        [0.001, 0],
        [0.35, 0.4],
        [0.3, 1.8],
        [0.001, 3.4],
      ],
      24
    );
    k.add(mat, ram, along(base.clone(), dir));
  }
}

/** Gouvernail suspendu sous la poupe ronde. */
function rudder(k: Kit, m: RefMaterials, kind: string) {
  const top = hullPt(0.015, 0.2, 1).setZ(0);
  const blade = box(2.2, 3.2, 0.22, 0.1);
  const mtx = M(top.x - 1.2, top.y - 1.6, 0, 0, 0, -0.08);
  k.add(kind === 'renforce' ? m.castIron : m.darkWood, blade, mtx);
  if (kind === 'renforce')
    for (const y of [-1, 0, 1])
      k.add(
        m.brass,
        box(2.3, 0.14, 0.3, 0.05),
        mtx.clone().multiply(M(0, y, 0))
      );
  if (kind === 'sculpte')
    k.add(
      m.brass,
      tube(
        bez(
          V(top.x - 2.2, top.y - 0.3, 0.14),
          V(top.x - 1.0, top.y - 1.8, 0.16),
          V(top.x - 2.0, top.y - 3.0, 0.14),
          12
        ),
        0.07,
        24,
        8
      )
    );
  k.add(m.brass, cyl(0.12, 0.12, 3.6, 12), M(top.x - 0.1, top.y - 1.6, 0));
}

/** Échafaudages autour de la coque (travaux au hangar). */
function scaffold(k: Kit, m: RefMaterials) {
  for (const side of [1, -1]) {
    for (let i = 0; i <= 10; i++) {
      const s = 0.08 + i * 0.085;
      const p = hullPt(s, 0.95, side);
      const x = p.x,
        z = p.z + side * 1.4;
      k.add(m.darkWood, cyl(0.07, 0.07, 14, 8), M(x, p.y - 7, z));
    }
    for (const yl of [-4.5, -1.5, 1.5]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const s = 0.08 + i * 0.085;
        const p = hullPt(s, 0.95, side);
        pts.push(V(p.x, p.y + yl, p.z + side * 1.4));
      }
      k.add(
        m.deck,
        sweep(pts, 1.1, 0.08, V(0, 1, 0), () => V(0, 0, side))
      );
      k.add(
        m.darkWood,
        tube(
          pts.map((q) => q.clone().add(V(0, 1.0, side * 0.5))),
          0.04,
          40,
          6
        )
      );
    }
  }
}

/** Pavillon : couleur et emblème peint (texture dessinée). */
function flagTexture(color: string, emblem: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 160;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 1, 160);
  g.fillStyle = '#f0e2b8';
  g.strokeStyle = '#f0e2b8';
  g.lineWidth = 8;
  const cx = 110,
    cy = 80;
  if (emblem === 'soleil') {
    g.beginPath();
    g.arc(cx, cy, 26, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
      g.lineTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52);
      g.stroke();
    }
  } else if (emblem === 'crane') {
    g.beginPath();
    g.arc(cx, cy - 8, 28, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 16, cy + 10, 32, 18);
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx - 11, cy - 10, 8, 0, Math.PI * 2);
    g.arc(cx + 11, cy - 10, 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f0e2b8';
    g.beginPath();
    g.moveTo(cx - 50, cy + 45);
    g.lineTo(cx + 50, cy - 45);
    g.moveTo(cx - 50, cy - 45);
    g.lineTo(cx + 50, cy + 45);
    g.stroke();
  } else if (emblem === 'etoile') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 20 : 48;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
  } else if (emblem === 'croissant') {
    g.beginPath();
    g.arc(cx, cy, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx + 18, cy - 6, 38, 0, Math.PI * 2);
    g.fill();
  } else if (emblem === 'griffes') {
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + i * 26 - 10, cy - 50);
      g.quadraticCurveTo(cx + i * 26 + 18, cy, cx + i * 26 - 4, cy + 50);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildShip(
  base: RefMaterials,
  look: ShipLook = DEFAULT_LOOK,
  props: PropLib | null = null
): RefShip {
  P = new PropSet(props);
  const sp = look.spec;
  setForm(sp);
  LUM = look.luminaires;
  const lum = LUM !== 'aucun';
  const m: RefMaterials = { ...base, ...(look.mats ?? {}) } as RefMaterials;
  const k = new Kit();
  const lights: THREE.Vector3[] = [];
  const smoke: THREE.Vector3[] = [];
  const steam: THREE.Vector3[] = [];
  const nozzles: THREE.Vector3[] = [];
  hull(k, m);
  gunports(
    k,
    m,
    look.ponts,
    look.guns ? Math.round(look.guns / (2 * Math.max(1, look.ponts))) : 7
  );

  // Châteaux : arrière (fait le tour de la poupe), avant, ou rouf au milieu.
  const covered: [number, number, number][] = [];
  for (const c of sp.castles) {
    if (c.a <= 0.02) {
      aftCastle(k, m, lights, c.b, c.h, c.shape, lum);
      covered.push([
        0,
        c.b,
        deckY(c.b * 0.5) + Math.max(3.4, c.h * 0.9) + 0.18,
      ]);
    } else if (c.b >= 0.9) {
      forecastle(k, m, lights, Math.min(c.a, 0.9), c.h, c.shape, lum);
      covered.push([
        c.a,
        1,
        deckY((c.a + 1) / 2) + Math.max(1.8, Math.min(c.h, 4.4)),
      ]);
    } else {
      midCastle(k, m, lights, c.a, c.b, c.h, c.shape, c.w ?? 0.8, lum);
      covered.push([
        c.a,
        c.b,
        deckY((c.a + c.b) / 2) +
          Math.max(2.4, c.shape === 'tower' ? c.h * 0.55 : c.h * 0.85),
      ]);
    }
  }
  const roofAt = (s: number) =>
    covered.find(([a, b]) => s >= a - 0.02 && s <= b + 0.02)?.[2];
  // Encombrements du pont (x0, x1, demi-largeur) : où les matelots ne vont pas.
  const blocks: [number, number, number, number][] = [];
  const block = (s0: number, s1: number, hw: number) =>
    blocks.push([X(s0), X(s1), 0, hw]);
  // Cheminées : la première avec sa salle des machines (si le pont est libre).
  sp.chimneys.forEach((cs, i) => {
    const roof = roofAt(cs);
    if (roof !== undefined) funnel(k, m, X(cs), roof, 8, smoke);
    else if (i === 0) {
      engines(k, m, smoke, steam, lights, cs, lum);
      block(cs - 0.065, cs + 0.07, 3.4);
    } else {
      funnel(k, m, X(cs), deckY(cs), 10, smoke);
      block(cs - 0.03, cs + 0.03, 1.8);
    }
  });
  if (roofAt(sp.reactor) === undefined) {
    reactor(k, m, sp.reactor);
    blocks.push([X(sp.reactor) - 2.3, X(sp.reactor) + 2.3, 0, 2.3]);
  }
  const helmS = Math.min(
    0.9,
    (sp.castles.find((c) => c.a <= 0.02)?.b ?? 0.12) + 0.02
  );
  let helmAt: THREE.Vector3 | null = null;
  if (roofAt(helmS + 0.02) === undefined) {
    helm(k, m, helmS);
    blocks.push([X(helmS) + 0.4, X(helmS) + 1.6, 0, 0.9]);
    helmAt = V(X(helmS) + 0.25, deckY(helmS), 0);
  }
  for (const c of sp.castles)
    if (c.a > 0.02 && c.b < 0.9) block(c.a - 0.01, c.b + 0.01, 1e3);
  // Gouvernail sous la poupe (sauf si l'hélice de poupe occupe la place).
  if (!sp.pods.some((p) => p.kind === 'rear')) rudder(k, m, look.gouvernail);
  if (look.scaffolding) scaffold(k, m);

  // Écoutilles, tonneaux, caisses (là où le pont est libre).
  for (const s of [0.47, 0.66, 0.79]) {
    if (roofAt(s) !== undefined || sp.masts.some((q) => Math.abs(q - s) < 0.03))
      continue;
    const x = X(s),
      y = deckY(s);
    blocks.push([x - 1.3, x + 1.3, 0, 1.2]);
    if (P.put('ecoutille', x, y, 0)) continue;
    k.add(m.darkWood, box(2.2, 0.4, 2.0, 0.12), M(x, y + 0.2, 0));
    for (let i = 0; i < 6; i++)
      k.add(
        m.castIron,
        cyl(0.03, 0.03, 1.8, 8),
        M(x - 0.9 + i * 0.36, y + 0.42, 0, Math.PI / 2)
      );
  }
  const keg = lathe(
    [
      [0.001, 0],
      [0.32, 0],
      [0.37, 0.15],
      [0.4, 0.48],
      [0.37, 0.81],
      [0.32, 0.96],
      [0.001, 0.96],
    ],
    32
  );
  for (const [s, zf] of [
    [0.68, 0.6],
    [0.69, -0.64],
    [0.56, 0.68],
  ] as const) {
    if (roofAt(s) !== undefined) continue;
    const x = X(s),
      y = deckY(s),
      z = zf * halfB(s);
    blocks.push([x - 0.6, x + 1.5, z, 0.7]);
    if (P.has('tonneau') && P.has('caisse')) {
      P.put('tonneau', x, y, z, s * 40);
      P.put('caisse', x + 0.9, y, z * 0.9, 0.3);
      continue;
    }
    k.add(m.darkWood, keg.clone(), M(x, y, z));
    for (const h of [0.18, 0.78])
      k.add(m.castIron, torus(0.375, 0.02, 32, 6), M(x, y + h, z, Math.PI / 2));
    k.add(
      m.hullWood,
      box(0.9, 0.7, 0.9, 0.06),
      M(x + 0.9, y + 0.35, z * 0.9, 0, 0.3, 0)
    );
  }
  keg.dispose();

  // Décor modélisé en plus : canons de pont, boulets, pompe, treuil, sacs,
  // établi… posés là où le pont est libre (les matelots les contournent).
  if (P.lib) {
    const fits = (x: number, z: number, r: number) => {
      const s = x / L + 0.5;
      if (s < 0.12 || s > 0.9 || roofAt(s) !== undefined) return false;
      if (Math.abs(z) + r > halfB(s) - 0.5) return false;
      if (sp.masts.some((q) => Math.abs(X(q) - x) < 1.4 + r)) return false;
      return !blocks.some(
        ([a, b, zc, hw]) =>
          x + r > a - 0.3 && x - r < b + 0.3 && Math.abs(z - zc) < hw + r + 0.3
      );
    };
    // Face avant (+x) tournée vers le bord (dehors) ou vers l'axe (dedans).
    const out = (side: number) => (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const inb = (side: number) => -out(side);
    const place = (
      kind: PropKind,
      r: number,
      edge: boolean,
      ry: (side: number) => number,
      from: number,
      side0 = 1
    ) => {
      if (!P.has(kind)) return;
      for (let s = from; s < 0.9; s += 0.025)
        for (const side of [side0, -side0]) {
          const x = X(s);
          const z = edge ? side * (halfB(s) - 0.6 - r) : side * (1.6 + r);
          if (!fits(x, z, r)) continue;
          P.put(kind, x, deckY(s), z, ry(side));
          blocks.push([x - r, x + r, z, r]);
          return;
        }
    };
    place('canon', 1.4, true, out, 0.3, 1);
    place('canon', 1.4, true, out, 0.3, -1);
    place('boulets', 0.5, true, out, 0.3, 1);
    place('boulets', 0.5, true, out, 0.5, -1);
    place('pompe', 0.6, false, inb, 0.5, 1);
    place('treuil', 0.7, false, inb, 0.6, -1);
    place('sacs', 0.7, true, inb, 0.55, 1);
    place('seau', 0.5, true, inb, 0.45, -1);
    place('etabli', 1.0, true, inb, 0.35, 1);
    place('poulailler', 0.6, true, inb, 0.7, -1);
    place('caisses', 0.9, true, inb, 0.6, 1);
    place('table_cartes', 0.8, false, inb, 0.25, -1);
    place('projecteur', 0.6, false, () => 0, 0.82, 1);
    place('telescope', 0.9, false, inb, 0.72, -1);
  }

  // Mâture (nombre de mâts selon le type, comme le modèle classique).
  const mt = look.mastType;
  const ms0 = sp.masts;
  const mastS =
    mt === 'simple'
      ? [ms0[1]]
      : mt === 'double' || mt === 'pique'
        ? [ms0[0] + (ms0[1] - ms0[0]) * 0.4, ms0[2]]
        : ms0;
  const mainIdx = mastS.length === 3 ? 1 : 0;
  const masts = mastS.map((s, i) => {
    const H = (mt === 'pique' ? 24 : i === mainIdx ? 28 : 23.5) * 1.15;
    const x = X(s);
    blocks.push([x - 0.9, x + 0.9, 0, 0.9]);
    return { x, H, ...mast(k, m, x, H, mt !== 'pique') };
  });

  // Beaupré effilé.
  const stem = hullPt(1, 1.2, 1).setZ(0);
  const bp0 = stem.clone().add(V(-4.2, -0.6, 0));
  const bdir = V(1, 0.3, 0).normalize();
  const bp1 = bp0.clone().addScaledVector(bdir, 17);
  k.add(
    m.spar,
    lathe(
      [
        [0.36, 0],
        [0.34, 4],
        [0.24, 11],
        [0.14, 16.5],
        [0.001, 17],
      ],
      24
    ),
    along(bp0.clone(), bdir)
  );
  k.add(
    m.castIron,
    torus(0.32, 0.05, 24, 8),
    along(stem.clone().addScaledVector(bdir, 0.3), bdir)
  );
  figurehead(k, m, look.sculpture);
  details(
    k,
    m,
    masts.map((q) => q.x),
    helmAt,
    roofAt,
    blocks,
    lum
  );

  // Voilure animée.
  const specs: SailSpec[] = [];
  masts.forEach((ms, mi) => {
    const yx = ms.x + 0.55;
    const sMast = ms.x / L + 0.5;
    if (mt === 'pique') {
      const tack = V(ms.x - 0.4, ms.y0 + 3, 0);
      const throat = V(ms.x - 0.4, ms.y0 + ms.H - 1.5, 0);
      const span = 13;
      specs.push({
        kind: 'junk',
        tack,
        throat,
        peak: V(ms.x - span * 0.45, ms.y0 + ms.H - 0.5, 0),
        clew: V(ms.x - span, ms.y0 + 3.4, 0),
        belly: 1.6,
        sheetTo: (side) => hullPt(Math.max(0.03, sMast - 0.25), 1.25, side),
        halyardTo: V(ms.x, ms.top, 0),
        tier: mi,
      });
      return;
    }
    const ys = ms.yards;
    const courseBot =
      roofAt(sMast) !== undefined
        ? (roofAt(sMast) as number) + 2.5
        : ms.y0 + (mi === 0 && masts.length > 1 ? 7.6 : 4.4);
    const rail = (side: number) =>
      hullPt(Math.max(0.03, sMast - 0.06), 1.25, side).add(
        V(0, 0.2, -side * 0.2)
      );
    const yardArm = (y: { y: number; half: number }) => (side: number) =>
      V(yx + 0.1, y.y, side * y.half * 0.95);
    specs.push({
      kind: 'square',
      x: yx,
      yardY: ys[0].y,
      yTop: ys[0].y - 0.25,
      yBot: courseBot,
      halfTop: ys[0].half * 0.98,
      halfBot: ys[0].half * 1.1,
      belly: 2.1,
      sheetTo: rail,
      tier: 0,
      mast: mi,
    });
    specs.push({
      kind: 'square',
      x: yx,
      yardY: ys[1].y,
      yTop: ys[1].y - 0.22,
      yBot: ys[0].y + 0.3,
      halfTop: ys[1].half * 0.97,
      halfBot: ys[0].half * 0.98,
      belly: 1.7,
      sheetTo: yardArm(ys[0]),
      tier: 1,
      mast: mi,
    });
    specs.push({
      kind: 'square',
      x: yx,
      yardY: ys[2].y,
      yTop: ys[2].y - 0.18,
      yBot: ys[1].y + 0.3,
      halfTop: ys[2].half * 0.97,
      halfBot: ys[1].half * 0.97,
      belly: 1.25,
      sheetTo: yardArm(ys[1]),
      tier: 2,
      mast: mi,
    });
  });
  const fm = masts[masts.length - 1];
  const njib = mt === 'simple' ? 1 : 2;
  for (let j = 0; j < njib; j++) {
    const tack = bp0.clone().lerp(bp1, 0.42 + j * 0.5);
    const head = V(fm.x + 0.4, fm.y0 + fm.H * (0.5 + j * 0.2), 0);
    const clew = V(fm.x + 6.2 + j * 3.2, fm.y0 + 3.2 + j * 3.4, 0);
    const sc = (fm.x + 6.2 + j * 3.2) / L + 0.5;
    specs.push({
      kind: 'jib',
      tack,
      head,
      clew,
      belly: 2.3 - j * 0.3,
      sheetTo: (side) =>
        hullPt(Math.min(0.97, sc - 0.02), 1.25, side).add(
          V(0, 0.15, -side * 0.2)
        ),
      halyardTo: V(fm.x + 0.35, fm.top - 0.6, 0),
      tier: j,
    });
    k.rope(tack, head, 0.04);
  }
  const rig = new SailRig(specs, m.canvas, m.rope);
  rig.damage = look.damage;
  const sails = rig.sails;

  // Gréement dormant : haubans et enfléchures, galhaubans, étais, bras.
  masts.forEach((ms, mi) => {
    const s = ms.x / L + 0.5;
    for (const side of [1, -1]) {
      const chain: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const cs = Math.max(0.02, Math.min(0.97, s + (i - 3) * 0.022));
        chain.push(hullPt(cs, 1.0, side).add(V(0, 0.2, side * 0.35)));
      }
      chain.forEach((c) =>
        k.add(m.brass, cyl(0.04, 0.04, 1.2, 8), M(c.x, c.y - 0.5, c.z))
      );
      const top = V(ms.x, ms.hune - 0.3, side * 0.4);
      chain.forEach((c) => k.rope(c, top, 0.04));
      const steps = Math.floor((top.y - chain[0].y) / 0.5);
      for (let r = 1; r < steps - 1; r++) {
        const f = r / steps;
        for (let i = 0; i < chain.length - 1; i++)
          k.rope(
            chain[i].clone().lerp(top, f),
            chain[i + 1].clone().lerp(top, f),
            0.018
          );
      }
      const ttop = V(ms.x + 0.35, ms.top - 2.5, side * 0.2);
      for (const dx of [-1.1, 0, 1.1])
        k.rope(V(ms.x + dx, ms.hune + 0.1, side * 1.6), ttop, 0.03);
      k.rope(
        hullPt(Math.max(0.02, s - 0.11), 1.0, side).add(V(0, 0.2, side * 0.35)),
        V(ms.x + 0.35, ms.top - 1, 0),
        0.03
      );
      if (mt !== 'pique')
        ms.yards.forEach((y) => {
          k.rope(
            V(ms.x + 0.55, y.y, side * y.half),
            V(ms.x - 6, y.y - 3 - mi, side * y.half * 0.6),
            0.02
          );
        });
    }
    const next = masts[mi + 1];
    const to = next ? V(next.x, next.y0 + 1, 0) : bp0.clone().lerp(bp1, 0.9);
    k.rope(V(ms.x, ms.hune + 0.2, 0), to, 0.05);
    const to2 = next ? V(next.x, next.hune, 0) : bp1.clone();
    k.rope(V(ms.x + 0.35, ms.top - 0.5, 0), to2, 0.035);
  });

  // Pavillon de poupe (couleur, emblème) et flammes en tête de mât.
  const fb: SailBuf = { pos: [], uvs: [], wts: [], idx: [] };
  const flag = (
    x0: number,
    y0: number,
    len: number,
    h: number,
    taper: boolean
  ) => {
    const b0 = fb.pos.length / 3;
    const nu = 16,
      nv = 4;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu,
          v = j / nv;
        const hh = taper ? h * (1 - u * 0.9) : h;
        fb.pos.push(x0 - u * len, y0 - (v - 0.5) * hh, 0);
        fb.uvs.push(taper ? 0.97 : 1 - u, taper ? 0.5 : 1 - v);
        fb.wts.push(u);
      }
    const w = nu + 1;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = b0 + j * w + i;
        fb.idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      }
  };
  const sternTop = hullPt(0.0008, 1.25, 1);
  const aft = sp.castles.find((c) => c.a <= 0.02);
  const fpX = sternTop.x + 1.2;
  const fpY = deckY(0) + (aft ? Math.max(3.4, aft.h * 0.9) : RAIL);
  k.add(
    m.spar,
    lathe(
      [
        [0.08, 0],
        [0.05, 6],
        [0.001, 6.1],
      ],
      12
    ),
    M(fpX, fpY, 0)
  );
  k.add(m.brass, sphere(0.12, 12), M(fpX, fpY + 6.1, 0));
  flag(fpX - 0.05, fpY + 5.0, 3.6, 2.2, false);
  masts.forEach((ms) => flag(ms.x + 0.25, ms.top - 0.4, 5, 0.8, true));
  const tex = flagTexture(look.flagColor, look.emblem);
  const flagMat = new THREE.MeshStandardMaterial({
    color: tex ? '#ffffff' : look.flagColor,
    map: tex,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const flags = sailMesh(fb, flagMat);

  // Propulsion.
  let prop: THREE.Object3D | null = null;
  for (const pd of sp.pods) {
    if (pd.kind === 'rear') prop = sternProp(k, m, pd.size);
    else
      for (const side of [1, -1])
        nacelle(k, m, pd.s, side, pd.size, nozzles, pd.kind === 'angled');
  }

  const group = k.build(m.rope);
  group.add(P.build());
  group.add(sails, rig.ropes, rig.running, rig.gaskets, flags);
  if (prop) group.add(prop);
  const lampColor =
    LUM === 'aether' ? 0x55d8ff : LUM === 'braseros' ? 0xff7a2a : 0xffa860;
  const sOf = (x: number) => x / L + 0.5;
  const free = (x: number, z: number, roof: boolean) => {
    const s = sOf(x);
    if (s < 0.04 || s > 0.93) return false;
    const r = roofAt(s);
    if (roof) return r !== undefined && Math.abs(z) < halfB(s) * 0.45;
    if (r !== undefined || Math.abs(z) > halfB(s) - 1.1) return false;
    return !blocks.some(
      ([a, b, zc, hw]) =>
        x > a - 0.4 && x < b + 0.4 && Math.abs(z - zc) < hw + 0.4
    );
  };
  const spot = (
    x: number,
    z: number,
    onRoof: boolean,
    taken: THREE.Vector3[] = []
  ) => {
    // Recherche en spirale autour de la place prévue par le modèle classique.
    for (const roof of onRoof ? [true, false] : [false])
      for (let rad = 0; rad <= 24; rad += 0.6)
        for (let a = 0; a < 12; a++) {
          const xx = x + Math.cos((a / 12) * Math.PI * 2) * rad,
            zz = z * 0.8 + Math.sin((a / 12) * Math.PI * 2) * rad * 0.35;
          if (
            free(xx, zz, roof) &&
            !taken.some((t) => Math.hypot(t.x - xx, t.z - zz) < 1.6)
          ) {
            const s = sOf(xx);
            return V(xx, roof ? (roofAt(s) as number) : deckY(s), zz);
          }
          if (rad === 0) break;
        }
    return V(x, deckY(sOf(x)), 0);
  };
  return {
    group,
    props: prop ? [prop] : [],
    lights,
    lampColor,
    smoke,
    steam,
    nozzles,
    sails,
    flags,
    rig,
    deck: D,
    walk: (s) => roofAt(s) ?? deckY(s),
    spot,
    helmAt,
    propLib: P.lib,
  };
}
