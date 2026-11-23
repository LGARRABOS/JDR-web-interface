import * as THREE from 'three';
import { COMMON } from '../../arpenteur3d/shaders';
import { MIST_Y } from '../../arpenteur3d/voidRealm';
import type { NativeFrame } from '../../arpenteur3d/native';
import { boulder, butte, relief } from '../ref/desert';
import { bez, cyl, Kit, lathe, M, torus, tube } from '../ref/kit';
import type { RefMaterials } from '../ref/materials';
import { acacia, type FloraMats } from './flora';

// « Position inconnue » : la mer de brume d'Aether, en réaliste.
//  - une mer de nuages en volume qui roule lentement (relief et lumière
//    calculés sur la carte graphique), des voiles de brume qui flottent ;
//  - des îles suspendues : plateau moussu, ventre de roche érodée, racines
//    et chaînes qui pendent, cascades de brume, ruines, cristaux d'Aether ;
//  - des pitons qui crèvent les nuages, des îles lointaines immobiles.

const LOOP = 1300;
const SEA_Y = MIST_Y - 8;

function wrapC(v: number, p: number) {
  return ((((v + p / 2) % p) + p) % p) - p / 2;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function rnd(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 3;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

type U = Record<string, { value: unknown }>;

/** Remplace les normales nulles ou invalides par la verticale. */
export function safeNormals(g: THREE.BufferGeometry) {
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (!n) return;
  const a = n.array as Float32Array;
  let bad = false;
  for (let i = 0; i < a.length; i += 3) {
    const l = a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2];
    if (!(l > 1e-8) || !Number.isFinite(l)) {
      a[i] = 0;
      a[i + 1] = 1;
      a[i + 2] = 0;
      bad = true;
    }
  }
  if (bad) n.needsUpdate = true;
}

interface Isle {
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  phase: number;
  amp: number;
  loop: boolean;
}

export class AetherRealm {
  readonly root = new THREE.Group();
  private sea: THREE.Mesh;
  /** Position et cap du navire dans la zone (x, z, cap). */
  private navU = { value: new THREE.Vector3() };
  private seaU = {
    uLow: { value: new THREE.Color() },
    uHigh: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
  };
  private puffs: THREE.Points;
  private puffU = {
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uScale: { value: 600 },
  };
  readonly fallMat: THREE.ShaderMaterial;
  private isles: Isle[] = [];
  private queue: (() => void)[] = [];
  readonly m: {
    moss: THREE.MeshStandardMaterial;
    rock: THREE.MeshStandardMaterial;
    stone: THREE.MeshStandardMaterial;
    root: THREE.MeshStandardMaterial;
    chain: THREE.MeshStandardMaterial;
    violet: THREE.MeshStandardMaterial;
    cyan: THREE.MeshStandardMaterial;
  };
  private cliffLib: RefMaterials;

  constructor(
    private lib: RefMaterials,
    private flora: FloraMats,
    private patch: (m: THREE.Material) => void,
    private shared: U
  ) {
    const tint = (
      m: THREE.MeshStandardMaterial,
      hex: string,
      o: Partial<THREE.MeshStandardMaterialParameters> = {}
    ) => {
      const c = m.clone();
      c.color.set(hex);
      Object.assign(c, o);
      patch(c);
      return c;
    };
    const glow = (hex: string) => {
      const c = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.15,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 3,
      });
      patch(c);
      return c;
    };
    this.m = {
      moss: tint(lib.sand, '#7a8c78', {
        roughness: 0.95,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      // Roche gris-violet (grain gardé, teinte photo retirée).
      rock: tint(lib.rock, '#5e5676', {
        map: null,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      stone: tint(lib.rock, '#9c93ab', {
        map: null,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      root: tint(lib.darkWood, '#6a5a52', {
        roughness: 0.95,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      chain: tint(lib.castIron, '#8a8290'),
      violet: glow('#c69cff'),
      cyan: glow('#7ff0ff'),
    };
    const cliff = lib.cliff.clone();
    cliff.map = null;
    cliff.vertexColors = false;
    cliff.color.set('#6c6488');
    patch(cliff);
    this.cliffLib = { ...lib, cliff };

    this.sea = this.makeSea();
    this.puffs = this.makePuffs();
    this.fallMat = this.makeFallMat();
    this.root.add(this.sea, this.puffs);
    this.root.visible = false;
    this.plan();
  }

  // --- Mer de nuages ------------------------------------------------------------

  private makeSea() {
    const NR = 150,
      NS = 192;
    const pos: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= NR; i++) {
      const r = 2 + Math.pow(i / NR, 1.8) * 3300;
      for (let j = 0; j < NS; j++) {
        const a = (j / NS) * Math.PI * 2;
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    for (let i = 0; i < NR; i++)
      for (let j = 0; j < NS; j++) {
        const a = i * NS + j,
          b = i * NS + ((j + 1) % NS);
        idx.push(a, b, a + NS, b, b + NS, a + NS);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3)
    );
    g.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      metalness: 0,
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.shared, this.seaU, { uNav: this.navU });
      const fn = /* glsl */ `
uniform float uTime;
uniform vec3 uNav;
varying float vCloud;
${COMMON}
float cloudH(vec2 p){
  vec2 q = p*.0055 + vec2(uTime*.004, uTime*.0025);
  vec2 w = vec2(fbm(q*1.7 + 3.1), fbm(q*1.7 + 7.3));
  float b = fbm(q + w*1.3);
  float bs = smoothstep(.22, .86, b);
  float bill = bs * sqrt(bs);
  float small = fbm(p*.028 + w*2. - vec2(uTime*.012, 0.));
  return bill*18. + small*3.5;
}`;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + fn)
        .replace(
          '#include <beginnormal_vertex>',
          `// Nuages fixés dans la zone : la mer suit le navire, qui la traverse et y vire.
float nc = cos(uNav.z), ns = sin(uNav.z);
vec2 cp = uNav.xy + vec2(position.x*nc - position.z*ns, position.x*ns + position.z*nc);
float ch = cloudH(cp);
float ce = 2. + length(position.xz) * .01;
vec3 nW = normalize(vec3(ch - cloudH(cp + vec2(ce, 0.)), ce, ch - cloudH(cp + vec2(0., ce))));
vec3 objectNormal = vec3(nW.x*nc + nW.z*ns, nW.y, -nW.x*ns + nW.z*nc);
vCloud = clamp(ch / 20., 0., 1.);`
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed = vec3(position.x, ch, position.z);'
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vCloud;\nuniform vec3 uLow, uHigh, uGlow;'
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
diffuseColor.rgb *= mix(uLow, uHigh, smoothstep(.05, .9, vCloud));`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
float cg = clamp(1. - vCloud, 0., 1.);
totalEmissiveRadiance += uGlow * cg * cg * cg;`
        );
    };
    mat.customProgramCacheKey = () => 'arp-aether-sea';
    this.patch(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = SEA_Y;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Voiles de brume : grandes taches douces qui flottent sur la mer. */
  private makePuffs() {
    const r = rnd(5);
    const n = 520;
    const pos = new Float32Array(n * 3),
      size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * LOOP;
      pos[i * 3 + 1] = SEA_Y + 8 + r() * 18;
      pos[i * 3 + 2] = -700 + r() * 1000;
      size[i] = 30 + r() * 70;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.puffU, uNav: this.navU, uTime: this.shared.uTime },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
uniform float uTime, uScale;
uniform vec3 uNav;
attribute float size;
varying float vA;
void main(){
  // Voiles fixés dans la zone, répétés autour du navire, vus depuis lui.
  float x = mod(position.x - uNav.x + ${LOOP / 2}., ${LOOP}.) - ${LOOP / 2}.;
  float z = mod(position.z - uNav.y + 500., 1000.) - 500.;
  float nc = cos(uNav.z), ns = sin(uNav.z);
  vec3 p = vec3(x*nc + z*ns, position.y + sin(uTime*.2 + position.z*.01)*2., -x*ns + z*nc);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(1., -mv.z);
  float d = length(mv.xyz);
  vA = (1. - smoothstep(900., 1500., d)) * smoothstep(${LOOP / 2}., ${LOOP / 2 - 120}., abs(x)) * smoothstep(500., 400., abs(z)) * smoothstep(60., 200., d);
  // Pas de voile entre la caméra et le navire (il le noierait).
  float shipD = length(cameraPosition);
  vA *= smoothstep(shipD * .9, shipD + 140., d);
}`,
      fragmentShader: /* glsl */ `
uniform vec3 uLit, uShade;
varying float vA;
void main(){
  vec2 c = gl_PointCoord - .5;
  float d = length(c) * 2.;
  float e = max(0., 1. - d*d);
  float a = e * e * .3 * vA;
  if (a < .004) discard;
  gl_FragColor = vec4(mix(uShade, uLit, .55 - c.y), a);
}`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    return pts;
  }

  /** Cascades de brume qui tombent du bord des îles. */
  private makeFallMat() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: this.shared.uTime, uCol: this.puffU.uLit },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uCol;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 q = vec2(vUv.x * 6., vUv.y * 5. + uTime * .6);
  float n = n2(q) * .6 + n2(q * 2.3) * .4;
  float edge = smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x);
  float a = smoothstep(.3, .9, n) * edge * pow(max(1e-4, 1. - vUv.y), .8) * .4;
  gl_FragColor = vec4(uCol * (1.1 + n * .3), a);
}`,
    });
  }

  // --- Îles -------------------------------------------------------------------

  isle(
    seed: number,
    size: number,
    opts: { ruins: boolean; crystals: boolean; tree: boolean; falls: number }
  ) {
    const r = rnd(seed);
    const k = new Kit();
    const g = new THREE.Group();
    const R = size;
    // Plateau : disque irrégulier, légèrement bombé.
    const NA = 40,
      NRr = 6;
    const rim = (a: number) =>
      R *
      (1 +
        0.16 * Math.sin(a * 3 + seed) +
        0.09 * Math.sin(a * 7 + seed * 2) +
        0.05 * Math.sin(a * 13));
    const top: number[] = [0, 0.8, 0],
      tuv: number[] = [0, 0],
      tidx: number[] = [];
    for (let i = 1; i <= NRr; i++)
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * Math.PI * 2,
          t = i / NRr;
        const rr = rim(a) * t;
        const y = 0.8 * (1 - t * t) + Math.sin(a * 5 + i) * 0.25 * t;
        top.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        tuv.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    for (let j = 0; j < NA; j++) tidx.push(0, 1 + ((j + 1) % NA), 1 + j);
    for (let i = 1; i < NRr; i++)
      for (let j = 0; j < NA; j++) {
        const a = 1 + (i - 1) * NA + j,
          b = 1 + (i - 1) * NA + ((j + 1) % NA);
        tidx.push(a, b, a + NA, b, b + NA, a + NA);
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    tg.setIndex(tidx);
    tg.computeVertexNormals();
    k.add(this.m.moss, tg);
    // Ventre : roche érodée en pointe, bosses et ravines.
    const NV = 18;
    const D = R * (1.4 + r() * 0.7);
    const bp: number[] = [],
      buv: number[] = [],
      bidx: number[] = [];
    for (let v = 0; v <= NV; v++)
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI * 2,
          t = v / NV;
        const lump =
          1 +
          0.18 * Math.sin(a * 4 + t * 9 + seed) +
          0.12 * Math.sin(a * 9 - t * 5) +
          0.1 * Math.sin(t * 23 + a * 2);
        // La pointe garde un petit rayon : un sommet écrasé en un seul point
        // donnerait des normales nulles (pixels noirs sur certaines cartes).
        const prof = Math.max(
          0.025,
          Math.pow(1 - t, 1.25) * (1 - 0.15 * Math.sin(t * Math.PI * 3)) + 0.02
        );
        const rr = rim(a) * 1.02 * prof * lump;
        bp.push(
          Math.cos(a) * rr,
          -t * D + Math.sin(a * 6 + t * 7) * 0.6 * t,
          Math.sin(a) * rr
        );
        buv.push((j / NA) * R * 6, t * D);
      }
    for (let v = 0; v < NV; v++)
      for (let j = 0; j < NA; j++) {
        const a = v * (NA + 1) + j;
        bidx.push(a, a + 1, a + NA + 1, a + 1, a + NA + 2, a + NA + 1);
      }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
    bg.setIndex(bidx);
    bg.computeVertexNormals();
    k.add(this.m.rock, bg);
    // Racines et chaînes qui pendent sous l'île.
    const nr = 5 + Math.floor(r() * 6);
    for (let i = 0; i < nr; i++) {
      const a = r() * Math.PI * 2,
        d = R * (0.3 + r() * 0.6);
      const t0 = (d / R) * 0.9;
      const p0 = new THREE.Vector3(
        Math.cos(a) * d,
        -Math.pow(1 - t0, 0.8) * D * 0.4 - 1,
        Math.sin(a) * d
      );
      const len = R * (0.6 + r() * 1.4);
      const p2 = p0
        .clone()
        .add(new THREE.Vector3((r() - 0.5) * 3, -len, (r() - 0.5) * 3));
      const p1 = p0
        .clone()
        .lerp(p2, 0.5)
        .add(new THREE.Vector3((r() - 0.5) * 4, 0, (r() - 0.5) * 4));
      k.add(this.m.root, tube(bez(p0, p1, p2, 10), 0.18 + r() * 0.25, 10, 6));
    }
    if (r() < 0.6) {
      const a = r() * Math.PI * 2;
      const p0 = new THREE.Vector3(
        Math.cos(a) * R * 0.5,
        -D * 0.25,
        Math.sin(a) * R * 0.5
      );
      const nl = 14 + Math.floor(r() * 10);
      for (let i = 0; i < nl; i++)
        k.add(
          this.m.chain,
          torus(0.4, 0.09, 10, 5),
          M(p0.x, p0.y - i * 0.7, p0.z, 0, ((i % 2) * Math.PI) / 2, 0)
        );
    }
    // Cristaux d'Aether (sur le plateau et qui percent le ventre).
    if (opts.crystals) {
      const nc = 3 + Math.floor(r() * 4);
      for (let i = 0; i < nc; i++) {
        const below = r() < 0.4;
        const a = r() * Math.PI * 2,
          d = R * (below ? 0.5 : r() * 0.6);
        const h = (below ? 2 + r() * 4 : 2.5 + r() * 6) * (R / 18);
        const mat = r() < 0.6 ? this.m.violet : this.m.cyan;
        const g6 = lathe(
          [
            [h * 0.16, -0.5],
            [h * 0.16, h * 0.75],
            [h * 0.03, h],
            [0.001, h * 1.01],
          ],
          6
        );
        k.add(
          mat,
          g6,
          M(
            Math.cos(a) * d,
            below ? -D * 0.3 : 0.5,
            Math.sin(a) * d,
            below ? Math.PI + (r() - 0.5) * 0.6 : (r() - 0.5) * 0.6,
            r() * 3,
            (r() - 0.5) * 0.6
          )
        );
      }
    }
    // Ruines : colonnes, linteau, dalles.
    if (opts.ruins) {
      const n = 3 + Math.floor(r() * 4);
      const a0 = r() * Math.PI * 2;
      const H = R * 0.45;
      for (let i = 0; i < n; i++) {
        const a = a0 + i * 0.45;
        const d = R * 0.55;
        const broken = r() < 0.4;
        const h = broken ? H * (0.3 + r() * 0.5) : H;
        k.add(
          this.m.stone,
          lathe(
            [
              [0.9, 0],
              [0.9, 0.3],
              [0.65, 0.6],
              [0.6, h - 0.6],
              [0.85, h - 0.3],
              [0.9, h],
              [0.001, h],
            ],
            16
          ),
          M(Math.cos(a) * d, 0.3, Math.sin(a) * d)
        );
      }
      for (let i = 0; i < 4; i++)
        k.add(
          this.m.stone,
          cyl(0.6, 0.6, 2.4, 12),
          M(
            Math.cos(a0 + i) * R * 0.3,
            0.9,
            Math.sin(a0 + i) * R * 0.3,
            Math.PI / 2,
            r() * 3,
            0
          )
        );
    }
    const built = k.build(this.lib.rope);
    built.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    g.add(built);
    if (opts.tree) {
      const t = acacia(this.flora, R * 0.4, seed);
      t.position.set((r() - 0.5) * R * 0.5, 0.6, (r() - 0.5) * R * 0.5);
      g.add(t);
    }
    // Rochers posés sur le plateau.
    relief.res = 0.62;
    for (let i = 0; i < 2; i++) {
      const b = boulder(this.cliffLib, 0, 0, R * (0.08 + r() * 0.08), r() * 50);
      const a = r() * Math.PI * 2;
      b.position.set(Math.cos(a) * R * 0.7, 0.4, Math.sin(a) * R * 0.7);
      g.add(b);
    }
    relief.res = 1;
    // Cascades de brume depuis le bord.
    for (let i = 0; i < opts.falls; i++) {
      const a = r() * Math.PI * 2;
      const w = R * (0.25 + r() * 0.25),
        h = 40 + r() * 50;
      const fall = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h, 1, 1),
        this.fallMat
      );
      const rr = rim(a) * 1.03;
      fall.position.set(Math.cos(a) * rr, -h / 2 + 0.6, Math.sin(a) * rr);
      fall.rotation.y = -a + Math.PI / 2;
      fall.renderOrder = 3;
      g.add(fall);
    }
    return g;
  }

  /** Piton : aiguille de roche qui sort de la brume, coiffée d'un îlot. */
  private piton(seed: number) {
    const r = rnd(seed);
    const g = new THREE.Group();
    const H = 60 + r() * 110,
      R = 9 + r() * 12;
    relief.res = 0.62;
    g.add(
      butte(this.cliffLib, 0, 0, R, H, seed, 1 + r() * 0.4, r() * 3, SEA_Y - 30)
    );
    relief.res = 1;
    const cap = this.isle(seed + 7, R * 1.3, {
      ruins: r() < 0.5,
      crystals: true,
      tree: false,
      falls: r() < 0.5 ? 1 : 0,
    });
    cap.position.y = SEA_Y - 30 + H * 0.98;
    g.add(cap);
    return g;
  }

  /** Liste des îles à modeler (peu à peu, sans à-coup). */
  private plan() {
    const r = rnd(424242);
    const spots: [number, number, number, number][] = [
      [-110, 10, -130, 14],
      [70, 24, -190, 20],
      [210, 4, -90, 11],
      [-250, 32, -80, 24],
      [30, 14, -300, 18],
      [-70, 46, -400, 30],
      [320, 36, -260, 24],
      [-370, 12, -220, 14],
      [150, 56, -480, 34],
      [-300, 20, -520, 22],
      [420, 46, -420, 28],
      [-520, 52, -360, 30],
      [560, 14, -160, 18],
      [-20, 30, 260, 12],
      [380, 40, 320, 16],
    ];
    spots.forEach(([x, y, z, s], i) =>
      this.queue.push(() => {
        const obj = this.isle(9000 + i * 17, s, {
          ruins: i % 3 === 0,
          crystals: i % 2 === 0 || s > 25,
          tree: i % 4 === 1,
          falls: s > 16 ? 1 + (i % 2) : 0,
        });
        this.add({
          obj,
          x,
          y,
          z,
          phase: i * 1.7,
          amp: 1.2 + (i % 3),
          loop: true,
        });
      })
    );
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * LOOP,
        z = -(260 + r() * 520);
      this.queue.push(() =>
        this.add({
          obj: this.piton(500 + i * 31),
          x,
          y: 0,
          z,
          phase: 0,
          amp: 0,
          loop: true,
        })
      );
    }
    // Grandes îles lointaines, immobiles comme le ciel.
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * 0.85 + r() * Math.PI * 0.7;
      const d = 900 + r() * 700;
      const s = 40 + r() * 50;
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d,
        y = 40 + r() * 200;
      this.queue.push(() =>
        this.add({
          obj: this.isle(700 + i * 13, s, {
            ruins: r() < 0.5,
            crystals: true,
            tree: false,
            falls: 1,
          }),
          x,
          y,
          z,
          phase: i,
          amp: 3,
          loop: false,
        })
      );
    }
  }

  /**
   * Brume du jeu sur tous les matériaux d'un objet, et normales assainies :
   * une normale nulle ou invalide (sommet dégénéré) rend NaN dans l'éclairage
   * sur certaines cartes graphiques (Firefox / Windows), et le flou lumineux
   * étale ces pixels en grands aplats noirs.
   */
  adopt(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!(mesh.material as THREE.ShaderMaterial).isShaderMaterial)
        this.patch(mesh.material as THREE.Material);
      safeNormals(mesh.geometry);
    });
  }

  private add(i: Isle) {
    this.adopt(i.obj);
    this.root.add(i.obj);
    this.isles.push(i);
  }

  /** Modèle les îles en attente dans la limite du temps donné (ms). */
  work(budget: number) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budget)
      this.queue.shift()!();
  }

  frame(
    f: NativeFrame,
    visible: boolean,
    pointScale: number,
    clear: [number, number][] = []
  ) {
    this.root.visible = visible;
    if (!visible) return;
    const nav = f.nav ?? { x: f.scroll, z: 0, h: 0 };
    this.navU.value.set(nav.x, nav.z, nav.h);
    this.work(this.isles.length < 4 ? 14 : 5);
    const night = f.night;
    // Couleurs de la brume selon l'heure (violet de l'Aether).
    this.seaU.uLow.value.set(night ? '#2a2250' : '#8a70bc');
    this.seaU.uHigh.value.set(night ? '#7c72bc' : '#f2e6fc');
    this.seaU.uGlow.value
      .set(night ? '#5a3cc8' : '#3a2470')
      .multiplyScalar(night ? 0.55 : 0.18);
    const L = f.light;
    this.puffU.uLit.value
      .setRGB(L.sunColor[0], L.sunColor[1], L.sunColor[2])
      .multiplyScalar(night ? 0.25 : 0.85)
      .lerp(new THREE.Color(night ? '#6a5aa8' : '#f0e2ff'), 0.6);
    this.puffU.uShade.value.set(night ? '#2a2248' : '#a890cc');
    this.puffU.uScale.value = pointScale;
    const c = Math.cos(nav.h),
      s = Math.sin(nav.h);
    for (const i of this.isles) {
      // Îles fixées dans la zone (répétées autour du navire), vues depuis lui ;
      // les îles lointaines ne font que tourner avec le ciel.
      const dx = i.loop ? wrapC(i.x - nav.x, LOOP) : i.x;
      const dz = i.loop ? wrapC(i.z - nav.z, 1300) : i.z;
      const x = dx * c + dz * s,
        z = -dx * s + dz * c;
      // Une île sur la route du navire s'enfonce doucement dans les nuages pour le laisser passer.
      const d = Math.hypot(x, z);
      const lift = i.loop ? -130 * smoothstep(220, 90, d) : 0;
      i.obj.position.set(
        x,
        i.y + lift + Math.sin(f.time * 0.25 + i.phase) * i.amp,
        z
      );
      // Place libre autour des repères des lieux-dits.
      i.obj.visible =
        !i.loop || clear.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > 240);
      i.obj.rotation.y = Math.sin(f.time * 0.03 + i.phase) * 0.05 + nav.h;
    }
  }

  /** Panneau de débogage : montrer ou cacher chaque partie. */
  debugShow(sea: boolean, puffs: boolean, isles: boolean) {
    this.sea.visible = sea;
    this.puffs.visible = puffs;
    if (!isles) for (const i of this.isles) i.obj.visible = false;
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.Points).isPoints) mesh.geometry.dispose();
    });
  }
}
