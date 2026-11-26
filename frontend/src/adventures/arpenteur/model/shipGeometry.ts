import type { Allure, Build, MastType } from './types';

// Géométrie des arpenteurs, relevée sur les croquis « Allures possibles »
// (poupe à gauche, proue à droite). Chaque allure est décrite dans les
// coordonnées du croquis puis ramenée à un repère commun : pont principal à
// y = 0, coque vers le bas (y > 0), châteaux et mâts vers le haut (y < 0),
// longueur de 80 à 920.

type P = [number, number];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PropSpec {
  /** Rectangle du croquis englobant le propulseur. */
  r: [number, number, number, number];
  /** 0 : tuyère vers le bas ; 90 : vers l'arrière (gauche) ; négatif : vers l'avant. */
  angle: number;
}

interface AllureSketch {
  deckY: number;
  /** Silhouette haute (anguleuse) : du coin de poupe à la pointe de proue. */
  top: P[];
  /** Dessous (lissé) : de la pointe de proue au coin de poupe. */
  bottom: P[];
  /** x de fin du château arrière (matériau de poupe en deçà). */
  sternEnd: number;
  masts: number[];
  /** Emplacements de canons [x1, y1, x2, y2]. */
  slots: [number, number, number, number][];
  props: PropSpec[];
  /** Bande de blindage verticale (Enforceur). */
  armor?: [number, number, number];
}

