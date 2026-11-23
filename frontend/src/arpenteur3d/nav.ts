// Navigation dans une zone, vers ses lieux-dits : le navire a une position
// (x, z) et un cap h dans le repère de la zone, et suit une route courbe
// jusqu'à un point d'arrêt à côté du repère du lieu.
//
// La scène reste centrée sur le navire, cap vers +x : c'est le monde (repères,
// îles, mer de nuages, ciel, soleil) qui est déplacé et tourné autour de lui.

/** Position et cap (radians, de +x vers +z) du navire dans la zone. */
export interface Nav {
  x: number;
  z: number;
  h: number;
}

/** Point d'arrêt par rapport au repère : à tribord du repère, un peu après. */
export const STOP_DX = 200;
export const STOP_DZ = 190;

/** Valeur ramenée dans [-period/2, period/2[. */
export function wrapC(v: number, period: number) {
  return ((((v + period / 2) % period) + period) % period) - period / 2;
}

/** Position d'un point de la zone vue depuis le navire (cap vers +x). */
export function toShip(nav: Nav, dx: number, dz: number): [number, number] {
  const c = Math.cos(nav.h),
    s = Math.sin(nav.h);
  return [dx * c + dz * s, -dx * s + dz * c];
}

export interface Route {
  /** Échantillons : x, z, cap, distance parcourue depuis le départ. */
  x: Float32Array;
  z: Float32Array;
  h: Float32Array;
  s: Float32Array;
  length: number;
}

const N = 400;
/** Rayon de virage (m) : large, le navire vire en douceur. */
export const TURN_R = 420;

type Seg = { kind: 'L' | 'R' | 'S'; len: number };

/**
 * Route la plus courte faite d'arcs de rayon TURN_R et d'une ligne droite
 * (chemin de Dubins : virage, ligne droite, virage) : pas de virage plus
 * serré que ce rayon, même pour faire demi-tour.
 */
function dubins(
  from: Nav,
  to: { x: number; z: number },
  R: number
): Seg[] | null {
  const he = 0;
  const TAU = Math.PI * 2;
  const pos = (a: number) => ((a % TAU) + TAU) % TAU;
  // Centres des cercles de virage à gauche (cap croissant) et à droite.
  const cl = (x: number, z: number, h: number) => [
    x - R * Math.sin(h),
    z + R * Math.cos(h),
  ];
  const cr = (x: number, z: number, h: number) => [
    x + R * Math.sin(h),
    z - R * Math.cos(h),
  ];
  const best: { segs: Seg[]; len: number }[] = [];
  const types: ['L' | 'R', 'L' | 'R'][] = [
    ['L', 'L'],
    ['R', 'R'],
    ['L', 'R'],
    ['R', 'L'],
  ];
  for (const [a, b] of types) {
    const c1 =
      a === 'L' ? cl(from.x, from.z, from.h) : cr(from.x, from.z, from.h);
    const c2 = b === 'L' ? cl(to.x, to.z, he) : cr(to.x, to.z, he);
    const dx = c2[0] - c1[0],
      dz = c2[1] - c1[1];
    const D = Math.hypot(dx, dz);
    const al = Math.atan2(dz, dx);
    let cands: number[];
    if (a === b) cands = [al];
    else {
      if (D < 2 * R + 1e-6) continue;
      const k = Math.asin((2 * R) / D);
      cands =
        a === 'L' ? [al + k, al + Math.PI - k] : [al - k, al + Math.PI + k];
    }
    // Point de sortie / d'entrée sur un cercle pour une ligne de cap psi.
    const on = (c: number[], t: 'L' | 'R', psi: number) =>
      t === 'L'
        ? [c[0] + R * Math.sin(psi), c[1] - R * Math.cos(psi)]
        : [c[0] - R * Math.sin(psi), c[1] + R * Math.cos(psi)];
    for (const psi of cands) {
      const p1 = on(c1, a, psi),
        p2 = on(c2, b, psi);
      const sx = p2[0] - p1[0],
        sz = p2[1] - p1[1];
      const straight = sx * Math.cos(psi) + sz * Math.sin(psi);
      if (
        straight < -1e-3 ||
        Math.abs(sx * Math.sin(psi) - sz * Math.cos(psi)) > 1
      )
        continue;
      const arc1 = (a === 'L' ? pos(psi - from.h) : pos(from.h - psi)) * R;
      const arc2 = (b === 'L' ? pos(he - psi) : pos(psi - he)) * R;
      best.push({
        segs: [
          { kind: a, len: arc1 },
          { kind: 'S', len: Math.max(0, straight) },
          { kind: b, len: arc2 },
        ],
        len: arc1 + Math.max(0, straight) + arc2,
      });
    }
  }
  if (!best.length) return null;
  best.sort((p, q) => p.len - q.len);
  return best[0].segs;
}

