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
import type { DesertId } from './environment';
import type { Lighting } from './renderer';

// Paysages des secteurs : chaque sous-région a son relief, ses lointains et
// ses curiosités (salines, canyons, cheminées de fée, cristaux, ossements
// géants, machines ensablées, oasis…). Utilisé pour la bande de décor qui
// défile autour du navire, pour les lointains et pour les voyages.

export type BiomeId =
  | 'dunes'
  | 'sel'
  | 'canyons'
  | 'cheminees'
  | 'ossements'
  | 'cristaux'
  | 'engrenages'
  | 'oasis'
  | 'ruines'
  | 'odur'
  | 'savane'
  | 'barkhanes'
  | 'volcan'
  | 'faille';

export interface Biome {
  id: BiomeId;
  /** Amplitude des dunes (1 = normale). */
  dune: number;
  /** Forme des lointains. */
  far: 'mesas' | 'aiguilles' | 'domes' | 'falaises' | 'cristaux';
  /** Teinte du sable (mélangée à la palette du désert). */
  sand?: string;
  sandMix?: number;
  /**
   * Relief propre au paysage : 0 dunes ordinaires, 1 Odur des sables
   * (fleuve de sable fin entre de hautes dunes blanches), 2 savane (plaine
   * ondulée), 3 bande de barkhanes (dunes en croissant géantes).
   */
  terrain?: number;
}

export const BIOMES: Record<BiomeId, Biome> = {
  dunes: { id: 'dunes', dune: 1.5, far: 'mesas' },
  sel: { id: 'sel', dune: 0.6, far: 'domes', sand: '#efe8da', sandMix: 0.7 },
  canyons: {
    id: 'canyons',
    dune: 1.0,
    far: 'falaises',
    sand: '#b0603a',
    sandMix: 0.35,
  },
  cheminees: {
    id: 'cheminees',
    dune: 1.0,
    far: 'aiguilles',
    sand: '#c87a4a',
    sandMix: 0.3,
  },
  ossements: {
    id: 'ossements',
    dune: 1.2,
    far: 'mesas',
    sand: '#d8c8a8',
    sandMix: 0.35,
  },
  cristaux: {
    id: 'cristaux',
    dune: 1.0,
    far: 'cristaux',
    sand: '#8a7aa8',
    sandMix: 0.3,
  },
  engrenages: {
    id: 'engrenages',
    dune: 1.1,
    far: 'mesas',
    sand: '#8a6a4a',
    sandMix: 0.35,
  },
  oasis: {
    id: 'oasis',
    dune: 1.0,
    far: 'domes',
    sand: '#d8b888',
    sandMix: 0.25,
  },
  ruines: { id: 'ruines', dune: 1.1, far: 'mesas' },
  // Mahibori — M1 : l'Odur des sables traverse les Mawarennes (dunes blanches, lagons).
  odur: {
    id: 'odur',
    dune: 1.35,
    far: 'domes',
    sand: '#f6f1e6',
    sandMix: 0.72,
    terrain: 1,
  },
  // M2 : savane des grands troupeaux, grands sylvabaobs.
  savane: {
    id: 'savane',
    dune: 1,
    far: 'mesas',
    sand: '#a99857',
    sandMix: 0.68,
    terrain: 2,
  },
  // M3 : bande de barkhanes et formations de kraigs.
  barkhanes: {
    id: 'barkhanes',
    dune: 1.1,
    far: 'aiguilles',
    sand: '#dca06a',
    sandMix: 0.3,
    terrain: 3,
  },
  // Palubori — P1 : champs volcaniques ensablés (basalte, sable gris-ocre).
  volcan: {
    id: 'volcan',
    dune: 0.9,
    far: 'mesas',
    sand: '#8c7b68',
    sandMix: 0.55,
    terrain: 4,
  },
  // P4 : faille rocheuse et étangs de la mort noire (roche rouge, fissures).
  faille: {
    id: 'faille',
    dune: 1,
    far: 'falaises',
    sand: '#b06a48',
    sandMix: 0.4,
    terrain: 5,
  },
};

const BY_SECTOR: Record<string, BiomeId> = {
  M1: 'odur',
  M2: 'savane',
  M3: 'barkhanes',
  P1: 'volcan',
  P2: 'canyons',
  P3: 'dunes',
  P4: 'faille',
  F1: 'cristaux',
  F2: 'engrenages',
  F3: 'ossements',
  F4: 'oasis',
};

