import type { Build } from '../arpenteur/types';
import { defaultBuild } from '../arpenteur/defaults';
import {
  lighting,
  ROCK_LOOP,
  terrainMesh,
  type DesertId,
  type Mood,
} from './environment';
import {
  chain,
  identity,
  normalize,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  translation,
  type Mat4,
  type Vec3,
} from './math';
import {
  Renderer,
  type DrawItem,
  type MeshHandle as GpuMesh,
  type RenderBackend,
  type Lighting,
} from './renderer';
import { MeshBuilder, P } from './geometry';
import { BERTHS, cityMesh, lerpLighting, veil } from './city';
import { portalMesh, voidLighting, voidMeshes } from './voidRealm';
import {
  doorLeaves,
  hangarLighting,
  hangarRoom,
  type HangarDims,
} from './hangar';
import { CameraRig, shotAt, type Shot } from './cinema';
import {
  BIOMES,
  biomeLighting,
  biomeOf,
  farMesh,
  featuresMesh,
  type Biome,
} from './biomes';
import {
  buildShip,
  crewMeshes,
  type CrewMember,
  type ShipParts,
} from './shipModel';
import { transformPoint } from './math';

// Mise en scène : décor + navire, cadrage de trois-quarts, animation.

export interface StageOptions {
  guns?: number;
  crew?: number;
  damage?: number;
  scaffolding?: boolean;
}

export interface ViewOptions {
  /** Azimut de la caméra (radians, 0 = travers tribord, > 0 vers la proue). */
  yaw?: number;
  /** Hauteur de la caméra (radians). */
  pitch?: number;
  /** Marge de cadrage (1 = serré). */
  margin?: number;
  /** Décalage horizontal du navire dans le cadre (-1..1). */
  shift?: number;
  ground?: boolean;
  fov?: number;
  /** Hauteur de l'œil au-dessus du sable (m) ; sinon déduite de l'élévation. */
  eyeHeight?: number;
  /** Angle de plongée de la caméra (radians). */
  elevation?: number;
  /** Décale la visée vers le haut (fraction de la demi-hauteur). */
  lift?: number;
}

const HOVER = 13;
/** Hauteur de vol à quai (le pont arrive au niveau du quai). */
const HOVER_DOCK = 9;
/** Vitesse de croisière (défilement du sable, m/s). */
const CRUISE = 9;

/** Où se trouve le navire : en plein désert, ou amarré dans une ville. */
export interface Place {
  /** Position inconnue : la mer de brume d'Aether. */
  void?: boolean;
  /** `hangar` : l'équipage y possède son hangar, le navire s'amarre dedans. */
  city?: { id: string; capital?: boolean; hangar?: boolean };
}

/** Décor d'une position : désert et ville éventuelle. */
export interface Scene {
  desert: DesertId;
  place: Place;
  /** Sous-région qui donne le paysage (relief, lointains, curiosités). */
  biome?: string;
}

interface Journey {
  key: string;
  from: Scene;
  to: Scene;
  start: number;
  duration: number;
  fromLight: Lighting;
  toLight: Lighting;
  /** Distance parcourue (m) échantillonnée sur la progression 0..1. */
  table: Float32Array;
  total: number;
  base: number;
  /** Paysages croisés avant et après la tempête (changement de zone). */
  propsA: GpuMesh;
  propsB: GpuMesh;
  fromBiome: Biome;
  toBiome: Biome;
}

/** Ville chargée : décor, amarres, habitants et autres navires. */
interface CityRt {
  city: GpuMesh;
  moor: GpuMesh;
  crowd: CrewMember[];
  /** Nef du hangar de l'équipage, quand le navire y est amarré. */
  hangar: {
    shell: GpuMesh;
    glass: GpuMesh;
    door: GpuMesh;
    moor: GpuMesh;
    dims: HangarDims;
  } | null;
  ships: {
    key: string;
    build: Build;
    /** Maillages du moteur maison (absents si le rendu réaliste dessine le navire). */
    body: GpuMesh | null;
    glows: GpuMesh | null;
    x: number;
    z: number;
    cycle?: { period: number; phase: number };
  }[];
}

const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
const smooth = (a: number, b: number, x: number) => ease((x - a) / (b - a));
/** Vitesse de pointe pendant un voyage (multiple de la croisière). */
const VMAX = 7;
const SAMPLES = 400;
/** Durée du passage jour / nuit (ms). */
const FADE_MS = 5000;

/** Vitesse (en multiples de la croisière) à la progression p du voyage. */
function journeySpeed(p: number, v0: number, v1: number) {
  if (p < 0.16) return v0 + (VMAX - v0) * ease(p / 0.16);
  if (p > 0.74) return VMAX + (v1 - VMAX) * ease((p - 0.74) / 0.26);
  return VMAX;
}

const CREW_SCALE = 1.4;

export class Stage {
  readonly r: RenderBackend;
  private env: { terrain: GpuMesh };
  private biome: Biome = BIOMES.dunes;
  /** Lointains et bande de décor de chaque paysage (cache). */
  private biomes = new Map<string, { far: GpuMesh; band: GpuMesh }>();
  private ship: {
    parts: ShipParts;
    body: GpuMesh;
    glows: GpuMesh;
    dust: GpuMesh;
    fans: { mesh: GpuMesh; place: Mat4; speed: number }[];
    crew: { torso: GpuMesh; leg: GpuMesh; arm: GpuMesh };
  } | null = null;
  private light: Lighting;
  private mood: Mood = 'dusk';
  private desert: DesertId = 'mahibori';
  /** Passage progressif du jour à la nuit (ou l'inverse). */
  private fade: {
    from: Lighting;
    to: Mood;
    start: number;
    swapped: boolean;
  } | null = null;
  private lastShip: { build: Build; opts: StageOptions } | null = null;
  private place: Place = {};
  private cities = new Map<string, CityRt>();
  /** Ouverture des portes du hangar (entrée -x, sortie +x), 0..1. */
  private doors: [number, number] = [0, 0];
  /** Habillages des habitants (trois tenues). */
  private folk: { torso: GpuMesh; leg: GpuMesh; arm: GpuMesh }[] = [];
  private journey: Journey | null = null;
  private nat: import('./native').NativeHost | null = null;
  private camRig = new CameraRig();
  private npc: import('./native').NativeFrame['npc'] = [];
  private crowd: import('./native').NativeFrame['crowd'] = [];
  private scrollPos = 0;
  private lastT = -1;

