// Relief du sable du moteur maison (dunes, rides et grande houle), dessiné
// par lui ; copie en JavaScript du même calcul pour poser les curiosités
// du paysage et la poussière des tuyères au bon niveau.

export interface GroundParams {
  scroll: number;
  amp: number;
  calm: number;
  calmX: number;
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

/** Hauteur du sable au point (x, z) de la scène (même formule que le shader). */
export function sandHeight(x: number, z: number, g: GroundParams) {
  const qx = x + g.scroll;
  const k = sm(260, 850, Math.hypot(x, z));
  const flat = g.calm * (1 - sm(520, 950, Math.hypot(x - g.calmX, z)));
  const h = dune(qx, z, g.amp) + k * swell(qx, z);
  return h + (-1 - h) * flat;
}
