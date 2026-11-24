import * as THREE from 'three';
import { MARKER_KINDS } from '../arpenteur/catalog';
import {
  CITIES,
  COAST,
  CRATER,
  CROSSINGS,
  DESERTS,
  DUNES,
  ISLANDS,
  LAKES,
  REGIONS,
  RIDGES,
  RIVERS,
  ROUTES,
  nodeName,
  nodePosition,
  UNKNOWN,
  UNKNOWN_POS,
} from '../arpenteur/keld';
import { travelEase, type TravelNow } from '../arpenteur/travel';
import type { Marker } from '../arpenteur/types';
import { buildCabin, type Cabin } from './cabin';
import type { RefMaterials } from './ref/materials';

// Carte 3D des déserts de Keld : grande carte en relief posée sur le bureau
// du capitaine. Terres peintes (déserts teintés, sous-régions à l'encre),
// mer peinte avec rose des vents ; géographie de la carte nationale (île de
// Fort Sekkel, fleuves, lac, cratère, dunes), chaînes de montagnes et cités
// en miniature ;
// traversées et trajets lumineux, position inconnue en tourbillon d'Aether,
// et le navire qui voyage dessus.

/** Repère de la carte (2000 × 1420) → maquette. */
const S = 0.028;
const W = 2000 * S;
const D = 1420 * S;
const X = (x: number) => (x - 1000) * S;
const Z = (y: number) => (y - 710) * S;
/** Hauteur du dessus des terres. */
const LAND = 0.55;
const CYAN = new THREE.Color('#1fc8ef');
const GOLD = new THREE.Color('#ff9a1a');

export interface WorldMapKit {
  lib: RefMaterials;
  ship: THREE.Object3D;
}

export interface WorldState {
  current: string;
  travel: TravelNow | null;
  destination: string;
  selected: string;
  hover: string;
  reachable: Set<string>;
  hangar: string;
  /** Nœuds qui ont des lieux-dits (petite étoile). */
  withSpots: Set<string>;
}

function rnd(seed: number) {
  let h = seed >>> 0 || 1;
  return () => (h = (h * 16807) % 2147483647) / 2147483647;
}

function inside(p: [number, number], poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      c = !c;
  }
  return c;
}

/** Terres émergées : continent et îles. */
const LANDS: [number, number][][] = [COAST, ...ISLANDS];
const onLand = (p: [number, number]) =>
  LANDS.some((l) => inside(p, l)) && !LAKES.some((l) => inside(p, l));

/** Étiquette (plaque sombre, texte clair). */
function label(text: string, size = 1, accent = '#f3dfb4') {
  const cv = document.createElement('canvas');
  cv.width = 640;
  cv.height = 140;
  const g = cv.getContext('2d')!;
  g.font = 'bold 50px Georgia, serif';
  const w = Math.min(620, g.measureText(text).width + 56);
  const x0 = (640 - w) / 2;
  g.fillStyle = 'rgba(22,14,8,0.78)';
  g.strokeStyle = 'rgba(217,164,65,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x0, 24, w, 90, 10);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 320, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sp.scale.set(7 * size, 1.53 * size, 1);
  sp.renderOrder = 20;
  return sp;
}

