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

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.r = new Renderer(canvas, opts);
    this.env = {
      terrain: this.r.upload(terrainMesh()),
      mesas: this.r.upload(mesasMesh()),
      rocks: this.r.upload(rocksMesh()),
    };
    this.light = lighting('mahibori', 'dusk');
  }

  setEnvironment(desert: DesertId, mood: Mood) {
    this.light = lighting(desert, mood);
    this.mood = mood;
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
    const bob = Math.sin(time * 1.2) * 0.35;
    const roll = Math.sin(time * 0.9) * 0.012;
    const pitchA = Math.sin(time * 0.7 + 1) * 0.008;
    const shipM = chain(
      translation(0, HOVER + bob, 0),
      rotationX(roll),
      rotationZ(pitchA)
    );
    const items: DrawItem[] = [];
    const glows: DrawItem[] = [];
    if (view.ground !== false) {
      items.push({ mesh: this.env.terrain, model: identity() });
      items.push({ mesh: this.env.mesas, model: identity() });
      // Les rochers défilent avec le sable (bande bouclée, dessinée deux fois).
      const off = -((time * 9) % ROCK_LOOP);
      items.push({ mesh: this.env.rocks, model: translation(off, 0, 0) });
      items.push({
        mesh: this.env.rocks,
        model: translation(off + ROCK_LOOP, 0, 0),
      });
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
    const yaw = view.yaw ?? 0.55;
    const dirH: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    const cy = HOVER + (parts.top + parts.bottom) / 2 + 1;
    const halfH = (parts.top - parts.bottom) / 2 + 1;
    const halfW = parts.radius * (0.55 + 0.45 * Math.abs(Math.cos(yaw)));
    const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const m = view.margin ?? 1.05;
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
      view.eyeHeight ?? target[1] + dist * Math.tan(view.elevation ?? 0.1);
    const eye: Vec3 = [
      target[0] + dirH[0] * dist,
      eyeY,
      target[2] + dirH[2] * dist,
    ];
    const pods = parts.nozzles.map((n) => ({
      pos: transformPoint(shipM, n.pos),
      power: (this.mood === 'night' ? 4.5 : 3.5) * n.size,
    }));
    this.r.render(items, glows, { eye, target, fov }, this.light, {
      time,
      scroll: time * 9,
      shadowCenter: [0, HOVER, 0],
      shadowRadius: parts.radius + 14,
      pods,
      dust: view.ground === false ? null : this.ship.dust,
    });
  }

  dispose() {
    this.disposeShip();
    this.r.release(this.env.terrain);
    this.r.release(this.env.mesas);
    this.r.release(this.env.rocks);
    this.r.dispose();
  }
}

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
