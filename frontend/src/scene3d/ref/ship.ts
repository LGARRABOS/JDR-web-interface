import * as THREE from 'three';
import type { RefMaterials } from './materials';
import { along, box, cyl, grid, Kit, M, sphere, sweep, torus } from './kit';

// Navire de référence (gabarit « Protector » : 55 m, 10 m de large),
// reconstruit de zéro : coque lissée en sections, bordé sur les hauts,
// doublage de cuivre riveté sous la ligne des préceintes, châteaux, salle
// des machines et cheminée, réservoirs, cœur d'Aether, trois mâts gréés,
// voiles gonflées, nacelles de sustentation et hélice de poupe.
// Repère : x vers la proue, y vers le haut, z par le travers ; quille à y = 0.

export const L = 55.2;
const B = 10;
const D = 6.8;
const X = (s: number) => (s - 0.5) * L;

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Demi-largeur au maître-bau selon s (0 = poupe, 1 = proue). */
export function halfB(s: number) {
  if (s > 0.62)
    return (B / 2) * Math.pow(Math.max(0, 1 - ((s - 0.62) / 0.38) ** 2), 0.62);
  return (B / 2) * (0.72 + 0.28 * sm(0, 0.2, s));
}
export function keelY(s: number) {
  let y = 0;
  if (s > 0.76) y += D * 0.55 * ((s - 0.76) / 0.24) ** 2;
  if (s < 0.12) y += D * 0.4 * ((0.12 - s) / 0.12) ** 2;
  return y;
}
export function deckY(s: number) {
  let y = D;
  if (s < 0.3) y += 1.4 * ((0.3 - s) / 0.3) ** 2;
  if (s > 0.7) y += 2.2 * ((s - 0.7) / 0.3) ** 2;
  return y;
}
const RAIL = 1.15;

/** Point de la coque : t de 0 (quille) à 1 (pont), jusqu'à 1.25 (lisse). */
export function hullPt(s: number, t: number, side = 1): THREE.Vector3 {
  const hb = halfB(s);
  const k = keelY(s),
    d = deckY(s);
  const n = 1.7 + 1.3 * sm(0.0, 0.25, s) * (1 - sm(0.6, 0.95, s));
  if (t <= 1) {
    const phi = (t * Math.PI) / 2;
    const z = hb * Math.pow(Math.sin(phi), 2 / n) * (1 - 0.05 * sm(0.75, 1, t));
    const y = k + (d - k) * (1 - Math.pow(Math.cos(phi), 2 / n));
    return new THREE.Vector3(X(s), y, z * side);
  }
  const f = (t - 1) / 0.25;
  return new THREE.Vector3(X(s), d + f * RAIL, (hb * 0.95 - 0.12 * f) * side);
}

/** Normale extérieure approchée de la coque. */
function hullN(s: number, t: number, side = 1): THREE.Vector3 {
  const a = hullPt(s + 0.002, t, side).sub(hullPt(s - 0.002, t, side));
  const b = hullPt(s, t + 0.01, side).sub(hullPt(s, t - 0.01, side));
  const n =
    side > 0
      ? new THREE.Vector3().crossVectors(a, b)
      : new THREE.Vector3().crossVectors(b, a);
  return n.normalize().multiplyScalar(-1);
}

const SS = (i: number, n: number) => {
  // Stations resserrées aux extrémités.
  const u = i / n;
  return 0.5 - 0.5 * Math.cos(u * Math.PI);
};

