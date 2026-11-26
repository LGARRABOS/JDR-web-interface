import * as THREE from 'three';
import { Cloth } from './cloth';
import type { JibSpec, JunkSpec, SailSpec, SquareSpec } from './specs';

// Chaque voile : sa coupe (forme pour laquelle la toile est taillée, qui
// donne le creux une fois gonflée), ses attaches réelles et leurs manœuvres.
//  - voile carrée : têtière enverguée sur la vergue ; points d'écoute menés
//    par les écoutes puis remontés par les cargue-points ; cargue-fonds qui
//    relèvent la bordure ; rabans qui serrent la toile sur la vergue (la toile
//    libre entre deux rabans pend sous son poids : les festons) ;
//  - foc : mousquetons sur l'étai, qui coulissent vers le bas quand on
//    l'amène ; drisse, écoute sous le vent ;
//  - voile à lattes : lattes menées le long du mât, qui s'empilent sur la
//    bôme ; les panneaux de toile entre elles sont libres.

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Segment de manœuvre courante : de a à b, flèche (m), rayon. */
export interface Line {
  a: THREE.Vector3;
  b: THREE.Vector3;
  sag: number;
  r: number;
}

export abstract class Sail {
  readonly cloth: Cloth;
  /** déploiement 0 (serrée) … 1 (établie), et commande de manœuvre */
  d = 1;
  wait = 0;
  lastWant = 1;
  /** Fraction de vent reçue (abri derrière les autres voiles). */
  exposure = 1;
  readonly seed: number;
  /** Sens du creux pour le shader (+1 voile carrée, −1 foc et lattes). */
  abstract readonly holSign: number;
  /** Normale de la toile à plat (côté où elle se gonfle). */
  abstract readonly bellyN: THREE.Vector3;
  /** Forme à plat, établie (pour mesurer le creux). */
  readonly flat: Float32Array;

  constructor(
    readonly spec: SailSpec,
    nu: number,
    nv: number,
    seed: number
  ) {
    this.seed = seed;
    const p = new THREE.Vector3();
    this.cloth = new Cloth(nu, nv, (i, j, out) => {
      this.cut(i / nu, j / nv, p);
      out[0] = p.x;
      out[1] = p.y;
      out[2] = p.z;
    });
    this.flat = new Float32Array(this.cloth.n * 3);
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        this.flatAt(i / nu, j / nv, p);
        this.flat.set([p.x, p.y, p.z], (j * (nu + 1) + i) * 3);
      }
  }

  get nu() {
    return this.cloth.nu;
  }
  get nv() {
    return this.cloth.nv;
  }
  /** Dimensions (m) pour les UV de la toile. */
  abstract size(): [number, number];
  /** Toile à plat, établie. */
  abstract flatAt(u: number, v: number, out: THREE.Vector3): THREE.Vector3;
  /** Coupe : la forme pour laquelle la toile est taillée (creux compris). */
  abstract cut(u: number, v: number, out: THREE.Vector3): THREE.Vector3;
  /** Met à jour points menés, cordages et maintiens selon `d`. */
  abstract rig(t: number): void;
  /** Manœuvres courantes visibles. */
  abstract lines(t: number, out: Line[]): void;
  /** Rabans (matrices), seulement pour les voiles carrées. */
  gaskets(_t: number, _out: THREE.Matrix4[]): void {}
  get gasketCount() {
    return 0;
  }

  /** Point simulé (i, j). */
  p(i: number, j: number, out = new THREE.Vector3()) {
    const o = (j * (this.nu + 1) + i) * 3;
    const pos = this.cloth.pos;
    return out.set(pos[o], pos[o + 1], pos[o + 2]);
  }
  /** Mène le point (i, j) à une cible. */
  protected lead(i: number, j: number, x: number, y: number, z: number) {
    const k = j * (this.nu + 1) + i;
    this.cloth.inv[k] = 0;
    this.cloth.target.set([x, y, z], k * 3);
  }
  protected free(i: number, j: number) {
    this.cloth.inv[j * (this.nu + 1) + i] = 1;
  }
  /** Place toute la toile sur une forme (départ d'une simulation). */
  place(fn: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3) {
    const p = new THREE.Vector3();
    const { nu, nv } = this;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        fn(i / nu, j / nv, p);
        const o = (j * (nu + 1) + i) * 3;
        this.cloth.pos.set([p.x, p.y, p.z], o);
        this.cloth.prev.set([p.x, p.y, p.z], o);
      }
  }
  /** Forme de départ pour l'état serré (avant la simulation de mise en place). */
  stowed(u: number, v: number, out: THREE.Vector3) {
    return this.cut(u, v, out);
  }
}

