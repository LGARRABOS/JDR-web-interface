import {
  identity,
  invert,
  multiply,
  normalize,
  sub,
  cross,
  transformDir,
  transformPoint,
  type Mat4,
  type Vec3,
} from './math';

// Construction de maillages procéduraux. Chaque sommet porte : position,
// normale, coordonnées de motif (en mètres), couleur linéaire et matériau
// (motif, métal, rugosité, émission).

/** Motifs calculés dans le shader. */
export const P = {
  PLAIN: 0,
  WOOD: 1,
  PLATES: 2,
  BRASS: 3,
  COPPER: 4,
  PATINA: 5,
  SAIL: 6,
  EMIT: 7,
  SAND: 8,
  ROCK: 9,
  IRON: 10,
  DECK: 11,
  GLASS: 12,
  RUST: 13,
  /** Enduit de façade (chaux ou pisé) : écaillures, salissures, coulures. */
  PLASTER: 14,
  /** Briques en assises, joints de mortier. */
  BRICK: 15,
  /** Brume d'Aether animée (mer de nuages de la position inconnue). */
  MIST: 16,
} as const;

export interface Mat {
  p: number;
  color: Vec3;
  metal: number;
  rough: number;
  emit?: number;
}

export const STRIDE = 15;

export interface MeshData {
  data: Float32Array;
  index: Uint32Array;
}

export class MeshBuilder {
  private data: number[] = [];
  private idx: number[] = [];
  private count = 0;
  private m: Mat4 = identity();
  private nm: Mat4 = identity();
  private stack: Mat4[] = [];

  get vertexCount() {
    return this.count;
  }

  push(t: Mat4) {
    this.stack.push(this.m);
    this.setMatrix(multiply(this.m, t));
  }

  pop() {
    this.setMatrix(this.stack.pop() ?? identity());
  }

