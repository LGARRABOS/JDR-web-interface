import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sandHeight, type GroundParams } from './ground';

// Grands troupeaux de la savane : hardes d'herbivores à longues cornes qui
// paissent et cheminent lentement. Chaque bête : corps, encolure et tête
// (qui s'abaisse pour brouter), quatre pattes qui marchent ; le tout
// dessiné en trois lots (quelques appels de dessin pour tous les troupeaux).

const LOOP = 2600;

interface Beast {
  ox: number;
  oz: number;
  seed: number;
  size: number;
  tone: THREE.Color;
}
interface Herd {
  qx: number;
  z: number;
  dir: number;
  speed: number;
  beasts: Beast[];
}

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function rnd(seed: number) {
  let h = (seed * 2654435761) >>> 0 || 9;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export class Herds {
  readonly root = new THREE.Group();
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private herds: Herd[] = [];
  private n = 0;

  constructor(patch: (m: THREE.Material) => void) {
    const r0 = rnd(31);
    for (let h = 0; h < 7; h++) {
      const count = 9 + Math.floor(r0() * 7);
      const far = r0() < 0.7;
      const herd: Herd = {
        qx: (h / 7) * LOOP + r0() * 200,
        z: far ? -(110 + r0() * 260) : 90 + r0() * 160,
        dir: (r0() - 0.5) * 1.2 + (r0() < 0.5 ? 0 : Math.PI),
        speed: 0.6 + r0() * 0.8,
        beasts: [],
      };
      for (let i = 0; i < count; i++)
        herd.beasts.push({
          ox: (r0() - 0.5) * 60,
          oz: (r0() - 0.5) * 40,
          seed: r0() * 100,
          size: 1.45 + r0() * 0.45,
          tone: new THREE.Color().setHSL(
            0.07 + r0() * 0.03,
            0.5,
            0.24 + r0() * 0.12
          ),
        });
      this.herds.push(herd);
      this.n += count;
    }
    // Corps : tronc, croupe, queue (repère : avant = +x, hauteur au garrot ~2,3 m).
    const trunk = new THREE.SphereGeometry(1, 14, 10);
    trunk.scale(1.55, 0.78, 0.62);
    trunk.translate(0, 2.05, 0);
    const hump = new THREE.SphereGeometry(0.7, 10, 8);
    hump.scale(1, 0.7, 0.8);
    hump.translate(0.65, 2.55, 0);
    const tail = new THREE.CylinderGeometry(0.05, 0.09, 1.1, 5);
    tail.rotateZ(-0.5);
    tail.translate(-1.75, 1.75, 0);
    const bodyG = mergeGeometries([
      trunk.toNonIndexed(),
      hump.toNonIndexed(),
      tail.toNonIndexed(),
    ])!;
    // Encolure et tête (pivot à la base du cou), longues cornes droites.
    const neck = new THREE.CylinderGeometry(0.22, 0.32, 1.3, 8);
    neck.rotateZ(-0.9);
    neck.translate(0.5, 0.35, 0);
    const skull = new THREE.SphereGeometry(0.34, 10, 8);
    skull.scale(1.6, 0.8, 0.75);
    skull.translate(1.2, 0.75, 0);
    const horns: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const hn = new THREE.ConeGeometry(0.05, 1.7, 5);
      hn.rotateZ(0.85);
      hn.rotateX(s * 0.12);
      hn.translate(0.55, 1.55, s * 0.12);
      horns.push(hn.toNonIndexed());
    }
    const headG = mergeGeometries([
      neck.toNonIndexed(),
      skull.toNonIndexed(),
      ...horns,
    ])!;
    const leg = new THREE.CylinderGeometry(0.1, 0.07, 1.75, 6);
    leg.translate(0, -0.875, 0);
    const mat = (rough: number) => {
      const m = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: rough,
      });
      patch(m);
      return m;
    };
    const mk = (g: THREE.BufferGeometry, per: number) => {
      const im = new THREE.InstancedMesh(g, mat(0.85), this.n * per);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.castShadow = true;
      im.frustumCulled = false;
      this.root.add(im);
      return im;
    };
    this.body = mk(bodyG, 1);
    this.head = mk(headG, 1);
    this.legs = mk(leg, 4);
    let i = 0;
    for (const h of this.herds)
      for (const b of h.beasts) {
        this.body.setColorAt(i, b.tone);
        this.head.setColorAt(i, b.tone.clone().multiplyScalar(0.9));
        for (let l = 0; l < 4; l++)
          this.legs.setColorAt(i * 4 + l, b.tone.clone().multiplyScalar(0.8));
        i++;
      }
  }

  frame(time: number, g: GroundParams, visible: boolean) {
    this.root.visible = visible;
    if (!visible) return;
    let i = 0;
    for (const h of this.herds) {
      // Le troupeau chemine lentement (dans le repère du désert).
      const hx = h.qx + Math.cos(h.dir) * h.speed * time;
      const hz = h.z + Math.sin(h.dir) * h.speed * time * 0.15;
      for (const b of h.beasts) {
        const t = time + b.seed;
        // Alternance brouter / marcher, propre à chaque bête.
        const grazing = Math.sin(t * 0.21 + b.seed) > 0.1;
        const step = grazing ? 0 : 1;
        const qx = hx + b.ox + Math.sin(t * 0.07) * 3;
        const z = hz + b.oz + Math.cos(t * 0.05) * 2;
        let x = ((((qx - g.scroll) % LOOP) + LOOP * 1.5) % LOOP) - LOOP / 2;
        if (Math.abs(x) > LOOP / 2 - 40) x = Math.sign(x) * (LOOP / 2 - 40);
        // Pas de bêtes sur les quais.
        const city = g.calm > 0 && Math.hypot(x - g.calmX, z) < 700;
        const y = sandHeight(x, z, g);
        const yaw = -(h.dir + Math.sin(t * 0.13) * 0.5);
        const s = city ? 0.0001 : b.size;
        _q.setFromEuler(_e.set(0, yaw, 0));
        _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
        this.body.setMatrixAt(i, _m);
        const pitch = grazing
          ? -0.95 - 0.1 * Math.sin(t * 2)
          : 0.1 * Math.sin(t * 1.5);
        _a.copy(_m)
          .multiply(_b.makeTranslation(1.25, 2.3, 0))
          .multiply(_b.makeRotationZ(pitch));
        this.head.setMatrixAt(i, _a);
        const ph = t * 4.2 * step;
        [
          [0.95, 0.38, 0],
          [0.95, -0.38, Math.PI],
          [-1.0, 0.38, Math.PI],
          [-1.0, -0.38, 0],
        ].forEach(([lx, lz, off], l) => {
          const sw = Math.sin(ph + off) * 0.45 * step;
          _a.copy(_m)
            .multiply(_b.makeTranslation(lx, 1.85, lz))
            .multiply(_b.makeRotationZ(sw));
          this.legs.setMatrixAt(i * 4 + l, _a);
        });
        i++;
      }
    }
    for (const im of [this.body, this.head, this.legs]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
