import * as THREE from 'three';

// Voilure animée : voiles carrées et focs calculés à chaque image.
//  - déployées : creux ample du vent, ondulations des bords libres ;
//  - carguées : toile ramassée en rouleau sur la vergue (rabans), festons
//    qui pendent entre les rabans ; focs amenés en paquet le long de l'étai ;
//  - transition : les points d'écoute remontent, la toile se plisse et se
//    ramasse (ou l'inverse), voile par voile, avec un décalage naturel.
// Même repliée, la toile frémit dans la brise.

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export interface SquareSpec {
  kind: 'square';
  /** abscisse de la vergue (devant le mât) */
  x: number;
  yardY: number;
  yTop: number;
  yBot: number;
  halfTop: number;
  halfBot: number;
  belly: number;
  /** points d'arrivée des écoutes (bâbord/tribord : z signé) */
  sheetTo: (side: number) => THREE.Vector3;
  /** ordre de manœuvre (0 = bas) et mât */
  tier: number;
  mast: number;
}
export interface JibSpec {
  kind: 'jib';
  tack: THREE.Vector3;
  head: THREE.Vector3;
  clew: THREE.Vector3;
  belly: number;
  sheetTo: (side: number) => THREE.Vector3;
  halyardTo: THREE.Vector3;
  tier: number;
}
/** Voile aileron à lattes (gréement « pique ») : quadrilatère en arrière du mât. */
export interface JunkSpec {
  kind: 'junk';
  /** pied du guindant (mât), tête du guindant, pic, point d'écoute (bôme) */
  tack: THREE.Vector3;
  throat: THREE.Vector3;
  peak: THREE.Vector3;
  clew: THREE.Vector3;
  belly: number;
  sheetTo: (side: number) => THREE.Vector3;
  halyardTo: THREE.Vector3;
  tier: number;
}
export type SailSpec = SquareSpec | JibSpec | JunkSpec;

const NU = 30,
  NV = 22;
const NJ = 18;

interface SailRt {
  spec: SailSpec;
  nu: number;
  nv: number;
  base: number;
  /** déploiement (0 = cargué, 1 = établi) */
  d: number;
  phase: number;
  border: number[];
  ropeBase: number;
  wait: number;
  lastWant: number;
}

export class SailRig {
  readonly sails: THREE.Mesh;
  readonly ropes: THREE.Mesh;
  readonly running: THREE.InstancedMesh;
  readonly gaskets: THREE.InstancedMesh;
  private rts: SailRt[] = [];
  private pos: Float32Array;
  private hol: Float32Array;
  /** creux du dernier point calculé (0 bord … 1 fond du creux) */
  private cw = 0;
  private rpos: Float32Array;
  private target = 1;
  /** Dégâts (0..1) : trous et brûlures dans la toile. */
  damage = 0;
  private fill = 1;
  private nRun = 0;
  private nGasket = 0;
  private tmp = new THREE.Matrix4();

