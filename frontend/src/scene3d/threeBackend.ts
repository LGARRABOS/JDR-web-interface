import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { STRIDE, type MeshData } from '../arpenteur3d/geometry';
import type {
  Camera,
  DrawItem,
  Lighting,
  MeshHandle,
  RenderBackend,
  RenderOptions,
} from '../arpenteur3d/renderer';
import {
  COMMON,
  DEFORM_FN,
  DUST_FS,
  DUST_VS,
  FOG_BODY,
  FX_BODY,
  FX_FNS,
  SKY_BODY,
  SKY_FN,
  SURFACE_CHAIN,
  SURFACE_FNS,
  SURFACE_HEAD,
  SURFACE_TAIL,
  WIND,
} from '../arpenteur3d/shaders';
import {
  loadPbr,
  PBR_DETAIL,
  PBR_FNS,
  PBR_WOOD,
  placeholderPbr,
} from './pbrTextures';
import { detectQuality, type Quality } from './quality';

// Moteur de rendu Three.js de l'arpenteur. Il reçoit exactement ce que la scène
// donnait au moteur WebGL2 maison (maillages, matrices, lumière, effets), et le
// rend avec un pipeline physique : matériaux PBR de Three (éclairage d'ambiance
// tiré du ciel, réflexions), ombres douces, occlusion ambiante, bloom,
// mappage de tons ACES. Les motifs des surfaces (bois, tôles, laiton…) sont
// ceux du moteur maison, injectés dans les matériaux de Three.

interface ThreeHandle extends MeshHandle {
  geom: THREE.BufferGeometry;
}

/** Uniformes partagés par tous les matériaux de la scène. */
function sharedUniforms() {
  return {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uCalm: { value: 0 },
    uCalmX: { value: 0 },
    uDuneAmp: { value: 1 },
    uSandA: { value: new THREE.Vector3() },
    uSandB: { value: new THREE.Vector3() },
    uRockA: { value: new THREE.Vector3() },
    uRockB: { value: new THREE.Vector3() },
    uTrim: { value: new THREE.Vector3(0.7, 0.55, 0.3) },
    uFog: { value: new THREE.Vector3() },
    uFogDensity: { value: 0.0008 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Vector3(1, 1, 1) },
    uZenith: { value: new THREE.Vector3() },
    uHorizon: { value: new THREE.Vector3() },
    uGround: { value: new THREE.Vector3() },
    uSkyMid: { value: new THREE.Vector3() },
    uNight: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, 0.3, -1) },
    uPbr: { value: placeholderPbr() as THREE.Texture },
    uPbrOn: { value: 0 },
  };
}
type Shared = ReturnType<typeof sharedUniforms>;

const VERT_HEAD = /* glsl */ `
attribute vec3 aCol;
attribute vec4 aMat;
uniform float uTime, uScroll, uCalm, uCalmX;
varying vec3 vWorld;
varying vec3 vCol;
flat varying vec4 vMat;
varying vec2 vUv2;
${COMMON}
${WIND}
#define uDrape DRAPE_F
${DEFORM_FN}
`;

const VERT_DEFORM = /* glsl */ `
#include <begin_vertex>
vec4 bwp;
vec3 bn;
deformVertex(position, normal, aMat, modelMatrix, bwp, bn);
transformed = (inverse(modelMatrix) * bwp).xyz;
vWorld = bwp.xyz;
vCol = aCol;
vMat = aMat;
vUv2 = uv;
#ifndef FLAT_SHADED
vNormal = normalize((viewMatrix * vec4(bn, 0.)).xyz);
#endif
`;

const FRAG_HEAD = /* glsl */ `
uniform float uTime, uScroll, uFogDensity;
uniform vec3 uSandA, uSandB, uRockA, uRockB, uTrim, uFog;
varying vec3 vWorld;
varying vec3 vCol;
flat varying vec4 vMat;
varying vec2 vUv2;
#define vUv vUv2
#define uCam cameraPosition
${COMMON}
${SKY_FN}
${SURFACE_FNS}
${PBR_FNS}
`;

