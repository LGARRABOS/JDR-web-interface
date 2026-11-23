import * as THREE from 'three';
import type { Build, Material as BuildMaterial } from '../../arpenteur/types';
import type {
  NativeFrame,
  NativeHost,
  NativeShipOptions,
} from '../../arpenteur3d/native';
import { crewPose } from '../../arpenteur3d/stage';
import {
  ALLURE_SPECS,
  type CrewMember,
  type CrewStyle,
} from '../../arpenteur3d/shipModel';
import type { Quality } from '../quality';
import { aetherJet, Puffs } from '../ref/fx';
import { createRefMaterials, type RefMaterials } from '../ref/materials';
import { patchFlag, patchSail, type SailUniforms } from '../ref/patches';
import {
  buildShip,
  deckY,
  type HullSpec,
  type RefShip,
  type ShipLook,
} from '../ref/ship';
import { cyl, Kit, lathe, M, tess, torus } from '../ref/kit';
import { Crowd } from './crew';
import { AetherRealm } from './aether';
import { Herds } from './fauna';
import { grassField } from './flora';
import { sandHeight, type GroundParams } from './ground';
import { BiomeScenery } from './scenery';

// Couche réaliste du jeu : le navire de chaque partie (allure, matériaux,
// mâture, luminaires…), son équipage, les navires du port et les habitants,
// le sol de dunes et les paysages, la fumée et la poussière. Tout est dessiné
// dans la scène du moteur Three, avec sa lumière, son ciel et sa brume.

const AETHER = new THREE.Color('#47d9ff');

/** Matériaux partagés entre les scènes (textures fabriquées une seule fois). */
const libs = new Map<number, Promise<RefMaterials>>();
const listeners = new Set<(f: number, label: string) => void>();
let lastProgress: [number, string] = [0, 'Ouverture des soutes'];
export function refLibrary(base: string, size: number) {
  let p = libs.get(size);
  if (!p)
    libs.set(
      size,
      (p = createRefMaterials(base, size, (f, l) => {
        lastProgress = [f, l];
        listeners.forEach((fn) => fn(f, l));
      }))
    );
  return p;
}
/** Suit la fabrication des matériaux (écran d'attente). */
export function onLibraryProgress(fn: (f: number, label: string) => void) {
  listeners.add(fn);
  fn(...lastProgress);
  return () => listeners.delete(fn);
}

interface FogU {
  uFog: { value: THREE.Vector3 };
  uFogDensity: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Vector3 };
  uZenith: { value: THREE.Vector3 };
  uHorizon: { value: THREE.Vector3 };
  uNight: { value: number };
}

const lin = (hex: string) => new THREE.Color(hex);

/** Recolore un matériau (la texture garde son grain, la teinte suit la fiche). */
function tint(
  m: THREE.MeshStandardMaterial,
  hex: string,
  ref: string,
  max = 3
) {
  const c = m.clone();
  const t = lin(hex),
    r = lin(ref);
  c.color.setRGB(
    Math.min(max, t.r / Math.max(0.02, r.r)),
    Math.min(max, t.g / Math.max(0.02, r.g)),
    Math.min(max, t.b / Math.max(0.02, r.b))
  );
  return c;
}

const MATS: Record<BuildMaterial, { hex: string; metal: boolean }> = {
  beaulou: { hex: '#cdb48a', metal: false },
  chene: { hex: '#7d5030', metal: false },
  sombrefer: { hex: '#3e2a1e', metal: false },
  cuivre: { hex: '#c27a45', metal: true },
  fer: { hex: '#8d939b', metal: true },
  boisfer: { hex: '#6e4a2c', metal: false },
  acier: { hex: '#5a636e', metal: true },
};

