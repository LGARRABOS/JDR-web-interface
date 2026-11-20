import type { Build } from '../arpenteur/types';
import {
  lighting,
  mesasMesh,
  ROCK_LOOP,
  rocksMesh,
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
import { cityMesh, journeyMesh, lerpLighting, veil } from './city';
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
  city?: { id: string; capital?: boolean };
}

/** Décor d'une position : désert et ville éventuelle. */
export interface Scene {
  desert: DesertId;
  place: Place;
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
  props: GpuMesh;
}

const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
const smooth = (a: number, b: number, x: number) => ease((x - a) / (b - a));
/** Vitesse de pointe pendant un voyage (multiple de la croisière). */
const VMAX = 7;
const SAMPLES = 400;

/** Vitesse (en multiples de la croisière) à la progression p du voyage. */
function journeySpeed(p: number, v0: number, v1: number) {
  if (p < 0.16) return v0 + (VMAX - v0) * ease(p / 0.16);
  if (p > 0.74) return VMAX + (v1 - VMAX) * ease((p - 0.74) / 0.26);
  return VMAX;
}

const CREW_SCALE = 1.4;

export class Stage {
  readonly r: Renderer;
  private env: { terrain: GpuMesh; mesas: GpuMesh; rocks: GpuMesh };
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
  private place: Place = {};
  private cities = new Map<string, { city: GpuMesh; moor: GpuMesh }>();
  private journey: Journey | null = null;
  private scrollPos = 0;
  private lastT = -1;

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.r = new Renderer(canvas, opts);
    this.env = {
      terrain: this.r.upload(terrainMesh()),
      mesas: this.r.upload(mesasMesh()),
      rocks: this.r.upload(rocksMesh()),
    };
    this.light = lighting('mahibori', 'dusk');
  }

  setEnvironment(desert: DesertId, mood: Mood, place: Place = {}) {
    this.endJourney();
    this.applyEnv(desert, mood, place);
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
      this.applyEnv(to.desert, mood, to.place);
      return;
    }
    this.applyEnv(from.desert, mood, from.place);
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
      fromLight: lighting(from.desert, mood),
      toLight: lighting(to.desert, mood),
      table,
      total,
      base: this.scrollPos,
      props: this.r.upload(
        journeyMesh(scKey(from) + scKey(to), total, mood === 'night')
      ),
    };
  }

  get traveling() {
    return !!this.journey;
  }

  private endJourney() {
    if (!this.journey) return;
    this.r.release(this.journey.props);
    this.journey = null;
  }

  private applyEnv(desert: DesertId, mood: Mood, place: Place) {
    if (mood !== this.mood) this.clearCities();
    this.light = lighting(desert, mood);
    this.mood = mood;
    this.place = place;
  }

  /** Maillages d'une ville (construits à la demande, gardés en cache). */
  private cityOf(c: { id: string; capital?: boolean }) {
    let m = this.cities.get(c.id);
    if (!m && this.ship) {
      const d = cityMesh({
        id: c.id,
        capital: c.capital,
        night: this.mood === 'night',
        halfBeam: this.ship.parts.halfBeam,
        length: this.ship.parts.length,
        hover: HOVER_DOCK,
      });
      m = { city: this.r.upload(d.city), moor: this.r.upload(d.moor) };
      this.cities.set(c.id, m);
    }
    return m ?? null;
  }

  private clearCities() {
    for (const m of this.cities.values()) {
      this.r.release(m.city);
      this.r.release(m.moor);
    }
    this.cities.clear();
  }

  setShip(build: Build, opts: StageOptions = {}) {
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
    const scenery: DrawItem[] = [];
    let calm = 0;
    let calmX = 0;
    const j = this.journey;
    let finished = false;
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
      const cities: {
        x: number;
        m: { city: GpuMesh; moor: GpuMesh } | null;
      }[] = [];
      if (fc) cities.push({ x: -dist, m: this.cityOf(fc) });
      if (tc) cities.push({ x: j.total - dist, m: this.cityOf(tc) });
      for (const c of cities) {
        if (!c.m || Math.abs(c.x) > 2400) continue;
        scenery.push({
          mesh: c.m.city,
          model: translation(c.x, 0, 0),
          shadow: Math.abs(c.x) < 200,
        });
      }
      if (fc && p < 0.012) {
        const m = this.cityOf(fc);
        if (m) scenery.push({ mesh: m.moor, model: translation(-dist, 0, 0) });
      }
      const near = cities.reduce<number | null>(
        (a, c) => (a === null || Math.abs(c.x) < Math.abs(a) ? c.x : a),
        null
      );
      if (near !== null) {
        calm = 1;
        calmX = near;
      }
      scenery.push({
        mesh: j.props,
        model: translation(-dist, 0, 0),
        drape: true,
      });
      const v = 0.5 * smooth(0.42, 0.49, p) * (1 - smooth(0.51, 0.58, p));
      light = veil(
        lerpLighting(j.fromLight, j.toLight, smooth(0.36, 0.64, p)),
        v
      );
      finished = p >= 1;
      chase = smooth(0.04, 0.2, p) * (1 - smooth(0.86, 0.99, p));
    } else {
      if (!this.place.city) this.scrollPos += CRUISE * dt;
      const c = this.place.city ? this.cityOf(this.place.city) : null;
      if (c) {
        scenery.push({ mesh: c.city, model: identity(), shadow: true });
        scenery.push({ mesh: c.moor, model: identity() });
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
      items.push({ mesh: this.env.mesas, model: identity() });
      items.push(...scenery);
      if (!calm || Math.abs(calmX) > 900) {
        // Les rochers défilent avec le sable (bande bouclée, dessinée deux fois).
        const off = -(this.scrollPos % ROCK_LOOP);
        items.push({ mesh: this.env.rocks, model: translation(off, 0, 0) });
        items.push({
          mesh: this.env.rocks,
          model: translation(off + ROCK_LOOP, 0, 0),
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
      shadowCenter: [shipX * 0.5, hover, 0],
      shadowRadius: parts.radius + 14 + Math.abs(shipX) * 0.5,
      pods,
      dust: view.ground === false || dock > 0.5 ? null : this.ship.dust,
    });
    // Arrivée : le décor de destination devient le décor courant.
    if (j && finished) {
      this.endJourney();
      this.applyEnv(j.to.desert, this.mood, j.to.place);
    }
  }

  dispose() {
    this.disposeShip();
    this.endJourney();
    this.clearCities();
    this.r.release(this.env.terrain);
    this.r.release(this.env.mesas);
    this.r.release(this.env.rocks);
    this.r.dispose();
  }
}

const scKey = (s: Scene) => `${s.desert}:${s.place.city?.id ?? ''}`;

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