/** Peinture de la carte : mer, rose des vents, terres, déserts, frontières. */
function paint() {
  const cv = document.createElement('canvas');
  cv.width = 2000;
  cv.height = 1420;
  const g = cv.getContext('2d')!;
  const r = rnd(9);
  // Mer.
  g.fillStyle = '#7e9ba6';
  g.fillRect(0, 0, 2000, 1420);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '20,40,50'},${0.03 + r() * 0.04})`;
    g.fillRect(r() * 2000, r() * 1420, 2 + r() * 6, 2 + r() * 6);
  }
  // Petites vagues.
  g.strokeStyle = 'rgba(30,55,66,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 160; i++) {
    const x = r() * 2000,
      y = r() * 1420;
    if (onLand([x, y])) continue;
    g.beginPath();
    g.arc(x, y, 9, Math.PI * 1.1, Math.PI * 1.9);
    g.arc(x + 16, y, 9, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  // Rose des vents (en mer, au sud-ouest).
  const rose = (cx: number, cy: number, R: number) => {
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = '#3a2a18';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, R * 0.78, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, R * 0.7, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
      const l = k % 4 === 0 ? R : k % 2 === 0 ? R * 0.62 : R * 0.42;
      const w = k % 4 === 0 ? 0.13 : 0.09;
      for (const side of [0, 1]) {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
        g.lineTo(
          Math.cos(a + (side ? w : -w)) * l * 0.3,
          Math.sin(a + (side ? w : -w)) * l * 0.3
        );
        g.closePath();
        g.fillStyle = side ? '#3a2a18' : k % 4 === 0 ? '#b8862c' : '#e9dcc0';
        g.fill();
        g.stroke();
      }
    }
    g.fillStyle = '#3a2a18';
    g.font = 'bold 44px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('N', 0, -R - 14);
    g.restore();
  };
  rose(150, 1250, 120);
  // Cartouche.
  g.save();
  g.translate(1700, 150);
  g.fillStyle = 'rgba(233,220,192,0.92)';
  g.strokeStyle = '#3a2a18';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(-230, -70, 460, 140, 18);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2a18';
  g.font = 'italic bold 52px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('Déserts de Keld', 0, 14);
  g.restore();
  // Terres (sable), puis déserts teintés.
  const path = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  const lands = () => {
    g.beginPath();
    for (const l of LANDS) {
      l.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
  };
  const line = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  };
  // Ombre des côtes sur la mer, puis le sable.
  g.save();
  g.shadowColor = 'rgba(20,35,45,0.45)';
  g.shadowBlur = 26;
  lands();
  g.fillStyle = '#dcc493';
  g.fill();
  g.restore();
  g.save();
  lands();
  g.clip();
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '120,90,50'},${0.04 + r() * 0.05})`;
    g.fillRect(r() * 2000, r() * 1420, 2 + r() * 5, 2 + r() * 5);
  }
  // Piémonts plus sombres le long des crêtes.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const rg of RIDGES) {
    line(rg);
    g.strokeStyle = 'rgba(120,88,52,0.2)';
    g.lineWidth = 130;
    g.stroke();
    g.strokeStyle = 'rgba(105,76,44,0.22)';
    g.lineWidth = 64;
    g.stroke();
  }
  for (const reg of REGIONS) {
    path(reg.points);
    const c = new THREE.Color(DESERTS[reg.desert].color);
    g.fillStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0.3)`;
    g.fill();
  }
  // Dunes : petits arcs d'encre.
  g.strokeStyle = 'rgba(110,78,40,0.55)';
  g.lineWidth = 2.5;
  for (const [dx, dy] of DUNES) {
    for (let k = 0; k < 3; k++) {
      const x = dx + (r() - 0.5) * 60,
        y = dy + (r() - 0.5) * 34;
      g.beginPath();
      g.moveTo(x - 26, y + 6);
      g.quadraticCurveTo(x - 6, y - 14, x + 10, y - 2);
      g.quadraticCurveTo(x + 20, y + 4, x + 30, y + 6);
      g.stroke();
    }
  }
  // Cratère.
  const cg = g.createRadialGradient(
    CRATER.x,
    CRATER.y,
    4,
    CRATER.x,
    CRATER.y,
    70
  );
  cg.addColorStop(0, 'rgba(40,24,14,0.85)');
  cg.addColorStop(0.45, 'rgba(90,58,32,0.6)');
  cg.addColorStop(1, 'rgba(90,58,32,0)');
  g.fillStyle = cg;
  g.beginPath();
  g.ellipse(CRATER.x, CRATER.y, 72, 48, -0.15, 0, Math.PI * 2);
  g.fill();
  // Fleuves.
  for (const rv of RIVERS) {
    line(rv);
    g.strokeStyle = '#3a2a18';
    g.lineWidth = 10;
    g.stroke();
    g.strokeStyle = '#6f9cab';
    g.lineWidth = 6;
    g.stroke();
  }
  // Frontières des sous-régions, à l'encre.
  g.setLineDash([10, 8]);
  g.strokeStyle = 'rgba(58,42,24,0.75)';
  g.lineWidth = 3;
  for (const reg of REGIONS) {
    path(reg.points);
    g.stroke();
  }
  g.setLineDash([]);
  g.restore();
  // Lacs.
  for (const l of LAKES) {
    path(l);
    g.fillStyle = '#6f9cab';
    g.fill();
    g.strokeStyle = '#3a2a18';
    g.lineWidth = 4;
    g.stroke();
  }
  // Côtes.
  for (const l of LANDS) {
    path(l);
    g.strokeStyle = '#3a2a18';
    g.lineWidth = 5;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface Node {
  id: string;
  hit: THREE.Object3D;
  overlay?: THREE.Mesh;
  outline?: THREE.Mesh;
  label: THREE.Sprite;
  labelText: string;
  star?: THREE.Sprite;
}

export class WorldMapScene {
  readonly scene = new THREE.Scene();
  readonly width = W;
  readonly depth = D;
  private own: { dispose(): void }[] = [];
  private nodes = new Map<string, Node>();
  private links: {
    a: string;
    b: string;
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
    kind: 'traversee' | 'trajet';
  }[] = [];
  private ship: THREE.Group;
  private flag: THREE.Group;
  private vortex: THREE.Group;
  private pins = new THREE.Group();
  private hangarMark: THREE.Group;
  private flash: THREE.Sprite;
  private cabin: Cabin;
  private linkU = { uTime: { value: 0 } };
  private starTex: THREE.Texture;

  constructor(kit: WorldMapKit) {
    const { lib } = kit;
    const sc = this.scene;
    sc.background = new THREE.Color('#0c0806');
    const keep = <T extends { dispose(): void }>(x: T) => {
      this.own.push(x);
      return x;
    };
    // Cabine et bureau autour.
    this.cabin = buildCabin(lib, W, D, -1.8);
    sc.add(this.cabin.group);
    this.own.push(this.cabin);
    // Cadre de la carte.
    const t = 1.3;
    const frame = (w: number, d: number, x: number, z: number) => {
      const b = new THREE.Mesh(
        keep(new THREE.BoxGeometry(w, 2, d)),
        lib.hullWood
      );
      b.position.set(x, -0.75, z);
      b.castShadow = b.receiveShadow = true;
      sc.add(b);
      const trim = new THREE.Mesh(
        keep(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02)),
        lib.brass
      );
      trim.position.set(x, 0.3, z);
      sc.add(trim);
    };
    frame(W + 2 * t, t, 0, -D / 2 - t / 2);
    frame(W + 2 * t, t, 0, D / 2 + t / 2);
    frame(t, D, -W / 2 - t / 2, 0);
    frame(t, D, W / 2 + t / 2, 0);

    // Mer peinte et terres en relief (même peinture).
    const tex = keep(paint());
    const seaMat = keep(
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    );
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, D)), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.2;
    sea.receiveShadow = true;
    sc.add(sea);
    const v2 = (pts: [number, number][]) =>
      pts.map(([x, y]) => new THREE.Vector2(x, -y));
    const shapes = LANDS.map((l) => {
      const sh = new THREE.Shape(v2(l));
      for (const lk of LAKES)
        if (inside(lk[0], l)) sh.holes.push(new THREE.Path(v2(lk)));
      return sh;
    });
    const landG = keep(
      new THREE.ExtrudeGeometry(shapes, {
        depth: (LAND + 0.2) / S,
        bevelEnabled: true,
        bevelThickness: 2,
        bevelSize: 1.5,
        bevelSegments: 1,
        curveSegments: 4,
      })
    );
    const capTex = tex.clone();
    capTex.needsUpdate = true;
    keep(capTex);
    capTex.repeat.set(1 / 2000, 1 / 1420);
    capTex.offset.set(0, 1);
    const capMat = keep(
      new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.9 })
    );
    const sideMat = keep(
      new THREE.MeshStandardMaterial({ color: '#b89a64', roughness: 0.95 })
    );
    const land = new THREE.Mesh(landG, [capMat, sideMat]);
    land.rotation.x = -Math.PI / 2;
    land.scale.setScalar(S);
    land.position.set(X(0), -0.2, Z(0));
    land.castShadow = land.receiveShadow = true;
    sc.add(land);

    // Lumières de la table (en plus de la cabine).
    sc.add(new THREE.HemisphereLight('#ffe9cc', '#2a1c12', 0.75));
    const sun = new THREE.DirectionalLight('#ffd9a8', 2.1);
    sun.position.set(-25, 45, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc2 = sun.shadow.camera as THREE.OrthographicCamera;
    sc2.left = -W / 2 - 4;
    sc2.right = W / 2 + 4;
    sc2.top = D / 2 + 4;
    sc2.bottom = -D / 2 - 4;
    sc2.far = 140;
    sun.shadow.bias = -0.0005;
    sc.add(sun);

    // Montagnes en miniature.
    const r = rnd(77);
    const rock = keep(
      new THREE.MeshStandardMaterial({
        color: '#b39470',
        roughness: 0.9,
        flatShading: true,
      })
    );
    const snow = keep(
      new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.8 })
    );
    // Chaînes le long des crêtes de la carte nationale : sommets plus hauts
    // au milieu de la chaîne, contreforts de part et d'autre.
    const peak = (x: number, y: number, h: number) => {
      if (!onLand([x, y])) return;
      const cone = new THREE.Mesh(
        keep(
          new THREE.ConeGeometry(
            0.32 + h * 0.2 + r() * 0.22,
            h,
            6 + Math.floor(r() * 3)
          )
        ),
        rock
      );
      cone.position.set(X(x), LAND + h / 2 - 0.05, Z(y));
      cone.rotation.y = r() * 3;
      cone.castShadow = cone.receiveShadow = true;
      sc.add(cone);
      if (h > 1.75) {
        const cap = new THREE.Mesh(
          keep(new THREE.ConeGeometry(0.24, 0.42, 6)),
          snow
        );
        cap.position.set(X(x), LAND + h - 0.25, Z(y));
        sc.add(cap);
      }
    };
    for (const rg of RIDGES) {
      const seg: number[] = [];
      let total = 0;
      for (let i = 1; i < rg.length; i++) {
        const l = Math.hypot(rg[i][0] - rg[i - 1][0], rg[i][1] - rg[i - 1][1]);
        seg.push(l);
        total += l;
      }
      for (let d = 0; d <= total; d += 34) {
        let i = 0,
          t = d;
        while (i < seg.length - 1 && t > seg[i]) t -= seg[i++];
        const [ax, ay] = rg[i],
          [bx, by] = rg[i + 1];
        const u = Math.min(1, t / seg[i]);
        const x = ax + (bx - ax) * u,
          y = ay + (by - ay) * u;
        const nx = -(by - ay) / seg[i],
          ny = (bx - ax) / seg[i];
        const mid = Math.sin((d / total) * Math.PI);
        const off = (r() - 0.5) * 24;
        peak(x + nx * off, y + ny * off, 1 + mid * 1.1 + r() * 0.5);
        for (const side of [-1, 1]) {
          if (r() < 0.55) {
            const o = side * (30 + r() * 26);
            peak(x + nx * o, y + ny * o, 0.5 + mid * 0.4 + r() * 0.4);
          }
        }
      }
    }
    // Cratère : rebord en anneau.
    const rim = new THREE.Mesh(
      keep(new THREE.TorusGeometry(1.55, 0.32, 8, 28)),
      rock
    );
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(1, 0.68, 1);
    rim.position.set(X(CRATER.x), LAND + 0.08, Z(CRATER.y));
    rim.castShadow = rim.receiveShadow = true;
    sc.add(rim);

    // Sous-régions : zones cliquables (surbrillance), contours lumineux.
    const overlayG = (pts: [number, number][]) => {
      const g = new THREE.ShapeGeometry(
        new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(X(x), -Z(y))))
      );
      g.rotateX(-Math.PI / 2);
      return keep(g);
    };
    for (const reg of REGIONS) {
      const col = new THREE.Color(DESERTS[reg.desert].color);
      const ov = new THREE.Mesh(
        overlayG(reg.points),
        keep(
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        )
      );
      ov.position.y = LAND + 0.03;
      ov.userData.node = reg.id;
      ov.renderOrder = 2;
      sc.add(ov);
      const loop = reg.points.map(
        ([x, y]) => new THREE.Vector3(X(x), LAND + 0.08, Z(y))
      );
      const outline = new THREE.Mesh(
        keep(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(loop, true, 'catmullrom', 0.05),
            120,
            0.07,
            5,
            true
          )
        ),
        keep(
          new THREE.MeshBasicMaterial({
            color: CYAN,
            transparent: true,
            opacity: 0,
          })
        )
      );
      sc.add(outline);
      const lb = label(reg.id, 0.8);
      lb.position.set(X(reg.label.x), LAND + 2.2, Z(reg.label.y));
      sc.add(lb);
      this.own.push(lb.material, (lb.material as THREE.SpriteMaterial).map!);
      this.nodes.set(reg.id, {
        id: reg.id,
        hit: ov,
        overlay: ov,
        outline,
        label: lb,
        labelText: reg.id,
      });
    }

    // Cités en miniature.
    const stone = keep(
      new THREE.MeshStandardMaterial({ color: '#cdb994', roughness: 0.8 })
    );
    const roof = keep(
      new THREE.MeshStandardMaterial({ color: '#8a3a26', roughness: 0.7 })
    );
    const hitG = keep(new THREE.CylinderGeometry(1.5, 1.5, 3, 12));
    hitG.translate(0, 1.5, 0);
    const hitM = keep(new THREE.MeshBasicMaterial({ visible: false }));
    for (const c of CITIES) {
      const g = new THREE.Group();
      g.position.set(X(c.x), LAND, Z(c.y));
      const rr = rnd(c.x * 7 + c.y);
      const n = c.capital ? 11 : 7;
      const base = new THREE.Mesh(
        keep(
          new THREE.CylinderGeometry(
            c.capital ? 1.5 : 1.15,
            c.capital ? 1.6 : 1.25,
            0.25,
            24
          )
        ),
        stone
      );
      base.position.y = 0.12;
      base.castShadow = base.receiveShadow = true;
      g.add(base);
      for (let i = 0; i < n; i++) {
        const a = rr() * Math.PI * 2,
          d = rr() * (c.capital ? 1.1 : 0.8);
        const w = 0.25 + rr() * 0.25,
          h = 0.3 + rr() * 0.7;
        const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, w)), stone);
        b.position.set(Math.cos(a) * d, 0.25 + h / 2, Math.sin(a) * d);
        b.castShadow = true;
        g.add(b);
        const rf = new THREE.Mesh(
          keep(new THREE.ConeGeometry(w * 0.78, 0.25, 4)),
          roof
        );
        rf.position.set(b.position.x, 0.25 + h + 0.12, b.position.z);
        rf.rotation.y = Math.PI / 4;
        g.add(rf);
      }
      // Tour (et coupole de laiton pour la capitale).
      const tower = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.22, 0.28, c.capital ? 1.9 : 1.3, 10)),
        stone
      );
      tower.position.y = 0.25 + (c.capital ? 0.95 : 0.65);
      tower.castShadow = true;
      g.add(tower);
      const top = new THREE.Mesh(
        keep(
          new THREE.SphereGeometry(
            c.capital ? 0.45 : 0.3,
            14,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
          )
        ),
        lib.brass
      );
      top.position.y = 0.25 + (c.capital ? 1.9 : 1.3);
      g.add(top);
      const hit = new THREE.Mesh(hitG, hitM);
      hit.userData.node = c.id;
      g.add(hit);
      sc.add(g);
      const lb = label(c.name, c.capital ? 0.95 : 0.8);
      lb.position.set(X(c.x), LAND + (c.capital ? 3.6 : 3), Z(c.y));
      sc.add(lb);
      this.own.push(lb.material, (lb.material as THREE.SpriteMaterial).map!);
      this.nodes.set(c.id, { id: c.id, hit, label: lb, labelText: c.name });
    }

    // Position inconnue : tourbillon d'Aether en mer.
    this.vortex = new THREE.Group();
    this.vortex.position.set(X(UNKNOWN_POS.x), 0, Z(UNKNOWN_POS.y));
    const vmat = keep(
      new THREE.MeshStandardMaterial({
        color: '#b48cff',
        emissive: new THREE.Color('#8a5cff'),
        emissiveIntensity: 1.4,
        roughness: 0.3,
      })
    );
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        keep(
          new THREE.TorusGeometry(0.6 + i * 0.45, 0.06, 6, 48, Math.PI * 1.4)
        ),
        vmat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05 + i * 0.12;
      ring.userData.spin = (i % 2 ? -1 : 1) * (0.8 + i * 0.3);
      this.vortex.add(ring);
    }
    const vhit = new THREE.Mesh(hitG, hitM);
    vhit.userData.node = UNKNOWN;
    this.vortex.add(vhit);
    sc.add(this.vortex);
    const vlb = label('Position inconnue', 0.8, '#e2ccff');
    vlb.position.set(X(UNKNOWN_POS.x), 2.6, Z(UNKNOWN_POS.y));
    sc.add(vlb);
    this.own.push(vlb.material, (vlb.material as THREE.SpriteMaterial).map!);
    this.nodes.set(UNKNOWN, {
      id: UNKNOWN,
      hit: vhit,
      label: vlb,
      labelText: 'Position inconnue',
    });

    // Traversées et trajets : arcs lumineux (tirets qui défilent).
    const arc = (a: string, b: string, lift: number) => {
      const pa = nodePosition(a)!,
        pb = nodePosition(b)!;
      const A = new THREE.Vector3(X(pa.x), LAND + 0.15, Z(pa.y)),
        B = new THREE.Vector3(X(pb.x), LAND + 0.15, Z(pb.y));
      const M = A.clone().lerp(B, 0.5);
      M.y += lift + A.distanceTo(B) * 0.08;
      return new THREE.QuadraticBezierCurve3(A, M, B);
    };
    const linkMat = (col: THREE.Color) =>
      keep(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.linkU.uTime,
            uCol: { value: col.clone() },
            uOn: { value: 0 },
            uLen: { value: 1 },
          },
          transparent: true,
          depthWrite: false,
          vertexShader:
            'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
          fragmentShader: `uniform float uTime, uOn, uLen; uniform vec3 uCol; varying vec2 vUv;
