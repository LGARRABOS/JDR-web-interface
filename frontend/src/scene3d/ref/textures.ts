import * as THREE from 'three';

// Matériaux de la scène de référence : matériaux physiques natifs de Three,
// texturés soit par les photos Poly Haven (détail d'albédo × couleur choisie,
// normale, rugosité), soit par des textures calculées ici (laiton brossé,
// cuivre martelé, tôles rivetées, toile des voiles…). Tout est carrelable.

const srgb = (l: number) =>
  l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export function hexLin(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [lin(c.r), lin(c.g), lin(c.b)];
}

// --- Bruit périodique (carrelable) -----------------------------------------

function h2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Bruit de valeur de période (px, py) cellules. */
function pnoise(x: number, y: number, px: number, py: number, seed = 0) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  const m = (a: number, p: number) => ((a % p) + p) % p;
  const x0 = m(ix, px),
    x1 = m(ix + 1, px),
    y0 = m(iy, py),
    y1 = m(iy + 1, py);
  const a = h2(x0, y0, seed),
    b = h2(x1, y0, seed),
    c = h2(x0, y1, seed),
    d = h2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** fbm périodique : u, v dans [0,1), fréquences entières fx, fy. */
export function pfbm(
  u: number,
  v: number,
  fx: number,
  fy: number,
  oct = 4,
  seed = 0
) {
  let s = 0,
    a = 0.5,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * pnoise(u * fx, v * fy, fx, fy, seed + i * 17);
    n += a;
    fx *= 2;
    fy *= 2;
    a *= 0.5;
  }
  return s / n;
}

// --- Fabrication des textures -----------------------------------------------

interface Texel {
  /** couleur linéaire */
  r: number;
  g: number;
  b: number;
  /** relief en mètres */
  h: number;
  rough: number;
  metal: number;
  /** auto-illumination (0..1), pour les vitres éclairées */
  e?: number;
}

export interface TexSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** G = rugosité, B = métal (convention de Three) */
  ormMap: THREE.Texture;
  /** taille d'un carreau en mètres */
  tile: [number, number];
}

function canvasTex(
  data: Uint8ClampedArray,
  size: number,
  color: boolean
): THREE.Texture {
  const t = new THREE.DataTexture(
    new Uint8Array(data),
    size,
    size,
    THREE.RGBAFormat
  );
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** Texture calculée : fn(u, v) sur [0,1)², carreau de tile mètres. */
export function bake(
  size: number,
  tile: [number, number],
  fn: (u: number, v: number) => Texel
): TexSet {
  const n = size * size;
  const col = new Uint8ClampedArray(n * 4);
  const nrm = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const hgt = new Float32Array(n);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const t = fn((x + 0.5) / size, (y + 0.5) / size);
      col[i * 4] = srgb(Math.min(1, t.r)) * 255;
      col[i * 4 + 1] = srgb(Math.min(1, t.g)) * 255;
      col[i * 4 + 2] = srgb(Math.min(1, t.b)) * 255;
      col[i * 4 + 3] = 255;
      hgt[i] = t.h;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = Math.min(1, Math.max(0.03, t.rough)) * 255;
      orm[i * 4 + 2] = Math.min(1, Math.max(0, t.metal)) * 255;
      orm[i * 4 + 3] = 255;
    }
  // Normale par différences finies (périodique).
  const sx = tile[0] / size,
    sy = tile[1] / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xl = y * size + ((x + size - 1) % size),
        xr = y * size + ((x + 1) % size);
      const yd = ((y + size - 1) % size) * size + x,
        yu = ((y + 1) % size) * size + x;
      const dx = (hgt[xr] - hgt[xl]) / (2 * sx);
      const dy = (hgt[yu] - hgt[yd]) / (2 * sy);
      const l = Math.hypot(dx, dy, 1);
      nrm[i * 4] = (-dx / l) * 127.5 + 127.5;
      nrm[i * 4 + 1] = (-dy / l) * 127.5 + 127.5;
      nrm[i * 4 + 2] = (1 / l) * 127.5 + 127.5;
      nrm[i * 4 + 3] = 255;
    }
  return {
    map: canvasTex(col, size, true),
    normalMap: canvasTex(nrm, size, false),
    ormMap: canvasTex(orm, size, false),
    tile,
  };
}

// --- Photos Poly Haven ------------------------------------------------------

export interface Photo {
  size: number;
  /** détail d'albédo linéaire (moyenne 1) par canal */
  det: Float32Array;
  /** normale X, Y dans [-1,1] et rugosité */
  nx: Float32Array;
  ny: Float32Array;
  rough: Float32Array;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(url));
    im.src = url;
  });
}