function hull(k: Kit, m: RefMaterials) {
  const NS = 140;
  const T_SPLIT = 0.58;
  for (const side of [1, -1]) {
    // Longueur d'arc le long des sections : v en mètres.
    const arc = (s: number, t: number) => {
      let a = 0;
      let p = hullPt(s, 0, side);
      const steps = 24;
      for (let q = 1; q <= steps; q++) {
        const np = hullPt(s, (t * q) / steps, side);
        a += np.distanceTo(p);
        p = np;
      }
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
    part(0, T_SPLIT, 16, m.copperSheath);
    part(T_SPLIT, 0.74, 6, m.hullWood);
    part(0.74, 0.9, 5, m.hullBand);
    part(0.9, 1.25, 8, m.hullWood);
  }
  // Tableau arrière (s = 0) : fermé par une face plane.
  const outline: THREE.Vector3[] = [];
  for (let j = 0; j <= 20; j++) outline.push(hullPt(0, (1.25 * j) / 20, 1));
  for (let j = 20; j >= 0; j--) outline.push(hullPt(0, (1.25 * j) / 20, -1));
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const c = new THREE.Vector3(X(0), deckY(0) * 0.6, 0);
  pos.push(c.x, c.y, c.z);
  uv.push(c.z, c.y);
  outline.forEach((p) => {
    pos.push(p.x, p.y, p.z);
    uv.push(p.z, p.y);
  });
  for (let i = 1; i < outline.length; i++) idx.push(0, i + 1, i);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  k.add(m.hullWood, tg);

  // Pont : suit la tonture, entre les deux murailles.
  k.add(
    m.deck,
    grid(NS, 12, (i, j) => {
      const s = SS(i, NS) * 0.995;
      const hz = hullPt(s, 1, 1).z;
      const z = -hz + (2 * hz * j) / 12;
      return { p: new THREE.Vector3(X(s), deckY(s) + 0.02, z), uv: [X(s), z] };
    })
  );

  // Préceintes (bandes noires), lisse de pavois, bande de laiton.
  const strip = (
    t: number,
    off: number,
    w: number,
    h: number,
    mat: THREE.Material,
    s0 = 0.004,
    s1 = 0.985
  ) => {
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      const sides: THREE.Vector3[] = [];
      for (let i = 0; i <= 90; i++) {
        const s = s0 + ((s1 - s0) * i) / 90;
        const n = hullN(s, Math.min(t, 1.2), side);
        pts.push(hullPt(s, t, side).addScaledVector(n, off));
        sides.push(n);
      }
      k.add(
        mat,
        sweep(pts, w, h, new THREE.Vector3(0, 1, 0), (i) => sides[i])
      );
    }
  };
  strip(T_SPLIT, 0.06, 0.22, 0.5, m.paint, 0.006, 0.975);
  strip(0.74, 0.07, 0.24, 0.34, m.paint, 0.004, 0.982);
  strip(0.9, 0.06, 0.2, 0.28, m.paint, 0.004, 0.985);
  strip(1.25, -0.06, 0.42, 0.18, m.darkWood, 0.002, 0.99);
  strip(1.0, 0.05, 0.06, 0.12, m.brass, 0.01, 0.97);

  // Sabords : volets relevés, gueules des canons.
  for (const side of [1, -1])
    for (let g = 0; g < 7; g++) {
      const s = 0.36 + g * 0.065;
      const p = hullPt(s, 0.82, side);
      const n = hullN(s, 0.82, side);
      const yaw = Math.atan2(n.x, n.z);
      const port = new THREE.Matrix4().compose(
        p.clone().addScaledVector(n, 0.02),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      k.add(m.paint, box(1.0, 0.85, 0.08), port.clone());
      // Volet relevé à 70°.
      const lid = port
        .clone()
        .multiply(M(0, 0.45, 0.02))
        .multiply(M(-1.2, 0, 0))
        .multiply(M(0, 0.43, 0.04));
      k.add(m.hullWood, box(1.05, 0.88, 0.1), lid);
      k.add(
        m.brass,
        box(1.1, 0.06, 0.12),
        port.clone().multiply(M(0, -0.46, 0.02))
      );
      // Canon.
      k.add(
        m.castIron,
        cyl(0.2, 0.15, 1.6, 12),
        port.clone().multiply(M(0, -0.05, 0.45, Math.PI / 2))
      );
      k.add(
        m.castIron,
        torus(0.17, 0.05, 12, 6),
        port.clone().multiply(M(0, -0.05, 1.22))
      );
    }
}

/** Fenêtre à petits bois : cadre de laiton, vitre (éclairée la nuit). */
function windowAt(
  k: Kit,
  m: RefMaterials,
  mtx: THREE.Matrix4,
  w = 0.9,
  h = 1.3
) {
  k.add(m.glass, box(w, h, 0.05), mtx.clone());
  const f = 0.08;
  k.add(m.brass, box(w + f * 2, f, 0.1), mtx.clone().multiply(M(0, h / 2, 0)));
  k.add(m.brass, box(w + f * 2, f, 0.1), mtx.clone().multiply(M(0, -h / 2, 0)));
  k.add(m.brass, box(f, h, 0.1), mtx.clone().multiply(M(w / 2, 0, 0)));
  k.add(m.brass, box(f, h, 0.1), mtx.clone().multiply(M(-w / 2, 0, 0)));
  k.add(m.brass, box(0.04, h, 0.08), mtx.clone());
  k.add(m.brass, box(w, 0.04, 0.08), mtx.clone().multiply(M(0, h * 0.18, 0)));
  // Arc au-dessus.
  k.add(
    m.brass,
    torus(w / 2 + f / 2, 0.045, 12, 5, Math.PI),
    mtx.clone().multiply(M(0, h / 2, 0))
  );
  k.add(
    m.glass,
    new THREE.CircleGeometry(w / 2, 12, 0, Math.PI),
    mtx.clone().multiply(M(0, h / 2, 0.01))
  );
}

function porthole(k: Kit, m: RefMaterials, mtx: THREE.Matrix4, r = 0.32) {
  k.add(m.brass, torus(r, 0.07, 18, 6), mtx.clone());
  k.add(
    m.glass,
    new THREE.CircleGeometry(r, 18),
    mtx.clone().multiply(M(0, 0, -0.01))
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.add(
      m.brass,
      sphere(0.035, 4),
      mtx
        .clone()
        .multiply(M(Math.cos(a) * (r + 0.1), Math.sin(a) * (r + 0.1), 0.02))
    );
  }
}

function railing(k: Kit, m: RefMaterials, pts: THREE.Vector3[], h = 1.0) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    k.add(m.brass, cyl(0.035, 0.035, h, 6), M(p.x, p.y + h / 2, p.z));
    k.add(m.brass, sphere(0.06, 4), M(p.x, p.y + h, p.z));
    if (i > 0) {
      const a = pts[i - 1];
      const d = new THREE.Vector3().subVectors(p, a);
      const mid = new THREE.Vector3().addVectors(a, p).multiplyScalar(0.5);
      for (const hh of [h, h * 0.5]) {
        const mm = along(mid.clone().setY(mid.y + hh), d);
        k.add(m.brass, cyl(0.03, 0.03, d.length(), 6), mm);
      }
    }
  }
}

function lantern(k: Kit, m: RefMaterials, p: THREE.Vector3): THREE.Vector3 {
  k.add(m.brass, cyl(0.16, 0.2, 0.08, 10), M(p.x, p.y, p.z));
  k.add(m.glass, cyl(0.14, 0.14, 0.38, 8), M(p.x, p.y + 0.23, p.z));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.add(
      m.brass,
      cyl(0.015, 0.015, 0.42, 4),
      M(p.x + Math.cos(a) * 0.16, p.y + 0.23, p.z + Math.sin(a) * 0.16)
    );
  }
  k.add(m.brass, cyl(0.2, 0.04, 0.22, 10), M(p.x, p.y + 0.53, p.z));
  k.add(m.brass, torus(0.06, 0.015, 8, 4), M(p.x, p.y + 0.7, p.z));
  return new THREE.Vector3(p.x, p.y + 0.23, p.z);
}

export interface RefShip {
  group: THREE.Group;
  props: THREE.Object3D[];
  lights: THREE.Vector3[];
  /** sorties de fumée (cheminée) et de vapeur (évents), repère du navire */
  smoke: THREE.Vector3[];
  steam: THREE.Vector3[];
  /** tuyères de sustentation (sortie, repère du navire) */
  nozzles: THREE.Vector3[];
  sails: THREE.Mesh;
  flags: THREE.Mesh;
}

