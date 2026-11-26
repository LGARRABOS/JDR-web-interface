import * as THREE from 'three';
import {
  bake,
  fromPhoto,
  hexLin,
  loadPhoto,
  material,
  pfbm,
  type Photo,
} from './textures';

// Bibliothèque des matériaux de la scène de référence.

export interface RefMaterials {
  hullWood: THREE.MeshStandardMaterial;
  hullBand: THREE.MeshStandardMaterial;
  /** murailles des châteaux (sinon le bordé) */
  wall?: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  spar: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  copperSheath: THREE.MeshStandardMaterial;
  ironPlates: THREE.MeshStandardMaterial;
  castIron: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  verdigris: THREE.MeshStandardMaterial;
  canvas: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  aether: THREE.MeshStandardMaterial;
  fire: THREE.MeshStandardMaterial;
  /** proue (figure, éperon) : laiton par défaut */
  prow?: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  cliff: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bordé : la photo des planches, chaque rangée décalée (abouts en quinconce). */
function staggered(p: Photo, bounds: number[], seed: number): Photo {
  const s = p.size;
  const out: Photo = {
    size: s,
    det: new Float32Array(p.det.length),
    nx: new Float32Array(p.nx.length),
    ny: new Float32Array(p.ny.length),
    rough: new Float32Array(p.rough.length),
  };
  for (let y = 0; y < s; y++) {
    const v = (y + 0.5) / s;
    let row = 0;
    while (row < bounds.length - 2 && v >= bounds[row + 1]) row++;
    const shift = Math.floor(
      (((row * 7919 + seed * 104729) % 1000) / 1000) * s
    );
    for (let x = 0; x < s; x++) {
      const i = y * s + x;
      const j = y * s + ((x + shift) % s);
      out.det[i * 3] = p.det[j * 3];
      out.det[i * 3 + 1] = p.det[j * 3 + 1];
      out.det[i * 3 + 2] = p.det[j * 3 + 2];
      out.nx[i] = p.nx[j];
      out.ny[i] = p.ny[j];
      out.rough[i] = p.rough[j];
    }
  }
  return out;
}

const PLANK_ROWS = [
  0, 0.0996, 0.2021, 0.3037, 0.4248, 0.5273, 0.6289, 0.75, 0.8643, 1,
];

/** Tôles rivetées : renvoie (relief, joint 0..1, distance au rivet le plus proche). */
function plates(u: number, v: number, nx: number, ny: number, rivets: number) {
  const x = u * nx,
    y = v * ny;
  const row = Math.floor(y);
  const xs = x + (row % 2) * 0.5;
  const fx = xs - Math.floor(xs),
    fy = y - row;
  const ex = Math.min(fx, 1 - fx),
    ey = Math.min(fy, 1 - fy);
  const seam = Math.min(ex * 6, ey * 3, 1);
  // Rivets le long des bords (rangée intérieure).
  const inset = 0.06;
  const ry = Math.abs(ey - inset * 2);
  const rx = Math.abs(ex - inset);
  const step = 1 / rivets;
  const dAlongX = Math.abs(((fx / step) % 1) - 0.5) * step;
  const dAlongY = Math.abs((((fy * 0.5) / step) % 1) - 0.5) * step;
  const d = Math.min(Math.hypot(dAlongX, ry * 0.5), Math.hypot(rx, dAlongY));
  return { seam, d, id: (row * 31 + Math.floor(xs) * 17) % 97 };
}

/**
 * Laisse respirer la page (barre de progression) entre deux étapes lourdes.
 * Onglet caché : on enchaîne sans attendre (le navigateur y ralentit les
 * minuteries à une par seconde, ce qui allongeait le chargement d'autant).
 */
const breathe = () =>
  document.hidden
    ? Promise.resolve()
    : new Promise<void>((r) => setTimeout(r, 0));

export async function createRefMaterials(
  base: string,
  size: number,
  progress: (f: number, label: string) => void = () => {}
): Promise<RefMaterials> {
  progress(0.02, 'Chargement des textures');
  const names = [
    'wood_planks',
    'dark_wood',
    'rusty_metal_03',
    'rust_coarse_01',
    'sand_03',
    'cliff_side',
    'rock_face_03',
  ] as const;
  const ph = Object.fromEntries(
    await Promise.all(
      names.map(async (n) => [n, await loadPhoto(base, n, size)] as const)
    )
  ) as Record<(typeof names)[number], Photo>;
  const S = Math.min(size, 512);

  // Bois du bordé (planches de 30 cm) et du pont (20 cm, plus clair, calfaté).
  progress(0.12, 'Bordé du navire');
  await breathe();
  const hullWood = material(
    fromPhoto(staggered(ph.wood_planks, PLANK_ROWS, 3), '#735a45', [5.4, 2.7], {
      roughMul: 1.05,
      normal: 1.3,
      contrast: 1.15,
    }),
    { side: THREE.DoubleSide }
  );
  // Virure peinte (bleu-vert sombre) au niveau des sabords, peinture écaillée.
  progress(0.16, 'Matériaux');
  await breathe();
  const hullBand = material(
    fromPhoto(
      staggered(ph.wood_planks, PLANK_ROWS, 5),
      '#c8c8c8',
      [5.4, 2.7],
      { normal: 1.1, contrast: 0.6, roughMul: 0.8 },
      (u, v, t) => {
        const chip = pfbm(u, v, 28, 14, 3, 71);
        if (chip > 0.76) {
          const [wr, wg, wb] = hexLin('#7d5434');
          t.r = wr;
          t.g = wg;
          t.b = wb;
          t.rough = 0.85;
        }
      }
    ),
    // Peinture neutre, recolorée par la couleur du matériau (bleu-vert par défaut).
    {
      side: THREE.DoubleSide,
      color: new THREE.Color('#2d4746').multiplyScalar(1 / 0.578),
    }
  );
  progress(0.2, 'Matériaux');
  await breathe();
  const deck = material(
    fromPhoto(
      staggered(ph.wood_planks, PLANK_ROWS, 11),
      '#9c7a58',
      [3.6, 1.8],
      {
        normal: 1,
        contrast: 0.85,
      }
    )
  );
  progress(0.24, 'Matériaux');
  await breathe();
  const darkWood = material(
    fromPhoto(ph.dark_wood, '#4a2c1c', [2, 2], { roughMul: 0.75 })
  );
  progress(0.28, 'Matériaux');
  await breathe();
  const spar = material(
    fromPhoto(ph.dark_wood, '#6e4a2e', [6, 1.2], { roughMul: 0.9 })
  );
  progress(0.32, 'Matériaux');
  await breathe();
  const paint = material(
    fromPhoto(ph.dark_wood, '#1d1915', [2, 2], { roughMul: 0.8, contrast: 0.4 })
  );

  // Doublage de cuivre riveté, vert-de-gris en coulées.
  const [cuR, cuG, cuB] = hexLin('#a87c5a');
  const [vgR, vgG, vgB] = hexLin('#3f8a72');
  progress(0.36, 'Doublage de cuivre');
  await breathe();
  const copperSheath = material(
    bake(S, [3.6, 1.5], (u, v) => {
      const p = plates(u, v, 2, 2, 16);
      const n = pfbm(u, v, 6, 3, 4, 2);
      // Coulures verticales sous les joints et rivets, plus quelques plaques.
      const streak =
        pfbm(u, v, 16, 1, 3, 5) * 0.6 + pfbm(u, v, 2, 2, 3, 9) * 0.6;
      const vg = smooth(0.82, 1.02, streak + (1 - p.seam) * 0.25) * 0.8;
      const riv = 1 - smooth(0.008, 0.016, p.d);
      const tone = 0.88 + 0.22 * n + ((p.id % 7) / 7) * 0.04;
      const dark = 0.86 + 0.14 * p.seam;
      return {
        r: (cuR * tone * (1 - vg) + vgR * vg) * dark,
        g: (cuG * tone * (1 - vg) + vgG * vg) * dark,
        b: (cuB * tone * (1 - vg) + vgB * vg) * dark,
        h: p.seam * 0.004 + riv * 0.006 + n * 0.0015,
        rough: 0.5 + n * 0.2 + vg * 0.3,
        metal: 0.65 - vg * 0.55,
      };
    }),
    { side: THREE.DoubleSide }
  );

  // Tôles de fer rivetées (salle des machines, cheminée) sur la photo rouillée.
  progress(0.4, 'Tôles rivetées');
  await breathe();
  const ironPlates = material(
    fromPhoto(
      ph.rusty_metal_03,
      '#3a3634',
      [3, 1.5],
      { metal: 0.75, contrast: 0.7, normal: 0.8 },
      (u, v, t) => {
        const p = plates(u, v, 2, 2, 14);
        const riv = 1 - smooth(0.006, 0.013, p.d);
        const k = 0.55 + 0.45 * p.seam;
        t.r *= k;
        t.g *= k;
        t.b *= k;
        const rust = smooth(0.1, 0.4, t.r - t.b * 1.6);
        t.metal *= 1 - rust * 0.8;
        t.rough = Math.min(1, t.rough * 0.8 + rust * 0.2);
        return { h: p.seam * 0.004 + riv * 0.006 };
      }
    )
  );
  progress(0.44, 'Matériaux');
  await breathe();
  const castIron = material(
    fromPhoto(ph.rust_coarse_01, '#2a2624', [1.2, 1.2], {
      metal: 0.6,
      contrast: 0.6,
      roughMul: 0.9,
    })
  );

  // Laiton brossé, terni par endroits.
  const [brR, brG, brB] = hexLin('#c99a45');
  progress(0.48, 'Laiton');
  await breathe();
  const brass = material(
    bake(S, [1, 1], (u, v) => {
      const brush = pfbm(u, v, 2, 256, 3, 21);
      const tarnish = smooth(0.5, 0.8, pfbm(u, v, 5, 5, 4, 23));
      const k = (0.92 + brush * 0.16) * (1 - tarnish * 0.45);
      return {
        r: brR * k,
        g: brG * k * (1 - tarnish * 0.08),
        b: brB * k * (1 - tarnish * 0.25),
        h: brush * 0.0002,
        rough: 0.22 + brush * 0.12 + tarnish * 0.35,
        metal: 1,
      };
    })
  );

  // Cuivre martelé couvert de vert-de-gris (dôme).
  progress(0.52, 'Vert-de-gris');
  await breathe();
  const verdigris = material(
    bake(S, [1.5, 1.5], (u, v) => {
      // Alvéoles du martelage (cellules périodiques).
      const N = 14;
      let dmin = 9;
      const cx = Math.floor(u * N),
        cy = Math.floor(v * N);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i,
            gy = cy + j;
          const hx = ((gx % N) + N) % N,
            hy = ((gy % N) + N) % N;
          const px = gx + 0.5 + (pfbm(hx / N, hy / N, N, N, 1, 31) - 0.5) * 0.8;
          const py = gy + 0.5 + (pfbm(hx / N, hy / N, N, N, 1, 37) - 0.5) * 0.8;
          dmin = Math.min(dmin, Math.hypot(u * N - px, v * N - py));
        }
      const n = pfbm(u, v, 4, 4, 4, 41);
      const vg = smooth(0.25, 0.65, n + dmin * 0.25);
      return {
        r: cuR * (1 - vg) * 0.9 + vgR * vg * (0.85 + n * 0.3),
        g: cuG * (1 - vg) * 0.9 + vgG * vg * (0.85 + n * 0.3),
        b: cuB * (1 - vg) * 0.9 + vgB * vg * (0.85 + n * 0.3),
        h: -dmin * dmin * 0.003 + vg * 0.0008,
        rough: 0.35 + vg * 0.5,
        metal: 1 - vg,
      };
    })
  );

