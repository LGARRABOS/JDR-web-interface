import * as THREE from 'three';
import type { CrewPose } from '../../arpenteur3d/stage';
import type { CrewStyle } from '../../arpenteur3d/shipModel';

// Matelots et habitants : silhouettes arrondies (redingote, tricorne, bottes),
// animées avec les mêmes poses que le moteur maison (barre, vigie, cabestan…).

const lathe = (p: [number, number][], seg = 10) =>
  new THREE.LatheGeometry(
    p.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
    seg
  );

interface Parts {
  torso: THREE.BufferGeometry;
  belt: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  hat: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  boot: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
}

let parts: Parts | null = null;
function geo(): Parts {
  if (parts) return parts;
  const torso = lathe([
    [0.001, -0.05],
    [0.21, -0.05],
    [0.23, 0.12],
    [0.19, 0.38],
    [0.215, 0.6],
    [0.15, 0.7],
    [0.07, 0.74],
    [0.001, 0.75],
  ]);
  torso.scale(1, 1, 0.78);
  const belt = new THREE.TorusGeometry(0.2, 0.025, 4, 12);
  belt.rotateX(Math.PI / 2);
  belt.scale(1, 1, 0.8);
  belt.translate(0, 0.3, 0);
  const head = new THREE.SphereGeometry(0.11, 10, 7);
  head.scale(0.95, 1.1, 0.9);
  head.translate(0.01, 0.87, 0);
  // Tricorne : bord relevé, calotte.
  const hat = lathe(
    [
      [0.001, 0.95],
      [0.19, 0.95],
      [0.2, 0.985],
      [0.1, 0.99],
      [0.095, 1.07],
      [0.001, 1.08],
    ],
    3
  );
  hat.rotateY(Math.PI / 6);
  const leg = lathe([
    [0.08, 0.02],
    [0.075, -0.4],
    [0.058, -0.8],
    [0.062, -0.86],
  ]);
  const boot = new THREE.SphereGeometry(0.07, 8, 5);
  boot.scale(1.6, 0.8, 1);
  boot.translate(0.04, -0.87, 0);
  const arm = lathe([
    [0.06, 0.02],
    [0.055, -0.3],
    [0.042, -0.55],
    [0.046, -0.58],
  ]);
  const hand = new THREE.SphereGeometry(0.045, 6, 4);
  hand.translate(0, -0.62, 0);
  parts = { torso, belt, head, hat, leg, boot, arm, hand };
  return parts;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: string, rough = 0.85) {
  let m = mats.get(hex);
  if (!m)
    mats.set(
      hex,
      (m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough }))
    );
  return m;
}

export class CrewFigure {
  readonly root = new THREE.Group();
  private hip = new THREE.Group();
  private torso = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];

  constructor(style: CrewStyle, patch: (m: THREE.Material) => void) {
    const g = geo();
    const coat = mat(style.body);
    const accent = mat(style.accent, 0.6);
    const skin = mat('#b98a66', 0.7);
    const dark = mat('#2a2420', 0.7);
    for (const m of [coat, accent, skin, dark]) patch(m);
    const mesh = (gg: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(gg, m);
      x.castShadow = true;
      return x;
    };
    this.torso.add(
      mesh(g.torso, coat),
      mesh(g.belt, accent),
      mesh(g.head, skin),
      mesh(g.hat, dark)
    );
    this.hip.add(this.torso);
    for (const side of [1, -1]) {
      const l = new THREE.Group();
      l.position.set(0, 0, side * 0.11);
      l.add(mesh(g.leg, dark), mesh(g.boot, dark));
      this.legs.push(l);
      this.hip.add(l);
      const a = new THREE.Group();
      a.position.set(0, 0.56, side * 0.27);
      a.rotation.x = side * -0.08;
      a.add(mesh(g.arm, coat), mesh(g.hand, skin));
      this.arms.push(a);
      this.torso.add(a);
    }
    this.root.add(this.hip);
    this.root.matrixAutoUpdate = false;
  }

  /** Place le personnage (base : repère du navire ou de la ville). */
  pose(base: THREE.Matrix4, p: CrewPose, yOff: number, scale: number) {
    this.root.matrix
      .copy(base)
      .multiply(
        new THREE.Matrix4().makeTranslation(p.pos[0], p.pos[1] + yOff, p.pos[2])
      )
      .multiply(new THREE.Matrix4().makeRotationY(p.yaw))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    this.hip.position.set(0, 0.9 - p.crouch + p.bob, 0);
    this.torso.rotation.z = -p.lean;
    this.legs[0].rotation.z = p.legR;
    this.legs[1].rotation.z = p.legL;
    this.arms[0].rotation.z = p.armR;
    this.arms[1].rotation.z = p.armL;
    this.root.matrixWorldNeedsUpdate = true;
  }
}

