// Relief du sable du moteur maison (dunes, rides et grande houle), dessiné
// par lui ; copie en JavaScript du même calcul pour poser les curiosités
// du paysage et la poussière des tuyères au bon niveau.

export interface GroundParams {
  scroll: number;
  amp: number;
  calm: number;
  calmX: number;
  /** Relief propre au paysage (voir Biome.terrain). */
  terrain?: number;
  /** Grande faille : centre (x, z), demi-longueur, demi-largeur (voir shaders). */
  hole?: [number, number, number, number];
  /** Rotation de la faille dans la scène (rotation.y de son repère). */
  holeRot?: number;
  /** Esplanade d'un point d'intérêt : centre (x, z) et rayon. */
  pad?: [number, number, number];
}

const fract = (x: number) => x - Math.floor(x);
function hash(x: number, y: number) {
  let a = fract(x * 0.1031),
    b = fract(y * 0.1031),
    c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}
function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy),
    c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy;
}
function fbm(x: number, y: number) {
  let s = 0,
    a = 0.5;
  for (let i = 0; i < 4; i++) {
    s += a * noise(x, y);
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 9.2;
    a *= 0.5;
  }
  return s;
}
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function dune(x: number, y: number, amp: number) {
  let h =
    2.6 * Math.sin(x * 0.021 + Math.sin(y * 0.013) * 1.8) +
    1.7 * Math.sin(y * 0.034 + x * 0.012) +
    1.1 * Math.sin((x + y) * 0.051);
  h += (fbm(x * 0.018, y * 0.018) - 0.5) * 5;
  return h * amp - 2;
}
function swell(x: number, y: number) {
  return (
    9 * Math.sin(x * 0.0042 + Math.sin(y * 0.0031) * 2.2) +
    6 * Math.sin(y * 0.0063 - x * 0.0024) +
    (fbm(x * 0.0025, y * 0.0025) - 0.5) * 12
  );
}

export const odurC = (x: number) =>
  16 * Math.sin(x * 0.0023) + 8 * Math.sin(x * 0.0061 + 1.3);
/** Présence du lit de l'Odur (1 dedans, 0 hors du fleuve de sable). */
export function odurIn(qx: number, z: number, terrain = 0) {
  return terrain === 1 ? 1 - sm(36, 50, Math.abs(z - odurC(qx))) : 0;
}
function barchans(qx: number, qz: number) {
  let h = 0;
  const cx = 560,
    cz = 460;
  const gx = Math.floor(qx / cx - 0.5),
    gz = Math.floor(qz / cz - 0.5);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const ax = gx + i,
        az = gz + j;
      const r1 = hash(ax * 1.7 + 3.1, az * 1.7 + 3.1),
        r2 = hash(ax * 2.3 + 7.9, az * 2.3 + 7.9),
        r3 = hash(ax + 11.3, az + 11.3);
      const ox = (ax + 0.5 + (r1 - 0.5) * 0.5) * cx,
        oz = (az + 0.5 + (r2 - 0.5) * 0.5) * cz;
      const R = 110 + 70 * r3;
      const H = 60 + 70 * r1;
      const dx = qx - ox,
        dz = qz - oz;
      const body = Math.exp(
        -((dx * dx) / (R * R * 0.8) + (dz * dz) / (R * R * 0.55))
      );
      const ex = dx - R * 0.55;
      const lee = Math.exp(
        -((ex * ex) / (R * R * 0.3) + (dz * dz) / (R * R * 0.22))
      );
      h = Math.max(h, H * Math.min(1, Math.max(0, body - 0.9 * lee)));
    }
  return h;
}

/** Distance au bord de la grande faille (< 0 dedans). */
export function holeD(
  x: number,
  z: number,
  hole: GroundParams['hole'],
  rot = 0
): number {
  if (!hole || hole[3] <= 0) return 1e5;
  // Repère de la faille : axe local x = (cos, -sin), axe local z = (sin, cos).
  const c = Math.cos(rot),
    s = Math.sin(rot);
  const dx = x - hole[0],
    dz = z - hole[1];
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  if (Math.abs(lx) > hole[2]) return Math.hypot(Math.abs(lx) - hole[2], lz);
  const t = Math.min(1, Math.max(-1, lx / hole[2]));
  const w =
    hole[3] *
    Math.sqrt(Math.max(0, 1 - t * t)) *
    (1 + 0.18 * Math.sin(lx * 0.031) + 0.1 * Math.sin(lx * 0.077 + 1.3));
  return Math.abs(lz) - w;
}
function flatK(x: number, z: number, g: GroundParams) {
  let k = 1 - sm(4, 90, holeD(x, z, g.hole, g.holeRot));
  const p = g.pad;
  if (p && p[2] > 0)
    k = Math.max(k, 1 - sm(p[2], p[2] + 90, Math.hypot(x - p[0], z - p[1])));
  return k;
}
const crackC = (qx: number, z: number) =>
  Math.abs(fbm(qx * 0.0045, z * 0.0045) - 0.5);

/** Hauteur du sable au point (x, z) de la scène (même formule que le shader). */
export function sandHeight(x: number, z: number, g: GroundParams) {
  const qx = x + g.scroll;
  const k = sm(260, 850, Math.hypot(x, z));
  const flat = g.calm * (1 - sm(520, 950, Math.hypot(x - g.calmX, z)));
  let h = dune(qx, z, g.amp) + k * swell(qx, z);
  const t = g.terrain ?? 0;
  if (t === 1) {
    const riv = odurIn(qx, z, 1);
    h =
      h * 1.3 +
      3 +
      (-3.5 + 0.25 * Math.sin(qx * 0.05 + z * 0.03) - (h * 1.3 + 3)) * riv;
  } else if (t === 2) h = h * 0.5 + (fbm(qx * 0.004, z * 0.004) - 0.5) * 7;
  else if (t === 3) h += barchans(qx, z) * sm(95, 190, Math.abs(z));
  else if (t === 4) h = h * 0.35 + (fbm(qx * 0.006, z * 0.006) - 0.5) * 5;
  else if (t === 5) h = h * 0.55 - 4 * (1 - sm(0, 0.025, crackC(qx, z)));
  h *= 1 - flatK(x, z, g);
  return h + (-1 - h) * flat;
}