  // Toile des voiles : armure, laizes cousues tous les 75 cm, taches.
  const [caR, caG, caB] = hexLin('#e8dcc2');
  progress(0.56, 'Toile des voiles');
  await breathe();
  const canvas = material(
    bake(S, [1.5, 1.5], (u, v) => {
      const weave =
        Math.sin(u * Math.PI * 2 * 180) *
          Math.sin(v * Math.PI * 2 * 180) *
          0.5 +
        0.5;
      const sx = (u * 2) % 1;
      const seam = Math.min(Math.abs(sx - 0.5) * 2, 1);
      const band = smooth(0.94, 0.985, seam);
      const stitch = band * (Math.sin(v * Math.PI * 2 * 120) > 0.3 ? 1 : 0);
      const stain = pfbm(u, v, 3, 3, 4, 51);
      const k =
        (0.93 + weave * 0.05) *
        (1 - band * 0.12) *
        (0.88 + stain * 0.18) *
        (1 - stitch * 0.15);
      const yel = smooth(0.55, 0.9, pfbm(u, v, 2, 2, 3, 53)) * 0.12;
      return {
        r: caR * k,
        g: caG * k * (1 - yel * 0.4),
        b: caB * k * (1 - yel),
        h: weave * 0.0004 + band * 0.001,
        rough: 0.88,
        metal: 0,
      };
    }),
    { side: THREE.DoubleSide }
  );