/** Revêtement d'une surface selon le matériau choisi dans la fiche. */
function surface(
  base: RefMaterials,
  mat: BuildMaterial,
  wood: THREE.MeshStandardMaterial
) {
  const d = MATS[mat] ?? MATS.chene;
  if (mat === 'cuivre') return base.copperSheath;
  if (d.metal) return tint(base.ironPlates, d.hex, '#3a3634', 2.6);
  return tint(wood, d.hex, '#735a45', 2.4);
}

function lookOf(
  build: Build,
  base: RefMaterials,
  o: Partial<NativeShipOptions>
): ShipLook {
  const spec =
    (ALLURE_SPECS as Record<string, HullSpec>)[build.allure] ??
    ALLURE_SPECS.protector;
  const prowMat =
    build.proue.material === 'cuivreor'
      ? tint(base.brass, '#e2b04a', '#c99a45')
      : build.proue.material === 'renforce'
        ? base.castIron
        : base.darkWood;
  return {
    spec: spec as HullSpec,
    mastType: build.mats.type,
    ponts: build.ponts,
    guns: o.guns,
    luminaires: build.poupe.luminaires,
    sculpture: build.proue.sculpture,
    gouvernail: build.poupe.gouvernail,
    flagColor: build.mats.flagColor,
    emblem: build.mats.flagEmblem,
    damage: o.damage ?? 0,
    scaffolding: !!o.scaffolding,
    mats: {
      hullWood: surface(base, build.coque.material, base.hullWood),
      wall: surface(base, build.poupe.material, base.hullWood),
      hullBand: tint(
        base.hullBand,
        build.deco.bands[0] ?? '#2d4746',
        '#c8c8c8',
        4
      ),
      brass: tint(base.brass, build.deco.trim || '#c99a45', '#c99a45'),
      canvas: tint(
        base.canvas,
        build.mats.sailColor || '#e8dcc2',
        '#e8dcc2',
        1.4
      ),
      paint:
        build.quille.material === 'cuivre' ? base.copperSheath : base.paint,
      prow: prowMat,
    },
  };
}

interface ShipRt {
  ship: RefShip;
  root: THREE.Group;
  sailU: SailUniforms;
  jets: THREE.Mesh[];
  lamps: THREE.PointLight[];
  podLights: THREE.PointLight[];
  crewStyle: CrewStyle;
  crewMap: Map<CrewMember, CrewMember>;
  deck: number;
  smokeT: number;
  shown: boolean;
  key: string;
  npc: boolean;
  sailDt: number;
  sailTick: number;
  sailFresh: boolean;
}

export class NativeLayer implements NativeHost {
  ready = false;
  readonly root = new THREE.Group();
  private lib: RefMaterials | null = null;
  private fogU: FogU;
  private player: ShipRt | null = null;
  private pending: { build: Build; opts: NativeShipOptions } | null = null;
  private npcs = new Map<string, ShipRt>();
  private crowd: Crowd;
  private grass: THREE.Mesh;
  private herds: Herds;
  private aether: AetherRealm | null = null;
  private scenery: BiomeScenery | null = null;
  private smoke = new Puffs(900, new THREE.Color('#8a8580'), 0.12);
  private steam = new Puffs(260, new THREE.Color('#f2efe9'), 0.25);
  private dust = new Puffs(600, new THREE.Color('#d2a273'), 0.2);
  private lowQ = false;
  private sunView = new THREE.Vector3();
  private sunDir = new THREE.Vector3(0, 1, 0);
  private sunCol = new THREE.Color();
  private lastScroll = 0;
  private speed = 0;
  private gp: GroundParams = { scroll: 0, amp: 1, calm: 0, calmX: 0 };
  /** Facteur d'échelle des particules (hauteur de l'écran / champ). */
  pointScale = 600;

