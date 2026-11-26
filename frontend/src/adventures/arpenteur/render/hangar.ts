import { MeshBuilder, P, type Mat, type MeshData } from './geometry';
import {
  chain,
  linear,
  rotationX,
  rotationY,
  rotationZ,
  translation,
  type Vec3,
} from './math';
import type { CrewMember } from './shipModel';

// Hangar de l'équipage : grande nef fermée de brique et de fer où l'arpenteur
// est mis en cale pour ses travaux. Le navire est au centre (proue vers +x) ;
// on entre par les portes télescopiques du bout -x, on repart par celles du
// bout +x. Le toit plein porte des verrières (maillage à part, qui ne fait
// pas d'ombre) : le jour, le soleil y passe en bandes ; la nuit, ce sont les
// lampes. Ambiance d'atelier : charpente rivetée, pont roulant, passerelles,
// chaudières, forge, établis, pièces de rechange, ouvriers au travail.

export interface HangarOptions {
  /** Longueur et demi-largeur de la coque (m). */
  length: number;
  halfBeam: number;
  /** Hauteur du navire en cale (centre) et du haut de sa mâture (m). */
  hover: number;
  shipTop: number;
  night: boolean;
  /** Teinte des briques (celle de la ville). */
  brick: Vec3;
  seed: string;
}

/** Dimensions intérieures du hangar (m), partagées avec la scène. */
export interface HangarDims {
  /** Demi-longueur (le long de x) et demi-largeur (le long de z). */
  hx: number;
  hz: number;
  /** Hauteur des murs, du faîte, et ouverture des portes (demi-largeur, hauteur). */
  wall: number;
  ridge: number;
  doorHalf: number;
  doorH: number;
}

export interface HangarData {
  /** Bâtiment et aménagements : opaques, font de l'ombre. */
  shell: MeshData;
  /** Verrières du toit : laissent passer le soleil. */
  glass: MeshData;
  /** Un vantail de porte (centré en z, pied au sol), dessiné huit fois. */
  door: MeshData;
  /** Amarres et passerelles vers le navire. */
  moor: MeshData;
  crowd: CrewMember[];
  dims: HangarDims;
}

export const HANGAR_GROUND = -1;
/** Largeur d'un vantail : deux vantaux télescopiques par côté. */
export const DOOR_LEAF = 8;

export function hangarDims(o: { length: number; shipTop: number }): HangarDims {
  const doorH = o.shipTop + 9;
  return {
    hx: o.length / 2 + 34,
    hz: 50,
    wall: 16,
    ridge: Math.max(58, doorH + 13),
    doorHalf: DOOR_LEAF * 2,
    doorH,
  };
}

/**
 * La caméra peut-elle être en (x, y, z) (repère du hangar) ? Dedans : sous
 * la charpente, en deçà des passerelles, au-dessus du sol ; elle franchit
 * les pignons par les portes ; dehors, au-delà des pignons, rien ne la gêne.
 */
export function hangarRoom(
  d: HangarDims,
  x: number,
  y: number,
  z: number,
  doors: readonly [number, number] = [0, 0]
) {
  const ax = Math.abs(x);
  // Dehors, au-delà des pignons : à l'air libre. Dans l'épaisseur du
  // pignon : seulement par la partie ouverte des portes (fermées, rien ne
  // passe : la caméra ne sort pas derrière elles).
  if (ax > d.hx + 2.5) return true;
  if (ax > d.hx - 3) {
    const open = doors[x < 0 ? 0 : 1];
    const half = (d.doorHalf - 1.5) * Math.min(1, open * 1.15);
    return (
      open > 0.05 &&
      Math.abs(z) < half &&
      y > HANGAR_GROUND + 2 &&
      y < HANGAR_GROUND + d.doorH - 2
    );
  }
  const zi = d.hz - 6.5;
  if (Math.abs(z) > zi) return false;
  const inset = 2.6;
  const zz = Math.min(1, Math.abs(z) / (d.hz - inset));
  const ceil =
    HANGAR_GROUND +
    d.wall +
    (d.ridge - d.wall - inset) * Math.sqrt(Math.max(0, 1 - zz * zz)) -
    3;
  return y > HANGAR_GROUND + 2 && y < ceil;
}

/**
 * Vantaux d'une porte (bout `end` : -1 entrée, +1 sortie) pour une ouverture
 * 0..1 : décalage en z de chaque vantail. Les vantaux intérieurs (au centre)
 * glissent deux fois plus loin que les extérieurs, et passent devant eux.
 */
