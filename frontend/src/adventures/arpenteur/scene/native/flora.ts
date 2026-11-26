import * as THREE from 'three';
import { COMMON } from '../../render/shaders';
import { bez, Kit, tube } from '../ref/kit';

// Végétation de la savane de Mahibori : sylvabaobs (tronc-bouteille aux
// racines qui broient la roche, couronne de branches noueuses), acacias en
// parasol, et herbes sèches dessinées en lot sur la carte graphique.

function rnd(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 7;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export interface FloraMats {
  bark: THREE.Material;
  leaf: THREE.Material;
  rock: THREE.Material;
  rope: THREE.Material;
}

/** Feuillage : grappe de boules aplaties autour d'un point. */
function foliage(
  k: Kit,
  m: THREE.Material,
  c: THREE.Vector3,
  r: number,
  n: number,
  r0: () => number
) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(r * (0.55 + 0.45 * r0()), 1);
    const p = c
      .clone()
      .add(
        new THREE.Vector3(
          (r0() - 0.5) * r * 1.6,
          (r0() - 0.3) * r * 0.5,
          (r0() - 0.5) * r * 1.6
        )
      );
    g.scale(1, 0.55, 1);
    g.translate(p.x, p.y, p.z);
    k.add(m, g);
  }
}

/**
 * Sylvabaob de hauteur H : tronc renflé et cannelé, racines qui s'enfoncent
 * dans des blocs fendus, branches épaisses en couronne et feuillage clairsemé.
 */
export function sylvabaob(
  mats: FloraMats,
  H: number,
  seed: number
): THREE.Group {
  const k = new Kit();
  const r0 = rnd(seed);
  const R = H * 0.13;
  const trunkH = H * 0.62;
  // Tronc : profil en bouteille, cannelures et nœuds.
  const nu = 40,
    nv = 24;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const v = j / nv,
        a = (i / nu) * Math.PI * 2;
      const bottle =
        1 + 0.35 * Math.sin(Math.PI * Math.min(1, v * 1.3)) - 0.45 * v * v;
      const flute =
        1 +
        0.07 * Math.sin(a * 9 + v * 3 + seed) +
        0.05 * Math.sin(a * 4 - v * 7);
      const foot = 1 + 0.5 * Math.pow(1 - Math.min(1, v * 6), 2);
      const r = R * bottle * flute * foot;
      pos.push(Math.cos(a) * r, v * trunkH, Math.sin(a) * r);
      uv.push((i / nu) * R * 6, v * trunkH);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
    }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  k.add(mats.bark, tg);
  // Racines qui plongent et broient la roche.
  const nr = 7 + Math.floor(r0() * 4);
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * Math.PI * 2 + r0() * 0.4;
    const d = R * (1.6 + r0() * 1.4);
    const p0 = new THREE.Vector3(
      Math.cos(a) * R * 1.1,
      R * 0.5,
      Math.sin(a) * R * 1.1
    );
    const p2 = new THREE.Vector3(Math.cos(a) * d, -R * 0.3, Math.sin(a) * d);
    const p1 = p0
      .clone()
      .lerp(p2, 0.5)
      .add(new THREE.Vector3(0, R * 0.25, 0));
    k.add(
      mats.bark,
      tube(bez(p0, p1, p2, 10), R * (0.16 + r0() * 0.08), 10, 8)
    );
    if (r0() < 0.6) {
      // Bloc fendu traversé par la racine.
      for (const s of [-1, 1]) {
        const g = new THREE.IcosahedronGeometry(R * (0.35 + r0() * 0.25), 1);
        g.scale(1, 0.7, 0.8);
        const q = p2
          .clone()
          .add(
            new THREE.Vector3(
              -Math.sin(a) * s * R * 0.25,
              R * 0.05,
              Math.cos(a) * s * R * 0.25
            )
          );
        g.translate(q.x, q.y, q.z);
        k.add(mats.rock, g);
      }
    }
  }
  // Couronne : branches épaisses qui se divisent, feuillage clairsemé.
  const top = new THREE.Vector3(0, trunkH, 0);
  const nb = 7 + Math.floor(r0() * 4);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r0() * 0.5;
    const reach = H * (0.22 + r0() * 0.12);
    const rise = H * (0.12 + r0() * 0.18);
    const b0 = top
      .clone()
      .add(
        new THREE.Vector3(
          Math.cos(a) * R * 0.4,
          -R * 0.2,
          Math.sin(a) * R * 0.4
        )
      );
    const b2 = top
      .clone()
      .add(new THREE.Vector3(Math.cos(a) * reach, rise, Math.sin(a) * reach));
    const b1 = b0
      .clone()
      .lerp(b2, 0.4)
      .add(new THREE.Vector3(0, rise * 0.5, 0));
    k.add(mats.bark, tube(bez(b0, b1, b2, 10), R * 0.22, 10, 8));
    for (let t = 0; t < 3; t++) {
      const aa = a + (r0() - 0.5) * 1.6;
      const len = reach * (0.35 + r0() * 0.3);
      const s0 = b2.clone();
      const s2 = s0
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(aa) * len,
            len * (0.2 + r0() * 0.5),
            Math.sin(aa) * len
          )
        );
      k.add(
        mats.bark,
        tube(
          bez(
            s0,
            s0
              .clone()
              .lerp(s2, 0.5)
              .add(new THREE.Vector3(0, len * 0.2, 0)),
            s2,
            6
          ),
          R * 0.08,
          6,
          6
        )
      );
      foliage(k, mats.leaf, s2, H * 0.06, 3, r0);
    }
    foliage(
      k,
      mats.leaf,
      b2.clone().add(new THREE.Vector3(0, H * 0.02, 0)),
      H * 0.07,
      2,
      r0
    );
  }
  return k.build(mats.rope);
}