void main(){ float dash = step(.45, fract(vUv.x * uLen * .9 - uTime * (.6 + uOn)));
  float a = mix(.28, .95, uOn) * mix(.35, 1., dash);
  gl_FragColor = vec4(mix(uCol * .7, uCol * 1.25 + .1, uOn), a); }`,
        })
      );
    const addLink = (a: string, b: string, kind: 'traversee' | 'trajet') => {
      const curve = arc(a, b, kind === 'trajet' ? 0.25 : 0.45);
      const mat = linkMat(kind === 'traversee' ? CYAN : GOLD);
      mat.uniforms.uLen.value = curve.getLength() / 0.8;
      const mesh = new THREE.Mesh(
        keep(
          new THREE.TubeGeometry(
            curve,
            48,
            kind === 'trajet' ? 0.07 : 0.09,
            5,
            false
          )
        ),
        mat
      );
      mesh.renderOrder = 3;
      sc.add(mesh);
      this.links.push({ a, b, mesh, mat, kind });
    };
    CROSSINGS.forEach(([a, b]) => addLink(a, b, 'traversee'));
    ROUTES.forEach(([a, b]) => addLink(a, b, 'trajet'));

    // Navire (copie du modèle de la scène).
    this.ship = new THREE.Group();
    const s = kit.ship.clone(true);
    s.traverse((o) => {
      o.matrixAutoUpdate = true;
      if ((o as THREE.Points).isPoints || (o as THREE.Light).isLight)
        o.visible = false;
    });
    s.matrix.identity();
    s.position.set(0, 0, 0);
    s.rotation.set(0, 0, 0);
    s.scale.setScalar(0.03);
    this.ship.add(s);
    sc.add(this.ship);
    // Drapeau du cap (destination).
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6)),
      lib.brass
    );
    pole.position.y = 1.1;
    this.flag.add(pole);
    const cloth = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(0.9, 0.55)),
      keep(
        new THREE.MeshStandardMaterial({
          color: '#c0392b',
          side: THREE.DoubleSide,
        })
      )
    );
    cloth.position.set(0.45, 1.9, 0);
    this.flag.add(cloth);
    sc.add(this.flag);
    // Hangar de l'équipage : petite nef de laiton à côté de la cité.
    this.hangarMark = new THREE.Group();
    const nef = new THREE.Mesh(
      keep(
        new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16, 1, false, 0, Math.PI)
      ),
      lib.brass
    );
    nef.rotation.set(0, 0, Math.PI / 2);
    nef.rotation.y = Math.PI / 2;
    nef.position.y = 0.05;
    this.hangarMark.add(nef);
    sc.add(this.hangarMark);
    // Repères (épingles).
    sc.add(this.pins);
    // Éclair d'Aether (téléportation vers ou depuis la position inconnue).
    const fc = document.createElement('canvas');
    fc.width = fc.height = 128;
    const fg = fc.getContext('2d')!;
    const gr = fg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(200,160,255,0.9)');
    gr.addColorStop(0.6, 'rgba(140,90,255,0.35)');
    gr.addColorStop(1, 'rgba(120,80,255,0)');
    fg.fillStyle = gr;
    fg.fillRect(0, 0, 128, 128);
    const ft = keep(new THREE.CanvasTexture(fc));
    this.flash = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: ft,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    this.flash.scale.setScalar(2);
    this.flash.visible = false;
    this.flash.renderOrder = 15;
    sc.add(this.flash);
    // Étoile des lieux-dits.
    const st = document.createElement('canvas');
    st.width = st.height = 64;
    const sg = st.getContext('2d')!;
    sg.fillStyle = '#7ff3ff';
    sg.font = 'bold 54px serif';
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.fillText('✦', 32, 34);
    this.starTex = keep(new THREE.CanvasTexture(st));
  }

  /** Objets cliquables (userData.node = identifiant du nœud). */
  get hits() {
    return [...this.nodes.values()].map((n) => n.hit);
  }

  /** Point de la carte d'un nœud. */
  nodePoint(id: string) {
    const p = nodePosition(id);
    return p ? new THREE.Vector3(X(p.x), LAND, Z(p.y)) : null;
  }

  /** Noms donnés par le groupe (étiquettes refaites quand ils changent). */
  setNames(names: Record<string, string>) {
    for (const n of this.nodes.values()) {
      if (n.id === UNKNOWN) continue;
      const txt =
        REGIONS.some((r) => r.id === n.id) && names[n.id]
          ? `${names[n.id]} · ${n.id}`
          : nodeName(n.id, names);
      if (txt === n.labelText) continue;
      n.labelText = txt;
      const old = n.label;
      const isCity = !REGIONS.some((r) => r.id === n.id);
      const lb = label(txt, isCity ? 0.8 : 0.8);
      lb.position.copy(old.position);
      this.scene.remove(old);
      old.material.map?.dispose();
      old.material.dispose();
      this.scene.add(lb);
      n.label = lb;
      this.own.push(lb.material, lb.material.map!);
    }
  }

  /** Repères posés sur la carte (épingles autour de leur nœud). */
  setMarkers(markers: Marker[]) {
    for (const c of [...this.pins.children]) {
      this.pins.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    }
    const by = new Map<string, Marker[]>();
    for (const m of markers) {
      const k = m.sector.toUpperCase();
      by.set(k, [...(by.get(k) ?? []), m]);
    }
    for (const [node, list] of by) {
      const p = nodePosition(node);
      if (!p) continue;
      list.slice(0, 6).forEach((m, i) => {
        const a = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.55;
        const x = X(p.x + Math.cos(a) * 70),
          z = Z(p.y + Math.sin(a) * 70);
        const col = MARKER_KINDS.find((k) => k.id === m.kind)?.color ?? '#fff';
        const g = new THREE.Group();
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6),
          new THREE.MeshStandardMaterial({
            color: '#c9c2b4',
            metalness: 0.8,
            roughness: 0.3,
          })
        );
        stem.position.y = 0.55;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 14, 10),
          new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.4,
            transparent: m.hidden,
            opacity: m.hidden ? 0.55 : 1,
          })
        );
        head.position.y = 1.15;
        head.castShadow = true;
        g.add(stem, head);
        g.position.set(x, LAND, z);
        this.pins.add(g);
      });
    }
  }

  update(time: number, st: WorldState) {
    this.cabin.update(time);
    this.linkU.uTime.value = time;
    for (const ring of this.vortex.children)
      if (ring.userData.spin) ring.rotation.z = time * ring.userData.spin;
    // Sous-régions : survol, sélection, accessibles depuis la position.
    for (const n of this.nodes.values()) {
      const hot = n.id === st.hover,
        sel = n.id === st.selected,
        reach = st.reachable.has(n.id),
        here = n.id === (st.current || UNKNOWN);
      if (n.overlay)
        (n.overlay.material as THREE.MeshBasicMaterial).opacity = sel
          ? 0.34
          : hot
            ? 0.22
            : 0;
      if (n.outline) {
        const m = n.outline.material as THREE.MeshBasicMaterial;
        m.color.copy(here ? GOLD : CYAN);
        m.opacity = here
          ? 0.9
          : reach
            ? 0.45 + 0.35 * Math.sin(time * 3) ** 2
            : sel || hot
              ? 0.6
              : 0;
      }
      const k = hot || sel ? 1.15 : 1;
      const base =
        n.label.userData.base ??
        (n.label.userData.base = n.label.scale.clone());
      n.label.scale.set(base.x * k, base.y * k, 1);
      // Étoile : ce nœud a des lieux-dits.
      if (st.withSpots.has(n.id) && !n.star) {
        n.star = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.starTex,
            transparent: true,
            depthTest: false,
          })
        );
        n.star.scale.set(1, 1, 1);
        n.star.position
          .copy(n.label.position)
          .add(new THREE.Vector3(0, 0.95, 0));
        n.star.renderOrder = 21;
        this.scene.add(n.star);
        this.own.push(n.star.material);
      }
      if (n.star)
        n.star.position
          .copy(n.label.position)
          .add(new THREE.Vector3(0, 0.95 + 0.1 * Math.sin(time * 2), 0));
    }
    // Liens : allumés s'ils partent de la position actuelle (ou du voyage).
    const cur = st.current || UNKNOWN;
    for (const l of this.links) {
      const on = st.travel
        ? (l.a === st.travel.from && l.b === st.travel.to) ||
          (l.b === st.travel.from && l.a === st.travel.to)
        : l.a === cur || l.b === cur;
      l.mat.uniforms.uOn.value = on ? 1 : 0;
    }
    // Navire : au nœud, ou en route (arc entre les deux nœuds).
    const tr = st.travel;
    let pos: THREE.Vector3 | null;
    let dir = new THREE.Vector3(1, 0, 0);
    let warp = 1;
    // Vers ou depuis la position inconnue : pas de trajet sur la carte, le
    // navire disparaît dans un éclair d'Aether et reparaît à l'arrivée.
    const portal =
      tr && (tr.from === UNKNOWN || tr.to === UNKNOWN || !tr.from || !tr.to);
    this.flash.visible = false;
    if (tr && portal) {
      const after = tr.p >= 0.5;
      const id = after ? tr.to || UNKNOWN : tr.from || UNKNOWN;
      pos = this.nodePoint(id);
      if (pos) pos.y += id === UNKNOWN ? 1 : 0.9;
      if (pos && id !== UNKNOWN) pos.z += 1.3;
      // Rétrécit et s'efface juste avant le milieu, renaît juste après.
      const k = after
        ? Math.min(1, (tr.p - 0.5) / 0.12)
        : Math.min(1, (0.5 - tr.p) / 0.12);
      warp = k * k * (3 - 2 * k);
      if (pos && warp < 1) {
        this.flash.visible = true;
        this.flash.position.copy(pos);
        const f = 1 - warp;
        this.flash.scale.setScalar(1 + f * 3);
        (this.flash.material as THREE.SpriteMaterial).opacity =
          Math.sin(f * Math.PI * 0.5) * 0.9;
      }
    } else if (tr) {
      const a = this.nodePoint(tr.from),
        b = this.nodePoint(tr.to);
      if (a && b) {
        const k = travelEase(tr.p);
        const m = a.clone().lerp(b, 0.5);
        m.y += 1.2 + a.distanceTo(b) * 0.08;
        const curve = new THREE.QuadraticBezierCurve3(a, m, b);
        pos = curve.getPoint(k);
        dir = curve.getTangent(Math.min(0.99, k)).setY(0).normalize();
        pos.y += 0.6;
      } else pos = this.nodePoint(tr.to);
    } else {
      pos = this.nodePoint(cur);
      if (pos) pos.y += cur === UNKNOWN ? 1 : 0.9;
      if (pos && cur !== UNKNOWN) pos.z += 1.3;
    }
    this.ship.visible = !!pos && warp > 0.02;
    this.ship.scale.setScalar(Math.max(0.02, warp));
    if (pos) {
      this.ship.position.copy(pos);
      this.ship.position.y += Math.sin(time * 1.6) * 0.05;
      this.ship.rotation.y = Math.atan2(-dir.z, dir.x);
    }
    // Drapeau du cap.
    const dp = st.destination ? this.nodePoint(st.destination) : null;
    this.flag.visible = !!dp && !tr;
    if (dp) this.flag.position.copy(dp).add(new THREE.Vector3(0.9, 0, -0.6));
    const hp = st.hangar ? this.nodePoint(st.hangar) : null;
    this.hangarMark.visible = !!hp;
    if (hp)
      this.hangarMark.position.copy(hp).add(new THREE.Vector3(1.5, 0.15, 0.6));
  }

  dispose() {
    this.setMarkers([]);
    this.own.forEach((x) => x.dispose());
    this.own = [];
  }
}

/** Carte gardée d'une ouverture à l'autre (refaite si le navire change). */
let cached: { ship: THREE.Object3D; scene: WorldMapScene } | null = null;
export function cachedWorldMap(kit: WorldMapKit) {
  if (cached && cached.ship === kit.ship)
    return { scene: cached.scene, fresh: false };
  cached?.scene.dispose();
  cached = { ship: kit.ship, scene: new WorldMapScene(kit) };
  return { scene: cached.scene, fresh: true };
}