// --- Foule instanciée -------------------------------------------------------
// Tous les personnages (équipage et habitants) en quelques appels de dessin :
// une instance par pièce du corps, posée par le calcul de la hiérarchie.

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _c = new THREE.Color();

type Slot = 'torso' | 'belt' | 'head' | 'hat' | 'leg' | 'boot' | 'arm' | 'hand';
const SKIN = '#b98a66';
const DARK = '#2a2420';

export class Crowd {
  readonly root = new THREE.Group();
  private meshes: Record<Slot, THREE.InstancedMesh>;
  private n = 0;
  private cap: number;

  constructor(cap: number, patch: (m: THREE.Material) => void) {
    this.cap = cap;
    const g = geo();
    const mk = (geom: THREE.BufferGeometry, perFig: number, rough: number) => {
      const mat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: rough,
      });
      patch(mat);
      const im = new THREE.InstancedMesh(geom, mat, cap * perFig);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, _c.set('#ffffff'));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.count = 0;
      this.root.add(im);
      return im;
    };
    this.meshes = {
      torso: mk(g.torso, 1, 0.85),
      belt: mk(g.belt, 1, 0.6),
      head: mk(g.head, 1, 0.7),
      hat: mk(g.hat, 1, 0.7),
      leg: mk(g.leg, 2, 0.8),
      boot: mk(g.boot, 2, 0.7),
      arm: mk(g.arm, 2, 0.85),
      hand: mk(g.hand, 2, 0.7),
    };
  }

  begin() {
    this.n = 0;
  }

  private put(slot: Slot, i: number, m: THREE.Matrix4, hex: string) {
    const im = this.meshes[slot];
    im.setMatrixAt(i, m);
    im.setColorAt(i, _c.set(hex));
  }

  /** Ajoute un personnage (base : repère monde du navire ou de la ville). */
  add(
    base: THREE.Matrix4,
    style: CrewStyle,
    p: CrewPose,
    yOff: number,
    scale: number
  ) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const root = _m
      .copy(base)
      .multiply(_a.makeTranslation(p.pos[0], p.pos[1] + yOff, p.pos[2]))
      .multiply(_a.makeRotationY(p.yaw))
      .multiply(_a.makeScale(scale, scale, scale));
    const hip = root
      .clone()
      .multiply(_a.makeTranslation(0, 0.9 - p.crouch + p.bob, 0));
    const torso = hip.clone().multiply(_a.makeRotationZ(-p.lean));
    this.put('torso', i, torso, style.body);
    this.put('belt', i, torso, style.accent);
    this.put('head', i, torso, SKIN);
    this.put('hat', i, torso, DARK);
    (
      [
        [1, p.legR, p.armR],
        [-1, p.legL, p.armL],
      ] as const
    ).forEach(([side, leg, arm], k) => {
      _b.copy(hip)
        .multiply(_a.makeTranslation(0, 0, side * 0.11))
        .multiply(_a.makeRotationZ(leg));
      this.put('leg', i * 2 + k, _b, DARK);
      this.put('boot', i * 2 + k, _b, DARK);
      _b.copy(torso)
        .multiply(_a.makeTranslation(0, 0.56, side * 0.27))
        .multiply(_a.makeRotationX(side * -0.08))
        .multiply(_a.makeRotationZ(arm));
      this.put('arm', i * 2 + k, _b, style.body);
      this.put('hand', i * 2 + k, _b, SKIN);
    });
  }

  end() {
    for (const [slot, im] of Object.entries(this.meshes) as [
      Slot,
      THREE.InstancedMesh,
    ][]) {
      const per =
        slot === 'leg' || slot === 'boot' || slot === 'arm' || slot === 'hand'
          ? 2
          : 1;
      im.count = this.n * per;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