// --- Voile carrée ---------------------------------------------------------------

export class SquareSail extends Sail {
  readonly holSign = 1;
  readonly bellyN = new THREE.Vector3(1, 0, 0);
  private get s() {
    return this.spec as SquareSpec;
  }
  private bunt: number[];
  private buntLen: number[];
  private ng: number;

  constructor(spec: SquareSpec, res: number, seed: number) {
    const nu = Math.max(8, Math.round(14 * res)),
      nv = Math.max(6, Math.round(11 * res));
    super(spec, nu, nv, seed);
    // Cargue-fonds : trois points de la bordure.
    this.bunt = [
      Math.round(nu * 0.25),
      Math.round(nu * 0.5),
      Math.round(nu * 0.75),
    ];
    const H = spec.yTop - spec.yBot;
    this.buntLen = this.bunt.map(() => H * 1.3);
    this.ng = Math.max(2, Math.floor((2 * spec.halfTop) / 1.7));
    // Têtière enverguée : rang du haut mené sur la vergue.
    for (let i = 0; i <= nu; i++) {
      const p = this.flatAt(i / nu, 0, new THREE.Vector3());
      this.lead(i, 0, p.x, p.y, p.z);
    }
    for (const i of this.bunt)
      this.cloth.ropes.push({
        i: nv * (nu + 1) + i,
        ax: 0,
        ay: 0,
        az: 0,
        len: H * 1.3,
      });
  }

  size(): [number, number] {
    const s = this.s;
    return [s.halfTop + s.halfBot, s.yTop - s.yBot];
  }
  private half(v: number) {
    const s = this.s;
    return (
      (s.halfTop + (s.halfBot - s.halfTop) * v) *
      (1 - 0.035 * Math.sin(Math.PI * v))
    );
  }
  flatAt(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    return out.set(
      s.x + 0.2,
      s.yTop - (s.yTop - s.yBot) * v,
      (u * 2 - 1) * this.half(v)
    );
  }
  cut(u: number, v: number, out: THREE.Vector3) {
    this.flatAt(u, v, out);
    const uu = u * 2 - 1;
    // Creux taillé : plein au tiers haut, bordure en arc, chute un peu creuse.
    const w =
      Math.pow(1 - uu * uu, 0.8) * Math.sin(Math.PI * (0.06 + v * 0.86));
    out.x += this.s.belly * 0.95 * (w + 0.2 * (1 - uu * uu) * v);
    out.y += (1 - uu * uu) * 0.35 * v * v;
    return out;
  }
  /** Rouleau serré sur l'avant de la vergue. */
  private roll(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    const uu = u * 2 - 1;
    const th = v * 5.6 + uu * 1.2;
    const rr = 0.3 + 0.06 * v;
    return out.set(
      s.x + 0.52 + rr * Math.cos(th) * 0.8,
      s.yardY + 0.06 + rr * Math.sin(th) * 0.55,
      uu * s.halfTop * 0.96
    );
  }
  stowed(u: number, v: number, out: THREE.Vector3) {
    return this.roll(u, v, out);
  }
  private clewUp(side: number) {
    const s = this.s;
    return new THREE.Vector3(
      s.x + 0.45,
      s.yardY - 0.25,
      side * s.halfTop * 0.82
    );
  }
  private block(i: number) {
    const s = this.s;
    const z = this.flatAt(i / this.nu, 1, new THREE.Vector3()).z * 0.9;
    return new THREE.Vector3(s.x + 0.45, s.yardY + 0.1, z);
  }

