import { MeshBuilder, P, type Mat, type MeshData } from './geometry';
import {
  chain,
  linear,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  translation,
  type Vec3,
} from './math';
import type { Lighting } from './renderer';
import type { CrewMember } from './shipModel';

// Ville d'escale : quai surélevé où l'arpenteur s'amarre, grues, entrepôts,
// et la ville du désert tout autour (maisons de pisé, dômes, tours, minarets).
// Le navire est au centre, proue vers +x ; la caméra par défaut est côté +z.

export interface CityOptions {
  /** Identifiant de la ville (graine du tirage). */
  id: string;
  capital?: boolean;
  night: boolean;
  /** Demi-largeur et longueur de la coque, hauteur de vol à quai (m). */
  halfBeam: number;
  length: number;
  hover: number;
}

/**
 * Postes d'amarrage des autres navires (centre du navire, en mètres) : un
 * navire reste à quai, les autres arrivent, restent un moment et repartent
 * le long de leur chenal (cycle de `period` secondes, décalé de `phase`).
 */
export const BERTHS: {
  x: number;
  z: number;
  cycle?: { period: number; phase: number };
}[] = [
  { x: -170, z: -200 },
  { x: 170, z: -110, cycle: { period: 84, phase: 0 } },
  { x: 60, z: -300, cycle: { period: 84, phase: 44 } },
];
/** Chenaux dégagés (z) où circulent les navires qui arrivent ou partent. */
const LANES = [-110, -300];

/** Style d'une ville : couleurs, toits, tours et monument. */
interface CityStyle {
  walls: string[];
  /** Matériau des dômes et flèches : cuivre, céramique colorée, ardoise… */
  dome: string;
  domeMetal: boolean;
  awnings: string[];
  roof: 'terrasse' | 'domes' | 'pignons' | 'usine';
  tower: 'minaret' | 'beffroi' | 'cheminee' | 'phare' | 'cristal';
  monument:
    | 'dome'
    | 'ziggurat'
    | 'horloge'
    | 'forge'
    | 'cristal'
    | 'phare'
    | 'colosse'
    | 'arene'
    | 'temple';
  /** Hauteur des maisons (multiplicateur) et part de végétation. */
  height: number;
  palms: number;
}

const STYLES: Record<string, CityStyle> = {
  // Cité blanche du nord, coupoles bleues et minarets.
  ZENIT: {
    walls: ['#f0ece2', '#e8e2d4', '#f4f0e8', '#dcd6c8'],
    dome: '#3a6aa8',
    domeMetal: false,
    awnings: ['#3a6aa8', '#c9a227', '#f0ece2'],
    roof: 'domes',
    tower: 'minaret',
    monument: 'dome',
    height: 1,
    palms: 0.3,
  },
  // Ville du sel : blocs blanc-gris, flèches de cristal.
  FREMIS: {
    walls: ['#e4e0d8', '#d4d0c8', '#c8c4bc', '#ece8e0'],
    dome: '#a8c8d8',
    domeMetal: false,
    awnings: ['#5a8aa8', '#a8c8d8', '#6a6a7a'],
    roof: 'terrasse',
    tower: 'cristal',
    monument: 'cristal',
    height: 0.8,
    palms: 0.1,
  },
  // Port de pisé, dômes de cuivre (ville de référence).
  DARRAKIS: {
    walls: ['#c9a27a', '#d8b48a', '#b88a62', '#e0c49c', '#a87a56', '#cfae8c'],
    dome: '#a8683a',
    domeMetal: true,
    awnings: ['#8a2f24', '#2f5a6a', '#c9a227', '#5a6a2f'],
    roof: 'domes',
    tower: 'minaret',
    monument: 'dome',
    height: 1,
    palms: 1,
  },
  // Capitale de pierre rouge : ziggourat royale, beffrois, plus haute.
  RAKDOS: {
    walls: ['#a85a3a', '#b8684a', '#984a2e', '#c87a5a', '#8a4a32'],
    dome: '#c9a227',
    domeMetal: true,
    awnings: ['#c9a227', '#5a1f1a', '#2f2f5a'],
    roof: 'terrasse',
    tower: 'beffroi',
    monument: 'ziggurat',
    height: 1.3,
    palms: 0.6,
  },
  // Ville de bois et d'ardoise, toits à pignons, phare d'atterrissage.
  FARDEL: {
    walls: ['#8a6a4a', '#7a5a3a', '#9a7a5a', '#6a4a30'],
    dome: '#3a3a44',
    domeMetal: false,
    awnings: ['#8a2f24', '#3a5a3a', '#c9a227'],
    roof: 'pignons',
    tower: 'phare',
    monument: 'phare',
    height: 0.85,
    palms: 0.2,
  },
  // Ville d'os blanchi : colosse de pierre, arène.
  KARTOUM: {
    walls: ['#e4d8c0', '#d8cab0', '#cabca0', '#efe4cc'],
    dome: '#8a6a4a',
    domeMetal: false,
    awnings: ['#6a2a1a', '#a87a3a', '#2a2a2a'],
    roof: 'terrasse',
    tower: 'minaret',
    monument: 'colosse',
    height: 0.9,
    palms: 0.4,
  },
  // Cité violette des cristaux.
  DELROSIS: {
    walls: ['#7a6a8a', '#8a7a9a', '#6a5a7a', '#9a8aa8'],
    dome: '#b07ad8',
    domeMetal: false,
    awnings: ['#b07ad8', '#5a8ac8', '#d8c8e8'],
    roof: 'domes',
    tower: 'cristal',
    monument: 'cristal',
    height: 1.1,
    palms: 0.1,
  },
  // Ville-forge : briques sombres, cheminées d'usine, engrenage géant.
  GARKAL: {
    walls: ['#5a4038', '#6a4a40', '#4a3630', '#7a5a4a'],
    dome: '#4a4440',
    domeMetal: true,
    awnings: ['#8a3a1a', '#3a3a3a', '#c9a227'],
    roof: 'usine',
    tower: 'cheminee',
    monument: 'forge',
    height: 1.05,
    palms: 0,
  },
  // Cité-jardin du sud : céramiques vertes, temple, palmeraies.
  'CITE-SUD': {
    walls: ['#e0d0a8', '#d8c498', '#e8dcb8', '#cab88a'],
    dome: '#3a8a6a',
    domeMetal: false,
    awnings: ['#3a8a6a', '#d8a03a', '#8a2f24'],
    roof: 'domes',
    tower: 'minaret',
    monument: 'temple',
    height: 0.9,
    palms: 2,
  },
};
const STYLE_POOL = Object.values(STYLES);

