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

const smooth01 = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Profil de dune : longue pente au vent, crête vive, face d'avalanche raide. */
function duneProfile(p: number, crest = 0.78) {
  const f = p - Math.floor(p);
  return f < crest ? smooth01(f / crest) : smooth01((1 - f) / (1 - crest));
}

/** Relief du sol : vallonnements, dunes sculptées à crêtes sinueuses, cuvettes. */
export function groundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  // Repère du vent (dunes transverses, orientées en biais).
  const wx = x * 0.8 + z * 0.6,
    wz = -x * 0.6 + z * 0.8;
  const warp =
    (fbm(x * 0.0021, z * 0.0021) - 0.5) * 240 +
    (fbm(x * 0.007 + 5, z * 0.007) - 0.5) * 50;
  const amp = 7 + 18 * fbm(x * 0.0014 + 9, z * 0.0014 + 3, 3);
  const along =
    0.55 + 0.45 * Math.sin(wz / 230 + fbm(x * 0.003, z * 0.003 + 7) * 4);
  const big = duneProfile((wx + warp) / 150) * amp * along;
  const warp2 = (fbm(x * 0.012 + 2, z * 0.012) - 0.5) * 30;
  const small =
    duneProfile((wx * 0.9 + wz * 0.3 + warp2) / 36, 0.72) *
    (0.6 + 1.4 * fbm(x * 0.01, z * 0.01 + 4, 2));
  const bowl =
    -Math.pow(Math.max(0, fbm(x * 0.0045 + 1, z * 0.0045 + 8, 3) - 0.56), 1.4) *
    60;
  const roll = (fbm(x * 0.0009 + 3, z * 0.0009 + 1, 3) - 0.5) * 46;
  const fine = (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 0.8;
  // Aplani sous le navire, pleine sculpture au-delà.
  const calm = 0.1 + 0.9 * smooth01((r - 45) / 140);
  return (
    (big + small + bowl) * calm +
    roll * (0.2 + 0.8 * smooth01((r - 80) / 400)) +
    fine
  );
}

function ground(m: RefMaterials): THREE.Mesh {
  const size = 7200,
    n = 360;
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // Mailles très resserrées près du centre (détail là où l'on regarde).
    let x = p.getX(i),
      z = p.getZ(i);
    const r = Math.hypot(x, z) / (size / 2);
    const k = Math.pow(r, 2.1) / Math.max(r, 1e-6);
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
 * Butte ou éperon : pourtour irrégulier (allongé, orienté), strates en corniche,
 * ravines irrégulières, éboulis au pied, rebord sommital émoussé.
 */
/** Finesse des buttes (le jeu les allège : elles défilent au loin). */
export const relief = { res: 1 };

export function butte(
  m: RefMaterials,
  cx: number,
  cz: number,
  R: number,
  H: number,
  seed: number,
  elong = 1,
  rot = 0,
  /** Pied imposé (sinon : posé sur le relief du labo). */
  base0?: number
): THREE.Mesh {
  const na = Math.round(180 * relief.res),
    ny = Math.round(72 * relief.res),
    nr = 8;
  const pos: number[] = [],
    uvs: number[] = [],
    cols: number[] = [],
    idx: number[] = [];
  const col = new THREE.Color();
  let base = base0 ?? Infinity;
  if (base0 === undefined)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      base = Math.min(
        base,
        groundY(cx + Math.cos(a) * R * elong * 1.2, cz + Math.sin(a) * R * 1.2)
      );
    }
  if (base0 === undefined) base -= 6;
  const top = (a: number) =>
    H *
      (0.72 +
        0.5 *
          fbm(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3 + seed * 0.7, 3)) +
    (fbm(Math.cos(a) * 7 + seed, Math.sin(a) * 7, 3) - 0.5) * 9;
  // Gradin principal : la butte se rétrécit au-dessus d'une grande corniche.
  const bench = 0.38 + 0.25 * hash(seed, 3);
  const benchW = R * (0.08 + 0.12 * hash(seed, 4));
  const cr = Math.cos(rot),
    sr = Math.sin(rot);
  const rows = ny + nr;
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const rb = R * (0.7 + 0.6 * fbm(ca * 1.6 + seed, sa * 1.6 + seed, 5));
      const th = top(a);
      const gully =
        Math.pow(fbm(a * 9 + seed, seed * 0.3, 3), 2.5) *
        22 *
        (0.3 + 0.7 * Math.min(1, j / ny));
      let y: number, r: number;
      if (j <= ny) {
        y = (th * j) / ny;
        const talus =
          y < th * 0.38 ? Math.pow(1 - y / (th * 0.38), 2.2) * R * 0.45 : 0;
        const taper = 1 - 0.16 * (y / th);
        const step = benchW * smooth01((y - th * bench) / 4);
        r =
          rb * taper -
          step +
          strata(y + Math.sin(a * 2 + seed) * 2, seed) -
          gully +
          talus +
          (fbm(a * 30, y * 0.15 + seed, 2) - 0.5) * 2.2;
      } else {
        // Rebord émoussé puis plateau légèrement bombé.
        const f = (j - ny) / nr;
        const rim = rb * 0.84 - benchW + strata(th, seed) - gully;
        r = rim * (1 - f) * (1 - 0.15 * Math.sin(f * Math.PI * 0.5));
        y =
          th +
          Math.sin(f * Math.PI * 0.5) * 4 +
          (fbm(ca * 4 + seed, sa * 4) - 0.5) * 3 * f;
      }
      const lx = ca * r * elong,
        lz = sa * r;
      const x = cx + lx * cr - lz * sr,
        z = cz + lx * sr + lz * cr;
      pos.push(x, base + y, z);
      // Plateau : projection horizontale (pas de texture étirée).
      if (j > ny) uvs.push(x * 0.6, z * 0.6);
      else uvs.push(a * R * (1 + elong) * 0.5, y);
      layerColor(y + Math.sin(a * 2 + seed) * 2, seed, col);
      cols.push(col.r, col.g, col.b);
    }
  const w = na + 1;
  for (let j = 0; j < rows; j++)
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