  rig(): void {
    const { nu, nv, s, cloth } = this;
    const f = 1 - this.d;
    const H = s.yTop - s.yBot;
    // Points d'écoute : bordés aux écoutes, puis remontés aux bouts de vergue.
    const hauled = sm(0.05, 0.75, f);
    for (const [i, side] of [
      [0, -1],
      [nu, 1],
    ] as const) {
      const set = this.flatAt(i / nu, 1, new THREE.Vector3());
      const up = this.clewUp(side);
      const p = set.lerp(up, hauled);
      // En remontant, le point d'écoute décrit un arc vers l'avant.
      p.x += Math.sin(Math.PI * hauled) * 0.9;
      this.lead(i, nv, p.x, p.y, p.z);
    }
    // Cargue-fonds : la bordure remonte vers la vergue.
    this.bunt.forEach((i, k) => {
      const b = this.block(i);
      const r = cloth.ropes[k];
      r.ax = b.x;
      r.ay = b.y;
      r.az = b.z;
      r.len = this.buntLen[k] =
        0.35 + (H * 1.25 - 0.35) * (1 - sm(0.15, 0.85, f));
    });
    // Rabans : la toile ramassée est serrée sur la vergue ; entre deux rabans,
    // elle n'est tenue que mollement et pend.
    const lock = sm(0.78, 1, f);
    const p = new THREE.Vector3();
    for (let j = 1; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        if (cloth.inv[k] === 0) continue;
        if (lock <= 0) {
          cloth.hold[k] = 0;
          continue;
        }
        this.roll(i / nu, j / nv, p);
        const gp = ((p.z / (s.halfTop * 0.9)) * 0.5 + 0.5) * this.ng;
        const near = Math.pow(
          Math.cos(Math.PI * (gp - Math.floor(gp) - 0.5)),
          8
        );
        cloth.hold[k] = lock * (0.18 + 0.5 * near) * (0.5 + 0.5 * (1 - j / nv));
        cloth.target.set([p.x, p.y, p.z], k * 3);
      }
  }

  lines(t: number, out: Line[]) {
    const { nu, nv, s } = this;
    const f = 1 - this.d;
    for (const [i, side] of [
      [0, -1],
      [nu, 1],
    ] as const) {
      const clew = this.p(i, nv);
      const to = s.sheetTo(side);
      const dist = clew.distanceTo(to);
      out.push({
        a: clew,
        b: to,
        sag:
          dist * (0.008 + 0.09 * sm(0.05, 0.6, f)) +
          0.03 * Math.sin(t * 1.3 + side),
        r: 0.03,
      });
      const up = this.clewUp(side).add(new THREE.Vector3(0, 0.3, 0));
      out.push({
        a: clew.clone(),
        b: up,
        sag: 0.25 * (1 - sm(0.3, 0.8, f)) * (clew.distanceTo(up) / 6),
        r: 0.02,
      });
    }
    this.bunt.forEach((i, k) => {
      const foot = this.p(i, nv);
      const b = this.block(i);
      const slack = Math.max(0, this.buntLen[k] - foot.distanceTo(b));
      out.push({
        a: foot,
        b,
        sag: Math.min(1.2, slack * 0.45) + 0.02,
        r: 0.016,
      });
    });
  }

  get gasketCount() {
    return this.ng;
  }
  gaskets(t: number, out: THREE.Matrix4[]) {
    const s = this.s;
    const fs = sm(0.85, 1, 1 - this.d);
    for (let q = 0; q < this.ng; q++) {
      const z = -s.halfTop * 0.9 + ((q + 0.5) / this.ng) * s.halfTop * 1.8;
      out.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(
            s.x + 0.54,
            s.yardY + 0.05 + 0.015 * Math.sin(t * 1.7 + q),
            z
          ),
          new THREE.Quaternion(),
          new THREE.Vector3(0.5 * fs + 1e-4, 0.42 * fs + 1e-4, 0.3 * fs + 1e-4)
        )
      );
    }
  }
}

// --- Foc ----------------------------------------------------------------------------

export class JibSail extends Sail {
  readonly holSign = -1;
  readonly bellyN = new THREE.Vector3(0, 0, 1);
  private get s() {
    return this.spec as JibSpec;
  }
  private sheetLen: number;

