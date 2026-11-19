import type { Build } from '../arpenteur/types';
import {
  lighting,
  mesasMesh,
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
import { buildShip, type ShipParts } from './shipModel';
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

export class Stage {
  readonly r: Renderer;
  private env: { terrain: GpuMesh; mesas: GpuMesh; rocks: GpuMesh };
  private ship: {
    parts: ShipParts;
    body: GpuMesh;
    glows: GpuMesh;
    dust: GpuMesh;
    fans: { mesh: GpuMesh; place: Mat4; speed: number }[];
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
    };
  }

  private disposeShip() {
    if (!this.ship) return;
    this.r.release(this.ship.body);
    this.r.release(this.ship.glows);
    this.r.release(this.ship.dust);
    this.ship.fans.forEach((f) => this.r.release(f.mesh));
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
      items.push({
        mesh: this.env.rocks,
        model: translation(-(((time * 9) % 400) - 200) * 0, 0, 0),
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
      power: (this.mood === 'night' ? 7 : 6) * n.size,
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
