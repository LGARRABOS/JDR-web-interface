import * as THREE from 'three';
import type { NativeFrame } from '../../render/native';
import type { Quality } from '../quality';
import { boulder, butte, ranges, relief, type RangeStyle } from '../ref/desert';
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
import { acacia, sylvabaob, type FloraMats } from './flora';
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
  /** Lagon : posé au creux des dunes (recherché à chaque tour de boucle). */
  lagoon?: { n: number; dx: number; dz: number; level: number };
}

interface BiomeSet {
  root: THREE.Group;
  items: Feature[];
  far: THREE.Mesh;
  /** Curiosités encore à modeler (construites peu à peu, sans à-coup). */
  queue: {
    make: () => THREE.Object3D;
    x: number;
    z: number;
    r: number;
    sink: number;
    lagoon?: boolean;
  }[];
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
  odur: 'domes',
  savane: 'mesas',
  barkhanes: 'aiguilles',
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
  odur: ['#fbf7ef', '#efe6d6', '#a49a8e'],
  savane: ['#ead6ae', '#cdb07c', '#6e5a44'],
  barkhanes: ['#f2b88c', '#dc925e', '#7a4a3e'],
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
    lagoon?: THREE.MeshStandardMaterial;
    pond?: THREE.MeshStandardMaterial;
    wetSand?: THREE.MeshStandardMaterial;
    mud?: THREE.MeshStandardMaterial;
  };
  flora!: FloraMats;
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
    const water = (op: number, rough: number) =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: op,
        roughness: rough,
        metalness: 0.05,
        depthWrite: false,
        emissive: new THREE.Color('#0a3a46'),
        emissiveIntensity: 0.6,
      });
    this.mats.lagoon = water(0.9, 0.04);
    this.mats.pond = water(0.92, 0.12);
    this.mats.wetSand = tint(lib.sand, '#d8cdb8', {
      roughness: 0.55,
    } as Partial<THREE.MeshStandardMaterialParameters>);
    this.mats.mud = tint(lib.sand, '#7a6448', {
      roughness: 0.7,
    } as Partial<THREE.MeshStandardMaterialParameters>);
    for (const m of [this.mats.lagoon, this.mats.pond]) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      patch(m);
    }
    this.flora = {
      bark: tint(lib.darkWood, '#9a8a78', {
        roughness: 0.95,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      leaf: tint(lib.canvas, '#6f7d3c', {
        side: THREE.DoubleSide,
        roughness: 0.9,
      } as Partial<THREE.MeshStandardMaterialParameters>),
      rock: tint(lib.rock, '#c9b8a0'),
      rope: lib.rope,
    };
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

  /** Lagon (ou point d'eau de la savane) : eau claire au centre, berge mouillée. */
  private lagoon(r: () => number, savanna: boolean): THREE.Object3D {
    const g = new THREE.Group();
    const R = (savanna ? 12 : 20) + r() * (savanna ? 8 : 16);
    const n = 56;
    const pos: number[] = [0, 0, 0],
      col: number[] = [];
    const deep = new THREE.Color(savanna ? '#2f5a4a' : '#0a86b8'),
      shallow = new THREE.Color(savanna ? '#6f8a5e' : '#3fd8d0');
    col.push(deep.r, deep.g, deep.b);
    const idx: number[] = [];
    const ph = r() * 6;
    const stretch = savanna ? 0 : 0.45;
    const radius = (a: number) =>
      R *
      (1 + 0.18 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 7 + ph * 2)) *
      (1 + stretch * Math.cos(a) ** 2);
    // Centre profond (anneau intérieur), bord turquoise clair.
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = radius(a);
      pos.push(Math.cos(a) * rr * 0.55, 0, Math.sin(a) * rr * 0.55);
      col.push(deep.r, deep.g, deep.b);
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      col.push(shallow.r, shallow.g, shallow.b);
      if (i < n) {
        const a0 = 1 + i * 2,
          b0 = 1 + (i + 1) * 2;
        idx.push(0, b0, a0, a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    // Pourtour (16 rayons) : l'eau monte jusqu'au point le plus bas de la rive.
    g.userData.rim = Array.from({ length: 16 }, (_, i) =>
      radius((i / 16) * Math.PI * 2)
    );
    const water = new THREE.Mesh(
      wg,
      savanna ? this.mats.pond : this.mats.lagoon
    );
    water.receiveShadow = true;
    g.add(water);
    // Berge : anneau de sable mouillé qui plonge sous les dunes.
    const sp: number[] = [],
      sidx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = radius(a);
      for (const [dr, dy] of [
        [-1.5, -0.05],
        [3, -0.25],
        [9, -2.5],
      ])
        sp.push(Math.cos(a) * (rr + dr), dy, Math.sin(a) * (rr + dr));
    }
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 2; k++) {
        const a0 = i * 3 + k,
          b0 = (i + 1) * 3 + k;
        sidx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(sidx);
    sg.computeVertexNormals();
    const shore = new THREE.Mesh(
      sg,
      savanna ? this.mats.mud : this.mats.wetSand
    );
    shore.receiveShadow = true;
    g.add(shore);
    if (savanna)
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        const t = acacia(this.flora, 6 + r() * 4, Math.floor(r() * 999));
        t.position.set(Math.cos(a) * (R + 5), 0, Math.sin(a) * (R + 5));
        g.add(t);
      }
    return g;
  }

  /** Kraig : rocher sculpté par le vent (champignon, aiguille ou table). */
  private kraig(r: () => number, biome: string): THREE.Object3D {
    const g = new THREE.Group();
    const lib = { ...this.lib, cliff: this.cliff(biome) };
    const kind = r();
    if (kind < 0.45) {
      // Champignon : pied rongé à la base, large chapeau de roche dure.
      const H = 7 + r() * 12;
      const R = 2.5 + r() * 2.5;
      g.add(
        butte(lib, 0, 0, R * 1.2, H, Math.floor(r() * 1000), 1, r() * 3, -3)
      );
      const cap = boulder(lib, 0, 0, R * 1.9, r() * 50);
      cap.position.set(0, H * 0.62, 0);
      cap.scale.set(1.25, 0.55, 1.15);
      g.add(cap);
    } else if (kind < 0.75) {
      // Aiguilles groupées.
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++)
        g.add(
          butte(
            lib,
            (r() - 0.5) * 14,
            (r() - 0.5) * 10,
            2.5 + r() * 3,
            14 + r() * 26,
            Math.floor(r() * 1000),
            1,
            r() * 3,
            -3
          )
        );
    } else {
      // Table percée par l'érosion : deux piliers et un linteau.
      const H = 9 + r() * 8;
      for (const s of [-1, 1])
        g.add(
          butte(lib, s * 6, 0, 3.5 + r(), H, Math.floor(r() * 1000), 1.2, 0, -3)
        );
      const lintel = boulder(lib, 0, 0, 6.5, r() * 50);
      lintel.position.set(0, H * 0.92, 0);
      lintel.scale.set(1.5, 0.45, 0.7);
      g.add(lintel);
    }
    return g;
  }

  // --- Paysage complet --------------------------------------------------------

  private makeSet(biome: string): BiomeSet {
    return this.makeSetInner(biome);
  }

  /** Modèle des curiosités en attente, dans la limite du temps donné (ms). */
  private work(set: BiomeSet, budget: number) {
    const t0 = performance.now();
    relief.res = 0.62;
    try {
      while (set.queue.length && performance.now() - t0 < budget) {
        const q = set.queue.shift()!;
        const obj = q.make();
        obj.matrixAutoUpdate = true;
        obj.visible = false;
        set.root.add(obj);
        set.items.push({
          obj,
          x: q.x,
          z: q.z,
          r: q.r,
          sink: q.sink,
          lagoon: q.lagoon ? { n: NaN, dx: 0, dz: 0, level: 0 } : undefined,
        });
      }
    } finally {
      relief.res = 1;
    }
  }

  /** Prépare en arrière-plan le paysage de la zone d'arrivée. */
  preload(biome: string | undefined) {
    if (!biome || biome === this.cur) return;
    this.work(this.prepare(biome), 2);
  }

  private makeSetInner(biome: string): BiomeSet {
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
    let lagoons = false;
    const spur = () =>
      this.butteObj(r, biome, 22 + r() * 22, 30 + r() * 40, 1.4 + r());
    switch (biome) {
      case 'odur':
        // Mawarennes : dunes immaculées, lagons azur au creux des dunes.
        add(4, false, 30, () => this.lagoon(r, false));
        add(1, false, 10, rocks);
        lagoons = true;
        break;
      case 'savane':
        add(3, true, 16, () =>
          sylvabaob(this.flora, 22 + r() * 22, Math.floor(r() * 999))
        );
        add(4, false, 8, () =>
          acacia(this.flora, 7 + r() * 5, Math.floor(r() * 999))
        );
        add(2, false, 18, () => this.lagoon(r, true));
        lagoons = true;
        break;
      case 'barkhanes':
        add(3, true, 12, () => this.kraig(r, biome));
        add(2, true, 26, () =>
          this.butteObj(r, biome, 10 + r() * 8, 12 + r() * 16, 2.6 + r() * 1.5)
        );
        add(2, false, 12, rocks);
        break;
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
    const queue: BiomeSet['queue'] = [];
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
      let z = camSide
        ? it.tall
          ? 190 + r() * 120
          : 40 + r() * 140
        : -(40 + it.r + Math.pow(r(), 1.4) * 240);
      // Lagons : hors du lit de l'Odur et de la route.
      const isLagoon = lagoons && it.r >= 18;
      if (isLagoon) z = Math.sign(z) * Math.max(Math.abs(z), 105 + it.r);
      queue.push({
        make: it.make,
        x,
        z,
        r: it.r,
        sink: it.tall ? 1.5 : 0.4,
        lagoon: isLagoon,
      });
    }
    // Le plus vieux et le plus grand sylvabaob de Keld : un repère qu'on
    // voit venir de loin dans la savane.
    if (biome === 'savane')
      queue.push({
        make: () => sylvabaob(this.flora, 115, 4242),
        x: 420,
        z: -560,
        r: 50,
        sink: 4,
      });
    // Les plus proches du navire d'abord.
    queue.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    const far = ranges(FAR[biome] ?? 'mesas', 2300);
    far.renderOrder = -5;
    root.add(far);
    return { root, items, far, queue };
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
    this.work(set, set.items.length < 6 ? 12 : 4);
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
      const lg = it.lagoon;
      if (lg) {
        // À chaque tour de boucle le sable dessous change : on cherche le creux.
        const n = Math.floor((it.x - g.scroll) / LOOP + 0.5);
        if (n !== lg.n) {
          lg.n = n;
          let best = Infinity;
          for (let a = -4; a <= 4; a++)
            for (let b = -4; b <= 4; b++) {
              const h = sandHeight(x + a * 14, it.z + b * 14, g);
              if (h < best) {
                best = h;
                lg.dx = a * 14;
                lg.dz = b * 14;
              }
            }
          // Niveau : le plus bas de la rive, pour que l'eau ne déborde jamais.
          const rim = (it.obj.userData.rim as number[] | undefined) ?? [];
          let lvl = Infinity;
          rim.forEach((rr, i) => {
            const a = (i / rim.length) * Math.PI * 2;
            lvl = Math.min(
              lvl,
              sandHeight(
                x + lg.dx + Math.cos(a) * rr,
                it.z + lg.dz + Math.sin(a) * rr,
                g
              )
            );
          });
          lg.level = Number.isFinite(lvl)
            ? Math.max(best + 0.3, lvl - 0.9)
            : best + 0.9;
        }
        it.obj.position.set(x + lg.dx, lg.level, it.z + lg.dz);
        continue;
      }
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