  constructor(spec: JibSpec, res: number, seed: number) {
    const nu = Math.max(6, Math.round(10 * res)),
      nv = Math.max(7, Math.round(12 * res));
    super(spec, nu, nv, seed);
    this.sheetLen = spec.clew.distanceTo(spec.sheetTo(1)) * 0.99;
    this.cloth.ropes.push({ i: nu, ax: 0, ay: 0, az: 0, len: this.sheetLen });
  }

  size(): [number, number] {
    const s = this.s;
    return [s.tack.distanceTo(s.clew), s.tack.distanceTo(s.head)];
  }
  flatAt(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    const L = s.tack.clone().lerp(s.head, v);
    const E = s.clew.clone().lerp(s.head, v);
    return out.copy(L.lerp(E, u));
  }
  cut(u: number, v: number, out: THREE.Vector3) {
    this.flatAt(u, v, out);
    // Creux au tiers avant, qui s'efface vers la têtière ; chute qui revient.
    const camber = Math.pow(u, 0.7) * (1 - u) * 2.6 * (1 - Math.pow(v, 1.4));
    out.z += this.s.belly * 0.9 * camber;
    out.x -= 0.35 * Math.sin(Math.PI * v) * u * u;
    return out;
  }
  /** Hauteur des mousquetons le long de l'étai (fraction). */
  private hoist() {
    return 0.1 + 0.9 * sm(0, 1, this.d);
  }
  /** Foc serré : boudin de toile ferlé le long du bas de l'étai. */
  stowed(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    const S = s.tack.clone().lerp(s.head, 0.01 + 0.085 * (v * 0.6 + u * 0.4));
    const a = u * 9 + v * 4;
    const r = 0.28 + 0.07 * Math.sin(u * 13 + v * 7);
    return out.set(S.x, S.y - 0.12 + Math.sin(a) * r, S.z + Math.cos(a) * r);
  }

  rig(): void {
    const { nu, nv, s, cloth } = this;
    const h = this.hoist();
    // Guindant sur l'étai : chaque mousqueton à sa hauteur, empilés en bas
    // quand le foc est amené (l'étai fléchit un peu sous la poussée).
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const p = s.tack.clone().lerp(s.head, v * h);
      p.z += s.belly * 0.08 * Math.sin(Math.PI * v) * this.d;
      this.lead(0, j, p.x, p.y, p.z);
    }
    // Têtière : toute la dernière rangée au point de drisse.
    const hp = s.tack.clone().lerp(s.head, h);
    for (let i = 1; i <= nu; i++) this.lead(i, nv, hp.x, hp.y, hp.z);
    // Écoute sous le vent : bordée en route, choquée quand le foc est amené.
    const to = s.sheetTo(1);
    const r = cloth.ropes[0];
    r.ax = to.x;
    r.ay = to.y;
    r.az = to.z;
    r.len = this.sheetLen + (1 - this.d) * 5;
    // Une fois amené, le foc est ferlé (rabans) le long de l'étai.
    const lock = sm(0.7, 1, 1 - this.d);
    const p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++)
      for (let i = 1; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        if (cloth.inv[k] === 0) continue;
        cloth.hold[k] = lock * 0.45;
        if (lock > 0) {
          this.stowed(i / nu, j / nv, p);
          cloth.target.set([p.x, p.y, p.z], k * 3);
        }
      }
  }

  lines(t: number, out: Line[]) {
    const s = this.s;
    const clew = this.p(this.nu, 0);
    for (const side of [-1, 1]) {
      const to = s.sheetTo(side);
      const dist = clew.distanceTo(to);
      const tight =
        side > 0 ? Math.max(0, this.cloth.ropes[0].len - dist) : dist * 0.12;
      out.push({
        a: clew.clone(),
        b: to,
        sag:
          Math.min(1.5, tight * 0.5 + 0.02) + 0.02 * Math.sin(t * 1.4 + side),
        r: 0.025,
      });
    }
    const head = this.p(1, this.nv);
    out.push({
      a: head,
      b: s.halyardTo.clone(),
      sag: 0.03 + (1 - this.d) * 0.5,
      r: 0.025,
    });
  }
}