/** Château arrière : murailles, galerie de poupe, dôme d'observation. */
function aftCastle(k: Kit, m: RefMaterials, lights: THREE.Vector3[]) {
  const s1 = 0.3;
  const H = 5.6;
  const NS = 30;
  const inset = 0.25;
  const wz = (s: number) => hullPt(s, 1.25, 1).z - inset;
  // Murailles latérales (bordé) avec deux rangées de fenêtres.
  for (const side of [1, -1]) {
    k.add(
      m.hullWood,
      grid(
        NS,
        6,
        (i, j) => {
          const s = (s1 * i) / NS;
          const y = deckY(s) + RAIL + (H - RAIL) * (j / 6);
          return { p: new THREE.Vector3(X(s), y, wz(s) * side), uv: [X(s), y] };
        },
        side < 0
      )
    );
    for (let w = 0; w < 5; w++) {
      const s = 0.05 + w * 0.05;
      const y = deckY(s) + 2.7;
      const p = new THREE.Vector3(X(s), y, (wz(s) + 0.03) * side);
      windowAt(k, m, M(p.x, p.y, p.z, 0, side > 0 ? 0 : Math.PI, 0), 0.8, 1.2);
    }
    // Corniche et bandeau peint.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= NS; i++) {
      const s = (s1 * i) / NS;
      pts.push(new THREE.Vector3(X(s), deckY(s) + H, (wz(s) + 0.08) * side));
    }
    k.add(m.darkWood, sweep(pts, 0.35, 0.3));
    k.add(
      m.brass,
      sweep(
        pts.map((p) => p.clone().setY(p.y - 1.4)),
        0.12,
        0.1
      )
    );
  }
  // Toit (pont de dunette).
  k.add(
    m.deck,
    grid(NS, 8, (i, j) => {
      const s = (s1 * i) / NS;
      const z = -wz(s) + (2 * wz(s) * j) / 8;
      return { p: new THREE.Vector3(X(s), deckY(s) + H, z), uv: [X(s), z] };
    })
  );
  // Façade avant : porte, fenêtres, escaliers.
  const xf = X(s1);
  const yf = deckY(s1);
  const wf = wz(s1);
  k.add(m.hullWood, box(0.3, H - 0.1, wf * 2), M(xf, yf + H / 2, 0));
  k.add(m.darkWood, box(0.2, 2.4, 1.4), M(xf + 0.16, yf + 1.2, 0));
  k.add(m.brass, sphere(0.06, 4), M(xf + 0.3, yf + 1.2, 0.5));
  for (const z of [-2.6, 2.6])
    windowAt(k, m, M(xf + 0.16, yf + 3.2, z, 0, Math.PI / 2, 0), 0.9, 1.2);
  lights.push(lantern(k, m, new THREE.Vector3(xf + 0.4, yf + 2.6, 1.1)));
  railing(
    k,
    m,
    [-1, -0.5, 0, 0.5, 1].map(
      (f) => new THREE.Vector3(xf + 0.1, yf + H, f * (wf - 0.1))
    )
  );
  // Rambarde de dunette.
  for (const side of [1, -1])
    railing(
      k,
      m,
      Array.from({ length: 9 }, (_, i) => {
        const s = 0.01 + (i / 8) * (s1 - 0.02);
        return new THREE.Vector3(X(s), deckY(s) + H, (wz(s) - 0.1) * side);
      })
    );
  // Poupe : prolongement du tableau, galerie vitrée, balcon.
  const xs = X(0) - 0.05;
  const ys = deckY(0) + RAIL;
  const ws = wz(0);
  k.add(m.hullWood, box(0.25, H - RAIL, ws * 2), M(xs, ys + (H - RAIL) / 2, 0));
  for (let r = 0; r < 2; r++)
    for (let w = 0; w < 5; w++) {
      const z = (w - 2) * 1.25;
      windowAt(
        k,
        m,
        M(xs - 0.14, ys + 1.3 + r * 1.9, z, 0, -Math.PI / 2, 0),
        0.85,
        1.25
      );
    }
  // Balcon de poupe.
  k.add(m.darkWood, box(1.4, 0.18, ws * 2 + 0.6), M(xs - 0.7, ys + 0.45, 0));
  railing(
    k,
    m,
    [-1, -0.6, -0.2, 0.2, 0.6, 1].map(
      (f) => new THREE.Vector3(xs - 1.35, ys + 0.54, f * (ws + 0.2))
    ),
    0.9
  );
  for (const z of [-ws - 0.25, ws + 0.25])
    railing(
      k,
      m,
      [
        new THREE.Vector3(xs - 1.35, ys + 0.54, z),
        new THREE.Vector3(xs - 0.1, ys + 0.54, z),
      ],
      0.9
    );
  for (const z of [-ws + 0.2, ws - 0.2])
    lights.push(lantern(k, m, new THREE.Vector3(xs - 1.3, ys + 1.45, z)));
  // Dôme d'observation (cuivre vert-de-gris, nervures de laiton, lanterneau).
  const dx = X(0.21),
    dy = deckY(0.21) + H;
  k.add(m.ironPlates, cyl(2.7, 2.7, 1.1, 32), M(dx, dy + 0.55, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    porthole(
      k,
      m,
      M(
        dx + Math.cos(a) * 2.72,
        dy + 0.55,
        Math.sin(a) * 2.72,
        0,
        Math.PI / 2 - a,
        0
      ),
      0.22
    );
  }
  k.add(m.verdigris, sphere(2.75, 20, Math.PI / 2), M(dx, dy + 1.1, 0));
  for (let i = 0; i < 12; i++)
    k.add(
      m.brass,
      torus(2.78, 0.05, 20, 5, Math.PI / 2),
      M(dx, dy + 1.1, 0, 0, (i / 12) * Math.PI * 2, Math.PI / 2)
    );
  k.add(m.brass, torus(2.75, 0.09, 40, 6), M(dx, dy + 1.12, 0, Math.PI / 2));
  k.add(m.brass, cyl(0.5, 0.5, 0.6, 12), M(dx, dy + 3.95, 0));
  k.add(m.glass, cyl(0.42, 0.42, 0.5, 12), M(dx, dy + 4.0, 0));
  k.add(m.brass, cyl(0.55, 0.05, 0.6, 12), M(dx, dy + 4.55, 0));
  // Télescope de laiton.
  k.add(
    m.brass,
    cyl(0.16, 0.24, 2.6, 12),
    M(dx + 1.2, dy + 3.1, 0.9, 0, 0, -1.0)
  );
}

