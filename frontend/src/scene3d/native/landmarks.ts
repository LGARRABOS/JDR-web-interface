import * as THREE from 'three';
import type { NativeFrame } from '../../arpenteur3d/native';
import { box, cyl, Kit, lathe, M, torus, tube } from '../ref/kit';
import type { RefMaterials } from '../ref/materials';
import type { AetherRealm } from './aether';

// Repères des lieux-dits : un grand décor reconnaissable, visible de loin
// depuis le navire, qui s'y rend et s'arrête à côté (voir arpenteur3d/nav.ts).
// Pour l'instant : les lieux de test de la position inconnue.

/** Hauteur du plateau, et taille des repères (on doit les voir de loin). */
const Y = 2;
const SCALE = 2.2;
/** Au-delà, le repère n'est plus dessiné. */
const FAR = 4000;

function rnd(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 7;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export class Landmarks {
  readonly root = new THREE.Group();
  private built = new Map<string, { obj: THREE.Object3D; phase: number }>();
  private hull: THREE.MeshStandardMaterial;
  /** Cristaux plus doux que ceux des îles : ici on les voit de près et en grand. */
  private violet: THREE.MeshStandardMaterial;
  private cyan: THREE.MeshStandardMaterial;

  constructor(
    private lib: RefMaterials,
    private aether: AetherRealm
  ) {
    this.hull = lib.hullWood.clone();
    this.hull.side = THREE.DoubleSide;
    this.hull.color.multiplyScalar(0.75);
    this.violet = aether.m.violet.clone();
    this.violet.emissiveIntensity = 0.9;
    this.violet.transparent = true;
    this.violet.opacity = 0.9;
    this.cyan = aether.m.cyan.clone();
    this.cyan.emissiveIntensity = 0.9;
  }

  private crystal(k: Kit, mat: THREE.Material, h: number, m: THREE.Matrix4) {
    const r = h * 0.15;
    k.add(
      mat,
      lathe(
        [
          [r * 0.8, -h * 0.05],
          [r, h * 0.7],
          [r * 0.2, h * 0.97],
          [0.001, h],
        ],
        6
      ),
      m
    );
  }

  /** L'Arche brisée : arche colossale coupée en deux, cristaux dans la brèche. */
  private arche() {
    const a = this.aether;
    const g = new THREE.Group();
    g.add(
      a.isle(31, 30, { ruins: false, crystals: true, tree: false, falls: 1 })
    );
    const k = new Kit();
    const st = a.m.stone;
    const R = 19,
      H = 26;
    for (const sx of [-1, 1])
      k.add(
        st,
        lathe(
          [
            [4.2, 0],
            [3.6, 2],
            [3.1, H * 0.5],
            [3.3, H - 1],
            [3.8, H],
          ],
          10
        ),
        M(sx * R, 0.4, 0)
      );
    // Voûte : deux tronçons d'anneau qui ne se rejoignent plus.
    k.add(st, torus(R, 3.1, 24, 5, Math.PI * 0.4), M(0, H, 0));
    k.add(
      st,
      torus(R, 3.1, 24, 5, Math.PI * 0.34),
      M(0, H, 0, 0, 0, Math.PI * 0.66)
    );
    // Blocs détachés qui flottent dans la brèche.
    const r = rnd(4);
    for (let i = 0; i < 6; i++) {
      const t = Math.PI * (0.44 + r() * 0.2);
      k.add(
        st,
        box(2 + r() * 2.5, 2 + r() * 2, 2.5 + r() * 2, 0.3),
        M(
          Math.cos(t) * (R + (r() - 0.5) * 6),
          H + Math.sin(t) * R + (r() - 0.5) * 5,
          (r() - 0.5) * 4,
          r() * 3,
          r() * 3,
          r() * 3
        )
      );
    }
    this.crystal(k, this.violet, 9, M(0, H + R - 2, 0, 0.2, 0, 0.3));
    this.crystal(k, this.cyan, 6, M(2, H + R - 3, 1, -0.4, 1, -0.5));
    g.add(k.build(this.lib.rope));
    return g;
  }

  /** L'Épave du Veilleur : un vieil arpenteur échoué, mâts brisés. */
  private epave() {
    const a = this.aether;
    const g = new THREE.Group();
    g.add(
      a.isle(57, 28, { ruins: false, crystals: false, tree: true, falls: 1 })
    );
    const k = new Kit();
    const L = 46;
    // Coque ouverte (demi-révolution), couchée le long de x, gîtée.
    const prof: [number, number][] = [
      [0.3, -L / 2],
      [3.2, -L * 0.36],
      [5.6, -L * 0.12],
      [6.2, L * 0.1],
      [5.2, L * 0.34],
      [1.2, L / 2],
    ];
    const hm = M(2, 5.5, -2, 0.35, 0, -Math.PI / 2 + 0.12);
    k.add(
      this.hull,
      lathe(prof, 28, Math.PI),
      hm.clone().multiply(M(0, 0, 0, 0, Math.PI / 2, 0))
    );
    // Membrures qui dépassent là où le bordé a cédé.
    for (let i = 0; i < 7; i++) {
      const x = -L * 0.3 + i * 4;
      k.add(
        this.lib.darkWood,
        torus(5.8, 0.28, 12, 5, Math.PI),
        hm.clone().multiply(M(0, x, 0, Math.PI / 2, 0, Math.PI))
      );
    }
    // Mâts : un debout cassé, un couché sur l'île.
    const sp = this.lib.spar;
    k.add(sp, cyl(0.7, 0.55, 22, 10), M(-4, 15, -3, 0.35, 0, 0.18));
    k.add(
      sp,
      cyl(0.6, 0.45, 30, 10),
      M(10, 3, 9, Math.PI / 2 - 0.1, 0.4, 0.05)
    );
    k.add(sp, cyl(0.35, 0.3, 14, 8), M(-7, 22, -6, 0.2, 0, 1.2));
    // Cordages arrachés qui pendent.
    for (let i = 0; i < 4; i++) {
      const p0 = new THREE.Vector3(-4 + i * 1.5, 24 - i * 2, -6);
      k.add(
        this.lib.rope,
        tube(
          [
            p0,
            p0.clone().add(new THREE.Vector3(3, -9, 2)),
            p0.clone().add(new THREE.Vector3(5, -18 - i * 3, 3)),
          ],
          0.12,
          12,
          5
        )
      );
    }
    // Gouvernail et ancre posés à côté.
    k.add(
      this.lib.castIron,
      torus(2.2, 0.3, 12, 6, Math.PI),
      M(-16, 1.8, 10, 0, 0.6, Math.PI)
    );
    k.add(this.lib.castIron, cyl(0.25, 0.25, 5, 8), M(-16, 3.5, 10, 0, 0.6, 0));
    g.add(k.build(this.lib.rope));
    return g;
  }

  /** L'Aiguille de cristal : gerbe de cristaux d'Aether en suspension. */
  private aiguille() {
    const a = this.aether;
    const g = new THREE.Group();
    const k = new Kit();
    // Cœur de roche arraché, presque englouti par les cristaux.
    k.add(
      a.m.rock,
      lathe(
        [
          [0.1, -14],
          [7, -8],
          [9, -1],
          [7.5, 3],
          [0.1, 6],
        ],
        12
      )
    );
    this.crystal(k, this.violet, 52, M(0, -2, 0, 0.05, 0, -0.04));
    const r = rnd(12);
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2 + r() * 0.3;
      const tilt = 0.4 + r() * 0.9;
      const h = 10 + r() * 22;
      const mat = r() < 0.55 ? this.violet : this.cyan;
      const down = r() < 0.3;
      this.crystal(
        k,
        mat,
        h,
        M(
          Math.cos(t) * 3,
          down ? -4 : 0,
          Math.sin(t) * 3,
          (down ? Math.PI : 0) + Math.sin(t) * tilt,
          0,
          -Math.cos(t) * tilt
        )
      );
    }
    // Éclats en orbite autour de l'aiguille.
    for (let i = 0; i < 16; i++) {
      const t = r() * Math.PI * 2,
        d = 16 + r() * 14;
      this.crystal(
        k,
        r() < 0.5 ? this.violet : this.cyan,
        2 + r() * 3,
        M(
          Math.cos(t) * d,
          4 + r() * 34,
          Math.sin(t) * d,
          r() * 3,
          r() * 3,
          r() * 3
        )
      );
    }
    g.add(k.build(this.lib.rope));
    g.position.y = 10;
    // Pas d'île dessous : l'aiguille seule est déjà très haute.
    g.scale.setScalar(0.7);
    const w = new THREE.Group();
    w.add(g);
    return w;
  }

  /** Le Sanctuaire suspendu : temple rond en ruine, cascades de brume. */
  private sanctuaire() {
    const a = this.aether;
    const g = new THREE.Group();
    g.add(
      a.isle(83, 36, { ruins: false, crystals: true, tree: true, falls: 3 })
    );
    const k = new Kit();
    const st = a.m.stone;
    k.add(st, cyl(15, 15.5, 1.4, 40), M(0, 1.1, 0));
    k.add(st, cyl(13, 13.5, 1.0, 40), M(0, 2.2, 0));
    const R = 11,
      H = 15;
    const r = rnd(9);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const broken = i % 4 === 1 || i % 5 === 3;
      const h = broken ? H * (0.3 + r() * 0.4) : H;
      k.add(
        st,
        lathe(
          [
            [1.1, 0],
            [1.1, 0.4],
            [0.85, 0.8],
            [0.8, h - 0.8],
            [1.05, h - 0.4],
            [1.1, h],
            [0.001, h],
          ],
          14
        ),
        M(Math.cos(t) * R, 2.7, Math.sin(t) * R)
      );
      if (broken)
        k.add(
          st,
          cyl(0.8, 0.8, 3, 12),
          M(
            Math.cos(t) * (R + 4),
            3.3,
            Math.sin(t) * (R + 4),
            Math.PI / 2,
            t,
            0.3
          )
        );
    }
    // Entablement : une moitié de couronne tient encore.
    k.add(
      st,
      torus(R, 1.1, 30, 4, Math.PI * 1.1),
      M(0, H + 3.3, 0, Math.PI / 2, 0, 0.4)
    );
    // Coupole crevée.
    const dome = new THREE.SphereGeometry(
      R + 0.6,
      32,
      12,
      0.5,
      Math.PI * 1.35,
      0,
      Math.PI / 2
    );
    k.add(st, dome, M(0, H + 3.6, 0));
    // Cristal-autel au centre, qui éclaire le temple.
    this.crystal(k, this.cyan, 8, M(0, 2.7, 0));
    this.crystal(k, this.violet, 5, M(1.5, 2.7, 1, 0.3, 0, 0.4));
    g.add(k.build(this.lib.rope));
    return g;
  }

  private build(look: string, id: string) {
    const obj =
      look === 'arche'
        ? this.arche()
        : look === 'epave'
          ? this.epave()
          : look === 'aiguille'
            ? this.aiguille()
            : this.sanctuaire();
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    obj.scale.setScalar(SCALE);
    this.aether.adopt(obj);
    this.root.add(obj);
    const b = { obj, phase: id.length * 1.3 };
    this.built.set(id, b);
    return b;
  }

  /** Positions (x, z) des repères affichés, pour dégager leurs alentours. */
  frame(f: NativeFrame): [number, number][] {
    const want = (f.ground && f.spots) || [];
    const out: [number, number][] = [];
    for (const [id, b] of this.built)
      b.obj.visible = want.some((w) => w.id === id);
    // Un seul repère modelé par image (pas d'à-coup à l'arrivée dans la zone).
    let fresh = false;
    for (const w of want) {
      const b0 = this.built.get(w.id);
      if (Math.hypot(w.x, w.z) > FAR || (!b0 && fresh)) {
        if (b0) b0.obj.visible = false;
        continue;
      }
      if (!b0) fresh = true;
      const b = b0 ?? this.build(w.look, w.id);
      b.obj.visible = true;
      b.obj.position.set(w.x, Y + Math.sin(f.time * 0.2 + b.phase) * 1.2, w.z);
      b.obj.rotation.y = 0.35 + b.phase + w.rot;
      out.push([w.x, w.z]);
    }
    return out;
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.hull.dispose();
    this.violet.dispose();
    this.cyan.dispose();
  }
}