  constructor(
    shared: FogU,
    quality: Quality,
    textures: string,
    private camera: THREE.Camera,
    private onReady: () => void
  ) {
    this.fogU = shared;
    this.lowQ = quality.tier === 'low';
    this.root.add(this.smoke.points, this.steam.points, this.dust.points);
    this.crowd = new Crowd(400, (m) => this.patch(m));
    this.root.add(this.crowd.root);
    // Savane : herbes sèches (carte graphique) et grands troupeaux.
    this.grass = grassField(
      shared as unknown as Record<string, { value: unknown }>,
      quality.tier === 'low' ? 9000 : 16000
    );
    this.patch(this.grass.material as THREE.Material);
    this.grass.visible = false;
    this.herds = new Herds((m) => this.patch(m));
    this.herds.root.visible = false;
    this.root.add(this.grass, this.herds.root);
    for (const p of [this.smoke, this.steam, this.dust])
      this.patch(p.mat as unknown as THREE.Material, false);
    refLibrary(textures, quality.texSize)
      .then((lib) => {
        this.lib = lib;
        this.scenery = new BiomeScenery(lib, (m) => this.patch(m), quality);
        this.root.add(this.scenery.root);
        this.aether = new AetherRealm(
          lib,
          this.scenery.flora,
          (m) => this.patch(m),
          shared as unknown as Record<string, { value: unknown }>
        );
        this.root.add(this.aether.root);
        if (this.pending) this.setShip(this.pending.build, this.pending.opts);
        this.ready = true;
        this.onReady();
      })
      .catch(() => {
        // Textures absentes : le moteur garde ses maillages classiques.
        this.onReady();
      });
  }

  /** Brume du jeu (même formule que le moteur maison) sur un matériau natif. */
  patch(m: THREE.Material, fog = true) {
    const mm = m as THREE.Material & { __arpFog?: boolean };
    if (mm.__arpFog) return;
    mm.__arpFog = true;
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      if (!fog || !sh.fragmentShader.includes('#include <fog_fragment>'))
        return;
      Object.assign(sh.uniforms, this.fogU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArpW;')
        .replace(
          '#include <fog_vertex>',
          `#include <fog_vertex>
vec4 arpW = vec4(transformed, 1.);
#ifdef USE_INSTANCING
arpW = instanceMatrix * arpW;
#endif
vArpW = (modelMatrix * arpW).xyz;`
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vArpW;\nuniform vec3 uFog, uSunDir, uSunColor, uZenith, uHorizon;\nuniform float uFogDensity, uNight;'
        )
        .replace(
          '#include <fog_fragment>',
          `{
  float dist = length(vArpW - cameraPosition);
  vec3 fd = (vArpW - cameraPosition) / max(dist, 1e-3);
  float hAvg = max(.5 * (vArpW.y + cameraPosition.y), 0.);
  float dens = uFogDensity * (.75 + .9 * exp(-hAvg * .08));
  float fogF = 1. - exp(-dist * dens);
  float sunAmt = pow(max(dot(fd, uSunDir), 0.), 6.);
  vec3 sky = mix(uHorizon, uZenith, clamp(fd.y * 2.5, 0., 1.));
  vec3 haze = mix(uFog, sky, .55) + uSunColor * sunAmt * .14 * (1. - uNight * .8);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, fogF);
}`
        );
    };
    m.customProgramCacheKey = () => prevKey() + (fog ? '|arpfog' : '');
    m.needsUpdate = true;
  }

