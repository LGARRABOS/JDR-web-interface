// Vent apparent dans la voilure : direction de travers arrière, force selon
// l'allure, rafales lentes et turbulence qui voyage avec le vent (jamais
// uniforme : chaque voile, chaque zone de toile reçoit un souffle différent).

function hash3(x: number, y: number, z: number) {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(z, 1442695041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Bruit de valeur 3D lissé, dans [0, 1]. */
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy),
    uz = fz * fz * (3 - 2 * fz);
  const c000 = hash3(ix, iy, iz),
    c100 = hash3(ix + 1, iy, iz),
    c010 = hash3(ix, iy + 1, iz),
    c110 = hash3(ix + 1, iy + 1, iz),
    c001 = hash3(ix, iy, iz + 1),
    c101 = hash3(ix + 1, iy, iz + 1),
    c011 = hash3(ix, iy + 1, iz + 1),
    c111 = hash3(ix + 1, iy + 1, iz + 1);
  const a0 = c000 + (c100 - c000) * ux,
    a1 = c010 + (c110 - c010) * ux,
    a2 = c001 + (c101 - c001) * ux,
    a3 = c011 + (c111 - c011) * ux;
  const b0 = a0 + (a1 - a0) * uy,
    b1 = a2 + (a3 - a2) * uy;
  return b0 + (b1 - b0) * uz;
}

export class WindField {
  /** Direction (repère du navire), normalisée : vent de travers arrière. */
  readonly dir = [0.8, 0, 0.6];
  /** Force : 1 en route, brise légère à l'arrêt. */
  strength = 1;
  private target = 1;
  time = 0;

  setUnderway(on: boolean) {
    this.target = on ? 1 : 0.14;
  }
  snap() {
    this.strength = this.target;
  }

  advance(dt: number) {
    this.time += dt;
    this.strength += (this.target - this.strength) * Math.min(1, dt * 0.35);
  }

  /** Rafale commune (lente, irrégulière). */
  gust() {
    const t = this.time;
    return (
      0.16 * Math.sin(t * 0.37) +
      0.1 * Math.sin(t * 0.83 + 1.3) +
      0.08 * (noise3(t * 0.25, 3.1, 7.7) - 0.5) * 2
    );
  }

  /**
   * Vent au point (x, y, z) : la turbulence est advectée le long du vent.
   * `g` : rafale du pas courant, `seed` : décalage propre à chaque voile.
   */
  sample(
    x: number,
    y: number,
    z: number,
    g: number,
    seed: number,
    out: Float32Array
  ) {
    const t = this.time;
    const s = this.strength;
    const d = this.dir;
    const k = 0.11;
    const ax = x * k - t * 0.9 * d[0],
      ay = y * k + seed,
      az = z * k - t * 0.9 * d[2];
    const n1 = noise3(ax, ay, az) - 0.5;
    const n2 = noise3(ax * 2.3 + 11, ay * 2.3 - t * 0.6, az * 2.3) - 0.5;
    const n3 = noise3(ax * 1.7 - 5, ay * 1.7 + 9, az * 1.7 + t * 0.4) - 0.5;
    const mag = s * (1 + g + 0.55 * n1 + 0.3 * n2);
    out[0] = d[0] * mag + s * 0.25 * n3;
    out[1] = s * 0.35 * n2;
    out[2] = d[2] * mag + s * 0.25 * n1;
  }
}
