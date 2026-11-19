import { MeshBuilder, P, type MeshData } from './geometry';
import { linear, normalize, type Vec3 } from './math';
import type { Lighting } from './renderer';

// Décor : dunes (relief calculé dans le shader), mesas lointaines,
// engrenage géant ensablé ; éclairage selon le désert et l'heure.

export type DesertId = 'mahibori' | 'palubori' | 'forabori' | 'keld';
export type Mood = 'dusk' | 'night';

export function terrainMesh(): MeshData {
  const b = new MeshBuilder();
  const sand = {
    p: P.SAND,
    color: [0.6, 0.45, 0.3] as Vec3,
    metal: 0,
    rough: 0.95,
  };
  // Grille plus fine près de la caméra, plus lâche au loin.
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = -1; i <= 1; i += 1 / 90)
    xs.push(Math.sign(i) * Math.abs(i) ** 1.6 * 700);
  for (let j = -1; j <= 1; j += 1 / 70)
    zs.push(Math.sign(j) * Math.abs(j) ** 1.6 * 700);
  const nx = xs.length;
  const base = b.vertexCount;
  for (const z of zs)
    for (const x of xs) b.vertex([x, 0, z], [0, 1, 0], [x, z], sand);
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = base + j * nx + i;
      b.quad(a, a + nx, a + nx + 1, a + 1);
    }
  return b.build();
}

const wobble = (a: number, k: number) =>
  1 +
  0.14 * Math.sin(a * 3 + k) +
  0.08 * Math.sin(a * 7 + k * 2.3) +
  0.05 * Math.sin(a * 13 + k * 5.1);

/** Mesas érodées, en arc de cercle au loin. */
export function mesasMesh(): MeshData {
  const b = new MeshBuilder();
  const rock = {
    p: P.ROCK,
    color: [0.4, 0.25, 0.15] as Vec3,
    metal: 0,
    rough: 0.95,
  };
  const spots: [number, number, number, number][] = [
    [-1.25, 820, 170, 70],
    [-0.9, 700, 110, 52],
    [-0.62, 900, 220, 96],
    [-0.3, 760, 90, 44],
    [-0.08, 980, 260, 118],
    [0.22, 820, 140, 64],
    [0.48, 720, 100, 50],
    [0.8, 950, 240, 104],
    [1.1, 780, 120, 58],
    [1.4, 860, 160, 72],
  ];
  spots.forEach(([ang, dist, w, h0], k) => {
    let h = h0;
    const cx = Math.sin(ang) * dist * 1.25;
    const cz = -Math.cos(ang) * dist * 1.25;
    h *= 0.62;
    // Profil : talus d'éboulis, falaise en gradins, plateau.
    const prof: [number, number][] = [
      [1.5, -8],
      [1.32, h * 0.12],
      [1.18, h * 0.3],
      [1.1, h * 0.34],
      [1.04, h * 0.58],
      [1.0, h * 0.64],
      [0.97, h * 0.92],
      [0.93, h],
      [0.5, h * 1.02],
      [0, h * 1.03],
    ];
    const nP = prof.length - 1;
    b.grid(
      64,
      nP * 4,
      (u, v) => {
        const f = v * nP;
        const i = Math.min(nP - 1, Math.floor(f));
        const t = f - i;
        const r0 = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * t;
        const y0 = prof[i][1] + (prof[i + 1][1] - prof[i][1]) * t;
        const a = u * Math.PI * 2;
        const wob =
          wobble(a, k * 3.7) *
          (1 + 0.035 * Math.sin(a * 23 + y0 * 0.3 + k) * (v < 0.85 ? 1 : 0));
        const r = w * wob * r0;
        return [
          cx + Math.cos(a) * r,
          y0 + Math.sin(a * 17 + k) * h * 0.012 * (v > 0.1 && v < 0.85 ? 1 : 0),
          cz + Math.sin(a) * r * 0.55,
        ];
      },
      rock,
      { uv: (u, v) => [u * 400, v * h], flip: true }
    );
  });
  return b.build();
}