/** Paysage d'une position (sous-région connue, sinon tiré d'après son nom). */
export function biomeOf(sector: string, desert: DesertId): Biome {
  const id = sector.trim().toUpperCase();
  const known = BY_SECTOR[id];
  if (known) return BIOMES[known];
  const pool: BiomeId[] =
    desert === 'mahibori'
      ? ['dunes', 'sel', 'ruines']
      : desert === 'palubori'
        ? ['cheminees', 'canyons', 'ossements']
        : desert === 'forabori'
          ? ['cristaux', 'engrenages', 'oasis']
          : ['dunes', 'ruines', 'oasis'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BIOMES[pool[h % pool.length]];
}

/** Retouche l'éclairage (couleur du sable) selon le paysage. */
export function biomeLighting(l: Lighting, b: Biome): Lighting {
  if (!b.sand || !b.sandMix) return l;
  const c = linear(b.sand);
  const k = b.sandMix;
  const mix = (v: Vec3, f = 1): Vec3 => [
    v[0] + (c[0] * f - v[0]) * k,
    v[1] + (c[1] * f - v[1]) * k,
    v[2] + (c[2] * f - v[2]) * k,
  ];
  const night = l.night > 0.5 ? 0.35 : 1;
  return {
    ...l,
    sandA: mix(l.sandA, night),
    sandB: mix(l.sandB, night * 0.85),
  };
}

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

const mat = (
  hex: string,
  p: number = P.PLAIN,
  rough = 0.9,
  metal = 0,
  emit = 0
): Mat => ({
  p,
  color: linear(hex),
  metal,
  rough,
  emit,
});

/**
 * Curiosités d'un paysage le long de x (de `x0` à `x1`), de part et d'autre
 * du cap. Côté caméra (+z), seuls de petits éléments approchent : les grands
 * restent au-delà de 180 m pour ne jamais traverser l'objectif.
 */
export function featuresMesh(
  biome: Biome,
  seed: string,
  x0: number,
  x1: number,
  opts: { night: boolean; density?: number } = { night: false }
): MeshData {
  const b = new MeshBuilder();
  const r = rng(seed + biome.id);
  const night = opts.night;
  const rockHex =
    biome.id === 'canyons' || biome.id === 'cheminees'
      ? '#9a4a2a'
      : biome.id === 'sel'
        ? '#c8c0b0'
        : biome.id === 'cristaux'
          ? '#5a4a6a'
          : '#8a5a3a';
  const rock = mat(rockHex, P.ROCK, 0.95);
  const capRock = mat('#6a4a3a', P.ROCK, 0.95);
  const bone = mat('#e4d8c0', P.PLAIN, 0.8);
  const rust = mat('#6a3a22', P.RUST, 0.8, 0.5);
  const iron = mat('#3a3430', P.IRON, 0.6, 0.7);
  const brass = mat('#b8893a', P.BRASS, 0.35, 1);
  const wood = mat('#4a3424', P.WOOD, 0.9);
  const stone = mat('#c8b08a', P.ROCK, 0.95);
  const crystal = (hex: string) =>
    mat(hex, P.GLASS, 0.15, 0, night ? 1.6 : 0.35);
  const palmLeaf = mat('#4f7a30', P.SAIL, 0.85);
  const water = mat('#1f4a5a', P.PLAIN, 0.06, 0.2);

  const blob = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    k: number,
    m = rock
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
      m,
      { flip: true }
    );
  const prism = (
    x: number,
    z: number,
    h: number,
    rad: number,
    tilt: number,
    ry: number,
    m: Mat
  ) => {
    b.push(chain(translation(x, -1.5, z), rotationY(ry), rotationZ(tilt)));
    b.lathe(
      [
        [0, -1],
        [rad, 0],
        [rad, h * 0.8],
        [0, h],
      ],
      6,
      m
    );
    b.pop();
  };
  const palm = (x: number, z: number) => {
    const h = 7 + r() * 5;
    const lean = (r() - 0.5) * 0.5;
    const trunk: Vec3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      trunk.push([x + lean * h * t * t, -1 + h * t, z]);
    }
    b.tube(trunk, 0.28, 6, mat('#7a5a3a', P.WOOD, 0.9));
    const crown = trunk[6];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + r();
      b.tube(
        [
          crown,
          [
            crown[0] + Math.cos(a) * 1.8,
            crown[1] + 0.5,
            crown[2] + Math.sin(a) * 1.8,
          ],
          [
            crown[0] + Math.cos(a) * 3.6,
            crown[1] - 1.6,
            crown[2] + Math.sin(a) * 3.6,
          ],
        ],
        0.32,
        4,
        palmLeaf
      );
    }
  };
  const wreck = (x: number, z: number) => {
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
  };
  const colonnade = (x: number, z: number) => {
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
    b.push(translation(-4, 0, -6));
    b.box(10, 4 + r() * 4, 1.4, stone);
    b.pop();
    if (r() < 0.5) {
      // Statue colossale renversée : tête de pierre à moitié ensablée.
      b.push(translation(n * 3 + 6, 1, 6));
      b.sphere(3.2, 14, stone);
      b.push(translation(0, 0.6, 3));
      b.box(1.4, 1.6, 1.2, stone);
      b.pop();
      b.pop();
    }
    b.pop();
  };
  const ribcage = (x: number, z: number) => {
    const len = 30 + r() * 30;
    const h = 10 + r() * 8;
    b.push(
      chain(
        translation(x, -2, z),
        rotationY(r() * Math.PI),
        rotationX((r() - 0.5) * 0.2)
      )
    );
    // Colonne vertébrale.
    b.tube(
      [
        [-len / 2, h * 0.9, 0],
        [0, h, 0],
        [len / 2, h * 0.7, 0],
        [len / 2 + 6, h * 0.3, 0],
      ],
      0.9,
      8,
      bone
    );
    for (let k = 0; k < 9; k++) {
      const xx = -len / 2 + (k + 0.5) * (len / 9);
      const hh = h * (0.9 + 0.1 * Math.sin((k / 9) * Math.PI));
      for (const side of [1, -1])
        b.tube(
          [
            [xx, hh, 0],
            [xx + 0.5, hh * 0.85, side * h * 0.5],
            [xx + 1, hh * 0.35, side * h * 0.62],
            [xx + 1.2, -0.5, side * h * 0.45],
          ],
          0.45,
          6,
          bone
        );
    }
    // Crâne.
    b.push(translation(-len / 2 - 5, h * 0.55, 0));
    b.push(scaling(1.6, 1, 1));
    b.sphere(3.6, 14, bone);
    b.pop();
    for (const side of [1, -1]) {
      b.push(translation(-2, 0.6, side * 1.6));
      b.sphere(1, 8, mat('#2a2018'));
      b.pop();
      b.tube(
        [
          [1, 2.5, side * 2.4],
          [4, 6, side * 4],
          [8, 7, side * 3],
        ],
        0.5,
        6,
        bone
      );
    }
    b.pop();
    b.pop();
  };
  const gear = (x: number, z: number) => {
    const R = 9 + r() * 10;
    b.push(
      chain(
        translation(x, R * 0.35 - 2, z),
        rotationY(r() * Math.PI),
        rotationX(Math.PI / 2 + (r() - 0.5) * 0.6)
      )
    );
    b.torus(R, R * 0.12, 32, 8, rust);
    const teeth = Math.round(R * 2.2);
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * Math.PI * 2;
      b.push(chain(rotationY(a), translation(R * 1.12, 0, 0)));
      b.box(R * 0.18, R * 0.22, R * 0.14, rust);
      b.pop();
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.tube(
        [
          [0, 0, 0],
          [Math.cos(a) * R, 0, Math.sin(a) * R],
        ],
        R * 0.06,
        6,
        iron
      );
    }
    b.cylinder(R * 0.18, R * 0.3, 12, brass);
    b.pop();
    // Bielle et tuyaux qui sortent du sable.
    if (r() < 0.6)
      b.tube(
        [
          [x + R, -1, z + 4],
          [x + R + 6, 8, z + 6],
          [x + R + 14, 9, z + 2],
          [x + R + 18, -1, z],
        ],
        1.1,
        10,
        iron
      );
  };
  const hoodoo = (x: number, z: number) => {
    const h = 12 + r() * 22;
    let y = -1;
    let rad = 3 + r() * 3;
    for (let k = 0; k < 4; k++) {
      const hh = h / 4;
      blob(x, y + hh / 2, z, rad, hh * 0.62, rad, x + k);
      y += hh * 0.9;
      rad *= 0.78;
    }
    blob(x, y + 1.2, z, rad * 2.2, 1.6, rad * 2.1, x + 9, capRock);
  };
  const crust = (x: number, z: number) => {
    for (let k = 0; k < 6; k++) {
      b.push(
        chain(
          translation(x + (r() - 0.5) * 40, -1.3, z + (r() - 0.5) * 40),
          rotationY(r() * 3)
        )
      );
      b.lathe(
        [
          [0, 0.15],
          [4 + r() * 6, 0],
        ],
        6,
        mat('#f4f0e6', P.PLAIN, 0.6)
      );
      b.pop();
    }
  };
  const crystals = (x: number, z: number, big: boolean) => {
    const hues =
      biome.id === 'sel'
        ? ['#e8f0f4', '#d8e8f0']
        : ['#b07ad8', '#7ab0e8', '#d87ab8'];
    const n = big ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const h = (big ? 10 : 3) + r() * (big ? 18 : 5);
      prism(
        x + (r() - 0.5) * (big ? 14 : 6),
        z + (r() - 0.5) * (big ? 14 : 6),
        h,
        h * 0.14,
        (r() - 0.5) * 0.8,
        r() * 3,
        crystal(hues[k % hues.length])
      );
    }
  };
  const oasis = (x: number, z: number) => {
    const R = 14 + r() * 14;
    b.push(translation(x, -1.35, z));
    b.lathe(
      [
        [0, 0.05],
        [R, 0],
      ],
      24,
      water
    );
    b.lathe(
      [
        [R, 0.02],
        [R + 5, -0.1],
      ],
      24,
      mat('#6a7a3a', P.PLAIN, 0.9)
    );
    b.pop();
    for (let k = 0; k < 8; k++) {
      const a = r() * Math.PI * 2;
      palm(
        x + Math.cos(a) * (R + 2 + r() * 4),
        z + Math.sin(a) * (R + 2 + r() * 4)
      );
    }
    // Tente de nomades.
    b.push(chain(translation(x + R + 10, -1, z), rotationY(r() * 3)));
    b.lathe(
      [
        [4, 0],
        [0.2, 3.5],
        [0, 3.6],
      ],
      6,
      mat('#c8b08a', P.SAIL, 0.9)
    );
    b.pop();
  };

  type Item = { tall: boolean; place: (x: number, z: number) => void };
  const items: Item[] = [];
  const add = (
    w: number,
    tall: boolean,
    place: (x: number, z: number) => void
  ) => {
    for (let k = 0; k < w; k++) items.push({ tall, place });
  };
  const rockField = (x: number, z: number) => {
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
  };
  const spur = (x: number, z: number) => {
    const h = 14 + r() * 26;
    if (r() < 0.4) {
      const w = 14 + r() * 12;
      blob(x - w / 2, h * 0.45, z, 4, h * 0.55, 4.5, x);
      blob(x + w / 2, h * 0.45, z, 4, h * 0.55, 4.5, x + 1);
      blob(x, h * 0.95, z, w * 0.62, 3.2, 4, x + 2);
    } else blob(x, h * 0.35, z, 6 + r() * 8, h * 0.6, 6 + r() * 6, x);
  };
  const wall = (x: number, z: number) => {
    // Paroi de canyon : longue échine rocheuse en gradins.
    const L = 60 + r() * 60;
    for (let k = 0; k < 5; k++)
      blob(
        x + (k - 2) * L * 0.2,
        10 + r() * 14,
        z + (r() - 0.5) * 8,
        L * 0.14,
        16 + r() * 14,
        9,
        x + k * 3
      );
  };
  switch (biome.id) {
    case 'dunes':
      add(3, false, rockField);
      add(1, true, wreck);
      add(1, true, spur);
      break;
    case 'sel':
      add(4, false, crust);
      add(2, false, (x, z) => crystals(x, z, false));
      add(1, true, (x, z) => crystals(x, z, true));
      break;
    case 'canyons':
      add(3, true, wall);
      add(2, true, spur);
      add(1, false, rockField);
      break;
    case 'cheminees':
      add(4, true, hoodoo);
      add(1, false, rockField);
      break;
    case 'ossements':
      add(3, true, ribcage);
      add(1, false, rockField);
      add(1, true, wreck);
      break;
    case 'cristaux':
      add(3, true, (x, z) => crystals(x, z, true));
      add(2, false, (x, z) => crystals(x, z, false));
      add(1, false, rockField);
      break;
    case 'engrenages':
      add(3, true, gear);
      add(1, true, wreck);
      add(1, false, rockField);
      break;
    case 'oasis':
      add(2, true, oasis);
      add(2, false, (x, z) => palm(x, z));
      add(1, false, rockField);
      break;
    case 'odur':
      add(2, false, rockField);
      break;
    case 'savane':
      add(2, false, (x, z) => palm(x, z));
      add(1, true, oasis);
      break;
    case 'barkhanes':
      add(3, true, spur);
      add(2, false, rockField);
      break;
    case 'volcan':
      add(3, false, rockField);
      add(1, true, spur);
      break;
    case 'faille':
      add(2, true, spur);
      add(2, false, rockField);
      break;
    case 'ruines':
      add(3, true, colonnade);
      add(1, true, spur);
      add(1, false, rockField);
      break;
  }
  const step = 80 / (opts.density ?? 1);
  for (let x = x0 + r() * step; x < x1; x += step * (0.6 + r() * 0.9)) {
    const it = items[Math.floor(r() * items.length)];
    const camSide = r() < 0.3;
    let z: number;
    if (camSide) z = it.tall ? 185 + r() * 110 : 35 + r() * 140;
    else z = -(35 + Math.pow(r(), 1.4) * 230);
    it.place(x, z);
  }
  return b.build();
}

