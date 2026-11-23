import * as THREE from 'three';
import type { Spot } from '../arpenteur/spots';
import {
  along,
  STOP_DX,
  STOP_DZ,
  wrapC,
  type Nav,
  type Route,
} from '../arpenteur3d/nav';
import type { AetherRealm } from './native/aether';
import { buildCabin, type Cabin } from './cabin';
import { Landmarks } from './native/landmarks';
import type { RefMaterials } from './ref/materials';

// Carte 3D d'une zone : une maquette en bois posée sur la table des cartes,
// mer de nuages en relief, îlots et repères des lieux-dits en miniature.
// Les repères et la route sont lumineux ; le navire avance dessus en direct.

/** Échelle : 1 unité = 100 m ; les décors sont grossis pour être lisibles. */
const K = 0.01;
const DECO = 0.03;
const LM = 0.075;
const SHIP = 0.07;
// Sur une mer de nuages très claire, les lueurs additives disparaissent :
// couleurs franches en mélange normal, un peu émissives.
const CYAN = new THREE.Color('#1fc8ef');
const GOLD = new THREE.Color('#ff9a1a');

export interface ZoneMapKit {
  lib: RefMaterials;
  aether: AetherRealm;
  ship: THREE.Object3D;
}

export interface ZoneMapInfo {
  nav: Nav;
  route: Route | null;
  period: number;
}

function rnd(seed: number) {
  let h = seed >>> 0 || 1;
  return () => (h = (h * 16807) % 2147483647) / 2147483647;
}

/** Étiquette lumineuse (nom d'un lieu). */
function label(text: string) {
  const cv = document.createElement('canvas');
  cv.width = 640;
  cv.height = 140;
  const g = cv.getContext('2d')!;
  g.font = 'bold 52px Georgia, serif';
  const w = Math.min(620, g.measureText(text).width + 64);
  const x0 = (640 - w) / 2;
  g.fillStyle = 'rgba(8,26,38,0.72)';
  g.strokeStyle = 'rgba(127,243,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x0, 22, w, 92, 10);
  g.fill();
  g.stroke();
  g.fillStyle = '#d8fbff';
  g.shadowColor = '#5ff0ff';
  g.shadowBlur = 16;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 320, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sp.scale.set(8, 1.75, 1);
  sp.renderOrder = 20;
  return sp;
}

/** Point lumineux doux (texture partagée). */
let dotTex: THREE.Texture | null = null;
function glowTexture() {
  if (dotTex) return dotTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(cv);
  return dotTex;
}

/** Mer de nuages en relief (couleurs selon la hauteur). */
function cloudSea(w: number, d: number) {
  const g = new THREE.PlaneGeometry(w, d, 260, 110);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const lo = new THREE.Color('#ad96d8'),
    hi = new THREE.Color('#fbf6ff'),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const n =
      Math.sin(x * 0.42 + Math.sin(z * 0.5) * 1.1) *
        Math.cos(z * 0.48 + Math.sin(x * 0.27) * 1.4) *
        0.5 +
      0.5;
    const n2 =
      Math.sin(x * 1.3 + z * 0.9) * Math.sin(z * 1.4 - x * 0.6) * 0.5 + 0.5;
    const h = n * n * (3 - 2 * n) * 0.9 + n2 * 0.22;
    // Bords qui retombent doucement dans le cadre.
    const e = Math.min(1, (w / 2 - Math.abs(x)) / 2, (d / 2 - Math.abs(z)) / 2);
    p.setY(i, h * Math.max(0, e));
    c.copy(lo).lerp(hi, Math.min(1, h * 1.25));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Boîte aux UV en mètres (le bois ne s'étire pas). */
function woodBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const s = Math.max(w, d) * 0.5;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * s, uv.getY(i) * Math.max(1, h));
  return g;
}

interface Pin {
  spot: Spot;
  root: THREE.Group;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  hit: THREE.Mesh;
  label: THREE.Sprite;
}

export class ZoneMapScene {
  readonly scene = new THREE.Scene();
  /** Largeur et profondeur de la maquette (unités). */
  readonly width: number;
  readonly depth: number;
  private own: { dispose(): void }[] = [];
  private pins: Pin[] = [];
  private ship: THREE.Group;
  private shipGlow: THREE.Sprite;
  private trail: THREE.Points;
  private trailU = { uTime: { value: 0 } };
  private cx: number;
  private cz: number;
  private beamU = { uTime: { value: 0 } };
  private cabin: Cabin;
  private lastRoute: Route | null = null;
  private trailTick = 0;
  /** Modelage restant (îlots, repères), fait peu à peu par populate. */
  private jobs: (() => void)[] = [];