  private setMatrix(m: Mat4) {
    this.m = m;
    const inv = invert(m);
    // Transposée de l'inverse pour les normales.
    const t = new Float32Array(16);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) t[c * 4 + r] = inv[r * 4 + c];
    this.nm = t;
  }

  vertex(p: Vec3, n: Vec3, uv: [number, number], mat: Mat): number {
    const wp = transformPoint(this.m, p);
    const wn = normalize(transformDir(this.nm, n));
    this.data.push(
      wp[0],
      wp[1],
      wp[2],
      wn[0],
      wn[1],
      wn[2],
      uv[0],
      uv[1],
      mat.color[0],
      mat.color[1],
      mat.color[2],
      mat.p,
      mat.metal,
      mat.rough,
      mat.emit ?? 0
    );
    return this.count++;
  }

  /** Sommet sans transformation ni normalisation (données libres dans la normale). */
  rawVertex(p: Vec3, n: Vec3, uv: [number, number], mat: Mat): number {
    this.data.push(
      p[0],
      p[1],
      p[2],
      n[0],
      n[1],
      n[2],
      uv[0],
      uv[1],
      mat.color[0],
      mat.color[1],
      mat.color[2],
      mat.p,
      mat.metal,
      mat.rough,
      mat.emit ?? 0
    );
    return this.count++;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * Révolution d'un profil [rayon, hauteur] autour de l'axe Y local.
   * Les angles vifs (> 40°) gardent des normales séparées.
   */
  lathe(
    profile: [number, number][],
    seg: number,
    mat: Mat,
    opts: { arc?: number; uScale?: number } = {}
  ) {
    const arc = opts.arc ?? Math.PI * 2;
    const rMax = Math.max(...profile.map((p) => p[0]), 0.01);
    const uScale = opts.uScale ?? arc * rMax;
    const sn: [number, number][] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const dr = profile[i + 1][0] - profile[i][0];
      const dy = profile[i + 1][1] - profile[i][1];
      const l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]);
    }
    const smoothN = (
      a: [number, number] | undefined,
      b: [number, number]
    ): [number, number] => {
      if (!a) return b;
      if (a[0] * b[0] + a[1] * b[1] < 0.77) return b;
      const x = a[0] + b[0];
      const y = a[1] + b[1];
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    let v = 0;
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i];
      const [r1, y1] = profile[i + 1];
      const len = Math.hypot(r1 - r0, y1 - y0);
      if (len < 1e-6) continue;
      const n0 = smoothN(sn[i - 1], sn[i]);
      const n1 = smoothN(sn[i + 1], sn[i]);
      const base = this.count;
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * arc;
        const c = Math.cos(a);
        const si = Math.sin(a);
        const u = (s / seg) * uScale;
        this.vertex(
          [r0 * c, y0, r0 * si],
          [n0[0] * c, n0[1], n0[0] * si],
          [u, v],
          mat
        );
        this.vertex(
          [r1 * c, y1, r1 * si],
          [n1[0] * c, n1[1], n1[0] * si],
          [u, v + len],
          mat
        );
      }
      for (let s = 0; s < seg; s++) {
        const a = base + s * 2;
        this.quad(a, a + 2, a + 3, a + 1);
      }
      v += len;
    }
  }

  cylinder(r: number, h: number, seg: number, mat: Mat, caps = true) {
    this.lathe(
      caps
        ? [
            [0, 0],
            [r, 0],
            [r, 0],
            [r, h],
            [r, h],
            [0, h],
          ]
        : [
            [r, 0],
            [r, h],
          ],
      seg,
      mat
    );
  }

  sphere(r: number, seg: number, mat: Mat, hemi = false) {
    const rings = Math.max(4, Math.round(seg / 2));
    const prof: [number, number][] = [];
    const start = hemi ? 0 : -Math.PI / 2;
    for (let i = 0; i <= rings; i++) {
      const a = start + ((Math.PI / 2 - start) * i) / rings;
      prof.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    prof[prof.length - 1][0] = 0;
    this.lathe(prof, seg, mat);
  }

  torus(R: number, r: number, seg: number, tube: number, mat: Mat) {
    const base = this.count;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let j = 0; j <= tube; j++) {
        const b = (j / tube) * Math.PI * 2;
        const cb = Math.cos(b);
        const sb = Math.sin(b);
        this.vertex(
          [(R + r * cb) * ca, r * sb, (R + r * cb) * sa],
          [cb * ca, sb, cb * sa],
          [(i / seg) * R * 6.28, (j / tube) * r * 6.28],
          mat
        );
      }
    }
    for (let i = 0; i < seg; i++)
      for (let j = 0; j < tube; j++) {
        const a = base + i * (tube + 1) + j;
        const b = a + tube + 1;
        this.quad(a, a + 1, b + 1, b);
      }
  }

  /**
   * Arêtes adoucies des pavés (rayon max, m) : un chanfrein aux normales
   * lissées, qui accroche la lumière comme une arête arrondie.
   */
  static bevel = 0.1;

  /** Pavé centré en x et z, de y = 0 à y = h (arêtes adoucies). */
  box(w: number, h: number, d: number, mat: Mat) {
    const r = Math.min(MeshBuilder.bevel, Math.min(w, h, d) * 0.12);
    if (r < 0.01) return this.sharpBox(w, h, d, mat);
    const ext: Vec3 = [w / 2, h / 2, d / 2];
    const cy = h / 2;
    // Sommet d'un coin c (signes) vu depuis la face d'axe k : rentré de r
    // sur les deux autres axes.
    const P = (c: Vec3, k: number): Vec3 => {
      const p: Vec3 = [0, 0, 0];
      for (let i = 0; i < 3; i++)
        p[i] = c[i] * ext[i] - (i === k ? 0 : c[i] * r);
      p[1] += cy;
      return p;
    };
    const N = (c: Vec3, k: number): Vec3 => {
      const n: Vec3 = [0, 0, 0];
      n[k] = c[k];
      return n;
    };
    const uvOf = (p: Vec3, k: number): [number, number] =>
      k === 0 ? [p[2], p[1]] : k === 1 ? [p[0], p[2]] : [p[0], p[1]];
    // Polygone orienté vers l'extérieur.
    const poly = (pts: Vec3[], ns: Vec3[], ks: number[]) => {
      const e1 = [
        pts[1][0] - pts[0][0],
        pts[1][1] - pts[0][1],
        pts[1][2] - pts[0][2],
      ];
      const e2 = [
        pts[2][0] - pts[0][0],
        pts[2][1] - pts[0][1],
        pts[2][2] - pts[0][2],
      ];
      const cx = e1[1] * e2[2] - e1[2] * e2[1];
      const cyy = e1[2] * e2[0] - e1[0] * e2[2];
      const cz = e1[0] * e2[1] - e1[1] * e2[0];
      const o = pts[0];
      const out = cx * o[0] + cyy * (o[1] - cy) + cz * o[2];
      const order = pts.map((_, i) => i);
      if (out < 0) order.reverse();
      const ids = order.map((i) =>
        this.vertex(pts[i], ns[i], uvOf(pts[i], ks[i]), mat)
      );
      if (ids.length === 3) this.tri(ids[0], ids[1], ids[2]);
      else this.quad(ids[0], ids[1], ids[2], ids[3]);
    };
    const S = [-1, 1];
    // Faces.
    for (let k = 0; k < 3; k++)
      for (const sk of S) {
        const a = (k + 1) % 3,
          b = (k + 2) % 3;
        const cs: Vec3[] = [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ];
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].forEach(([ua, ub], i) => {
          cs[i][k] = sk;
          cs[i][a] = ua;
          cs[i][b] = ub;
        });
        poly(
          cs.map((c) => P(c, k)),
          cs.map((c) => N(c, k)),
          [k, k, k, k]
        );
      }
    // Chanfreins des arêtes (entre les faces k1 et k2).
    for (let k1 = 0; k1 < 3; k1++)
      for (let k2 = k1 + 1; k2 < 3; k2++) {
        const t = 3 - k1 - k2;
        for (const s1 of S)
          for (const s2 of S) {
            const c0: Vec3 = [0, 0, 0],
              c1: Vec3 = [0, 0, 0];
            c0[k1] = c1[k1] = s1;
            c0[k2] = c1[k2] = s2;
            c0[t] = -1;
            c1[t] = 1;
            poly(
              [P(c0, k1), P(c1, k1), P(c1, k2), P(c0, k2)],
              [N(c0, k1), N(c1, k1), N(c1, k2), N(c0, k2)],
              [k1, k1, k2, k2]
            );
          }
      }
    // Coins.
    for (const sx of S)
      for (const sy of S)
        for (const sz of S) {
          const c: Vec3 = [sx, sy, sz];
          poly(
            [P(c, 0), P(c, 1), P(c, 2)],
            [N(c, 0), N(c, 1), N(c, 2)],
            [0, 1, 2]
          );
        }
  }

  /** Pavé à arêtes vives (centré en x et z, de y = 0 à y = h). */
  sharpBox(w: number, h: number, d: number, mat: Mat) {
    const x = w / 2;
    const z = d / 2;
    const faces: [Vec3, Vec3[], number, number][] = [
      [
        [1, 0, 0],
        [
          [x, 0, z],
          [x, 0, -z],
          [x, h, -z],
          [x, h, z],
        ],
        d,
        h,
      ],
      [
        [-1, 0, 0],
        [
          [-x, 0, -z],
          [-x, 0, z],
          [-x, h, z],
          [-x, h, -z],
        ],
        d,
        h,
      ],
      [
        [0, 1, 0],
        [
          [-x, h, z],
          [x, h, z],
          [x, h, -z],
          [-x, h, -z],
        ],
        w,
        d,
      ],
      [
        [0, -1, 0],
        [
          [-x, 0, -z],
          [x, 0, -z],
          [x, 0, z],
          [-x, 0, z],
        ],
        w,
        d,
      ],
      [
        [0, 0, 1],
        [
          [-x, 0, z],
          [x, 0, z],
          [x, h, z],
          [-x, h, z],
        ],
        w,
        h,
      ],
      [
        [0, 0, -1],
        [
          [x, 0, -z],
          [-x, 0, -z],
          [-x, h, -z],
          [x, h, -z],
        ],
        w,
        h,
      ],
    ];
    for (const [n, q, uw, vh] of faces) {
      const a = this.vertex(q[0], n, [0, 0], mat);
      const b = this.vertex(q[1], n, [uw, 0], mat);
      const c = this.vertex(q[2], n, [uw, vh], mat);
      const d2 = this.vertex(q[3], n, [0, vh], mat);
      this.quad(a, b, c, d2);
    }
  }

  /**
   * Surface paramétrée (u, v ∈ [0, 1]). Normales par différences finies,
   * orientées selon dP/du × dP/dv (flip pour inverser).
   */
  grid(
    nu: number,
    nv: number,
    fn: (u: number, v: number) => Vec3,
    mat: Mat | ((u: number, v: number) => Mat),
    opts: {
      uv?: (u: number, v: number) => [number, number];
      flip?: boolean;
    } = {}
  ) {
    const base = this.count;
    const e = 1e-3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        const p = fn(u, v);
        const du = sub(fn(Math.min(1, u + e), v), fn(Math.max(0, u - e), v));
        const dv = sub(fn(u, Math.min(1, v + e)), fn(u, Math.max(0, v - e)));
        let n = normalize(cross(du, dv));
        if (opts.flip) n = [-n[0], -n[1], -n[2]];
        const m = typeof mat === 'function' ? mat(u, v) : mat;
        this.vertex(p, n, opts.uv ? opts.uv(u, v) : [u, v], m);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + nu + 1;
        if (opts.flip) this.quad(a, b, b + 1, a + 1);
        else this.quad(a, a + 1, b + 1, b);
      }
  }

  /** Tube le long d'une polyligne (tuyaux, cordages épais). */
  tube(points: Vec3[], r: number, seg: number, mat: Mat) {
    let prevN: Vec3 = [0, 1, 0];
    const rings: { c: Vec3; n: Vec3; b: Vec3 }[] = [];
    for (let i = 0; i < points.length; i++) {
      const t = normalize(
        sub(
          points[Math.min(points.length - 1, i + 1)],
          points[Math.max(0, i - 1)]
        )
      );
      let b = cross(t, prevN);
      if (Math.hypot(...b) < 1e-3) b = cross(t, [1, 0, 0]);
      b = normalize(b);
      const n = normalize(cross(b, t));
      prevN = n;
      rings.push({ c: points[i], n, b });
    }
    const base = this.count;
    let v = 0;
    rings.forEach((ring, i) => {
      if (i) v += Math.hypot(...sub(ring.c, rings[i - 1].c));
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const d: Vec3 = [
          ring.n[0] * Math.cos(a) + ring.b[0] * Math.sin(a),
          ring.n[1] * Math.cos(a) + ring.b[1] * Math.sin(a),
          ring.n[2] * Math.cos(a) + ring.b[2] * Math.sin(a),
        ];
        this.vertex(
          [ring.c[0] + d[0] * r, ring.c[1] + d[1] * r, ring.c[2] + d[2] * r],
          d,
          [(s / seg) * r * 6.28, v],
          mat
        );
      }
    });
    for (let i = 0; i < rings.length - 1; i++)
      for (let s = 0; s < seg; s++) {
        const a = base + i * (seg + 1) + s;
        const b = a + seg + 1;
        this.quad(a, b, b + 1, a + 1);
      }
  }

  build(): MeshData {
    return {
      data: new Float32Array(this.data),
      index: new Uint32Array(this.idx),
    };
  }
}
