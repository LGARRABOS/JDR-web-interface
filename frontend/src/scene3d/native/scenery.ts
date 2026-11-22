import * as THREE from 'three';
import type { NativeFrame } from '../../arpenteur3d/native';
import type { Quality } from '../quality';
import { boulder, butte, ranges, type RangeStyle } from '../ref/desert';
import {
  box,
  bez,
  cyl,
  grid,
  Kit,
  lathe,
  M,
  sphere,
  torus,
  tube,
} from '../ref/kit';
import type { RefMaterials } from '../ref/materials';
import { sandHeight, type GroundParams } from './ground';

// Curiosités des paysages (buttes, cheminées de fée, épaves, côtes de géants,
// cristaux, engrenages, oasis, colonnades…) posées sur une boucle qui défile
// avec le sable, et chaînes lointaines propres à chaque paysage.

const LOOP = 2600;
/** Luminance des roches de jour (palette de référence du moteur maison). */
const ROCK_REF = (() => {
  const a = new THREE.Color('#7a5a46'),
    b = new THREE.Color('#a88064');
  return (
    (0.2126 * (a.r + b.r)) / 2 +
    (0.7152 * (a.g + b.g)) / 2 +
    (0.0722 * (a.b + b.b)) / 2
  );
})();

function rng(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

interface Feature {
  obj: THREE.Object3D;
  x: number;
  z: number;
  /** Rayon d'emprise (pour l'assise sur la pente et l'écart aux villes). */
  r: number;
  sink: number;
}

interface BiomeSet {
  root: THREE.Group;
  items: Feature[];
  far: THREE.Mesh;
}

const FAR: Record<string, RangeStyle> = {
  dunes: 'mesas',
  sel: 'domes',
  canyons: 'falaises',
  cheminees: 'aiguilles',
  ossements: 'mesas',
  cristaux: 'cristaux',
  engrenages: 'mesas',
  oasis: 'domes',
  ruines: 'mesas',
};

/** Teintes des roches et des lointains (éclairé, ombre) par paysage. */
const ROCK: Record<string, [string, string, string]> = {
  dunes: ['#ffffff', '#d9a07a', '#7d5a5a'],
  sel: ['#f4efe6', '#e8dccb', '#9c8f86'],
  canyons: ['#e49a78', '#cf7a52', '#6e3e36'],
  cheminees: ['#f0b28a', '#d98a5e', '#7a4a3e'],
  ossements: ['#e8d8c0', '#cfa886', '#76615a'],
  cristaux: ['#b8a4c8', '#9a86b8', '#4a3a5e'],
  engrenages: ['#d8b89a', '#c09070', '#6a5048'],
  oasis: ['#ffffff', '#d9a07a', '#7d6a5a'],
  ruines: ['#f6e2c4', '#d9a07a', '#7d5a5a'],
};

export class BiomeScenery {
  readonly root = new THREE.Group();
  private sets = new Map<string, BiomeSet>();
  private cur = '';
  private lastMul = new THREE.Color(-1, -1, -1);
  private mats: {
    rock: THREE.MeshStandardMaterial;
    bone: THREE.MeshStandardMaterial;
    stone: THREE.MeshStandardMaterial;
    rust: THREE.MeshStandardMaterial;
    leaf: THREE.MeshStandardMaterial;
    trunk: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    crystal: THREE.MeshStandardMaterial[];
    salt: THREE.MeshStandardMaterial;
  };
  private cliffs = new Map<string, THREE.MeshStandardMaterial>();
  /** Couleur de base de chaque matériau du paysage (assombri la nuit). */
  private bases = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private track(m: THREE.MeshStandardMaterial) {
    this.bases.set(m, m.color.clone());
    return m;
  }

  constructor(
    private lib: RefMaterials,
    private patch: (m: THREE.Material) => void,
    private quality: Quality
  ) {
    const tint = (
      m: THREE.MeshStandardMaterial,
      hex: string,
      o: Partial<THREE.MeshStandardMaterialParameters> = {}
    ) => {
      const c = m.clone();
      c.color.set(hex);
      Object.assign(c, o);
      patch(c);
      return this.track(c);
    };
    const crystal = (hex: string) =>
      tint(lib.glass, hex, {
        transparent: false,
        opacity: 1,
        roughness: 0.12,
        metalness: 0,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 0.25,
      } as Partial<THREE.MeshStandardMaterialParameters>);
    this.mats = {
      rock: tint(lib.rock, '#ffffff'),
      bone: tint(lib.rock, '#f6ead2', {
        roughness: 0.8,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      stone: tint(lib.cliff, '#f2dcc0', {
        vertexColors: false,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      rust: tint(lib.castIron, '#a0583a'),
      leaf: tint(lib.canvas, '#5c8a34', {
        side: THREE.DoubleSide,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      trunk: tint(lib.darkWood, '#9a7a58'),
      water: new THREE.MeshStandardMaterial({
        color: '#1c4652',
        roughness: 0.05,
        metalness: 0.3,
      }),
      crystal: ['#b07ae8', '#6aa8f0', '#e07ac0'].map(crystal),
      salt: tint(lib.rock, '#f4f0ea', {
        roughness: 0.7,
      } as Partial<THREE.MeshStandardMaterialParameters>),
    };
    patch(this.mats.water);
  }

  private cliff(biome: string) {
    let c = this.cliffs.get(biome);
    if (!c) {
      c = this.lib.cliff.clone();
      c.color.set(ROCK[biome]?.[0] ?? '#ffffff');
      this.patch(c);
      this.track(c);
      this.cliffs.set(biome, c);
    }
    return c;
  }

  // --- Curiosités -------------------------------------------------------------

  private rockField(r: () => number, biome: string): THREE.Object3D {
    const g = new THREE.Group();
    const lib = { ...this.lib, cliff: this.cliff(biome) };
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const rad = 1.2 + Math.pow(r(), 2) * 6;
      const b = boulder(lib, 0, 0, rad, r() * 100);
      b.position.set((r() - 0.5) * 26, -rad * 0.2, (r() - 0.5) * 18);
      g.add(b);
    }
    return g;
  }

  private butteObj(
    r: () => number,
    biome: string,
    R: number,
    H: number,
    el: number
  ) {
    const lib = { ...this.lib, cliff: this.cliff(biome) };
    return butte(
      lib,
      0,
      0,
      R,
      H,
      Math.floor(r() * 1000),
      el,
      r() * Math.PI,
      -6
    );
  }

  private hoodoo(r: () => number, biome: string) {
    const g = new THREE.Group();
    const lib = { ...this.lib, cliff: this.cliff(biome) };
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const R = 5 + r() * 6;
      const H = 26 + r() * 40;
      const cx = (i - n / 2) * 16 + r() * 6,
        cz = (r() - 0.5) * 12;
      g.add(
        butte(lib, cx, cz, R * 0.8, H, Math.floor(r() * 1000), 1, r() * 3, -4)
      );
      // Chapeau de roche dure en équilibre.
      const cap = boulder(lib, 0, 0, R * 0.95, r() * 50);
      cap.position.set(cx, H * 0.85, cz);
      cap.scale.set(1.2, 0.55, 1.2);
      g.add(cap);
    }
    return g;
  }

  private wreck(r: () => number) {
    const k = new Kit();
    const m = this.lib;
    const L = 30 + r() * 16;
    // Membrures nues d'une coque échouée, quille brisée, tôles arrachées.
    k.add(
      m.darkWood,
      tube(
        [
          new THREE.Vector3(-L / 2, 0.6, 0),
          new THREE.Vector3(0, 0.2, 0),
          new THREE.Vector3(L / 2, 1.4, 0),
        ],
        0.5,
        24,
        8
      )
    );
    for (let i = 0; i < 11; i++) {
      const x = -L / 2 + 2 + (i / 10) * (L - 4);
      const w = 4.5 * Math.sin(((i + 0.6) / 11.2) * Math.PI) + 1;
      const h = w * (0.9 + r() * 0.5) * (i % 4 === 3 ? 0.5 : 1);
      for (const s of [-1, 1]) {
        if (r() < 0.18) continue;
        k.add(
          m.darkWood,
          tube(
            bez(
              new THREE.Vector3(x, 0.4, 0),
              new THREE.Vector3(x, 0, s * w * 1.2),
              new THREE.Vector3(x + r(), h, s * w * 0.9),
              10
            ),
            0.28,
            10,
            6
          )
        );
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(
        -L / 2 + r() * L,
        1 + r() * 2,
        (r() - 0.5) * 6
      );
      k.add(
        m.ironPlates,
        box(3 + r() * 3, 0.12, 2 + r() * 2, 0.05),
        M(p.x, p.y, p.z, r(), r() * 3, 0.4 + r() * 0.6)
      );
    }
    k.add(
      m.brass,
      cyl(0.7, 0.7, 3, 24),
      M(L * 0.2, 1.2, 1.5, 0, 0, Math.PI / 2 - 0.3)
    );
    const g = k.build(m.rope);
    g.rotation.set(0.12, r() * Math.PI, 0.25 * (r() - 0.5) * 2);
    return g;
  }

  private ribcage(r: () => number) {
    const k = new Kit();
    const m = this.mats.bone;
    const L = 26 + r() * 20;
    const spine = [0, 1, 2, 3, 4].map(
      (i) =>
        new THREE.Vector3(
          -L / 2 + (i / 4) * L,
          5 + Math.sin(i * 0.9) * 1.5 - i * 0.6,
          0
        )
    );
    k.add(m, tube(spine, 0.9, 40, 10));
    for (let i = 0; i <= 8; i++)
      k.add(
        m,
        sphere(1.2, 12, Math.PI),
        M(spine[0].x + (i / 8) * L, 5 - i * 0.3, 0)
      );
    for (let i = 0; i < 9; i++) {
      const x = -L / 2 + 3 + (i / 8) * (L - 8);
      const h = 5 - (i / 8) * 2;
      const w = 6 * Math.sin(((i + 1) / 10) * Math.PI) + 2;
      for (const s of [-1, 1])
        k.add(
          m,
          tube(
            bez(
              new THREE.Vector3(x, h, 0),
              new THREE.Vector3(x + 1, h + 2, s * w * 1.3),
              new THREE.Vector3(x + 2.5, -1, s * w),
              14
            ),
            0.45 - i * 0.02,
            14,
            6
          )
        );
    }
    // Crâne à demi enfoui.
    k.add(
      m,
      sphere(4.2, 18, Math.PI),
      M(-L / 2 - 4, 0.5, 0, 0, 0, 0.3).multiply(
        new THREE.Matrix4().makeScale(1.5, 0.9, 1)
      )
    );
    const g = k.build(this.lib.rope);
    g.rotation.y = r() * Math.PI;
    return g;
  }

  private crystals(r: () => number, big: boolean) {
    const k = new Kit();
    const n = big ? 4 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3);
    const mat = this.mats.crystal[Math.floor(r() * 3)];
    for (let i = 0; i < n; i++) {
      const h = (big ? 12 + r() * 26 : 2 + r() * 5) * (i === 0 ? 1.3 : 1);
      const rad = h * (0.12 + r() * 0.06);
      // Prisme hexagonal à pointe.
      const pr = lathe(
        [
          [rad, -2],
          [rad, h * 0.78],
          [rad * 0.15, h],
          [0.001, h * 1.01],
        ],
        6
      );
      k.add(
        mat,
        pr,
        M(
          (r() - 0.5) * h * 0.6,
          0,
          (r() - 0.5) * h * 0.6,
          (r() - 0.5) * 0.7,
          r() * 3,
          (r() - 0.5) * 0.7
        )
      );
    }
    return k.build(this.lib.rope);
  }

  private crust(r: () => number) {
    const k = new Kit();
    // Plaques de sel soulevées en polygones.
    for (let i = 0; i < 9; i++) {
      const rad = 3 + r() * 5;
      const g = lathe(
        [
          [rad, -0.6],
          [rad * 1.02, 0.25],
          [rad * 0.9, 0.5],
          [0.001, 0.55],
        ],
        6 + Math.floor(r() * 2)
      );
      k.add(
        this.mats.salt,
        g,
        M(
          (r() - 0.5) * 34,
          0,
          (r() - 0.5) * 26,
          (r() - 0.5) * 0.18,
          r() * 3,
          (r() - 0.5) * 0.18
        )
      );
    }
    return k.build(this.lib.rope);
  }

  private gear(r: () => number) {
    const k = new Kit();
    const R = 9 + r() * 12;
    const m = this.mats.rust;
    const rot = M(
      0,
      R * 0.55,
      0,
      Math.PI / 2 - 0.25 + (r() - 0.5) * 0.4,
      r() * Math.PI,
      0
    );
    k.add(m, torus(R, R * 0.07, 64, 10), rot);
    k.add(m, torus(R * 0.3, R * 0.06, 32, 8), rot);
    k.add(
      this.lib.brass,
      cyl(R * 0.16, R * 0.16, R * 0.25, 24),
      rot.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    );
    const teeth = Math.round(R * 2.2);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      k.add(
        m,
        box(R * 0.12, R * 0.14, R * 0.12, R * 0.02),
        rot
          .clone()
          .multiply(
            M(Math.cos(a) * R * 1.07, Math.sin(a) * R * 1.07, 0, 0, 0, a)
          )
      );
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add(
        m,
        box(R * 0.7, R * 0.06, R * 0.06, R * 0.02),
        rot
          .clone()
          .multiply(
            M(Math.cos(a) * R * 0.63, Math.sin(a) * R * 0.63, 0, 0, 0, a)
          )
      );
    }
    return k.build(this.lib.rope);
  }

  private palm(r: () => number, at = new THREE.Vector3()) {
    const k = new Kit();
    const h = 9 + r() * 6;
    const lean = new THREE.Vector3((r() - 0.5) * 4, 0, (r() - 0.5) * 4);
    const top = at.clone().add(new THREE.Vector3(lean.x, h, lean.z));
    k.add(
      this.mats.trunk,
      tube(
        bez(
          at,
          at
            .clone()
            .add(new THREE.Vector3(lean.x * 0.1, h * 0.5, lean.z * 0.1)),
          top,
          12
        ),
        0.32,
        12,
        8
      )
    );
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const len = 4.5 + r() * 1.5;
      // Palme : bande courbée qui retombe.
      k.add(
        this.mats.leaf,
        grid(10, 2, (i, j) => {
          const u = i / 10,
            v = j / 2;
          const s = u * len;
          const w = Math.sin(u * Math.PI) * 0.9 * (v - 0.5);
          const y = Math.sin(u * 1.4) * 1.4 - u * u * 2.4;
          return {
            p: new THREE.Vector3(
              top.x + Math.cos(a) * s - Math.sin(a) * w,
              top.y + y,
              top.z + Math.sin(a) * s + Math.cos(a) * w
            ),
            uv: [s, w] as [number, number],
          };
        })
      );
    }
    return k;
  }

  private oasis(r: () => number) {
    const g = new THREE.Group();
    const R = 12 + r() * 10;
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(R, 48),
      this.mats.water
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.y = 1.6;
    pond.scale.set(1.4, 1, 1);
    g.add(pond);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const pk = this.palm(
        r,
        new THREE.Vector3(Math.cos(a) * (R * 1.4 + 2), 0, Math.sin(a) * (R + 2))
      );
      g.add(pk.build(this.lib.rope));
    }
    return g;
  }

  private colonnade(r: () => number) {
    const k = new Kit();
    const m = this.mats.stone;
    const n = 4 + Math.floor(r() * 5);
    const h = 9 + r() * 6;
    const col = (H: number) =>
      lathe(
        [
          [1.3, -1],
          [1.3, 0.4],
          [0.95, 0.8],
          [0.85, H * 0.5],
          [0.78, H - 0.9],
          [1.15, H - 0.5],
          [1.2, H],
          [0.001, H],
        ],
        24
      );
    for (let i = 0; i < n; i++) {
      const broken = r() < 0.35;
      const H = broken ? h * (0.3 + r() * 0.5) : h;
      k.add(m, col(H), M(i * 5, 0, 0));
      if (!broken && i < n - 1 && r() < 0.6)
        k.add(m, box(5.6, 1.1, 2, 0.12), M(i * 5 + 2.5, h + 0.55, 0));
    }
    for (let i = 0; i < 3; i++)
      k.add(
        m,
        col(3),
        M(r() * n * 5, 0.8, 4 + r() * 4, Math.PI / 2, r() * 3, 0)
      );
    const g = k.build(this.lib.rope);
    g.rotation.y = r() * Math.PI;
    return g;
  }

  // --- Paysage complet --------------------------------------------------------

  private makeSet(biome: string): BiomeSet {
    const root = new THREE.Group();
    const items: Feature[] = [];
    const r = rng(
      biome.length * 7919 + biome.charCodeAt(0) * 131 + biome.charCodeAt(1)
    );
    type Make = {
      w: number;
      tall: boolean;
      r: number;
      make: () => THREE.Object3D;
    };
    const list: Make[] = [];
    const add = (
      w: number,
      tall: boolean,
      rad: number,
      make: () => THREE.Object3D
    ) => list.push({ w, tall, r: rad, make });
    const rocks = () => this.rockField(r, biome);
    const spur = () =>
      this.butteObj(r, biome, 22 + r() * 22, 30 + r() * 40, 1.4 + r());
    switch (biome) {
      case 'sel':
        add(4, false, 20, () => this.crust(r));
        add(2, false, 6, () => this.crystals(r, false));
        add(1, true, 14, () => this.crystals(r, true));
        break;
      case 'canyons':
        add(3, true, 60, () =>
          this.butteObj(r, biome, 30 + r() * 30, 50 + r() * 50, 2.2 + r())
        );
        add(2, true, 40, spur);
        add(1, false, 14, rocks);
        break;
      case 'cheminees':
        add(4, true, 22, () => this.hoodoo(r, biome));
        add(1, false, 14, rocks);
        break;
      case 'ossements':
        add(3, true, 26, () => this.ribcage(r));
        add(1, false, 14, rocks);
        add(1, true, 24, () => this.wreck(r));
        break;
      case 'cristaux':
        add(3, true, 14, () => this.crystals(r, true));
        add(2, false, 6, () => this.crystals(r, false));
        add(1, false, 14, rocks);
        break;
      case 'engrenages':
        add(3, true, 20, () => this.gear(r));
        add(1, true, 24, () => this.wreck(r));
        add(1, false, 14, rocks);
        break;
      case 'oasis':
        add(2, true, 30, () => this.oasis(r));
        add(2, false, 6, () => this.palm(r).build(this.lib.rope));
        add(1, false, 14, rocks);
        break;
      case 'ruines':
        add(3, true, 24, () => this.colonnade(r));
        add(1, true, 40, spur);
        add(1, false, 14, rocks);
        break;
      default:
        add(3, false, 14, rocks);
        add(1, true, 24, () => this.wreck(r));
        add(2, true, 40, spur);
    }
    const bag: Make[] = [];
    list.forEach((l) => {
      for (let i = 0; i < l.w; i++) bag.push(l);
    });
    const step = this.quality.texSize >= 1024 ? 45 : 60;
    for (
      let x = -LOOP / 2 + r() * step;
      x < LOOP / 2 - 40;
      x += step * (0.6 + r() * 0.9)
    ) {
      const it = bag[Math.floor(r() * bag.length)];
      // Côté caméra (+z), seuls de petits éléments approchent.
      const camSide = r() < 0.3;
      const z = camSide
        ? it.tall
          ? 190 + r() * 120
          : 40 + r() * 140
        : -(40 + it.r + Math.pow(r(), 1.4) * 240);
      const obj = it.make();
      obj.matrixAutoUpdate = true;
      root.add(obj);
      items.push({ obj, x, z, r: it.r, sink: it.tall ? 1.5 : 0.4 });
    }
    const far = ranges(FAR[biome] ?? 'mesas', 2300);
    far.renderOrder = -5;
    root.add(far);
    return { root, items, far };
  }

  /** Prépare le paysage à l'avance (évite un à-coup au changement de zone). */
  prepare(biome: string) {
    if (!this.sets.has(biome)) {
      const s = this.makeSet(biome);
      s.root.visible = false;
      this.sets.set(biome, s);
      this.root.add(s.root);
    }
    return this.sets.get(biome)!;
  }

  frame(f: NativeFrame, g: GroundParams) {
    const set = this.prepare(f.biome);
    if (this.cur !== f.biome) {
      for (const [k, s] of this.sets) s.root.visible = k === f.biome;
      this.cur = f.biome;
    }
    set.root.visible = f.ground && !f.inVoid;
    if (!set.root.visible) return;
    const L = f.light;
    const pal = ROCK[f.biome] ?? ROCK.dunes;
    const fu = (set.far.material as THREE.ShaderMaterial).uniforms;
    (fu.uSun.value as THREE.Vector3)
      .set(L.sunDir[0], L.sunDir[1], L.sunDir[2])
      .normalize();
    const k = f.night ? 0.18 : 1;
    const sun = new THREE.Color(L.sunColor[0], L.sunColor[1], L.sunColor[2]);
    (fu.uLit.value as THREE.Color)
      .set(pal[1])
      .multiply(sun)
      .multiplyScalar(k * 0.9);
    (fu.uShade.value as THREE.Color)
      .set(pal[2])
      .multiplyScalar(k * 0.6)
      .add(
        new THREE.Color(L.zenith[0], L.zenith[1], L.zenith[2]).multiplyScalar(
          0.25
        )
      );
    (fu.uHaze.value as THREE.Color)
      .setRGB(L.fog[0], L.fog[1], L.fog[2])
      .lerp(new THREE.Color(L.horizon[0], L.horizon[1], L.horizon[2]), 0.5);
    // Roches éclairées selon l'heure (même référence que le moteur maison).
    const ra = L.rockA,
      rb = L.rockB;
    const lum = (r: number, g: number, b: number) =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;
    const now = lum(
      (ra[0] + rb[0]) / 2,
      (ra[1] + rb[1]) / 2,
      (ra[2] + rb[2]) / 2
    );
    const kr = Math.min(1.3, Math.max(0.12, now / ROCK_REF));
    const tintC = new THREE.Color(
      (ra[0] + rb[0]) / 2,
      (ra[1] + rb[1]) / 2,
      (ra[2] + rb[2]) / 2
    ).multiplyScalar(1 / Math.max(1e-4, now));
    const mul = new THREE.Color(1, 1, 1).lerp(tintC, 0.35).multiplyScalar(kr);
    if (!this.lastMul.equals(mul)) {
      this.lastMul.copy(mul);
      for (const [m, c] of this.bases) m.color.copy(c).multiply(mul);
    }
    for (const it of set.items) {
      let x = ((((it.x - g.scroll) % LOOP) + LOOP * 1.5) % LOOP) - LOOP / 2;
      // Rien sur les quais : on écarte les curiosités autour des villes.
      const nearCity = g.calm > 0 && Math.hypot(x - g.calmX, it.z) < 900 + it.r;
      it.obj.visible = !nearCity;
      if (nearCity) continue;
      if (Math.abs(x) > LOOP / 2 - 30) x = Math.sign(x) * (LOOP / 2 - 30);
      // Assise : le point le plus bas de l'emprise (rien ne flotte).
      const rr = it.r * 0.6;
      const y = Math.min(
        sandHeight(x, it.z, g),
        sandHeight(x + rr, it.z, g),
        sandHeight(x - rr, it.z, g),
        sandHeight(x, it.z + rr, g),
        sandHeight(x, it.z - rr, g)
      );
      it.obj.position.set(x, y - it.sink, it.z);
    }
  }

  dispose() {
    for (const s of this.sets.values())
      s.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    this.sets.clear();
  }
}