/** Bloc érodé : arrondi, à demi enfoui, quelques plans de strate adoucis. */
export function boulder(
  m: RefMaterials,
  x: number,
  z: number,
  r: number,
  seed: number
): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(r, relief.res < 1 ? 3 : 5);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d =
      1 +
      (fbm(n.x * 1.3 + seed, n.y * 1.3 + n.z * 1.3) - 0.5) * 0.55 +
      (fbm(n.x * 5, n.z * 5 + seed, 2) - 0.5) * 0.08;
    v.multiplyScalar(d);
    v.y *= 0.6;
    // Litage doux : légères marches arrondies.
    const st = r * 0.22;
    const q = v.y / st;
    v.y =
      (Math.floor(q) + smooth01((q - Math.floor(q) - 0.35) / 0.3)) * st * 0.35 +
      v.y * 0.65;
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
  mesh.position.set(x, groundY(x, z) - r * 0.18, z);
  mesh.rotation.set(
    (hash(seed * 7, 1) - 0.5) * 0.3,
    seed,
    (hash(seed * 7, 2) - 0.5) * 0.3
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Chaînes lointaines : silhouettes de crêtes noyées dans la brume. */
export type RangeStyle =
  | 'mesas'
  | 'aiguilles'
  | 'domes'
  | 'falaises'
  | 'cristaux';

/** Chaînes lointaines, silhouette selon le paysage. */
export function ranges(
  style: RangeStyle | 'ref' = 'ref',
  radius = 2900
): THREE.Mesh {
  const na = 720,
    nh = 14;
  const pos: number[] = [],
    hh: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= nh; j++)
    for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2;
      const ridge = (rr: number) => {
        let s = 0,
          amp = 1,
          f = 1;
        for (let o = 0; o < 5; o++) {
          s +=
            amp *
            (1 -
              Math.abs(
                noise(Math.cos(a) * 6 * f + rr, Math.sin(a) * 6 * f + o * 3.1) *
                  2 -
                  1
              ));
          amp *= 0.5;
          f *= 2.1;
        }
        return s / 1.9;
      };
      const R =
        radius +
        (noise(Math.cos(a) * 3, Math.sin(a) * 3) - 0.5) * radius * 0.17;
      let peak =
        60 +
        230 *
          Math.pow(ridge(11), 2.2) *
          (0.5 + noise(Math.cos(a) * 2 + 4, Math.sin(a) * 2));
      if (style === 'mesas') {
        // Tables : sommets tranchés à des hauteurs étagées.
        const lvl = 70 + 110 * noise(Math.cos(a) * 9 + 2, Math.sin(a) * 9);
        peak = Math.min(peak * 1.3, lvl);
      } else if (style === 'aiguilles')
        peak = 50 + 300 * Math.pow(ridge(23), 4);
      else if (style === 'domes')
        peak =
          40 + 120 * Math.pow(noise(Math.cos(a) * 7, Math.sin(a) * 7 + 3), 1.5);
      else if (style === 'falaises')
        peak = Math.min(
          220,
          120 + 200 * noise(Math.cos(a) * 4 + 1, Math.sin(a) * 4)
        );
      else if (style === 'cristaux') {
        const sp = Math.pow(
          Math.abs(
            Math.sin(a * 140 + noise(Math.cos(a) * 20, Math.sin(a) * 20) * 9)
          ),
          14
        );
        peak = 50 + 90 * ridge(5) + 260 * sp;
      }
      const v = j / nh;
      // Pente : de la base (au loin, plus large) au sommet.
      const y = -40 + (peak + 40) * Math.pow(v, 0.85);
      const rr = R + (1 - v) * 260;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      hh.push(v);
    }
  const w = na + 1;
  for (let j = 0; j < nh; j++)
    for (let i = 0; i < na; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: new THREE.Color('#d9a07a') },
      uShade: { value: new THREE.Color('#7d5a5a') },
      uHaze: { value: new THREE.Color('#e0a07a') },
    },
    vertexShader: /* glsl */ `
attribute float aH;
varying vec3 vN; varying float vH; varying vec3 vW;
void main(){ vN = normal; vH = aH; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
uniform vec3 uSun, uLit, uShade, uHaze;
varying vec3 vN; varying float vH; varying vec3 vW;
void main(){
  float l = clamp(dot(normalize(vN), uSun) * .8 + .25, 0., 1.);
  vec3 c = mix(uShade, uLit, l);
  // Perspective atmosphérique : la base se fond dans la brume.
  float haze = .5 + .45 * (1. - smoothstep(0., .9, vH));
  gl_FragColor = vec4(mix(c, uHaze, haze), 1.);
}`,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function buildDesert(m: RefMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(ground(m));
  // Canyon cassé : buttes et éperons en chapelet, brèches entre eux.
  const chain = (
    z0: number,
    x0: number,
    x1: number,
    seed: number,
    hMin: number,
    hMax: number,
    rMin: number,
    rMax: number
  ) => {
    let x = x0;
    let k = 0;
    while (x < x1) {
      const r = rMin + (rMax - rMin) * hash(k, seed);
      const el = 1.3 + hash(k, seed + 1) * 1.3;
      const gap = hash(k, seed + 2) < 0.28;
      if (!gap) {
        const z =
          z0 + (hash(k, seed + 3) - 0.5) * 70 + Math.sin(x * 0.004 + seed) * 40;
        const h = hMin + (hMax - hMin) * hash(k, seed + 4);
        g.add(
          butte(
            m,
            x,
            z,
            r,
            h,
            seed + k * 7,
            el,
            (hash(k, seed + 5) - 0.5) * 0.6
          )
        );
      }
      x += r * el * (gap ? 1.6 : 1.25);
      k++;
    }
  };
  chain(-250, -1100, 1100, 11, 70, 115, 45, 80);
  chain(-380, -1300, 1300, 37, 90, 140, 60, 100);
  chain(540, -1300, 1300, 23, 55, 90, 50, 85);
  // Buttes isolées dans la plaine.
  const lone: [number, number, number, number, number][] = [
    [-430, 40, 34, 62, 0.8],
    [480, 120, 26, 48, 2.1],
    [260, 300, 30, 44, -0.6],
    [-640, 250, 42, 58, 1.2],
  ];
  lone.forEach(([x, z, r, h, rot], i) =>
    g.add(butte(m, x, z, r, h, 91 + i * 13, 1.2, rot))
  );
  // Amas de blocs au pied des buttes, blocs épars dans la plaine.
  for (let i = 0; i < 70; i++) {
    const cluster = Math.floor(i / 5);
    const cxs = (hash(cluster, 1) - 0.5) * 1400;
    const czs =
      hash(cluster, 6) < 0.6
        ? -200 + hash(cluster, 2) * 50
        : (hash(cluster, 3) - 0.5) * 700;
    const x = cxs + (hash(i, 7) - 0.5) * 40;
    const z = czs + (hash(i, 8) - 0.5) * 30;
    if (Math.hypot(x, z) < 70) continue;
    const r = 1.2 + Math.pow(hash(i, 4), 2) * 9;
    g.add(boulder(m, x, z, r, i * 1.7 + 0.3));
  }
  const far = ranges();
  far.name = 'ranges';
  g.add(far);
  return g;
}