function pixels(im: HTMLImageElement, size: number): Uint8ClampedArray {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export async function loadPhoto(
  base: string,
  name: string,
  size: number
): Promise<Photo> {
  const [a, b] = await Promise.all([
    loadImage(`${base}${name}_a.jpg`),
    loadImage(`${base}${name}_b.jpg`),
  ]);
  const pa = pixels(a, size),
    pb = pixels(b, size);
  const n = size * size;
  const det = new Float32Array(n * 3);
  const nx = new Float32Array(n),
    ny = new Float32Array(n),
    rough = new Float32Array(n);
  // Lignes retournées : v = 0 en bas de la photo (convention des UV).
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const s = ((size - 1 - y) * size + x) * 4;
      for (let c = 0; c < 3; c++)
        det[i * 3 + c] = Math.pow(pa[s + c] / 255, 2.2) * 2;
      nx[i] = (pb[s] / 255) * 2 - 1;
      ny[i] = (pb[s + 1] / 255) * 2 - 1;
      rough[i] = pb[s + 2] / 255;
    }
  return { size, det, nx, ny, rough };
}

/** Texture issue d'une photo, teintée ; `mod` peut retoucher chaque texel. */
export function fromPhoto(
  p: Photo,
  color: string,
  tile: [number, number],
  o: {
    metal?: number;
    roughMul?: number;
    roughAdd?: number;
    normal?: number;
    contrast?: number;
  } = {},
  mod?: (
    u: number,
    v: number,
    t: { r: number; g: number; b: number; rough: number; metal: number },
    i: number
  ) => { h?: number } | void
): TexSet {
  const size = p.size;
  const n = size * size;
  const [cr, cg, cb] = hexLin(color);
  const col = new Uint8ClampedArray(n * 4);
  const nrm = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const extra = new Float32Array(n);
  let hasExtra = false;
  const k = o.normal ?? 1;
  const ct = o.contrast ?? 1;
  for (let i = 0; i < n; i++) {
    const t = {
      r: cr * (1 + (p.det[i * 3] - 1) * ct),
      g: cg * (1 + (p.det[i * 3 + 1] - 1) * ct),
      b: cb * (1 + (p.det[i * 3 + 2] - 1) * ct),
      rough: p.rough[i] * (o.roughMul ?? 1) + (o.roughAdd ?? 0),
      metal: o.metal ?? 0,
    };
    if (mod) {
      const r = mod(
        ((i % size) + 0.5) / size,
        (Math.floor(i / size) + 0.5) / size,
        t,
        i
      );
      if (r && r.h) {
        extra[i] = r.h;
        hasExtra = true;
      }
    }
    col[i * 4] = srgb(Math.min(1, Math.max(0, t.r))) * 255;
    col[i * 4 + 1] = srgb(Math.min(1, Math.max(0, t.g))) * 255;
    col[i * 4 + 2] = srgb(Math.min(1, Math.max(0, t.b))) * 255;
    col[i * 4 + 3] = 255;
    orm[i * 4] = 255;
    orm[i * 4 + 1] = Math.min(1, Math.max(0.03, t.rough)) * 255;
    orm[i * 4 + 2] = Math.min(1, Math.max(0, t.metal)) * 255;
    orm[i * 4 + 3] = 255;
  }
  // Normale de la photo, plus le relief ajouté (rivets, joints…).
  const sx = tile[0] / size,
    sy = tile[1] / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let dx = 0,
        dy = 0;
      if (hasExtra) {
        const xl = y * size + ((x + size - 1) % size),
          xr = y * size + ((x + 1) % size);
        const yd = ((y + size - 1) % size) * size + x,
          yu = ((y + 1) % size) * size + x;
        dx = (extra[xr] - extra[xl]) / (2 * sx);
        dy = (extra[yu] - extra[yd]) / (2 * sy);
      }
      let ax = p.nx[i] * k - dx,
        ay = p.ny[i] * k - dy;
      const az = Math.sqrt(
        Math.max(0.05, 1 - Math.min(0.95, p.nx[i] ** 2 + p.ny[i] ** 2) * k * k)
      );
      const l = Math.hypot(ax, ay, az);
      ax /= l;
      ay /= l;
      nrm[i * 4] = ax * 127.5 + 127.5;
      nrm[i * 4 + 1] = ay * 127.5 + 127.5;
      nrm[i * 4 + 2] = (az / l) * 127.5 + 127.5;
      nrm[i * 4 + 3] = 255;
    }
  return {
    map: canvasTex(col, size, true),
    normalMap: canvasTex(nrm, size, false),
    ormMap: canvasTex(orm, size, false),
    tile,
  };
}

/** Matériau physique à partir d'un jeu de textures (UV en mètres). */
export function material(
  t: TexSet,
  o: THREE.MeshStandardMaterialParameters & { normalScale?: number } = {}
): THREE.MeshStandardMaterial {
  const { normalScale, ...rest } = o;
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap,
    roughnessMap: t.ormMap,
    metalnessMap: t.ormMap,
    roughness: 1,
    metalness: 1,
    ...rest,
  });
  m.normalScale.setScalar(normalScale ?? 1);
  // UV en mètres : on règle la répétition sur la taille du carreau.
  const rep = new THREE.Vector2(1 / t.tile[0], 1 / t.tile[1]);
  for (const tx of [t.map, t.normalMap, t.ormMap]) tx.repeat.copy(rep);
  return m;
}