/** Acacia en parasol : tronc fin et tordu, couronne plate. */
export function acacia(mats: FloraMats, H: number, seed: number): THREE.Group {
  const k = new Kit();
  const r0 = rnd(seed);
  const lean = new THREE.Vector3(
    (r0() - 0.5) * H * 0.3,
    0,
    (r0() - 0.5) * H * 0.3
  );
  const top = new THREE.Vector3(lean.x, H * 0.8, lean.z);
  k.add(
    mats.bark,
    tube(
      bez(
        new THREE.Vector3(0, -0.3, 0),
        new THREE.Vector3(lean.x * 0.2, H * 0.45, lean.z * 0.2),
        top,
        10
      ),
      H * 0.035,
      10,
      7
    )
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r0();
    const tip = top
      .clone()
      .add(
        new THREE.Vector3(
          Math.cos(a) * H * 0.3,
          H * 0.12,
          Math.sin(a) * H * 0.3
        )
      );
    k.add(mats.bark, tube([top, tip], H * 0.015, 3, 5));
  }
  for (let i = 0; i < 9; i++) {
    const a = r0() * Math.PI * 2,
      d = r0() * H * 0.38;
    const g = new THREE.IcosahedronGeometry(H * (0.14 + r0() * 0.08), 1);
    g.scale(1.3, 0.28, 1.3);
    g.translate(
      top.x + Math.cos(a) * d,
      H * (0.95 + r0() * 0.06),
      top.z + Math.sin(a) * d
    );
    k.add(mats.leaf, g);
  }
  return k.build(mats.rope);
}

/**
 * Herbes sèches de la savane : quelques milliers de touffes dans une tuile
 * qui défile avec le sable, posées sur le relief et couchées par le vent
 * sur la carte graphique (aucun calcul par image côté processeur).
 */
export function grassField(
  uniforms: Record<string, { value: unknown }>,
  count = 9000
) {
  const W = 640,
    Dz = 300;
  const blades = 4;
  const pos: number[] = [],
    base: number[] = [],
    col: number[] = [];
  const r0 = rnd(77);
  const c = new THREE.Color();
  // Touffes groupées en plaques (la savane n'est pas un gazon).
  let cxp = 0,
    czp = 0;
  for (let n = 0; n < count; n++) {
    if (n % 9 === 0) {
      cxp = (r0() - 0.5) * W;
      czp = (r0() - 0.5) * 2 * Dz;
    }
    const bx = cxp + (r0() - 0.5) * 9,
      bz = czp + (r0() - 0.5) * 9;
    const h = 1.1 + r0() * 1.3;
    const tone = r0();
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + r0();
      const w = 0.2;
      const lean = 0.25 + r0() * 0.35;
      const cx = Math.cos(a),
        cz = Math.sin(a);
      // Brin : triangle effilé qui part de la base et penche vers l'extérieur.
      const verts: [number, number, number, number][] = [
        [-cz * w, 0, cx * w, 0],
        [cz * w, 0, -cx * w, 0],
        [cx * lean * h, h, cz * lean * h, 1],
      ];
      for (const [x, y, z, t] of verts) {
        pos.push(x, y, z);
        base.push(bx, bz, t);
        c.setHSL(
          0.12 + tone * 0.04,
          0.48 + tone * 0.12,
          (0.2 + t * 0.24) * (0.85 + tone * 0.3)
        );
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aBase;
uniform float uTime, uScroll, uCalm, uCalmX;
${COMMON}`
      )
      .replace(
        '#include <begin_vertex>',
        `float gx = mod(aBase.x - uScroll + ${(W / 2).toFixed(1)}, ${W.toFixed(1)}) - ${(W / 2).toFixed(1)};
vec2 gw = vec2(gx, aBase.y);
vec2 gq = vec2(gx + uScroll, aBase.y);
float gy = terrainH(gq, gw);
float gflat = uCalm * (1. - smoothstep(520., 950., length(gw - vec2(uCalmX, 0.))));
gy = mix(gy, -1., gflat);
// Rien près des villes ; les touffes lointaines s'effacent.
float gfade = (1. - smoothstep(240., 370., length(vec3(gx, gy, aBase.y) - cameraPosition))) * (1. - gflat);
gfade *= .35 + .65 * smoothstep(.3, .55, fbm(gq * .02));
float gs = sin(uTime * 1.7 + gq.x * .25 + gq.y * .18) * .25 + .3;
vec3 transformed = position * gfade;
transformed.x += gs * aBase.z * gfade;
transformed += vec3(gx, gy - .05, aBase.y);`
      );
  };
  mat.customProgramCacheKey = () => 'arp-grass';
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}
