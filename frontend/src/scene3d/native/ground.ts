import * as THREE from 'three';

// Sol du jeu : dunes sculptées calculées sur la carte graphique (le sable
// défile sous le navire), avec une copie exacte en JavaScript pour poser les
// curiosités du paysage et la poussière au bon niveau.

// --- Bruit identique en JS et en GLSL (hachage entier) ------------------------

function h2(ix: number, iy: number) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy),
    b = h2(ix + 1, iy),
    c = h2(ix, iy + 1),
    d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, o: number) {
  let s = 0,
    a = 0.5,
    n = 0;
  for (let i = 0; i < o; i++) {
    s += a * vnoise(x, y);
    n += a;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    a *= 0.5;
  }
  return s / n;
}
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function dune(p: number, crest: number) {
  const f = p - Math.floor(p);
  return f < crest ? sm(0, 1, f / crest) : sm(0, 1, (1 - f) / (1 - crest));
}

export interface GroundParams {
  scroll: number;
  amp: number;
  calm: number;
  calmX: number;
}

/** Hauteur du sable au point (x, z) de la scène (copie exacte du shader). */
export function sandHeight(x: number, z: number, g: GroundParams) {
  const wx = x + g.scroll;
  const warp =
    (fbm(wx * 0.0021, z * 0.0021, 3) - 0.5) * 240 +
    (fbm(wx * 0.007 + 5, z * 0.007, 2) - 0.5) * 50;
  const amp = 5 + 12 * fbm(wx * 0.0014 + 9, z * 0.0014 + 3, 2);
  const along =
    0.55 + 0.45 * Math.sin(z / 230 + fbm(wx * 0.003, z * 0.003 + 7, 2) * 4);
  const big = dune((wx + z * 0.35 + warp) / 150, 0.78) * amp * along;
  const small =
    dune(
      (wx * 0.9 + z * 0.3 + (fbm(wx * 0.012 + 2, z * 0.012, 2) - 0.5) * 30) /
        36,
      0.72
    ) *
    (0.6 + 1.4 * fbm(wx * 0.01, z * 0.01 + 4, 2));
  const bowl =
    -Math.pow(
      Math.max(0, fbm(wx * 0.0045 + 1, z * 0.0045 + 8, 3) - 0.56),
      1.4
    ) * 60;
  const roll = (fbm(wx * 0.0009 + 3, z * 0.0009 + 1, 3) - 0.5) * 40;
  // Couloir plus calme sous la route du navire, sol aplani autour des villes.
  const lane = 0.15 + 0.85 * sm(35, 190, Math.abs(z));
  // Même aplanissement que le moteur maison (les villes y sont posées).
  const city = g.calm * (1 - sm(520, 950, Math.hypot(x - g.calmX, z)));
  const raw =
    (big + small + bowl) * lane * g.amp +
    roll * (0.25 + 0.75 * sm(60, 500, Math.abs(z))) -
    2;
  return raw + (-1 - raw) * city;
}

const GLSL = /* glsl */ `
uniform float uScroll, uGAmp, uGCalm, uGCalmX;
float gh2(vec2 p){
  ivec2 i = ivec2(p);
  uint n = uint(i.x) * 374761393u + uint(i.y) * 668265263u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return float(n) / 4294967295.;
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = p - i;
  vec2 u = f*f*(3.-2.*f);
  float a = gh2(i), b = gh2(i + vec2(1, 0)), c = gh2(i + vec2(0, 1)), d = gh2(i + vec2(1, 1));
  return a + (b - a)*u.x + (c - a)*u.y + (a - b - c + d)*u.x*u.y;
}
float gfbm(vec2 p, int o){
  float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 4; i++) { if (i >= o) break; s += a * gnoise(p); n += a; p = p * 2.03 + vec2(17.1, 9.7); a *= .5; }
  return s / n;
}
float gdune(float p, float c){ float f = fract(p); return f < c ? smoothstep(0., 1., f/c) : smoothstep(0., 1., (1.-f)/(1.-c)); }
float sandH(vec2 q){
  float x = q.x, z = q.y;
  float wx = x + uScroll;
  float warp = (gfbm(vec2(wx, z) * .0021, 3) - .5) * 240. + (gfbm(vec2(wx * .007 + 5., z * .007), 2) - .5) * 50.;
  float amp = 5. + 12. * gfbm(vec2(wx * .0014 + 9., z * .0014 + 3.), 2);
  float along = .55 + .45 * sin(z / 230. + gfbm(vec2(wx * .003, z * .003 + 7.), 2) * 4.);
  float big = gdune((wx + z * .35 + warp) / 150., .78) * amp * along;
  float small = gdune((wx * .9 + z * .3 + (gfbm(vec2(wx * .012 + 2., z * .012), 2) - .5) * 30.) / 36., .72) * (.6 + 1.4 * gfbm(vec2(wx * .01, z * .01 + 4.), 2));
  float bowl = -pow(max(0., gfbm(vec2(wx * .0045 + 1., z * .0045 + 8.), 3) - .56), 1.4) * 60.;
  float roll = (gfbm(vec2(wx * .0009 + 3., z * .0009 + 1.), 3) - .5) * 40.;
  float lane = .15 + .85 * smoothstep(35., 190., abs(z));
  float city = uGCalm * (1. - smoothstep(520., 950., length(vec2(x - uGCalmX, z))));
  float raw = (big + small + bowl) * lane * uGAmp + roll * (.25 + .75 * smoothstep(60., 500., abs(z))) - 2.;
  return mix(raw, -1., city);
}
`;

/** Maillage du sol (resserré au centre) et son matériau déformé sur la carte graphique. */
export function groundMesh(
  sand: THREE.MeshStandardMaterial,
  patch: (m: THREE.Material) => void
) {
  const size = 4800,
    n = 300;
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      z = p.getZ(i);
    const r = Math.hypot(x, z) / (size / 2);
    const k = Math.pow(r, 2.2) / Math.max(r, 1e-6);
    x *= k;
    z *= k;
    p.setXYZ(i, x, 0, z);
    uv.setXY(i, x, z);
  }
  g.computeBoundingSphere();
  g.boundingSphere!.radius = size;
  const mat = sand.clone();
  const u = {
    uScroll: { value: 0 },
    uGAmp: { value: 1 },
    uGCalm: { value: 0 },
    uGCalmX: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 gq = position.xz;
float gy0 = sandH(gq);
float ge = 1.2 + length(gq) * .004;
float gyx = sandH(gq + vec2(ge, 0.));
float gyz = sandH(gq + vec2(0., ge));
vec3 objectNormal = normalize(vec3(gy0 - gyx, ge, gy0 - gyz));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1., 0., 0.);
#endif`
      )
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position.x, gy0, position.z);'
      )
      // Le grain du sable défile avec le relief (période multiple du carreau).
      .replace(
        '#include <uv_vertex>',
        `vec2 sUv = uv + vec2(mod(uScroll, 600.), 0.);
#ifdef USE_MAP
vMapUv = (mapTransform * vec3(sUv, 1.)).xy;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = (normalMapTransform * vec3(sUv, 1.)).xy;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = (roughnessMapTransform * vec3(sUv, 1.)).xy;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = (metalnessMapTransform * vec3(sUv, 1.)).xy;
#endif`
      );
  };
  mat.customProgramCacheKey = () => 'arp-sand';
  patch(mat);
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, uniforms: u, material: mat };
}