  /**
   * `backend` : moteur de rendu à utiliser (Three.js…) ; par défaut, le
   * moteur WebGL2 maison.
   */
  constructor(
    canvas: HTMLCanvasElement,
    opts: { preserve?: boolean; backend?: RenderBackend } = {}
  ) {
    this.r = opts.backend ?? new Renderer(canvas, opts);
    this.env = {
      terrain: this.r.upload(terrainMesh()),
    };
    this.light = lighting('mahibori', 'dusk');
  }

  setEnvironment(desert: DesertId, mood: Mood, place: Place = {}, biome = '') {
    this.endJourney();
    this.applyEnv(desert, mood, place, biome);
  }

  /**
   * Voyage d'un secteur à l'autre, calé sur l'horloge (départ `startMs`,
   * durée `durationMs`) pour être vu au même point par tous les joueurs :
   * le navire largue les amarres ou accélère, le sable défile de plus en plus
   * vite, les paysages défilent (balises, arches, épaves, ruines), la lumière
   * passe d'un désert à l'autre avec un bref coup de vent de sable, la ville
   * d'arrivée grandit à l'horizon, puis il ralentit et s'amarre ou reprend
   * sa croisière.
   */
  setJourney(
    from: Scene,
    to: Scene,
    mood: Mood,
    startMs: number,
    durationMs: number
  ) {
    const key = `${startMs}|${scKey(from)}|${scKey(to)}`;
    if (this.journey?.key === key) return;
    this.endJourney();
    if (Date.now() >= startMs + durationMs) {
      this.applyEnv(to.desert, mood, to.place, to.biome);
      return;
    }
    this.applyEnv(from.desert, mood, from.place, from.biome);
    const v0 = from.place.city ? 0 : 1;
    const v1 = to.place.city ? 0 : 1;
    const table = new Float32Array(SAMPLES + 1);
    const dt = durationMs / 1000 / SAMPLES;
    for (let i = 1; i <= SAMPLES; i++) {
      const p = (i - 0.5) / SAMPLES;
      table[i] = table[i - 1] + CRUISE * journeySpeed(p, v0, v1) * dt;
    }
    const total = table[SAMPLES];
    this.journey = {
      key,
      from,
      to,
      start: startMs,
      duration: durationMs,
      fromLight: sceneLight(from, mood),
      toLight: sceneLight(to, mood),
      fromBiome: biomeOf(from.biome ?? '', from.desert),
      toBiome: biomeOf(to.biome ?? '', to.desert),
      table,
      total,
      base: this.scrollPos,
      propsA: this.r.upload(
        featuresMesh(
          biomeOf(from.biome ?? '', from.desert),
          'a' + scKey(from),
          60,
          total,
          { night: mood === 'night' }
        )
      ),
      propsB: this.r.upload(
        featuresMesh(
          biomeOf(to.biome ?? '', to.desert),
          'b' + scKey(to),
          60,
          total,
          { night: mood === 'night' }
        )
      ),
    };
  }

  get traveling() {
    return !!this.journey || !!this.fade;
  }

  /**
   * Change le moment de la journée. Avec transition, la lumière glisse en
   * quelques secondes (le soleil se couche, le ciel s'assombrit) ; les
   * fenêtres et lanternes s'allument à mi-parcours, quand la lumière baisse.
   */
  setMood(mood: Mood, transition = true) {
    if (mood === this.mood && !this.fade) return;
    if (!transition) {
      this.fade = null;
      this.swapMood(mood);
      return;
    }
    this.fade = {
      from: this.light,
      to: mood,
      start: Date.now(),
      swapped: false,
    };
  }

  private swapMood(mood: Mood) {
    this.applyEnv(this.desert, mood, this.place, this.biomeKey);
  }

  private endJourney() {
    if (!this.journey) return;
    this.r.release(this.journey.propsA);
    this.r.release(this.journey.propsB);
    this.journey = null;
  }

  private biomeKey = '';
  private applyEnv(desert: DesertId, mood: Mood, place: Place, biome = '') {
    this.biomeKey = biome;
    if (mood !== this.mood) {
      this.clearCities();
      this.clearBiomes();
    }
    const moodChanged = mood !== this.mood;
    this.biome = biomeOf(biome, desert);
    this.desert = desert;
    this.light = place.void
      ? voidLighting(mood)
      : biomeLighting(lighting(desert, mood), this.biome);
    this.mood = mood;
    this.place = place;
    // Lanternes et hublots du navire suivent le jour et la nuit.
    if (moodChanged && this.lastShip && this.ship)
      this.setShip(this.lastShip.build, this.lastShip.opts);
  }

  /** Lointains et bande de curiosités d'un paysage (construits à la demande). */
  private biomeMeshes(b: Biome) {
    let m = this.biomes.get(b.id);
    if (!m) {
      const night = this.mood === 'night';
      m = {
        far: this.r.upload(farMesh(b, night)),
        band: this.r.upload(
          featuresMesh(b, 'band', -ROCK_LOOP / 2 + 30, ROCK_LOOP / 2 - 30, {
            night,
            density: 2.2,
          })
        ),
      };
      this.biomes.set(b.id, m);
    }
    return m;
  }