  constructor(specs: SailSpec[], canvas: THREE.Material, rope: THREE.Material) {
    let nvert = 0,
      nrope = 0;
    const idx: number[] = [];
    const uv: number[] = [];
    const sl: number[] = [];
    const sd: number[] = [];
    const ridx: number[] = [];
    specs.forEach((spec, k) => {
      const nu = spec.kind === 'square' ? NU : NJ,
        nv = spec.kind === 'square' ? NV : NJ;
      const junk = spec.kind === 'junk';
      const base = nvert;
      const w = nu + 1;
      for (let j = 0; j <= nv; j++)
        for (let i = 0; i <= nu; i++) {
          const u = i / nu,
            v = j / nv;
          let W: number, H: number;
          if (spec.kind === 'square') {
            W = spec.halfTop + spec.halfBot;
            H = spec.yTop - spec.yBot;
          } else if (spec.kind === 'junk') {
            W = spec.tack.distanceTo(spec.clew);
            H = spec.tack.distanceTo(spec.throat);
          } else {
            W = spec.tack.distanceTo(spec.clew);
            H = spec.tack.distanceTo(spec.head);
          }
          // UV en mètres pour la toile (grain, laizes verticales).
          uv.push((u - 0.5) * W, (1 - v) * H);
          sl.push(u, v);
          sd.push(W, H);
        }
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          const a = base + j * w + i;
          idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
        }
      nvert += w * (nv + 1);
      // Pourtour (ralingues).
      const border: number[] = [];
      if (spec.kind === 'square') {
        for (let i = 0; i <= nu; i++) border.push(i);
        for (let j = 1; j <= nv; j++) border.push(j * w + nu);
        for (let i = nu - 1; i >= 0; i--) border.push(nv * w + i);
        for (let j = nv - 1; j >= 0; j--) border.push(j * w);
      } else if (junk) {
        for (let i = 0; i <= nu; i++) border.push(i);
        for (let j = 1; j <= nv; j++) border.push(j * w + nu);
        for (let i = nu - 1; i >= 0; i--) border.push(nv * w + i);
        for (let j = nv - 1; j >= 0; j--) border.push(j * w);
      } else {
        for (let j = 0; j <= nv; j++) border.push(j * w);
        for (let j = nv; j >= 0; j--) border.push(j * w + nu);
        for (let i = nu - 1; i >= 1; i--) border.push(i);
        border.push(0);
      }
      const ropeBase = nrope;
      const R = 5;
      for (let b = 0; b < border.length - 1; b++)
        for (let r = 0; r < R; r++) {
          const a = ropeBase + b * R + r,
            c = ropeBase + b * R + ((r + 1) % R);
          ridx.push(a, c, a + R, c, c + R, a + R);
        }
      nrope += border.length * R;
      this.rts.push({
        spec,
        nu,
        nv,
        base,
        d: 1,
        phase: k * 1.7,
        border,
        ropeBase,
        wait: 0,
        lastWant: 1,
      });
    });
    this.pos = new Float32Array(nvert * 3);
    this.hol = new Float32Array(nvert);
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
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