function forecastle(k: Kit, m: RefMaterials, lights: THREE.Vector3[]) {
  const s0 = 0.84,
    s1 = 0.965;
  const H = 2.2;
  const NS = 12;
  const wz = (s: number) => hullPt(s, 1.25, 1).z - 0.25;
  for (const side of [1, -1])
    k.add(
      m.hullWood,
      grid(
        NS,
        3,
        (i, j) => {
          const s = s0 + ((s1 - s0) * i) / NS;
          const y = deckY(s) + RAIL + (H - RAIL) * (j / 3);
          return { p: new THREE.Vector3(X(s), y, wz(s) * side), uv: [X(s), y] };
        },
        side < 0
      )
    );
  k.add(
    m.deck,
    grid(NS, 6, (i, j) => {
      const s = s0 + ((s1 - s0) * i) / NS;
      const z = -wz(s) + (2 * wz(s) * j) / 6;
      return { p: new THREE.Vector3(X(s), deckY(s) + H, z), uv: [X(s), z] };
    })
  );
  const xa = X(s0),
    ya = deckY(s0),
    wa = wz(s0);
  k.add(m.hullWood, box(0.25, H, wa * 2), M(xa, ya + H / 2, 0));
  k.add(m.darkWood, box(0.15, 1.9, 1.1), M(xa - 0.1, ya + 0.95, 0));
  for (const z of [-2.3, 2.3])
    porthole(k, m, M(xa - 0.14, ya + 1.3, z, 0, -Math.PI / 2, 0), 0.28);
  lights.push(lantern(k, m, new THREE.Vector3(xa - 0.3, ya + H, 0)));
  // Guindeau.
  k.add(
    m.castIron,
    cyl(0.45, 0.45, 2.4, 14),
    M(X(0.9), deckY(0.9) + H + 0.55, 0, Math.PI / 2)
  );
  k.add(
    m.brass,
    cyl(0.55, 0.55, 0.12, 14),
    M(X(0.9), deckY(0.9) + H + 0.55, 1.25, Math.PI / 2)
  );
  k.add(
    m.brass,
    cyl(0.55, 0.55, 0.12, 14),
    M(X(0.9), deckY(0.9) + H + 0.55, -1.25, Math.PI / 2)
  );
}

/** Salle des machines, cheminée, réservoirs de vapeur, tuyauterie. */
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
  k.add(m.ironPlates, box(len, H, W), M(cx, y0 + H / 2, 0));
  k.add(m.paint, box(len + 0.3, 0.25, W + 0.3), M(cx, y0 + H + 0.12, 0));
  k.add(m.paint, box(len + 0.2, 0.3, W + 0.2), M(cx, y0 + 0.15, 0));
  for (const side of [1, -1])
    for (let i = 0; i < 4; i++)
      porthole(
        k,
        m,
        M(
          x0 + 0.9 + i * 1.3,
          y0 + 1.8,
          (W / 2 + 0.02) * side,
          0,
          side > 0 ? 0 : Math.PI,
          0
        ),
        0.26
      );
  // Lanterneau vitré sur le toit.
  k.add(m.ironPlates, box(2.2, 0.6, 2.4), M(cx + 1.5, y0 + H + 0.55, 0));
  for (const side of [1, -1])
    k.add(
      m.glass,
      box(2.0, 0.05, 1.3),
      M(cx + 1.5, y0 + H + 1.05, side * 0.6, side * 0.5, 0, 0)
    );
  // Cheminée : fût riveté, cerclages de laiton, couronne évasée.
  const fx = X(0.37) - 0.8;
  const fy = y0 + H + 0.2;
  const FH = 10.5;
  k.add(m.ironPlates, cyl(1.25, 1.05, FH, 28), M(fx, fy + FH / 2, 0));
  for (const f of [0.08, 0.45, 0.8])
    k.add(
      m.brass,
      torus(1.25 - 0.2 * f + 0.04, 0.09, 32, 6),
      M(fx, fy + FH * f, 0, Math.PI / 2)
    );
  k.add(m.paint, cyl(1.08, 1.5, 1.0, 28, true), M(fx, fy + FH + 0.45, 0));
  k.add(m.paint, torus(1.5, 0.1, 32, 6), M(fx, fy + FH + 0.95, 0, Math.PI / 2));
  k.add(
    m.castIron,
    new THREE.CircleGeometry(1.05, 24),
    M(fx, fy + FH - 0.6, 0, -Math.PI / 2)
  );
  smoke.push(new THREE.Vector3(fx, fy + FH + 1.0, 0));
  // Haubans de cheminée.
  for (const a of [0.6, 2.2, 3.9, 5.5]) {
    const top = new THREE.Vector3(fx, fy + FH * 0.78, 0);
    k.rope(
      top,
      new THREE.Vector3(
        fx + Math.cos(a) * 3.2,
        y0 + H + 0.25,
        Math.sin(a) * 2.6
      ),
      0.025
    );
  }
  // Réservoirs de vapeur verticaux, de part et d'autre.
  for (const side of [1, -1]) {
    const tx = x1 + 1.6,
      tz = side * 3.15;
    k.add(m.copperSheath, cyl(0.95, 0.95, 3.2, 24), M(tx, y0 + 1.6, tz));
    k.add(m.copperSheath, sphere(0.95, 12, Math.PI / 2), M(tx, y0 + 3.2, tz));
    for (const f of [0.15, 0.55, 0.92])
      k.add(
        m.brass,
        torus(0.97, 0.05, 24, 5),
        M(tx, y0 + 3.2 * f, tz, Math.PI / 2)
      );
    // Manomètre.
    k.add(
      m.brass,
      cyl(0.2, 0.2, 0.08, 14),
      M(tx - 0.98, y0 + 2.1, tz, 0, 0, Math.PI / 2)
    );
    k.add(
      m.glass,
      new THREE.CircleGeometry(0.16, 14),
      M(tx - 1.03, y0 + 2.1, tz, 0, -Math.PI / 2, 0)
    );
    // Tuyau coudé vers la salle des machines.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = (t * Math.PI) / 2;
      pts.push(
        new THREE.Vector3(
          tx - Math.sin(a) * 1.5,
          y0 + 3.6 + Math.cos(a) * 0.0 + Math.sin(t * Math.PI) * 0.5,
          tz - side * (1 - Math.cos(a)) * 0.4
        )
      );
    }
    pts.push(new THREE.Vector3(x1 - 0.2, y0 + 2.6, tz - side * 0.4));
    k.add(m.brass, sweep(pts, 0.22, 0.22));
    // Soupape et évent.
    k.add(m.brass, cyl(0.08, 0.08, 0.9, 8), M(tx, y0 + 4.5, tz));
    k.add(m.brass, cyl(0.16, 0.12, 0.2, 8), M(tx, y0 + 4.95, tz));
    steam.push(new THREE.Vector3(tx, y0 + 5.1, tz));
  }
  // Évents sur le toit.
  for (const z of [-1.8, 1.8]) {
    k.add(m.brass, cyl(0.12, 0.12, 1.3, 8), M(x0 + 1.0, y0 + H + 0.8, z));
    k.add(
      m.brass,
      torus(0.18, 0.06, 10, 5, Math.PI),
      M(x0 + 1.0, y0 + H + 1.45, z + 0.18, 0, Math.PI / 2, 0)
    );
    steam.push(new THREE.Vector3(x0 + 1.0, y0 + H + 1.5, z + 0.36));
  }
  lights.push(lantern(k, m, new THREE.Vector3(x1 + 0.1, y0 + H + 0.3, 0)));
}