  /** Mer de brume d'Aether et portail (construits à la demande). */
  private voidRt: {
    sea: GpuMesh;
    far: GpuMesh;
    islands: { mesh: GpuMesh; phase: number; amp: number; x: number }[];
    motes: GpuMesh;
    frame: GpuMesh;
    rings: GpuMesh;
  } | null = null;
  private voidOf() {
    if (!this.voidRt) {
      const night = this.mood === 'night';
      const v = voidMeshes(night);
      const pm = portalMesh(night);
      this.voidRt = {
        sea: this.r.upload(v.sea),
        far: this.r.upload(v.far),
        islands: v.islands.map((i) => ({
          mesh: this.r.upload(i.mesh),
          phase: i.phase,
          amp: i.amp,
          x: i.x,
        })),
        motes: this.r.upload(v.motes),
        frame: this.r.upload(pm.frame),
        rings: this.r.upload(pm.rings),
      };
    }
    return this.voidRt;
  }
  private clearVoid() {
    const v = this.voidRt;
    if (!v) return;
    this.r.release(v.sea);
    this.r.release(v.far);
    v.islands.forEach((i) => this.r.release(i.mesh));
    this.r.release(v.motes);
    this.r.release(v.frame);
    this.r.release(v.rings);
    this.voidRt = null;
  }

  private clearBiomes() {
    this.clearVoid();
    for (const m of this.biomes.values()) {
      this.r.release(m.far);
      this.r.release(m.band);
    }
    this.biomes.clear();
  }

  /** Ville (construite à la demande, gardée en cache). */
  private cityOf(c: {
    id: string;
    capital?: boolean;
    hangar?: boolean;
  }): CityRt | null {
    const key = `${c.id}${c.hangar ? ':hangar' : ''}`;
    let m = this.cities.get(key);
    if (!m && this.ship) {
      const night = this.mood === 'night';
      const d = cityMesh({
        id: c.id,
        capital: c.capital,
        night,
        halfBeam: this.ship.parts.halfBeam,
        length: this.ship.parts.length,
        hover: HOVER_DOCK,
        shipTop: HOVER_DOCK + this.ship.parts.top,
        hangar: c.hangar,
      });
      // Autres navires du port, chacun avec sa silhouette et ses couleurs.
      const ships = BERTHS.map((q, k) => {
        const build = npcBuild(c.id, k);
        const nat = !!this.r.native?.ready;
        const parts = nat ? null : buildShip(build, { crew: 0, night });
        return {
          key: `${c.id}:${k}`,
          build,
          body: parts ? this.r.upload(parts.body) : null,
          glows: parts ? this.r.upload(parts.glows) : null,
          x: q.x,
          z: q.z,
          cycle: q.cycle,
        };
      });
      const hg = d.hangar;
      m = {
        city: this.r.upload(d.city),
        moor: this.r.upload(d.moor),
        crowd: d.crowd,
        hangar: hg
          ? {
              shell: this.r.upload(hg.shell),
              glass: this.r.upload(hg.glass),
              door: this.r.upload(hg.door),
              moor: this.r.upload(hg.moor),
              dims: hg.dims,
            }
          : null,
        ships,
      };
      this.cities.set(key, m);
    }
    if (!this.folk.length)
      this.folk = FOLK.map((st) => {
        const f = crewMeshes(st);
        return {
          torso: this.r.upload(f.torso),
          leg: this.r.upload(f.leg),
          arm: this.r.upload(f.arm),
        };
      });
    return m ?? null;
  }

  private clearCities() {
    for (const m of this.cities.values()) {
      this.r.release(m.city);
      this.r.release(m.moor);
      if (m.hangar) {
        this.r.release(m.hangar.shell);
        this.r.release(m.hangar.glass);
        this.r.release(m.hangar.door);
        this.r.release(m.hangar.moor);
      }
      for (const sh of m.ships) {
        if (sh.body) this.r.release(sh.body);
        if (sh.glows) this.r.release(sh.glows);
      }
    }
    this.cities.clear();
  }

  /** Dessine une ville décalée de `cx` le long du cap, avec sa vie. */
  private drawCity(
    c: CityRt,
    cx: number,
    time: number,
    items: DrawItem[],
    glows: DrawItem[],
    moored: boolean,
    /** Dans la nef, portes closes : rien de l'extérieur n'est visible. */
    interior = false
  ) {
    const base = translation(cx, 0, 0);
    if (!interior)
      items.push({ mesh: c.city, model: base, shadow: Math.abs(cx) < 200 });
    if (moored) items.push({ mesh: c.moor, model: base });
    const hg = c.hangar;
    if (hg) {
      items.push({ mesh: hg.shell, model: base, shadow: Math.abs(cx) < 300 });
      // Verrières : ne font pas d'ombre, le soleil entre par le toit.
      items.push({ mesh: hg.glass, model: base, shadow: false });
      for (const [end, open] of [
        [-1, this.doors[0]],
        [1, this.doors[1]],
      ] as const)
        for (const leaf of doorLeaves(hg.dims, end, open))
          items.push({
            mesh: hg.door,
            model: chain(base, translation(leaf.x, 0, leaf.z)),
            shadow: true,
          });
      if (moored) items.push({ mesh: hg.moor, model: base });
    }
    if (Math.abs(cx) > 900) return;
    const inside = (p: readonly number[]) =>
      !!hg && Math.abs(p[0]) < hg.dims.hx && Math.abs(p[2]) < hg.dims.hz;
    if (!interior)
      for (const sh of c.ships) {
        // Arrivée, escale, départ, puis absence ; les navires filent vers +x.
        let x = sh.x;
        let dock = 1;
        if (sh.cycle) {
          const t = (time + sh.cycle.phase) % sh.cycle.period;
          if (t < 22) {
            const u = 1 - ease(t / 22);
            x = sh.x - 900 * u * u;
            dock = smooth(14, 22, t);
          } else if (t < 52) dock = 1;
          else if (t < 74) {
            const u = (t - 52) / 22;
            x = sh.x + 900 * u * u;
            dock = 1 - smooth(52, 58, t);
          } else continue;
        }
        const y = HOVER_DOCK + (HOVER - HOVER_DOCK) * (1 - dock);
        const bob = Math.sin(time * 1.1 + sh.x) * 0.3 * (1 - dock * 0.8);
        const mdl = chain(base, translation(x, y + bob, sh.z));
        if (this.nat) {
          this.npc.push({
            key: sh.key,
            build: sh.build,
            model: mdl,
            glow: 1 - dock,
          });
          continue;
        }
        if (sh.body) items.push({ mesh: sh.body, model: mdl });
        if (sh.glows) glows.push({ mesh: sh.glows, model: mdl });
      }
    c.crowd.forEach((p, k) => {
      if (interior && !inside(p.pos)) return;
      if (this.nat)
        this.crowd.push({ member: p, style: FOLK[k % FOLK.length], base });
      else poseCrew(items, this.folk[k % this.folk.length], base, p, time);
    });
  }