const SKETCHES: Record<Allure, AllureSketch> = {
  escorteur: {
    deckY: 520,
    top: [
      [255, 690],
      [235, 650],
      [232, 540],
      [185, 525],
      [182, 440],
      [322, 440],
      [352, 478],
      [420, 516],
      [560, 520],
      [650, 516],
      [700, 505],
      [870, 478],
      [935, 462],
    ],
    bottom: [
      [935, 462],
      [900, 540],
      [840, 600],
      [760, 650],
      [640, 682],
      [500, 695],
      [360, 698],
      [290, 694],
      [255, 690],
    ],
    sternEnd: 360,
    masts: [430, 535, 700],
    slots: [
      [188, 497, 230, 510],
      [240, 535, 295, 550],
      [335, 552, 535, 570],
      [560, 552, 695, 574],
      [812, 508, 850, 524],
    ],
    props: [
      { r: [365, 580, 445, 700], angle: -12 },
      { r: [540, 620, 635, 690], angle: 68 },
      { r: [715, 545, 790, 660], angle: 0 },
    ],
  },
  survivor: {
    deckY: 530,
    top: [
      [1165, 700],
      [1150, 620],
      [1135, 560],
      [1185, 545],
      [1182, 455],
      [1205, 402],
      [1335, 400],
      [1395, 500],
      [1445, 530],
      [1600, 535],
      [1700, 505],
      [1830, 488],
      [1890, 520],
    ],
    bottom: [
      [1890, 520],
      [1880, 580],
      [1845, 640],
      [1790, 690],
      [1680, 700],
      [1560, 690],
      [1460, 700],
      [1350, 750],
      [1240, 760],
      [1180, 735],
      [1165, 700],
    ],
    sternEnd: 1420,
    masts: [1445, 1650],
    slots: [
      [1137, 515, 1255, 535],
      [1142, 575, 1215, 600],
      [1315, 570, 1470, 595],
      [1500, 570, 1635, 590],
      [1730, 515, 1830, 535],
      [1730, 560, 1800, 580],
    ],
    props: [
      { r: [1230, 635, 1300, 740], angle: 0 },
      { r: [1395, 630, 1475, 710], angle: -30 },
      { r: [1655, 645, 1790, 690], angle: 90 },
    ],
  },
  protector: {
    deckY: 1080,
    top: [
      [150, 1150],
      [148, 1035],
      [230, 1030],
      [250, 975],
      [300, 948],
      [385, 945],
      [430, 1000],
      [470, 1080],
      [560, 1075],
      [610, 1055],
      [730, 1025],
      [820, 1022],
      [860, 1045],
      [905, 1075],
      [920, 1115],
    ],
    bottom: [
      [920, 1115],
      [905, 1170],
      [860, 1220],
      [780, 1255],
      [640, 1275],
      [520, 1285],
      [470, 1305],
      [330, 1308],
      [205, 1305],
      [195, 1265],
      [160, 1230],
      [150, 1150],
    ],
    sternEnd: 470,
    masts: [520, 690],
    slots: [
      [152, 1070, 245, 1090],
      [265, 1070, 380, 1090],
      [285, 1110, 545, 1135],
      [565, 1110, 745, 1135],
      [435, 1155, 630, 1180],
      [760, 1045, 830, 1060],
    ],
    props: [
      { r: [255, 1175, 390, 1230], angle: 90 },
      { r: [525, 1205, 590, 1280], angle: 0 },
      { r: [615, 1195, 670, 1280], angle: 0 },
      { r: [780, 1160, 860, 1230], angle: -30 },
    ],
  },
  bombardier: {
    deckY: 1040,
    top: [
      [1160, 1300],
      [1150, 1180],
      [1125, 1080],
      [1160, 1070],
      [1158, 925],
      [1185, 890],
      [1240, 885],
      [1282, 915],
      [1300, 990],
      [1360, 1025],
      [1460, 1040],
      [1530, 995],
      [1655, 988],
      [1705, 1035],
      [1880, 1030],
      [1955, 1035],
      [1995, 1040],
    ],
    bottom: [
      [1995, 1040],
      [1960, 1130],
      [1930, 1230],
      [1880, 1260],
      [1720, 1285],
      [1520, 1300],
      [1340, 1310],
      [1250, 1330],
      [1195, 1320],
      [1160, 1300],
    ],
    sternEnd: 1360,
    masts: [1470, 1585, 1820],
    slots: [
      [1162, 945, 1205, 962],
      [1162, 980, 1205, 997],
      [1162, 1015, 1205, 1032],
      [1127, 1088, 1170, 1104],
      [1127, 1118, 1170, 1134],
      [1370, 1090, 1575, 1120],
      [1590, 1095, 1785, 1120],
      [1460, 1145, 1700, 1175],
      [1525, 1045, 1630, 1060],
      [1855, 1060, 1945, 1078],
      [1855, 1095, 1945, 1113],
      [1855, 1130, 1940, 1148],
    ],
    props: [
      { r: [1170, 1100, 1285, 1160], angle: 90 },
      { r: [1255, 1180, 1355, 1290], angle: 0 },
      { r: [1560, 1180, 1640, 1280], angle: -15 },
      { r: [1810, 1170, 1880, 1260], angle: 15 },
    ],
  },
  fleche: {
    deckY: 420,
    top: [
      [195, 528],
      [195, 420],
      [155, 390],
      [155, 285],
      [272, 285],
      [330, 345],
      [355, 375],
      [400, 418],
      [560, 422],
      [700, 418],
      [800, 410],
      [875, 378],
      [918, 398],
    ],
    bottom: [
      [918, 398],
      [895, 440],
      [840, 480],
      [760, 515],
      [620, 540],
      [470, 545],
      [330, 535],
      [265, 528],
      [195, 528],
    ],
    sternEnd: 400,
    masts: [445, 595, 715],
    slots: [
      [160, 335, 215, 355],
      [210, 420, 310, 445],
      [385, 445, 730, 475],
    ],
    props: [
      { r: [295, 450, 355, 535], angle: -10 },
      { r: [410, 480, 475, 545], angle: 30 },
      { r: [675, 480, 755, 530], angle: 60 },
    ],
  },
  forteresse: {
    deckY: 440,
    top: [
      [1120, 610],
      [1105, 560],
      [1118, 470],
      [1115, 382],
      [1190, 380],
      [1192, 440],
      [1340, 440],
      [1385, 320],
      [1565, 318],
      [1610, 420],
      [1690, 435],
      [1800, 392],
      [1880, 390],
      [1882, 430],
      [1895, 440],
    ],
    bottom: [
      [1895, 440],
      [1880, 490],
      [1830, 560],
      [1740, 600],
      [1600, 625],
      [1430, 632],
      [1260, 615],
      [1180, 590],
      [1120, 610],
    ],
    sternEnd: 1195,
    masts: [1315, 1685],
    slots: [
      [1435, 378, 1525, 400],
      [1400, 420, 1575, 445],
      [1395, 465, 1560, 500],
      [1175, 465, 1360, 500],
      [1595, 462, 1735, 495],
    ],
    props: [
      { r: [1215, 525, 1270, 605], angle: 0 },
      { r: [1430, 525, 1570, 560], angle: 90 },
      { r: [1430, 575, 1570, 610], angle: 90 },
      { r: [1705, 490, 1790, 575], angle: -40 },
    ],
  },
  enforceur: {
    deckY: 950,
    top: [
      [150, 1175],
      [145, 1000],
      [140, 880],
      [160, 860],
      [265, 860],
      [280, 905],
      [355, 945],
      [520, 958],
      [670, 920],
      [712, 915],
      [745, 840],
      [780, 800],
      [865, 800],
      [892, 832],
      [910, 880],
      [906, 1022],
      [955, 1025],
    ],
    bottom: [
      [955, 1025],
      [962, 1090],
      [935, 1150],
      [890, 1165],
      [760, 1160],
      [600, 1150],
      [535, 1170],
      [500, 1200],
      [420, 1195],
      [300, 1182],
      [160, 1178],
      [150, 1175],
    ],
    sternEnd: 355,
    masts: [395, 525, 690],
    slots: [
      [142, 915, 190, 940],
      [200, 995, 285, 1015],
      [345, 1000, 500, 1025],
      [345, 1045, 505, 1065],
      [525, 1000, 690, 1020],
      [530, 1040, 690, 1060],
      [795, 885, 905, 905],
      [795, 920, 905, 940],
      [795, 955, 905, 975],
      [795, 985, 900, 1005],
    ],
    props: [
      { r: [220, 1045, 330, 1085], angle: 90 },
      { r: [225, 1110, 330, 1150], angle: 90 },
      { r: [415, 1125, 515, 1190], angle: 50 },
      { r: [665, 1095, 745, 1150], angle: 30 },
    ],
    armor: [190, 960, 1170],
  },
  gouverneur: {
    deckY: 1022,
    top: [
      [1215, 1240],
      [1185, 1170],
      [1112, 1150],
      [1110, 1060],
      [1130, 1030],
      [1192, 1022],
      [1195, 860],
      [1310, 850],
      [1420, 995],
      [1500, 1025],
      [1700, 1015],
      [1890, 992],
    ],
    bottom: [
      [1890, 992],
      [1878, 1060],
      [1845, 1135],
      [1775, 1200],
      [1650, 1245],
      [1450, 1260],
      [1300, 1252],
      [1215, 1240],
    ],
    sternEnd: 1430,
    masts: [1425, 1560, 1735],
    slots: [
      [1197, 940, 1245, 960],
      [1197, 980, 1245, 1004],
      [1112, 1075, 1185, 1095],
      [1280, 1070, 1705, 1105],
      [1765, 1055, 1855, 1080],
      [1765, 1090, 1845, 1110],
      [1765, 1115, 1840, 1133],
    ],
    props: [
      { r: [1220, 1145, 1320, 1215], angle: 45 },
      { r: [1405, 1160, 1475, 1230], angle: 8 },
      { r: [1685, 1130, 1745, 1195], angle: -10 },
    ],
  },
};

