import * as THREE from 'three';
import type { RefMaterials } from './materials';

// Désert de référence : dunes, falaises stratifiées (couches en surplomb,
// ravines, éboulis au pied), mesas lointaines et blocs éboulés.

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy),
    c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0,
    a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    a *= 0.5;
  }
  return s;
}

/** Relief du sol : dunes croisées, aplani sous le navire. */
export function groundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  const dunes =
    3.2 * Math.sin(x * 0.018 + Math.sin(z * 0.011) * 2) +
    2.1 * Math.sin(z * 0.027 + x * 0.009) +
    (fbm(x * 0.006, z * 0.006) - 0.5) * 14;
  const fine = (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.2;
  const calm = 0.25 + 0.75 * Math.min(1, Math.max(0, (r - 40) / 160));
  return (dunes * calm + fine) * 1.0;
}

function ground(m: RefMaterials): THREE.Mesh {
  const size = 2600,
    n = 320;
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // Mailles resserrées près du centre (détail là où l'on regarde).
    let x = p.getX(i),
      z = p.getZ(i);
    const r = Math.hypot(x, z) / (size / 2);
    const k = Math.pow(r, 1.6) / Math.max(r, 1e-6);
    x *= k;
    z *= k;
    p.setXYZ(i, x, groundY(x, z), z);
    uv.setXY(i, x, z);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m.sand);
  mesh.receiveShadow = true;
  return mesh;
}

/** Teinte d'une couche (crème, ocre, rouille, brun). */
const BANDS = [
  '#f0dcc0',
  '#d9a26c',
  '#a8573a',
  '#c9875a',
  '#8a4e36',
  '#e8c39a',
  '#b56a44',
].map((h) => new THREE.Color(h));
function layerColor(y: number, seed: number, out: THREE.Color) {
  const k = strataIndex(y, seed);
  const a = BANDS[Math.floor(hash(k, seed + 3) * BANDS.length)];
  out.copy(a).multiplyScalar(0.92 + hash(k, seed + 5) * 0.16);
  return out;
}
function strataIndex(y: number, seed: number) {
  let acc = 0,
    k = 0;
  while (acc + 2.5 + 4.5 * hash(k, seed) < y) {
    acc += 2.5 + 4.5 * hash(k, seed);
    k++;
  }
  return k;
}

/** Profil des strates : retrait (m) selon la hauteur, couches en corniche. */
function strata(y: number, seed: number) {
  // Épaisseurs irrégulières de 2,5 à 7 m.
  let acc = 0,
    k = 0;
  while (acc + 2.5 + 4.5 * hash(k, seed) < y) {
    acc += 2.5 + 4.5 * hash(k, seed);
    k++;
  }
  const th = 2.5 + 4.5 * hash(k, seed);
  const f = (y - acc) / th;
  const hard = hash(k, seed + 7);
  // Couche dure : corniche saillante en haut ; couche tendre : creusée.
  const lip = hard > 0.45 ? Math.pow(f, 3) * 1.6 : -Math.sin(f * Math.PI) * 1.2;
  return lip + (hard - 0.5) * 1.4;
}

/**
 * Falaise le long d'une ligne (x de x0 à x1, face tournée vers +z), base à zBase.
 * La face est une grille (x, y) déplacée en z.
 */
function cliffWall(
  m: RefMaterials,
  x0: number,
  x1: number,
  zBase: number,
  H: number,
  seed: number,
  facing = 1
): THREE.Group {
  const nx = 260,
    ny = 120;
  const pos: number[] = [],
    uvs: number[] = [],
    cols: number[] = [],
    idx: number[] = [];
  const col = new THREE.Color();
  const depthAt = (x: number, y: number) => {
    const gully =
      Math.pow(Math.abs(Math.sin(x * 0.045 + fbm(x * 0.01, seed) * 6)), 3) *
      7 *
      (0.4 + 0.6 * (y / H));
    const bulge = (fbm(x * 0.008, seed + 3) - 0.5) * 40;
    const rough = (fbm(x * 0.12, y * 0.12 + seed) - 0.5) * 1.6;
    const talus = y < H * 0.28 ? Math.pow(1 - y / (H * 0.28), 1.8) * 26 : 0;
    return bulge - gully + strata(y, seed) + rough + talus;
  };
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const top = H + (fbm(x * 0.01, seed + 9) - 0.5) * 12;
      const y = (top * j) / ny;
      const gy = groundY(x, zBase) - 3;
      const z = zBase + facing * depthAt(x, y);
      pos.push(x, gy + y, z);
      uvs.push(x, gy + y);
      // Couches légèrement inclinées et ondulées : la teinte suit la strate.
      layerColor(y + Math.sin(x * 0.004 + seed) * 6 + x * 0.01, seed, col);
      cols.push(col.r, col.g, col.b);
    }
  const w = nx + 1;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * w + i;
      if (facing > 0) idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      else idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const face = new THREE.Mesh(g, m.cliff);
  face.castShadow = true;
  face.receiveShadow = true;
  // Plateau sommital.
  const cap: number[] = [],
    cuv: number[] = [],
    cidx: number[] = [];
  const depth = 300;
  for (let j = 0; j <= 1; j++)
    for (let i = 0; i <= nx; i++) {
      const a = (ny * w + i) * 3;
      const x = pos[a],
        y = pos[a + 1],
        z = pos[a + 2] - facing * (j * depth);
      cap.push(x, y + (j ? 6 : 0), z);
      cuv.push(x, z);
    }
  for (let i = 0; i < nx; i++) {
    const a = i,
      b = i + w;
    if (facing > 0) cidx.push(a, a + 1, b, a + 1, b + 1, b);
    else cidx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  cg.setIndex(cidx);
  cg.computeVertexNormals();
  const capMesh = new THREE.Mesh(cg, m.rock);
  capMesh.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(face, capMesh);
  return grp;
}

