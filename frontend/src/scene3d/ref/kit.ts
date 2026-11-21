import * as THREE from 'three';
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

/** Boîte aux UV en mètres. */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Faces : +x, -x, +y, -y, +z, -z (4 sommets chacune).
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  return g;
}

/** Cylindre (axe Y) aux UV en mètres : u autour, v le long. */
export function cyl(
  r0: number,
  r1: number,
  h: number,
  seg = 16,
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
  tube = 6,
  arc = Math.PI * 2
) {
  const g = new THREE.TorusGeometry(R, r, tube, seg, arc);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * arc * R, uv.getY(i) * Math.PI * 2 * r);
  return g;
}

export function sphere(r: number, seg = 16, phiLen = Math.PI) {
  const g = new THREE.SphereGeometry(
    r,
    seg * 2,
    seg,
    0,
    Math.PI * 2,
    0,
    phiLen
  );
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
  const corners: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
  ];
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
  return grid(4, n - 1, (i, j) => {
    const f = frames[j];
    const [a, b] = corners[i];
    return {
      p: f.p
        .clone()
        .addScaledVector(f.s, a * w)
        .addScaledVector(f.u, b * h),
      uv: [f.acc, i * (w + h) * 0.5],
    };
  });
}