  constructor(
    kit: ZoneMapKit,
    private spots: Spot[],
    private period: number
  ) {
    const { lib, aether } = kit;
    const xs = spots.map((s) => s.x);
    this.cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const zs = spots.map((s) => s.z);
    // De la route de croisière (z = 0) aux repères les plus lointains.
    this.cz = ((zs.length ? Math.min(...zs) : -1000) - 300 + 600) / 2;
    this.width = period * K;
    this.depth = Math.max(
      18,
      (600 - (zs.length ? Math.min(...zs) : -1000) + 400) * K
    );
    const W = this.width,
      D = this.depth;
    const sc = this.scene;
    sc.background = new THREE.Color('#0c0806');

    const keep = <T extends { dispose(): void }>(x: T) => {
      this.own.push(x);
      return x;
    };
    // --- Cabine du capitaine : bureau, objets, lambris, hublots ---
    this.cabin = buildCabin(lib, W, D, -1.8);
    sc.add(this.cabin.group);
    this.own.push(this.cabin);
    // --- Cadre de la maquette ---
    const t = 1.3;
    const frame = (w: number, d: number, x: number, z: number) => {
      const b = new THREE.Mesh(keep(woodBox(w, 2, d)), lib.hullWood);
      b.position.set(x, -0.75, z);
      b.castShadow = b.receiveShadow = true;
      sc.add(b);
      const trim = new THREE.Mesh(
        keep(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02)),
        lib.brass
      );
      trim.position.set(x, 0.3, z);
      sc.add(trim);
    };
    frame(W + 2 * t, t, 0, -D / 2 - t / 2);
    frame(W + 2 * t, t, 0, D / 2 + t / 2);
    frame(t, D, -W / 2 - t / 2, 0);
    frame(t, D, W / 2 + t / 2, 0);
    const bottom = new THREE.Mesh(
      keep(new THREE.BoxGeometry(W, 0.4, D)),
      lib.darkWood
    );
    bottom.position.y = -1.6;
    sc.add(bottom);
    // --- Mer de nuages ---
    const seaM = keep(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
    );
    const sea = new THREE.Mesh(keep(cloudSea(W, D)), seaM);
    sea.position.y = -0.45;
    sea.receiveShadow = true;
    sc.add(sea);
    // --- Lumières : lampe chaude au-dessus de la table ---
    sc.add(new THREE.HemisphereLight('#ffe9cc', '#2a1c12', 0.7));
    const sun = new THREE.DirectionalLight('#ffd9a8', 2.2);
    sun.position.set(-25, 45, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -W / 2 - 4;
    cam.right = W / 2 + 4;
    cam.top = D / 2 + 4;
    cam.bottom = -D / 2 - 4;
    cam.far = 140;
    sun.shadow.bias = -0.0005;
    sc.add(sun);

    // --- Îlots décoratifs (fixes, hors des repères et de la route) ---
    const r = rnd(4242);
    for (let i = 0; i < 34; i++) {
      const x = (r() - 0.5) * (W - 5),
        z = (r() - 0.5) * (D - 4);
      if (this.pinsNear(x, z, 5.5) || Math.abs(z - this.mz(0)) < 1.6) continue;
      const ry = r(),
        rs = r(),
        rh = r();
      // Modelé plus tard, peu à peu (voir populate) : pas de gel à l'ouverture.
      this.jobs.push(() => {
        const isle = aether.isle(300 + i * 7, 10 + rs * 16, {
          ruins: i % 4 === 0,
          crystals: i % 3 === 0,
          tree: i % 5 === 1,
          falls: 0,
        });
        isle.scale.setScalar(DECO);
        isle.position.set(x, 0.7 + rh * 1.3, z);
        isle.rotation.y = ry * 6;
        aether.adopt(isle);
        sc.add(isle);
        this.own.push({
          dispose: () =>
            isle.traverse(
              (o) =>
                (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose()
            ),
        });
      });
    }

    // --- Repères des lieux-dits (lumineux) ---
    const lms = new Landmarks(lib, aether);
    const beamMat = () =>
      keep(
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.beamU.uTime, uCol: { value: CYAN.clone() } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader:
            'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
          fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
void main(){ float a = pow(1. - vUv.y, 1.4) * (.32 + .1 * sin(uTime * 2. + vUv.y * 12.)); gl_FragColor = vec4(uCol * 1.15, a); }`,
        })
      );
    const beamG = keep(new THREE.CylinderGeometry(2.6, 3.4, 10, 32, 1, true));
    beamG.translate(0, 5, 0);
    const ringG = keep(new THREE.RingGeometry(3.6, 4.1, 64));
    ringG.rotateX(-Math.PI / 2);
    const hitG = keep(new THREE.CylinderGeometry(4.2, 4.2, 9, 12));
    hitG.translate(0, 4, 0);
    const hitM = keep(new THREE.MeshBasicMaterial({ visible: false }));
    for (const s of spots) {
      const root = new THREE.Group();
      root.position.set(this.mx(s.x), 0, this.mz(s.z));
      // Le repère d'abord (il compte plus que les îlots).
      this.jobs.unshift(() => {
        const model = lms.make(s.look);
        model.scale.setScalar(LM);
        model.position.y = 0.3;
        model.rotation.y = 0.5;
        root.add(model);
        this.own.push({
          dispose: () =>
            model.traverse(
              (o) =>
                (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose()
            ),
        });
      });
      const ringM = keep(
        new THREE.MeshBasicMaterial({
          color: CYAN,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      const ring = new THREE.Mesh(ringG, ringM);
      ring.position.y = 0.9;
      root.add(ring);
      const beam = new THREE.Mesh(beamG, beamMat());
      root.add(beam);
      const hit = new THREE.Mesh(hitG, hitM);
      hit.userData.spot = s.id;
      root.add(hit);
      const lb = label(s.name);
      this.own.push(lb.material, (lb.material as THREE.SpriteMaterial).map!);
      lb.position.y = 8.2;
      root.add(lb);
      sc.add(root);
      this.pins.push({ spot: s, root, ring, beam, hit, label: lb });
    }

    // --- Route lumineuse (points qui défilent) ---
    const N = 260;
    const tg = keep(new THREE.BufferGeometry());
    tg.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(N * 3), 3)
    );
    tg.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(N), 1));
    tg.setDrawRange(0, 0);
    const tm = keep(
      new THREE.ShaderMaterial({
        uniforms: {
          ...this.trailU,
          uMap: { value: glowTexture() },
          uCol: { value: GOLD },
        },
        transparent: true,
        depthWrite: false,
        vertexShader: `attribute float aS; uniform float uTime; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
  float dash = .45 + .55 * smoothstep(.5, 1., fract(aS * .9 - uTime * 1.2));
  vA = dash; gl_PointSize = (7. + 5. * dash) * 60. / max(1., -mv.z); }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; varying float vA;
void main(){ float m = texture2D(uMap, gl_PointCoord).a; float a = smoothstep(.15, .6, m) * vA; gl_FragColor = vec4(mix(uCol, vec3(1., .95, .8), smoothstep(.75, 1., m)), a); }`,
      })
    );
    this.trail = new THREE.Points(tg, tm);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 5;
    sc.add(this.trail);

    // --- Navire (copie du modèle de la scène) ---
    this.ship = new THREE.Group();
    const s = kit.ship.clone(true);
    s.traverse((o) => {
      o.matrixAutoUpdate = true;
      // Ni particules ni lampes du navire sur la maquette.
      if ((o as THREE.Points).isPoints || (o as THREE.Light).isLight)
        o.visible = false;
    });
    s.matrix.identity();
    s.position.set(0, 0, 0);
    s.rotation.set(0, 0, 0);
    s.scale.setScalar(SHIP);
    s.position.y = -0.15;
    this.ship.add(s);
    this.shipGlow = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: GOLD,
          transparent: true,
          depthWrite: false,
        })
      )
    );
    this.shipGlow.scale.set(6, 6, 1);
    this.shipGlow.position.y = -0.4;
    this.ship.add(this.shipGlow);
    sc.add(this.ship);
  }

  /** Modèle les îlots et repères en laissant la page respirer. */
  async populate(progress?: (f: number) => void) {
    const n = this.jobs.length;
    let t0 = performance.now();
    while (this.jobs.length) {
      this.jobs.shift()!();
      progress?.(1 - this.jobs.length / Math.max(1, n));
      if (performance.now() - t0 > 12) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        t0 = performance.now();
      }
    }
  }

  /** Centre de la zone (x) : la maquette montre [cx - période/2, cx + période/2[. */
  get center() {
    return this.cx;
  }

  /** Position x (zone) → maquette, la zone étant centrée sur ses lieux. */
  mx(x: number) {
    return wrapC(x - this.cx, this.period) * K;
  }
  mz(z: number) {
    return (z - this.cz) * K;
  }
  private pinsNear(x: number, z: number, d: number) {
    return this.spots.some(
      (s) =>
        Math.hypot(this.mx(s.x) - x, this.mz(s.z) - z) < d ||
        Math.hypot(this.mx(s.x + STOP_DX) - x, this.mz(s.z + STOP_DZ) - z) <
          d * 0.7
    );
  }

  /** Point de la maquette où se trouve le navire. */
  shipPosition() {
    return this.ship.position;
  }

  /** Objets cliquables (un par lieu-dit, userData.spot = identifiant). */
  get hits() {
    return this.pins.map((p) => p.hit);
  }

  /**
   * Mise à jour : position du navire, route restante, lieux en surbrillance
   * (`here` : où il est arrêté, `target` : où il va, `hover` : sous la souris).
   */
  update(
    info: ZoneMapInfo | null,
    time: number,
    o: { here: string; target: string; hover: string }
  ) {
    this.cabin.update(time);
    this.beamU.uTime.value = time;
    this.trailU.uTime.value = time;
    for (const p of this.pins) {
      const id = p.spot.id;
      const gold = id === o.target || id === o.here;
      const col = gold ? GOLD : CYAN;
      (p.ring.material as THREE.MeshBasicMaterial).color.copy(col);
      (
        (p.beam.material as THREE.ShaderMaterial).uniforms.uCol
          .value as THREE.Color
      ).copy(col);
      const k = id === o.hover ? 1.18 : 1;
      p.ring.scale.setScalar(
        k * (1 + (id === o.target ? 0.08 * Math.sin(time * 4) : 0))
      );
      p.beam.scale.set(k, id === o.hover ? 1.25 : 1, k);
      p.label.scale.set(8 * k, 1.75 * k, 1);
    }
    if (!info) {
      this.ship.visible = false;
      this.trail.geometry.setDrawRange(0, 0);
      return;
    }
    this.ship.visible = true;
    const nav = info.nav;
    const sx = this.mx(nav.x),
      sz = this.mz(nav.z);
    this.ship.position.set(sx, 1.05 + Math.sin(time * 1.6) * 0.06, sz);
    this.ship.rotation.y = -nav.h;
    this.shipGlow.material.opacity = 0.45 + 0.12 * Math.sin(time * 3);
    // Route restante : du navire au lieu visé, dans le repère de la maquette.
    const r = info.route;
    const g = this.trail.geometry;
    if (!r) {
      g.setDrawRange(0, 0);
      return;
    }
    // Route restante recalculée une image sur trois (les tirets défilent
    // d'eux-mêmes sur la carte graphique).
    if (r === this.lastRoute && ++this.trailTick % 3 !== 0) return;
    this.lastRoute = r;
    // Point de la route le plus proche du navire.
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < r.x.length; i++) {
      const d = (r.x[i] - nav.x) ** 2 + (r.z[i] - nav.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const d0 = r.s[best];
    const shift = sx / K + this.cx - nav.x;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const aS = g.attributes.aS as THREE.BufferAttribute;
    const step = 45;
    let n = 0;
    for (let d = d0 + 30; d < r.length && n < pos.count; d += step) {
      const q = along(r, d);
      const x = (q.x + shift - this.cx) * K;
      if (Math.abs(x) > this.width / 2 - 0.5) continue;
      pos.setXYZ(n, x, 0.95, this.mz(q.z));
      aS.setX(n, (d - d0) / step);
      n++;
    }
    pos.needsUpdate = true;
    aS.needsUpdate = true;
    g.setDrawRange(0, n);
  }

  dispose() {
    this.own.forEach((x) => x.dispose());
    this.own = [];
  }
}

/** Maquettes déjà construites (par zone), gardées d'une ouverture à l'autre. */
const cache = new Map<string, { ship: THREE.Object3D; scene: ZoneMapScene }>();
export function cachedZoneMap(
  key: string,
  kit: ZoneMapKit,
  spots: Spot[],
  period: number
) {
  const c = cache.get(key);
  if (c && c.ship === kit.ship) return { scene: c.scene, fresh: false };
  // Navire changé (nouvelle construction) : maquettes refaites.
  if (c) {
    c.scene.dispose();
    cache.delete(key);
  }
  const scene = new ZoneMapScene(kit, spots, period);
  cache.set(key, { ship: kit.ship, scene });
  return { scene, fresh: true };
}