function styleOf(id: string): CityStyle {
  const s = STYLES[id.toUpperCase()];
  if (s) return s;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return STYLE_POOL[h % STYLE_POOL.length];
}

/** Hauteur du quai : le pont du navire amarré arrive à son niveau. */
export const DOCK_TOP = 0;

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function cityMesh(o: CityOptions): {
  city: MeshData;
  moor: MeshData;
  crowd: CrewMember[];
} {
  const b = new MeshBuilder();
  // Amarres et passerelle à part : affichées seulement une fois le navire à quai.
  const m = new MeshBuilder();
  const r = rng(o.id);
  const top = o.hover + DOCK_TOP;
  const st = styleOf(o.id);
  const adobe = st.walls;
  const mat = (
    hex: string,
    p: number = P.PLAIN,
    rough = 0.9,
    metal = 0
  ): Mat => ({
    p,
    color: linear(hex),
    metal,
    rough,
  });
  const stone = mat('#8e7a64', P.ROCK, 0.95);
  const darkStone = mat('#5e5044', P.ROCK, 0.95);
  const plank = mat('#6a4a30', P.WOOD, 0.85);
  const iron = mat('#2a2622', P.IRON, 0.6, 0.6);
  const brass = mat('#b8893a', P.BRASS, 0.35, 1);

  // Dômes, flèches et toits aux couleurs de la ville.
  const copper: Mat = st.domeMetal
    ? { p: P.PATINA, color: linear(st.dome), metal: 0.85, rough: 0.6 }
    : { p: P.PLAIN, color: linear(st.dome), metal: 0, rough: 0.45 };
  const awning = st.awnings;
  const lit: Mat = {
    p: P.EMIT,
    color: linear('#ffb45a'),
    metal: 0,
    rough: 1,
    emit: o.night ? 3.2 : 0.25,
  };
  const dark = mat('#1a1410', P.PLAIN, 1);
  const win = (night: boolean) => (r() < (night ? 0.7 : 0.15) ? lit : dark);

  // --- Quai d'amarrage, le long du flanc bâbord (z < 0) -------------------------------
  const z0 = -(o.halfBeam + 1.2);
  const depth = 16;
  const len = o.length + 24;
  const zc = z0 - depth / 2;
  // Un quai : tablier sur arches, bornes, grues, caisses, réverbères, entrepôt.
  // `xc`, `zs` : centre du navire amarré ; le quai est côté -z.
  const quay = (xc: number, zs: number, main: boolean) => {
    b.push(translation(xc, 0, zs));
    // Tablier en planches sur une maçonnerie à arches.
    b.push(translation(0, top - 0.4, zc));
    b.box(len, 0.4, depth, plank);
    b.pop();
    b.push(translation(0, top - 1.6, zc));
    b.box(len + 0.6, 1.2, depth + 0.6, stone);
    b.pop();
    for (let x = -len / 2 + 4; x <= len / 2 - 4; x += 9) {
      for (const z of [z0 - 1.5, z0 - depth + 1.5]) {
        b.push(translation(x, -6, z));
        b.box(2.4, top - 1.6 + 6, 2.4, stone);
        b.pop();
      }
      // Arc (linteau) entre les piles côté navire.
      b.push(translation(x + 4.5, top - 3.2, z0 - 1.5));
      b.box(6.6, 1.6, 2.2, darkStone);
      b.pop();
    }
    // Bornes d'amarrage et cordages vers le navire.
    const bollards: Vec3[] = [];
    for (const fx of [-0.36, -0.12, 0.12, 0.36]) {
      const x = fx * o.length;
      b.push(translation(x, top, z0 - 0.8));
      b.lathe(
        [
          [0, 0],
          [0.32, 0],
          [0.24, 0.5],
          [0.36, 0.7],
          [0, 0.74],
        ],
        10,
        iron
      );
      b.pop();
      bollards.push([x, top + 0.55, z0 - 0.8]);
    }
    if (main) {
      for (const p of bollards) {
        const ship: Vec3 = [p[0] * 0.92, top + 1.1, -o.halfBeam + 0.4];
        const mid: Vec3 = [
          (p[0] + ship[0]) / 2,
          Math.min(p[1], ship[1]) - 0.35,
          (p[2] + ship[2]) / 2,
        ];
        m.tube([ship, mid, p], 0.06, 4, rope);
      }
      // Passerelle vers le pont.
      m.push(translation(-o.length * 0.05, top + 0.25, z0 + 0.4));
      m.box(3, 0.15, 2.6, plank);
      m.pop();
      for (const dx of [-1.4, 1.4])
        m.tube(
          [
            [-o.length * 0.05 + dx, top + 1.2, z0 - 0.9],
            [-o.length * 0.05 + dx, top + 1.3, z0 + 1.7],
          ],
          0.05,
          4,
          brass
        );
    }
    // Grues à potence.
    for (const fx of [-0.3, 0.28]) {
      const x = fx * o.length;
      const zz = z0 - depth + 3;
      b.push(translation(x, top, zz));
      b.box(2.2, 1, 2.2, darkStone);
      b.cylinder(0.45, 16, 8, iron);
      b.push(translation(0, 15.5, 0));
      b.cylinder(0.9, 1.2, 10, brass);
      b.pop();
      b.pop();
      const tip: Vec3 = [x + (fx < 0 ? 4 : -4), top + 17.2, z0 - 1];
      b.tube([[x, top + 16.6, zz], tip], 0.32, 6, iron);
      b.tube(
        [
          [x, top + 16.2, zz],
          [x - (tip[0] - x) * 0.3, top + 16.4, zz - 3],
        ],
        0.25,
        6,
        iron
      );
      b.tube([tip, [tip[0], top + 5, tip[2]]], 0.04, 4, rope);
      b.push(translation(tip[0], top + 3.6, tip[2]));
      b.box(1.6, 1.4, 1.6, mat('#7a5a36', P.WOOD, 0.8));
      b.pop();
    }
    // Caisses, tonneaux, réverbères.
    for (let k = 0; k < 18; k++) {
      const x = (r() - 0.5) * (len - 10);
      const z = z0 - 4 - r() * (depth - 7);
      const s = 0.9 + r() * 0.8;
      b.push(chain(translation(x, top, z), rotationY(r() * 3)));
      if (r() < 0.6) b.box(s * 1.4, s, s, mat('#8a6a42', P.WOOD, 0.85));
      else b.cylinder(s * 0.45, s * 1.1, 10, mat('#6a4a2a', P.WOOD, 0.8));
      b.pop();
    }
    for (let x = -len / 2 + 6; x <= len / 2 - 6; x += 14) {
      const z = z0 - depth + 1;
      b.push(translation(x, top, z));
      b.cylinder(0.12, 4.2, 6, iron);
      b.push(translation(0, 4.2, 0));
      b.cylinder(0.3, 0.6, 8, lit);
      b.pop();
      b.pop();
    }
    // Entrepôt au fond du quai.
    b.push(translation(0, top, z0 - depth - 7));
    b.box(len * 0.7, 9, 12, mat('#b08a64'));
    b.pop();
    // Toit en berceau (voûte de cuivre) sur toute la longueur.
    b.push(
      chain(
        translation(-len * 0.35, top + 9, z0 - depth - 7),
        rotationZ(-Math.PI / 2)
      )
    );
    b.cylinder(6, len * 0.7, 18, copper);
    b.pop();
    for (let x = -len * 0.32; x <= len * 0.32; x += 6) {
      b.push(translation(x, top + 1, z0 - depth - 0.95));
      b.box(3.2, 4.8, 0.1, dark);
      b.pop();
      b.push(translation(x, top + 6, z0 - depth - 0.95));
      b.box(1.6, 1.4, 0.12, win(o.night));
      b.pop();
    }
    b.pop();
  };
  const rope = mat('#8a7458', P.PLAIN, 1);
  quay(0, 0, true);
  for (const q of BERTHS) quay(q.x, q.z, false);

  // --- La ville ---------------------------------------------------------------------
  const ground = -1;
  const house = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    ry: number,
    near: boolean,
    low = false
  ) => {
    const c = adobe[Math.floor(r() * adobe.length)];
    b.push(chain(translation(x, ground, z), rotationY(ry)));
    b.box(w, h, d, mat(c));
    // Acrotère et terrasse.
    b.push(translation(0, h, 0));
    b.box(w + 0.4, 0.6, d + 0.4, mat(c, P.PLAIN, 0.95));
    b.pop();
    // Étage en retrait sur une partie des maisons.
    if (!low && r() < 0.45 && h > 5) {
      const w2 = w * (0.45 + r() * 0.25);
      const d2 = d * (0.45 + r() * 0.25);
      const h2 = 2.8 + r() * 3;
      b.push(translation((r() - 0.5) * (w - w2), h, (r() - 0.5) * (d - d2)));
      b.box(w2, h2, d2, mat(c));
      b.push(translation(0, h2, 0));
      b.box(w2 + 0.3, 0.5, d2 + 0.3, mat(c, P.PLAIN, 0.95));
      b.pop();
      if (near) {
        b.push(translation(0, h2 * 0.45, d2 / 2 + 0.06));
        b.box(0.9, 1.3, 0.1, win(o.night));
        b.pop();
      }
      b.pop();
    }
    // Porte en arc sur la façade.
    b.push(translation((r() - 0.5) * w * 0.5, 0, d / 2 + 0.06));
    b.box(1.4, 2.4, 0.12, dark);
    b.push(chain(translation(0, 2.4, 0), scaling(0.7, 0.5, 0.06)));
    b.sphere(1, 8, dark, true);
    b.pop();
    b.pop();
    // Fenêtres sur les quatre faces (seulement pour les maisons proches).
    const floors = near ? Math.max(1, Math.floor((h - 1) / 3.2)) : 0;
    for (let f = 0; f < floors; f++) {
      const y = 2 + f * 3.2;
      for (const [nx, nz, span] of [
        [0, 1, w],
        [0, -1, w],
        [1, 0, d],
        [-1, 0, d],
      ] as const) {
        const n = Math.max(1, Math.floor(span / 3.5));
        for (let k = 0; k < n; k++) {
          if (r() < 0.25) continue;
          const t = (k + 0.5) / n - 0.5;
          const px = nx !== 0 ? (nx * w) / 2 + nx * 0.06 : t * span;
          const pz = nz !== 0 ? (nz * d) / 2 + nz * 0.06 : t * span;
          b.push(translation(px, y, pz));
          b.box(nx !== 0 ? 0.1 : 0.9, 1.3, nx !== 0 ? 0.9 : 0.1, win(o.night));
          b.pop();
        }
      }
    }
    // Fanion sur le toit, qui claque au vent.
    if (near && r() < 0.14) {
      const fc = awning[Math.floor(r() * awning.length)];
      b.push(translation(w * 0.35, h, -d * 0.35));
      b.cylinder(0.08, 5, 5, iron);
      b.push(translation(0, 4.9, 0));
      b.grid(
        8,
        4,
        (u, v) => [-u * 2.6, -v * 1.4, 0],
        (u) => ({
          p: P.SAIL,
          color: linear(fc),
          metal: 0,
          rough: 0.85,
          emit: 1 + u,
        }),
        {}
      );
      b.pop();
      b.pop();
    }
    // Toits à pignons (ardoise) ou sheds d'usine selon le style.
    if (st.roof === 'pignons' && !low) {
      const ph = Math.min(w, d) * 0.45;
      b.push(
        chain(
          translation(0, h, 0),
          w >= d ? rotationY(0) : rotationY(Math.PI / 2)
        )
      );
      const L = Math.max(w, d) + 0.4;
      const D = Math.min(w, d) / 2 + 0.3;
      b.grid(
        1,
        2,
        (u, v) => [
          (u - 0.5) * L,
          v < 0.5 ? ph * v * 2 : ph * (2 - v * 2),
          (v * 2 - 1) * D,
        ],
        copper,
        {}
      );
      for (const sx of [-1, 1]) {
        const i0 = b.vertex([sx * L * 0.48, 0, -D], [sx, 0, 0], [0, 0], mat(c));
        const i1 = b.vertex([sx * L * 0.48, 0, D], [sx, 0, 0], [1, 0], mat(c));
        const i2 = b.vertex(
          [sx * L * 0.48, ph, 0],
          [sx, 0, 0],
          [0.5, 1],
          mat(c)
        );
        if (sx > 0) b.tri(i0, i2, i1);
        else b.tri(i0, i1, i2);
      }
      b.pop();
      b.pop();
      return;
    }
    if (st.roof === 'usine' && !low && r() < 0.6) {
      // Toit en dents de scie et haute cheminée de brique.
      const n = Math.max(2, Math.round(w / 4));
      for (let k = 0; k < n; k++) {
        b.push(translation(-w / 2 + (k + 0.5) * (w / n), h, 0));
        b.grid(
          1,
          1,
          (u, v) => [(u - 0.5) * (w / n), u * 2.2, (v - 0.5) * d],
          copper,
          {}
        );
        b.push(translation(w / n / 2 - 0.05, 0, 0));
        b.box(0.1, 2.2, d, win(true));
        b.pop();
        b.pop();
      }
      if (r() < 0.5) {
        b.push(translation(w * 0.3, h, -d * 0.3));
        b.cylinder(0.9, 7 + r() * 6, 10, mat('#4a2e26'));
        b.pop();
      }
      b.pop();
      return;
    }
    // Ornements : dôme, tourelle, auvent, cheminée.
    const roll = r() * (st.roof === 'terrasse' ? 1.4 : 1);
    if (roll < 0.22) {
      b.push(translation(0, h + 0.6, 0));
      b.cylinder(Math.min(w, d) * 0.3, 1.2, 12, mat(c));
      b.push(chain(translation(0, 1.2, 0), scaling(1, 1.15, 1)));
      b.sphere(
        Math.min(w, d) * 0.3,
        18,
        r() < 0.5 ? copper : mat('#e8dcc4'),
        true
      );
      b.pop();
      b.pop();
    } else if (roll < 0.36) {
      b.push(translation(w * 0.3, h, d * 0.3));
      b.cylinder(1, 4, 8, mat(c));
      b.push(translation(0, 4, 0));
      b.lathe(
        [
          [1.2, 0],
          [0, 2.2],
        ],
        8,
        copper
      );
      b.pop();
      b.pop();
    } else if (roll < 0.55) {
      b.push(translation(0, 2.6, d / 2 + 0.9));
      b.box(
        w * 0.7,
        0.12,
        1.8,
        mat(awning[Math.floor(r() * awning.length)], P.SAIL)
      );
      b.pop();
    } else if (roll < 0.7) {
      b.push(translation(-w * 0.3, h, -d * 0.25));
      b.cylinder(0.5, 2.5, 8, mat('#6a4a3a', P.PLAIN));
      b.pop();
    }
    b.pop();
  };
  const belfry = (x: number, z: number, h: number, c: string) => {
    b.push(translation(x, ground, z));
    b.box(6, h, 6, mat(c));
    b.push(translation(0, h, 0));
    b.box(7, 1, 7, mat(c, P.PLAIN, 0.95));
    for (const [nx, nz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      b.push(translation(nx * 3.05, -3, nz * 3.05));
      b.push(rotationY(nx !== 0 ? Math.PI / 2 : 0));
      b.cylinder(1.8, 0.15, 20, mat('#efe4c8'));
      b.pop();
      b.pop();
    }
    b.push(translation(0, 1, 0));
    b.lathe(
      [
        [4.2, 0],
        [0, 6],
      ],
      4,
      copper
    );
    b.pop();
    b.pop();
    b.pop();
  };
  const lighthouse = (x: number, z: number, h: number) => {
    b.push(translation(x, ground, z));
    b.lathe(
      [
        [4, 0],
        [2.6, h],
        [3.4, h],
        [3.4, h + 0.6],
        [0, h + 0.6],
      ],
      14,
      mat('#e8e0d0')
    );
    for (let k = 1; k < 4; k++) {
      b.push(translation(0, (h * k) / 4, 0));
      b.torus(4 - (1.4 * k) / 4 + 0.05, 0.5, 14, 4, mat('#8a2f24'));
      b.pop();
    }
    b.push(translation(0, h + 0.6, 0));
    b.cylinder(2, 3, 10, { ...lit, emit: o.night ? 6 : 1.4 });
    b.push(translation(0, 3, 0));
    b.lathe(
      [
        [2.6, 0],
        [0, 2.4],
      ],
      10,
      copper
    );
    b.pop();
    b.pop();
    b.pop();
  };
  const crystalSpire = (x: number, z: number, h: number) => {
    const cm: Mat = {
      p: P.GLASS,
      color: linear(st.dome),
      metal: 0,
      rough: 0.15,
      emit: o.night ? 1.6 : 0.3,
    };
    b.push(translation(x, ground, z));
    b.cylinder(3.4, 3, 8, mat(adobe[0]));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const hh = k === 0 ? h : h * (0.35 + r() * 0.3);
      b.push(
        chain(
          translation(
            k === 0 ? 0 : Math.cos(a) * 2,
            3,
            k === 0 ? 0 : Math.sin(a) * 2
          ),
          rotationZ(k === 0 ? 0 : (r() - 0.5) * 0.5)
        )
      );
      b.lathe(
        [
          [0, 0],
          [hh * 0.08, hh * 0.05],
          [hh * 0.08, hh * 0.82],
          [0, hh],
        ],
        6,
        cm
      );
      b.pop();
    }
    b.pop();
  };
  const monument = (
    kind: CityStyle['monument'],
    x: number,
    z: number,
    k: number
  ) => {
    const sm = mat(adobe[0]);
    b.push(translation(x, ground, z));
    switch (kind) {
      case 'dome': {
        const big = 16 * k;
        b.cylinder(big, big * 0.6, 24, sm);
        b.push(chain(translation(0, big * 0.6, 0), scaling(1, 1.1, 1)));
        b.sphere(big, 28, copper, true);
        b.pop();
        b.push(translation(0, big * 1.7, 0));
        b.cylinder(1.2, 4, 8, brass);
        b.pop();
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          minaret(dx * big * 1.15, dz * big * 0.9, big * 1.7, adobe[0]);
        break;
      }
      case 'ziggurat': {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const w = (44 - i * 6.5) * k;
          b.push(translation(0, i * 6 * k, 0));
          b.box(w, 6 * k, w, mat(adobe[i % adobe.length]));
          b.pop();
        }
        b.push(translation(0, n * 6 * k, 0));
        b.box(6 * k, 6 * k, 6 * k, mat(adobe[0]));
        b.push(translation(0, 6 * k, 0));
        b.lathe(
          [
            [4.5 * k, 0],
            [0, 7 * k],
          ],
          4,
          copper
        );
        b.pop();
        b.pop();
        // Grand escalier en façade.
        b.push(translation(0, 0, 22 * k));
        for (let i = 0; i < 12; i++) {
          b.push(translation(0, i * 3 * k, -i * 2.2 * k));
          b.box(8 * k, 3 * k, 3 * k, mat(adobe[1 % adobe.length]));
          b.pop();
        }
        b.pop();
        break;
      }
      case 'horloge':
        belfry(0, 0, 40 * k, adobe[0]);
        break;
      case 'forge': {
        // Haute halle de fonderie et engrenage géant dressé.
        b.push(translation(0, 0, 0));
        b.box(50 * k, 18 * k, 26 * k, mat('#4a3630'));
        b.pop();
        for (let i = 0; i < 4; i++) {
          b.push(translation((-18 + i * 12) * k, 18 * k, -6 * k));
          b.lathe(
            [
              [2.2 * k, 0],
              [1.6 * k, 26 * k],
              [2 * k, 27 * k],
              [0, 27 * k],
            ],
            10,
            mat('#3a2620')
          );
          b.pop();
        }
        const R = 20 * k;
        b.push(chain(translation(0, R + 2, 16 * k), rotationX(Math.PI / 2)));
        b.torus(R, R * 0.1, 40, 8, mat('#6a3a22', P.RUST, 0.8, 0.5));
        const teeth = 36;
        for (let i = 0; i < teeth; i++) {
          b.push(
            chain(
              rotationY((i / teeth) * Math.PI * 2),
              translation(R * 1.1, 0, 0)
            )
          );
          b.box(R * 0.16, R * 0.18, R * 0.1, mat('#6a3a22', P.RUST, 0.8, 0.5));
          b.pop();
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.tube(
            [
              [0, 0, 0],
              [Math.cos(a) * R, 0, Math.sin(a) * R],
            ],
            R * 0.05,
            6,
            iron
          );
        }
        b.cylinder(R * 0.16, R * 0.3, 14, brass);
        b.pop();
        // Bouches de four rougeoyantes.
        for (let i = 0; i < 5; i++) {
          b.push(translation((-20 + i * 10) * k, 2, 13.1 * k));
          b.box(4 * k, 5 * k, 0.2, {
            p: P.EMIT,
            color: linear('#ff6a1a'),
            metal: 0,
            rough: 1,
            emit: o.night ? 5 : 2,
          });
          b.pop();
        }
        break;
      }
      case 'cristal':
        crystalSpire(0, 0, 60 * k);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          crystalSpire(Math.cos(a) * 22 * k, Math.sin(a) * 22 * k, 22 * k);
        }
        break;
      case 'phare':
        lighthouse(0, 0, 48 * k);
        break;
      case 'colosse': {
        // Statue colossale d'un chasseur, lance dressée.
        const S = 1.6 * k;
        b.push(translation(0, 0, 0));
        b.box(16 * S, 6 * S, 16 * S, stone);
        b.push(translation(0, 6 * S, 0));
        b.lathe(
          [
            [0, 0],
            [4 * S, 0],
            [4.5 * S, 8 * S],
            [5.5 * S, 16 * S],
            [6 * S, 20 * S],
            [2 * S, 22 * S],
            [0, 22 * S],
          ],
          12,
          sm
        );
        b.push(translation(0, 24.5 * S, 0));
        b.sphere(2.8 * S, 14, sm);
        b.pop();
        b.tube(
          [
            [5.5 * S, 18 * S, 0],
            [8 * S, 12 * S, 2 * S],
            [9 * S, 8 * S, 3 * S],
          ],
          1.1 * S,
          8,
          sm
        );
        b.tube(
          [
            [-5.5 * S, 18 * S, 0],
            [-8 * S, 23 * S, 1 * S],
            [-8.5 * S, 27 * S, 1 * S],
          ],
          1.1 * S,
          8,
          sm
        );
        b.tube(
          [
            [-8.5 * S, -6 * S, 1 * S],
            [-8.5 * S, 40 * S, 1 * S],
          ],
          0.5 * S,
          6,
          brass
        );
        b.pop();
        b.pop();
        break;
      }
      case 'arene': {
        b.lathe(
          [
            [34 * k, 0],
            [34 * k, 16 * k],
            [30 * k, 16 * k],
            [22 * k, 3 * k],
            [0, 3 * k],
          ],
          32,
          sm
        );
        break;
      }
      case 'temple': {
        // Temple à colonnades sur terrasses plantées.
        b.box(60 * k, 4 * k, 40 * k, sm);
        b.push(translation(0, 4 * k, 0));
        b.box(44 * k, 4 * k, 28 * k, mat(adobe[1 % adobe.length]));
        b.push(translation(0, 4 * k, 0));
        for (let i = 0; i < 8; i++)
          for (const zz of [-11, 11]) {
            b.push(translation((-17.5 + i * 5) * k, 0, zz * k));
            b.cylinder(1.1 * k, 12 * k, 10, mat('#efe4cc'));
            b.pop();
          }
        b.push(translation(0, 12 * k, 0));
        b.box(42 * k, 2 * k, 26 * k, mat('#efe4cc'));
        b.push(chain(translation(0, 2 * k, 0), scaling(1, 0.55, 0.7)));
        b.sphere(16 * k, 24, copper, true);
        b.pop();
        b.pop();
        b.pop();
        b.pop();
        break;
      }
    }
    b.pop();
    // Une arène à côté de la statue de Kartoum.
    if (kind === 'colosse') monument('arene', x + 90, z - 30, k);
  };
  const tower = (x: number, z: number, h: number) => {
    const c = adobe[Math.floor(r() * adobe.length)];
    if (st.tower === 'minaret') minaret(x, z, h, c);
    else if (st.tower === 'beffroi') belfry(x, z, h * 0.9, c);
    else if (st.tower === 'cheminee') {
      b.push(translation(x, ground, z));
      b.lathe(
        [
          [2.6, 0],
          [2.2, h * 0.3],
          [1.6, h * 1.4],
          [1.9, h * 1.45],
          [1.9, h * 1.5],
          [0, h * 1.5],
        ],
        12,
        mat('#4a2e26')
      );
      b.pop();
    } else if (st.tower === 'phare') lighthouse(x, z, h * 0.8);
    else crystalSpire(x, z, h * 1.2);
  };
  const minaret = (x: number, z: number, h: number, c: string) => {
    b.push(translation(x, ground, z));
    b.cylinder(2.2, h, 12, mat(c));
    b.push(translation(0, h, 0));
    b.cylinder(3, 1, 12, mat(c));
    b.push(translation(0, 1, 0));
    b.cylinder(1.4, 3, 10, mat(c));
    b.push(translation(0, 3, 0));
    b.lathe(
      [
        [1.6, 0],
        [1.2, 1.5],
        [0.2, 3.5],
        [0, 4.5],
      ],
      10,
      copper
    );
    b.pop();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      b.push(translation(Math.cos(a) * 1.42, 1.5, Math.sin(a) * 1.42));
      b.box(0.5, 1.2, 0.5, win(true));
      b.pop();
    }
    b.pop();
    b.pop();
    b.pop();
  };
  const blocked = (x: number, z: number, rad: number) => {
    // Le navire, le quai et l'avant-plan de la caméra par défaut restent libres.
    if (
      Math.abs(x) < len / 2 + rad + 6 &&
      z > z0 - depth - 20 - rad &&
      z < 30 + rad
    )
      return true;
    // La ville défile le long de x quand le navire arrive ou repart : le
    // chenal du navire et le couloir de la caméra restent dégagés sur toute
    // la longueur (grand boulevard qui mène au port).
    if (Math.abs(z) < o.halfBeam + 8 + rad) return true;
    // Chenaux des autres navires et quais secondaires.
    for (const lane of LANES)
      if (Math.abs(z - lane) < o.halfBeam + 8 + rad) return true;
    for (const q of BERTHS)
      if (
        Math.abs(x - q.x) < len / 2 + rad + 6 &&
        z > q.z + z0 - depth - 8 - rad &&
        z < q.z + o.halfBeam + 6 + rad
      )
        return true;
    // Place du marché, devant le quai.
    if (Math.abs(x) < 150 + rad && z > 0 && z - rad < 150) return true;
    return false;
  };
  // Îlots alignés sur une trame de rues, plus serrés et plus hauts près du port.
  const R = o.capital ? 420 : 340;
  const step = 17;
  for (let gx = -R; gx <= R; gx += step)
    for (let gz = -R; gz <= R; gz += step) {
      const dist = Math.hypot(gx, gz);
      if (dist < 40 || dist > R) continue;
      if (r() > 0.78 - dist / (R * 2.2)) continue;
      const w = 8 + r() * 7;
      const d = 8 + r() * 7;
      const x = gx + (r() - 0.5) * 3;
      const z = gz + (r() - 0.5) * 3;
      if (blocked(x, z, Math.max(w, d) / 2)) continue;
      const h =
        4 +
        r() *
          (o.capital ? 20 : 13) *
          st.height *
          Math.max(0.25, 1.2 - dist / R);
      // Dans le couloir de la caméra, maisons basses : elle passe au-dessus.
      const low = z > 0 && z - Math.max(w, d) / 2 < 150;
      house(
        x,
        z,
        w,
        d,
        low ? Math.min(h, 6) : h,
        (r() - 0.5) * 0.06,
        dist < 190,
        low
      );
    }
  const towers = o.capital ? 9 : 5;
  for (let k = 0, placed = 0; k < 60 && placed < towers; k++) {
    const a = r() * Math.PI * 2;
    const dist = 80 + r() * 300;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    if (blocked(x, z, 4) || (z > 0 && z < 160)) continue;
    tower(x, z, 18 + r() * 16);
    placed++;
  }
  // Monument de la ville, visible derrière le quai.
  monument(st.monument, -20, -150, o.capital ? 1.6 : 1);
  // Place du marché devant le quai : étals, palmiers, fontaine.
  const palm = (x: number, z: number) => {
    const h = 7 + r() * 5;
    const lean = (r() - 0.5) * 0.5;
    const trunk: Vec3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      trunk.push([x + lean * h * t * t, ground + h * t, z]);
    }
    b.tube(trunk, 0.28, 6, mat('#7a5a3a', P.WOOD, 0.9));
    const crown = trunk[6];
    const leaf = mat('#5a7a34', P.SAIL, 0.85);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + r();
      const tip: Vec3 = [
        crown[0] + Math.cos(a) * 3.6,
        crown[1] - 1.6,
        crown[2] + Math.sin(a) * 3.6,
      ];
      const mid: Vec3 = [
        crown[0] + Math.cos(a) * 1.8,
        crown[1] + 0.5,
        crown[2] + Math.sin(a) * 1.8,
      ];
      b.tube([crown, mid, tip], 0.32, 4, leaf);
    }
  };
  // Dallage de la place et du boulevard du port.
  b.push(translation(0, ground - 0.02, 82));
  b.box(300, 0.12, 136, mat('#b8996f', P.ROCK, 0.95));
  b.pop();
  b.push(translation(0, ground - 0.02, o.halfBeam + 12));
  b.box(720, 0.1, 14, mat('#a88a64', P.ROCK, 0.95));
  b.pop();
  for (let k = 0; k < 40; k++) {
    const x = (r() - 0.5) * 300;
    const z = 25 + r() * 95;
    if (Math.abs(x) < len / 2 && z < 32) continue;
    if (r() < 0.25 + 0.3 * Math.min(1, st.palms)) palm(x, z);
    else {
      // Étal sous auvent.
      b.push(chain(translation(x, ground, z), rotationY(r() * 0.4 - 0.2)));
      b.box(3.2, 1.1, 1.6, mat('#7a5a36', P.WOOD, 0.85));
      for (const [dx, dz] of [
        [-1.5, -0.7],
        [1.5, -0.7],
        [-1.5, 0.7],
        [1.5, 0.7],
      ])
        b.tube(
          [
            [dx, 0, dz],
            [dx, 2.6, dz],
          ],
          0.06,
          4,
          plank
        );
      b.push(chain(translation(0, 2.6, 0), rotationZ(0.08)));
      b.box(
        3.6,
        0.08,
        2.2,
        mat(awning[Math.floor(r() * awning.length)], P.SAIL, 0.9)
      );
      b.pop();
      b.pop();
    }
  }
  b.push(translation(20, ground, 75));
  b.cylinder(4.5, 0.9, 20, stone);
  b.push(translation(0, 0.9, 0));
  b.cylinder(0.6, 2.2, 10, stone);
  b.push(translation(0, 2.2, 0));
  b.cylinder(1.8, 0.4, 14, brass);
  b.pop();
  b.pop();
  b.pop();
  // --- Les habitants : dockers, passants, marchands ------------------------------------
  const crowd: CrewMember[] = [];
  let seed = 100;
  const walk = (a: Vec3, to: Vec3) =>
    crowd.push({ role: 'walk', pos: a, to, yaw: 0, seed: seed++ });
  const qz = (k: number) => z0 - 3 - k * (depth - 6);
  // Sur le quai principal, en long.
  for (let k = 0; k < 6; k++) {
    const z = qz(r());
    const x1 = (r() - 0.5) * (len - 16);
    walk([x1, top, z], [x1 + (r() < 0.5 ? -1 : 1) * (10 + r() * 20), top, z]);
  }
  // Dockers au pied des grues.
  for (const fx of [-0.3, 0.28])
    crowd.push({
      role: 'haul',
      pos: [fx * o.length + 1.5, top, z0 - depth + 4.5],
      yaw: Math.PI,
      seed: seed++,
    });
  // Quais secondaires.
  for (const q of BERTHS)
    for (let k = 0; k < 3; k++) {
      const z = q.z + qz(r());
      const x1 = q.x + (r() - 0.5) * (len - 20);
      walk([x1, top, z], [x1 + (r() < 0.5 ? -1 : 1) * (8 + r() * 14), top, z]);
    }
  // Boulevard le long du port et place du marché.
  for (let k = 0; k < 7; k++) {
    const z = o.halfBeam + 10 + r() * 6;
    const x1 = (r() - 0.5) * 260;
    walk(
      [x1, ground, z],
      [x1 + (r() < 0.5 ? -1 : 1) * (25 + r() * 40), ground, z]
    );
  }
  for (let k = 0; k < 20; k++) {
    const a: Vec3 = [(r() - 0.5) * 260, ground, 30 + r() * 110];
    const t: Vec3 = [
      a[0] + (r() - 0.5) * 50,
      ground,
      Math.min(145, Math.max(28, a[2] + (r() - 0.5) * 40)),
    ];
    walk(a, t);
  }
  for (let k = 0; k < 5; k++)
    crowd.push({
      role: 'look',
      pos: [(r() - 0.5) * 240, ground, 30 + r() * 100],
      yaw: r() * 6.28,
      seed: seed++,
    });
  return { city: b.build(), moor: m.build(), crowd };
}