export function doorLeaves(
  d: HangarDims,
  end: -1 | 1,
  open: number
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const side of [-1, 1])
    for (const k of [0, 1]) {
      const z0 = side * (DOOR_LEAF * (k + 0.5));
      const slide = side * DOOR_LEAF * (2 - k) * open;
      out.push({
        x: end * (d.hx + 0.55 + (1 - k) * 1.0),
        z: z0 + slide,
      });
    }
  return out;
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function hangarMesh(o: HangarOptions): HangarData {
  const b = new MeshBuilder();
  const g = new MeshBuilder();
  const m = new MeshBuilder();
  const r = rng('hangar' + o.seed);
  const d = hangarDims(o);
  const G = HANGAR_GROUND;
  const FL = G + 0.45; // dessus du dallage
  const { hx, hz, wall, ridge } = d;
  const H = ridge - wall;
  const L = o.length;
  const hb = o.halfBeam;
  const top = o.hover; // pont du navire en cale (quai de travail)
  const night = o.night;

  const mat = (hex: string, p: number, rough = 0.85, metal = 0): Mat => ({
    p,
    color: linear(hex),
    metal,
    rough,
  });
  const brick: Mat = { p: P.BRICK, color: o.brick, metal: 0, rough: 0.95 };
  const brickDark: Mat = {
    p: P.BRICK,
    color: [o.brick[0] * 0.62, o.brick[1] * 0.58, o.brick[2] * 0.55],
    metal: 0,
    rough: 0.95,
  };
  const stone = mat('#a39276', P.ROCK, 0.9);
  const iron = mat('#2e2a27', P.IRON, 0.55, 0.75);
  const ironRed = mat('#5a2a20', P.IRON, 0.6, 0.5);
  const plates = mat('#3c3631', P.PLATES, 0.6, 0.7);
  const rust = mat('#6a3e26', P.RUST, 0.8, 0.3);
  const brass = mat('#b8893a', P.BRASS, 0.35, 1);
  const copper = mat('#a8603a', P.COPPER, 0.4, 1);
  const wood = mat('#6a4a2e', P.WOOD, 0.85);
  const woodDark = mat('#3e2a1c', P.WOOD, 0.85);
  const plank = mat('#8a6a44', P.DECK, 0.85);
  const canvas = mat('#d8c8a6', P.SAIL, 0.9);
  const paint = mat('#d8a030', P.PLAIN, 0.7);
  const paper = mat('#e8dcc0', P.PLAIN, 0.9);
  const emit = (hex: string, day: number, nightE: number): Mat => ({
    p: P.EMIT,
    color: linear(hex),
    metal: 0,
    rough: 1,
    emit: night ? nightE : day,
  });
  const lamp = emit('#ffbe6a', 0.9, 5);
  const coals = emit('#ff6a1a', 3, 6);
  const sparks = emit('#ffe2a0', 6, 9);
  const skyPane: Mat = {
    p: P.EMIT,
    color: night ? linear('#24304a') : linear('#c4d2d6'),
    metal: 0,
    rough: 1,
    emit: night ? 0.25 : 1.1,
  };

  /** Profil du berceau du toit : hauteur de l'intrados en z. */
  const roofY = (z: number, inset = 0) => {
    const zz = Math.min(1, Math.abs(z) / (hz - inset));
    return wall + (H - inset) * Math.sqrt(Math.max(0, 1 - zz * zz));
  };
  const at = (x: number, y: number, z: number, f: () => void, ry = 0) => {
    b.push(chain(translation(x, y, z), rotationY(ry)));
    f();
    b.pop();
  };
  const boxAt = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    dd: number,
    mt: Mat,
    ry = 0
  ) => at(x, y, z, () => b.box(w, h, dd, mt), ry);
  const rod = (a: Vec3, c: Vec3, rr: number, mt: Mat, bb = b) =>
    bb.tube([a, c], rr, 6, mt);

  // --- Sol : dallage, lignes peintes, rails et caniveaux ----------------------
  boxAt(0, G, 0, hx * 2 + 4, 0.45, hz * 2 + 4, stone);
  for (const sz of [-1, 1]) {
    // Lignes de sécurité jaunes de part et d'autre de la cale.
    boxAt(0, FL, sz * (hb + 7), hx * 2 - 6, 0.03, 0.5, paint);
    // Hachures aux entrées.
    for (const ex of [-1, 1])
      for (let k = 0; k < 6; k++)
        boxAt(
          ex * (hx - 6) + (k - 2.5) * 0.1,
          FL,
          sz * (4 + k * 2.4),
          5,
          0.03,
          0.45,
          paint,
          0.7 * sz
        );
    // Caniveaux à grilles le long des murs.
    boxAt(0, FL, sz * (hz - 3.5), hx * 2 - 4, 0.04, 1.2, iron);
  }
  // Rails de halage dans l'axe (le navire entre en glissant au-dessus).
  for (const sz of [-1, 1]) boxAt(0, FL, sz * 2.4, hx * 2 + 4, 0.12, 0.3, iron);

  // --- Murs de brique, pilastres, bandeaux, fenêtres hautes -------------------
  const bays = Math.max(6, Math.round((hx * 2) / 10));
  const bayX = (k: number) => -hx + (hx * 2 * k) / bays;
  for (const sz of [-1, 1]) {
    // Mur gouttereau (épais) avec soubassement de pierre.
    boxAt(0, G, sz * (hz + 1), hx * 2 + 2, wall + 1, 2, brick);
    boxAt(0, G, sz * (hz - 0.1), hx * 2, 1.4, 0.6, stone);
    boxAt(0, G + wall - 0.4, sz * (hz - 0.1), hx * 2, 0.8, 0.8, stone);
    for (let k = 0; k <= bays; k++) {
      const x = bayX(k);
      // Pilastre intérieur et contrefort extérieur.
      boxAt(x, G, sz * (hz - 0.7), 2.2, wall, 1.4, brickDark);
      boxAt(x, G + wall - 1.6, sz * (hz - 1.3), 2.6, 1.2, 2.2, stone);
      boxAt(x, G, sz * (hz + 2.6), 2.6, wall + 2, 2.4, brickDark);
      if (k < bays) {
        const xm = (x + bayX(k + 1)) / 2;
        // Fenêtres hautes en plein cintre (vitrage éclairé de l'intérieur).
        boxAt(xm, G + wall - 7.5, sz * (hz - 0.05), 4.2, 5, 0.12, skyPane);
        at(xm, G + wall - 2.5, sz * (hz - 0.05), () => {
          b.push(rotationX(Math.PI / 2));
          b.cylinder(2.1, 0.12, 14, skyPane);
          b.pop();
        });
        for (const dx of [-0.7, 0.7])
          boxAt(
            xm + dx,
            G + wall - 7.5,
            sz * (hz - 0.15),
            0.12,
            6.6,
            0.12,
            iron
          );
        boxAt(xm, G + wall - 5, sz * (hz - 0.15), 4.2, 0.12, 0.12, iron);
        // Conduites de vapeur le long du mur, avec vannes.
        for (const yy of [3.2, 4.4])
          rod(
            [x + 1.2, G + yy, sz * (hz - 1.6 - yy * 0.1)],
            [bayX(k + 1) - 1.2, G + yy, sz * (hz - 1.6 - yy * 0.1)],
            0.22,
            yy > 4 ? copper : rust
          );
        if (k % 2 === 0)
          at(xm, G + 4.4, sz * (hz - 2.4), () => {
            b.push(rotationX(Math.PI / 2));
            b.torus(0.45, 0.07, 10, 4, ironRed);
            b.pop();
            b.cylinder(0.08, 0.5, 6, iron);
          });
        // Applique murale.
        at(x, G + wall - 4, sz * (hz - 1.6), () => {
          b.box(0.15, 0.6, 0.15, iron);
          b.push(translation(0, -0.3, -sz * 0.5));
          b.sphere(0.32, 8, lamp);
          b.pop();
        });
      }
    }
  }
  // Pignons : murs d'extrémité, ouverture des portes, cadre de fer.
  for (const ex of [-1, 1]) {
    const x = ex * (hx + 0.6);
    const dh = d.doorH;
    const dw = d.doorHalf;
    // Parties pleines de part et d'autre de l'ouverture, jusqu'au toit.
    for (const sz of [-1, 1])
      b.grid(
        8,
        6,
        (u, v) => {
          const z = sz * (dw + 1 + (hz + 1 - dw - 1) * u);
          return [x, G + (roofY(z) - G + 0.4) * v, z];
        },
        brick,
        { uv: (u, v) => [u * (hz - dw), v * ridge] }
      );
    // Tympan au-dessus de l'ouverture.
    b.grid(
      8,
      3,
      (u, v) => {
        const z = -dw - 1 + (dw * 2 + 2) * u;
        return [x, G + dh + 1 + (roofY(z) + 0.4 - dh - 1 - G) * v, z];
      },
      brick,
      { uv: (u, v) => [u * dw * 2, v * 10] }
    );
    // Cadre du portail : poteaux et linteau rivetés, rail de roulement.
    for (const sz of [-1, 1]) {
      boxAt(x, G, sz * (dw + 0.6), 1.6, dh + 2, 1.6, ironRed);
      boxAt(x + ex * 0.85, G, sz * (dw + 0.6), 0.2, dh + 2, 0.5, brass);
    }
    boxAt(x, G + dh, 0, 1.8, 2.2, dw * 2 + 3, ironRed);
    boxAt(x + ex * 0.95, G + dh + 0.9, 0, 0.2, 0.4, dw * 2 + 3, brass);
    // Rails haut et bas des vantaux (ils glissent jusqu'à ±3 vantaux).
    for (const k of [0, 1]) {
      const xr = ex * (hx + 0.55 + (1 - k) * 1.0) + ex * 0.6;
      boxAt(xr, G + dh + 0.2, 0, 0.35, 0.5, dw * 4 + 4, iron);
      boxAt(xr - ex * 0.6, FL - 0.3, 0, 0.6, 0.35, dw * 4 + 4, iron);
    }
    // Médaillon : roue dentée de laiton et fanaux au-dessus du portail.
    at(x + ex * 0.9, G + dh + 7, 0, () => {
      b.push(rotationZ(Math.PI / 2));
      b.cylinder(3.2, 0.4, 24, brass);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        b.push(translation(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5));
        b.box(0.8, 0.4, 0.8, brass);
        b.pop();
      }
      b.cylinder(1.1, 0.7, 14, iron);
      b.pop();
    });
    for (const sz of [-1, 1])
      at(x + ex * 1.2, G + dh - 3, sz * (dw + 3), () => {
        b.box(0.5, 0.5, 0.5, iron);
        b.push(translation(ex * 0.6, -0.9, 0));
        b.sphere(0.6, 10, lamp);
        b.pop();
      });
  }

  // --- Charpente : arcs en treillis rivetés, pannes, contreventements ---------
  const arcPts = (x: number, inset: number, n = 28): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = Math.PI * (i / n);
      const z = -Math.cos(t) * (hz - 0.6 - inset);
      pts.push([x, G + roofY(z, inset) - 0.4, z]);
    }
    return pts;
  };
  for (let k = 0; k <= bays; k++) {
    const x = bayX(k);
    const outer = arcPts(x, 0);
    const inner = arcPts(x, 2.6);
    b.tube(outer, 0.34, 6, iron);
    b.tube(inner, 0.26, 6, iron);
    for (let i = 0; i < outer.length - 1; i++) {
      rod(outer[i], inner[i], 0.09, iron);
      rod(outer[i], inner[i + 1], 0.09, iron);
      // Goussets rivetés aux nœuds.
      if (i % 4 === 0)
        at(inner[i][0], inner[i][1], inner[i][2], () =>
          b.box(0.25, 0.7, 0.7, ironRed)
        );
    }
    // Lampes suspendues sous les arcs (au-dessus des passerelles et de l'axe).
    for (const zl of [-hz * 0.62, -hz * 0.28, 0, hz * 0.28, hz * 0.62]) {
      const yTop = G + roofY(zl, 2.6) - 0.6;
      const yL = Math.max(o.shipTop + 4, G + wall + 2);
      if (Math.abs(zl) < 1 && yTop - yL < 2) continue;
      const y1 = Math.abs(zl) < hb + 6 ? Math.max(yL, yTop - 6) : yTop - 8;
      rod([x, yTop, zl], [x, y1 + 1.2, zl], 0.04, iron);
      at(x, y1, zl, () => {
        b.lathe(
          [
            [0.15, 1.3],
            [1.3, 0.35],
            [1.45, 0.2],
            [0, 0.4],
          ],
          14,
          copper
        );
        b.push(translation(0, 0.1, 0));
        b.sphere(0.45, 10, lamp);
        b.pop();
      });
    }
  }
  // Pannes et entretoises le long de la nef.
  for (let i = 1; i < 14; i++) {
    const t = Math.PI * (i / 14);
    const z = -Math.cos(t) * (hz - 0.6);
    rod([-hx, G + roofY(z) - 0.2, z], [hx, G + roofY(z) - 0.2, z], 0.16, iron);
  }
  for (let k = 0; k < bays; k += 2) {
    const x0 = bayX(k);
    const x1 = bayX(k + 1);
    for (const sz of [-1, 1]) {
      const za = sz * hz * 0.45;
      const zb = sz * hz * 0.75;
      rod(
        [x0, G + roofY(za) - 0.4, za],
        [x1, G + roofY(zb) - 0.4, zb],
        0.08,
        iron
      );
      rod(
        [x0, G + roofY(zb) - 0.4, zb],
        [x1, G + roofY(za) - 0.4, za],
        0.08,
        iron
      );
    }
  }

  // --- Toit : tôles rivetées, verrières (faîtière et latérales), lanterneau ---
  // Bandes de verre (en angle 0..π) ; le reste est couvert de tôles.
  const panes: [number, number][] = [
    [0.2, 0.27],
    [0.4, 0.6],
    [0.73, 0.8],
  ];
  const roofAt = (x: number, t: number, lift: number): Vec3 => {
    const z = -Math.cos(t) * (hz + 1);
    return [x, G + roofY(z) + lift + (Math.abs(z) > hz ? 0 : 0), z];
  };
  let t0 = 0;
  const strips: [number, number, boolean][] = [];
  for (const [a, c] of panes) {
    strips.push([t0, a, false], [a, c, true]);
    t0 = c;
  }
  strips.push([t0, 1, false]);
  for (const [a, c, glass] of strips) {
    const fn = (u: number, v: number) =>
      roofAt(-hx - 1 + (hx * 2 + 2) * u, Math.PI * (a + (c - a) * v), 0.25);
    if (glass) {
      g.grid(bays * 2, 4, fn, skyPane, {
        uv: (u, v) => [u * hx, v * 4],
      });
      // Petits bois des verrières (dans le maillage opaque : fines ombres).
      for (let k = 0; k <= bays * 3; k++) {
        const x = -hx + (hx * 2 * k) / (bays * 3);
        const pts: Vec3[] = [];
        for (let i = 0; i <= 6; i++)
          pts.push(roofAt(x, Math.PI * (a + ((c - a) * i) / 6), 0.35));
        b.tube(pts, 0.07, 4, iron);
      }
    } else
      b.grid(bays * 2, Math.max(2, Math.round((c - a) * 24)), fn, plates, {
        uv: (u, v) => [u * hx * 2, v * (c - a) * 60],
      });
  }
  // Lanterneau de faîte (dehors) et cheminées des chaudières.
  boxAt(0, G + ridge + 0.6, 0, hx * 2 - 8, 1.6, 4, plates);
  boxAt(0, G + ridge + 2.2, 0, hx * 2 - 6, 0.5, 5.4, copper);
  for (const fx of [-0.55, -0.15]) {
    const x = fx * hx;
    const z = -hz + 7;
    rod([x, G + 9, z], [x, G + roofY(z) + 8, z], 0.9, ironRed);
    at(x, G + roofY(z) + 8, z, () =>
      b.lathe(
        [
          [0.9, 0],
          [1.5, 0.6],
          [1.2, 1.4],
          [0, 1.4],
        ],
        12,
        iron
      )
    );
  }

  // --- Pont roulant : poteaux en treillis, chemins de roulement, deux ponts ----
  const zc = Math.min(hz - 14, 36);
  const yRail = Math.min(G + roofY(zc) - 3, o.shipTop + 7);
  for (const sz of [-1, 1]) {
    // Chemins de roulement suspendus à la charpente par des tirants.
    for (let k = 0; k <= bays; k++) {
      const x = bayX(k);
      const z = sz * zc;
      const yA = G + roofY(z, 2.6) - 0.6;
      for (const dz of [-0.5, 0.5])
        rod([x, yA, z + dz], [x, yRail + 1.4, z + dz * 0.6], 0.09, iron);
      boxAt(x, yRail + 1.2, z, 1.2, 0.5, 1.6, ironRed);
    }
    // Poutre de roulement et son rail.
    boxAt(0, yRail, sz * zc, hx * 2, 1.4, 1.2, ironRed);
    boxAt(0, yRail + 1.4, sz * zc, hx * 2, 0.25, 0.4, iron);
  }
  const crane = (x: number, load: (zt: number) => number) => {
    const y = yRail + 1.65;
    for (const dx of [-1.2, 1.2]) {
      boxAt(x + dx, y, 0, 0.9, 1.8, zc * 2 + 2, ironRed);
      boxAt(x + dx, y + 1.8, 0, 1.1, 0.2, zc * 2 + 2, brass);
    }
    for (const sz of [-1, 1]) boxAt(x, y - 0.3, sz * zc, 3.6, 1.4, 2.4, iron);
    // Chariot, treuil, chaînes et crochet.
    const zt = -zc * 0.35;
    boxAt(x, y + 1.8, zt, 3.6, 1.4, 3, iron);
    at(x, y + 2.6, zt, () => {
      b.push(rotationX(Math.PI / 2));
      b.cylinder(0.8, 2.4, 12, brass);
      b.pop();
    });
    const yHook = load(zt);
    for (const dx of [-0.35, 0.35])
      rod([x + dx, y + 1.8, zt], [x + dx * 0.4, yHook + 1, zt], 0.05, iron);
    at(x, yHook, zt, () => b.torus(0.5, 0.14, 10, 5, iron));
  };
  // Pont avant : il descend un bloc-moteur d'Aether neuf vers la proue.
  crane(L / 2 + 10, (zt) => {
    const y = o.shipTop - 6;
    at(L / 2 + 10, y - 3.2, zt, () => {
      b.cylinder(1.6, 3.2, 16, plates);
      for (const yy of [0.2, 1.6, 3])
        at(0, yy, 0, () => b.torus(1.62, 0.12, 16, 4, brass));
      b.push(translation(0, 1.2, 0));
      b.cylinder(0.9, 1, 16, emit('#6fe8ff', 1.2, 3));
      b.pop();
    });
    for (const dz of [-1, 1])
      rod([L / 2 + 10, y + 1, zt], [L / 2 + 10, y, zt + dz * 1.2], 0.04, iron);
    return y + 1;
  });
  // Pont arrière : une hélice de rechange en attente.
  crane(-L / 2 - 12, (zt) => {
    const y = G + 16;
    at(-L / 2 - 12, y, zt, () => {
      b.push(rotationZ(Math.PI / 2));
      b.cylinder(0.6, 1.6, 12, brass);
      for (let k = 0; k < 4; k++) {
        b.push(rotationY((k / 4) * Math.PI * 2 + 0.3));
        b.push(chain(translation(0, 0.8, 2), rotationZ(0.35)));
        b.box(0.2, 0.3, 3.6, copper);
        b.pop();
        b.pop();
      }
      b.pop();
    });
    return y + 1;
  });

  // --- Cale : berceau d'acier et tins de bois sous la quille ------------------
  const keel = o.hover - 5;
  for (let x = -L * 0.36; x <= L * 0.36 + 0.1; x += 6) {
    // Tins empilés dans l'axe.
    const h = Math.max(0.6, keel - FL);
    for (let y = 0; y < h - 0.05; y += 0.9)
      boxAt(
        x,
        FL + y,
        0,
        1.4,
        Math.min(0.85, h - y),
        y % 1.8 < 0.9 ? 2.6 : 2,
        woodDark
      );
    // Chevalets d'acier en A de part et d'autre.
    for (const sz of [-1, 1]) {
      const zf = sz * (hb * 0.95 + 2.6);
      const zt = sz * hb * 0.55;
      const yt = keel + 1.4;
      rod([x - 1.2, FL, zf], [x, yt, zt], 0.18, ironRed);
      rod([x + 1.2, FL, zf], [x, yt, zt], 0.18, ironRed);
      at(x, yt, zt, () => b.box(1.6, 0.4, 1.4, wood));
      boxAt(x, FL, zf, 3.2, 0.3, 1.2, iron);
    }
  }

  // --- Quai de travail (côté -z), à hauteur du pont, sur poteaux de fonte -----
  const qz0 = -(hb + 1.2);
  const qz1 = -(hb + 16);
  const qx = L / 2 + 10;
  boxAt(0, top - 0.6, (qz0 + qz1) / 2, qx * 2, 0.6, qz0 - qz1, plank);
  boxAt(0, top - 1.4, qz0 - 0.3, qx * 2, 0.8, 0.6, ironRed);
  for (let x = -qx; x <= qx + 0.1; x += 6)
    for (const z of [qz0 - 0.6, qz1 + 0.6]) {
      at(x, FL, z, () => b.cylinder(0.32, top - 0.6 - FL, 10, iron));
      at(x, FL, z, () => b.cylinder(0.55, 0.5, 10, stone));
    }
  // Garde-corps de laiton, côté vide.
  const rail = (pts: Vec3[], posts = 2.4) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      const n = Math.max(
        1,
        Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / posts)
      );
      for (let k = 0; k <= n; k++) {
        const p: Vec3 = [
          a[0] + ((c[0] - a[0]) * k) / n,
          a[1] + ((c[1] - a[1]) * k) / n,
          a[2] + ((c[2] - a[2]) * k) / n,
        ];
        rod(p, [p[0], p[1] + 1.1, p[2]], 0.05, brass);
      }
      rod([a[0], a[1] + 1.1, a[2]], [c[0], c[1] + 1.1, c[2]], 0.07, brass);
      rod([a[0], a[1] + 0.55, a[2]], [c[0], c[1] + 0.55, c[2]], 0.04, iron);
    }
  };
  rail([
    [-qx, top, qz1 + 0.3],
    [-qx, top, qz0 - 0.3],
  ]);
  rail([
    [qx, top, qz1 + 0.3],
    [qx, top, qz0 - 0.3],
  ]);
  // Escaliers aux deux bouts du quai.
  for (const sx of [-1, 1]) {
    const steps = Math.ceil((top - FL) / 0.4);
    for (let k = 0; k < steps; k++)
      boxAt(
        sx * (qx + 1.5 + k * 0.45),
        FL,
        qz1 + 2,
        0.45,
        top - FL - k * 0.4,
        3,
        k % 2 ? plank : wood
      );
  }
  // Grues pivotantes sur le quai.
  for (const fx of [-0.3, 0.3]) {
    const x = fx * L;
    const z = qz1 + 3;
    at(x, top, z, () => {
      b.cylinder(0.5, 9, 10, ironRed);
      b.push(translation(0, 9, 0));
      b.cylinder(0.9, 0.6, 12, brass);
      b.pop();
    });
    rod([x, top + 9.3, z], [x, top + 11.5, z + 9], 0.25, ironRed);
    rod([x, top + 6, z], [x, top + 11.5, z + 9], 0.12, iron);
    rod([x, top + 11.5, z + 9], [x, top + 3.5, z + 9], 0.03, iron);
    at(x, top + 2.6, z + 9, () => b.box(1.6, 0.9, 1.6, wood));
    at(x - 0.9, top, z - 0.8, () => b.box(1.6, 1.2, 1.2, iron));
  }
  // Caisses, tonneaux, rouleaux de cordage sur le quai.
  for (let k = 0; k < 18; k++) {
    const x = -qx + 4 + r() * (qx * 2 - 8);
    const z = qz1 + 1.5 + r() * 8;
    if (Math.abs(x) % 22 < 2) continue;
    if (k % 3 === 0)
      at(x, top, z, () => {
        b.cylinder(0.5, 1.15, 10, wood);
        b.torus(0.52, 0.05, 10, 3, iron);
      });
    else if (k % 3 === 1)
      boxAt(x, top, z, 1 + r(), 0.8 + r() * 0.6, 1 + r() * 0.5, wood, r());
    else at(x, top + 0.18, z, () => b.torus(0.55, 0.18, 12, 5, canvas));
  }

  // --- Échafaudages contre la coque (côté +z), soudeur au travail -------------
  const scaff = (x0: number, x1: number, z: number, h: number) => {
    for (let x = x0; x <= x1 + 0.1; x += 3)
      for (const dz of [0, 2])
        rod([x, FL, z + dz], [x, FL + h, z + dz], 0.08, iron);
    for (let y = FL + 2.4; y <= FL + h + 0.1; y += 2.4) {
      boxAt((x0 + x1) / 2, y, z + 1, x1 - x0 + 0.6, 0.12, 2.2, plank);
      rod([x0, y + 1, z + 2], [x1, y + 1, z + 2], 0.05, iron);
    }
    for (let x = x0; x < x1; x += 3)
      rod([x, FL, z + 2], [x + 3, FL + Math.min(h, 2.4), z + 2], 0.05, iron);
  };
  const sz0 = hb + 2.5;
  scaff(-L * 0.28, -L * 0.1, sz0, top - 2);
  scaff(L * 0.05, L * 0.2, sz0, top - 4);
  // Étincelles de soudure (points lumineux).
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2;
    const rr = 0.2 + r() * 1.3;
    at(
      -L * 0.19 + Math.cos(a) * rr,
      FL + 7.4 - r() * 1.5,
      sz0 - 0.2 + Math.sin(a) * 0.3,
      () => b.sphere(0.06 + r() * 0.05, 4, sparks)
    );
  }

  // --- Passerelles hautes le long des murs, échelles ---------------------------
  const yC = G + wall - 3.2;
  for (const sz of [-1, 1]) {
    const z = sz * (hz - 3.2);
    boxAt(0, yC, z, hx * 2 - 4, 0.25, 3, plates);
    for (let k = 0; k <= bays; k++) {
      const x = bayX(k);
      rod([x, yC - 2.5, sz * (hz - 0.2)], [x, yC, z - sz * 1.4], 0.12, iron);
    }
    rail(
      [
        [-hx + 2, yC + 0.25, z - sz * 1.4],
        [hx - 2, yC + 0.25, z - sz * 1.4],
      ],
      3
    );
    for (const fx of [-0.7, 0.4]) {
      const x = fx * hx;
      for (const dx of [-0.35, 0.35])
        rod([x + dx, FL, z - sz * 1.8], [x + dx, yC, z - sz * 1.8], 0.05, iron);
      for (let y = FL + 0.4; y < yC; y += 0.4)
        rod(
          [x - 0.35, y, z - sz * 1.8],
          [x + 0.35, y, z - sz * 1.8],
          0.03,
          iron
        );
    }
  }

  // --- Ateliers côté -z : chaudières, forge, machines, établis ----------------
  const zA = -hz + 6.5; // fond de l'atelier
  // Deux chaudières horizontales rivetées, manomètres et soupapes.
  for (const fx of [-0.55, -0.15]) {
    const x = fx * hx;
    at(x, FL, zA, () => {
      b.box(10, 1.2, 4.6, brickDark);
      b.push(chain(translation(0, 3.6, 0), rotationZ(Math.PI / 2)));
      b.push(translation(0, -5, 0));
      b.cylinder(2.3, 10, 22, plates);
      b.pop();
      for (const yy of [-4.4, -1.6, 1.6, 4.4])
        at(0, yy, 0, () => b.torus(2.33, 0.1, 22, 4, brass));
      b.pop();
      // Façade, porte du foyer rougeoyante, manomètres.
      b.push(translation(-5.1, 3.6, 0));
      b.push(rotationZ(Math.PI / 2));
      b.cylinder(2.3, 0.2, 22, iron);
      b.pop();
      b.box(0.2, 1, 1.4, coals);
      for (const dz of [-1.2, 1.2]) {
        b.push(chain(translation(-0.2, 1.6, dz), rotationZ(Math.PI / 2)));
        b.cylinder(0.35, 0.12, 12, brass);
        b.cylinder(0.28, 0.14, 12, paper);
        b.pop();
      }
      b.pop();
      b.push(translation(2, 5.9, 0));
      b.cylinder(0.25, 1.2, 8, brass);
      b.push(translation(0, 1.2, 0));
      b.sphere(0.35, 8, brass);
      b.pop();
      b.pop();
    });
    // Conduite vers le quai.
    b.tube(
      [
        [x, FL + 6.2, zA],
        [x, FL + 7.4, zA + 3],
        [x + 2, FL + 7.4, qz1 - 2],
        [x + 2, top - 1, qz1 + 0.5],
      ],
      0.3,
      8,
      copper
    );
  }
  // Forge : foyer de brique, braises, hotte, enclume, auge.
  {
    const x = hx * 0.2;
    at(x, FL, zA, () => {
      b.box(4, 1.1, 3, brickDark);
      b.push(translation(0, 1.1, 0));
      b.box(2.6, 0.25, 1.8, coals);
      b.pop();
      b.push(translation(0, 3.4, 0));
      b.lathe(
        [
          [2.4, 0],
          [0.7, 2.2],
          [0.6, 2.2],
        ],
        4,
        iron,
        {}
      );
      b.pop();
    });
    rod([x, FL + 5.6, zA], [x, G + roofY(zA) + 4, zA], 0.5, iron);
    at(x + 3.2, FL, zA + 2.6, () => {
      b.cylinder(0.45, 0.7, 8, woodDark);
      b.push(translation(0, 0.7, 0));
      b.box(1.3, 0.45, 0.5, iron);
      b.pop();
    });
    boxAt(x - 3.4, FL, zA + 2, 2, 0.8, 1, rust);
  }
  // Machines-outils : tour, perceuse à colonne, presse.
  for (let k = 0; k < 4; k++) {
    const x = hx * (0.36 + k * 0.13);
    at(x, FL, zA + 1, () => {
      if (k % 2 === 0) {
        b.box(4.2, 1, 1.2, iron);
        b.push(chain(translation(0, 1.5, 0), rotationZ(Math.PI / 2)));
        b.push(translation(0, -2, 0));
        b.cylinder(0.35, 4, 10, brass);
        b.pop();
        b.pop();
        b.push(translation(-1.8, 1, 0));
        b.box(0.9, 1.4, 1.2, ironRed);
        b.pop();
      } else {
        b.cylinder(0.6, 0.3, 10, iron);
        b.cylinder(0.14, 3.4, 8, iron);
        b.push(translation(0.4, 2.6, 0));
        b.box(1.4, 0.9, 0.9, ironRed);
        b.pop();
        b.push(translation(0.6, 1.2, 0));
        b.box(1, 0.1, 1, iron);
        b.pop();
      }
    });
    // Courroies vers l'arbre de transmission au plafond de l'atelier.
    rod([x, FL + 1.5, zA + 1], [x, FL + 7, zA - 1.5], 0.05, woodDark);
  }
  rod([hx * 0.3, FL + 7, zA - 1.5], [hx * 0.8, FL + 7, zA - 1.5], 0.14, iron);
  // Établis, étaux, outils, tableaux d'outils au mur.
  const bench = (x: number, z: number, ry: number) =>
    at(
      x,
      FL,
      z,
      () => {
        b.push(translation(0, 0.9, 0));
        b.box(3.4, 0.18, 1.2, wood);
        b.pop();
        for (const [dx, dz] of [
          [-1.5, -0.45],
          [1.5, -0.45],
          [-1.5, 0.45],
          [1.5, 0.45],
        ]) {
          b.push(translation(dx, 0, dz));
          b.box(0.15, 0.9, 0.15, woodDark);
          b.pop();
        }
        b.push(translation(1.1, 1.08, 0.3));
        b.box(0.4, 0.3, 0.3, iron);
        b.pop();
        for (let k = 0; k < 4; k++) {
          b.push(
            chain(
              translation(-1 + k * 0.45, 1.1, -0.1 + r() * 0.3),
              rotationY(r() * 2)
            )
          );
          b.box(0.5, 0.06, 0.08, k % 2 ? brass : iron);
          b.pop();
        }
        b.push(translation(-0.6, 1.08, 0.2));
        b.box(0.6, 0.02, 0.45, paper);
        b.pop();
      },
      ry
    );
  for (let k = 0; k < 6; k++) {
    const x = -hx + 10 + k * ((hx * 0.9) / 6);
    bench(x, zA + 4.5, 0);
    boxAt(x, FL + 2, -hz + 0.05, 3.2, 2, 0.1, woodDark);
    for (let t = 0; t < 6; t++)
      boxAt(
        x - 1.2 + t * 0.48,
        FL + 2.4 + (t % 2) * 0.6,
        -hz + 0.18,
        0.08,
        0.9,
        0.08,
        t % 3 ? iron : brass
      );
  }
  // Réserves : planches, tôles de cuivre, toiles, mât de rechange.
  for (let k = 0; k < 7; k++)
    boxAt(-hx * 0.15, FL + k * 0.22, zA + 9, 9, 0.2, 1.6, k % 2 ? wood : plank);
  for (let k = 0; k < 5; k++)
    boxAt(hx * 0.1, FL + k * 0.08, zA + 9.5, 3, 0.07, 2, copper);
  for (let k = 0; k < 4; k++)
    at(hx * 0.32 + k * 0.2, FL + 0.55 + k * 0.9, zA + 10, () => {
      b.push(rotationZ(Math.PI / 2));
      b.push(translation(0, -2.5, 0));
      b.cylinder(0.45, 5, 10, canvas);
      b.pop();
      b.pop();
    });
  for (const x of [-hx * 0.62, -hx * 0.38])
    at(x, FL, -zc + 6, () => {
      b.box(0.4, 1.4, 2.4, woodDark);
    });
  rod(
    [-hx * 0.66, FL + 1.8, -zc + 6],
    [-hx * 0.3, FL + 1.8, -zc + 6],
    0.55,
    wood
  );

  // --- Côté +z : bureau du contremaître, magasin, tables à dessin -------------
  {
    const x = -hx * 0.5;
    const z = hz - 7;
    const y0 = FL + 4;
    for (const [dx, dz] of [
      [-4.5, -2.8],
      [4.5, -2.8],
      [-4.5, 2.8],
      [4.5, 2.8],
    ])
      at(x + dx, FL, z + dz, () => b.cylinder(0.2, 4, 8, iron));
    boxAt(x, y0, z, 9.6, 0.3, 6, plates);
    boxAt(x, y0 + 0.3, z, 9.6, 1, 6, woodDark);
    boxAt(x, y0 + 1.3, z - 3, 9.6, 2.2, 0.1, emit('#ffd9a0', 0.5, 2.2));
    for (let k = 0; k <= 6; k++)
      boxAt(x - 4.8 + k * 1.6, y0 + 1.3, z - 3.05, 0.12, 2.2, 0.15, woodDark);
    boxAt(x, y0 + 3.5, z, 10.2, 0.4, 6.6, copper);
    for (let k = 0; k < 10; k++)
      boxAt(
        x + 4.9 + k * 0.4,
        FL + k * 0.4,
        z - 2.2,
        0.4,
        0.4 * (k + 1),
        1.2,
        plank
      );
  }
  // Rayonnages de pièces détachées.
  for (let k = 0; k < 4; k++) {
    const x = hx * 0.05 + k * 7;
    const z = hz - 5;
    for (const dx of [-2.6, 2.6]) boxAt(x + dx, FL, z, 0.15, 5, 1.6, iron);
    for (let y = 0.8; y < 5; y += 1.3) {
      boxAt(x, FL + y, z, 5.4, 0.1, 1.6, wood);
      for (let i = 0; i < 4; i++)
        boxAt(
          x - 2 + i * 1.3 + r() * 0.2,
          FL + y + 0.1,
          z,
          0.9,
          0.4 + r() * 0.5,
          1,
          r() < 0.5 ? wood : rust
        );
    }
  }
  // Tables à dessin avec plans, tableau noir.
  for (let k = 0; k < 2; k++)
    at(hx * 0.55 + k * 5, FL, hz - 8, () => {
      b.push(chain(translation(0, 1.1, 0), rotationX(-0.4)));
      b.box(2.4, 0.08, 1.6, wood);
      b.push(translation(0, 0.06, 0));
      b.box(2.1, 0.02, 1.3, paper);
      b.pop();
      b.pop();
      b.box(0.15, 1.1, 0.15, woodDark);
    });
  boxAt(hx * 0.6, FL + 2, hz - 0.12, 6, 3, 0.12, mat('#1e2620', P.PLAIN, 0.9));
  // Tonneaux de poudre et de fioul, palettes, sacs.
  for (let k = 0; k < 16; k++) {
    const x = (r() - 0.5) * hx * 1.6;
    const sz = r() < 0.5 ? -1 : 1;
    const z = sz * (zc - 4 - r() * 3);
    at(x, FL, z, () => {
      if (k % 2) {
        b.cylinder(0.55, 1.2, 10, k % 4 === 1 ? ironRed : wood);
        b.torus(0.57, 0.05, 10, 3, iron);
      } else {
        b.box(1.4, 0.8, 1.4, wood);
        b.push(translation(0, 0.8, 0));
        b.box(1.1, 0.6, 1.1, canvas);
        b.pop();
      }
    });
  }

  // --- Amarres et passerelles vers le navire ---------------------------------
  for (const fx of [-0.32, 0.05, 0.32]) {
    const x = fx * L;
    m.push(translation(x, top, qz0 - 1));
    m.cylinder(0.32, 0.9, 8, iron);
    m.pop();
    m.tube(
      [
        [x, top + 0.8, qz0 - 1],
        [x + 1, top - 0.3, (qz0 - hb) / 2 - 0.5],
        [x + 2, top + 0.6, -hb + 0.6],
      ],
      0.07,
      4,
      canvas
    );
  }
  for (const fx of [-0.14, 0.2]) {
    m.push(translation(fx * L, top + 0.1, (qz0 - hb) / 2 - 0.2));
    m.box(2.6, 0.18, Math.abs(qz0) - hb + 1.8, plank);
    m.pop();
  }

  // --- Ouvriers -----------------------------------------------------------------
  const crowd: CrewMember[] = [];
  let seed = 400;
  const walk = (a: Vec3, c: Vec3) =>
    crowd.push({ role: 'walk', pos: a, to: c, yaw: 0, seed: seed++ });
  const pose = (role: CrewMember['role'], p: Vec3, yaw: number) =>
    crowd.push({ role, pos: p, yaw, seed: seed++ });
  for (let k = 0; k < 5; k++) {
    const z = qz1 + 2 + r() * 10;
    const x = (r() - 0.5) * qx * 1.6;
    walk([x, top, z], [x + (r() < 0.5 ? -1 : 1) * (8 + r() * 14), top, z]);
  }
  for (let k = 0; k < 8; k++) {
    const sz = r() < 0.5 ? -1 : 1;
    const z = sz * (hb + 9 + r() * 14);
    const x = (r() - 0.5) * hx * 1.5;
    walk([x, FL, z], [x + (r() < 0.5 ? -1 : 1) * (10 + r() * 20), FL, z]);
  }
  for (const sz of [-1, 1])
    walk(
      [-hx * 0.6, yC + 0.25, sz * (hz - 3)],
      [hx * 0.3, yC + 0.25, sz * (hz - 3)]
    );
  pose('haul', [hx * 0.2 + 2.4, FL, zA + 2.2], Math.PI / 2);
  pose('haul', [-hx * 0.5, FL, zA + 3.4], Math.PI / 2);
  for (let k = 0; k < 4; k++)
    pose(
      'haul',
      [-hx + 10 + k * ((hx * 0.9) / 6) * 1.5, FL, zA + 5.4],
      Math.PI / 2
    );
  pose('scrub', [-L * 0.19, FL + 7.3, sz0 + 1], -Math.PI / 2);
  pose('scrub', [L * 0.12, FL + 4.9, sz0 + 1], -Math.PI / 2);
  pose('look', [-hx * 0.5, FL + 4.3, hz - 9], -Math.PI / 2);
  pose('look', [hx * 0.57, FL, hz - 9.4], -Math.PI / 2);
  pose('look', [L / 2 + 6, FL, 6], Math.PI);
  pose('haul', [L / 2 + 12, FL, -zc * 0.35 + 2], Math.PI);

  return {
    shell: b.build(),
    glass: g.build(),
    door: doorMesh(d, night),
    moor: m.build(),
    crowd,
    dims: d,
  };
}