// --- Voile à lattes -------------------------------------------------------------------

export class JunkSail extends Sail {
  readonly holSign = -1;
  readonly bellyN = new THREE.Vector3(0, 0, 1);
  private get s() {
    return this.spec as JunkSpec;
  }
  static readonly PANELS = 5;

  constructor(spec: JunkSpec, res: number, seed: number) {
    const per = Math.max(2, Math.round(3 * res));
    const nu = Math.max(6, Math.round(10 * res));
    super(spec, nu, JunkSail.PANELS * per, seed);
  }
  private get per() {
    return this.nv / JunkSail.PANELS;
  }

  size(): [number, number] {
    const s = this.s;
    return [s.tack.distanceTo(s.clew), s.tack.distanceTo(s.throat)];
  }
  flatAt(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    const lo = s.tack.clone().lerp(s.clew, u);
    const hi = s.throat.clone().lerp(s.peak, u);
    return out.copy(lo.lerp(hi, v));
  }
  cut(u: number, v: number, out: THREE.Vector3) {
    this.flatAt(u, v, out);
    const panel = Math.sin(Math.PI * ((v * JunkSail.PANELS) % 1));
    const camber = Math.pow(u, 0.6) * (1 - u) * 2.4;
    out.z += this.s.belly * camber * (0.25 + 0.75 * panel) * 0.9;
    return out;
  }
  /** Latte b (0 = bôme … PANELS = vergue) : extrémités guindant et chute. */
  private batten(b: number) {
    const s = this.s;
    const h = 0.05 + 0.95 * sm(0, 1, this.d);
    const vb = b / JunkSail.PANELS;
    const stack = new THREE.Vector3(0, b * 0.13 * (1 - h), 0);
    const luff = s.tack
      .clone()
      .lerp(s.throat, vb * h)
      .add(stack);
    const leech = s.clew
      .clone()
      .lerp(s.peak, vb * h)
      .add(stack);
    return [luff, leech] as const;
  }
  stowed(u: number, v: number, out: THREE.Vector3) {
    const s = this.s;
    const b = Math.round(v * JunkSail.PANELS);
    return out
      .copy(s.tack.clone().lerp(s.clew, u))
      .add(
        new THREE.Vector3(
          0,
          b * 0.13 - 0.2 * Math.sin(Math.PI * ((v * 5) % 1)),
          0.15
        )
      );
  }

  rig(): void {
    const { nu, nv } = this;
    const per = this.per;
    for (let j = 0; j <= nv; j += per) {
      const [a, c] = this.batten(j / per);
      for (let i = 0; i <= nu; i++) {
        const p = a.clone().lerp(c, i / nu);
        this.lead(i, j, p.x, p.y, p.z);
      }
    }
    // Guindant des panneaux : racage le long du mât (entre les lattes).
    for (let j = 0; j < nv; j++) {
      if (j % per === 0) continue;
      const b = Math.floor(j / per);
      const [a0] = this.batten(b);
      const [a1] = this.batten(b + 1);
      const p = a0.lerp(a1, (j % per) / per);
      this.lead(0, j, p.x, p.y, p.z);
    }
  }

  lines(t: number, out: Line[]) {
    const s = this.s;
    for (let b = 1; b < JunkSail.PANELS; b++) {
      const [a, c] = this.batten(b);
      out.push({ a, b: c, sag: 0, r: 0.035 });
    }
    const clew = this.p(this.nu, 0);
    out.push({
      a: clew,
      b: s.sheetTo(1),
      sag: 0.05 + (1 - this.d) * 0.4 + 0.03 * Math.sin(t * 1.3),
      r: 0.025,
    });
    const peak = this.p(this.nu, this.nv);
    out.push({
      a: peak,
      b: s.halyardTo.clone(),
      sag: 0.02 + (1 - this.d) * 0.3,
      r: 0.025,
    });
  }
}

export function makeSail(spec: SailSpec, res: number, seed: number): Sail {
  if (spec.kind === 'square') return new SquareSail(spec, res, seed);
  if (spec.kind === 'jib') return new JibSail(spec, res, seed);
  return new JunkSail(spec, res, seed);
}
