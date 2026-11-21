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
import { hangarDims, hangarMesh, type HangarData } from './hangar';
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
  /** L'équipage possède son hangar ici : nef fermée au lieu du quai principal. */
  hangar?: boolean;
  /** Hauteur du haut de la mâture du navire amarré (m). */
  shipTop?: number;
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
  /** Plan de la ville et type de bâtiments. */
  layout:
    | 'trame'
    | 'colline'
    | 'remparts'
    | 'pilotis'
    | 'huttes'
    | 'monolithes'
    | 'cratere'
    | 'industriel'
    | 'jardins';
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
    layout: 'colline',
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
    layout: 'monolithes',
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
    layout: 'trame',
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
    layout: 'remparts',
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
    layout: 'pilotis',
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
    layout: 'huttes',
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
    layout: 'cratere',
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
    layout: 'industriel',
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
    layout: 'jardins',
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

const smoothstep01 = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

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
  /** Nef du hangar de l'équipage (bâtiment, verrières, portes, amarres). */
  hangar: HangarData | null;
} {
  const b = new MeshBuilder();
  // Amarres et passerelle à part : affichées seulement une fois le navire à quai.
  const m = new MeshBuilder();
  const r = rng(o.id);
  const top = o.hover + DOCK_TOP;
  const st = styleOf(o.id);
  const HG = !!o.hangar;
  const shipTop = o.shipTop ?? o.hover + 28;
  const hd = hangarDims({ length: o.length, shipTop });
  const adobe = st.walls;
  const mat = (
    hex: string,
    p: number = P.PLASTER,
    rough = 0.9,
    metal = 0
  ): Mat => ({
    p,
    color: linear(hex),
    metal,
    rough,
  });
  const stone = mat('#8e7a64', P.ROCK, 0.95);
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
  // Un quai : tablier sur arches, bornes, grues, caisses, réverbères, entrepôt.
  // `xc`, `zs` : centre du navire amarré ; le quai est côté -z.
  // Port aérien : viaduc à deux étages d'arches qui porte le quai à hauteur
  // des ponts, tours d'amarrage à coupole et fanal d'Aether aux deux bouts
  // (avec leur bras d'amarrage), galerie couverte à colonnade, grand
  // escalier vers la ville, mâts à pavillons et guirlandes de lanternes.
  const back = 20; // au-delà du bord du quai : galerie puis escalier
  const wallT = linear(st.walls[0]);
  const stonePat = st.layout === 'industriel' ? P.BRICK : P.PLASTER;
  const masonry: Mat = {
    p: stonePat,
    color: [wallT[0] * 0.86, wallT[1] * 0.82, wallT[2] * 0.78],
    metal: 0,
    rough: 0.95,
  };
  const dressed: Mat = {
    p: stonePat,
    color: [
      Math.min(1, wallT[0] * 1.08),
      Math.min(1, wallT[1] * 1.05),
      Math.min(1, wallT[2]) * 1.0,
    ],
    metal: 0,
    rough: 0.9,
  };
  const vault: Mat = {
    p: stonePat,
    color: [wallT[0] * 0.45, wallT[1] * 0.42, wallT[2] * 0.4],
    metal: 0,
    rough: 1,
  };
  const paving: Mat = {
    p: P.ROCK,
    color: linear('#9a8a74'),
    metal: 0,
    rough: 0.95,
  };
  const beacon: Mat = {
    p: P.EMIT,
    color: linear('#7ff3ff'),
    metal: 0,
    rough: 1,
    emit: o.night ? 4 : 1.2,
  };
  const GROUND = -1.5;

  /** Mur à arche (face avant en z, épaisseur vers -z) : écoinçons et voûte. */
  const arch = (
    x0: number,
    hw: number,
    ys: number,
    rad: number,
    ytop: number,
    z: number,
    thick: number
  ) => {
    const edge = (a: number): Vec3 => {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const t = Math.min(
        Math.abs(dx) > 1e-4 ? hw / Math.abs(dx) : 1e9,
        dy > 1e-4 ? (ytop - ys) / dy : 1e9
      );
      return [x0 + dx * t, ys + dy * t, 0];
    };
    for (const [zz, flip] of [
      [z, false],
      [z - thick, true],
    ] as const)
      b.grid(
        16,
        1,
        (u, v) => {
          const a = Math.PI * (1 - u);
          const c: Vec3 = [x0 + Math.cos(a) * rad, ys + Math.sin(a) * rad, zz];
          const e = edge(a);
          return [c[0] + (e[0] - c[0]) * v, c[1] + (e[1] - c[1]) * v, zz];
        },
        dressed,
        { flip }
      );
    // Intrados de la voûte.
    b.grid(
      16,
      2,
      (u, v) => {
        const a = Math.PI * u;
        return [x0 + Math.cos(a) * rad, ys + Math.sin(a) * rad, z - v * thick];
      },
      vault,
      {}
    );
    // Claveau central saillant.
    b.push(translation(x0, ys + rad - 0.2, z + 0.12));
    b.box(0.9, 1.1, 0.3, masonry);
    b.pop();
  };

  const quay = (xc: number, zs: number, main: boolean) => {
    b.push(translation(xc, 0, zs));
    const zf = z0;
    const D = 22;
    const zb = zf - D;
    const zm = zf - D / 2;
    const L2 = len / 2;
    // --- Viaduc : grandes arches sur toute la profondeur ---
    const W = 10;
    const nb = Math.max(4, Math.round(len / W));
    const bw = len / nb;
    const rad = bw / 2 - 1.3;
    const ys = 1.6;
    const yBand = ys + rad + 0.6;
    for (let k = 0; k < nb; k++) {
      const x0 = -L2 + (k + 0.5) * bw;
      arch(x0, bw / 2, ys, rad, yBand, zf, D);
    }
    for (let k = 0; k <= nb; k++) {
      const x = -L2 + k * bw;
      // Piles avec leur avant-bec en éperon côté navire.
      b.push(translation(x, GROUND, zm));
      b.box(2.6, ys - GROUND, D, masonry);
      b.pop();
      b.push(translation(x, GROUND, zf + 0.6));
      b.box(2.9, ys - GROUND + 0.6, 1.2, dressed);
      b.pop();
    }
    // Remplissage au-dessus des voûtes, bandeau, arcature haute, corniche.
    b.push(translation(0, yBand, zm));
    b.box(len, top - 0.6 - yBand, D, masonry);
    b.pop();
    b.push(translation(0, yBand - 0.2, zf + 0.1));
    b.box(len + 0.4, 0.5, 0.5, dressed);
    b.pop();
    const ua = Math.max(6, Math.round(len / 2.6));
    for (let k = 0; k < ua; k++) {
      const x = -L2 + (k + 0.5) * (len / ua);
      b.push(translation(x, yBand + 0.5, zf + 0.04));
      b.box(1.1, top - 2.4 - yBand, 0.08, vault);
      b.push(
        chain(translation(0, top - 2.4 - yBand, 0), scaling(0.55, 0.45, 0.04))
      );
      b.sphere(1, 8, vault, true);
      b.pop();
      b.pop();
      b.push(translation(x + len / ua / 2, yBand + 0.3, zf + 0.12));
      b.cylinder(0.18, top - 2.1 - yBand, 8, dressed);
      b.pop();
    }
    b.push(translation(0, top - 1.2, zf + 0.35));
    b.box(len + 0.8, 0.35, 0.9, dressed);
    b.pop();
    b.push(translation(0, top - 0.85, zf + 0.25));
    b.box(len + 0.6, 0.45, 0.7, masonry);
    b.pop();
    // Tablier dallé et défense de bois côté navire.
    b.push(translation(0, top - 0.4, zm));
    b.box(len, 0.4, D, paving);
    b.pop();
    b.push(translation(0, top - 2.6, zf + 1.05));
    b.box(len - 6, 0.9, 0.5, plank);
    b.pop();
    // Balustrade sur les côtés et le fond (le bord du navire reste libre).
    const balusters = (a: Vec3, c: Vec3) => {
      const n = Math.max(
        2,
        Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 0.7)
      );
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        b.push(
          translation(a[0] + (c[0] - a[0]) * t, top, a[2] + (c[2] - a[2]) * t)
        );
        b.lathe(
          [
            [0.16, 0],
            [0.09, 0.2],
            [0.15, 0.5],
            [0.08, 0.85],
            [0.14, 0.95],
          ],
          6,
          dressed
        );
        b.pop();
      }
      b.push(
        chain(
          translation((a[0] + c[0]) / 2, top + 0.95, (a[2] + c[2]) / 2),
          rotationY(-Math.atan2(c[2] - a[2], c[0] - a[0]))
        )
      );
      b.box(Math.hypot(c[0] - a[0], c[2] - a[2]), 0.16, 0.36, dressed);
      b.pop();
    };
    balusters([-L2 + 0.3, 0, zf - 1], [-L2 + 0.3, 0, zb + 0.3]);
    balusters([L2 - 0.3, 0, zf - 1], [L2 - 0.3, 0, zb + 0.3]);
    balusters([-L2 + 0.3, 0, zb + 0.3], [-7, 0, zb + 0.3]);
    balusters([7, 0, zb + 0.3], [L2 - 0.3, 0, zb + 0.3]);

    // --- Galerie couverte : colonnade et voûte de cuivre ---
    const gz = zb + 5;
    const gl = len - 18;
    for (const cz of [zb + 1.6, zb + 8.4])
      for (let x = -gl / 2; x <= gl / 2 + 0.01; x += 4.5) {
        b.push(translation(x, top, cz));
        b.lathe(
          [
            [0.55, 0],
            [0.55, 0.35],
            [0.36, 0.5],
            [0.32, 5],
            [0.5, 5.3],
            [0.62, 5.6],
            [0, 5.6],
          ],
          10,
          dressed
        );
        b.pop();
      }
    b.push(translation(0, top + 5.6, gz));
    b.box(gl + 1.6, 0.6, 8.6, dressed);
    b.pop();
    // Voûte en berceau au-dessus de l'entablement.
    b.grid(
      14,
      14,
      (u, v) => {
        const a = Math.PI * v;
        return [
          -gl / 2 - 0.8 + u * (gl + 1.6),
          top + 6.2 + Math.sin(a) * 4.3,
          gz + Math.cos(a) * 4.3,
        ];
      },
      copper,
      {}
    );
    // Lanternes suspendues sous la galerie.
    for (let x = -gl / 2 + 2.25; x < gl / 2; x += 9) {
      b.tube(
        [
          [x, top + 5.6, gz],
          [x, top + 4.4, gz],
        ],
        0.03,
        3,
        iron
      );
      b.push(translation(x, top + 3.8, gz));
      b.cylinder(0.3, 0.6, 8, lit);
      b.pop();
    }
    // Mur du fond de la galerie : portes et fenêtres (boutiques, bureaux du port).
    b.push(translation(0, top, zb + 0.5));
    b.box(gl, 5.4, 0.5, masonry);
    b.pop();

    // --- Grand escalier vers la ville, entre deux murs d'échiffre ---
    const steps = Math.ceil((top - GROUND) / 0.4);
    for (let k = 0; k < steps; k++) {
      const y = top - 0.4 - k * 0.4;
      b.push(translation(0, GROUND, zb - 0.3 - k * 0.5));
      b.box(12, y - GROUND, 0.52, k % 2 ? masonry : dressed);
      b.pop();
    }
    for (const sx of [-1, 1]) {
      b.grid(
        1,
        1,
        (u, v) => [
          sx * 6.6,
          GROUND + v * (top + 1 - GROUND - u * (top - GROUND)),
          zb - u * steps * 0.5,
        ],
        masonry,
        { flip: sx < 0 }
      );
      b.push(translation(sx * 6.6, GROUND, zb - steps * 0.5 - 0.5));
      b.box(1.2, 2.2, 1.2, dressed);
      b.pop();
      b.push(translation(sx * 6.6, GROUND + 2.2, zb - steps * 0.5 - 0.5));
      b.cylinder(0.25, 2.6, 6, iron);
      b.push(translation(0, 2.6, 0));
      b.cylinder(0.35, 0.7, 8, lit);
      b.pop();
      b.pop();
    }

    // --- Tours d'amarrage aux deux bouts ---
    for (const sx of [-1, 1]) {
      const tx = sx * (L2 + 6);
      const tz = zf - 6;
      // Bastion rond qui prolonge le quai.
      b.push(translation(tx, GROUND, tz));
      b.lathe(
        [
          [8.6, 0],
          [7.6, top - GROUND - 1.4],
          [8.2, top - GROUND - 1],
          [8.2, top - GROUND - 0.4],
          [0, top - GROUND - 0.4],
        ],
        28,
        masonry
      );
      b.pop();
      // Pont qui relie le bastion au quai.
      b.push(translation(sx * (L2 + 1), top - 1.6, tz));
      b.box(4.2, 1.6, 10, masonry);
      b.pop();
      const TH = 24;
      b.push(translation(tx, top - 0.4, tz));
      b.lathe(
        [
          [4.2, 0],
          [4.2, 1.2],
          [3.6, 1.6],
          [3.3, TH * 0.55],
          [3.9, TH * 0.6],
          [3.9, TH * 0.64],
          [3.2, TH * 0.66],
          [3.0, TH * 0.9],
          [3.6, TH * 0.92],
          [3.6, TH * 0.95],
          [0, TH * 0.95],
        ],
        24,
        dressed
      );
      // Balcon circulaire et garde-corps.
      b.push(translation(0, TH * 0.64, 0));
      b.torus(4.4, 0.08, 28, 4, iron);
      b.pop();
      b.push(translation(0, TH * 0.64 - 0.9, 0));
      b.torus(4.4, 0.06, 28, 4, iron);
      b.pop();
      // Fenêtres en spirale (escalier intérieur).
      for (let k = 0; k < 10; k++) {
        const a = k * 1.1;
        const y = 2.5 + k * (TH * 0.5) * 0.1;
        b.push(
          chain(
            translation(Math.cos(a) * 3.42, y, Math.sin(a) * 3.42),
            rotationY(-a + Math.PI / 2)
          )
        );
        b.box(0.7, 1.3, 0.14, win(true));
        b.pop();
      }
      // Lanterne du fanal : colonnettes, vitrage d'Aether, coupole et flèche.
      b.push(translation(0, TH * 0.95, 0));
      b.cylinder(2.2, 2.6, 12, beacon);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.push(translation(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35));
        b.cylinder(0.12, 2.6, 5, brass);
        b.pop();
      }
      b.push(translation(0, 2.6, 0));
      b.lathe(
        [
          [2.9, 0],
          [2.6, 0.6],
          [1.7, 2],
          [0.5, 3.2],
          [0.2, 3.6],
          [0.12, 6],
          [0, 6.2],
        ],
        18,
        copper
      );
      b.pop();
      b.pop();
      // Bras d'amarrage : potence de fer au-dessus du navire.
      const arm: Vec3[] = [
        [0, TH * 0.6, 0],
        [-sx * 3, TH * 0.6 + 0.8, 6],
        [-sx * 6, TH * 0.6 + 0.6, 12],
      ];
      b.tube(arm, 0.35, 8, iron);
      b.tube([[0, TH * 0.4, 0], [-sx * 2, TH * 0.5, 4], arm[2]], 0.2, 6, iron);
      b.pop();
      if (main) {
        const tip: Vec3 = [tx - sx * 6, top - 0.4 + TH * 0.6 + 0.6, tz + 12];
        const ship: Vec3 = [sx * o.length * 0.42, top + 2.2, -o.halfBeam * 0.5];
        m.tube(
          [
            tip,
            [
              (tip[0] + ship[0]) / 2,
              (tip[1] + ship[1]) / 2 - 1.2,
              (tip[2] + ship[2]) / 2,
            ],
            ship,
          ],
          0.07,
          4,
          rope
        );
      }
      // Pavillon au sommet.
      const fc = awning[0];
      b.push(translation(tx, top - 0.4 + TH * 0.95 + 8.6, tz));
      b.cylinder(0.06, 4, 4, iron);
      b.push(translation(0, 3.9, 0));
      b.grid(
        10,
        4,
        (u, v) => [-u * 4, -v * 2, 0],
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

    // --- Mâts à pavillons et guirlandes de lanternes le long du bord ---
    const poles: Vec3[] = [];
    for (let x = -L2 + 8; x <= L2 - 8; x += 16)
      poles.push([x, top + 7.5, zf - 0.8]);
    poles.forEach((pt, k) => {
      b.push(translation(pt[0], top, pt[2]));
      b.cylinder(0.12, 7.5, 6, brass);
      b.push(translation(0, 7.4, 0));
      const c = awning[k % awning.length];
      b.grid(
        8,
        5,
        (u, v) => [0, -v * 3.4, -u * 1.4],
        (u) => ({
          p: P.SAIL,
          color: linear(c),
          metal: 0,
          rough: 0.85,
          emit: 1 + u * 0.8,
        }),
        {}
      );
      b.pop();
      b.pop();
      const nx = poles[k + 1];
      if (!nx) return;
      const sag: Vec3[] = [];
      for (let t = 0; t <= 1.0001; t += 0.125) {
        sag.push([
          pt[0] + (nx[0] - pt[0]) * t,
          top + 6 - Math.sin(Math.PI * t) * 1.6,
          pt[2],
        ]);
      }
      b.tube(sag, 0.025, 3, dark);
      for (let q = 1; q < sag.length - 1; q++) {
        b.push(translation(sag[q][0], sag[q][1] - 0.25, sag[q][2]));
        b.sphere(0.18, 6, lit);
        b.pop();
      }
    });

    // --- Bornes, cordages, passerelle ---
    const bollards: Vec3[] = [];
    for (const fx of [-0.36, -0.12, 0.12, 0.36]) {
      const x = fx * o.length;
      b.push(translation(x, top, zf - 1.6));
      b.lathe(
        [
          [0, 0],
          [0.34, 0],
          [0.26, 0.5],
          [0.4, 0.7],
          [0, 0.76],
        ],
        10,
        iron
      );
      b.pop();
      bollards.push([x, top + 0.55, zf - 1.6]);
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
      m.push(translation(-o.length * 0.05, top + 0.25, zf + 0.4));
      m.box(3, 0.15, 2.6, plank);
      m.pop();
      for (const dx of [-1.4, 1.4])
        m.tube(
          [
            [-o.length * 0.05 + dx, top + 1.2, zf - 0.9],
            [-o.length * 0.05 + dx, top + 1.3, zf + 1.7],
          ],
          0.05,
          4,
          brass
        );
    }
    // --- Grues et cargaison rangée ---
    for (const fx of [-0.24, 0.24]) {
      const x = fx * len;
      const zz = zf - 5.5;
      b.push(translation(x, top, zz));
      b.box(2.4, 0.8, 2.4, masonry);
      b.cylinder(0.45, 14, 8, iron);
      b.push(translation(0, 13.4, 0));
      b.cylinder(0.9, 1.2, 10, brass);
      b.pop();
      b.pop();
      const tip: Vec3 = [x + (fx < 0 ? 3 : -3), top + 15.6, zf + 1.5];
      b.tube([[x, top + 14.6, zz], tip], 0.3, 6, iron);
      b.tube(
        [
          [x, top + 14.2, zz],
          [x - (tip[0] - x) * 0.3, top + 14.4, zz - 3],
        ],
        0.24,
        6,
        iron
      );
      b.tube([tip, [tip[0], top + 6, tip[2]]], 0.04, 4, rope);
      b.push(translation(tip[0], top + 4.6, tip[2]));
      b.box(1.6, 1.4, 1.6, mat('#7a5a36', P.WOOD, 0.8));
      b.pop();
      for (let k = 0; k < 3; k++)
        for (let l = 0; l < (k === 0 ? 2 : 1); l++) {
          b.push(
            translation(
              x + (fx < 0 ? 3 : -3) + k * 1.5 * (fx < 0 ? 1 : -1),
              top + l * 1.1,
              zz - 2.5
            )
          );
          b.box(1.4, 1.1, 1.4, mat('#8a6a42', P.WOOD, 0.85));
          b.pop();
        }
      for (let k = 0; k < 4; k++) {
        b.push(translation(x + (fx < 0 ? -2.6 : 2.6), top, zz - 1 - k * 1.1));
        b.cylinder(0.48, 1.1, 10, mat('#6a4a2a', P.WOOD, 0.8));
        b.pop();
      }
    }
    b.pop();
  };
  const rope = mat('#8a7458', P.PLAIN, 1);
  // --- Hangars : halles voûtées de fer et de verre ------------------------------------
  const glassM: Mat = {
    p: P.GLASS,
    color: linear('#9fb8c0'),
    metal: 0.3,
    rough: 0.15,
  };
  const ironH = mat('#3a3632', P.IRON, 0.55, 0.7);
  /**
   * Coque de voûte en berceau le long de x, centrée en (cx, cz) : `half`
   * borne la voûte (-1 : moitié -z, 1 : moitié +z, 0 : berceau complet).
   * `clad` : verrière posée (sinon, simple ossature à toit escamoté).
   */
  const hallVault = (
    cx: number,
    cz: number,
    L: number,
    R: number,
    yW: number,
    H: number,
    half: -1 | 0 | 1,
    clad: boolean,
    zIn = 0
  ) => {
    // Profil (z, y) : demi-ellipse de rayon R (z) et H (y) au-dessus de yW ;
    // pour une demi-voûte, de la paroi extérieure jusqu'au bord intérieur zIn.
    const prof = (u: number): [number, number] => {
      if (half === 0) {
        const t = Math.PI * (1 - u);
        return [cz + Math.cos(t) * R, yW + Math.sin(t) * H];
      }
      // Demi-voûte : départ vertical sur la paroi (±R), arrivée à
      // l'horizontale au bord intérieur (±zIn).
      const t = (u * Math.PI) / 2;
      return [
        cz + half * (R - (R - zIn) * (1 - Math.cos(t))),
        yW + Math.sin(t) * H,
      ];
    };
    const ribs = Math.max(3, Math.round(L / 9));
    for (let k = 0; k <= ribs; k++) {
      const x = cx - L / 2 + (L * k) / ribs;
      const pts: Vec3[] = [];
      const inner: Vec3[] = [];
      for (let i = 0; i <= 16; i++) {
        const [z, y] = prof(i / 16);
        pts.push([x, y, z]);
        inner.push([x, y - 1.1, z + (cz - z) * 0.04]);
      }
      // Arc en treillis : deux membrures et des montants en zigzag.
      b.tube(pts, 0.32, 6, ironH);
      b.tube(inner, 0.22, 6, ironH);
      for (let i = 0; i < 16; i++) {
        const a = pts[i];
        const c = inner[i + 1];
        b.tube([a, c], 0.1, 4, ironH);
      }
    }
    // Pannes le long de la halle.
    for (let i = 1; i < 8; i++) {
      const [z, y] = prof(i / 8);
      b.tube(
        [
          [cx - L / 2, y + 0.1, z],
          [cx + L / 2, y + 0.1, z],
        ],
        0.12,
        5,
        ironH
      );
    }
    if (clad)
      b.grid(
        ribs * 2,
        12,
        (u, v) => {
          const [z, y] = prof(v);
          return [cx - L / 2 + L * u, y - 0.05, z];
        },
        glassM,
        { uv: (u, v) => [u * L * 0.25, v * 6], flip: half === 1 }
      );
    return prof;
  };
  /** Pignon plein (mur maçonné) qui ferme une voûte complète, porte au centre. */
  const gable = (
    x: number,
    cz: number,
    R: number,
    yW: number,
    H: number,
    dir: number
  ) => {
    b.grid(
      20,
      2,
      (u, v) => {
        const t = Math.PI * u;
        return [x, yW + Math.sin(t) * H * v, cz + Math.cos(t) * R];
      },
      masonry,
      { uv: (u, v) => [u * R * 2, v * H], flip: dir > 0 }
    );
    // Rosace vitrée et porte monumentale.
    b.push(
      chain(
        translation(x + dir * 0.15, yW + H * 0.55, cz),
        rotationZ(Math.PI / 2)
      )
    );
    b.cylinder(H * 0.22, 0.2, 20, glassM);
    b.torus(H * 0.22, 0.25, 20, 5, brass);
    b.pop();
    b.push(translation(x + dir * 0.2, ground, cz));
    b.box(0.4, yW + H * 0.25, R * 0.9, mat('#3a2a1c', P.WOOD, 0.85));
    b.pop();
    for (const sz of [-1, 1]) {
      b.push(translation(x + dir * 0.35, ground, cz + sz * R * 0.47));
      b.box(0.6, yW + H * 0.3, 0.8, brass);
      b.pop();
    }
  };
  /** Hangar fermé d'une ville (navires d'armateurs), le long de x. */
  const closedHangar = (cx: number, cz: number, L: number, W: number) => {
    const R = W / 2;
    const yW = 7;
    const H = R * 0.9;
    // Murs gouttereaux à contreforts, bandeau de fenêtres hautes.
    for (const sz of [-1, 1]) {
      b.push(translation(cx, ground, cz + sz * (R - 0.6)));
      b.box(L, yW + 0.4, 1.2, masonry);
      b.pop();
      for (let k = 0; k <= 6; k++) {
        const x = cx - L / 2 + (L * k) / 6;
        b.push(translation(x, ground, cz + sz * (R + 0.4)));
        b.box(1.6, yW + 1, 1.6, dressed);
        b.pop();
        if (k < 6) {
          b.push(
            translation(x + L / 12, ground + yW - 3.2, cz + sz * (R + 0.02))
          );
          b.box(L / 6 - 3, 2, 0.1, win(o.night));
          b.pop();
        }
      }
    }
    hallVault(cx, cz, L, R, ground + yW, H, 0, true);
    gable(cx - L / 2, cz, R, ground + yW, H, -1);
    gable(cx + L / 2, cz, R, ground + yW, H, 1);
    // Lanterneau de faîte.
    b.push(translation(cx, ground + yW + H, cz));
    b.box(L * 0.9, 1.2, 3, ironH);
    b.pop();
  };
  for (const q of BERTHS) quay(q.x, q.z, false);

  // --- La ville ---------------------------------------------------------------------
  const ground = -1;
  // Hangar de l'équipage (nef fermée, voir hangar.ts) au lieu du quai principal.
  const hangar = HG
    ? hangarMesh({
        length: o.length,
        halfBeam: o.halfBeam,
        hover: o.hover,
        shipTop: shipTop,
        night: o.night,
        brick: (() => {
          const c = linear(st.walls[0]);
          return [c[0] * 0.78, c[1] * 0.6, c[2] * 0.5] as Vec3;
        })(),
        seed: o.id,
      })
    : null;
  if (!hangar) quay(0, 0, true);
  const wood = mat('#5a3e28', P.WOOD, 0.85);
  const iron2 = mat('#3a3430', P.IRON, 0.6, 0.6);
  // Emprises au sol déjà bâties (x, z, rayon) : rien ne se chevauche.
  const occ: [number, number, number][] = [];
  const house = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    ry: number,
    near: boolean,
    low = false,
    y0 = ground
  ) => {
    occ.push([x, z, Math.max(w, d) * 0.45]);
    const c = adobe[Math.floor(r() * adobe.length)];
    const wc = linear(c);
    const tone = (k: number): Mat => ({
      p: P.PLASTER,
      color: [
        Math.min(1, wc[0] * k),
        Math.min(1, wc[1] * k),
        Math.min(1, wc[2] * k),
      ],
      metal: 0,
      rough: 0.9,
    });
    const trim = tone(1.25);
    b.push(chain(translation(x, y0, z), rotationY(ry)));
    b.box(w, h, d, mat(c));
    // Soubassement plus sombre.
    b.box(w + 0.16, 0.9, d + 0.16, tone(0.72));
    /** Boîte posée sur une face : `along` le long du mur, `out` en avant. */
    const onFace = (
      nx: number,
      nz: number,
      along: number,
      y: number,
      out: number,
      sw: number,
      sh: number,
      sd: number,
      m: Mat
    ) => {
      b.push(
        translation(
          nx !== 0 ? nx * (w / 2 + out) : along,
          y,
          nz !== 0 ? nz * (d / 2 + out) : along
        )
      );
      b.box(nx !== 0 ? sd : sw, sh, nx !== 0 ? sw : sd, m);
      b.pop();
    };
    const shutter = mat(awning[Math.floor(r() * awning.length)], P.WOOD, 0.8);
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
    b.box(1.4, 2.4, 0.12, near ? mat('#5a3e28', P.WOOD, 0.8) : dark);
    if (near) {
      b.push(translation(0, 0, 0.05));
      b.box(1.9, 0.3, 0.16, trim);
      b.pop();
      b.push(translation(0, 2.9, 0.05));
      b.box(2.1, 0.35, 0.18, trim);
      b.pop();
    }
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
          const along = t * span;
          const roll = r();
          if (f >= 1 && roll < 0.1) {
            // Moucharabieh : loggia de bois ajouré en encorbellement.
            onFace(nx, nz, along, y - 0.4, 0.5, 1.7, 2.1, 1.0, wood);
            for (let k = -2; k <= 2; k++)
              onFace(
                nx,
                nz,
                along + k * 0.3,
                y - 0.1,
                1.02,
                0.08,
                1.5,
                0.06,
                dark
              );
            onFace(nx, nz, along, y + 1.7, 0.55, 2, 0.15, 1.2, wood);
            onFace(nx, nz, along, y - 0.55, 0.45, 1.5, 0.15, 0.9, wood);
            continue;
          }
          // Fenêtre en retrait : vitre, linteau, appui et piédroits en saillie.
          onFace(nx, nz, along, y, 0.02, 0.9, 1.3, 0.06, win(o.night));
          onFace(nx, nz, along, y + 1.3, 0.08, 1.35, 0.22, 0.2, trim);
          onFace(nx, nz, along, y - 0.16, 0.1, 1.25, 0.16, 0.26, trim);
          for (const s2 of [-1, 1])
            onFace(nx, nz, along + s2 * 0.54, y, 0.07, 0.18, 1.3, 0.14, trim);
          if (roll < 0.4)
            for (const s2 of [-1, 1])
              onFace(
                nx,
                nz,
                along + s2 * 1.0,
                y,
                0.1,
                0.48,
                1.3,
                0.06,
                shutter
              );
          else if (f >= 1 && roll < 0.5) {
            // Balcon à garde-corps.
            onFace(nx, nz, along, y - 0.3, 0.6, 2.2, 0.15, 1.2, trim);
            const ox = nx !== 0 ? nx * (w / 2 + 1.15) : 0;
            const oz = nz !== 0 ? nz * (d / 2 + 1.15) : 0;
            const ax = nx !== 0 ? 0 : 1;
            const az = nx !== 0 ? 1 : 0;
            b.tube(
              [
                [ox + ax * (along - 1.05), y + 0.6, oz + az * (along - 1.05)],
                [ox + ax * (along + 1.05), y + 0.6, oz + az * (along + 1.05)],
              ],
              0.05,
              4,
              iron2
            );
          }
        }
      }
    }
    if (near && !low && st.roof !== 'pignons') {
      // Gargouilles qui déversent l'eau des terrasses.
      for (const [nx, nz, span] of [
        [0, 1, w],
        [1, 0, d],
      ] as const)
        for (let k = 0; k < 2; k++)
          onFace(
            nx,
            nz,
            (k - 0.5) * span * 0.5,
            h - 0.45,
            0.4,
            0.22,
            0.2,
            0.8,
            wood
          );
      const extra = r();
      b.push(translation(0, h + 0.3, 0));
      if (extra < 0.3) {
        // Citerne sur pieds.
        b.push(translation(-w * 0.25, 0, d * 0.2));
        b.cylinder(0.8, 1.5, 10, iron2);
        b.pop();
      } else if (extra < 0.5) {
        // Linge étendu.
        const lx = w * 0.35;
        b.tube(
          [
            [-lx, 1.6, 0],
            [lx, 1.5, 0],
          ],
          0.03,
          3,
          dark
        );
        for (const sx of [-1, 1]) {
          b.push(translation(sx * lx, 0, 0));
          b.cylinder(0.06, 1.7, 4, wood);
          b.pop();
        }
        for (let k = 0; k < 4; k++) {
          b.push(translation(-lx + (k + 0.7) * ((2 * lx) / 4.4), 0.95, 0));
          b.box(
            0.7 + r() * 0.4,
            0.6,
            0.03,
            mat(awning[Math.floor(r() * awning.length)], P.SAIL, 0.9)
          );
          b.pop();
        }
      } else if (extra < 0.65) {
        // Treille sur la terrasse.
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          b.push(translation(sx * w * 0.3, 0, sz * d * 0.3));
          b.cylinder(0.08, 2.4, 4, wood);
          b.pop();
        }
        for (let k = 0; k < 6; k++) {
          b.push(translation(0, 2.4, -d * 0.3 + (k * d * 0.6) / 5));
          b.box(w * 0.66, 0.1, 0.15, wood);
          b.pop();
        }
      } else if (extra < 0.85) {
        // Édicule d'escalier.
        b.push(translation(w * 0.28, 0, -d * 0.28));
        b.box(2.2, 2.4, 2.2, mat(c));
        b.push(translation(0, 0, 1.12));
        b.box(0.8, 1.9, 0.06, dark);
        b.pop();
        b.pop();
      }
      b.pop();
      // Escalier extérieur le long d'un pignon.
      if (r() < 0.22 && h < 9) {
        const steps = Math.round(h / 0.35);
        for (let k = 0; k < steps; k++)
          onFace(
            1,
            0,
            -d / 2 + 0.8 + (k / steps) * (d - 1.8),
            k * 0.35,
            0.55,
            0.45,
            0.35,
            1.1,
            mat(c)
          );
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
        b.cylinder(0.9, 7 + r() * 6, 10, mat('#4a2e26', P.BRICK));
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
    k: number,
    y0 = ground
  ) => {
    const sm = mat(adobe[0]);
    b.push(translation(x, y0, z));
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
        b.box(50 * k, 18 * k, 26 * k, mat('#4a3630', P.BRICK));
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
            mat('#3a2620', P.BRICK)
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
        // Colosse d'un chasseur du désert, lance dressée et bouclier, sur un
        // socle à degrés ; pierre patinée.
        const S = 1.6 * k;
        const st2: Mat = {
          p: P.PLASTER,
          color: linear('#cdbb98'),
          metal: 0,
          rough: 0.95,
        };
        for (let i = 0; i < 3; i++) {
          b.push(translation(0, i * 2.2 * S, 0));
          b.box(
            (20 - i * 3) * S,
            2.2 * S,
            (20 - i * 3) * S,
            i % 2 ? sm : stone
          );
          b.pop();
        }
        b.push(translation(0, 6.6 * S, 0));
        // Pieds et jambes.
        for (const sx of [-1, 1]) {
          b.push(translation(sx * 2.2 * S, 0, sx * 0.8 * S));
          b.box(2.4 * S, 1 * S, 4 * S, st2);
          b.pop();
          b.tube(
            [
              [sx * 2.2 * S, 0.8 * S, sx * 0.8 * S],
              [sx * 2.3 * S, 6 * S, sx * 0.4 * S],
              [sx * 2 * S, 11 * S, 0],
            ],
            1.25 * S,
            10,
            st2
          );
        }
        // Tunique, ceinture, torse.
        b.lathe(
          [
            [0, 9 * S],
            [4.2 * S, 9.4 * S],
            [3.6 * S, 12 * S],
            [3.2 * S, 13.5 * S],
            [3.8 * S, 16.5 * S],
            [4.6 * S, 18.5 * S],
            [2.6 * S, 20 * S],
            [0, 20.2 * S],
          ],
          16,
          st2
        );
        b.push(translation(0, 13 * S, 0));
        b.torus(3.4 * S, 0.35 * S, 16, 6, brass);
        b.pop();
        // Tête, coiffe à cornes.
        b.push(translation(0, 20 * S, 0));
        b.cylinder(1 * S, 1.2 * S, 10, st2);
        b.push(translation(0, 2.6 * S, 0));
        b.sphere(1.9 * S, 14, st2);
        b.lathe(
          [
            [2.1 * S, 0.2 * S],
            [1.6 * S, 1.6 * S],
            [0, 2.6 * S],
          ],
          12,
          sm
        );
        for (const sz of [-1, 1])
          b.tube(
            [
              [0, 1 * S, sz * 1.6 * S],
              [0, 2.2 * S, sz * 3.4 * S],
              [0, 4.4 * S, sz * 3.8 * S],
            ],
            0.35 * S,
            6,
            sm
          );
        b.pop();
        b.pop();
        // Bras droit levé tenant la lance, bras gauche portant le bouclier.
        b.tube(
          [
            [0, 18.4 * S, 4.4 * S],
            [1 * S, 21 * S, 6.2 * S],
            [0.6 * S, 24.5 * S, 6.4 * S],
          ],
          1 * S,
          8,
          st2
        );
        b.tube(
          [
            [0.6 * S, 3 * S, 6.4 * S],
            [0.6 * S, 36 * S, 6.4 * S],
          ],
          0.4 * S,
          6,
          brass
        );
        b.push(translation(0.6 * S, 36 * S, 6.4 * S));
        b.lathe(
          [
            [0, 0],
            [0.9 * S, 0.6 * S],
            [0, 4 * S],
          ],
          4,
          brass
        );
        b.pop();
        b.tube(
          [
            [0, 18.4 * S, -4.4 * S],
            [2 * S, 15.5 * S, -5.4 * S],
            [3 * S, 13 * S, -4.6 * S],
          ],
          1 * S,
          8,
          st2
        );
        b.push(
          chain(
            translation(4 * S, 13.5 * S, -4.6 * S),
            rotationZ(Math.PI / 2),
            rotationX(0.2)
          )
        );
        b.lathe(
          [
            [0, 0.6 * S],
            [3.6 * S, 0],
            [4 * S, -0.4 * S],
            [0, -0.5 * S],
          ],
          18,
          sm
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
        mat('#4a2e26', P.BRICK)
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
  // --- Réseau routier ------------------------------------------------------------
  // Grands axes de part et d'autre du port, bretelles vers le pied de
  // l'escalier de chaque quai, avenue de la place au monument (elle passe
  // sous les arches du viaduc), puis rues et ruelles entre les maisons.
  type Road = {
    a: [number, number];
    c: [number, number];
    w: number;
    kind: 0 | 1 | 2 | 3;
  };
  const roads: Road[] = [];
  const addRoad = (
    a: [number, number],
    c: [number, number],
    w: number,
    kind: Road['kind']
  ) => roads.push({ a, c, w, kind });
  const onRoad = (x: number, z: number, rad: number) =>
    roads.some(({ a, c, w }) => {
      const dx = c[0] - a[0];
      const dz = c[1] - a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)
      );
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w / 2 + rad;
    });
  // Destinations des routes : pied des escaliers de quai (et place, monument).
  const landmarks: [number, number, number][] = [];
  {
    const stepsQ = Math.ceil((top + 1.5) / 0.4);
    // Pied du grand escalier, ou porte du fond du hangar.
    const foot = HG ? -(hd.hz + 10) : z0 - 22 - stepsQ * 0.5 - 4;
    const trunkX = HG ? hd.hx + 14 : len / 2 + 26;
    const zFar = -(o.capital ? 400 : 330);
    for (const sx of [-1, 1])
      addRoad([sx * trunkX, 118], [sx * trunkX, zFar], 10, 0);
    // Bretelles : quai principal et postes secondaires.
    addRoad([-trunkX, foot], [trunkX, foot], 9, 1);
    landmarks.push([0, foot, 14]);
    for (const q of BERTHS) {
      const f = q.z + foot;
      landmarks.push([q.x, f, 14]);
      const tx = q.x < 0 ? -trunkX : trunkX;
      addRoad([q.x, f], [tx, f], 9, 1);
      addRoad([q.x, f], [q.x, f + 6], 9, 1);
    }
    // Avenue de la place au monument (sous les arches du viaduc).
    addRoad([0, HG ? foot : 24], [-20, -132], 11, 0);
  }
  const blocked = (x: number, z: number, rad: number) => {
    if (onRoad(x, z, rad)) return true;
    if (occ.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + rad * 0.9))
      return true;
    // Le navire, le quai et l'avant-plan de la caméra par défaut restent libres.
    if (
      HG
        ? Math.abs(x) < hd.hx + rad + 6 &&
          z > -hd.hz - 6 - rad &&
          z < hd.hz + 6 + rad
        : Math.abs(x) < len / 2 + rad + 16 &&
          z > z0 - depth - back - 4 - rad &&
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
        Math.abs(x - q.x) < len / 2 + rad + 16 &&
        z > q.z + z0 - depth - back - 4 - rad &&
        z < q.z + o.halfBeam + 6 + rad
      )
        return true;
    // Place du marché, devant le quai.
    if (Math.abs(x) < 76 + rad && z > 0 && z - rad < 118) return true;
    return false;
  };
  // Hangars des armateurs de la ville, de part et d'autre du port, porte
  // monumentale face au grand axe.
  {
    const trunkX = HG ? hd.hx + 14 : len / 2 + 26;
    const HL = 58;
    const HW = 30;
    const hz = -(o.halfBeam + 8 + 4 + HW / 2);
    for (const sx of [-1, 1]) {
      const hx = sx * (trunkX + 9 + HL / 2);
      closedHangar(hx, hz, HL, HW);
      for (let k = -2; k <= 2; k++)
        occ.push([hx + (k * HL) / 5, hz, HW * 0.62]);
    }
  }
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
  // Place du marché : sol de sable tassé (pas de dalle à bord franc),
  // seul le parvis rond de la fontaine est pavé.
  b.push(translation(0, ground + 0.02, 70));
  b.lathe(
    [
      [0, 0.12],
      [9, 0.12],
      [9.6, 0],
    ],
    32,
    mat(st.walls[st.walls.length - 1], P.ROCK, 0.95)
  );
  b.pop();
  // Place du marché ordonnée : palmiers en alignement sur le pourtour, deux
  // allées d'étals qui se font face, fontaine au centre.
  const stall = (x: number, z: number, ry: number) => {
    b.push(chain(translation(x, ground, z), rotationY(ry)));
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
    b.push(chain(translation(0, 2.6, 0.2), rotationX(0.12)));
    b.box(
      3.6,
      0.08,
      2.4,
      mat(awning[Math.floor(r() * awning.length)], P.SAIL, 0.9)
    );
    b.pop();
    // Marchandises sur l'étal.
    for (let k = 0; k < 3; k++) {
      b.push(translation(-1 + k, 1.1, 0));
      b.cylinder(
        0.3,
        0.3,
        8,
        mat(
          ['#c9a227', '#8a2f24', '#5a7a34', '#d8c8a8'][Math.floor(r() * 4)],
          P.PLAIN,
          0.9
        )
      );
      b.pop();
    }
    b.pop();
  };
  for (const [z, ry] of [
    [46, 0],
    [54, Math.PI],
    [86, 0],
    [94, Math.PI],
  ] as const)
    for (let x = -62; x <= 62; x += 5.5) {
      if (Math.abs(x) < 14 || r() < 0.15) continue;
      if (HG && z < hd.hz + 8) continue;
      stall(x, z, ry);
    }
  if (st.palms > 0) {
    for (let x = -70; x <= 70; x += 14) {
      if (!HG) palm(x, 24);
      palm(x, 116);
    }
    for (let z = 38; z <= 104; z += 16.5) {
      if (HG && z < hd.hz + 8) continue;
      palm(-76, z);
      palm(76, z);
    }
  }
  b.push(translation(0, ground, 70));
  b.cylinder(4.5, 0.9, 20, stone);
  b.push(translation(0, 0.9, 0));
  b.cylinder(0.6, 2.2, 10, stone);
  b.push(translation(0, 2.2, 0));
  b.cylinder(1.8, 0.4, 14, brass);
  b.pop();
  b.pop();
  b.pop();

  // --- Le tissu urbain : un plan et des bâtiments propres à chaque ville ---------------
  const water = mat('#1f4a5a', P.PLAIN, 0.06, 0.2);
  const R = o.capital ? 420 : 340;
  /** Emplacements libres sur une trame irrégulière (x, z, distance au port). */
  const spots = (step: number, keep: (dist: number) => number, rad: number) => {
    const out: [number, number, number][] = [];
    for (let gx = -R; gx <= R; gx += step)
      for (let gz = -R; gz <= R; gz += step) {
        const x = gx + (r() - 0.5) * step * 0.5;
        const z = gz + (r() - 0.5) * step * 0.5;
        const dist = Math.hypot(x, z);
        if (dist < 40 || dist > R || r() > keep(dist)) continue;
        if (front && z > 0) continue;
        if (blocked(x, z, rad)) continue;
        out.push([x, z, dist]);
      }
    return out;
  };
  const corridor = (z: number, rad: number) => z > 0 && z - rad < 150;
  // Côté caméra (z > 0), les villes sans trame de rues reçoivent un quartier
  // bas aligné sur des rues, pour que la ville entoure la place.
  const front = st.layout !== 'trame' && st.layout !== 'remparts';
  /**
   * Lots alignés sur les rues : des îlots entre rues parallèles au port, des
   * rangées de maisons mitoyennes sur chaque front, porte côté rue ; des
   * ruelles transversales coupent les rangées.
   */
  const streetLots = (S: number, wMin: number, wMax: number, dLot: number) => {
    const out: {
      x: number;
      z: number;
      w: number;
      d: number;
      ry: number;
      dist: number;
    }[] = [];
    // Fronts bâtis de chaque rue (z de la rue -> intervalles en x), ruelles.
    const fronts = new Map<number, [number, number][]>();
    const alleys: { x: number; z0: number; z1: number }[] = [];
    for (let zs = -R; zs < R; zs += S) {
      for (const front of [0, 1]) {
        const z = front === 0 ? zs + 4 + dLot / 2 : zs + S - 4 - dLot / 2;
        const ry = front === 0 ? Math.PI : 0;
        const street = front === 0 ? zs : zs + S;
        let x = -R;
        let nextCross = -R + 40 + r() * 30;
        while (x < R) {
          if (x > nextCross) {
            alleys.push({ x: x + 3, z0: street, z1: zs + S / 2 });
            x += 6; // ruelle
            nextCross = x + 40 + r() * 30;
            continue;
          }
          const w = wMin + r() * (wMax - wMin);
          const cx = x + w / 2;
          x += w;
          const dist = Math.hypot(cx, z);
          if (dist > R || dist < 40) continue;
          if (blocked(cx, z, Math.max(w, dLot) / 2)) continue;
          out.push({ x: cx, z, w: w - 0.1, d: dLot, ry, dist });
          const f = fronts.get(street) ?? [];
          f.push([cx - w / 2, cx + w / 2]);
          fronts.set(street, f);
        }
      }
    }
    // Rues continues le long des fronts bâtis (les petits trous sont comblés).
    const pending: Road[] = [];
    for (const [zst, iv] of fronts) {
      iv.sort((p, q) => p[0] - q[0]);
      let [a0, a1] = iv[0];
      const flush = () => {
        if (a1 - a0 > 12)
          pending.push({ a: [a0 - 3, zst], c: [a1 + 3, zst], w: 7, kind: 2 });
      };
      for (const [p0, p1] of iv.slice(1)) {
        if (p0 - a1 < 16) a1 = Math.max(a1, p1);
        else {
          flush();
          [a0, a1] = [p0, p1];
        }
      }
      flush();
    }
    for (const al of alleys) {
      const iv = fronts.get(al.z0);
      if (iv && iv.some(([p0, p1]) => al.x > p0 - 12 && al.x < p1 + 12))
        pending.push({ a: [al.x, al.z0], c: [al.x, al.z1], w: 4, kind: 3 });
    }
    roads.push(...pending);
    return out;
  };
  const ringWall = (
    cx: number,
    cz: number,
    rad: number,
    h: number,
    a0: number,
    a1: number,
    m: Mat
  ) => {
    const n = Math.max(8, Math.round(((a1 - a0) * rad) / 6));
    for (let k = 0; k < n; k++) {
      const a = a0 + ((k + 0.5) / n) * (a1 - a0);
      const x = cx + Math.cos(a) * rad;
      const z = cz + Math.sin(a) * rad;
      if (blocked(x, z, 2) || corridor(z, 2)) continue;
      b.push(chain(translation(x, ground, z), rotationY(-a)));
      b.box(3, h, ((a1 - a0) * rad) / n + 0.2, m);
      // Créneaux.
      b.push(translation(0, h, 0));
      b.box(3.4, 1.2, 1.4, m);
      b.pop();
      b.pop();
      if (k % 6 === 0) {
        b.push(translation(x, ground, z));
        b.cylinder(4, h + 4, 12, m);
        b.push(translation(0, h + 4, 0));
        b.lathe(
          [
            [4.6, 0],
            [0, 5],
          ],
          12,
          copper
        );
        b.pop();
        b.pop();
      }
    }
  };
  const hut = (x: number, z: number, rad: number, h: number, y0 = ground) => {
    occ.push([x, z, rad]);
    const c = adobe[Math.floor(r() * adobe.length)];
    b.push(chain(translation(x, y0, z), rotationY(r() * 6.28)));
    b.lathe(
      [
        [0, -0.5],
        [rad, -0.5],
        [rad * 1.02, h * 0.3],
        [rad * 0.82, h * 0.72],
        [rad * 0.38, h * 0.96],
        [0.3, h],
        [0, h + 0.4],
      ],
      14,
      mat(c)
    );
    b.push(translation(0, 0, rad * 0.98));
    b.box(1.1, 1.9, 0.3, dark);
    b.pop();
    if (r() < 0.5) {
      b.push(translation(0, h * 0.5, -rad * 0.92));
      b.box(0.6, 0.6, 0.2, win(o.night));
      b.pop();
    }
    b.pop();
  };
  const towerHouse = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number
  ) => {
    occ.push([x, z, Math.max(w, d) * 0.45]);
    const c = adobe[Math.floor(r() * adobe.length)];
    const trim = mat('#f0e8d8');
    b.push(chain(translation(x, ground, z), rotationY((r() - 0.5) * 0.1)));
    b.box(w, h, d, mat(c));
    for (let y = 4; y < h - 1; y += 4) {
      b.push(translation(0, y, 0));
      b.box(w + 0.25, 0.35, d + 0.25, trim);
      b.pop();
      for (const sz of [1, -1])
        for (let k = 0; k < Math.max(1, Math.floor(w / 2.4)); k++) {
          const px = (k + 0.5) * (w / Math.max(1, Math.floor(w / 2.4))) - w / 2;
          b.push(translation(px, y + 1.6, (sz * d) / 2 + sz * 0.06));
          b.box(0.9, 1.5, 0.1, win(o.night));
          b.pop();
          b.push(translation(px, y + 2.5, (sz * d) / 2 + sz * 0.08));
          b.box(1.2, 0.3, 0.1, trim);
          b.pop();
        }
    }
    b.push(translation(0, h, 0));
    for (let k = 0; k < 4; k++)
      for (const t of [-0.35, 0, 0.35]) {
        const px = k < 2 ? t * w : (k === 2 ? 0.5 : -0.5) * w;
        const pz = k < 2 ? (k === 0 ? 0.5 : -0.5) * d : t * d;
        b.push(translation(px, 0, pz));
        b.box(0.8, 1.2, 0.8, trim);
        b.pop();
      }
    b.pop();
    b.pop();
  };
  const stiltHouse = (
    x: number,
    z: number,
    w: number,
    d: number,
    s: number
  ) => {
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      b.push(translation(x + (sx * w) / 2.3, ground - 1, z + (sz * d) / 2.3));
      b.cylinder(0.35, s + 1, 6, wood);
      b.pop();
      b.tube(
        [
          [x + (sx * w) / 2.3, ground + s * 0.3, z + (sz * d) / 2.3],
          [x, ground + s * 0.9, z + (sz * d) / 2.3],
        ],
        0.15,
        4,
        wood
      );
    }
    b.push(translation(x, ground + s - 0.3, z));
    b.box(w + 3, 0.4, d + 3, plank);
    b.pop();
    house(x, z, w, d, 4 + r() * 3, 0, true, false, ground + s);
  };
  const windmill = (x: number, z: number, h: number) => {
    b.push(translation(x, ground, z));
    b.lathe(
      [
        [3, 0],
        [2, h],
        [0, h + 0.4],
      ],
      8,
      wood
    );
    b.push(chain(translation(0, h - 1, 2.4), rotationZ(r())));
    for (let k = 0; k < 4; k++) {
      b.push(rotationZ((k / 4) * Math.PI * 2));
      b.push(translation(0, 5, 0));
      b.box(1.8, 9, 0.12, mat('#d8c8a8', P.SAIL));
      b.pop();
      b.pop();
    }
    b.pop();
    b.pop();
  };
  const mound = (
    x: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    m: Mat
  ) => {
    occ.push([x, z, Math.max(sx, sz)]);
    const k0 = r() * 10;
    b.grid(
      20,
      10,
      (u, v) => {
        const a = u * Math.PI * 2;
        const ph = v * Math.PI * 0.5;
        const n =
          1 +
          0.12 * Math.sin(a * 3 + k0) +
          0.06 * Math.sin(a * 7 + ph * 4 + k0);
        return [
          x + Math.cos(a) * Math.cos(ph) * sx * n,
          ground - 1 + Math.sin(ph) * sy,
          z + Math.sin(a) * Math.cos(ph) * sz * n,
        ];
      },
      m,
      { flip: true }
    );
    // Fenêtres et portes creusées dans la masse.
    const n = Math.round(sx / 3);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const ph = 0.15 + r() * 0.75;
      const px = x + Math.cos(a) * Math.cos(ph) * sx * 0.99;
      const py = ground - 1 + Math.sin(ph) * sy;
      const pz = z + Math.sin(a) * Math.cos(ph) * sz * 0.99;
      b.push(chain(translation(px, py, pz), rotationY(-a + Math.PI / 2)));
      b.box(1.2, ph < 0.3 ? 2.4 : 1.4, 0.4, ph < 0.3 ? dark : win(o.night));
      b.pop();
    }
  };
  const hall = (x: number, z: number, w: number, d: number, h: number) => {
    occ.push([x, z, Math.max(w, d) * 0.45]);
    const brick = mat(adobe[Math.floor(r() * adobe.length)], P.BRICK);
    b.push(translation(x, ground, z));
    b.box(w, h, d, brick);
    const n = Math.max(2, Math.round(w / 6));
    for (let k = 0; k < n; k++) {
      b.push(translation(-w / 2 + (k + 0.5) * (w / n), h, 0));
      b.grid(
        1,
        1,
        (u, v) => [(u - 0.5) * (w / n), u * 3, (v - 0.5) * d],
        copper,
        {}
      );
      b.push(translation(w / n / 2 - 0.05, 0, 0));
      b.box(0.1, 3, d, win(true));
      b.pop();
      b.pop();
    }
    for (let k = 0; k < Math.floor(w / 5); k++) {
      b.push(translation(-w / 2 + 2.5 + k * 5, h * 0.55, d / 2 + 0.06));
      b.box(2.4, h * 0.45, 0.1, win(o.night));
      b.pop();
    }
    b.pop();
  };
  const courtyard = (x: number, z: number, w: number, h: number) => {
    occ.push([x, z, w * 0.5]);
    const c = mat(adobe[Math.floor(r() * adobe.length)]);
    const t = 4;
    b.push(
      chain(
        translation(x, ground, z),
        rotationY(Math.round(r() * 3) * (Math.PI / 2))
      )
    );
    for (const [px, pz, bw, bd] of [
      [0, (w - t) / 2, w, t],
      [0, -(w - t) / 2, w, t],
      [(w - t) / 2, 0, t, w - 2 * t],
      [-(w - t) / 2, 0, t, w - 2 * t],
    ]) {
      b.push(translation(px, 0, pz));
      b.box(bw, h, bd, c);
      b.pop();
    }
    // Arcades intérieures et bassin.
    b.push(translation(0, -0.9, 0));
    b.box(w * 0.35, 1, w * 0.35, water);
    b.pop();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      b.push(
        translation(
          Math.cos(a) * (w / 2 - t - 0.6),
          0,
          Math.sin(a) * (w / 2 - t - 0.6)
        )
      );
      b.cylinder(0.3, h * 0.7, 6, mat('#efe4cc'));
      b.pop();
    }
    b.pop();
    palm(x + 1, z - 1);
  };

  // Emprise du monument.
  if (st.layout !== 'colline') occ.push([-20, -150, o.capital ? 55 : 38]);
  switch (st.layout) {
    case 'trame':
    case 'industriel': {
      // Trame de rues ; ville-forge : halles, tuyauteries et passerelles.
      const tops: Vec3[] = [];
      if (st.layout === 'trame')
        for (const l of streetLots(34, 7, 12, 11)) {
          const h = 4 + r() * 11 * st.height * Math.max(0.3, 1.2 - l.dist / R);
          const low = corridor(l.z, l.d / 2);
          house(
            l.x,
            l.z,
            l.w,
            l.d,
            low ? Math.min(h, 6) : h,
            l.ry,
            l.dist < 200,
            low
          );
        }
      const pts =
        st.layout === 'industriel'
          ? spots(30, (d) => 0.78 - d / (R * 2.2), 8)
          : [];
      for (const [x, z, dist] of pts) {
        if (st.layout === 'industriel' && !corridor(z, 16) && r() < 0.6) {
          const w = 22 + r() * 18;
          const h = 10 + r() * 10;
          if (blocked(x, z, w / 2)) continue;
          hall(x, z, w, 14 + r() * 8, h);
          tops.push([x, ground + h + 2, z]);
          continue;
        }
        const w = 8 + r() * 7;
        const d = 8 + r() * 7;
        const h = 4 + r() * 13 * st.height * Math.max(0.25, 1.2 - dist / R);
        const low = corridor(z, Math.max(w, d) / 2);
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
      if (st.layout === 'industriel') {
        // Conduites entre les halles, sur pylônes.
        for (let k = 0; k + 1 < tops.length; k++) {
          const a = tops[k];
          const c = tops[k + 1];
          if (Math.hypot(a[0] - c[0], a[2] - c[2]) > 80) continue;
          const mid: Vec3 = [
            (a[0] + c[0]) / 2,
            Math.max(a[1], c[1]) + 4,
            (a[2] + c[2]) / 2,
          ];
          b.tube([a, mid, c], 0.9, 8, mat('#5a4a3a', P.RUST, 0.7, 0.5));
          b.push(translation(mid[0], ground, mid[2]));
          b.cylinder(0.4, mid[1] - ground, 6, iron);
          b.pop();
        }
      } else
        ringWall(
          0,
          -60,
          R * 0.92,
          9,
          Math.PI * 1.05,
          Math.PI * 1.95,
          mat(adobe[2 % adobe.length])
        );
      break;
    }
    case 'colline': {
      // Ville étagée sur une colline derrière le port, monument au sommet.
      const hc: [number, number] = [-20, -330];
      const H = 70;
      const mask = (x: number, z: number) => {
        // Nulle près du port, la colline monte derrière.
        let m = smoothstep01(-(z + 90) / 60);
        for (const lane of LANES)
          m *= smoothstep01((Math.abs(z - lane) - 16) / 22);
        for (const q of BERTHS)
          if (Math.abs(x - q.x) < len / 2 + 14)
            m *= smoothstep01((Math.abs(z - q.z) - 18) / 20);
        return m;
      };
      const hill = (x: number, z: number) => {
        const e =
          1 - ((x - hc[0]) ** 2 / 330 ** 2 + (z - hc[1]) ** 2 / 240 ** 2);
        return e <= 0 ? 0 : H * Math.pow(e, 0.85) * mask(x, z);
      };
      b.grid(
        90,
        60,
        (u, v) => {
          const x = hc[0] + (u - 0.5) * 680;
          const z = hc[1] + (v - 0.5) * 500;
          return [x, ground - 0.6 + hill(x, z), z];
        },
        mat(adobe[3 % adobe.length], P.ROCK, 0.95),
        {}
      );
      for (const [x, z] of spots(12, () => 0.85, 5)) {
        const y = hill(x, z);
        if (y < 3 && (z < -80 || corridor(z, 6))) continue;
        const w = 6 + r() * 6;
        const d = 6 + r() * 6;
        house(
          x,
          z,
          w,
          d,
          3.5 + r() * 4,
          (r() - 0.5) * 0.15,
          Math.hypot(x, z) < 220,
          corridor(z, 6),
          ground - 1 + y
        );
      }
      monument(st.monument, hc[0], hc[1], 0.8, ground + hill(hc[0], hc[1]) - 1);
      break;
    }
    case 'remparts': {
      // Capitale fortifiée : enceinte, maisons-tours serrées, citadelle.
      for (const l of streetLots(26, 5, 8, 7)) {
        if (corridor(l.z, 5)) {
          house(l.x, l.z, l.w, l.d, 5, l.ry, l.dist < 200, true);
          continue;
        }
        towerHouse(
          l.x,
          l.z,
          l.w,
          l.d,
          (12 + r() * 20) * Math.max(0.45, 1.2 - l.dist / R)
        );
      }
      ringWall(
        0,
        -40,
        R * 0.95,
        14,
        Math.PI * 1.02,
        Math.PI * 1.98,
        mat(adobe[2 % adobe.length])
      );
      ringWall(-20, -150, 70, 18, 0, Math.PI * 2, mat(adobe[0]));
      break;
    }
    case 'pilotis': {
      // Village de bois sur pilotis, passerelles et moulins.
      const pts = spots(22, (d) => 0.7 - d / (R * 2.5), 7);
      const raised: Vec3[] = [];
      for (const [x, z] of pts) {
        if (corridor(z, 7)) {
          house(x, z, 7, 6, 4, (r() - 0.5) * 0.4, true, true);
          continue;
        }
        const sH = 4 + r() * 5;
        stiltHouse(x, z, 6 + r() * 5, 6 + r() * 4, sH);
        raised.push([x, ground + sH - 0.1, z]);
      }
      for (let k = 0; k + 1 < raised.length; k++) {
        const a = raised[k];
        const c = raised[k + 1];
        const L = Math.hypot(a[0] - c[0], a[2] - c[2]);
        if (L > 40) continue;
        b.push(
          chain(
            translation(
              (a[0] + c[0]) / 2,
              (a[1] + c[1]) / 2,
              (a[2] + c[2]) / 2
            ),
            rotationY(-Math.atan2(c[2] - a[2], c[0] - a[0]))
          )
        );
        b.box(L, 0.25, 1.8, plank);
        b.pop();
      }
      for (let k = 0, n = 0; k < 40 && n < 6; k++) {
        const x = (r() - 0.5) * 2 * R * 0.8;
        const z = -60 - r() * R * 0.8;
        if (blocked(x, z, 6)) continue;
        windmill(x, z, 14 + r() * 6);
        n++;
      }
      break;
    }
    case 'huttes': {
      // Enclos de huttes rondes, palissades d'ossements.
      const bone = mat('#e8dcc4', P.PLAIN, 0.8);
      for (const [x, z] of spots(27, (d) => 0.97 - d / (R * 3), 12)) {
        const n = 5 + Math.floor(r() * 4);
        const rad = 8 + r() * 4;
        // Grande hutte du chef de clan au centre de l'enclos.
        if (r() < 0.55 && !corridor(z, 5)) hut(x, z, 4.2 + r(), 7.5 + r() * 2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r() * 0.3;
          const hx = x + Math.cos(a) * rad * 0.65;
          const hz = z + Math.sin(a) * rad * 0.65;
          const big = corridor(hz, 3) ? 0.6 : 1;
          hut(hx, hz, (3 + r() * 1.6) * big, (5 + r() * 3.5) * big);
        }
        if (!corridor(z, rad)) {
          b.push(translation(x, ground, z));
          b.lathe(
            [
              [rad + 2, 0],
              [rad + 2, 1.6],
              [rad + 1.4, 1.6],
              [rad + 1.4, 0],
            ],
            20,
            mat(adobe[2 % adobe.length])
          );
          b.pop();
        }
        // Arche d'entrée en défenses.
        b.push(
          chain(
            translation(x, ground, z),
            rotationY(r() * 6.28),
            translation(0, 0, rad + 1.7)
          )
        );
        for (const sx of [-1, 1])
          b.tube(
            [
              [sx * 1.8, 0, 0],
              [sx * 2.2, 3, 0],
              [sx * 1.2, 5.5, 0],
              [sx * 0.1, 6.2, 0],
            ],
            0.35,
            6,
            bone
          );
        b.pop();
      }
      break;
    }
    case 'monolithes': {
      // Cité creusée dans d'énormes blocs de sel.
      const salt = mat(adobe[0], P.ROCK, 0.7);
      for (const [x, z, dist] of spots(46, (d) => 0.8 - d / (R * 2.2), 22)) {
        if (corridor(z, 20)) {
          house(x, z, 8, 8, 4, 0, true, true);
          continue;
        }
        const sx = 12 + r() * 16;
        mound(
          x,
          z,
          sx,
          (14 + r() * 26) * Math.max(0.5, 1.2 - dist / R),
          sx * (0.7 + r() * 0.4),
          salt
        );
      }
      break;
    }
    case 'cratere': {
      // Anneaux concentriques de tours rondes coiffées de cristal, rues rayonnantes.
      const cx = -20;
      const cz = -150;
      const cm: Mat = {
        p: P.GLASS,
        color: linear(st.dome),
        metal: 0,
        rough: 0.15,
        emit: o.night ? 1.4 : 0.25,
      };
      // Rues circulaires entre les anneaux de tours.
      for (let ring = 1; ring <= 5; ring++) {
        const rr = 40 + ring * 55 + 27;
        const n = 36;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2;
          const a1 = ((k + 1) / n) * Math.PI * 2;
          const p0: [number, number] = [
            cx + Math.cos(a0) * rr,
            cz + Math.sin(a0) * rr,
          ];
          const p1: [number, number] = [
            cx + Math.cos(a1) * rr,
            cz + Math.sin(a1) * rr,
          ];
          if (p0[1] > 0 || p1[1] > 0 || Math.hypot(p0[0], p0[1]) > R) continue;
          addRoad(p0, p1, 7, 2);
        }
      }
      for (let ring = 1; ring <= 5; ring++) {
        const rad = 40 + ring * 55;
        const n = Math.round((rad * Math.PI * 2) / 15);
        for (let k = 0; k < n; k++) {
          if (k % 7 === 0) continue; // rue rayonnante
          const a = (k / n) * Math.PI * 2;
          const x = cx + Math.cos(a) * rad;
          const z = cz + Math.sin(a) * rad;
          if (blocked(x, z, 5) || z > 0) continue;
          const low = corridor(z, 5);
          const h = low ? 4 : (6 + r() * 10) * (1.3 - ring * 0.12);
          const rr = 3 + r() * 2;
          occ.push([x, z, rr]);
          b.push(translation(x, ground, z));
          b.cylinder(rr, h, 12, mat(adobe[ring % adobe.length]));
          b.push(translation(0, h, 0));
          b.cylinder(rr + 0.4, 0.6, 12, mat(adobe[0]));
          if (!low)
            b.lathe(
              [
                [rr * 0.6, 0.6],
                [0, 0.6 + rr * 1.6],
              ],
              6,
              cm
            );
          b.pop();
          for (let w = 0; w < 3; w++) {
            const wa = r() * Math.PI * 2;
            b.push(
              chain(
                translation(
                  Math.cos(wa) * (rr + 0.05),
                  h * (0.4 + r() * 0.4),
                  Math.sin(wa) * (rr + 0.05)
                ),
                rotationY(-wa + Math.PI / 2)
              )
            );
            b.box(0.8, 1.2, 0.1, win(o.night));
            b.pop();
          }
          b.pop();
        }
      }
      break;
    }
    case 'jardins': {
      // Maisons à patio, canaux et palmeraies.
      for (const [x, z, dist] of spots(26, (d) => 0.75 - d / (R * 2.5), 11)) {
        if (corridor(z, 11)) {
          palm(x, z);
          continue;
        }
        courtyard(
          x,
          z,
          16 + r() * 6,
          4 + r() * 4 * Math.max(0.5, 1.2 - dist / R)
        );
      }
      for (const cz of [-170, -250, 200]) {
        b.push(translation(0, ground - 0.85, cz));
        b.box(2 * R, 0.5, 7, water);
        b.pop();
        for (const sz of [-1, 1]) {
          b.push(translation(0, ground - 0.5, cz + sz * 4));
          b.box(2 * R, 0.9, 1, stone);
          b.pop();
        }
        for (let x = -R; x < R; x += 22)
          palm(x + r() * 8, cz + (r() < 0.5 ? -7 : 7));
      }
      break;
    }
  }
  if (front)
    for (const l of streetLots(30, 7, 11, 10)) {
      if (l.z <= 0) continue;
      if (st.layout === 'huttes') {
        hut(l.x - l.w * 0.2, l.z, 3 + r() * 1.2, 4.8 + r() * 2);
        if (r() < 0.6)
          hut(l.x + l.w * 0.3, l.z + (r() - 0.5) * 3, 1.8 + r(), 3 + r() * 1.5);
        continue;
      }
      const h = 3.5 + r() * 7 * st.height * Math.max(0.3, 1.2 - l.dist / R);
      const low = corridor(l.z, l.d / 2);
      house(
        l.x,
        l.z,
        l.w,
        l.d,
        low ? Math.min(h, 6) : h,
        l.ry,
        l.dist < 220,
        low
      );
    }
  // Façades le long de toutes les chaussées : chaque route est bordée de
  // bâtiments qui lui font face (porte côté route), dans le style de la ville.
  for (const rd of [...roads]) {
    const dx = rd.c[0] - rd.a[0];
    const dz = rd.c[1] - rd.a[1];
    const L = Math.hypot(dx, dz);
    if (L < 8) continue;
    const ux = dx / L;
    const uz = dz / L;
    const nx = -uz;
    const nz = ux;
    for (const sd of [-1, 1]) {
      let t = 2;
      while (t < L - 2) {
        const w = 7 + r() * 5;
        const d = 9 + r() * 3;
        const tc = t + w / 2;
        t += w + (r() < 0.12 ? 5 : 0.3);
        if (tc > L - 2) break;
        const off = rd.w / 2 + 1.4 + d / 2;
        const x = rd.a[0] + ux * tc + nx * sd * off;
        const z = rd.a[1] + uz * tc + nz * sd * off;
        const dist = Math.hypot(x, z);
        if (dist > R || dist < 40 || blocked(x, z, d / 2)) continue;
        // Sur la colline de Zenit, les maisons sont déjà étagées sur la pente.
        if (st.layout === 'colline' && z < -80) continue;
        // Porte tournée vers la route.
        const ry = Math.atan2(-sd * nx, -sd * nz);
        if (st.layout === 'huttes') {
          hut(x, z, 3 + r() * 1.2, 4.8 + r() * 2);
          continue;
        }
        const low = corridor(z, d / 2);
        const h = 3.5 + r() * 8 * st.height * Math.max(0.3, 1.2 - dist / R);
        house(x, z, w, d, low ? Math.min(h, 6) : h, ry, dist < 230, low);
      }
    }
  }
  if (st.layout !== 'colline')
    monument(st.monument, -20, -150, o.capital ? 1.6 : 1);
  const towers = st.layout === 'industriel' ? 12 : o.capital ? 9 : 5;
  for (let k = 0, placed = 0; k < 80 && placed < towers; k++) {
    const a = r() * Math.PI * 2;
    const dist = 80 + r() * 300;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    if (blocked(x, z, 4) || (z > 0 && z < 160)) continue;
    tower(x, z, 18 + r() * 16);
    placed++;
  }
  // --- Les habitants : dockers, passants, marchands ------------------------------------
  const crowd: CrewMember[] = [];
  let seed = 100;
  const walk = (a: Vec3, to: Vec3) =>
    crowd.push({ role: 'walk', pos: a, to, yaw: 0, seed: seed++ });
  // Sur le quai, entre le bord et la galerie.
  const qz = (k: number) => z0 - 3 - k * 9;
  // Sur le quai principal, en long (le hangar a ses propres ouvriers).
  for (let k = 0; k < (HG ? 0 : 6); k++) {
    const z = qz(r());
    const x1 = (r() - 0.5) * (len - 16);
    walk([x1, top, z], [x1 + (r() < 0.5 ? -1 : 1) * (10 + r() * 20), top, z]);
  }
  // Dockers au pied des grues.
  for (const fx of HG ? [] : [-0.24, 0.24])
    crowd.push({
      role: 'haul',
      pos: [fx * len + (fx < 0 ? 1.6 : -1.6), top, z0 - 4],
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
    const z = HG ? hd.hz + 9 + r() * 4 : o.halfBeam + 10 + r() * 6;
    const x1 = (r() - 0.5) * 260;
    walk(
      [x1, ground, z],
      [x1 + (r() < 0.5 ? -1 : 1) * (25 + r() * 40), ground, z]
    );
  }
  // Chalands dans les allées du marché (entre les rangées d'étals) et sur le pourtour.
  for (let k = 0; k < 20; k++) {
    const z =
      (HG ? [70, 90, 80, 110] : [50, 90, 30, 110])[k % 4] + (r() - 0.5) * 2;
    const x1 = (r() - 0.5) * 120;
    walk(
      [x1, ground, z],
      [
        Math.max(
          -62,
          Math.min(62, x1 + (r() < 0.5 ? -1 : 1) * (20 + r() * 40))
        ),
        ground,
        z,
      ]
    );
  }
  for (let k = 0; k < 5; k++)
    crowd.push({
      role: 'look',
      pos: [(r() - 0.5) * 240, ground, 30 + r() * 100],
      yaw: r() * 6.28,
      seed: seed++,
    });
  // Chaussées : pavés sur les grands axes et les bretelles (avec bordures),
  // terre battue pour les rues et ruelles. Hauteurs décalées par catégorie
  // pour que les carrefours ne scintillent pas.
  const sand = linear('#a88a64');
  const paved: Mat = {
    p: P.BRICK,
    color: [sand[0] * 1.05, sand[1] * 1.0, sand[2] * 0.95],
    metal: 0,
    rough: 0.95,
  };
  const dirt: Mat = {
    p: P.PLAIN,
    color: [sand[0] * 0.8, sand[1] * 0.72, sand[2] * 0.66],
    metal: 0,
    rough: 1,
  };
  const curb: Mat = {
    p: P.ROCK,
    color: linear('#8a7a64'),
    metal: 0,
    rough: 0.95,
  };
  // Élagage : une chaussée ne traverse pas de sable vide. Chaque point doit
  // être bordé de bâtiments, toucher une autre route ou une destination
  // (quai, place, monument) ; les bouts nus sont coupés, et les rues de terre
  // sont scindées là où elles traversent un long vide.
  {
    const STEP = 3;
    const useful = (x: number, z: number, self: Road) => {
      if (landmarks.some(([lx, lz, lr]) => Math.hypot(x - lx, z - lz) < lr))
        return true;
      if (Math.abs(x) < 100 && z > 16 && z < 122) return true; // place
      const reach = self.w / 2 + 9;
      if (occ.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) - or < reach))
        return true;
      return roads.some((q) => {
        if (q === self) return false;
        const dx = q.c[0] - q.a[0];
        const dz = q.c[1] - q.a[1];
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(
          0,
          Math.min(1, ((x - q.a[0]) * dx + (z - q.a[1]) * dz) / l2)
        );
        return (
          Math.hypot(x - q.a[0] - dx * t, z - q.a[1] - dz * t) < q.w / 2 + 1.5
        );
      });
    };
    for (let pass = 0; pass < 2; pass++) {
      const next: Road[] = [];
      for (const rd of roads) {
        const dx = rd.c[0] - rd.a[0];
        const dz = rd.c[1] - rd.a[1];
        const L = Math.hypot(dx, dz);
        const n = Math.max(1, Math.round(L / STEP));
        const ok: boolean[] = [];
        for (let i = 0; i <= n; i++)
          ok.push(useful(rd.a[0] + (dx * i) / n, rd.a[1] + (dz * i) / n, rd));
        // Tronçons utiles ; un vide court (traversée de carrefour, porche) est
        // conservé, un long vide coupe une rue de terre en deux.
        const maxGap = [70, 45, 24, 24][rd.kind] / STEP;
        let i0 = -1;
        let last = -1;
        const emit = (a: number, c: number) => {
          if ((c - a) * (L / n) < 10) return;
          next.push({
            ...rd,
            a: [rd.a[0] + (dx * a) / n, rd.a[1] + (dz * a) / n],
            c: [rd.a[0] + (dx * c) / n, rd.a[1] + (dz * c) / n],
          });
        };
        for (let i = 0; i <= n; i++) {
          if (!ok[i]) continue;
          if (i0 < 0) i0 = i;
          else if (i - last > maxGap) {
            emit(i0, last);
            i0 = i;
          }
          last = i;
        }
        if (i0 >= 0) emit(i0, last);
      }
      roads.length = 0;
      roads.push(...next);
    }
  }
  for (const rd of roads) {
    const dx = rd.c[0] - rd.a[0];
    const dz = rd.c[1] - rd.a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const ang = -Math.atan2(dz, dx);
    const cx = (rd.a[0] + rd.c[0]) / 2;
    const cz = (rd.a[1] + rd.c[1]) / 2;
    // Dessus nettement au-dessus du sol aplani (-1) et décalé par catégorie :
    // pas de scintillement de profondeur, même vu de loin.
    const y = ground + [0.3, 0.36, 0.18, 0.12][rd.kind];
    b.push(chain(translation(cx, y - 0.5, cz), rotationY(ang)));
    b.box(L + (rd.kind < 2 ? 0 : 1), 0.5, rd.w, rd.kind < 2 ? paved : dirt);
    if (rd.kind < 2)
      for (const sz of [-1, 1]) {
        b.push(translation(0, 0.3, (sz * rd.w) / 2));
        b.box(L, 0.42, 0.45, curb);
        b.pop();
      }
    b.pop();
  }
  // Passants et charrettes à bras le long des grands axes.
  for (const rd of roads.filter((q) => q.kind < 2))
    for (let k = 0; k < 2; k++) {
      const t0 = r() * 0.6;
      const t1 = Math.min(1, t0 + 0.2 + r() * 0.3);
      const side = (r() < 0.5 ? -1 : 1) * rd.w * 0.3;
      const nx = -(rd.c[1] - rd.a[1]);
      const nz = rd.c[0] - rd.a[0];
      const nl = Math.hypot(nx, nz) || 1;
      const p = (t: number): Vec3 => [
        rd.a[0] + (rd.c[0] - rd.a[0]) * t + (nx / nl) * side,
        ground + 0.33,
        rd.a[1] + (rd.c[1] - rd.a[1]) * t + (nz / nl) * side,
      ];
      if (r() < 0.5) walk(p(t0), p(t1));
      else walk(p(t1), p(t0));
    }
  return {
    city: b.build(),
    moor: m.build(),
    crowd: hangar ? [...crowd, ...hangar.crowd] : crowd,
    hangar,
  };
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