/** Vantail de porte : tôle rivetée, raidisseurs, croix, hublot, galets. */
function doorMesh(d: HangarDims, night: boolean): MeshData {
  const b = new MeshBuilder();
  const G = HANGAR_GROUND;
  const W = DOOR_LEAF;
  const H = d.doorH;
  const plate: Mat = {
    p: P.PLATES,
    color: linear('#4a3c30'),
    metal: 0.6,
    rough: 0.6,
  };
  const frame: Mat = {
    p: P.IRON,
    color: linear('#5a2a20'),
    metal: 0.5,
    rough: 0.6,
  };
  const brass: Mat = {
    p: P.BRASS,
    color: linear('#b8893a'),
    metal: 1,
    rough: 0.35,
  };
  const glass: Mat = {
    p: P.EMIT,
    color: linear('#ffcf8a'),
    metal: 0,
    rough: 1,
    emit: night ? 3 : 0.4,
  };
  b.push(translation(0, G + 0.6, 0));
  b.box(0.6, H - 0.6, W - 0.1, plate);
  // Cadre et raidisseurs horizontaux.
  for (const z of [-W / 2 + 0.25, W / 2 - 0.25]) {
    b.push(translation(0, 0, z));
    b.box(0.95, H - 0.6, 0.5, frame);
    b.pop();
  }
  for (let y = 0; y < H - 0.6; y += 4.2) {
    b.push(translation(0, y, 0));
    b.box(0.9, 0.45, W - 0.2, frame);
    b.pop();
  }
  // Croix de Saint-André dans le bas, bandes de laiton.
  for (const s of [-1, 1]) {
    b.tube(
      [
        [0.45, 0.6, -s * (W / 2 - 0.6)],
        [0.45, 8, s * (W / 2 - 0.6)],
      ],
      0.18,
      6,
      frame
    );
    b.tube(
      [
        [-0.45, 0.6, -s * (W / 2 - 0.6)],
        [-0.45, 8, s * (W / 2 - 0.6)],
      ],
      0.18,
      6,
      frame
    );
  }
  for (const y of [H * 0.45, H * 0.8]) {
    b.push(translation(0, y, 0));
    b.box(1, 0.2, W - 0.3, brass);
    b.pop();
  }
  // Hublot éclairé.
  b.push(chain(translation(0, H * 0.62, 0), rotationZ(Math.PI / 2)));
  b.cylinder(1.1, 1.1, 16, glass);
  b.push(translation(0, -0.05, 0));
  b.torus(1.15, 0.14, 16, 5, brass);
  b.pop();
  b.push(translation(0, 1.2, 0));
  b.torus(1.15, 0.14, 16, 5, brass);
  b.pop();
  b.pop();
  // Galets de roulement.
  for (const z of [-W / 2 + 1.2, W / 2 - 1.2]) {
    b.push(chain(translation(0, -0.3, z), rotationZ(Math.PI / 2)));
    b.push(translation(0, -0.6, 0));
    b.cylinder(0.4, 1.2, 10, frame);
    b.pop();
    b.pop();
  }
  b.pop();
  return b.build();
}