/** Cœur d'Aether : cylindre de verre lumineux dans une cage de laiton. */
function reactor(k: Kit, m: RefMaterials) {
  const s = 0.53;
  const x = X(s),
    y = deckY(s);
  k.add(m.castIron, cyl(1.5, 1.7, 0.6, 24), M(x, y + 0.3, 0));
  k.add(m.brass, torus(1.55, 0.08, 28, 6), M(x, y + 0.62, 0, Math.PI / 2));
  k.add(m.aether, cyl(0.75, 0.75, 2.6, 20), M(x, y + 1.95, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.add(
      m.brass,
      cyl(0.05, 0.05, 2.9, 6),
      M(x + Math.cos(a) * 1.0, y + 2.05, Math.sin(a) * 1.0)
    );
  }
  for (const h of [0.75, 1.95, 3.15])
    k.add(m.brass, torus(1.0, 0.06, 28, 6), M(x, y + h + 0.0, 0, Math.PI / 2));
  k.add(m.brass, cyl(1.15, 0.4, 0.7, 20), M(x, y + 3.65, 0));
  k.add(m.brass, sphere(0.28, 8), M(x, y + 4.05, 0));
}

/** Gouvernail à roue, habitacle. */
function helm(k: Kit, m: RefMaterials) {
  const s = 0.33;
  const x = X(s) + 0.9,
    y = deckY(s);
  k.add(m.darkWood, box(0.3, 1.1, 0.3), M(x, y + 0.55, 0));
  const wy = y + 1.35;
  k.add(
    m.darkWood,
    torus(0.75, 0.05, 24, 6),
    M(x + 0.2, wy, 0, 0, Math.PI / 2, 0)
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(m.darkWood, cyl(0.025, 0.025, 1.8, 5), M(x + 0.2, wy, 0, a, 0, 0));
  }
  k.add(
    m.brass,
    cyl(0.12, 0.12, 0.18, 10),
    M(x + 0.2, wy, 0, 0, 0, Math.PI / 2)
  );
  // Habitacle du compas.
  k.add(m.darkWood, cyl(0.28, 0.32, 1.0, 10), M(x + 1.6, y + 0.5, 0));
  k.add(m.brass, sphere(0.3, 8, Math.PI / 2), M(x + 1.6, y + 1.0, 0));
}

/** Mât, hune, mât de hune, vergues. Renvoie les vergues (y, demi-longueur). */
function mast(k: Kit, m: RefMaterials, x: number, H: number) {
  const y0 = deckY(x / L + 0.5);
  const h1 = H * 0.58;
  k.add(m.spar, cyl(0.46, 0.34, h1, 14), M(x, y0 + h1 / 2, 0));
  k.add(m.brass, torus(0.5, 0.06, 16, 5), M(x, y0 + 0.3, 0, Math.PI / 2));
  for (const f of [0.3, 0.6, 0.9])
    k.add(
      m.castIron,
      torus(0.42 - f * 0.08, 0.04, 16, 4),
      M(x, y0 + h1 * f, 0, Math.PI / 2)
    );
  // Hune.
  const ty = y0 + h1;
  k.add(m.darkWood, box(2.6, 0.18, 3.4), M(x, ty, 0));
  k.add(m.brass, torus(0.08, 0.02, 4, 4), M(x, ty, 0));
  railing(
    k,
    m,
    [
      new THREE.Vector3(x - 1.25, ty, -1.65),
      new THREE.Vector3(x - 1.25, ty, 1.65),
      new THREE.Vector3(x + 1.25, ty, 1.65),
    ],
    0.7
  );
  const h2 = H - h1;
  k.add(m.spar, cyl(0.28, 0.13, h2, 12), M(x, ty + h2 / 2, 0));
  k.add(m.brass, sphere(0.2, 6), M(x, y0 + H + 0.1, 0));
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
    k.add(m.spar, cyl(0.17, 0.17, hl * 2, 10), M(x + 0.45, y, 0, Math.PI / 2));
    for (const sgn of [1, -1]) {
      k.add(
        m.spar,
        cyl(0.17, 0.07, 0.6, 8),
        M(x + 0.45, y, sgn * (hl + 0.3), (sgn * Math.PI) / 2)
      );
      // Marchepied sous la vergue.
      k.rope(
        new THREE.Vector3(x + 0.6, y - 0.6, 0),
        new THREE.Vector3(x + 0.6, y - 0.5, sgn * hl),
        0.02
      );
    }
    yards.push({ y, half: hl });
  }
  return { y0, top: y0 + H, hune: ty, yards };
}