/** Matériau « pont » : PBR de Three, motifs et déformations du moteur maison. */
function bridgeMaterial(u: Shared, drape: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  m.fog = false;
  m.defines = { DRAPE_F: drape ? '1.0' : '0.0' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', VERT_DEFORM);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
vec3 N = normalize((vec4(normal, 0.) * viewMatrix).xyz);
vec3 L = uSunDir;
${SURFACE_HEAD}
if (uPbrOn > .5 && (pat == 1. || pat == 11.)) {
${PBR_WOOD}
} else {
${SURFACE_CHAIN}
}
if (uPbrOn > .5) {
${PBR_DETAIL}
}
${SURFACE_TAIL}
diffuseColor.rgb = albedo;
normal = normalize((viewMatrix * vec4(N, 0.)).xyz);
roughnessFactor = clamp(rough, .045, 1.);
metalnessFactor = metal;
vec3 bEmit = emit;
// Toiles : la lumière traverse (le moteur maison faisait de même).
if (pat == 6.) bEmit += albedo * (uSunColor * max(-dot(N, L), 0.) * .2 + uGround * .16 + uHorizon * .04) * (1. - uNight * .5);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEmit;'
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `{
  vec3 col = gl_FragColor.rgb;
  vec3 L = uSunDir;
${FOG_BODY}
  gl_FragColor.rgb = col;
}`
      );
  };
  m.customProgramCacheKey = () => `arp-bridge-${drape ? 1 : 0}`;
  return m;
}

/** Ombres : même déformation (voiles au vent, rochers posés) que le rendu. */
function depthMaterial(u: Shared, drape: boolean): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  m.defines = { DRAPE_F: drape ? '1.0' : '0.0' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec4 aMat;\nuniform float uTime, uScroll, uCalm, uCalmX;\n${COMMON}\n${WIND}\n#define uDrape DRAPE_F\n${DEFORM_FN}`
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
vec4 bwp;
vec3 bn;
deformVertex(position, normal, aMat, modelMatrix, bwp, bn);
transformed = (inverse(modelMatrix) * bwp).xyz;`
      );
  };
  m.customProgramCacheKey = () => `arp-depth-${drape ? 1 : 0}`;
  return m;
}

/** Panaches et halos : additifs, s'estompent de face et vers le bout. */
function glowMaterial(u: Shared): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime },
    vertexShader: /* glsl */ `
attribute vec3 aCol;
attribute vec4 aMat;
varying vec2 vUv2;
varying vec3 vCol;
varying float vFacing;
flat varying float vAmp;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vFacing = abs(dot(n, normalize(cameraPosition - wp.xyz)));
  vUv2 = uv; vCol = aCol; vAmp = aMat.w;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
varying vec2 vUv2;
varying vec3 vCol;
varying float vFacing;
flat varying float vAmp;
void main(){
  float along = clamp(vUv2.y, 0., 1.);
  float flick = .85 + .15*sin(uTime*40. + vUv2.x*3.);
  float a = pow(1.-along, 2.2) * pow(vFacing, 3.) * flick * smoothstep(0., .06, along + .02);
  gl_FragColor = vec4(vCol * a * vAmp, 1.);
}`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

/** Ciel du moteur maison (dégradé, soleil, brume d'horizon, étoiles, nuages). */
function skyMaterial(u: Shared): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  gl_Position = p.xyww;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uMoonDir;
varying vec3 vDir;
${COMMON}
${SKY_FN}
void main(){
  vec3 d = normalize(vDir);
${SKY_BODY}
  gl_FragColor = vec4(c, 1.);
}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

/** Étalonnage, vignette, grain, tempête de sable et portail (affichage). */
function fxShader(): {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uStorm: { value: 0 },
      uStormT: { value: 0 },
      uAspect: { value: 1 },
      uPortal: { value: 0 },
      uStormColor: { value: new THREE.Vector3(0.8, 0.62, 0.42) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uStorm, uStormT, uAspect, uPortal, uTime;
uniform vec3 uStormColor;
varying vec2 vUv;
${FX_FNS}
void main(){
  vec2 q = vUv - .5;
  vec2 ca = q*dot(q, q)*.006;
  vec3 c = vec3(texture2D(tDiffuse, vUv - ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + ca).b);
${FX_BODY}
  c += (hash(vUv*vec2(1733., 977.) + uTime) - .5) * .014;
  gl_FragColor = vec4(c, 1.);
}`,
  };
}