  setShip(build: Build, opts: StageOptions = {}) {
    this.lastShip = { build, opts };
    this.disposeShip();
    const parts = buildShip(build, { ...opts, night: this.mood === 'night' });
    this.r.native?.setShip(build, { ...opts, parts });
    this.ship = {
      parts,
      body: this.r.upload(parts.body),
      glows: this.r.upload(parts.glows),
      dust: this.r.upload(dustMesh(parts)),
      fans: parts.fans.map((f) => ({
        mesh: this.r.upload(f.mesh),
        place: f.place,
        speed: f.speed,
      })),
      crew: (() => {
        const m = crewMeshes(parts.crewStyle);
        return {
          torso: this.r.upload(m.torso),
          leg: this.r.upload(m.leg),
          arm: this.r.upload(m.arm),
        };
      })(),
    };
    this.afterShip();
  }

  private afterShip() {
    // Le quai dépend des dimensions du navire.
    this.clearCities();
  }

  private disposeShip() {
    if (!this.ship) return;
    this.r.release(this.ship.body);
    this.r.release(this.ship.glows);
    this.r.release(this.ship.dust);
    this.ship.fans.forEach((f) => this.r.release(f.mesh));
    this.r.release(this.ship.crew.torso);
    this.r.release(this.ship.crew.leg);
    this.r.release(this.ship.crew.arm);
    this.ship = null;
  }

  setSize(w: number, h: number) {
    this.r.setSize(w, h);
  }

  /** Allège les effets coûteux avant de baisser la définition. */
  setLoad(level: number) {
    this.r.setLoad?.(level);
  }