  private build(
    build: Build,
    o: Partial<NativeShipOptions>,
    crewCount: boolean
  ): ShipRt {
    const lib = this.lib!;
    const look = lookOf(build, lib, o);
    // Navires du port : facettes allégées (vus de plus loin).
    tess.detail = crewCount ? 1 : 0.45;
    let ship: RefShip;
    try {
      ship = buildShip(lib, look);
    } finally {
      tess.detail = 1;
    }
    // Ombres portées : seulement les grandes masses (les détails n'en
    // donnent presque pas et doubleraient le travail).
    const big = new Set<THREE.Material>(
      [
        look.mats?.hullWood,
        look.mats?.wall,
        look.mats?.hullBand,
        lib.copperSheath,
        lib.paint,
        look.mats?.paint,
        lib.darkWood,
        lib.ironPlates,
        lib.deck,
        lib.spar,
        ship.sails.material as THREE.Material,
      ].filter(Boolean) as THREE.Material[]
    );
    ship.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh)
        mesh.castShadow =
          !(mesh as THREE.InstancedMesh).isInstancedMesh &&
          big.has(mesh.material as THREE.Material) &&
          (crewCount ||
            [
              look.mats?.hullWood,
              lib.copperSheath,
              ship.sails.material,
            ].includes(mesh.material as THREE.Material));
    });
    const sailU: SailUniforms = {
      uTime: { value: 0 },
      uSunView: { value: this.sunView },
      uSunCol: { value: this.sunCol },
      uDamage: { value: look.damage },
    };
    // Toile propre à ce navire (couleur, dégâts).
    const canvas = (ship.sails.material as THREE.MeshStandardMaterial).clone();
    canvas.envMapIntensity = 0.55;
    patchSail(canvas, sailU);
    ship.sails.material = canvas;
    patchFlag(ship.flags.material as THREE.Material, sailU);
    ship.group.traverse((ob) => {
      const mesh = ob as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      ms.forEach((mm) => this.patch(mm));
    });
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    // Pont principal du modèle classique vers y = 0 : on abaisse le navire neuf.
    ship.group.position.y = -ship.deck;
    root.add(ship.group);
    const rt: ShipRt = {
      ship,
      root,
      sailU,
      jets: [],
      lamps: [],
      podLights: [],
      crewStyle: { body: '#6a4a32', accent: '#c99a45' },
      crewMap: new Map(),
      deck: ship.deck,
      smokeT: 0,
      shown: false,
      key: '',
      npc: !crewCount,
      sailDt: 0,
      sailTick: 0,
      sailFresh: false,
    };
    ship.nozzles.forEach((p) => {
      const jet = aetherJet(AETHER);
      jet.position.copy(p);
      ship.group.add(jet);
      rt.jets.push(jet);
    });
    if (crewCount) {
      ship.lights.slice(0, 4).forEach((p) => {
        const l = new THREE.PointLight(ship.lampColor, 0, 20, 2);
        l.position.copy(p);
        ship.group.add(l);
        rt.lamps.push(l);
      });
      ship.nozzles.slice(0, 4).forEach((p) => {
        const l = new THREE.PointLight(AETHER, 0, 14, 2);
        l.position.copy(p).add(new THREE.Vector3(0, -4, 0));
        ship.group.add(l);
        rt.podLights.push(l);
      });
    }
    return rt;
  }

  private dropShip(rt: ShipRt | null) {
    if (!rt) return;
    this.root.remove(rt.root);
    rt.root.traverse((ob) => {
      const mesh = ob as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
    });
  }

  setShip(build: Build, opts: NativeShipOptions) {
    if (!this.lib) {
      this.pending = { build, opts };
      return;
    }
    this.pending = null;
    // Même navire (passage jour / nuit, quai recalculé) : on le garde, seules
    // les références de l'équipage changent.
    const key = JSON.stringify([
      build,
      opts.guns ?? 0,
      opts.damage ?? 0,
      !!opts.scaffolding,
      opts.parts.crew.length,
    ]);
    const old = this.player;
    if (old && old.key === key) {
      const prev = [...old.crewMap.values()];
      old.crewMap = new Map(opts.parts.crew.map((c, i) => [c, prev[i] ?? c]));
      old.crewStyle = opts.parts.crewStyle;
      return;
    }
    this.dropShip(this.player);
    const rt = this.build(build, opts, true);
    rt.key = key;
    // Le pont neuf n'a pas les mêmes encombrements : chaque matelot reçoit
    // une place libre proche de la sienne (ou la barre, pour le timonier).
    const taken: THREE.Vector3[] = [];
    for (const c of opts.parts.crew) {
      const L = opts.parts.length;
      const sc = Math.min(0.99, Math.max(0.01, c.pos[0] / L + 0.5));
      const onRoof = c.pos[1] > deckY(sc) - rt.deck + 1.5;
      const place = (p: readonly number[]) => {
        const v =
          c.role === 'helm' && rt.ship.helmAt
            ? rt.ship.helmAt.clone()
            : rt.ship.spot(p[0], p[2], onRoof, taken);
        taken.push(v);
        return [v.x, v.y - rt.deck, v.z] as [number, number, number];
      };
      const nc: CrewMember = { ...c, pos: place(c.pos) };
      if (c.to) {
        const t = place(c.to);
        nc.to = [t[0], nc.pos[1], t[2]];
      }
      rt.crewMap.set(c, nc);
      // Le cabestan du modèle classique, pour celui qui le vire.
      if (c.role === 'capstan') {
        const k = new Kit();
        const lib = this.lib;
        k.add(
          lib.darkWood,
          lathe(
            [
              [0.45, 0],
              [0.4, 0.15],
              [0.32, 0.25],
              [0.3, 0.8],
              [0.38, 0.9],
              [0.4, 1.05],
              [0.001, 1.08],
            ],
            24
          )
        );
        k.add(lib.brass, torus(0.34, 0.04, 24, 6), M(0, 0.85, 0, Math.PI / 2));
        for (let i = 0; i < 6; i++)
          k.add(
            lib.spar,
            cyl(0.04, 0.04, 2.6, 8),
            M(0, 0.95, 0, Math.PI / 2, (i / 6) * Math.PI, 0)
          );
        const g = k.build(lib.rope);
        g.position.set(nc.pos[0], nc.pos[1], nc.pos[2]);
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) this.patch(mesh.material as THREE.Material);
        });
        rt.root.add(g);
      }
    }
    rt.crewStyle = opts.parts.crewStyle;
    this.player = rt;
    this.root.add(rt.root);
  }

  private shipFrame(
    rt: ShipRt,
    model: THREE.Matrix4,
    f: NativeFrame,
    docked: number,
    power: number
  ) {
    rt.root.matrix.copy(model);
    rt.root.matrixWorldNeedsUpdate = true;
    rt.ship.rig.setUnderway(docked < 0.5);
    // Première image : la voilure est d'emblée dans son état (pas de manœuvre).
    if (!rt.shown) {
      rt.ship.rig.snap();
      rt.shown = true;
    }
    rt.ship.props.forEach(
      (p) => (p.rotation.x += f.dt * 9 * (0.15 + 0.85 * (1 - docked)))
    );
    rt.sailU.uTime.value = f.time;
    // La toile est recalculée sur le processeur : les navires du port à quai,
    // voiles serrées, ne la recalculent plus ; en manœuvre, une image sur trois.
    const rig = rt.ship.rig;
    // À quai (ou petite qualité), la toile est simulée à demi-cadence.
    rig.slow = docked > 0.5 || this.lowQ;
    rt.sailDt += f.dt;
    // Voiles serrées et immobiles : plus rien à recalculer (navire du joueur
    // compris) ; les navires du port en manœuvre, une image sur trois.
    {
      rt.sailTick++;
      const still = rig.settled && !rig.underway;
      if (still && rt.sailFresh) {
        rt.sailDt = 0;
        return this.jets(rt, f, power);
      }
      if (rt.npc && !still && rt.sailTick % 3) return this.jets(rt, f, power);
      rt.sailFresh = still;
    }
    rig.update(f.time, rt.sailDt);
    rt.sailDt = 0;
    this.jets(rt, f, power);
  }

  private jets(rt: ShipRt, f: NativeFrame, power: number) {
    rt.jets.forEach((j) => {
      const u = (j.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = f.time;
      u.uPower.value = power * (f.night ? 0.85 : 0.45);
    });
  }

  frame(f: NativeFrame) {
    if (!this.lib) return;
    const night = f.night;
    const L = f.light;
    // Lumière vue par la toile et les particules.
    this.sunDir.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]).normalize();
    this.sunCol
      .setRGB(L.sunColor[0], L.sunColor[1], L.sunColor[2])
      .multiplyScalar(night ? 0.5 : 1);
    // Vitesse du sable (vent apparent pour la fumée).
    const dsc = f.scroll - this.lastScroll;
    this.lastScroll = f.scroll;
    if (f.dt > 0)
      this.speed +=
        (Math.min(80, Math.max(0, dsc / f.dt)) - this.speed) *
        Math.min(1, f.dt * 2);

    // Sol et paysage.
    this.gp = {
      scroll: f.scroll,
      amp: f.duneAmp,
      calm: f.calm,
      calmX: f.calmX,
      terrain: f.terrain,
    };
    this.scenery?.frame(f, this.gp);
    const savanna = f.biome === 'savane' && f.ground && !f.inVoid;
    this.grass.visible = savanna;
    this.herds.frame(f.time, this.gp, savanna);
    this.scenery?.preload(f.nextBiome);
    // Mer de brume d'Aether (position inconnue), préparée pendant le voyage.
    if (this.aether) {
      this.aether.frame(f, f.scroll, f.inVoid && f.ground, this.pointScale);
      if (f.nextVoid && !f.inVoid) this.aether.work(2);
    }

    // Navire de la partie.
    const shipM = new THREE.Matrix4().fromArray(f.shipM);
    const pr = this.player;
    if (pr) {
      this.shipFrame(pr, shipM, f, f.dock, 1 - f.dock * 0.6);
      pr.lamps.forEach((l) => (l.intensity = night ? 30 : 0));
      pr.podLights.forEach(
        (l) => (l.intensity = (night ? 8 : 1.5) * (1 - f.dock * 0.6))
      );
      this.crowd.begin();
      const base = pr.root.matrix;
      for (const c of f.crew)
        this.crowd.add(
          base,
          pr.crewStyle,
          crewPose(pr.crewMap.get(c) ?? c, f.time),
          0,
          0.95
        );
      this.emit(pr, shipM, f);
    }

    // Navires du port.
    const seen = new Set<string>();
    // Un seul navire du port modelé par image (pas d'à-coup à l'arrivée).
    let built = false;
    for (const n of f.npc) {
      seen.add(n.key);
      let rt = this.npcs.get(n.key);
      if (!rt) {
        if (built) continue;
        built = true;
        rt = this.build(n.build, { crew: 0 }, false);
        this.npcs.set(n.key, rt);
        this.root.add(rt.root);
      }
      rt.root.visible = true;
      this.shipFrame(
        rt,
        new THREE.Matrix4().fromArray(n.model),
        f,
        1 - n.glow,
        n.glow
      );
    }
    // Navires d'un port quitté : cachés, puis libérés si le cache grossit.
    for (const [k, rt] of this.npcs)
      if (!seen.has(k)) {
        rt.root.visible = false;
        if (this.npcs.size > 24) {
          this.dropShip(rt);
          this.npcs.delete(k);
        }
      }
    // Habitants (les plus lointains, invisibles à cette taille, sont omis).
    if (!pr) this.crowd.begin();
    const cam = this.camera.position;
    const bm = new THREE.Matrix4();
    const wp = new THREE.Vector3();
    for (const p of f.crowd) {
      bm.fromArray(p.base);
      wp.set(p.member.pos[0], p.member.pos[1], p.member.pos[2]).applyMatrix4(
        bm
      );
      if (wp.distanceToSquared(cam) > 420 * 420) continue;
      this.crowd.add(bm, p.style, crewPose(p.member, f.time), 0, 0.95);
    }
    this.crowd.end();

    // Particules : couleur de la lumière du moment.
    const lit = new THREE.Color(
      L.sunColor[0],
      L.sunColor[1],
      L.sunColor[2]
    ).multiplyScalar(night ? 0.25 : 0.9);
    lit.r += L.zenith[0] * 0.5;
    lit.g += L.zenith[1] * 0.5;
    lit.b += L.zenith[2] * 0.5;
    const shade = new THREE.Color(
      L.zenith[0],
      L.zenith[1],
      L.zenith[2]
    ).multiplyScalar(night ? 0.3 : 0.6);
    for (const p of [this.smoke, this.steam, this.dust]) {
      p.mat.uniforms.uLight.value.copy(lit);
      p.mat.uniforms.uShade.value.copy(shade);
    }
    const wind = new THREE.Vector3(-1.2 - this.speed * 0.8, 1.0, 0.8);
    this.smoke.update(f.dt, wind, 0.35, 0.8);
    this.steam.update(f.dt, wind.clone().multiplyScalar(0.6), 0.9, 1.2);
    this.dust.update(
      f.dt,
      new THREE.Vector3(-this.speed * 0.9, 0.3, 0.8),
      0.8,
      0
    );
    this.dust.points.visible = !f.inVoid;
  }

  /** Appelé par le moteur une fois la caméra placée. */
  beforeRender(height: number, fov: number) {
    this.camera.updateMatrixWorld();
    this.sunView
      .copy(this.sunDir)
      .transformDirection(this.camera.matrixWorldInverse);
    this.pointScale = height / (2 * Math.tan(fov / 2));
    for (const p of [this.smoke, this.steam, this.dust])
      p.mat.uniforms.uScale.value = this.pointScale;
  }

  private emit(rt: ShipRt, shipM: THREE.Matrix4, f: NativeFrame) {
    const dt = f.dt;
    if (dt <= 0) return;
    const mw = shipM
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, -rt.deck, 0));
    const rnd = () => Math.random() - 0.5;
    const emit = (rate: number, fn: () => void) => {
      const n = Math.floor(rate * dt + Math.random());
      for (let i = 0; i < n; i++) fn();
    };
    const sp = this.speed;
    rt.ship.smoke.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      emit(14, () =>
        this.smoke.emit(
          p.clone().add(new THREE.Vector3(rnd() * 1.4, 0, rnd() * 1.4)),
          new THREE.Vector3(
            rnd() * 4 - sp * 0.4,
            5 + Math.random() * 4,
            rnd() * 4
          ),
          8 + Math.random() * 3,
          2.6,
          14 + Math.random() * 10,
          0.2 + f.dock * 0.05
        )
      );
    });
    rt.ship.steam.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      emit(5, () =>
        this.steam.emit(
          p,
          new THREE.Vector3(rnd(), 3 + Math.random() * 2, rnd()),
          2.2 + Math.random(),
          0.5,
          4,
          0.5
        )
      );
    });
    if (f.inVoid || f.dock > 0.5 || !f.ground) return;
    rt.ship.nozzles.forEach((s) => {
      const p = s.clone().applyMatrix4(mw);
      const gy = sandHeight(p.x, p.z, this.gp) + 0.6;
      if (p.y - gy > 30) return;
      emit(12, () => {
        const a = Math.random() * Math.PI * 2;
        const v = 5 + Math.random() * 5;
        this.dust.emit(
          new THREE.Vector3(p.x + Math.cos(a) * 2, gy, p.z + Math.sin(a) * 2),
          new THREE.Vector3(
            Math.cos(a) * v,
            0.8 + Math.random() * 1.2,
            Math.sin(a) * v
          ),
          4 + Math.random() * 2,
          2.5,
          11,
          0.09
        );
      });
    });
  }

  dispose() {
    this.dropShip(this.player);
    for (const rt of this.npcs.values()) this.dropShip(rt);
    this.npcs.clear();
    this.scenery?.dispose();
    this.aether?.dispose();
  }
}