/** Mesa : pourtour irrégulier, mêmes strates. */
function mesa(
  m: RefMaterials,
  cx: number,
  cz: number,
  R: number,
  H: number,
  seed: number
): THREE.Mesh {
  const na = 160,
    ny = 60;
  const pos: number[] = [],
    uvs: number[] = [],
    idx: number[] = [];
  const cols: number[] = [];
  const col = new THREE.Color();
  const top = (a: number) =>
    H + (noise(Math.cos(a) * 3 + seed, Math.sin(a) * 3) - 0.5) * 10;
  for (let j = 0; j <= ny + 1; j++)
    for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const rb = R * (0.75 + 0.5 * fbm(ca * 1.5 + seed, sa * 1.5 + seed, 4));
      const th = top(a);
      let y: number, r: number;
      if (j <= ny) {
        y = (th * j) / ny;
        const gully = Math.pow(Math.abs(Math.sin(a * 23 + seed)), 4) * 6;
        const talus =
          y < th * 0.3 ? Math.pow(1 - y / (th * 0.3), 1.7) * R * 0.28 : 0;
        r = rb + strata(y, seed) - gully + talus;
      } else {
        y = th + 3;
        r = 0;
      }
      const x = cx + ca * r,
        z = cz + sa * r;
      pos.push(x, groundY(cx, cz) - 4 + y, z);
      uvs.push((a * R) % 4000, y);
      layerColor(y + Math.sin(a * 2 + seed) * 3, seed, col);
      cols.push(col.r, col.g, col.b);
    }
  const w = na + 1;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i < na; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m.cliff);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Bloc éboulé : icosaèdre déformé, projection planaire des UV. */
function boulder(
  m: RefMaterials,
  x: number,
  z: number,
  r: number,
  seed: number
): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(r, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 1 + (fbm(n.x * 2 + seed, n.y * 2 + n.z * 2) - 0.5) * 0.7;
    v.multiplyScalar(d);
    v.y *= 0.62;
    // Strates aussi dans les blocs : faces planes horizontales.
    v.y = Math.round(v.y / (r * 0.18)) * r * 0.18 * 0.5 + v.y * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
    uv[i * 2] = v.x + v.z;
    uv[i * 2 + 1] = v.y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const c = BANDS[Math.floor(hash(Math.floor(seed * 10), 9) * BANDS.length)];
  const cc = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) cc.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m.cliff);
  mesh.position.set(x, groundY(x, z) + r * 0.15, z);
  mesh.rotation.y = seed;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildDesert(m: RefMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(ground(m));
  // Grande falaise du canyon, en arrière-plan proche.
  g.add(cliffWall(m, -700, 700, -230, 95, 11, 1));
  // Rive opposée, plus loin et plus basse.
  g.add(cliffWall(m, -900, 900, 520, 70, 23, -1));
  // Mesas et buttes.
  const mesas: [number, number, number, number][] = [
    [-420, -60, 70, 80],
    [520, -120, 55, 110],
    [760, 260, 90, 75],
    [-780, 300, 110, 60],
    [260, 330, 38, 54],
  ];
  mesas.forEach(([x, z, R, H], i) => g.add(mesa(m, x, z, R, H, 31 + i * 13)));
  // Éboulis au pied de la falaise et blocs épars.
  for (let i = 0; i < 46; i++) {
    const x = (hash(i, 1) - 0.5) * 900;
    const nearCliff = i < 30;
    const z = nearCliff ? -200 + hash(i, 2) * 60 : (hash(i, 3) - 0.5) * 500;
    if (Math.hypot(x, z) < 60) continue;
    const r = nearCliff ? 2 + hash(i, 4) * 9 : 1 + hash(i, 5) * 4;
    g.add(boulder(m, x, z, r, i * 1.7));
  }
  return g;
}
