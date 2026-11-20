import { MeshBuilder, P, type Mat, type MeshData } from './geometry';
import {
  chain,
  linear,
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
  const adobe = [
    '#c9a27a',
    '#d8b48a',
    '#b88a62',
    '#e0c49c',
    '#a87a56',
    '#cfae8c',
  ];
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
  const copper: Mat = {
    p: P.PATINA,
    color: linear('#a8683a'),
    metal: 0.85,
    rough: 0.6,
  };
  const awning = ['#8a2f24', '#2f5a6a', '#c9a227', '#5a6a2f'];
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
    // Ornements : dôme, tourelle, auvent, cheminée.
    const roll = r();
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
  const tower = (x: number, z: number, h: number) => {
    const c = adobe[Math.floor(r() * adobe.length)];
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
        4 + r() * (o.capital ? 20 : 13) * Math.max(0.25, 1.2 - dist / R);
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
  // Grand dôme (palais ou temple), visible derrière le quai.
  const big = o.capital ? 26 : 16;
  b.push(translation(-20, ground, -150));
  b.cylinder(big, big * 0.6, 24, mat('#e0c49c'));
  b.push(chain(translation(0, big * 0.6, 0), scaling(1, 1.1, 1)));
  b.sphere(big, 28, copper, true);
  b.pop();
  b.push(translation(0, big * 1.7, 0));
  b.cylinder(1.2, 4, 8, brass);
  b.pop();
  b.pop();
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
    if (r() < 0.45) palm(x, z);
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
