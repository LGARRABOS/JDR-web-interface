import * as THREE from 'three';
import type { RefMaterials } from './materials';
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

// Navire de référence (gabarit « Protector » : 55 m, 10 m de large).
// Tout est galbé : coque lissée en sections continues (étrave élancée,
// poupe en fer à cheval), châteaux qui épousent le plan de la coque,
// salle des machines aux angles arrondis, dôme lisse nervuré, cheminée
// évasée, mâts et vergues effilés, voiles gonflées bordées de ralingues,
// nacelles horizontales profilées sur bras articulés, tuyauterie courbe.
// Repère : x vers la proue, y vers le haut, z par le travers ; quille à y = 0.

export const L = 55.2;
const B = 10;
const D = 6.8;
const X = (s: number) => (s - 0.5) * L;
const RAIL = 1.15;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// --- Plan de formes ------------------------------------------------------------

/** Demi-largeur selon s (0 = poupe, 1 = proue) : poupe ronde, proue fine. */
export function halfB(s: number) {
  if (s > 0.6)
    return (B / 2) * Math.pow(Math.max(0, 1 - ((s - 0.6) / 0.4) ** 2), 0.6);
  const st = 0.11;
  if (s < st) return (B / 2) * Math.sqrt(Math.max(0, 1 - ((st - s) / st) ** 2));
  return B / 2;
}
export function keelY(s: number) {
  let y = 0;
  if (s > 0.74) y += D * 0.55 * ((s - 0.74) / 0.26) ** 2;
  if (s < 0.22) y += D * 0.62 * ((0.22 - s) / 0.22) ** 2.2;
  return y;
}
export function deckY(s: number) {
  let y = D;
  if (s < 0.3) y += 1.3 * ((0.3 - s) / 0.3) ** 2;
  if (s > 0.68) y += 2.3 * ((s - 0.68) / 0.32) ** 2;
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
  const h = Math.min(1.2, (y - k) / Math.max(0.5, D + 2.3 - k));
  const x = X(s) + 4.2 * sm(0.8, 1, s) * h * h;
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

  // Pont : suit la tonture, entre les deux murailles.
  k.add(
    m.deck,
    grid(NS, 16, (i, j) => {
      const s = 0.004 + SS(i, NS) * 0.99;
      const e = hullPt(s, 1, 1);
      const z = -e.z + (2 * e.z * j) / 16;
      return { p: V(e.x, e.y + 0.02, z), uv: [e.x, z] };
    })
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

  // Sabords : volets relevés, canons à renfort de bouche.
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
  for (const side of [1, -1])
    for (let g = 0; g < 7; g++) {
      const s = 0.36 + g * 0.064;
      const p = hullPt(s, 0.82, side);
      const n = hullN(s, 0.82, side);
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

// --- Petits éléments ---------------------------------------------------------------

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
  const frame = tube(pts, 0.05, 60, 8);
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
      sphere(0.035, 8),
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
    k.add(m.brass, cyl(0.03, 0.04, h, 10), M(p.x, p.y + h / 2, p.z));
    k.add(m.brass, sphere(0.06, 8), M(p.x, p.y + h, p.z));
  });
  if (pts.length > 1) {
    k.add(
      m.brass,
      tube(
        pts.map((p) => p.clone().setY(p.y + h)),
        0.035,
        pts.length * 4,
        8
      )
    );
    k.add(
      m.brass,
      tube(
        pts.map((p) => p.clone().setY(p.y + h * 0.5)),
        0.025,
        pts.length * 4,
        8
      )
    );
  }
}

