import * as THREE from 'three';
import { tess } from '../kit';
import { makeSail, type Line, type Sail } from './rigging';
import type { SailSpec } from './specs';
import { SailSurface } from './surface';
import { WindField } from './wind';

// Voilure d'un navire : simulation de chaque voile (pas fixe), manœuvres
// voile par voile, surface affichée, ralingues, manœuvres courantes, rabans.
// Interface inchangée pour le navire, le labo et le jeu.

/** Pas de simulation (s) et nombre maximal de pas par image. */
const STEP = 1 / 60;
const MAX_STEPS = 4;
/** Poussée du vent (m/s² par unité de vent face à la toile) et pesanteur. */
const PUSH = 26;
const GRAVITY = 7;
/** Segments par manœuvre courante (chaînette). */
const SEG = 3;

export class SailRig {
  readonly sails: THREE.Mesh;
  readonly ropes: THREE.Mesh;
  readonly running: THREE.InstancedMesh;
  readonly gaskets: THREE.InstancedMesh;
  /** Dégâts (0..1) : trous et brûlures dans la toile. */
  damage = 0;
  /** Simulation à demi-cadence (navire à quai, loin, petite qualité). */
  slow = false;

  private list: Sail[];
  private surf: SailSurface[];
  private bases: number[] = [];
  private ropeBase: number[] = [];
  private pos: Float32Array;
  private nrm: Float32Array;
  private hol: Float32Array;
  private rpos: Float32Array;
  private rnrm: Float32Array;
  private wind = new WindField();
  private target = 1;
  private acc = 0;
  private quiet = 0;
  private time = 0;
  private gust = 0;
  private wv = new Float32Array(3);
  private forces: ((
    i: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    out: Float32Array
  ) => void)[];
  private nRun = 0;
  private nGasket = 0;
  private tmp = new THREE.Matrix4();
  private lineBuf: Line[] = [];
  private gBuf: THREE.Matrix4[] = [];