export const SHIP_LEFT = 80;
export const SHIP_RIGHT = 920;

/** Étirement de la coque sous le pont selon la taille (nombre de ponts). */
export function hullStretch(ponts: number): number {
  return ponts >= 3 ? 1.3 : ponts === 2 ? 1.15 : 1;
}

export interface PropShape {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

export interface ShipGeometry {
  /** Silhouette complète (coque et châteaux). */
  outline: string;
  /** Dessous lissé (pour la quille). */
  keel: string;
  /** Polygone échantillonné de la silhouette (coupes, intersections). */
  polygon: P[];
  sternEnd: number;
  masts: number[];
  /** Emplacements de canons dans la coque. */
  strips: Rect[];
  props: PropShape[];
  armor?: { x: number; y1: number; y2: number };
  bow: { x: number; y: number };
  stern: { x: number; y: number };
  /** Profondeur maximale de la coque sous le pont. */
  depth: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Hauteur du pont à une abscisse donnée (haut de la silhouette). */
  topAt: (x: number) => number;
  /** Bas de la coque à une abscisse donnée. */
  bottomAt: (x: number) => number;
}

/** Courbe de Catmull-Rom en courbes de Bézier (dessous de coque lissé). */
function smooth(points: P[]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

function sampleSmooth(points: P[], steps = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push([
        u * u * u * p1[0] +
          3 * u * u * t * c1[0] +
          3 * u * t * t * c2[0] +
          t * t * t * p2[0],
        u * u * u * p1[1] +
          3 * u * u * t * c1[1] +
          3 * u * t * t * c2[1] +
          t * t * t * p2[1],
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Intersections d'une horizontale avec un polygone (x triés). */
export function scanline(poly: P[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  return xs.sort((a, b) => a - b);
}

/** Intersections d'une verticale avec un polygone (y triés). */
function vscan(poly: P[], x: number): number[] {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((x1 <= x && x2 > x) || (x2 <= x && x1 > x)) {
      ys.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1));
    }
  }
  return ys.sort((a, b) => a - b);
}

const cache = new Map<string, ShipGeometry>();

export function shipGeometry(allure: Allure, ponts: number): ShipGeometry {
  const key = `${allure}:${ponts}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sk = SKETCHES[allure];
  const all = [...sk.top, ...sk.bottom];
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const s = (SHIP_RIGHT - SHIP_LEFT) / (maxX - minX);
  const k = hullStretch(ponts);
  const X = (x: number) => SHIP_LEFT + (x - minX) * s;
  const Y = (y: number) => {
    const v = (y - sk.deckY) * s;
    return v > 0 ? v * k : v;
  };
  const T = (p: P): P => [X(p[0]), Y(p[1])];
  const top = sk.top.map(T);
  const bottom = sk.bottom.map(T);

  const outline =
    `M${f(top[0][0])},${f(top[0][1])}` +
    top
      .slice(1)
      .map((p) => ` L${f(p[0])},${f(p[1])}`)
      .join('') +
    smooth(bottom) +
    ' Z';
  const keel = `M${f(bottom[0][0])},${f(bottom[0][1])}` + smooth(bottom);
  const polygon: P[] = [...top, ...sampleSmooth(bottom).slice(1, -1)];

  const strips: Rect[] = sk.slots.map(([x1, y1, x2, y2]) => {
    const a = T([x1, y1]);
    const b = T([x2, y2]);
    return {
      x: a[0],
      y: a[1],
      w: b[0] - a[0],
      h: Math.max(8, (b[1] - a[1]) / k),
    };
  });
  // Ponts supplémentaires : une rangée de sabords de plus par pont ajouté,
  // sous la plus basse des rangées existantes.
  const hullStrips = strips.filter((r) => r.y > 0).sort((a, b) => b.w - a.w);
  if (ponts >= 2 && hullStrips[0]) {
    const base = hullStrips[0];
    let y =
      Math.max(...strips.filter((r) => r.y > 0).map((r) => r.y + r.h)) + 12;
    for (let extra = 1; extra < ponts; extra++) {
      const xs1 = scanline(polygon, y);
      const xs2 = scanline(polygon, y + base.h + 14);
      if (xs1.length < 2 || xs2.length < 2) break;
      const x1 = Math.max(base.x - 10, xs1[0] + 34, xs2[0] + 34);
      const x2 = Math.min(
        base.x + base.w + 10,
        xs1[xs1.length - 1] - 44,
        xs2[xs2.length - 1] - 44
      );
      if (x2 - x1 < 60) break;
      strips.push({ x: x1, y, w: x2 - x1, h: base.h });
      y += base.h + 12;
    }
  }

  const props: PropShape[] = sk.props.map(({ r, angle }) => {
    const a = T([r[0], r[1]]);
    const b = T([r[2], r[3]]);
    // Le croquis donne la boîte englobante ; on garde des proportions de nacelle.
    const bw = b[0] - a[0];
    const bh = b[1] - a[1];
    const horizontal = Math.abs(angle) >= 60;
    const len = Math.max(bw, bh) * (horizontal ? 1 : 0.95);
    const thick = Math.min(bw, bh) * (horizontal ? 0.95 : 0.75);
    return {
      cx: (a[0] + b[0]) / 2,
      cy: (a[1] + b[1]) / 2,
      w: Math.max(18, horizontal ? thick : Math.min(thick, len * 0.62)),
      h: Math.max(30, len),
      angle,
    };
  });

  const ys = polygon.map((p) => p[1]);
  const xsAll = polygon.map((p) => p[0]);
  const depth = Math.max(...ys);
  const geom: ShipGeometry = {
    outline,
    keel,
    polygon,
    sternEnd: X(sk.sternEnd),
    masts: sk.masts.map(X),
    strips,
    props,
    armor: sk.armor
      ? { x: X(sk.armor[0]), y1: Y(sk.armor[1]), y2: Y(sk.armor[2]) }
      : undefined,
    bow: { x: top[top.length - 1][0], y: top[top.length - 1][1] },
    stern: { x: top[0][0], y: top[0][1] },
    depth,
    bounds: {
      minX: Math.min(...xsAll),
      maxX: Math.max(...xsAll),
      minY: Math.min(...ys),
      maxY: depth,
    },
    topAt: (x) => vscan(polygon, x)[0] ?? 0,
    bottomAt: (x) => {
      const v = vscan(polygon, x);
      return v[v.length - 1] ?? depth;
    },
  };
  cache.set(key, geom);
  return geom;
}

/** Abscisses des mâts selon le gréement choisi. */
export function mastPositions(g: ShipGeometry, type: MastType): number[] {
  const m = [...g.masts].sort((a, b) => a - b);
  const triple =
    m.length >= 3
      ? m.slice(0, 3)
      : [m[0], (m[0] + m[m.length - 1]) / 2, m[m.length - 1]];
  switch (type) {
    case 'simple':
      return [triple[1]];
    case 'double':
    case 'pique':
      return [triple[0] + (triple[1] - triple[0]) * 0.25, triple[2]];
    default:
      return triple;
  }
}

/** Hauteur d'un mât (le grand mât est le plus haut). */
export function mastHeight(
  index: number,
  count: number,
  type: MastType
): number {
  if (type === 'pique') return index === 0 ? 300 : 270;
  if (count === 1) return 320;
  const main = count === 3 ? 1 : 0;
  return index === main ? 330 : 285;
}

/** Nombre total de sabords dessinés (pour répartir les canons installés). */
export function portCount(g: ShipGeometry): number {
  return g.strips.reduce((n, r) => n + Math.max(1, Math.floor(r.w / 24)), 0);
}

export function buildKey(b: Build): string {
  return JSON.stringify(b);
}