function lantern(k: Kit, m: RefMaterials, p: THREE.Vector3): THREE.Vector3 {
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
  k.add(m.glass, cyl(0.14, 0.14, 0.38, 24), M(p.x, p.y + 0.27, p.z));
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
function aftCastle(k: Kit, m: RefMaterials, lights: THREE.Vector3[]) {
  const s1 = 0.3;
  const H = 5.4;
  const base = (s: number) => deckY(s) + RAIL;
  const pt = wallAround(k, m.hullWood, 0, s1, 0.22, base, H - RAIL, 0.3);
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
    m.hullWood,
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
  lights.push(lantern(k, m, V(xf + 0.85, yb + 2.5, 1.0)));
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
  // Dôme d'observation : tambour à congés, coupole lisse nervurée, lanterneau.
  const dx = X(0.18),
    dy = deckY(0.18) + H + 0.18;
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

function forecastle(k: Kit, m: RefMaterials, lights: THREE.Vector3[]) {
  const s0 = 0.84;
  const H = 2.2;
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
      m.hullWood,
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
    m.hullWood,
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
  lights.push(lantern(k, m, V(xa - 0.6, ya + H, 0)));
  // Guindeau à tambour galbé.
  const gx = X(0.9),
    gy = deckY(0.9) + H + 0.55;
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
  lights: THREE.Vector3[]
) {
  const x0 = X(0.315),
    x1 = X(0.43);
  const y0 = deckY(0.37);
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
  const fx = X(0.37) - 0.8;
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
    k.add(m.copperSheath, lathe(capsule(0.95, 3.9), 48), M(tx, y0, tz));
    for (const f of [0.22, 0.5, 0.78])
      k.add(
        m.brass,
        torus(0.97, 0.05, 48, 8),
        M(tx, y0 + 3.9 * f, tz, Math.PI / 2)
      );
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
  lights.push(lantern(k, m, V(x1 + 0.2, y0 + H + 0.35, 0)));
}

/** Cœur d'Aether : cylindre de verre lumineux dans une cage de laiton. */
function reactor(k: Kit, m: RefMaterials) {
  const s = 0.53;
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
function helm(k: Kit, m: RefMaterials) {
  const s = 0.33;
  const x = X(s) + 0.9,
    y = deckY(s);
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
function mast(k: Kit, m: RefMaterials, x: number, H: number) {
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
  for (const [f, half] of spec) {
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

/** Voile carrée gonflée ; renvoie son contour (pour les ralingues). */
function squareSail(
  b: SailBuf,
  x: number,
  yTop: number,
  yBot: number,
  halfTop: number,
  halfBot: number,
  belly: number
): THREE.Vector3[] {
  const nu = 28,
    nv = 20;
  const base = b.pos.length / 3;
  const H = yTop - yBot;
  const P = (u: number, v: number) => {
    // Bords latéraux légèrement creux (chute), bordure en arc.
    const half =
      (halfTop + (halfBot - halfTop) * v) * (1 - 0.04 * Math.sin(Math.PI * v));
    const sag = (1 - u * u) * 0.55 * v * v;
    const y = yTop - H * v + sag;
    const w = Math.pow(1 - u * u, 0.75) * Math.sin(Math.PI * (0.1 + v * 0.82));
    const bulge = belly * w + belly * 0.25 * (1 - u * u) * v;
    return { p: V(x + 0.75 + bulge, y, u * half), w };
  };
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      const v = j / nv;
      const { p, w } = P(u, v);
      b.pos.push(p.x, p.y, p.z);
      b.uvs.push(p.z, p.y);
      b.wts.push(w);
    }
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = base + j * w + i;
      b.idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i <= nu; i++) edge.push(P((i / nu) * 2 - 1, 0).p);
  for (let j = 1; j <= nv; j++) edge.push(P(1, j / nv).p);
  for (let i = nu - 1; i >= 0; i--) edge.push(P((i / nu) * 2 - 1, 1).p);
  for (let j = nv - 1; j >= 0; j--) edge.push(P(-1, j / nv).p);
  return edge;
}

/** Foc : triangle à chute et bordure creuses, gonflé sur le côté. */
function jib(
  b: SailBuf,
  tack: THREE.Vector3,
  head: THREE.Vector3,
  clew: THREE.Vector3,
  belly: number
): THREE.Vector3[] {
  const nu = 16,
    nv = 16;
  const base = b.pos.length / 3;
  const P = (u: number, v: number) => {
    // u : guindant (0) → chute (1) ; v : bas (0) → têtière (1).
    const front = tack.clone().lerp(head, v);
    const back = clew.clone().lerp(head, v);
    const p = front.lerp(back, u);
    const w =
      Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.08)) *
      Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.08)) *
      (1 - v * 0.6);
    p.z += belly * w;
    // Chute creuse.
    p.x -= 0.4 * Math.sin(Math.PI * v) * u;
    return { p, w };
  };
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const { p, w } = P(i / nu, j / nv);
      b.pos.push(p.x, p.y, p.z);
      b.uvs.push(p.x, p.y);
      b.wts.push(w);
    }
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = base + j * w + i;
      b.idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
  const edge: THREE.Vector3[] = [];
  for (let j = 0; j <= nv; j++) edge.push(P(0, j / nv).p);
  for (let j = nv; j >= 0; j--) edge.push(P(1, j / nv).p);
  for (let i = 1; i <= nu; i++) edge.push(P(1 - i / nu, 0).p);
  return edge;
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
  nozzles: THREE.Vector3[]
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
  const bellM = M(cx, ny, cz, 0, 0, 0.1);
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
function sternProp(k: Kit, m: RefMaterials): THREE.Object3D {
  const x = X(0) - 1.2;
  const y = 2.4;
  const R = 2.0;
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
  smoke: THREE.Vector3[];
  steam: THREE.Vector3[];
  nozzles: THREE.Vector3[];
  sails: THREE.Mesh;
  flags: THREE.Mesh;
}