/** Rochers épars (sphères bosselées), pour donner de la profondeur. */
export function rocksMesh(): MeshData {
  const b = new MeshBuilder();
  const rock = {
    p: P.ROCK,
    color: [0.4, 0.25, 0.15] as Vec3,
    metal: 0,
    rough: 0.95,
  };
  const spots: [number, number, number][] = [
    [300, -260, 7],
    [-340, -300, 9],
    [420, -200, 5],
  ];
  spots.forEach(([x, z, r], k) => {
    b.grid(
      18,
      10,
      (u, v) => {
        const a = u * Math.PI * 2;
        const p = (v - 0.15) * Math.PI;
        const rr =
          r *
          (1 +
            0.25 * Math.sin(a * 3 + k) * Math.cos(p * 2) +
            0.12 * Math.sin(a * 7 + p * 5 + k));
        return [
          x + Math.cos(a) * Math.cos(p) * rr * 1.3,
          -1.5 + Math.sin(p) * rr * 0.7 + r * 0.2,
          z + Math.sin(a) * Math.cos(p) * rr,
        ];
      },
      rock,
      { uv: (u, v) => [u * r * 6, v * r * 3], flip: true }
    );
  });
  return b.build();
}

interface Palette {
  zenith: string;
  mid?: string;
  horizon: string;
  ground: string;
  sun: string;
  sandA: string;
  sandB: string;
  rockA: string;
  rockB: string;
}

const DUSK: Record<DesertId, Palette> = {
  mahibori: {
    zenith: '#3a69a8',
    mid: '#e8d2b0',
    horizon: '#eab088',
    ground: '#8a6a4c',
    sun: '#ffd2a0',
    sandA: '#b98a5c',
    sandB: '#d8b083',
    rockA: '#7a5a46',
    rockB: '#a88064',
  },
  palubori: {
    zenith: '#41609a',
    mid: '#f0cfa0',
    horizon: '#f09a62',
    ground: '#8a4e34',
    sun: '#ffc48a',
    sandA: '#b05f36',
    sandB: '#d48a58',
    rockA: '#6e3424',
    rockB: '#9c5434',
  },
  forabori: {
    zenith: '#46509a',
    mid: '#ecc8bc',
    horizon: '#e8a094',
    ground: '#7a5664',
    sun: '#ffd0bc',
    sandA: '#a8787c',
    sandB: '#c89c9a',
    rockA: '#5e4256',
    rockB: '#8e6878',
  },
  keld: {
    zenith: '#3f64a4',
    mid: '#f0d6aa',
    horizon: '#f0b072',
    ground: '#8c6c50',
    sun: '#ffd09a',
    sandA: '#c09264',
    sandB: '#dcb682',
    rockA: '#7c5e46',
    rockB: '#a6825e',
  },
};

const NIGHT: Record<DesertId, Palette> = {
  mahibori: {
    zenith: '#020812',
    horizon: '#1a3150',
    ground: '#141c28',
    sun: '#9fb8e0',
    sandA: '#5a6478',
    sandB: '#7a8498',
    rockA: '#2a3040',
    rockB: '#3a4256',
  },
  palubori: {
    zenith: '#06030a',
    horizon: '#3a1e2c',
    ground: '#1e1418',
    sun: '#e0b0a0',
    sandA: '#6a4a4a',
    sandB: '#8a6460',
    rockA: '#3a2228',
    rockB: '#4e3034',
  },
  forabori: {
    zenith: '#05030f',
    horizon: '#2e2048',
    ground: '#18142a',
    sun: '#c0b0f0',
    sandA: '#5e5070',
    sandB: '#7e6e90',
    rockA: '#2e2640',
    rockB: '#3e3454',
  },
  keld: {
    zenith: '#04050c',
    horizon: '#252a48',
    ground: '#16182a',
    sun: '#b8c0f0',
    sandA: '#605e74',
    sandB: '#807e94',
    rockA: '#2c2c40',
    rockB: '#3c3c52',
  },
};

export function lighting(desert: DesertId, mood: Mood): Lighting {
  const p = (mood === 'night' ? NIGHT : DUSK)[desert];
  const night = mood === 'night';
  const sunColor = linear(p.sun);
  const k = night ? 0.25 : 2.1;
  return {
    sunDir: night ? normalize([-0.35, 0.6, 0.7]) : normalize([0.92, 0.2, 0.32]),
    sunColor: [sunColor[0] * k, sunColor[1] * k, sunColor[2] * k],
    zenith: linear(p.zenith),
    horizon: linear(p.horizon),
    skyMid: linear(p.mid ?? (night ? p.horizon : p.horizon)),
    ground: linear(p.ground),
    fog: linear(p.horizon),
    fogDensity: night ? 0.0007 : 0.0008,
    night: night ? 1 : 0,
    moonDir: normalize([0.16, 0.115, -0.98]),
    sandA: linear(p.sandA),
    sandB: linear(p.sandB),
    rockA: linear(p.rockA),
    rockB: linear(p.rockB),
    exposure: night ? 1.9 : 1.0,
    bloom: night ? 1.0 : 0.65,
  };
}