/** Voile carrée gonflée entre deux hauteurs. */
function squareSail(
  pos: number[],
  uvs: number[],
  wts: number[],
  idx: number[],
  x: number,
  yTop: number,
  yBot: number,
  halfTop: number,
  halfBot: number,
  belly: number
) {
  const nu = 14,
    nv = 10;
  const base = pos.length / 3;
  const H = yTop - yBot;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      const v = j / nv;
      const half = halfTop + (halfBot - halfTop) * v;
      const sag = (1 - u * u) * 0.35 * v * v;
      const y = yTop - H * v + sag;
      const bulge =
        belly * Math.pow(1 - u * u, 0.7) * Math.sin(Math.PI * (0.12 + v * 0.8));
      pos.push(x + 0.6 + bulge, y, u * half);
      uvs.push(u * half, y);
      wts.push(Math.pow(1 - u * u, 0.7) * Math.sin(Math.PI * v * 0.9));
    }
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = base + j * w + i;
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
}

/** Voile triangulaire ou trapézoïdale (focs, brigantine) : 4 coins, creux latéral. */
function foreAftSail(
  pos: number[],
  uvs: number[],
  wts: number[],
  idx: number[],
  c: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  belly: number
) {
  // c : point d'amure (bas avant), point de drisse (haut avant), haut arrière, écoute (bas arrière).
  const nu = 10,
    nv = 10;
  const base = pos.length / 3;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu,
        v = j / nv;
      const front = c[0].clone().lerp(c[1], v);
      const back = c[3].clone().lerp(c[2], v);
      const p = front.lerp(back, u);
      const w =
        Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1 + 0.05));
      p.z += belly * w;
      pos.push(p.x, p.y, p.z);
      uvs.push(p.x, p.y);
      wts.push(w);
    }
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = base + j * w + i;
      idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
    }
}

function sailMesh(
  pos: number[],
  uvs: number[],
  wts: number[],
  idx: number[],
  mat: THREE.Material
) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('sw', new THREE.Float32BufferAttribute(wts, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Nacelle de sustentation : capot d'aspiration à volets, fût nervuré, cloche de tuyère. */
function liftPod(
  k: Kit,
  m: RefMaterials,
  s: number,
  side: number,
  size: number,
  nozzles: THREE.Vector3[]
) {
  const p = hullPt(s, 0.6, side);
  const x = p.x;
  const z = p.z + side * 2.4 * size;
  const y = p.y - 1.0;
  const R = 1.15 * size;
  const H = 3.4 * size;
  // Fût légèrement galbé, nervures longitudinales rivetées.
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    prof.push(
      new THREE.Vector2(
        R * (0.86 + 0.14 * Math.sin(f * Math.PI)),
        -H / 2 + H * f
      )
    );
  }
  const body = new THREE.LatheGeometry(prof, 32);
  const uv = body.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * R, uv.getY(i) * H);
  k.add(m.ironPlates, body, M(x, y, z));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    k.add(
      m.castIron,
      box(0.1, H * 0.82, 0.12),
      M(x + Math.cos(a) * (R + 0.04), y, z + Math.sin(a) * (R + 0.04), 0, -a, 0)
    );
  }
  for (const f of [-0.42, 0, 0.42])
    k.add(
      m.brass,
      torus(R * (0.86 + 0.14 * Math.cos(f * Math.PI)) + 0.05, 0.07, 32, 6),
      M(x, y + f * H, z, Math.PI / 2)
    );
  // Capot d'aspiration : couronne évasée et volets.
  const cy = y + H / 2;
  k.add(m.castIron, cyl(R * 0.9, R * 1.18, 0.7, 32, true), M(x, cy + 0.35, z));
  k.add(m.brass, torus(R * 1.18, 0.1, 32, 6), M(x, cy + 0.7, z, Math.PI / 2));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.add(
      m.castIron,
      box(0.05, 0.6, R * 0.9),
      M(
        x + Math.cos(a) * R * 0.48,
        cy + 0.42,
        z + Math.sin(a) * R * 0.48,
        0.35,
        -a,
        0
      )
    );
  }
  k.add(m.brass, sphere(0.32, 8, Math.PI / 2), M(x, cy + 0.45, z));
  // Cloche de tuyère évasée, anneau d'Aether.
  const by = y - H / 2;
  k.add(m.castIron, cyl(R * 0.82, R * 0.62, 0.5, 28, true), M(x, by - 0.25, z));
  k.add(
    m.copperSheath,
    cyl(R * 0.62, R * 0.98, 1.1, 28, true),
    M(x, by - 1.05, z)
  );
  k.add(m.brass, torus(R * 0.98, 0.09, 28, 6), M(x, by - 1.6, z, Math.PI / 2));
  k.add(m.aether, torus(R * 0.7, 0.08, 28, 6), M(x, by - 1.45, z, Math.PI / 2));
  nozzles.push(new THREE.Vector3(x, by - 1.6, z));
  // Bras de fixation (poutre en treillis) et conduite de vapeur.
  for (const dy of [0.95, -0.55]) {
    const a = new THREE.Vector3(x, y + dy * H * 0.5, z - side * R * 0.85);
    const b = hullPt(s, 0.6 + dy * 0.07, side);
    const d = new THREE.Vector3().subVectors(b, a);
    for (const dx of [-0.45, 0.45]) {
      const aa = a.clone().add(new THREE.Vector3(dx, 0, 0));
      const bb = b.clone().add(new THREE.Vector3(dx * 1.4, 0, 0));
      const dd = new THREE.Vector3().subVectors(bb, aa);
      k.add(
        m.castIron,
        box(0.18, dd.length(), 0.18),
        along(aa.clone().addScaledVector(dd, 0.5), dd)
      );
    }
    k.add(m.brass, cyl(0.3, 0.3, 0.12, 12), along(b.clone(), d));
  }
  const pa = new THREE.Vector3(x - side * 0, y + H * 0.2, z - side * R * 0.95);
  const pb = hullPt(s + 0.012, 0.55, side);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    pts.push(
      pa
        .clone()
        .lerp(pb, f)
        .add(
          new THREE.Vector3(
            Math.sin(f * Math.PI) * 0.6,
            -Math.sin(f * Math.PI) * 0.5,
            0
          )
        )
    );
  }
  k.add(m.brass, sweep(pts, 0.2, 0.2));
}

