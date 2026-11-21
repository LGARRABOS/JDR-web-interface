import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { detectQuality, type Quality } from '../quality';
import { buildDesert, groundY } from './desert';
import { aetherJet, Puffs } from './fx';
import { createRefMaterials, type RefMaterials } from './materials';
import { buildShip, type RefShip } from './ship';

// Scène de référence de la refonte : le navire neuf dans un canyon de
// falaises stratifiées, au crépuscule ou de nuit. Autonome (page « labo »).

export type RefMood = 'dusk' | 'night';

const AETHER = new THREE.Color('#47d9ff');

function nightSky(): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uMoon: { value: new THREE.Vector3(-0.35, 0.55, -0.75).normalize() },
    },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
uniform vec3 uMoon;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.);
  vec3 c = mix(vec3(.05, .07, .12), vec3(.006, .009, .022), pow(y, .45));
  c += vec3(.09, .07, .06) * exp(-y * 9.);
  // Étoiles, plus nombreuses en hauteur ; bande laiteuse.
  vec2 g = d.xz / (d.y + .35) * 260.;
  float s = h(floor(g));
  float star = step(.9965, s) * smoothstep(.45, 0., length(fract(g) - .5)) * (.5 + 2.5 * h(floor(g) + 3.));
  float band = exp(-pow(dot(d, normalize(vec3(.6, .2, -.77))) * 3.2, 2.));
  c += vec3(.75, .8, 1.) * star * smoothstep(.02, .2, d.y) * 1.2;
  c += vec3(.03, .035, .05) * band * smoothstep(0., .3, d.y);
  // Lune et son halo.
  float m = dot(d, uMoon);
  c += vec3(1., .97, .9) * smoothstep(.99955, .9997, m) * 8.;
  c += vec3(.22, .28, .4) * pow(max(m, 0.), 60.) * .5;
  if (d.y < 0.) c = vec3(.03, .035, .05);
  gl_FragColor = vec4(c, 1.);
}`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), m);
  mesh.frustumCulled = false;
  return mesh;
}

/** Ciel de crépuscule : horizon embrasé côté soleil, rose et mauve à l'opposé. */
function duskSky(): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 0.1, 1) } },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+1.), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.);
  float s = max(dot(d, uSun), 0.);
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  vec2 hs = uSun.xz / max(length(uSun.xz), 1e-4);
  float sh = clamp(dot(hd, hs) * .5 + .5, 0., 1.);
  vec3 zen = vec3(.16, .2, .38);
  vec3 horSun = vec3(1.9, .82, .34);
  vec3 horAnti = vec3(.95, .55, .55);
  vec3 hor = mix(horAnti, horSun, pow(sh, 2.2));
  vec3 c = mix(hor, zen, pow(y, .42));
  c = mix(c, vec3(.42, .3, .48), smoothstep(.05, .35, y) * (1. - sh) * .5);
  c += vec3(1.6, .75, .3) * pow(s, 8.) * .8 + vec3(2., 1.2, .6) * pow(s, 90.) * 1.5;
  c += vec3(30., 20., 12.) * smoothstep(.9993, .9997, s);
  // Voiles de nuages effilés, éclairés par en dessous.
  if (d.y > 0.) {
    vec2 q = d.xz / (d.y + .1);
    float cl = n(q * vec2(.6, 2.2)) * .6 + n(q * vec2(1.4, 5.)) * .3 + n(q * 3.1) * .1;
    float a = smoothstep(.55, .85, cl) * smoothstep(0., .1, d.y) * smoothstep(.55, .2, d.y);
    vec3 cc = mix(vec3(.55, .32, .38), vec3(2.2, 1., .45), pow(sh, 3.) * .9 + pow(s, 4.) * .5);
    c = mix(c, cc, a * .7);
  }
  if (d.y < 0.) c = hor * .6;
  gl_FragColor = vec4(c, 1.);
}`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), m);
  mesh.frustumCulled = false;
  return mesh;
}