  render(time: number, view: ViewOptions = {}) {
    if (!this.ship) return;
    const { parts } = this.ship;
    const dt =
      this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.lastT));
    this.lastT = time;
    // --- Voyage en cours : distance parcourue, décor qui défile, lumière ---
    let dock = this.place.city ? 1 : 0;
    let light = this.light;
    const fd = this.fade;
    if (fd) {
      const t = (Date.now() - fd.start) / FADE_MS;
      if (t >= 0.5 && !fd.swapped) {
        fd.swapped = true;
        this.swapMood(fd.to);
      }
      const target = this.place.void
        ? voidLighting(fd.to)
        : biomeLighting(lighting(this.desert, fd.to), this.biome);
      light = lerpLighting(fd.from, target, ease(t));
      if (t >= 1) this.fade = null;
    }
    const scenery: DrawItem[] = [];
    let calm = 0;
    let calmX = 0;
    const j = this.journey;
    let finished = false;
    let biome = this.biome;
    let storm = 0;
    let stormColor: Vec3 = [0.8, 0.62, 0.42];
    let cityDraw: { rt: CityRt; x: number; moored: boolean } | null = null;
    // Pendant le voyage, la caméra passe derrière le navire pour regarder
    // devant lui : on voit le paysage arriver et la ville grandir à l'horizon.
    let chase = 0;
    let cine: { shot: Shot; weight: number } | null = null;
    let jp = 0;
    let inVoid = false;
    let portal = 0;
    let portalAxis = 0;
    let portalAt: { x: number; open: number } | null = null;
    if (j) {
      const p = Math.min(1, Math.max(0, (Date.now() - j.start) / j.duration));
      jp = p;
      const f = p * SAMPLES;
      const i0 = Math.min(SAMPLES - 1, Math.floor(f));
      const dist = j.table[i0] + (j.table[i0 + 1] - j.table[i0]) * (f - i0);
      this.scrollPos = j.base + dist;
      const fc = j.from.place.city;
      const tc = j.to.place.city;
      dock = (fc ? 1 - smooth(0, 0.07, p) : 0) + (tc ? smooth(0.9, 1, p) : 0);
      // Changement de zone au cœur de la tempête : avant, le décor de départ ;
      // après, celui d'arrivée. Rien ne disparaît à découvert.
      const after = p >= 0.5;
      biome = after ? j.toBiome : j.fromBiome;
      const cityX = after ? j.total - dist : -dist;
      const c = after ? tc : fc;
      if (c) {
        const rt = this.cityOf(c);
        if (rt && Math.abs(cityX) < 2400)
          cityDraw = { rt, x: cityX, moored: !after && p < 0.012 };
        calm = 1;
        calmX = cityX;
      }
      const viaPortal = !!(j.from.place.void || j.to.place.void);
      inVoid = !!(after ? j.to.place.void : j.from.place.void);
      if (!inVoid)
        scenery.push({
          mesh: after ? j.propsB : j.propsA,
          model: translation(-dist, 0, 0),
          drape: true,
        });
      if (viaPortal) {
        // Portail d'Aether : il s'ouvre devant le navire, qui s'y engouffre ;
        // un tunnel de lumière cache le changement de lieu, puis le navire
        // ressort par un second portail qui se referme derrière lui.
        const cross = (q: number) => {
          const fq = q * SAMPLES;
          const k0 = Math.min(SAMPLES - 1, Math.floor(fq));
          return j.table[k0] + (j.table[k0 + 1] - j.table[k0]) * (fq - k0);
        };
        if (!after)
          portalAt = {
            x: cross(0.47) - dist,
            open: smooth(0.2, 0.32, p),
          };
        else
          portalAt = {
            x: cross(0.5) - dist - 8,
            open: 1 - smooth(0.56, 0.72, p),
          };
        portal = smooth(0.41, 0.48, p) * (1 - smooth(0.52, 0.6, p));
        // Caméra dans l'axe, derrière le navire : on voit le portail s'ouvrir
        // au loin, grandir, puis on le franchit avec lui.
        portalAxis = smooth(0.14, 0.26, p) * (1 - smooth(0.62, 0.76, p));
        light = after ? j.toLight : j.fromLight;
      } else {
        storm = smooth(0.36, 0.47, p) * (1 - smooth(0.53, 0.66, p));
        light = veil(after ? j.toLight : j.fromLight, storm * 0.7);
      }
      stormColor = stormTint(after ? j.toLight : j.fromLight);
      finished = p >= 1;
      chase = smooth(0.04, 0.2, p) * (1 - smooth(0.86, 0.99, p));
      cine = shotAt(p, j.start / 997);
    } else {
      inVoid = !!this.place.void;
      // Dans la brume, le navire dérive lentement.
      if (!this.place.city) this.scrollPos += CRUISE * dt * (inVoid ? 0.35 : 1);
      const c = this.place.city ? this.cityOf(this.place.city) : null;
      if (c) {
        cityDraw = { rt: c, x: 0, moored: true };
        calm = 1;
      }
    }
    // Hangar de l'équipage : portes qui s'ouvrent devant le navire et se
    // referment derrière lui ; à l'intérieur, la caméra reste dans la nef et
    // la lumière devient celle des verrières (ou des lampes).
    let inHangar = 0;
    // Passage d'une porte : la caméra se place dans l'axe, derrière le navire,
    // pour franchir l'ouverture avec lui.
    let axis = portalAxis;
    let enter = 0;
    let hangarBox: { cx: number; dims: HangarDims } | null = null;
    let interior = false;
    this.doors = [0, 0];
    const hgc = cityDraw?.rt.hangar;
    if (cityDraw && hgc) {
      const hd = hgc.dims;
      const L = parts.length;
      const sx = -cityDraw.x; // position du navire dans le repère de la ville
      // Recul de la caméra dans l'axe (elle suit le navire à cette distance).
      const halfH0 = (parts.top - parts.bottom) / 2 + 1;
      const camBack =
        (halfH0 / Math.tan((view.fov ?? 0.36) / 2)) *
        (view.margin ?? 1.05) *
        1.08 *
        0.6;
      const out = Math.max(L / 2 + 10, camBack + 15);
      const arriving = !!j && Date.now() - j.start >= j.duration * 0.5;
      if (j && arriving) {
        this.doors[0] =
          smooth(-hd.hx - 300, -hd.hx - 150, sx) *
          (1 - smooth(-hd.hx + 50, -hd.hx + 60, sx));
        const rel = smooth(0.9, 0.995, jp);
        axis = smooth(-hd.hx - 260, -hd.hx - 130, sx) * (1 - rel);
        // La caméra se rapproche en passant la porte : elle entre juste
        // derrière la poupe, avant que les portes ne se referment.
        enter = smooth(-hd.hx - 60, -hd.hx + 42, sx) * (1 - rel);
      } else if (j) {
        this.doors[1] =
          smooth(0.5, 16, sx) * (1 - smooth(hd.hx + out, hd.hx + out + 40, sx));
        axis =
          smooth(1, 20, sx) *
          (1 - smooth(hd.hx + out + 10, hd.hx + out + 130, sx));
      }
      inHangar =
        smooth(-hd.hx - 30, -hd.hx + 20, sx) *
        (1 - smooth(hd.hx - 20, hd.hx + 30, sx));
      hangarBox = { cx: cityDraw.x, dims: hd };
      if (inHangar > 0)
        light = lerpLighting(light, hangarLighting(light), inHangar);
      interior =
        inHangar > 0.999 && this.doors[0] < 0.001 && this.doors[1] < 0.001;
    }
    const shipX = 0;
    const hover = HOVER + (HOVER_DOCK - HOVER) * dock;
    const calmBob = 1 - dock * 0.8;
    const bob = Math.sin(time * 1.2) * 0.35 * calmBob;
    const roll = Math.sin(time * 0.9) * 0.012 * calmBob;
    const pitchA = Math.sin(time * 0.7 + 1) * 0.008 * calmBob;
    const shipM = chain(
      translation(shipX, hover + bob, 0),
      rotationX(roll),
      rotationZ(pitchA)
    );
    const items: DrawItem[] = [];
    const glows: DrawItem[] = [];
    // Rendu réaliste prêt : navire, équipage, sol et paysages sont natifs.
    const nat = this.r.native?.ready ? this.r.native : null;
    this.nat = nat;
    this.npc = [];
    this.crowd = [];
    if (view.ground !== false && inVoid) {
      // Mer de brume d'Aether : îlots qui dérivent et défilent, poussières.
      const v = this.voidOf();
      items.push({ mesh: v.sea, model: identity() });
      items.push({ mesh: v.far, model: identity() });
      const LOOP = 1300;
      for (const isl of v.islands) {
        let x = isl.x - this.scrollPos;
        x = ((((x + LOOP / 2) % LOOP) + LOOP) % LOOP) - LOOP / 2;
        items.push({
          mesh: isl.mesh,
          model: translation(
            x - isl.x,
            Math.sin(time * 0.25 + isl.phase) * isl.amp,
            0
          ),
          shadow: Math.abs(x) < 200,
        });
      }
      items.push({
        mesh: v.motes,
        model: chain(
          translation(Math.sin(time * 0.1) * 6, Math.sin(time * 0.17) * 3, 0),
          rotationY(time * 0.01)
        ),
      });
    }
    if (portalAt) {
      const v = this.voidOf();
      const k = Math.max(0.001, portalAt.open);
      const yc = hover + (parts.top + parts.bottom) / 2;
      const base = chain(translation(portalAt.x, yc, 0), scaling(1, k, k));
      items.push({ mesh: v.frame, model: base });
      items.push({ mesh: v.rings, model: chain(base, rotationX(time * 0.8)) });
      items.push({
        mesh: v.rings,
        model: chain(base, rotationX(-time * 0.5), scaling(1, 0.7, 0.7)),
      });
    }
    if (view.ground !== false && !inVoid) {
      // Le sable et les lointains restent ceux du moteur maison (dunes,
      // rides et grain) ; en rendu réaliste, les curiosités sont natives.
      const bm = interior ? null : this.biomeMeshes(biome);
      if (bm) {
        items.push({ mesh: this.env.terrain, model: identity() });
        items.push({ mesh: bm.far, model: identity() });
        if (!nat) items.push(...scenery);
      }
      if (cityDraw)
        this.drawCity(
          cityDraw.rt,
          cityDraw.x,
          time,
          items,
          glows,
          cityDraw.moored,
          interior
        );
      if (bm && !nat && (!calm || Math.abs(calmX) > 900)) {
        // Les rochers défilent avec le sable (bande bouclée, dessinée deux fois).
        const off = -(this.scrollPos % ROCK_LOOP);
        // Curiosités du paysage, posées sur les dunes, qui défilent en boucle.
        items.push({
          mesh: bm.band,
          model: translation(off, 0, 0),
          drape: true,
        });
        items.push({
          mesh: bm.band,
          model: translation(off + ROCK_LOOP, 0, 0),
          drape: true,
        });
      }
    }
    if (!nat) {
      items.push({ mesh: this.ship.body, model: shipM, shadow: true });
      for (const f of this.ship.fans)
        items.push({
          mesh: f.mesh,
          model: chain(shipM, f.place, rotationY(time * f.speed)),
          shadow: false,
        });
      glows.push({ mesh: this.ship.glows, model: shipM });
      for (const c of parts.crew)
        poseCrew(items, this.ship.crew, shipM, c, time);
    }

    const aspect = this.r.width / this.r.height;
    const fov = view.fov ?? 0.36;
    // Plans du voyage (ou vue du joueur), rejoints par une caméra amortie.
    const userYaw = view.yaw ?? 0.55;
    const userEl = view.elevation ?? 0.1;
    const w = cine ? cine.weight : 0;
    const sh = cine?.shot;
    const want = [
      sh ? userYaw + (sh.yaw + (userYaw - 0.55) - userYaw) * w : userYaw,
      sh
        ? userEl + (Math.max(0.03, sh.el + (userEl - 0.1)) - userEl) * w
        : userEl,
      sh ? 1 + (sh.mul - 1) * w : 1,
      sh
        ? (view.shift ?? 0) + (sh.shift - (view.shift ?? 0)) * w
        : (view.shift ?? 0),
    ];
    // Hors voyage la vue suit le joueur sans retard (il l'amortit déjà).
    const cam = this.camRig.follow(want, dt, j ? 1.3 : 0.12, dt === 0);
    void chase;
    const yawFree = cam[0];
    const yaw = yawFree + (-1.49 - yawFree) * axis;
    const dirH: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    const cy = hover + (parts.top + parts.bottom) / 2 + 1;
    const halfH = (parts.top - parts.bottom) / 2 + 1;
    const halfW = parts.radius * (0.55 + 0.45 * Math.abs(Math.cos(yaw)));
    const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const m = (view.margin ?? 1.05) * cam[2] * (1 - 0.4 * axis);
    const dist0 =
      Math.max(halfW / Math.tan(fovX / 2), halfH / Math.tan(fov / 2)) * m;
    const dist = dist0 + (parts.length / 2 + 16 - dist0) * enter;
    const right: Vec3 = normalize([dirH[2], 0, -dirH[0]]);
    const shift = cam[3] * (1 - axis) * dist * Math.tan(fovX / 2);
    const target: Vec3 = [
      right[0] * -shift,
      cy + (view.lift ?? 0) * halfH,
      right[2] * -shift,
    ];
    const eyeY =
      view.eyeHeight ??
      target[1] +
        dist * Math.tan(cam[1] * (1 - axis) + (view.elevation ?? 0.1) * axis);
    let eye: Vec3 = [
      target[0] + dirH[0] * dist,
      eyeY,
      target[2] + dirH[2] * dist,
    ];
    let clampT = 1;
    if (hangarBox && inHangar > 0) {
      // La caméra recule jusqu'aux murs et sous la voûte, pas au-delà.
      const bx = hangarBox;
      const room = (u: number) =>
        hangarRoom(
          bx.dims,
          target[0] + (eye[0] - target[0]) * u - bx.cx,
          target[1] + (eye[1] - target[1]) * u,
          target[2] + (eye[2] - target[2]) * u,
          this.doors
        );
      // Premier obstacle le long de la visée (mur, voûte, pignon hors des
      // portes), affiné par dichotomie.
      let t = 1;
      const N = 48;
      for (let k = 1; k <= N; k++) {
        if (room(k / N)) continue;
        let lo = (k - 1) / N;
        let hi = k / N;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (room(mid)) lo = mid;
          else hi = mid;
        }
        t = lo * 0.98;
        break;
      }
      t = Math.max(0, t);
      clampT = t;
      const inside: Vec3 = [
        target[0] + (eye[0] - target[0]) * t,
        target[1] + (eye[1] - target[1]) * t,
        target[2] + (eye[2] - target[2]) * t,
      ];
      eye = [
        eye[0] + (inside[0] - eye[0]) * inHangar,
        eye[1] + (inside[1] - eye[1]) * inHangar,
        eye[2] + (inside[2] - eye[2]) * inHangar,
      ];
    }
    const pods = parts.nozzles.map((n) => ({
      pos: transformPoint(shipM, n.pos),
      power: (this.mood === 'night' ? 4.5 : 3.5) * n.size * (1 - dock * 0.6),
    }));
    // Dans la nef, champ plus large : on voit le hangar autour du navire.
    // Arrêtée par un mur, la caméra élargit son champ au lieu de reculer.
    const fovR = Math.min(
      1.15,
      fov * (1 + 0.42 * inHangar) * (1 + 0.9 * (1 - clampT) * inHangar)
    );
    nat?.frame({
      time,
      dt,
      shipM,
      dock,
      scroll: this.scrollPos,
      calm,
      calmX,
      biome: biome.id,
      duneAmp: biome.dune,
      inVoid,
      ground: view.ground !== false && !interior,
      features: !calm || Math.abs(calmX) > 900,
      night: light.night > 0.5,
      light,
      npc: this.npc,
      crowd: this.crowd,
      crew: parts.crew,
    });
    this.r.render(items, glows, { eye, target, fov: fovR }, light, {
      time,
      scroll: this.scrollPos,
      calm,
      calmX,
      storm,
      portal,
      stormColor,
      duneAmp: biome.dune,
      shadowCenter: [shipX * 0.5, hover, 0],
      shadowRadius:
        parts.radius +
        14 +
        Math.abs(shipX) * 0.5 +
        (hgc ? (hgc.dims.hx - parts.radius) * inHangar : 0),
      pods: nat ? [] : pods,
      dust:
        nat || view.ground === false || dock > 0.5 || inVoid
          ? null
          : this.ship.dust,
    });
    // Arrivée : le décor de destination devient le décor courant.
    if (j && finished) {
      this.endJourney();
      this.applyEnv(j.to.desert, this.mood, j.to.place, j.to.biome);
    }
  }

  dispose() {
    this.disposeShip();
    this.endJourney();
    this.clearCities();
    for (const f of this.folk) {
      this.r.release(f.torso);
      this.r.release(f.leg);
      this.r.release(f.arm);
    }
    this.r.release(this.env.terrain);
    this.clearBiomes();
    this.r.dispose();
  }
}