/**
 * Paysages croisés pendant un voyage, le long du cap (x de 0 à `length`) :
 * arches et éperons rocheux,
 * épaves ensablées, ruines de colonnades. Posés sur les dunes à l'affichage.
 */
export function journeyMesh(seed: string, length: number): MeshData {
  const b = new MeshBuilder();
  const r = rng(seed);
  const mat = (
    hex: string,
    p: number = P.PLAIN,
    rough = 0.9,
    metal = 0
  ): Mat => ({
    p,
    color: linear(hex),
    metal,
    rough,
  });
  const rock = mat('#8a5a3a', P.ROCK, 0.95);
  const stone = mat('#c8b08a', P.ROCK, 0.95);
  const wood = mat('#4a3424', P.WOOD, 0.9);

  const blob = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    k: number
  ) =>
    b.grid(
      14,
      9,
      (u, v) => {
        const a = u * Math.PI * 2;
        const ph = (v - 0.5) * Math.PI;
        const n =
          1 +
          0.22 * Math.sin(a * 3 + k) * Math.cos(ph * 2) +
          0.1 * Math.sin(a * 7 + ph * 5 + k);
        return [
          x + Math.cos(a) * Math.cos(ph) * sx * n,
          y + Math.sin(ph) * sy * n,
          z + Math.sin(a) * Math.cos(ph) * sz * n,
        ];
      },
      rock,
      { flip: true }
    );
  // Grands éléments du paysage.
  for (let x = 80 + r() * 60; x < length - 80; x += 70 + r() * 90) {
    const side = r() < 0.5 ? -1 : 1;
    // Hors du couloir de la caméra (côté +z, entre le navire et l'objectif).
    const z = side > 0 ? 175 + r() * 110 : -(55 + r() * 180);
    const kind = r();
    if (kind < 0.3) {
      // Éperon ou arche de grès.
      const h = 14 + r() * 26;
      if (r() < 0.45) {
        const w = 14 + r() * 12;
        blob(x - w / 2, h * 0.45, z, 4, h * 0.55, 4.5, x);
        blob(x + w / 2, h * 0.45, z, 4, h * 0.55, 4.5, x + 1);
        blob(x, h * 0.95, z, w * 0.62, 3.2, 4, x + 2);
      } else blob(x, h * 0.35, z, 6 + r() * 8, h * 0.6, 6 + r() * 6, x);
    } else if (kind < 0.55) {
      // Épave d'un vieux glisseur, à moitié ensablée et couchée sur le flanc.
      const len = 18 + r() * 16;
      b.push(
        chain(
          translation(x, -1.2, z),
          rotationY(r() * Math.PI),
          rotationZ(0.35 + r() * 0.3)
        )
      );
      b.grid(
        16,
        8,
        (u, v) => {
          const xx = (u - 0.5) * len;
          const hb =
            3.2 * Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.02)) ** 0.6;
          const a = (v - 0.5) * Math.PI;
          return [xx, Math.sin(a) * 2.6 * (hb / 3.2), Math.cos(a) * hb];
        },
        wood,
        { flip: true }
      );
      // Membrures nues qui dépassent.
      for (let k = 0; k < 6; k++) {
        const xx = (k / 5 - 0.5) * len * 0.7;
        b.tube(
          [
            [xx, 0, 3],
            [xx, 3.5, 3.6],
            [xx, 5, 2.2],
          ],
          0.18,
          5,
          wood
        );
      }
      b.tube(
        [
          [len * 0.1, 0, 0],
          [len * 0.1 + 3, 11, 1],
        ],
        0.3,
        6,
        wood
      );
      b.pop();
    } else if (kind < 0.8) {
      // Ruines : colonnade, colonnes tombées, pans de mur.
      const n = 3 + Math.floor(r() * 4);
      b.push(chain(translation(x, -1.5, z), rotationY(r() * 0.6)));
      for (let k = 0; k < n; k++) {
        const h = r() < 0.3 ? 2 + r() * 3 : 8 + r() * 4;
        b.push(translation(k * 5 - n * 2.5, 0, 0));
        b.cylinder(0.9, h, 10, stone);
        if (h > 7) {
          b.push(translation(0, h, 0));
          b.box(2.4, 0.8, 2.4, stone);
          b.pop();
        }
        b.pop();
      }
      if (r() < 0.6) {
        b.push(
          chain(
            translation(n * 2.5 + 4, 0.8, 4),
            rotationZ(Math.PI / 2),
            rotationY(0.4)
          )
        );
        b.cylinder(0.85, 9, 10, stone);
        b.pop();
      }
      b.push(translation(-4, 0, -6));
      b.box(10, 4 + r() * 4, 1.4, stone);
      b.pop();
      b.pop();
    } else {
      // Champ de rochers.
      for (let k = 0; k < 5; k++)
        blob(
          x + (r() - 0.5) * 30,
          0,
          z + (r() - 0.5) * 30,
          2 + r() * 4,
          1.5 + r() * 2.5,
          2 + r() * 4,
          x + k
        );
    }
  }
  return b.build();
}

