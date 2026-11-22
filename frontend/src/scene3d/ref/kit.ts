import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Outils de modelage : géométries aux UV en mètres, regroupées par matériau
// puis fusionnées (quelques appels de dessin pour tout le navire).

export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private ropes: THREE.Matrix4[] = [];

  add(
    mat: THREE.Material,
    g: THREE.BufferGeometry,
    m?: THREE.Matrix4
  ): THREE.BufferGeometry {
    if (!g.index) {
      const idx: number[] = [];
      for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
    for (const k of Object.keys(g.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv')
        g.deleteAttribute(k);
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array(g.attributes.position.count * 2),
          2
        )
      );
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    return g;
  }

  /** Cordage : cylindre fin de a à b. */
  rope(a: THREE.Vector3, b: THREE.Vector3, r = 0.035) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-3) return;
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.divideScalar(len)
    );
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    this.ropes.push(
      new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r, len, r))
    );
  }

  build(ropeMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      list.forEach((x) => x.dispose());
    }
    if (this.ropes.length) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
      const im = new THREE.InstancedMesh(geo, ropeMat, this.ropes.length);
      this.ropes.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      g.add(im);
    }
    return g;
  }
}

/** UV planaires (en mètres) selon l'axe dominant de la normale. */
function boxUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (ax >= ay && ax >= az) uv.set([z, y], i * 2);
    else if (ay >= az) uv.set([x, z], i * 2);
    else uv.set([x, y], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Bloc aux arêtes arrondies (jamais de cube brut), UV en mètres. */
export function box(
  w: number,
  h: number,
  d: number,
  r?: number
): THREE.BufferGeometry {
  const rr = r ?? Math.min(0.08, Math.min(w, h, d) * 0.22);
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.002, rr));
  boxUV(g);
  return g;
}

/** Solide de révolution (axe Y) : profil [rayon, hauteur], UV en mètres. */
export function lathe(
  profile: [number, number][],
  seg = 48,
  phiLen = Math.PI * 2
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
    seg,
    0,
    phiLen
  );
  let len = 0;
  for (let i = 1; i < profile.length; i++)
    len += Math.hypot(
      profile[i][0] - profile[i - 1][0],
      profile[i][1] - profile[i - 1][1]
    );
  const rmax = Math.max(...profile.map((p) => p[0]));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * phiLen * rmax, uv.getY(i) * len);
  return g;
}

/** Tube lisse le long d'une courbe passant par les points donnés. */
export function tube(
  pts: THREE.Vector3[],
  r: number,
  seg = 48,
  radial = 12
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
  const len = curve.getLength();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * len, uv.getY(i) * Math.PI * 2 * r);
  return g;
}

/** Courbe de Bézier quadratique échantillonnée. */
export function bez(
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  n = 12
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(
      a
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(c, 2 * t * (1 - t))
        .addScaledVector(b, t * t)
    );
  }
  return out;
}

/** Cylindre (axe Y) aux UV en mètres : u autour, v le long. */
export function cyl(
  r0: number,
  r1: number,
  h: number,
  seg = 32,
  open = false
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const c = Math.PI * (r0 + r1);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * c, uv.getY(i) * h);
  return g;
}

export function torus(
  R: number,
  r: number,
  seg = 24,
  tubeSeg = 6,
  arc = Math.PI * 2
) {
  // Toujours assez de facettes pour paraître lisse.
  const g = new THREE.TorusGeometry(
    R,
    r,
    Math.max(10, tubeSeg),
    Math.max(48, seg * 2),
    arc
  );
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * arc * R, uv.getY(i) * Math.PI * 2 * r);
  return g;
}

export function sphere(r: number, seg = 16, phiLen = Math.PI) {
  const sg = Math.max(16, seg);
  const g = new THREE.SphereGeometry(r, sg * 2, sg, 0, Math.PI * 2, 0, phiLen);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * Math.PI * r);
  return g;
}

/** Matrice : position, rotation (Euler XYZ), échelle. */
export function M(
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  s: number | THREE.Vector3 = 1
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : s
  );
}

/** Repère orienté : origine p, axe Y le long de dir. */
export function along(p: THREE.Vector3, dir: THREE.Vector3): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}

/** Surface paramétrée (grille nu × nv) ; f renvoie la position et (u, v) en mètres. */
export function grid(
  nu: number,
  nv: number,
  f: (i: number, j: number) => { p: THREE.Vector3; uv: [number, number] },
  flip = false
): THREE.BufferGeometry {
  const pos: number[] = [],
    uvs: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const r = f(i, j);
      pos.push(r.p.x, r.p.y, r.p.z);
      uvs.push(r.uv[0], r.uv[1]);
    }
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * w + i,
        b = a + 1,
        c = a + w,
        d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Profil rectangulaire (largeur w, hauteur h) balayé le long d'une polyligne. */
export function sweep(
  pts: THREE.Vector3[],
  w: number,
  h: number,
  up = new THREE.Vector3(0, 1, 0),
  side?: (i: number) => THREE.Vector3
): THREE.BufferGeometry {
  const n = pts.length;
  // Profil en rectangle aux coins arrondis (superellipse), refermé.
  const NP = 20;
  const corners: [number, number][] = [];
  for (let i = 0; i <= NP; i++) {
    const a = (i / NP) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a),
      sn = Math.sin(a);
    corners.push([
      0.5 * Math.sign(c) * Math.pow(Math.abs(c), 0.5),
      0.5 * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5),
    ]);
  }
  let acc = 0;
  const frames = pts.map((p, i) => {
    const t = new THREE.Vector3()
      .subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])
      .normalize();
    if (i > 0) acc += p.distanceTo(pts[i - 1]);
    const s = side
      ? side(i).clone()
      : new THREE.Vector3().crossVectors(t, up).normalize();
    const u = new THREE.Vector3().crossVectors(s, t).normalize();
    return { p, s, u, acc };
  });
  return grid(NP, n - 1, (i, j) => {
    const f = frames[j];
    const [a, b] = corners[i];
    return {
      p: f.p
        .clone()
        .addScaledVector(f.s, a * w)
        .addScaledVector(f.u, b * h),
      uv: [f.acc, (i / NP) * (w + h) * 2],
    };
  });
}