/** Hélice de poupe dans sa tuyère annulaire (l'hélice tourne : objet séparé). */
function sternProp(k: Kit, m: RefMaterials): THREE.Object3D {
  const x = X(0) - 1.9;
  const y = 2.6;
  const R = 2.0;
  k.add(
    m.ironPlates,
    cyl(R + 0.25, R + 0.15, 1.4, 32, true),
    M(x, y, 0, 0, 0, Math.PI / 2)
  );
  k.add(
    m.brass,
    torus(R + 0.25, 0.12, 36, 6),
    M(x + 0.7, y, 0, 0, Math.PI / 2, 0)
  );
  k.add(
    m.brass,
    torus(R + 0.15, 0.1, 36, 6),
    M(x - 0.7, y, 0, 0, Math.PI / 2, 0)
  );
  // Supports vers la coque.
  for (const a of [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6]) {
    const p0 = new THREE.Vector3(
      x,
      y + Math.sin(a) * (R + 0.2),
      Math.cos(a) * (R + 0.2)
    );
    const p1 = new THREE.Vector3(
      X(0.03),
      Math.max(keelY(0.03) + 0.4, y + Math.sin(a) * 1.4),
      Math.cos(a) * 1.6
    );
    const d = new THREE.Vector3().subVectors(p1, p0);
    k.add(
      m.castIron,
      cyl(0.14, 0.14, d.length(), 8),
      along(p0.clone().addScaledVector(d, 0.5), d)
    );
  }
  // Arbre.
  k.add(m.brass, cyl(0.18, 0.18, 2.6, 10), M(x + 1.2, y, 0, 0, 0, Math.PI / 2));
  // Hélice (mobile) : moyeu et quatre pales vrillées.
  const prop = new THREE.Group();
  prop.position.set(x, y, 0);
  const pk = new Kit();
  pk.add(
    m.brass,
    sphere(0.42, 10),
    M(-0.15, 0, 0, 0, 0, Math.PI / 2, new THREE.Vector3(1, 1.6, 1))
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = new THREE.BufferGeometry().copy(box(0.08, R * 0.9, 0.75));
    const mtx = M(0, 0, 0, a, 0, 0).multiply(M(0, R * 0.5, 0, 0, 0.5, 0));
    pk.add(m.brass, blade, mtx);
  }
  prop.add(pk.build(m.rope));
  return prop;
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

  // Écoutilles et caillebotis, tonneaux, caisses.
  for (const s of [0.47, 0.66, 0.79]) {
    const x = X(s),
      y = deckY(s);
    k.add(m.darkWood, box(2.2, 0.35, 2.0), M(x, y + 0.17, 0));
    for (let i = 0; i < 6; i++)
      k.add(
        m.castIron,
        box(0.05, 0.05, 1.8),
        M(x - 0.9 + i * 0.36, y + 0.36, 0)
      );
  }
  for (const [s, z] of [
    [0.68, 3.2],
    [0.69, -3.4],
    [0.56, 3.6],
  ] as const) {
    const x = X(s),
      y = deckY(s);
    k.add(m.darkWood, cyl(0.38, 0.38, 0.95, 12), M(x, y + 0.48, z));
    k.add(m.castIron, torus(0.39, 0.025, 12, 4), M(x, y + 0.2, z, Math.PI / 2));
    k.add(
      m.castIron,
      torus(0.39, 0.025, 12, 4),
      M(x, y + 0.76, z, Math.PI / 2)
    );
    k.add(
      m.hullWood,
      box(0.9, 0.7, 0.9),
      M(x + 0.9, y + 0.35, z * 0.9, 0, 0.3, 0)
    );
  }

  // Mâture.
  const masts = [
    { x: X(0.46), H: 30 },
    { x: X(0.6), H: 34 },
    { x: X(0.74), H: 30 },
  ].map((d) => ({ ...d, ...mast(k, m, d.x, d.H) }));

  // Beaupré.
  const bs = 0.985;
  const bp0 = new THREE.Vector3(X(bs) - 3, deckY(bs) + 0.8, 0);
  const bdir = new THREE.Vector3(1, 0.28, 0).normalize();
  const bp1 = bp0.clone().addScaledVector(bdir, 15);
  k.add(
    m.spar,
    cyl(0.34, 0.16, 15, 12),
    along(bp0.clone().addScaledVector(bdir, 7.5), bdir)
  );
  // Figure de proue : soc de laiton.
  const fs = hullPt(0.995, 0.85, 1).setZ(0);
  k.add(
    m.brass,
    cyl(0.05, 0.5, 3.2, 4),
    along(
      fs.clone().add(new THREE.Vector3(0.9, 0.4, 0)),
      new THREE.Vector3(1, 0.5, 0)
    )
  );

  // Voiles.
  const pos: number[] = [],
    uvs: number[] = [],
    wts: number[] = [],
    idx: number[] = [];
  masts.forEach((ms, mi) => {
    const ys = ms.yards;
    const courseBot = mi === 0 ? ms.y0 + 7.6 : ms.y0 + 4.2;
    squareSail(
      pos,
      uvs,
      wts,
      idx,
      ms.x,
      ys[0].y - 0.2,
      courseBot,
      ys[0].half * 0.96,
      ys[0].half * 1.05,
      1.9
    );
    squareSail(
      pos,
      uvs,
      wts,
      idx,
      ms.x,
      ys[1].y - 0.2,
      ys[0].y + 0.25,
      ys[1].half * 0.95,
      ys[0].half * 0.98,
      1.5
    );
    squareSail(
      pos,
      uvs,
      wts,
      idx,
      ms.x,
      ys[2].y - 0.15,
      ys[1].y + 0.25,
      ys[2].half * 0.95,
      ys[1].half * 0.97,
      1.1
    );
  });
  // Focs entre le mât de misaine et le beaupré.
  const fm = masts[2];
  for (let j = 0; j < 2; j++) {
    const tack = bp0.clone().lerp(bp1, 0.55 + j * 0.42);
    const head = new THREE.Vector3(
      fm.x + 0.3,
      fm.y0 + fm.H * (0.62 + j * 0.2),
      0
    );
    const clew = new THREE.Vector3(fm.x + 3 + j * 1.5, fm.y0 + 2.2 + j * 2, 0);
    foreAftSail(
      pos,
      uvs,
      wts,
      idx,
      [tack, head, head.clone().add(new THREE.Vector3(-0.2, -0.2, 0)), clew],
      0.9
    );
  }
  const sails = sailMesh(pos, uvs, wts, idx, m.canvas);

  // Gréement dormant : haubans et enfléchures, galhaubans, étais.
  masts.forEach((ms, mi) => {
    const s = ms.x / L + 0.5;
    for (const side of [1, -1]) {
      const chain: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const cs = s + (i - 3) * 0.022;
        chain.push(
          hullPt(cs, 1.0, side).add(new THREE.Vector3(0, 0.2, side * 0.35))
        );
      }
      const top = new THREE.Vector3(ms.x, ms.hune - 0.3, side * 0.4);
      chain.forEach((c) => k.rope(c, top, 0.04));
      // Enfléchures (échelons).
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
      // Haubans de hune.
      const ttop = new THREE.Vector3(ms.x, ms.top - 2.5, side * 0.2);
      for (const dx of [-1.1, 0, 1.1])
        k.rope(
          new THREE.Vector3(ms.x + dx, ms.hune + 0.1, side * 1.6),
          ttop,
          0.03
        );
      // Galhauban vers l'arrière.
      k.rope(
        hullPt(s - 0.11, 1.0, side).add(new THREE.Vector3(0, 0.2, side * 0.35)),
        new THREE.Vector3(ms.x, ms.top - 1, 0),
        0.03
      );
      // Bras de vergue.
      ms.yards.forEach((y) => {
        k.rope(
          new THREE.Vector3(ms.x + 0.45, y.y, side * y.half),
          new THREE.Vector3(ms.x - 6, y.y - 3 - mi, side * y.half * 0.6),
          0.02
        );
      });
    }
    // Étais vers l'avant.
    const next = masts[mi + 1];
    const to = next
      ? new THREE.Vector3(next.x, next.y0 + 1, 0)
      : bp0.clone().lerp(bp1, 0.9);
    k.rope(new THREE.Vector3(ms.x, ms.hune + 0.2, 0), to, 0.05);
    const to2 = next ? new THREE.Vector3(next.x, next.hune, 0) : bp1.clone();
    k.rope(new THREE.Vector3(ms.x, ms.top - 0.5, 0), to2, 0.035);
  });

  // Pavillon de poupe et flammes en tête de mât.
  const fpos: number[] = [],
    fuv: number[] = [],
    fw: number[] = [],
    fidx: number[] = [];
  const flag = (
    x0: number,
    y0: number,
    len: number,
    h: number,
    taper: boolean
  ) => {
    const base = fpos.length / 3;
    const nu = 12,
      nv = 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu,
          v = j / nv;
        const hh = taper ? h * (1 - u * 0.9) : h;
        fpos.push(x0 - u * len, y0 - (v - 0.5) * hh, 0);
        fuv.push(u, v);
        fw.push(u);
      }
    const w = nu + 1;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * w + i;
        fidx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      }
  };
  const sternFlagX = X(0) - 0.5;
  k.add(m.spar, cyl(0.07, 0.05, 6, 8), M(sternFlagX, deckY(0) + 5.6 + 3, 0));
  flag(sternFlagX - 0.05, deckY(0) + 5.6 + 5.2, 3.6, 2.2, false);
  masts.forEach((ms) => flag(ms.x - 0.1, ms.top - 0.4, 5, 0.8, true));
  const flagMat = new THREE.MeshStandardMaterial({
    color: '#8f1d1d',
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const flags = sailMesh(fpos, fuv, fw, fidx, flagMat);

  // Propulsion.
  liftPod(k, m, 0.3, 1, 1.05, nozzles);
  liftPod(k, m, 0.3, -1, 1.05, nozzles);
  liftPod(k, m, 0.72, 1, 1, nozzles);
  liftPod(k, m, 0.72, -1, 1, nozzles);
  const prop = sternProp(k, m);

  const group = k.build(m.rope);
  group.add(sails, flags, prop);
  return { group, props: [prop], lights, smoke, steam, nozzles, sails, flags };
}