/** Interpolation entre deux éclairages (transition d'un secteur à l'autre). */
export function lerpLighting(a: Lighting, b: Lighting, t: number): Lighting {
  const out = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Lighting)[]) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'number' && typeof y === 'number')
      out[k] = x + (y - x) * t;
    else if (Array.isArray(x) && Array.isArray(y))
      out[k] = x.map((v, i) => v + ((y as number[])[i] - v) * t);
  }
  return out as unknown as Lighting;
}

/** Tempête de sable de transition : brouillard épais, ciel voilé couleur de sable. */
export function veil(l: Lighting, amount: number): Lighting {
  if (amount <= 0) return l;
  const dust: Vec3 = [
    l.sandB[0] * 1.6 + l.horizon[0] * 0.4,
    l.sandB[1] * 1.6 + l.horizon[1] * 0.4,
    l.sandB[2] * 1.6 + l.horizon[2] * 0.4,
  ];
  const mix = (v: Vec3, t: number): Vec3 => [
    v[0] + (dust[0] - v[0]) * t,
    v[1] + (dust[1] - v[1]) * t,
    v[2] + (dust[2] - v[2]) * t,
  ];
  return {
    ...l,
    fog: mix(l.fog, amount),
    fogDensity: l.fogDensity + amount * 0.0095,
    zenith: mix(l.zenith, amount * 0.85),
    skyMid: mix(l.skyMid, amount * 0.9),
    horizon: mix(l.horizon, amount),
    sunColor: [
      l.sunColor[0] * (1 - amount * 0.6),
      l.sunColor[1] * (1 - amount * 0.6),
      l.sunColor[2] * (1 - amount * 0.6),
    ],
  };
}
