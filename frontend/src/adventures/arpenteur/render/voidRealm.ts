import type { Mood } from './environment';
import { MeshBuilder, P, type Mat, type MeshData } from './geometry';
import {
  chain,
  linear,
  normalize,
  rotationX,
  rotationY,
  rotationZ,
  translation,
  type Vec3,
} from './math';
import type { Lighting } from './renderer';

// « Position inconnue » : l'arpenteur dérive au-dessus d'une mer de brume
// d'Aether. Îlots de roche suspendus, ruines d'une cité engloutie, cristaux
// luminescents, aurores, un astre pâle et, au loin, un anneau colossal brisé.
// Le portail d'Aether relie ce lieu aux déserts de Keld.

/** Hauteur de la mer de brume (m). */
export const MIST_Y = -14;

export function voidLighting(mood: Mood): Lighting {
  const night = mood === 'night';
  const L = (hex: string, k = 1): Vec3 => {
    const c = linear(hex);
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  return {
    sunDir: normalize(night ? [-0.3, 0.75, 0.55] : [0.55, 0.42, 0.5]),
    sunColor: night ? L('#9fb4ff', 0.45) : L('#ffd9f0', 1.7),
    zenith: night ? L('#0a0c26') : L('#2a2a6a'),
    horizon: night ? L('#3a2a5a') : L('#c08ad8'),
    skyMid: night ? L('#1a1a42') : L('#7a6ab8'),
    ground: night ? L('#2a3a5a') : L('#a8b8e8'),
    fog: night ? L('#2a2a4e') : L('#a08ed8'),
    fogDensity: night ? 0.0006 : 0.00032,
    night: night ? 1 : 0,
    moonDir: normalize([0.3, 0.32, -0.9]),
    sandA: L('#9a8ac8'),
    sandB: L('#c8b8f0'),
    rockA: L('#4a4058'),
    rockB: L('#7a6a8a'),
    exposure: night ? 1.8 : 1.05,
    bloom: night ? 1.3 : 0.9,
  };
}

function rng(seed: number) {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

const mat = (
  hex: string,
  p: number,
  rough = 0.85,
  metal = 0,
  emit?: number
): Mat => ({
  p,
  color: linear(hex),
  metal,
  rough,
  emit,
});

export interface VoidMeshes {
  /** Mer de brume (grand disque). */
  sea: MeshData;
  /** Lointains : aurores, astre, anneau colossal. */
  far: MeshData;
  /** Grands îlots lointains et pitons (moteur maison seulement). */
  rocks: MeshData;
  /** Îlots proches, chacun avec sa dérive (phase, amplitude). */
  /** Îlots proches : x (m) de leur centre, pour les faire défiler en boucle. */
  islands: { mesh: MeshData; phase: number; amp: number; x: number }[];
  /** Poussières lumineuses autour du navire. */
  motes: MeshData;
}

/** Un îlot de roche suspendu : plateau, ventre effilé, éboulis, cristaux, ruines. */
function island(
  b: MeshBuilder,
  r: () => number,
  x: number,
  y: number,
  z: number,
  size: number,
  night: boolean,
  ruins: boolean
) {
  const rock = mat('#5a4e66', P.ROCK, 0.9);
  const rock2 = mat('#3e3548', P.ROCK, 0.95);
  const moss = mat('#6a8a7a', P.PLAIN, 0.9);
  const stone = mat('#c8bca8', P.ROCK, 0.85);
  const crystal = mat(
    r() < 0.5 ? '#7ae8ff' : '#c89aff',
    P.EMIT,
    1,
    0,
    night ? 4 : 2.2
  );
  b.push(chain(translation(x, y, z), rotationY(r() * 6.28)));
  // Ventre en pointe, irrégulier (plusieurs cônes décalés).
  for (let k = 0; k < 3; k++) {
    const s = size * (1 - k * 0.22);
    b.push(translation((r() - 0.5) * size * 0.3, 0, (r() - 0.5) * size * 0.3));
    b.lathe(
      [
        [0, -s * (1.4 + r() * 0.6)],
        [s * 0.25, -s * 0.9],
        [s * 0.7, -s * 0.35],
        [s * 0.98, -s * 0.05],
        [s, 0],
        [0, 0.01],
      ],
      7 + k,
      k ? rock2 : rock
    );
    b.pop();
  }
  // Plateau moussu.
  b.push(translation(0, 0.01, 0));
  b.cylinder(size * 0.96, 0.6, 14, moss);
  b.pop();
  // Racines et chaînes qui pendent.
  for (let k = 0; k < 4; k++) {
    const a = r() * 6.28;
    const rr = size * (0.3 + r() * 0.5);
    const len = size * (0.6 + r());
    b.tube(
      [
        [Math.cos(a) * rr, -size * 0.2, Math.sin(a) * rr],
        [
          Math.cos(a) * rr * 0.9,
          -size * 0.2 - len * 0.5,
          Math.sin(a) * rr * 0.9 + 0.5,
        ],
        [Math.cos(a) * rr * 0.85, -size * 0.2 - len, Math.sin(a) * rr * 0.85],
      ],
      0.18 + size * 0.01,
      4,
      rock2
    );
  }
  // Cristaux d'Aether.
  const nc = 2 + Math.floor(r() * 4);
  for (let k = 0; k < nc; k++) {
    const a = r() * 6.28;
    const rr = size * r() * 0.8;
    const h = size * (0.25 + r() * 0.5);
    b.push(
      chain(
        translation(Math.cos(a) * rr, 0.3, Math.sin(a) * rr),
        rotationZ((r() - 0.5) * 0.7),
        rotationX((r() - 0.5) * 0.7)
      )
    );
    b.lathe(
      [
        [0, 0],
        [h * 0.18, h * 0.25],
        [h * 0.12, h * 0.8],
        [0, h],
      ],
      5,
      crystal
    );
    b.pop();
  }
  // Ruines : colonnes brisées, arche, dalles.
  if (ruins) {
    const nCol = 3 + Math.floor(r() * 4);
    for (let k = 0; k < nCol; k++) {
      const a = (k / nCol) * 6.28;
      const rr = size * 0.55;
      const h = size * (0.3 + r() * 0.7);
      b.push(translation(Math.cos(a) * rr, 0.6, Math.sin(a) * rr));
      b.cylinder(size * 0.07, h, 10, stone);
      b.push(translation(0, h, 0));
      b.cylinder(size * 0.1, size * 0.05, 10, stone);
      b.pop();
      b.pop();
    }
    if (r() < 0.6) {
      b.push(chain(translation(0, 0.6, 0), rotationY(r() * 3)));
      for (const sx of [-1, 1]) {
        b.push(translation(sx * size * 0.3, 0, 0));
        b.box(size * 0.12, size * 0.6, size * 0.12, stone);
        b.pop();
      }
      b.tube(
        Array.from({ length: 9 }, (_, i): Vec3 => {
          const t = Math.PI * (i / 8);
          return [
            -Math.cos(t) * size * 0.3,
            size * 0.6 + Math.sin(t) * size * 0.25,
            0,
          ];
        }).slice(0, 6 + Math.floor(r() * 3)),
        size * 0.06,
        6,
        stone
      );
      b.pop();
    }
  }
  b.pop();
}

export function voidMeshes(night: boolean): VoidMeshes {
  const r = rng(424242);
  // --- Mer de brume : disque immense, couleur et lueur selon l'heure ---------
  const sea = new MeshBuilder();
  const mist: Mat = {
    p: P.MIST,
    color: night ? linear('#5a6ab8') : linear('#d0b8ec'),
    metal: 0,
    rough: 1,
    emit: night ? 0.55 : 0.18,
  };
  sea.grid(
    48,
    24,
    (u, v) => {
      const a = u * Math.PI * 2;
      const rr = 4 + Math.pow(v, 1.6) * 3200;
      return [
        Math.cos(a) * rr,
        MIST_Y + Math.sin(a * 3 + v * 9) * 1.5 * v,
        Math.sin(a) * rr,
      ];
    },
    mist,
    { uv: (u, v) => [u * 40, v * 20], flip: true }
  );

  // --- Lointains ------------------------------------------------------------
  const far = new MeshBuilder();
  // Aurores : rideaux de rayons verticaux, plus ou moins hauts, qui ondulent.
  const auroraCols = ['#5af0d8', '#7ab8ff', '#c88aff', '#ff8ad8'];
  for (let k = 0; k < 4; k++) {
    const a0 = -1 + k * 0.5 + r() * 0.2;
    const dist = 1700 + r() * 400;
    const hBase = 260 + r() * 140;
    const col: Mat = {
      p: P.EMIT,
      color: linear(auroraCols[k % auroraCols.length]),
      metal: 0,
      rough: 1,
      emit: night ? 2.4 : 0.9,
    };
    const rays = 70;
    for (let i = 0; i < rays; i++) {
      if (r() < 0.25) continue;
      const u = i / rays;
      const a = a0 + u * 0.8;
      const d = dist + Math.sin(u * 11 + k) * 80 + Math.sin(u * 23) * 25;
      const y0 = hBase + Math.sin(u * 7 + k) * 40;
      const hh = 90 + r() * 220 * (0.5 + 0.5 * Math.sin(u * 9 + k * 2));
      const w = 6 + r() * 8;
      far.push(
        chain(translation(Math.sin(a) * d, y0, -Math.cos(a) * d), rotationY(-a))
      );
      far.box(w, hh, 1, col);
      far.pop();
    }
  }
  // Astre pâle et ses anneaux.
  far.push(translation(-900, 520, -1900));
  far.sphere(170, 32, mat('#e8dcf8', P.EMIT, 1, 0, night ? 1.6 : 0.7));
  far.push(rotationX(1.2));
  far.torus(260, 6, 64, 6, mat('#c8b8f0', P.EMIT, 1, 0, night ? 1 : 0.45));
  far.torus(300, 3, 64, 4, mat('#a8a0e8', P.EMIT, 1, 0, night ? 0.8 : 0.35));
  far.pop();
  far.pop();
  // Anneau colossal brisé, flottant au loin (le lieu du portail originel).
  {
    const stone = mat('#b8aca0', P.ROCK, 0.85);
    const rune = mat('#7ae8ff', P.EMIT, 1, 0, night ? 3 : 1.6);
    far.push(chain(translation(1150, 160, -1250), rotationY(-0.8)));
    const R = 210;
    for (let k = 0; k < 26; k++) {
      if (k === 7 || k === 8 || k === 19) continue; // brèches
      const a = (k / 26) * Math.PI * 2;
      far.push(
        chain(translation(Math.cos(a) * R, Math.sin(a) * R, 0), rotationZ(a))
      );
      far.box(22, 46, 30, stone);
      far.push(translation(11.2, 23, 0));
      far.box(1, 10, 14, rune);
      far.pop();
      far.pop();
    }
    // Fragments détachés qui dérivent dans les brèches.
    for (const k of [7.5, 19.2]) {
      const a = (k / 26) * Math.PI * 2;
      far.push(
        chain(
          translation(Math.cos(a) * (R + 40), Math.sin(a) * (R + 30), 20),
          rotationZ(a + 0.6)
        )
      );
      far.box(20, 40, 26, stone);
      far.pop();
    }
    far.pop();
  }
  const rocks = new MeshBuilder();
  // Grands îlots lointains (silhouettes).
  for (let k = 0; k < 12; k++) {
    const a = r() * Math.PI * 2;
    const d = 700 + r() * 900;
    island(
      rocks,
      r,
      Math.cos(a) * d,
      20 + r() * 220,
      Math.sin(a) * d,
      30 + r() * 60,
      night,
      r() < 0.5
    );
  }

  // --- Îlots proches (dérive animée) ------------------------------------------
  const islands: VoidMeshes['islands'] = [];
  const spots: [number, number, number, number][] = [
    [-110, 6, -130, 14],
    [70, 22, -190, 20],
    [210, -2, -80, 11],
    [-250, 30, -70, 24],
    [30, 12, -300, 18],
    [-70, 44, -400, 30],
    [320, 34, -260, 24],
    [-370, 8, -220, 14],
    [150, 56, -480, 34],
    [-300, 18, -520, 22],
    [420, 46, -420, 28],
    [-520, 52, -360, 30],
    [560, 10, -160, 18],
  ];
  spots.forEach(([x, y, z, s], k) => {
    const b = new MeshBuilder();
    island(b, r, x, y, z, s, night, k % 2 === 0);
    islands.push({ mesh: b.build(), phase: k * 1.7, amp: 1.2 + (k % 3), x });
  });

  // Pitons qui crèvent la brume, coiffés de ruines ou de cristaux.
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2;
    const d = 280 + r() * 800;
    const x = Math.cos(a) * d;
    // Côté caméra (z > 0), seulement au loin.
    const z = Math.sin(a) * d * (Math.sin(a) > 0 ? 1.6 : 1);
    const h = 20 + r() * 60;
    const w = 6 + r() * 12;
    rocks.push(translation(x, MIST_Y - 10, z));
    rocks.lathe(
      [
        [w * 1.6, 0],
        [w, h * 0.5],
        [w * 0.7, h * 0.9],
        [w * 0.9, h],
        [0, h + 0.1],
      ],
      7,
      mat('#4a4058', P.ROCK, 0.9)
    );
    rocks.pop();
    island(rocks, r, x, MIST_Y - 10 + h, z, w * 0.95, night, r() < 0.5);
  }

  // --- Poussières lumineuses -----------------------------------------------
  const motes = new MeshBuilder();
  const glow = mat('#bff6ff', P.EMIT, 1, 0, night ? 5 : 2.5);
  const glow2 = mat('#e8c8ff', P.EMIT, 1, 0, night ? 5 : 2.5);
  for (let k = 0; k < 140; k++) {
    const a = r() * Math.PI * 2;
    const d = 20 + r() * 230;
    motes.push(translation(Math.cos(a) * d, -6 + r() * 70, Math.sin(a) * d));
    motes.sphere(0.12 + r() * 0.25, 4, k % 3 ? glow : glow2);
    motes.pop();
  }

  return {
    sea: sea.build(),
    far: far.build(),
    rocks: rocks.build(),
    islands,
    motes: motes.build(),
  };
}

/** Portail d'Aether : anneau de pierres runiques, arcs de lumière, cercles. */
export function portalMesh(night: boolean): {
  frame: MeshData;
  rings: MeshData;
} {
  const b = new MeshBuilder();
  const R = 34;
  const stone = mat('#8a7e90', P.ROCK, 0.85);
  const rune = mat('#7ae8ff', P.EMIT, 1, 0, night ? 6 : 4);
  const violet = mat('#c89aff', P.EMIT, 1, 0, night ? 5 : 3.5);
  // Anneau dans le plan (y, z), traversé selon x.
  b.push(rotationZ(Math.PI / 2));
  b.torus(R, 1.6, 64, 8, rune);
  b.pop();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.push(
      chain(
        translation(0, Math.cos(a) * (R + 3), Math.sin(a) * (R + 3)),
        rotationX(-a)
      )
    );
    b.box(5, 8, 7, stone);
    b.push(translation(0, 0, 3.6));
    b.box(2.2, 4.5, 0.4, k % 2 ? rune : violet);
    b.pop();
    b.pop();
  }
  const rings = new MeshBuilder();
  for (const [rr, m] of [
    [R * 0.82, violet],
    [R * 0.6, rune],
    [R * 0.38, violet],
  ] as const) {
    rings.push(rotationZ(Math.PI / 2));
    rings.torus(rr, 0.35, 48, 5, m);
    rings.pop();
  }
  // Éclats qui tournent avec les cercles.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    rings.push(translation(0, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72));
    rings.sphere(0.8, 6, rune);
    rings.pop();
  }
  return { frame: b.build(), rings: rings.build() };
}