/** Route courbe (repli quand aucun chemin de Dubins ne convient). */
function bezier(from: Nav, to: { x: number; z: number }) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const l = Math.min(700, Math.max(160, d * 0.4));
  const p1x = from.x + Math.cos(from.h) * l,
    p1z = from.z + Math.sin(from.h) * l;
  const p2x = to.x - l,
    p2z = to.z;
  return (t: number) => {
    const u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      e = t * t * t;
    return [
      a * from.x + b * p1x + c * p2x + e * to.x,
      a * from.z + b * p1z + c * p2z + e * to.z,
    ];
  };
}

/**
 * Route du point `from` (cap `from.h`) au point d'arrêt `to`, où le navire
 * arrive cap vers +x : il vire (rayon TURN_R au plus serré), file droit,
 * puis vire pour se placer le long du repère.
 */
export function route(from: Nav, to: { x: number; z: number }): Route {
  const x = new Float32Array(N + 1),
    z = new Float32Array(N + 1),
    h = new Float32Array(N + 1),
    s = new Float32Array(N + 1);
  const segs = dubins(from, to, TURN_R);
  if (segs) {
    const total = segs.reduce((a, g) => a + g.len, 0);
    let px = from.x,
      pz = from.z,
      ph = from.h;
    let gi = 0,
      gd = 0;
    x[0] = px;
    z[0] = pz;
    h[0] = ph;
    const step = total / N;
    for (let i = 1; i <= N; i++) {
      let left = step;
      // Avance de `step` le long des segments (arcs exacts).
      while (left > 1e-9 && gi < segs.length) {
        const g = segs[gi];
        const d = Math.min(left, g.len - gd);
        if (g.kind === 'S') {
          px += Math.cos(ph) * d;
          pz += Math.sin(ph) * d;
        } else {
          const sg = g.kind === 'L' ? 1 : -1;
          const dh = (sg * d) / TURN_R;
          // Centre du cercle, puis rotation autour de lui.
          const cx = px - sg * TURN_R * Math.sin(ph),
            cz = pz + sg * TURN_R * Math.cos(ph);
          ph += dh;
          px = cx + sg * TURN_R * Math.sin(ph);
          pz = cz - sg * TURN_R * Math.cos(ph);
        }
        gd += d;
        left -= d;
        if (gd >= g.len - 1e-9) {
          gi++;
          gd = 0;
        }
      }
      x[i] = px;
      z[i] = pz;
      h[i] = ph;
      s[i] = s[i - 1] + step;
    }
    // Arrivée exacte (erreurs d'arrondi).
    x[N] = to.x;
    z[N] = to.z;
    return { x, z, h, s, length: s[N] };
  }
  const f = bezier(from, to);
  for (let i = 0; i <= N; i++) {
    const [px, pz] = f(i / N);
    x[i] = px;
    z[i] = pz;
    if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1),
      b = Math.min(N, i + 1);
    h[i] = Math.atan2(z[b] - z[a], x[b] - x[a]);
  }
  h[0] = from.h + wrapC(h[0] - from.h, Math.PI * 2);
  for (let i = 1; i <= N; i++)
    h[i] = h[i - 1] + wrapC(h[i] - h[i - 1], Math.PI * 2);
  return { x, z, h, s, length: s[N] };
}

/** Point de la route à la distance `d` depuis le départ. */
export function along(r: Route, d: number): Nav {
  const s = r.s;
  if (d <= 0) return { x: r.x[0], z: r.z[0], h: r.h[0] };
  if (d >= r.length) return { x: r.x[N], z: r.z[N], h: r.h[N] };
  let lo = 0,
    hi = N;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m] <= d) lo = m;
    else hi = m;
  }
  const f = (d - s[lo]) / Math.max(1e-6, s[hi] - s[lo]);
  return {
    x: r.x[lo] + (r.x[hi] - r.x[lo]) * f,
    z: r.z[lo] + (r.z[hi] - r.z[lo]) * f,
    h: r.h[lo] + (r.h[hi] - r.h[lo]) * f,
  };
}

/** Longueur estimée d'une route (pour fixer la durée d'un trajet). */
export function routeLength(from: Nav, to: { x: number; z: number }) {
  return route(from, to).length;
}