export function buildShip(m: RefMaterials): RefShip {
  const k = new Kit();
  const lights: THREE.Vector3[] = [];
  const smoke: THREE.Vector3[] = [];
  const steam: THREE.Vector3[] = [];
  const nozzles: THREE.Vector3[] = [];
  hull(k, m);
  aftCastle(k, m, lights);
  forecastle(k, m, lights);
  engines(k, m, smoke, steam, lights);
  reactor(k, m);
  helm(k, m);

  // Écoutilles à hiloires arrondies et caillebotis ; tonneaux galbés ; caisses.
  for (const s of [0.47, 0.66, 0.79]) {
    const x = X(s),
      y = deckY(s);
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
  for (const [s, z] of [
    [0.68, 3.0],
    [0.69, -3.2],
    [0.56, 3.4],
  ] as const) {
    const x = X(s),
      y = deckY(s);
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

  // Mâture.
  const masts = [
    { x: X(0.46), H: 30 },
    { x: X(0.6), H: 34 },
    { x: X(0.74), H: 30 },
  ].map((d) => ({ ...d, ...mast(k, m, d.x, d.H) }));

  // Beaupré effilé et bout-dehors.
  const stem = hullPt(1, 1.2, 1).setZ(0);
  const bp0 = stem.clone().add(V(-4.2, -0.6, 0));
  const bdir = V(1, 0.3, 0).normalize();
  const bp1 = bp0.clone().addScaledVector(bdir, 17);
  const bs = lathe(
    [
      [0.36, 0],
      [0.34, 4],
      [0.24, 11],
      [0.14, 16.5],
      [0.001, 17],
    ],
    24
  );
  k.add(m.spar, bs, along(bp0.clone(), bdir));
  k.add(
    m.castIron,
    torus(0.32, 0.05, 24, 8),
    along(stem.clone().addScaledVector(bdir, 0.3), bdir)
  );
  // Figure de proue : éperon de laiton fuselé.
  const ram = lathe(
    [
      [0.001, 0],
      [0.35, 0.4],
      [0.3, 1.8],
      [0.001, 3.4],
    ],
    24
  );
  k.add(
    m.brass,
    ram,
    along(
      hullPt(1, 0.86, 1)
        .setZ(0)
        .add(V(-0.6, -0.2, 0)),
      V(1, 0.45, 0)
    )
  );

  // Voiles et ralingues.
  const sb: SailBuf = { pos: [], uvs: [], wts: [], idx: [] };
  const edges: THREE.Vector3[][] = [];
  masts.forEach((ms, mi) => {
    const ys = ms.yards;
    const courseBot = mi === 0 ? ms.y0 + 7.6 : ms.y0 + 4.4;
    edges.push(
      squareSail(
        sb,
        ms.x,
        ys[0].y - 0.25,
        courseBot,
        ys[0].half * 0.96,
        ys[0].half * 1.05,
        2.0
      )
    );
    edges.push(
      squareSail(
        sb,
        ms.x,
        ys[1].y - 0.22,
        ys[0].y + 0.3,
        ys[1].half * 0.95,
        ys[0].half * 0.98,
        1.6
      )
    );
    edges.push(
      squareSail(
        sb,
        ms.x,
        ys[2].y - 0.18,
        ys[1].y + 0.3,
        ys[2].half * 0.95,
        ys[1].half * 0.97,
        1.2
      )
    );
  });
  const fm = masts[2];
  for (let j = 0; j < 2; j++) {
    const tack = bp0.clone().lerp(bp1, 0.5 + j * 0.45);
    const head = V(fm.x + 0.4, fm.y0 + fm.H * (0.6 + j * 0.2), 0);
    const clew = V(fm.x + 3.4 + j * 1.6, fm.y0 + 2.4 + j * 2.2, 0);
    edges.push(jib(sb, tack, head, clew, 1.0));
    k.rope(tack, head, 0.04);
  }
  const sails = sailMesh(sb, m.canvas);
  edges.forEach((e) => k.add(m.rope, tube(e, 0.045, e.length * 2, 6)));

  // Gréement dormant : haubans et enfléchures, galhaubans, étais, bras.
  masts.forEach((ms, mi) => {
    const s = ms.x / L + 0.5;
    for (const side of [1, -1]) {
      const chain: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const cs = s + (i - 3) * 0.022;
        chain.push(hullPt(cs, 1.0, side).add(V(0, 0.2, side * 0.35)));
      }
      // Cadènes : barres de laiton le long de la muraille.
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
        hullPt(s - 0.11, 1.0, side).add(V(0, 0.2, side * 0.35)),
        V(ms.x + 0.35, ms.top - 1, 0),
        0.03
      );
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

  // Pavillon de poupe et flammes en tête de mât.
  const fb: SailBuf = { pos: [], uvs: [], wts: [], idx: [] };
  const flag = (
    x0: number,
    y0: number,
    len: number,
    h: number,
    taper: boolean
  ) => {
    const base = fb.pos.length / 3;
    const nu = 16,
      nv = 4;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu,
          v = j / nv;
        const hh = taper ? h * (1 - u * 0.9) : h;
        fb.pos.push(x0 - u * len, y0 - (v - 0.5) * hh, 0);
        fb.uvs.push(u, v);
        fb.wts.push(u);
      }
    const w = nu + 1;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * w + i;
        fb.idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      }
  };
  const sternTop = hullPt(0.0008, 1.25, 1);
  const fpX = sternTop.x + 1.2;
  const fpY = deckY(0) + 5.6;
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
  const flagMat = new THREE.MeshStandardMaterial({
    color: '#8f1d1d',
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const flags = sailMesh(fb, flagMat);

  // Propulsion.
  nacelle(k, m, 0.3, 1, 1.05, nozzles);
  nacelle(k, m, 0.3, -1, 1.05, nozzles);
  nacelle(k, m, 0.71, 1, 0.92, nozzles);
  nacelle(k, m, 0.71, -1, 0.92, nozzles);
  const prop = sternProp(k, m);

  const group = k.build(m.rope);
  group.add(sails, flags, prop);
  return { group, props: [prop], lights, smoke, steam, nozzles, sails, flags };
}
