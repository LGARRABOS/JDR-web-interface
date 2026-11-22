// Toile simulée par contraintes de positions (Position-Based Dynamics) :
// une grille de points de masse reliés par des fils (longueur, cisaillement,
// flexion), retenus par des points fixes qui bougent (vergue, étai, lattes),
// des cordages (longueur maximale : écoutes, cargues) et des maintiens doux
// (rabans). Intégration de Verlet à pas fixe, tableaux typés, sans allocation
// pendant la simulation.

/** Accélération extérieure d'un point (vent, gravité), écrite dans `out`. */
export type ForceFn = (
  i: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  out: Float32Array
) => void;

export class Cloth {
  readonly n: number;
  readonly nu: number;
  readonly nv: number;
  /** Positions courantes et précédentes (x, y, z entrelacés). */
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** Normales de la grille (pour la poussée du vent). */
  readonly nrm: Float32Array;
  /** 0 : point mené (position imposée), 1 : libre. */
  readonly inv: Float32Array;
  /** Cibles des points menés et des maintiens doux. */
  readonly target: Float32Array;
  /** Force du maintien doux (0 : aucun, 1 : collé à la cible). */
  readonly hold: Float32Array;

  private ca: Int32Array;
  private cb: Int32Array;
  private rest: Float32Array;
  private stiff: Float32Array;
  private nc = 0;

  /** Cordages : point, ancre (monde du navire), longueur maximale. */
  readonly ropes: {
    i: number;
    ax: number;
    ay: number;
    az: number;
    len: number;
  }[] = [];

  private acc = new Float32Array(3);
  damping = 0.985;
  iterations = 6;