  constructor(
    specs: SailSpec[],
    canvas: THREE.Material,
    rope: THREE.Material,
    opts: { res?: number; iterations?: number } = {}
  ) {
    // Navires du port (facettes allégées) : toile plus grossière, moins d'itérations.
    const light = tess.detail < 1;
    const res = opts.res ?? (light ? 0.6 : 1);
    const iters = opts.iterations ?? (light ? 3 : 5);
    this.list = specs.map((s, k) => makeSail(s, res, k * 1.37 + 0.4));
    this.list.forEach((s) => (s.cloth.iterations = iters));
    this.exposures();
    this.surf = this.list.map((s) => new SailSurface(s));

    // Géométrie commune (un seul appel de dessin pour toute la toile).
    let nvert = 0;
    const idx: number[] = [],
      uv: number[] = [],
      sl: number[] = [],
      sd: number[] = [];
    this.surf.forEach((sf) => {
      const base = nvert;
      this.bases.push(base);
      const w = sf.rnu + 1;
      const [W, H] = sf.sail.size();
      for (let J = 0; J <= sf.rnv; J++)
        for (let I = 0; I <= sf.rnu; I++) {
          const u = I / sf.rnu,
            v = J / sf.rnv;
          uv.push((u - 0.5) * W, (1 - v) * H);
          sl.push(u, v);
          sd.push(W, H);
        }
      for (let J = 0; J < sf.rnv; J++)
        for (let I = 0; I < sf.rnu; I++) {
          const a = base + J * w + I;
          idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
        }
      nvert += sf.count;
    });
    this.pos = new Float32Array(nvert * 3);
    this.nrm = new Float32Array(nvert * 3);
    this.hol = new Float32Array(nvert);
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute(
      'normal',
      new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute(
      'hol',
      new THREE.BufferAttribute(this.hol, 1).setUsage(THREE.DynamicDrawUsage)
    );
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('sl', new THREE.Float32BufferAttribute(sl, 2));
    g.setAttribute('sd', new THREE.Float32BufferAttribute(sd, 2));
    g.setIndex(idx);
    this.sails = new THREE.Mesh(g, canvas);
    this.sails.castShadow = true;
    this.sails.receiveShadow = true;
    this.sails.frustumCulled = false;

    // Ralingues : tube à 5 pans cousu sur le pourtour.
    const R = 5;
    let nrope = 0;
    const ridx: number[] = [];
    this.surf.forEach((sf) => {
      this.ropeBase.push(nrope);
      const n = sf.border.length;
      for (let b = 0; b < n - 1; b++)
        for (let r = 0; r < R; r++) {
          const a = nrope + b * R + r,
            c = nrope + b * R + ((r + 1) % R);
          ridx.push(a, c, a + R, c, c + R, a + R);
        }
      nrope += n * R;
    });
    this.rpos = new Float32Array(nrope * 3);
    this.rnrm = new Float32Array(nrope * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rpos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    rg.setAttribute(
      'normal',
      new THREE.BufferAttribute(this.rnrm, 3).setUsage(THREE.DynamicDrawUsage)
    );
    rg.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(nrope * 2), 2)
    );
    rg.setIndex(ridx);
    this.ropes = new THREE.Mesh(rg, rope);
    this.ropes.castShadow = true;
    this.ropes.frustumCulled = false;

    // Manœuvres courantes et rabans.
    for (const s of this.list) {
      this.lineBuf.length = 0;
      s.rig(0);
      s.lines(0, this.lineBuf);
      this.nRun += this.lineBuf.length * SEG;
      this.nGasket += s.gasketCount;
    }
    this.running = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
      rope,
      Math.max(1, this.nRun)
    );
    this.running.frustumCulled = false;
    this.running.castShadow = true;
    this.gaskets = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.09, 6, 14),
      rope,
      Math.max(1, this.nGasket)
    );
    this.gaskets.frustumCulled = false;

    // Poussée du vent sur chaque point : pression face à la toile (la toile
    // tendue face au vent se gonfle, celle qui est de chant faseye), un peu
    // de traînée le long de la toile, pesanteur.
    this.forces = this.list.map((s) => {
      const nrmA = s.cloth.nrm;
      const wv = this.wv;
      return (i, x, y, z, vx, vy, vz, out) => {
        this.wind.sample(x, y, z, this.gust, s.seed, wv);
        const e = s.exposure;
        const rx = wv[0] * e - vx * 0.04,
          ry = wv[1] * e - vy * 0.04,
          rz = wv[2] * e - vz * 0.04;
        const o = i * 3;
        const nx = nrmA[o],
          ny = nrmA[o + 1],
          nz = nrmA[o + 2];
        const pn = rx * nx + ry * ny + rz * nz;
        out[0] = (nx * pn + (rx - nx * pn) * 0.08) * PUSH;
        out[1] = (ny * pn + (ry - ny * pn) * 0.08) * PUSH - GRAVITY;
        out[2] = (nz * pn + (rz - nz * pn) * 0.08) * PUSH;
      };
    });
    this.list.forEach((s) => s.place((u, v, o) => s.cut(u, v, o)));
    this.list.forEach((s) => s.rig(0));
    this.refresh(0);
  }

  /** Abri : une voile placée sous le vent d'une autre reçoit moins d'air. */
  private exposures() {
    const box = (s: Sail) => {
      const b = new THREE.Box3();
      const p = new THREE.Vector3();
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
      ])
        b.expandByPoint(s.flatAt(u, v, p));
      return b;
    };
    const boxes = this.list.map(box);
    this.list.forEach((s, k) => {
      const a = boxes[k];
      let shade = 0;
      boxes.forEach((b, q) => {
        if (q === k || b.max.x > a.min.x - 0.5) return;
        // Recouvrement vu dans l'axe du vent (plan y-z), atténué par la distance.
        const oy =
          Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)) /
          Math.max(0.1, a.max.y - a.min.y);
        const oz =
          Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)) /
          Math.max(0.1, a.max.z - a.min.z);
        const dist = a.min.x - b.max.x;
        shade = Math.max(shade, oy * oz * Math.exp(-dist / 30));
      });
      const jitter =
        0.93 +
        ((0.12 * (((Math.sin(k * 12.9898 + 4.1) * 43758.5453) % 1) + 1)) % 1);
      s.exposure =
        (1 - 0.32 * shade) * jitter * (s.spec.kind === 'square' ? 1 : 0.95);
    });
  }

  /** En route (voiles établies et gonflées) ou à l'arrêt (serrées). */
  setUnderway(on: boolean) {
    this.target = on ? 1 : 0;
    this.wind.setUnderway(on);
  }
  get underway() {
    return this.target > 0.5;
  }
  /** Manœuvre terminée et toile au repos. */
  get settled() {
    return (
      this.quiet > 3 &&
      this.list.every((s) => s.d === this.target && s.wait <= 0)
    );
  }

  update(t: number, dt: number) {
    const step = Math.min(Math.max(dt, 0), 0.25);
    this.time = t;
    // Manœuvre voile par voile : établir par le bas, serrer par le haut.
    let moving = false;
    this.list.forEach((s, k) => {
      const tier = s.spec.tier;
      const order = this.target > 0.5 ? tier : 3 - tier;
      const delay = order * 0.9 + (k % 3) * 0.25;
      if (s.lastWant !== this.target) {
        s.lastWant = this.target;
        s.wait = delay;
      }
      if (s.wait > 0) {
        s.wait -= step;
        moving = true;
      } else if (s.d !== this.target) {
        s.d +=
          Math.sign(this.target - s.d) *
          Math.min(Math.abs(this.target - s.d), step / 4.5);
        moving = true;
      }
    });
    this.quiet = moving ? 0 : this.quiet + step;
    // Simulation à pas fixe : le résultat ne dépend pas de la cadence d'affichage.
    this.acc += step;
    let n = 0;
    const h = this.slow ? STEP * 2 : STEP;
    while (this.acc >= h && n < MAX_STEPS) {
      this.tick(h);
      this.acc -= h;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
    // Rien n'a bougé (affichage plus rapide que la simulation) : surface inchangée.
    if (n > 0) this.refresh(t);
  }

  private tick(h = STEP) {
    this.wind.advance(h);
    this.gust = this.wind.gust();
    this.list.forEach((s, k) => {
      s.rig(this.time);
      s.cloth.step(h, this.forces[k]);
    });
  }

  /** Avance d'un coup jusqu'à l'état visé, toile déjà au repos. */
  snap() {
    this.wind.snap();
    for (const s of this.list) {
      s.d = this.target;
      s.lastWant = this.target;
      s.wait = 0;
      if (this.target > 0.5) s.place((u, v, o) => s.cut(u, v, o));
      else s.place((u, v, o) => s.stowed(u, v, o));
      s.rig(this.time);
    }
    for (let i = 0; i < 60; i++) this.tick(STEP * 1.5);
    this.acc = 0;
    this.quiet = 4;
    this.refresh(this.time);
  }

  private refresh(t: number) {
    this.surf.forEach((sf, k) =>
      sf.write(
        this.pos,
        this.nrm,
        this.hol,
        this.bases[k],
        sf.sail.d * sf.sail.d * (3 - 2 * sf.sail.d)
      )
    );
    const g = this.sails.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.hol.needsUpdate = true;
    this.boltRopes();
    // Manœuvres courantes (chaînettes) et rabans.
    let ri = 0,
      gi = 0;
    for (const s of this.list) {
      this.lineBuf.length = 0;
      s.lines(t, this.lineBuf);
      for (const l of this.lineBuf) {
        let a = l.a;
        for (let q = 1; q <= SEG; q++) {
          const f = q / SEG;
          const b = l.a.clone().lerp(l.b, f);
          b.y -= l.sag * 4 * f * (1 - f);
          if (ri < this.nRun) this.seg(ri++, a, b, l.r);
          a = b;
        }
      }
      this.gBuf.length = 0;
      s.gaskets(t, this.gBuf);
      for (const m of this.gBuf)
        if (gi < this.nGasket) this.gaskets.setMatrixAt(gi++, m);
    }
    this.running.count = ri;
    this.running.instanceMatrix.needsUpdate = true;
    this.gaskets.instanceMatrix.needsUpdate = true;
  }

  private boltRopes() {
    const R = 5;
    const tg = new THREE.Vector3(),
      n1 = new THREE.Vector3(),
      n2 = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0),
      ax = new THREE.Vector3(1, 0, 0);
    this.surf.forEach((sf, k) => {
      const base = this.bases[k];
      const rb = this.ropeBase[k];
      const rad = sf.sail.spec.kind === 'square' ? 0.065 : 0.055;
      const bd = sf.border;
      const P = (q: number) =>
        (base + bd[Math.max(0, Math.min(bd.length - 1, q))]) * 3;
      for (let b = 0; b < bd.length; b++) {
        const c = P(b),
          nb = P(b + 1),
          pb = P(b - 1);
        tg.set(
          this.pos[nb] - this.pos[pb],
          this.pos[nb + 1] - this.pos[pb + 1],
          this.pos[nb + 2] - this.pos[pb + 2]
        );
        if (tg.lengthSq() < 1e-10) tg.set(1, 0, 0);
        tg.normalize();
        n1.crossVectors(Math.abs(tg.y) < 0.9 ? up : ax, tg).normalize();
        n2.crossVectors(tg, n1);
        for (let q = 0; q < R; q++) {
          const a = (q / R) * Math.PI * 2;
          const o = (rb + b * R + q) * 3;
          const ca = Math.cos(a),
            sa = Math.sin(a);
          const nx = n1.x * ca + n2.x * sa,
            ny = n1.y * ca + n2.y * sa,
            nz = n1.z * ca + n2.z * sa;
          this.rnrm[o] = nx;
          this.rnrm[o + 1] = ny;
          this.rnrm[o + 2] = nz;
          this.rpos[o] = this.pos[c] + nx * rad;
          this.rpos[o + 1] = this.pos[c + 1] + ny * rad;
          this.rpos[o + 2] = this.pos[c + 2] + nz * rad;
        }
      }
    });
    const rg = this.ropes.geometry;
    rg.attributes.position.needsUpdate = true;
    rg.attributes.normal.needsUpdate = true;
  }

  private seg(i: number, a: THREE.Vector3, b: THREE.Vector3, rad: number) {
    const dv = b.clone().sub(a);
    const len = dv.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      len > 1e-5 ? dv.divideScalar(len) : new THREE.Vector3(0, 1, 0)
    );
    this.tmp.compose(
      a.clone().add(b).multiplyScalar(0.5),
      q,
      new THREE.Vector3(rad, Math.max(len, 1e-3), rad)
    );
    this.running.setMatrixAt(i, this.tmp);
  }

  /** Libère les géométries (les matériaux appartiennent au navire). */
  dispose() {
    this.sails.geometry.dispose();
    this.ropes.geometry.dispose();
    this.running.geometry.dispose();
    this.gaskets.geometry.dispose();
    this.running.dispose();
    this.gaskets.dispose();
  }
}
