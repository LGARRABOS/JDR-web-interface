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
export const STOP_DX = 175;
export const STOP_DZ = 150;

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

const N = 240;

/**
 * Route du point `from` (cap `from.h`) au point d'arrêt `to`, où le navire
 * arrive cap vers +x : courbe de Bézier dont les tangentes suivent les caps
 * de départ et d'arrivée (le navire vire, il ne glisse pas de côté).
 */
export function route(from: Nav, to: { x: number; z: number }): Route {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const back = to.x < from.x;
  // Tangentes plus longues quand il faut faire demi-tour : grande boucle.
  const l1 = Math.min(700, Math.max(160, d * (back ? 0.7 : 0.4)));
  const l2 = Math.min(700, Math.max(160, d * (back ? 0.7 : 0.4)));
  const p1x = from.x + Math.cos(from.h) * l1,
    p1z = from.z + Math.sin(from.h) * l1;
  const p2x = to.x - l2,
    p2z = to.z;
  const x = new Float32Array(N + 1),
    z = new Float32Array(N + 1),
    h = new Float32Array(N + 1),
    s = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N,
      u = 1 - t;
    const a = u * u * u,
      b = 3 * u * u * t,
      c = 3 * u * t * t,
      e = t * t * t;
    x[i] = a * from.x + b * p1x + c * p2x + e * to.x;
    z[i] = a * from.z + b * p1z + c * p2z + e * to.z;
    // Tangente (dérivée de la courbe).
    const dx =
      3 * u * u * (p1x - from.x) +
      6 * u * t * (p2x - p1x) +
      3 * t * t * (to.x - p2x);
    const dz =
      3 * u * u * (p1z - from.z) +
      6 * u * t * (p2z - p1z) +
      3 * t * t * (to.z - p2z);
    h[i] = Math.atan2(dz, dx);
    if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  // Cap continu (pas de saut de 2π d'un échantillon à l'autre).
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