  constructor(
    nu: number,
    nv: number,
    init: (i: number, j: number, out: Float32Array) => void
  ) {
    this.nu = nu;
    this.nv = nv;
    const w = nu + 1;
    this.n = w * (nv + 1);
    this.pos = new Float32Array(this.n * 3);
    this.prev = new Float32Array(this.n * 3);
    this.nrm = new Float32Array(this.n * 3);
    this.inv = new Float32Array(this.n).fill(1);
    this.target = new Float32Array(this.n * 3);
    this.hold = new Float32Array(this.n);
    const p = new Float32Array(3);
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        init(i, j, p);
        const o = (j * w + i) * 3;
        this.pos.set(p, o);
        this.prev.set(p, o);
        this.target.set(p, o);
      }
    // Fils : trame et chaîne, biais, et fils « sautés » pour la raideur de flexion.
    const pairs: [number, number, number][] = [];
    const at = (i: number, j: number) => j * w + i;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        if (i < nu) pairs.push([at(i, j), at(i + 1, j), 1]);
        if (j < nv) pairs.push([at(i, j), at(i, j + 1), 1]);
        if (i < nu && j < nv) {
          pairs.push([at(i, j), at(i + 1, j + 1), 0.5]);
          pairs.push([at(i + 1, j), at(i, j + 1), 0.5]);
        }
        if (i < nu - 1) pairs.push([at(i, j), at(i + 2, j), 0.12]);
        if (j < nv - 1) pairs.push([at(i, j), at(i, j + 2), 0.12]);
      }
    this.ca = new Int32Array(pairs.length);
    this.cb = new Int32Array(pairs.length);
    this.rest = new Float32Array(pairs.length);
    this.stiff = new Float32Array(pairs.length);
    pairs.forEach(([a, b, k], c) => {
      this.ca[c] = a;
      this.cb[c] = b;
      this.stiff[c] = k;
    });
    this.nc = pairs.length;
    this.measureRest(this.pos);
  }

  /** Longueurs au repos mesurées sur une forme (la coupe de la voile). */
  measureRest(shape: Float32Array) {
    for (let c = 0; c < this.nc; c++) {
      const a = this.ca[c] * 3,
        b = this.cb[c] * 3;
      this.rest[c] = Math.hypot(
        shape[b] - shape[a],
        shape[b + 1] - shape[a + 1],
        shape[b + 2] - shape[a + 2]
      );
    }
  }

  /** Normales de la grille (différences centrées). */
  normals() {
    const { nu, nv, pos, nrm } = this;
    const w = nu + 1;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const i0 = (j * w + Math.max(0, i - 1)) * 3,
          i1 = (j * w + Math.min(nu, i + 1)) * 3;
        const j0 = (Math.max(0, j - 1) * w + i) * 3,
          j1 = (Math.min(nv, j + 1) * w + i) * 3;
        const ux = pos[i1] - pos[i0],
          uy = pos[i1 + 1] - pos[i0 + 1],
          uz = pos[i1 + 2] - pos[i0 + 2];
        const vx = pos[j1] - pos[j0],
          vy = pos[j1 + 1] - pos[j0 + 1],
          vz = pos[j1 + 2] - pos[j0 + 2];
        let nx = uy * vz - uz * vy,
          ny = uz * vx - ux * vz,
          nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        const o = (j * w + i) * 3;
        if (l > 1e-8) {
          nx /= l;
          ny /= l;
          nz /= l;
        } else if (j > 0) {
          // Rang dégénéré (têtière d'un foc) : normale du rang voisin.
          const q = ((j - 1) * w + i) * 3;
          nx = nrm[q];
          ny = nrm[q + 1];
          nz = nrm[q + 2];
        } else {
          nx = 0;
          ny = 0;
          nz = 1;
        }
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
  }

  /** Un pas de simulation (dt fixe). */
  step(dt: number, force: ForceFn) {
    const { pos, prev, inv, target, hold, acc } = this;
    const n = this.n;
    const dt2 = dt * dt;
    const damp = this.damping;
    this.normals();
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      if (inv[k] === 0) {
        prev[o] = pos[o];
        prev[o + 1] = pos[o + 1];
        prev[o + 2] = pos[o + 2];
        pos[o] = target[o];
        pos[o + 1] = target[o + 1];
        pos[o + 2] = target[o + 2];
        continue;
      }
      const x = pos[o],
        y = pos[o + 1],
        z = pos[o + 2];
      const vx = (x - prev[o]) * damp,
        vy = (y - prev[o + 1]) * damp,
        vz = (z - prev[o + 2]) * damp;
      force(k, x, y, z, vx / dt, vy / dt, vz / dt, acc);
      prev[o] = x;
      prev[o + 1] = y;
      prev[o + 2] = z;
      pos[o] = x + vx + acc[0] * dt2;
      pos[o + 1] = y + vy + acc[1] * dt2;
      pos[o + 2] = z + vz + acc[2] * dt2;
    }
    const { ca, cb, rest, stiff, ropes } = this;
    for (let it = 0; it < this.iterations; it++) {
      for (let c = 0; c < this.nc; c++) {
        const a = ca[c],
          b = cb[c];
        const wa = inv[a],
          wb = inv[b];
        const ws = wa + wb;
        if (ws === 0) continue;
        const ao = a * 3,
          bo = b * 3;
        const dx = pos[bo] - pos[ao],
          dy = pos[bo + 1] - pos[ao + 1],
          dz = pos[bo + 2] - pos[ao + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-7) continue;
        // La toile résiste à l'allongement, beaucoup moins à la compression
        // (elle se plisse au lieu de pousser).
        let diff = (d - rest[c]) / d;
        if (diff < 0) diff *= 0.3;
        const s = (diff * stiff[c]) / ws;
        pos[ao] += dx * s * wa;
        pos[ao + 1] += dy * s * wa;
        pos[ao + 2] += dz * s * wa;
        pos[bo] -= dx * s * wb;
        pos[bo + 1] -= dy * s * wb;
        pos[bo + 2] -= dz * s * wb;
      }
      for (const r of ropes) {
        if (inv[r.i] === 0) continue;
        const o = r.i * 3;
        const dx = pos[o] - r.ax,
          dy = pos[o + 1] - r.ay,
          dz = pos[o + 2] - r.az;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > r.len && d > 1e-6) {
          const k = (d - r.len) / d;
          pos[o] -= dx * k;
          pos[o + 1] -= dy * k;
          pos[o + 2] -= dz * k;
        }
      }
    }
    // Maintiens doux (rabans, mousquetons qui coulissent).
    for (let k = 0; k < n; k++) {
      const h = hold[k];
      if (h <= 0 || inv[k] === 0) continue;
      const o = k * 3;
      pos[o] += (target[o] - pos[o]) * h;
      pos[o + 1] += (target[o + 1] - pos[o + 1]) * h;
      pos[o + 2] += (target[o + 2] - pos[o + 2]) * h;
    }
    // Garde-fou : un point aberrant est ramené à sa cible.
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      if (!Number.isFinite(pos[o] + pos[o + 1] + pos[o + 2])) {
        pos[o] = prev[o] = target[o];
        pos[o + 1] = prev[o + 1] = target[o + 1];
        pos[o + 2] = prev[o + 2] = target[o + 2];
      }
    }
  }
}
