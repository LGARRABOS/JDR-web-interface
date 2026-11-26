import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Objets de décor du navire (barre, cabestan, tonneaux, canons…) : modèles
// Meshy allégés, un fichier par sorte. Chaque modèle est préparé hors ligne :
// pied à y = 0, centré en x et z, face avant vers +x (la proue), taille
// réelle en mètres. Les navires les posent en instances (un appel de dessin
// par sorte d'objet, quel que soit le nombre d'exemplaires). Tant qu'ils ne
// sont pas chargés, ou s'ils manquent, les navires gardent leurs pièces
// modelées en code.

export const PROP_KINDS = [
  'barre',
  'habitacle',
  'cloche',
  'cabestan',
  'guindeau',
  'tonneau',
  'tonneaux',
  'caisse',
  'caisses',
  'glene',
  'coffre',
  'manche_air',
  'ratelier',
  'ecoutille',
  'ancre',
  'canot',
  'telescope',
  'lanterne',
  'canon',
  'boulets',
  'reservoir',
  'event',
  'pompe',
  'treuil',
  'sacs',
  'seau',
  'etabli',
  'poulailler',
  'table_cartes',
  'projecteur',
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** Objets réellement fournis dans public/models/props (les autres sorte
 * gardent leur pièce modelée en code). */
const AVAILABLE: PropKind[] = [
  'ancre',
  'boulets',
  'canon',
  'canot',
  'ecoutille',
  'etabli',
  'manche_air',
  'pompe',
  'poulailler',
  'projecteur',
  'ratelier',
  'reservoir',
  'sacs',
  'seau',
  'table_cartes',
  'telescope',
  'treuil',
];

export interface Prop {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** Encombrement au sol (demi-longueur en x, demi-largeur en z) et hauteur. */
  size: THREE.Vector3;
}
export type PropLib = Map<PropKind, Prop>;

const PROPS_URL = '/models/props/';
let pending: Promise<PropLib> | null = null;

/** Charge (une seule fois) tous les objets disponibles. */
export function loadProps(): Promise<PropLib> {
  if (pending) return pending;
  const loader = new GLTFLoader();
  // La politique de sécurité du site interdit fetch() sur les URL blob: :
  // les textures intégrées au .glb passent par des <img> (autorisées).
  loader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'jdr_textures_img' };
  });
  const lib: PropLib = new Map();
  pending = Promise.all(
    AVAILABLE.map((kind) =>
      loader
        .loadAsync(`${PROPS_URL}${kind}.glb`)
        .then((gltf) => {
          let mesh: THREE.Mesh | null = null;
          gltf.scene.traverse((o) => {
            if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
          });
          if (!mesh) return;
          const m = mesh as THREE.Mesh;
          m.updateWorldMatrix(true, false);
          // Positions quantifiées : on revient à des flottants en mètres.
          const geometry = m.geometry.clone();
          geometry.applyMatrix4(m.matrixWorld);
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const bb = geometry.boundingBox!;
          const material = m.material as THREE.MeshStandardMaterial;
          material.envMapIntensity = 0.6;
          lib.set(kind, {
            geometry,
            material,
            size: new THREE.Vector3(
              Math.max(-bb.min.x, bb.max.x),
              bb.max.y,
              Math.max(-bb.min.z, bb.max.z)
            ),
          });
        })
        .catch(() => {
          // Objet absent : la pièce modelée en code reste.
        })
    )
  ).then(() => lib);
  return pending;
}

/** Objets posés sur un navire, regroupés en instances par sorte. */
export class PropSet {
  private list = new Map<PropKind, THREE.Matrix4[]>();
  constructor(readonly lib: PropLib | null) {}

  has(kind: PropKind) {
    return !!this.lib?.get(kind);
  }

  size(kind: PropKind) {
    return this.lib?.get(kind)?.size ?? null;
  }

  /**
   * Pose un objet (pied en (x, y, z), tourné de `ry` autour de y, mis à
   * l'échelle `s`) ; renvoie false s'il n'est pas disponible.
   */
  put(kind: PropKind, x: number, y: number, z: number, ry = 0, s = 1) {
    if (!this.has(kind)) return false;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(s, s, s)
    );
    let l = this.list.get(kind);
    if (!l) this.list.set(kind, (l = []));
    l.push(m);
    return true;
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [kind, ms] of this.list) {
      const p = this.lib!.get(kind)!;
      const im = new THREE.InstancedMesh(p.geometry, p.material, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = true;
      im.name = `objet:${kind}`;
      g.add(im);
    }
    return g;
  }
}