/**
 * Lumière sous la verrière : soleil haut qui tombe par le toit, ambiance
 * chaude et un peu de poussière en suspension ; la nuit, les lampes.
 */
export function hangarLighting<
  L extends {
    sunDir: Vec3;
    sunColor: Vec3;
    zenith: Vec3;
    horizon: Vec3;
    skyMid: Vec3;
    ground: Vec3;
    fog: Vec3;
    fogDensity: number;
    night: number;
    exposure: number;
    bloom: number;
  },
>(l: L): L {
  const n = l.night;
  const mix = (a: Vec3, c: Vec3, t: number): Vec3 => [
    a[0] + (c[0] - a[0]) * t,
    a[1] + (c[1] - a[1]) * t,
    a[2] + (c[2] - a[2]) * t,
  ];
  const day = {
    zenith: [0.3, 0.26, 0.21] as Vec3,
    ground: [0.2, 0.15, 0.1] as Vec3,
    fog: [0.5, 0.38, 0.25] as Vec3,
  };
  const lamps = {
    zenith: [0.16, 0.09, 0.045] as Vec3,
    ground: [0.12, 0.075, 0.04] as Vec3,
    fog: [0.16, 0.1, 0.06] as Vec3,
  };
  const sunK = n > 0.5 ? 0.5 : 0.85;
  return {
    ...l,
    sunDir: n > 0.5 ? [-0.25, 1, 0.3] : [0.32, 1, 0.22],
    sunColor: [
      l.sunColor[0] * sunK,
      l.sunColor[1] * sunK,
      l.sunColor[2] * sunK,
    ],
    zenith: mix(day.zenith, lamps.zenith, n),
    horizon: mix(day.zenith, lamps.zenith, n),
    skyMid: mix(day.zenith, lamps.zenith, n),
    ground: mix(day.ground, lamps.ground, n),
    fog: mix(day.fog, lamps.fog, n),
    fogDensity: n > 0.5 ? 0.003 : 0.0022,
    exposure: n > 0.5 ? 2.2 : 1.15,
    bloom: n > 0.5 ? 1.3 : 0.8,
  };
}