export class RefViewer {
  readonly quality: Quality;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 9000);
  controls: OrbitControls | null = null;
  ready: Promise<void>;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private gtao: GTAOPass | null = null;
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0x26324d, 0x2a1d14, 0);
  private sky = duskSky();
  private night = nightSky();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private mats: RefMaterials | null = null;
  private ship: RefShip | null = null;
  private shipRoot = new THREE.Group();
  private lamps: THREE.PointLight[] = [];
  private podLights: THREE.PointLight[] = [];
  private jets: THREE.Mesh[] = [];
  private smoke = new Puffs(700, new THREE.Color('#6d6a68'), 0.12);
  private steam = new Puffs(240, new THREE.Color('#f2efe9'), 0.25);
  private dust = new Puffs(500, new THREE.Color('#d2a273'), 0.2);
  private sailU = {
    uTime: { value: 0 },
    uSunView: { value: new THREE.Vector3() },
    uSunCol: { value: new THREE.Color() },
  };
  private mood: RefMood = 'dusk';
  private t = 0;
  private raf = 0;
  private last = 0;
  private shipY = 0;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: {
      textures: string;
      quality?: Quality;
      preserve?: boolean;
      interactive?: boolean;
      onProgress?: (f: number, label: string) => void;
    }
  ) {
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserve,
    }));
    this.quality = opts.quality ?? detectQuality(r);
    const q = this.quality;
    r.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, q.tier === 'high' ? 1.5 : 1)
    );
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(r);

    this.scene.add(this.sky, this.night);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -48;
    sc.right = sc.top = 48;
    sc.near = 10;
    sc.far = 600;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.add(this.shipRoot);
    this.scene.add(this.smoke.points, this.steam.points, this.dust.points);

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
    // Garde-fou : un pixel NaN ou infini, étalé par le flou du bloom,
    // deviendrait un grand carré noir. On le neutralise avant tout effet.
    const clean = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main(){ vec4 c = texture2D(tDiffuse, vUv);
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0., 0., 0., 1.);
  // Reflets extrêmes (métal poli tout près d'une lampe) : plafonnés en gardant
  // la teinte, sinon le bloom en fait un halo blanc géant.
  float mx = max(max(c.r, c.g), c.b);
  if (mx > 24.) c.rgb *= 24. / mx;
  gl_FragColor = vec4(c.rgb, c.a); }`,
    });
    // Ne touche pas à la profondeur partagée (lue par l'occlusion ambiante).
    clean.material.depthTest = false;
    clean.material.depthWrite = false;
    this.composer.addPass(clean);
    if (q.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.setGBuffer(depth);
      this.gtao.blendIntensity = 0.8;
      this.gtao.updateGtaoMaterial({
        radius: 1.6,
        distanceExponent: 1.5,
        thickness: 1.2,
        scale: 1,
      });
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.camera.position.set(62, 14, 70);
    if (opts.interactive) {
      const c = (this.controls = new OrbitControls(this.camera, canvas));
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.minDistance = 14;
      c.maxDistance = 320;
      c.maxPolarAngle = 1.53;
    }

    const progress = opts.onProgress ?? (() => {});
    const breathe = () => new Promise<void>((res) => setTimeout(res, 0));
    this.ready = (async () => {
      const m = await createRefMaterials(opts.textures, q.texSize, progress);
      if (this.disposed) return;
      this.mats = m;
      progress(0.74, 'Sculpture du canyon');
      await breathe();
      this.scene.add(buildDesert(m));
      progress(0.84, 'Assemblage du navire');
      await breathe();
      this.buildShip(m);
      this.setMood(this.mood);
      // Compilation des shaders en tâche de fond (évite le gel de la 1re image).
      progress(0.93, 'Allumage des chaudières');
      await breathe();
      try {
        await r.compileAsync(this.scene, this.camera);
      } catch {
        // compilation au premier rendu
      }
      progress(1, 'Prêt');
    })();
  }

  private buildShip(m: RefMaterials) {
    // Voiles : un peu de vent dans la toile, et la lumière qui la traverse.
    m.canvas.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.sailU);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float sw;\nuniform float uTime;'
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed.x += sw * (sin(uTime*1.3 + position.y*.3 + position.z*.15)*.16 + sin(uTime*2.9 + position.z*.5)*.05);`
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunView, uSunCol;'
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uSunCol * (max(-dot(normal, uSunView), 0.) * .45 + .04);`
        );
    };
    const ship = (this.ship = buildShip(m));
    const flagMat = ship.flags.material as THREE.MeshStandardMaterial;
    flagMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.sailU);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float sw;\nuniform float uTime;'
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed.z += sw * sin(uTime*6. - sw*7. + position.y) * .45 * sw;
transformed.y += sw * sin(uTime*4.3 - sw*5.) * .08;`
        );
    };
    this.shipY = groundY(0, 0) + 9;
    this.shipRoot.add(ship.group);
    this.shipRoot.position.set(0, this.shipY, 0);
    // Lanternes (lumières réelles, actives la nuit).
    ship.lights.slice(0, 8).forEach((p) => {
      const l = new THREE.PointLight(0xffa860, 0, 22, 2);
      l.position.copy(p);
      this.lamps.push(l);
      ship.group.add(l);
    });
    ship.nozzles.forEach((p) => {
      const jet = aetherJet(AETHER);
      jet.position.copy(p);
      ship.group.add(jet);
      this.jets.push(jet);
      // Lueur portée sur le sable : la lampe est près du sol, loin du métal
      // de la nacelle (un point lumineux contre du cuivre poli éblouit).
      const l = new THREE.PointLight(AETHER, 0, 14, 2);
      const gy = groundY(p.x, p.z) - this.shipY;
      l.position.set(p.x, Math.max(gy + 2.2, p.y - 6), p.z);
      ship.group.add(l);
      this.podLights.push(l);
    });
    if (this.controls) {
      this.controls.target.set(0, this.shipY + 9, 0);
      this.controls.update();
    }
    // Pré-remplit fumée et poussière (la scène s'ouvre « en route »).
    for (let i = 0; i < 300; i++) this.step(1 / 30);
  }

  setMood(mood: RefMood) {
    this.mood = mood;
    const night = mood === 'night';
    const r = this.renderer;
    const sunDir = night
      ? new THREE.Vector3(-0.35, 0.55, -0.75).normalize()
      : new THREE.Vector3(-0.72, 0.085, 0.68).normalize();
    this.sky.visible = !night;
    this.night.visible = night;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uSun.value.copy(
      sunDir
    );
    this.sun.position
      .copy(sunDir)
      .multiplyScalar(300)
      .add(new THREE.Vector3(0, this.shipY, 0));
    this.sun.target.position.set(0, this.shipY, 0);
    this.sun.color.set(night ? '#8ea6ff' : '#ff9a5a');
    this.sun.intensity = night ? 0.55 : 4.2;
    this.hemi.intensity = night ? 0.55 : 0;
    this.scene.fog = night
      ? new THREE.FogExp2('#121826', 0.0011)
      : new THREE.FogExp2('#d8956e', 0.0016);
    r.toneMappingExposure = night ? 1.25 : 1.05;
    this.bloom.strength = night ? 0.6 : 0.3;
    // Éclairage d'ambiance tiré du ciel.
    const envScene = new THREE.Scene();
    const skyCopy = night ? this.night.clone() : this.sky.clone();
    skyCopy.visible = true;
    envScene.add(skyCopy);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = night ? 0.9 : 0.55;
    if (this.mats) {
      this.mats.glass.emissiveIntensity = night ? 2.6 : 0.05;
      this.mats.aether.emissiveIntensity = night ? 3.2 : 2.0;
    }
    this.lamps.forEach((l) => (l.intensity = night ? 40 : 0));
    // Lueur des jets sur le sable : discrète au crépuscule, plus marquée la nuit.
    this.podLights.forEach((l) => (l.intensity = night ? 8 : 1.5));
    this.jets.forEach(
      (j) =>
        ((j.material as THREE.ShaderMaterial).uniforms.uPower.value = night
          ? 0.85
          : 0.45)
    );
    // Particules : teinte de la lumière.
    const lit = night
      ? new THREE.Color(0.16, 0.19, 0.27)
      : new THREE.Color(1.25, 0.8, 0.55);
    const shade = night
      ? new THREE.Color(0.03, 0.035, 0.05)
      : new THREE.Color(0.32, 0.24, 0.22);
    for (const p of [this.smoke, this.steam, this.dust]) {
      p.mat.uniforms.uLight.value.copy(lit);
      p.mat.uniforms.uShade.value.copy(shade);
    }
    this.sailU.uSunCol.value.set(night ? '#3a4560' : '#ffb27a');
    this.sunDir = sunDir;
  }
  private sunDir = new THREE.Vector3(0, 1, 0);

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    // Le compositeur travaille en pixels réels (son propre ratio est 1).
    this.composer.setSize(Math.round(w * pr), Math.round(h * pr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = (h * pr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    for (const p of [this.smoke, this.steam, this.dust])
      p.mat.uniforms.uScale.value = scale;
  }

  /** Avance la simulation de dt secondes (navire, hélice, particules). */
  step(dt: number) {
    this.t += dt;
    const t = this.t;
    const ship = this.ship;
    if (!ship) return;
    this.shipRoot.position.y = this.shipY + Math.sin(t * 0.55) * 0.3;
    this.shipRoot.rotation.x = Math.sin(t * 0.43) * 0.012;
    this.shipRoot.rotation.z = Math.sin(t * 0.31) * 0.007;
    ship.props.forEach((p) => (p.rotation.x += dt * 9));
    this.sailU.uTime.value = t;
    this.jets.forEach(
      (j) => ((j.material as THREE.ShaderMaterial).uniforms.uTime.value = t)
    );
    this.shipRoot.updateMatrixWorld(true);
    const mw = this.shipRoot.matrixWorld;
    const rnd = () => Math.random() - 0.5;
    const wind = new THREE.Vector3(-7.5, 1.0, 1.8);
    const emit = (rate: number, f: () => void) => {
      const n = Math.floor(rate * dt + Math.random());
      for (let i = 0; i < n; i++) f();
    };
    ship.smoke.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      emit(15, () =>
        this.smoke.emit(
          p.clone().add(new THREE.Vector3(rnd() * 1.4, 0, rnd() * 1.4)),
          new THREE.Vector3(rnd() * 4, 5 + Math.random() * 4, rnd() * 4),
          8 + Math.random() * 3,
          2.6,
          14 + Math.random() * 10,
          0.3
        )
      );
    });
    ship.steam.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      emit(5, () =>
        this.steam.emit(
          p,
          new THREE.Vector3(rnd(), 3 + Math.random() * 2, rnd()),
          2.2 + Math.random(),
          0.5,
          4,
          0.55
        )
      );
    });
    ship.nozzles.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      const gy = groundY(p.x, p.z) + 0.6;
      emit(14, () => {
        const a = Math.random() * Math.PI * 2;
        const sp = 5 + Math.random() * 5;
        this.dust.emit(
          new THREE.Vector3(p.x + Math.cos(a) * 2, gy, p.z + Math.sin(a) * 2),
          new THREE.Vector3(
            Math.cos(a) * sp,
            0.8 + Math.random() * 1.2,
            Math.sin(a) * sp
          ),
          4 + Math.random() * 2,
          2.5,
          11,
          0.09
        );
      });
    });
    this.smoke.update(dt, wind, 0.35, 0.8);
    this.steam.update(dt, wind.clone().multiplyScalar(0.6), 0.9, 1.2);
    this.dust.update(dt, new THREE.Vector3(-3, 0.3, 0.8), 0.8, 0);
  }

  render() {
    this.controls?.update();
    this.sailU.uSunView.value
      .copy(this.sunDir)
      .transformDirection(this.camera.matrixWorldInverse);
    this.sky.position.copy(this.camera.position);
    this.night.position.copy(this.camera.position);
    this.composer.render();
  }

  /** Boucle interactive. */
  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      if (document.hidden) return;
      this.step(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  lookFrom(pos: THREE.Vector3, target: THREE.Vector3, fov = 32) {
    this.camera.position.copy(pos);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  get shipHeight() {
    return this.shipY;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls?.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    void this.canvas;
  }
}