/** Couleur de la tempête (espace d'affichage) d'après le sable du désert. */
function stormTint(l: Lighting): Vec3 {
  const g = (v: number) => Math.pow(Math.min(1, v), 1 / 2.2);
  return [
    g(l.sandB[0] * 1.5 + l.horizon[0] * 0.5),
    g(l.sandB[1] * 1.5 + l.horizon[1] * 0.5),
    g(l.sandB[2] * 1.5 + l.horizon[2] * 0.5),
  ];
}

/** Tenues des habitants des villes. */
const FOLK = [
  { body: '#7a3a2a', accent: '#d8b45a' },
  { body: '#2f4f5a', accent: '#c9a227' },
  { body: '#d8ccb0', accent: '#8a2f24' },
];

/** Navire de passage : allure et couleurs tirées d'après la ville et le poste. */
function npcBuild(seed: string, k: number): Build {
  let h = k * 7919;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pick = <T>(a: T[]) =>
    a[(h = (h * 1103515245 + 12345) >>> 0) % a.length];
  const b = defaultBuild();
  b.allure = pick([
    'escorteur',
    'survivor',
    'protector',
    'bombardier',
    'fleche',
    'forteresse',
    'enforceur',
    'gouverneur',
  ] as const);
  b.mats = {
    ...b.mats,
    type: pick(['double', 'triple', 'pique'] as const),
    sailColor: pick(['#e8dcc0', '#c9b48a', '#d8c8a8', '#b8a080', '#e0d0b8']),
    flagColor: pick(['#1f4f5a', '#2f5a2f', '#5a2f5a', '#c9a227', '#3a3a6a']),
  };
  b.coque = {
    ...b.coque,
    material: pick(['chene', 'beaulou', 'boisfer', 'cuivre'] as const),
  };
  b.poupe = {
    ...b.poupe,
    material: pick(['chene', 'sombrefer', 'beaulou'] as const),
  };
  b.deco = {
    bands: [pick(['#1f4f5a', '#8a2f24', '#2f5a2f', '#c9a227'])],
    trim: '#c9a227',
  };
  return b;
}

