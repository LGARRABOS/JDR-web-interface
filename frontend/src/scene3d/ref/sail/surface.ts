import * as THREE from 'three';
import type { Sail } from './rigging';

// Surface affichée d'une voile : la grille simulée est affinée par une
// interpolation de Catmull-Rom (plis arrondis, pas de facettes), puis on en
// tire les normales (différences centrées), le creux (écart à la toile à plat,
// pour le modelé du shader) et le pourtour (ralingues).

/** Facteur d'affinage de la grille simulée. */
export const REFINE = 2;

function crWeights(n: number, R: number) {
  const m = n * R;
  const idx = new Int32Array((m + 1) * 4);
  const w = new Float32Array((m + 1) * 4);
  for (let I = 0; I <= m; I++) {
    const f = I / R;
    const i = Math.min(n - 1, Math.floor(f));
    const t = f - i;
    const t2 = t * t,
      t3 = t2 * t;
    const ws = [
      (-t3 + 2 * t2 - t) / 2,
      (3 * t3 - 5 * t2 + 2) / 2,
      (-3 * t3 + 4 * t2 + t) / 2,
      (t3 - t2) / 2,
    ];
    for (let k = 0; k < 4; k++) {
      idx[I * 4 + k] = Math.min(n, Math.max(0, i - 1 + k));
      w[I * 4 + k] = ws[k];
    }
  }
  return { idx, w };
}

export class SailSurface {
  readonly rnu: number;
  readonly rnv: number;
  readonly count: number;
  /** Indices (dans la grille affichée) du pourtour, dans l'ordre. */
  readonly border: number[];
  private cu: { idx: Int32Array; w: Float32Array };
  private cv: { idx: Int32Array; w: Float32Array };
  private rows: Float32Array;
  private flat: Float32Array;
  private depthScale: number;

  constructor(readonly sail: Sail) {
    const { nu, nv } = sail;
    this.rnu = nu * REFINE;
    this.rnv = nv * REFINE;
    const w = this.rnu + 1;
    this.count = w * (this.rnv + 1);
    this.cu = crWeights(nu, REFINE);
    this.cv = crWeights(nv, REFINE);
    this.rows = new Float32Array((nv + 1) * w * 3);
    this.flat = new Float32Array(this.count * 3);
    const p = new THREE.Vector3();
    for (let J = 0; J <= this.rnv; J++)
      for (let I = 0; I <= this.rnu; I++) {
        sail.flatAt(I / this.rnu, J / this.rnv, p);
        this.flat.set([p.x, p.y, p.z], (J * w + I) * 3);
      }
    this.depthScale = 1 / Math.max(0.3, sail.spec.belly * 0.9);
    const b: number[] = [];
    const at = (I: number, J: number) => J * w + I;
    if (sail.spec.kind === 'jib') {
      for (let J = 0; J <= this.rnv; J++) b.push(at(0, J));
      for (let J = this.rnv; J >= 0; J--) b.push(at(this.rnu, J));
      for (let I = this.rnu - 1; I >= 1; I--) b.push(at(I, 0));
      b.push(at(0, 0));
    } else {
      for (let I = 0; I <= this.rnu; I++) b.push(at(I, 0));
      for (let J = 1; J <= this.rnv; J++) b.push(at(this.rnu, J));
      for (let I = this.rnu - 1; I >= 0; I--) b.push(at(I, this.rnv));
      for (let J = this.rnv - 1; J >= 0; J--) b.push(at(0, J));
    }
    this.border = b;
  }

  /** Écrit positions, normales et creux à partir de `base` (en sommets). */
  write(
    pos: Float32Array,
    nrm: Float32Array,
    hol: Float32Array,
    base: number,
    deploy: number
  ) {
    const { sail, rnu, rnv, cu, cv, rows } = this;
    const { nu, nv } = sail;
    const src = sail.cloth.pos;
    const sw = nu + 1,
      w = rnu + 1;
    // Interpolation le long des rangées, puis des colonnes.
    for (let j = 0; j <= nv; j++)
      for (let I = 0; I <= rnu; I++) {
        let x = 0,
          y = 0,
          z = 0;
        for (let k = 0; k < 4; k++) {
          const o = (j * sw + cu.idx[I * 4 + k]) * 3;
          const c = cu.w[I * 4 + k];
          x += src[o] * c;
          y += src[o + 1] * c;
          z += src[o + 2] * c;
        }
        const r = (j * w + I) * 3;
        rows[r] = x;
        rows[r + 1] = y;
        rows[r + 2] = z;
      }
    for (let J = 0; J <= rnv; J++)
      for (let I = 0; I <= rnu; I++) {
        let x = 0,
          y = 0,
          z = 0;
        for (let k = 0; k < 4; k++) {
          const o = (cv.idx[J * 4 + k] * w + I) * 3;
          const c = cv.w[J * 4 + k];
          x += rows[o] * c;
          y += rows[o + 1] * c;
          z += rows[o + 2] * c;
        }
        const o = (base + J * w + I) * 3;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
      }
    // Normales : du × dv (même orientation que les triangles de la grille).
    for (let J = 0; J <= rnv; J++)
      for (let I = 0; I <= rnu; I++) {
        const i0 = (base + J * w + Math.max(0, I - 1)) * 3,
          i1 = (base + J * w + Math.min(rnu, I + 1)) * 3;
        const j0 = (base + Math.max(0, J - 1) * w + I) * 3,
          j1 = (base + Math.min(rnv, J + 1) * w + I) * 3;
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
        const o = (base + J * w + I) * 3;
        if (l > 1e-9) {
          nx /= -l;
          ny /= -l;
          nz /= -l;
        } else if (J > 0) {
          const q = o - w * 3;
          nx = nrm[q];
          ny = nrm[q + 1];
          nz = nrm[q + 2];
        } else {
          nx = 0;
          ny = 1;
          nz = 0;
        }
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
    // Creux : enfoncement de la toile par rapport à la voile à plat.
    const bn = sail.bellyN;
    const k = sail.holSign * this.depthScale * deploy;
    for (let q = 0; q < this.count; q++) {
      const o = (base + q) * 3,
        f = q * 3;
      const dpt =
        (pos[o] - this.flat[f]) * bn.x +
        (pos[o + 1] - this.flat[f + 1]) * bn.y +
        (pos[o + 2] - this.flat[f + 2]) * bn.z;
      hol[base + q] = Math.max(-1, Math.min(1, dpt * k));
    }
  }
}