/** Longueur (m) d'une bande de lointains, répétée le long de la route. */
export const FAR_PERIOD = 3200;

/**
 * Lointains du paysage : mesas, aiguilles, dômes, falaises ou flèches de cristal,
 * posés de part et d'autre de la route sur une bande de FAR_PERIOD mètres qui se
 * répète sans couture : le navire s'en approche et les dépasse.
 */
export function farMesh(biome: Biome, night: boolean): MeshData {
  const b = new MeshBuilder();
  const r = rng('far' + biome.id);
  const rock = mat(
    biome.far === 'cristaux'
      ? '#4a3a5a'
      : biome.id === 'sel'
        ? '#b8b0a0'
        : '#7a4a30',
    P.ROCK,
    0.95
  );
  const n = biome.far === 'falaises' ? 18 : biome.far === 'aiguilles' ? 40 : 28;
  for (let k = 0; k < n; k++) {
    // Allongées le long de la route, un côté sur deux, loin du passage.
    const ang = (r() - 0.5) * 0.5;
    const cx = ((k + r() * 0.8) / n) * FAR_PERIOD;
    const cz = (k % 2 ? 1 : -1) * (800 + r() * 800);
    const w = 60 + r() * 180;
    const h = 40 + r() * 80;
    let prof: [number, number][];
    switch (biome.far) {
      case 'aiguilles':
        prof = [
          [0.62, -30],
          [0.46, h * 0.25],
          [0.32, h * 0.7],
          [0.2, h * 1.2],
          [0.08, h * 1.5],
          [0, h * 1.55],
        ];
        break;
      case 'domes':
        prof = [
          [1.3, -30],
          [1.1, h * 0.2],
          [0.9, h * 0.45],
          [0.6, h * 0.62],
          [0.25, h * 0.7],
          [0, h * 0.72],
        ];
        break;
      case 'falaises':
        prof = [
          [1.6, -30],
          [1.3, h * 0.2],
          [1.05, h * 0.6],
          [1.0, h],
          [0.4, h * 1.02],
          [0, h * 1.03],
        ];
        break;
      case 'cristaux':
        prof = [
          [0.6, -30],
          [0.4, h * 0.5],
          [0.2, h * 1.6],
          [0, h * 2],
        ];
        break;
      default:
        prof = [
          [1.6, -30],
          [1.32, h * 0.12],
          [1.1, h * 0.34],
          [1.0, h * 0.64],
          [0.93, h],
          [0, h * 1.03],
        ];
    }
    const stretch = biome.far === 'falaises' ? 2.6 : 1;
    const segs = biome.far === 'cristaux' ? 6 : 48;
    const m =
      biome.far === 'cristaux'
        ? mat(
            ['#8a5ab8', '#5a8ac8', '#b85a9a'][k % 3],
            P.GLASS,
            0.2,
            0,
            night ? 0.9 : 0.15
          )
        : rock;
    const nP = prof.length - 1;
    b.grid(
      segs,
      nP * 3,
      (u, v) => {
        const f = v * nP;
        const i = Math.min(nP - 1, Math.floor(f));
        const t = f - i;
        const r0 = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t;
        const y0 = prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t;
        const a = u * Math.PI * 2;
        const wob =
          1 + 0.08 * Math.sin(a * 5 + k) + 0.04 * Math.sin(a * 13 + k * 2);
        const rr = w * r0 * (segs > 6 ? wob : 1);
        // Allongées perpendiculairement au rayon (falaises en barrière).
        const ex = Math.cos(a) * rr * stretch;
        const ez = Math.sin(a) * rr * 0.55;
        return [
          cx + ex * Math.cos(ang) - ez * Math.sin(ang),
          y0,
          cz + ex * Math.sin(ang) + ez * Math.cos(ang),
        ];
      },
      m,
      { flip: true }
    );
  }
  return b.build();
}