  const rope = new THREE.MeshStandardMaterial({
    color: '#6e5a42',
    roughness: 0.95,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: '#14171a',
    roughness: 0.08,
    metalness: 0.2,
    emissive: new THREE.Color('#ffb066'),
    emissiveIntensity: 0,
  });
  const aether = new THREE.MeshStandardMaterial({
    color: '#0b2a33',
    roughness: 0.15,
    emissive: new THREE.Color('#47d9ff'),
    emissiveIntensity: 2.2,
  });

  const fire = new THREE.MeshStandardMaterial({
    color: '#3a1404',
    roughness: 1,
    emissive: new THREE.Color('#ff7a2a'),
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  // Sable : grain de la photo et petites rides du vent.
  progress(0.6, 'Sable');
  await breathe();
  const sand = material(
    fromPhoto(
      ph.sand_03,
      '#cfa886',
      [6, 6],
      { normal: 0.5, contrast: 0.9 },
      (u, v) => {
        const warp = pfbm(u, v, 3, 3, 3, 61) * 3;
        const ph2 = (u * 40 + v * 6 + warp) % 1;
        const rip = ph2 < 0.7 ? ph2 / 0.7 : (1 - ph2) / 0.3;
        return { h: rip * 0.006 };
      }
    )
  );
  progress(0.64, 'Falaises');
  await breathe();
  const cliff = material(
    fromPhoto(ph.cliff_side, '#e0cbb2', [16, 16], {
      normal: 1.5,
      contrast: 0.9,
    }),
    { vertexColors: true }
  );
  progress(0.68, 'Roche');
  await breathe();
  const rock = material(
    fromPhoto(ph.rock_face_03, '#a87350', [5, 5], { normal: 1.2 })
  );

  return {
    hullWood,
    hullBand,
    deck,
    darkWood,
    spar,
    paint,
    copperSheath,
    ironPlates,
    castIron,
    brass,
    verdigris,
    canvas,
    rope,
    glass,
    aether,
    fire,
    sand,
    cliff,
    rock,
  };
}