/** Lumière d'une scène : désert (et son paysage) ou mer de brume. */
function sceneLight(s: Scene, mood: Mood): Lighting {
  return s.place.void
    ? voidLighting(mood)
    : biomeLighting(lighting(s.desert, mood), biomeOf(s.biome ?? '', s.desert));
}

const scKey = (s: Scene) =>
  `${s.desert}:${s.biome ?? ''}:${s.place.city?.id ?? ''}${s.place.city?.hangar ? ':h' : ''}${s.place.void ? ':void' : ''}`;

/** Nuages de sable sous les tuyères qui soufflent vers le bas. */
function dustMesh(parts: ShipParts): import('./geometry').MeshData {
  const b = new MeshBuilder();
  let seed = 1;
  const rnd = () => {
    const x = Math.sin(seed++ * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  for (const n of parts.nozzles) {
    if (n.dir[1] > -0.5) continue;
    for (let k = 0; k < 14; k++) {
      const c: [number, number, number] = [
        n.pos[0] + (rnd() - 0.5) * 3,
        0,
        n.pos[2] + (rnd() - 0.5) * 3,
      ];
      const ph: [number, number, number] = [
        k / 14 + rnd() * 0.05,
        rnd(),
        rnd() - 0.5,
      ];
      const mat = {
        p: P.PLAIN,
        color: [0.7 + rnd() * 0.3, 0, 0] as [number, number, number],
        metal: 0,
        rough: 1,
        emit: n.size,
      };
      const ids = (
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const
      ).map(([u, v]) => b.rawVertex(c, ph, [u, v], mat));
      b.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  // Poussières en suspension autour du navire.
  for (let k = 0; k < 160; k++) {
    const pos: [number, number, number] = [
      (rnd() - 0.5) * 90,
      HOVER - 6 + rnd() * 34,
      (rnd() - 0.3) * 60,
    ];
    const ph: [number, number, number] = [rnd(), rnd(), rnd()];
    const mat = {
      p: P.PLAIN,
      color: [0.25 + rnd() * 0.5, 0, 1] as [number, number, number],
      metal: 0,
      rough: 1,
      emit: 1,
    };
    const ids = (
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const
    ).map(([u, v]) => b.rawVertex(pos, ph, [u, v], mat));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  for (const st of parts.stacks) {
    for (let k = 0; k < 16; k++) {
      const ph: [number, number, number] = [
        k / 16 + rnd() * 0.04,
        rnd(),
        rnd() - 0.5,
      ];
      const mat = {
        p: P.PLAIN,
        color: [0.6 + rnd() * 0.4, 1, 0] as [number, number, number],
        metal: 0,
        rough: 1,
        emit: 1,
      };
      const ids = (
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const
      ).map(([u, v]) =>
        b.rawVertex([st[0], st[1] + HOVER, st[2]], ph, [u, v], mat)
      );
      b.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  return b.build();
}

/** Pose d'un matelot à l'instant t : position, orientation et angles des membres. */
export interface CrewPose {
  pos: Vec3;
  yaw: number;
  lean: number;
  bob: number;
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  crouch: number;
}

/** Pose d'un matelot (calcul seul, partagé avec le rendu réaliste). */
export function crewPose(c: CrewMember, time: number): CrewPose {
  const t = time + c.seed * 7.31;
  let pos: Vec3 = c.pos;
  let yaw = c.yaw;
  let lean = 0;
  let bob = 0;
  let legL = 0;
  let legR = 0;
  let armL = 0.08;
  let armR = 0.08;
  let crouch = 0;
  const gait = (dist: number, amp = 1) => {
    const ph = dist * ((Math.PI * 2) / 1.5);
    legL = Math.sin(ph) * 0.45 * amp;
    legR = -legL;
    armL = -Math.sin(ph) * 0.35 * amp + 0.08;
    armR = Math.sin(ph) * 0.35 * amp + 0.08;
    bob = Math.abs(Math.cos(ph)) * 0.05 * amp;
  };
  switch (c.role) {
    case 'walk': {
      // Va-et-vient avec une courte pause à chaque bout.
      const to = c.to ?? c.pos;
      const len = Math.max(1, Math.hypot(to[0] - pos[0], to[2] - pos[2]));
      const speed = 1.1 + (c.seed % 3) * 0.15;
      const leg = len / speed;
      const cyc = (t % (2 * leg + 3)) - 0;
      let u: number;
      let dir: number;
      if (cyc < leg) {
        u = cyc / leg;
        dir = 1;
      } else if (cyc < leg + 1.5) {
        u = 1;
        dir = 0;
      } else if (cyc < 2 * leg + 1.5) {
        u = 1 - (cyc - leg - 1.5) / leg;
        dir = -1;
      } else {
        u = 0;
        dir = 0;
      }
      pos = [
        pos[0] + (to[0] - pos[0]) * u,
        pos[1] + (to[1] - pos[1]) * u,
        pos[2] + (to[2] - pos[2]) * u,
      ];
      const heading = Math.atan2(-(to[2] - c.pos[2]), to[0] - c.pos[0]);
      if (dir !== 0) {
        yaw = dir > 0 ? heading : heading + Math.PI;
        gait(u * len);
      } else {
        yaw =
          (cyc < leg + 1.5 ? heading : heading + Math.PI) + Math.sin(t) * 0.3;
      }
      break;
    }
    case 'helm':
      lean = 0.05;
      armL = 1.25 + Math.sin(t * 0.6) * 0.18;
      armR = 1.25 - Math.sin(t * 0.6) * 0.18;
      yaw = Math.sin(t * 0.25) * 0.06;
      break;
    case 'capstan': {
      // Pousse une barre du cabestan en tournant autour.
      const r = 1.45;
      const a = t * 0.28;
      pos = [c.pos[0] + Math.cos(a) * r, c.pos[1], c.pos[2] - Math.sin(a) * r];
      yaw = a + Math.PI / 2;
      gait(a * r, 0.7);
      lean = 0.35;
      armL = armR = 1.45;
      break;
    }
    case 'haul': {
      // Tire sur une drisse, main sur main.
      const ph = t * 2.2;
      armL = 2.5 + Math.sin(ph) * 0.45;
      armR = 2.5 - Math.sin(ph) * 0.45;
      lean = -0.15 + Math.sin(ph * 2) * 0.05;
      legL = 0.25;
      legR = -0.15;
      break;
    }
    case 'scrub': {
      // Brique le pont, à genoux, en se déplaçant lentement.
      crouch = 0.45;
      lean = 0.85;
      armR = 1.1 + Math.sin(t * 4.5) * 0.45;
      armL = 0.7;
      legL = legR = -1.3;
      pos = [pos[0] + Math.sin(t * 0.15) * 1.5, pos[1], pos[2]];
      break;
    }
    case 'look': {
      // Vigie : balaie l'horizon, une main en visière de temps en temps.
      yaw = c.yaw + Math.sin(t * 0.3) * 0.9;
      if (Math.sin(t * 0.21) > 0.3) armR = 2.6;
      break;
    }
  }
  return { pos, yaw, lean, bob, legL, legR, armL, armR, crouch };
}

function poseCrew(
  items: DrawItem[],
  mesh: { torso: GpuMesh; leg: GpuMesh; arm: GpuMesh },
  shipM: Mat4,
  c: CrewMember,
  time: number
) {
  const { pos, yaw, lean, bob, legL, legR, armL, armR, crouch } = crewPose(
    c,
    time
  );
  // Un peu plus grands que nature pour rester lisibles à l'échelle du navire.
  const P0 = chain(
    shipM,
    translation(pos[0], pos[1], pos[2]),
    rotationY(yaw),
    scaling(CREW_SCALE, CREW_SCALE, CREW_SCALE)
  );
  const hip = chain(P0, translation(0, 0.9 - crouch + bob, 0));
  const torso = chain(hip, rotationZ(-lean));
  items.push({ mesh: mesh.torso, model: torso, shadow: true });
  for (const [side, ang] of [
    [1, legR],
    [-1, legL],
  ] as const)
    items.push({
      mesh: mesh.leg,
      model: chain(hip, translation(0, 0, side * 0.11), rotationZ(ang)),
      shadow: true,
    });
  for (const [side, ang] of [
    [1, armR],
    [-1, armL],
  ] as const)
    items.push({
      mesh: mesh.arm,
      model: chain(
        torso,
        translation(0, 0.56, side * 0.29),
        rotationX(side * -0.08),
        rotationZ(ang)
      ),
      shadow: true,
    });
}