    this.rpos = new Float32Array(nrope * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rpos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    rg.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(nrope * 2), 2)
    );
    rg.setIndex(ridx);
    this.ropes = new THREE.Mesh(rg, rope);
    this.ropes.castShadow = true;
    this.ropes.frustumCulled = false;

    // Manœuvres courantes : écoutes, cargue-points, cargue-fonds, drisses (2 segments chacune).
    // Voile à lattes : 5 lattes + écoute + drisse.
    for (const r of this.rts)
      this.nRun +=
        (r.spec.kind === 'square' ? 6 : r.spec.kind === 'junk' ? 7 : 3) * 2;
    const cylG = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    this.running = new THREE.InstancedMesh(cylG, rope, this.nRun);
    this.running.frustumCulled = false;
    this.running.castShadow = true;
    // Rabans : anneaux autour du rouleau, visibles quand la voile est carguée.
    for (const r of this.rts)
      if (r.spec.kind === 'square')
        this.nGasket += Math.max(2, Math.floor((2 * r.spec.halfTop) / 1.7));
    this.gaskets = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.09, 6, 14),
      rope,
      this.nGasket
    );
    this.gaskets.frustumCulled = false;
    this.update(0, 10);
  }

  /** En route (voiles établies et gonflées) ou à l'arrêt (carguées). */
  setUnderway(on: boolean) {
    this.target = on ? 1 : 0;
  }
  get underway() {
    return this.target > 0.5;
  }
  /** Manœuvre terminée (plus rien ne bouge hors de la brise). */
  get settled() {
    const goal = this.target > 0.5 ? 1 : 0.35;
    return (
      Math.abs(this.fill - goal) < 0.01 &&
      this.rts.every((r) => r.wait <= 0 && r.d === this.target)
    );
  }

  private squarePt(
    r: SailRt,
    s: SquareSpec,
    u: number,
    v: number,
    t: number,
    out: THREE.Vector3
  ) {
    const d = r.d;
    const fill = this.fill;
    const uu = u * 2 - 1;
    const H = s.yTop - s.yBot;
    // Voile établie : creux, bordure en arc, chute légèrement creuse.
    const half =
      (s.halfTop + (s.halfBot - s.halfTop) * v) *
      (1 - 0.035 * Math.sin(Math.PI * v));
    const live = fill * (0.3 + 0.7 * d);
    const sag = (1 - uu * uu) * 0.6 * v * v * (0.4 + 0.6 * live);
    const w =
      Math.pow(1 - uu * uu, 0.8) * Math.sin(Math.PI * (0.08 + v * 0.84));
    const breathe =
      1 +
      0.05 * Math.sin(t * 0.8 + r.phase) +
      0.03 * Math.sin(t * 2.1 + r.phase * 2);
    const edge = Math.pow(Math.abs(uu), 6) + Math.pow(v, 10);
    const flutter =
      live * 0.13 * edge * Math.sin(t * 7.5 - v * 9 - uu * 3 + r.phase);
    const ripple =
      live * 0.04 * w * Math.sin(t * 3.1 + uu * 4 + v * 5 + r.phase);
    // Plis de tension rayonnant des points d'écoute et des bouts de vergue,
    // petits plis verticaux sous la vergue (entre les points d'envergure).
    const zm = uu * half,
      ym = v * H;
    let folds = 0;
    for (const cz of [-1, 1])
      for (const top of [0, 1]) {
        const dz = zm - cz * (top ? s.halfTop : half),
          dy = ym - (top ? 0 : H);
        const rr = Math.hypot(dz, dy);
        const ang = Math.atan2(dy, dz * cz);
        const reach = top ? 0.18 * H + 0.6 : 0.32 * H + 1;
        folds +=
          (top ? 0.06 : 0.12) *
          Math.sin(ang * 11 + cz * 1.3 + top) *
          Math.exp(-rr / reach) *
          sm(0.1, 0.9, rr);
      }
    folds += 0.05 * Math.sin(zm * 2.6 + r.phase) * Math.exp(-ym / 1.1);
    const bulge =
      s.belly * live * (w + 0.25 * (1 - uu * uu) * v) * breathe +
      flutter +
      ripple +
      folds * live;
    this.cw = w * live;
    const x1 = s.x + 0.2 + bulge;
    const y1 = s.yTop - H * v + sag;
    const z1 = uu * half;
    // Toile ramassée : rouleau sur l'avant de la vergue, festons entre les rabans.
    const z0 = uu * s.halfTop * 0.97;
    const th = v * 5.6 + uu * 1.2;
    const rr = 0.36 + 0.1 * Math.sin(uu * 9 + v * 13) + 0.06 * v;
    const gp = (z0 + 50) / 1.7;
    const fest =
      Math.pow(Math.sin(Math.PI * (gp - Math.floor(gp))), 2) *
        (0.35 + 0.6 * v) +
      Math.pow(Math.abs(uu), 3) * 0.35;
    const bx =
      s.x +
      0.2 +
      0.32 +
      rr * Math.cos(th) * 0.8 +
      0.05 * Math.sin(t * 1.3 + uu * 4 + v * 3 + r.phase);
    let by =
      s.yardY +
      0.08 +
      rr * Math.sin(th) * 0.55 -
      fest * (1 - 0.5 * Math.abs(Math.cos(th)));
    by += 0.035 * Math.sin(t * 1.7 + uu * 5 + r.phase) * (0.5 + v);
    // Pendant la manœuvre, le paquet de toile est au niveau des points d'écoute.
    const lift = H * d * 0.98;
    const lo = d * 1.15 - 0.12,
      hi = d * 1.15 + 0.04;
    const g = sm(lo, hi, v);
    const pleats = (1 - d) * d * 4 * 0.3 * Math.sin(v * 38 + uu * 2) * (1 - g);
    this.cw *= 1 - g;
    out.set(
      x1 + pleats + (bx - x1) * g,
      y1 + (by - lift - y1) * g,
      z1 + (z0 - z1) * g
    );
  }

  private jibPt(
    r: SailRt,
    s: JibSpec,
    u: number,
    v: number,
    t: number,
    out: THREE.Vector3
  ) {
    const d = r.d;
    const live = this.fill * (0.3 + 0.7 * d);
    // Établi : guindant sur l'étai, creux profond au tiers avant, chute creuse.
    // L'étai fléchit un peu sous la poussée.
    const L = s.tack.clone().lerp(s.head, v);
    L.z += s.belly * live * 0.12 * Math.sin(Math.PI * v);
    const E = s.clew.clone().lerp(s.head, v);
    const p = L.lerp(E, u);
    const camber = Math.pow(u, 0.7) * (1 - u) * 2.6;
    const breathe = 1 + 0.06 * Math.sin(t * 0.9 + r.phase);
    p.z += s.belly * live * camber * (1 - Math.pow(v, 1.4)) * breathe;
    p.x -= 0.45 * Math.sin(Math.PI * v) * u * u;
    p.z += live * 0.14 * Math.pow(u, 6) * Math.sin(t * 8 - v * 10 + r.phase);
    // Plis rayonnant du point d'écoute, de la têtière et du point d'amure.
    const ra = (du: number, dv: number, k: number, reach: number) => {
      const rr = Math.hypot(du, dv);
      return (
        Math.sin(Math.atan2(dv, du) * k) *
        Math.exp(-rr / reach) *
        sm(0.03, 0.2, rr)
      );
    };
    p.z +=
      live *
      (0.14 * ra(1 - u, v, 10, 0.35) +
        0.1 * ra(u, 1 - v, 9, 0.3) +
        0.06 * ra(u, v, 8, 0.25));
    p.z += live * 0.07 * Math.sin(v * 26 + r.phase) * Math.pow(u, 3) * (1 - v);
    this.cw = camber * (1 - Math.pow(v, 1.4)) * live;
    // Amené : toile en paquet le long du bas de l'étai, qui pend sous le poids.
    const st = 0.04 + 0.36 * v;
    const S = s.tack.clone().lerp(s.head, st);
    const hang = (0.12 + 0.4 * u) * (1 + 0.3 * Math.sin(v * 21 + u * 7));
    const q = V(
      S.x + 0.05 * Math.sin(u * 13 + v * 9),
      S.y - hang + 0.03 * Math.sin(t * 1.6 + v * 6 + r.phase),
      S.z +
        0.16 * Math.sin(u * 11 + v * 17) +
        0.05 * Math.sin(t * 1.2 + u * 5 + r.phase)
    );
    const k = sm(0, 1, (1 - d) * 1.5 - v * 0.5);
    // Signe négatif : sur un foc, le côté creux est la face avant.
    this.cw *= -(1 - k);
    out.copy(p).lerp(q, k);
  }

  private junkPt(
    r: SailRt,
    s: JunkSpec,
    u: number,
    v: number,
    t: number,
    out: THREE.Vector3
  ) {
    // u : guindant (mât) → chute ; v : bôme (0) → pic (1).
    const d = r.d;
    const live = this.fill * (0.3 + 0.7 * d);
    const lo = s.tack.clone().lerp(s.clew, u);
    const hi = s.throat.clone().lerp(s.peak, u);
    const p = lo.lerp(hi, v);
    // Creux entre les lattes (5 panneaux) et creux général.
    const panel = Math.abs(Math.sin(v * Math.PI * 5));
    const camber = Math.pow(u, 0.6) * (1 - u) * 2.4;
    p.z +=
      s.belly *
      live *
      camber *
      (0.75 + 0.25 * panel) *
      (1 + 0.05 * Math.sin(t * 0.9 + r.phase));
    p.z += live * 0.1 * Math.pow(u, 5) * Math.sin(t * 7 - v * 9 + r.phase);
    this.cw = camber * live;
    // Amenée : les panneaux s'empilent en accordéon sur la bôme.
    const fold = v * 5;
    const fk = fold - Math.floor(fold);
    const stack = s.tack.clone().lerp(s.clew, u);
    stack.y += 0.12 * Math.floor(fold) + 0.1 * Math.sin(fk * Math.PI);
    stack.z +=
      0.18 * Math.sin(fk * Math.PI) * (Math.floor(fold) % 2 ? 1 : -1) +
      0.03 * Math.sin(t * 1.5 + u * 4);
    const k = sm(0, 1, (1 - d) * 1.4 - (1 - v) * 0.4);
    this.cw *= -(1 - k);
    out.copy(p).lerp(stack, k);
  }

  private pt(r: SailRt, u: number, v: number, t: number, out: THREE.Vector3) {
    if (r.spec.kind === 'square') this.squarePt(r, r.spec, u, v, t, out);
    else if (r.spec.kind === 'junk') this.junkPt(r, r.spec, u, v, t, out);
    else this.jibPt(r, r.spec, u, v, t, out);
    return out;
  }

  private line(
    i: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    sag: number,
    rad: number
  ) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= sag;
    this.seg(i, a, mid, rad);
    this.seg(i + 1, mid, b, rad);
  }
  private seg(i: number, a: THREE.Vector3, b: THREE.Vector3, rad: number) {
    const dv = b.clone().sub(a);
    const len = dv.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      V(0, 1, 0),
      len > 1e-5 ? dv.divideScalar(len) : V(0, 1, 0)
    );
    this.tmp.compose(
      a.clone().add(b).multiplyScalar(0.5),
      q,
      V(rad, Math.max(len, 1e-3), rad)
    );
    this.running.setMatrixAt(i, this.tmp);
  }

  update(t: number, dt: number) {
    // Le vent dans la toile suit l'allure ; chaque voile manœuvre à son tour.
    this.fill +=
      ((this.target > 0.5 ? 1 : 0.35) - this.fill) * Math.min(1, dt * 0.8);
    const p = V();
    let ri = 0,
      gi = 0;
    this.rts.forEach((r, k) => {
      const s = r.spec;
      // Établir : basses voiles d'abord ; carguer : hautes voiles d'abord.
      const order = this.target > 0.5 ? s.tier : 3 - s.tier;
      const delay = order * 0.9 + (k % 3) * 0.25;
      const want = this.target;
      const rate = 1 / 4.5;
      if (r.lastWant !== want) {
        r.lastWant = want;
        r.wait = delay;
      }
      if (r.wait > 0) r.wait -= dt;
      else
        r.d +=
          Math.sign(want - r.d) * Math.min(Math.abs(want - r.d), dt * rate);
      const ease = r.d * r.d * (3 - 2 * r.d);
      const keep = r.d;
      r.d = ease;
      const w = r.nu + 1;
      for (let j = 0; j <= r.nv; j++)
        for (let i = 0; i <= r.nu; i++) {
          this.pt(r, i / r.nu, j / r.nv, t, p);
          const o = (r.base + j * w + i) * 3;
          this.pos[o] = p.x;
          this.pos[o + 1] = p.y;
          this.pos[o + 2] = p.z;
          this.hol[r.base + j * w + i] = this.cw;
        }
      // Ralingues : petit tube à 5 pans le long du pourtour.
      const R = 5;
      const rad = s.kind === 'square' ? 0.065 : 0.055;
      for (let b = 0; b < r.border.length; b++) {
        const vi = r.base + r.border[b];
        const c = V(
          this.pos[vi * 3],
          this.pos[vi * 3 + 1],
          this.pos[vi * 3 + 2]
        );
        const nb = r.border[Math.min(r.border.length - 1, b + 1)];
        const pb = r.border[Math.max(0, b - 1)];
        const tg = V(
          this.pos[(r.base + nb) * 3] - this.pos[(r.base + pb) * 3],
          this.pos[(r.base + nb) * 3 + 1] - this.pos[(r.base + pb) * 3 + 1],
          this.pos[(r.base + nb) * 3 + 2] - this.pos[(r.base + pb) * 3 + 2]
        ).normalize();
        const n1 =
          Math.abs(tg.y) < 0.9
            ? V(0, 1, 0).cross(tg).normalize()
            : V(1, 0, 0).cross(tg).normalize();
        const n2 = tg.clone().cross(n1);
        for (let q = 0; q < R; q++) {
          const a = (q / R) * Math.PI * 2;
          const o = (r.ropeBase + b * R + q) * 3;
          this.rpos[o] = c.x + (n1.x * Math.cos(a) + n2.x * Math.sin(a)) * rad;
          this.rpos[o + 1] =
            c.y + (n1.y * Math.cos(a) + n2.y * Math.sin(a)) * rad;
          this.rpos[o + 2] =
            c.z + (n1.z * Math.cos(a) + n2.z * Math.sin(a)) * rad;
        }
      }
      // Manœuvres courantes et rabans.
      const slack = 1 - r.d;
      const sway = (x: number) => 0.04 * Math.sin(t * 1.4 + x + r.phase);
      if (s.kind === 'square') {
        for (const side of [-1, 1]) {
          const u = side < 0 ? 0 : 1;
          const clew = this.pt(r, u, 1, t, V());
          const to = s.sheetTo(side);
          this.line(
            ri,
            clew,
            to,
            0.04 * clew.distanceTo(to) * (0.15 + slack) + sway(side),
            0.03
          );
          ri += 2;
          const cl = V(s.x + 0.35, s.yardY, side * s.halfTop * 0.45);
          this.line(ri, clew, cl, 0.05 * slack + sway(side + 1), 0.02);
          ri += 2;
          const foot = this.pt(r, 0.5 + side * 0.18, 1, t, V());
          const bt = V(s.x + 0.6, s.yardY + 0.12, side * s.halfTop * 0.18);
          this.line(ri, foot, bt, 0.02 + sway(side + 2) * 0.5, 0.018);
          ri += 2;
        }
        const ng = Math.max(2, Math.floor((2 * s.halfTop) / 1.7));
        const fs = sm(0.6, 1, slack);
        for (let q = 0; q < ng; q++) {
          const z = -s.halfTop * 0.9 + ((q + 0.5) / ng) * s.halfTop * 1.8;
          this.tmp.compose(
            V(s.x + 0.56, s.yardY + 0.05 + 0.02 * Math.sin(t * 1.7 + q), z),
            new THREE.Quaternion(),
            V(0.52 * fs + 1e-4, 0.44 * fs + 1e-4, 0.3 * fs + 1e-4)
          );
          this.gaskets.setMatrixAt(gi++, this.tmp);
        }
      } else if (s.kind === 'junk') {
        for (let q = 1; q <= 5; q++) {
          const a = this.pt(r, 0, q / 5.5, t, V());
          const b = this.pt(r, 1, q / 5.5, t, V());
          this.line(ri, a, b, 0, 0.035);
          ri += 2;
        }
        const clew = this.pt(r, 1, 0, t, V());
        this.line(ri, clew, s.sheetTo(1), 0.05 * slack + sway(1), 0.025);
        ri += 2;
        const peak = this.pt(r, 1, 1, t, V());
        this.line(ri, peak, s.halyardTo, 0.02 + slack * 0.3, 0.025);
        ri += 2;
      } else {
        for (const side of [-1, 1]) {
          const clew = this.pt(r, 1, 0, t, V());
          const to = s.sheetTo(side);
          // L'écoute sous le vent est tendue, l'autre mollit.
          const tight = side > 0 ? 0.1 : 1;
          this.line(
            ri,
            clew,
            to,
            0.05 * clew.distanceTo(to) * (tight * 0.6 + slack * 0.5) +
              sway(side),
            0.025
          );
          ri += 2;
        }
        const head = this.pt(r, 0, 1, t, V());
        this.line(ri, head, s.halyardTo, 0.02 + slack * 0.4, 0.025);
        ri += 2;
      }
      r.d = keep;
    });
    const g = this.sails.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.hol.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const rg = this.ropes.geometry;
    rg.attributes.position.needsUpdate = true;
    rg.computeVertexNormals();
    this.running.instanceMatrix.needsUpdate = true;
    this.gaskets.instanceMatrix.needsUpdate = true;
  }

  /** Avance d'un coup jusqu'à l'état visé (pas d'animation). */
  snap() {
    this.rts.forEach((r) => {
      r.d = this.target;
      r.lastWant = this.target;
      r.wait = 0;
    });
    this.fill = this.target > 0.5 ? 1 : 0.35;
  }
}