/** Poussière soulevée et fumée des cheminées : billboards en mélange alpha. */
function dustMaterial(u: Shared): THREE.ShaderMaterial {
  const body = DUST_VS.slice(
    DUST_VS.indexOf('  float ph = fract'),
    DUST_VS.indexOf('  gl_Position')
  )
    .replace(/\baPos\b/g, 'position')
    .replace(/\baNrm\b/g, 'normal')
    .replace(/\baUv\b/g, 'uv');
  const frag = DUST_FS.slice(DUST_FS.indexOf('void main(){'))
    .replace(/\bo = /g, 'gl_FragColor = ')
    .replace('return;', 'return;');
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uScroll: u.uScroll,
      uDuneAmp: u.uDuneAmp,
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uDustColor: { value: new THREE.Vector3() },
      uSmokeColor: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
attribute vec3 aCol;
attribute vec4 aMat;
uniform vec3 uRight, uUp;
uniform float uTime, uScroll;
varying vec2 vUv;
varying float vA;
varying float vMode;
${COMMON}
void main(){
${body}
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`,
    fragmentShader: /* glsl */ `
varying vec2 vUv;
varying float vA;
varying float vMode;
uniform vec3 uDustColor, uSmokeColor;
${COMMON}
${frag}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const POD_COLOR = new THREE.Color(0.25, 0.85, 1.0);

export class ThreeBackend implements RenderBackend {
  width = 1;
  height = 1;
  readonly quality: Quality;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2500);
  private u = sharedUniforms();
  private mats: {
    bridge: THREE.MeshStandardMaterial;
    bridgeDrape: THREE.MeshStandardMaterial;
    depth: THREE.MeshDepthMaterial;
    depthDrape: THREE.MeshDepthMaterial;
    glow: THREE.ShaderMaterial;
    dust: THREE.ShaderMaterial;
  };
  private dust = new THREE.Mesh();
  private sky: THREE.Mesh;
  private skyScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envKey = '';
  private envAt = 0;
  private sun = new THREE.DirectionalLight(0xffffff, Math.PI);
  private pods: THREE.PointLight[] = [];
  private pool: THREE.Mesh[] = [];
  private glowPool: THREE.Mesh[] = [];
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private gtao: GTAOPass | null = null;
  private fx: ShaderPass;

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      preserve?: boolean;
      quality?: Quality;
      /** Dossier des textures photographiques (sans elles : motifs seuls). */
      textures?: string;
    } = {}
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserve,
    });
    const r = this.renderer;
    this.quality = opts.quality ?? detectQuality(r);
    const q = this.quality;
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mats = {
      bridge: bridgeMaterial(this.u, false),
      bridgeDrape: bridgeMaterial(this.u, true),
      depth: depthMaterial(this.u, false),
      depthDrape: depthMaterial(this.u, true),
      glow: glowMaterial(this.u),
      dust: dustMaterial(this.u),
    };
    this.dust.material = this.mats.dust;
    this.dust.frustumCulled = false;
    this.dust.matrixAutoUpdate = false;
    this.dust.renderOrder = 5;
    this.dust.visible = false;
    this.scene.add(this.dust);
    // Ciel (suit la caméra) et sa copie qui sert à l'éclairage d'ambiance.
    const skyGeo = new THREE.SphereGeometry(1000, 48, 24);
    this.sky = new THREE.Mesh(skyGeo, skyMaterial(this.u));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.skyScene.add(new THREE.Mesh(skyGeo, skyMaterial(this.u)));
    this.pmrem = new THREE.PMREMGenerator(r);
    // Soleil (ou lune) et ses ombres.
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // Lueurs des tuyères.
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(POD_COLOR, 0, 24, 2);
      p.visible = false;
      this.pods.push(p);
      this.scene.add(p);
    }
    // Post-traitement : rendu HDR, occlusion ambiante, bloom, mappage de tons,
    // puis étalonnage et effets plein écran.
    // Une seule profondeur, partagée par les deux tampons du compositeur :
    // l'occlusion ambiante la lit telle que le rendu l'a produite (dunes et
    // voiles déformées comprises), et en déduit les normales.
    const depth = new THREE.DepthTexture(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
      depthTexture: depth,
    });
    this.composer = new EffectComposer(r, rt);
    this.composer.renderTarget2.depthTexture = depth;
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      // (0.170 : fournir la profondeur au constructeur plante ; on la donne après.)
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.setGBuffer(depth);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({
        radius: 2.2,
        distanceExponent: 1.4,
        thickness: 1.5,
        scale: 1,
      });
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fx = new ShaderPass(fxShader());
    this.composer.addPass(this.fx);
    // Textures photographiques : chargées en arrière-plan, puis on redessine.
    this.ready = opts.textures
      ? loadPbr(
          opts.textures,
          q.texSize,
          Math.min(q.aniso, r.capabilities.getMaxAnisotropy())
        )
          .then((tex) => {
            if (this.disposed) {
              tex.dispose();
              return;
            }
            this.u.uPbr.value.dispose();
            this.u.uPbr.value = tex;
            this.u.uPbrOn.value = 1;
            canvas.dispatchEvent(new Event('arp-cam'));
          })
          .catch(() => {
            // textures absentes : on garde les motifs procéduraux
          })
      : Promise.resolve();
  }

  /** Résolu quand les textures photographiques sont prêtes (ou absentes). */
  readonly ready: Promise<void>;
  private disposed = false;

  upload(mesh: MeshData): MeshHandle {
    const g = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(mesh.data, STRIDE);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 6));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(ib, 3, 8));
    g.setAttribute('aMat', new THREE.InterleavedBufferAttribute(ib, 4, 11));
    g.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    g.computeBoundingSphere();
    // Les sommets peuvent bouger (vent, relief des dunes) : marge de sécurité.
    if (g.boundingSphere) g.boundingSphere.radius += 25;
    const h: ThreeHandle = { geom: g };
    return h;
  }

  release(mesh: MeshHandle) {
    (mesh as ThreeHandle).geom.dispose();
  }

  setSize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.bloom.resolution.set(this.width, this.height);
  }

  private meshAt(pool: THREE.Mesh[], i: number): THREE.Mesh {
    let m = pool[i];
    if (!m) {
      m = new THREE.Mesh();
      m.matrixAutoUpdate = false;
      pool.push(m);
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  }

  /** Éclairage d'ambiance et réflexions : le ciel courant, reconvolué au besoin. */
  private updateEnv(light: Lighting) {
    const r3 = (v: number[]) => v.map((x) => x.toFixed(2)).join(',');
    const key = [
      r3(light.sunDir),
      r3(light.sunColor),
      r3(light.zenith),
      r3(light.horizon),
      r3(light.ground),
      light.night.toFixed(2),
    ].join('|');
    const now = performance.now();
    // Le premier ciel est calculé tout de suite ; ensuite, au plus ~3 fois par seconde.
    if (key === this.envKey || (this.envRT && now - this.envAt < 350)) return;
    this.envKey = key;
    this.envAt = now;
    const rt = this.pmrem.fromScene(this.skyScene, 0, 1, 2000);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  render(
    items: DrawItem[],
    glows: DrawItem[],
    cam: Camera,
    light: Lighting,
    opts: RenderOptions
  ) {
    const u = this.u;
    u.uTime.value = opts.time;
    u.uScroll.value = opts.scroll;
    u.uCalm.value = opts.calm ?? 0;
    u.uCalmX.value = opts.calmX ?? 0;
    u.uDuneAmp.value = opts.duneAmp ?? 1;
    const v3 = (t: THREE.Vector3, a: readonly number[]) =>
      t.set(a[0], a[1], a[2]);
    v3(u.uSandA.value, light.sandA);
    v3(u.uSandB.value, light.sandB);
    v3(u.uRockA.value, light.rockA);
    v3(u.uRockB.value, light.rockB);
    v3(u.uFog.value, light.fog);
    u.uFogDensity.value = light.fogDensity;
    const sd = new THREE.Vector3(...light.sunDir).normalize();
    u.uSunDir.value.copy(sd);
    v3(u.uSunColor.value, light.sunColor);
    v3(u.uZenith.value, light.zenith);
    v3(u.uHorizon.value, light.horizon);
    v3(u.uGround.value, light.ground);
    v3(u.uSkyMid.value, light.skyMid);
    u.uNight.value = light.night;
    v3(u.uMoonDir.value, light.moonDir);
    this.updateEnv(light);

    // Caméra (mêmes conventions que le moteur maison).
    const c = this.camera;
    c.aspect = this.width / this.height;
    c.fov = THREE.MathUtils.radToDeg(cam.fov);
    const camDist = Math.hypot(
      cam.eye[0] - cam.target[0],
      cam.eye[1] - cam.target[1],
      cam.eye[2] - cam.target[2]
    );
    c.near = Math.min(4, Math.max(0.5, camDist * 0.012));
    c.far = 2500;
    c.position.set(cam.eye[0], cam.eye[1], cam.eye[2]);
    c.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    c.updateProjectionMatrix();
    this.sky.position.copy(c.position);

    // Soleil : couleur du moteur maison (le facteur π équilibre la BRDF de Three).
    const s = this.sun;
    s.color.setRGB(light.sunColor[0], light.sunColor[1], light.sunColor[2]);
    s.intensity = Math.PI * (sd.y > 0.02 ? 1 : 0);
    const ctr = opts.shadowCenter;
    const R = opts.shadowRadius;
    s.target.position.set(ctr[0], ctr[1], ctr[2]);
    s.position.set(
      ctr[0] + sd.x * 150,
      ctr[1] + sd.y * 150,
      ctr[2] + sd.z * 150
    );
    const sc = s.shadow.camera;
    if (sc.right !== R) {
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.near = 1;
      sc.far = 320;
      sc.updateProjectionMatrix();
    }
    this.scene.environmentIntensity = 1.35;

    // Lueurs des tuyères.
    const pods = opts.pods ?? [];
    this.pods.forEach((p, i) => {
      const d = pods[i];
      p.visible = !!d;
      if (d) {
        p.position.set(d.pos[0], d.pos[1], d.pos[2]);
        p.intensity = d.power * 9;
      }
    });

    // Objets de la scène.
    items.forEach((it, i) => {
      const m = this.meshAt(this.pool, i);
      m.geometry = (it.mesh as ThreeHandle).geom;
      m.material = it.drape ? this.mats.bridgeDrape : this.mats.bridge;
      m.customDepthMaterial = it.drape ? this.mats.depthDrape : this.mats.depth;
      m.matrix.fromArray(it.model);
      m.matrixWorld.copy(m.matrix);
      m.castShadow = !!it.shadow;
      m.receiveShadow = true;
      m.renderOrder = 0;
    });
    for (let i = items.length; i < this.pool.length; i++)
      this.pool[i].visible = false;
    glows.forEach((it, i) => {
      const m = this.meshAt(this.glowPool, i);
      m.geometry = (it.mesh as ThreeHandle).geom;
      m.material = this.mats.glow;
      m.matrix.fromArray(it.model);
      m.matrixWorld.copy(m.matrix);
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 10;
    });
    for (let i = glows.length; i < this.glowPool.length; i++)
      this.glowPool[i].visible = false;

    // Poussière et fumée (couleurs du moteur maison).
    if (opts.dust) {
      const du = this.mats.dust.uniforms;
      this.dust.geometry = (opts.dust as ThreeHandle).geom;
      this.dust.visible = true;
      c.updateMatrixWorld();
      const e = c.matrixWorld.elements;
      (du.uRight.value as THREE.Vector3).set(e[0], e[1], e[2]);
      (du.uUp.value as THREE.Vector3).set(e[4], e[5], e[6]);
      const sc = light.sunColor;
      const k = 0.35;
      (du.uDustColor.value as THREE.Vector3).set(
        light.sandB[0] * (sc[0] * k + light.zenith[0] * 0.6) + 0.02,
        light.sandB[1] * (sc[1] * k + light.zenith[1] * 0.6) + 0.02,
        light.sandB[2] * (sc[2] * k + light.zenith[2] * 0.6) + 0.02
      );
      (du.uSmokeColor.value as THREE.Vector3).set(
        0.05 + sc[0] * 0.03,
        0.045 + sc[1] * 0.03,
        0.045 + sc[2] * 0.03
      );
    } else this.dust.visible = false;

    // Post-traitement.
    this.renderer.toneMappingExposure = light.exposure;
    this.bloom.strength = light.bloom * 0.55;
    const fu = this.fx.uniforms;
    fu.uStorm.value = opts.storm ?? 0;
    fu.uPortal.value = opts.portal ?? 0;
    fu.uStormT.value = opts.time % 1000;
    fu.uTime.value = opts.time % 10;
    fu.uAspect.value = this.width / this.height;
    const scol = opts.stormColor ?? [0.8, 0.62, 0.42];
    (fu.uStormColor.value as THREE.Vector3).set(scol[0], scol[1], scol[2]);
    this.composer.render();
  }

  dispose() {
    this.disposed = true;
    this.u.uPbr.value.dispose();
    this.pool.forEach((m) => this.scene.remove(m));
    this.glowPool.forEach((m) => this.scene.remove(m));
    Object.values(this.mats).forEach((m) => m.dispose());
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
