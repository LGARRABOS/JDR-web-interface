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
  type GpuMesh,
  type Lighting,
} from './renderer';
import { MeshBuilder, P } from './geometry';
import { BERTHS, cityMesh, lerpLighting, veil } from './city';
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
  ships: {
    body: GpuMesh;
    glows: GpuMesh;
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
  readonly r: Renderer;
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
  /** Habillages des habitants (trois tenues). */
  private folk: { torso: GpuMesh; leg: GpuMesh; arm: GpuMesh }[] = [];
  private journey: Journey | null = null;
  private scrollPos = 0;
  private lastT = -1;

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.r = new Renderer(canvas, opts);
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
      fromLight: biomeLighting(
        lighting(from.desert, mood),
        biomeOf(from.biome ?? '', from.desert)
      ),
      toLight: biomeLighting(
        lighting(to.desert, mood),
        biomeOf(to.biome ?? '', to.desert)
      ),
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
    this.light = biomeLighting(lighting(desert, mood), this.biome);
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

  private clearBiomes() {
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
        keel: HOVER_DOCK + this.ship.parts.bottom,
        hangar: c.hangar,
      });
      // Autres navires du port, chacun avec sa silhouette et ses couleurs.
      const ships = BERTHS.map((q, k) => {
        const parts = buildShip(npcBuild(c.id, k), { crew: 0, night });
        return {
          body: this.r.upload(parts.body),
          glows: this.r.upload(parts.glows),
          x: q.x,
          z: q.z,
          cycle: q.cycle,
        };
      });
      m = {
        city: this.r.upload(d.city),
        moor: this.r.upload(d.moor),
        crowd: d.crowd,
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
      for (const sh of m.ships) {
        this.r.release(sh.body);
        this.r.release(sh.glows);
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
    moored: boolean
  ) {
    const base = translation(cx, 0, 0);
    items.push({ mesh: c.city, model: base, shadow: Math.abs(cx) < 200 });
    if (moored) items.push({ mesh: c.moor, model: base });
    if (Math.abs(cx) > 900) return;
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
      items.push({ mesh: sh.body, model: mdl });
      glows.push({ mesh: sh.glows, model: mdl });
    }
    c.crowd.forEach((p, k) =>
      poseCrew(items, this.folk[k % this.folk.length], base, p, time)
    );
  }

  setShip(build: Build, opts: StageOptions = {}) {
    this.lastShip = { build, opts };
    this.disposeShip();
    const parts = buildShip(build, { ...opts, night: this.mood === 'night' });
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
      const target = biomeLighting(lighting(this.desert, fd.to), this.biome);
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
    if (j) {
      const p = Math.min(1, Math.max(0, (Date.now() - j.start) / j.duration));
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
      scenery.push({
        mesh: after ? j.propsB : j.propsA,
        model: translation(-dist, 0, 0),
        drape: true,
      });
      storm = smooth(0.36, 0.47, p) * (1 - smooth(0.53, 0.66, p));
      light = veil(after ? j.toLight : j.fromLight, storm * 0.7);
      stormColor = stormTint(after ? j.toLight : j.fromLight);
      finished = p >= 1;
      chase = smooth(0.04, 0.2, p) * (1 - smooth(0.86, 0.99, p));
    } else {
      if (!this.place.city) this.scrollPos += CRUISE * dt;
      const c = this.place.city ? this.cityOf(this.place.city) : null;
      if (c) {
        cityDraw = { rt: c, x: 0, moored: true };
        calm = 1;
      }
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
    if (view.ground !== false) {
      items.push({ mesh: this.env.terrain, model: identity() });
      const bm = this.biomeMeshes(biome);
      items.push({ mesh: bm.far, model: identity() });
      items.push(...scenery);
      if (cityDraw)
        this.drawCity(
          cityDraw.rt,
          cityDraw.x,
          time,
          items,
          glows,
          cityDraw.moored
        );
      if (!calm || Math.abs(calmX) > 900) {
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
    items.push({ mesh: this.ship.body, model: shipM, shadow: true });
    for (const f of this.ship.fans)
      items.push({
        mesh: f.mesh,
        model: chain(shipM, f.place, rotationY(time * f.speed)),
        shadow: false,
      });
    glows.push({ mesh: this.ship.glows, model: shipM });
    for (const c of parts.crew) poseCrew(items, this.ship.crew, shipM, c, time);

    const aspect = this.r.width / this.r.height;
    const fov = view.fov ?? 0.36;
    const yaw = (view.yaw ?? 0.55) - 1.3 * chase;
    const dirH: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    const cy = hover + (parts.top + parts.bottom) / 2 + 1;
    const halfH = (parts.top - parts.bottom) / 2 + 1;
    const halfW = parts.radius * (0.55 + 0.45 * Math.abs(Math.cos(yaw)));
    const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const m = (view.margin ?? 1.05) * (1 + 0.08 * chase);
    const dist =
      Math.max(halfW / Math.tan(fovX / 2), halfH / Math.tan(fov / 2)) * m;
    const right: Vec3 = normalize([dirH[2], 0, -dirH[0]]);
    const shift = (view.shift ?? 0) * dist * Math.tan(fovX / 2);
    const target: Vec3 = [
      right[0] * -shift,
      cy + (view.lift ?? 0) * halfH,
      right[2] * -shift,
    ];
    const eyeY =
      view.eyeHeight ??
      target[1] + dist * Math.tan((view.elevation ?? 0.1) + 0.04 * chase);
    const eye: Vec3 = [
      target[0] + dirH[0] * dist,
      eyeY,
      target[2] + dirH[2] * dist,
    ];
    const pods = parts.nozzles.map((n) => ({
      pos: transformPoint(shipM, n.pos),
      power: (this.mood === 'night' ? 4.5 : 3.5) * n.size * (1 - dock * 0.6),
    }));
    this.r.render(items, glows, { eye, target, fov }, light, {
      time,
      scroll: this.scrollPos,
      calm,
      calmX,
      storm,
      stormColor,
      duneAmp: biome.dune,
      shadowCenter: [shipX * 0.5, hover, 0],
      shadowRadius: parts.radius + 14 + Math.abs(shipX) * 0.5,
      pods,
      dust: view.ground === false || dock > 0.5 ? null : this.ship.dust,
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

const scKey = (s: Scene) =>
  `${s.desert}:${s.biome ?? ''}:${s.place.city?.id ?? ''}${s.place.city?.hangar ? ':h' : ''}`;

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
function poseCrew(
  items: DrawItem[],
  mesh: { torso: GpuMesh; leg: GpuMesh; arm: GpuMesh },
  shipM: Mat4,
  c: CrewMember,
  time: number
) {
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
