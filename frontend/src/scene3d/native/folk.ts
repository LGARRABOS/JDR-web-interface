import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CrewMember } from '../../arpenteur3d/shipModel';
import type { CrewPose } from '../../arpenteur3d/stage';

// Figurants réalistes : matelots sur le pont, habitants des ports et ouvriers
// des hangars. Modèles Meshy riggés (squelette Mixamo commun) avec des
// animations reciblées « sur place » : la position et l'orientation viennent
// toujours de crewPose (le même calcul que la foule simplifiée), le modèle ne
// fait que jouer le geste qui correspond au rôle (marche, cabestan, vigie…).
//
// Seuls les plus proches de la caméra sont réalistes (nombre limité) ; les
// autres, et tous tant que les modèles ne sont pas chargés, restent dessinés
// par la foule instanciée (Crowd).

const FOLK_URL = '/models/folk/';
/** Gens d'équipage (pont, quais) et gens de la ville. */
const SAILORS = [
  'matelot',
  'matelote',
  'barbu',
  'vieux_marin',
  'docker',
  'mecanicien',
];
const TOWN = [
  'habitante',
  'marchand',
  'notable',
  'garde',
  'docker',
  'barbu',
  'vieux_marin',
  'matelote',
];
const KINDS = [...new Set([...SAILORS, ...TOWN])];

/** Vitesse de marche (m/s) du clip « Marche » joué à vitesse normale. */
const WALK_SPEED = 1.35;
const FADE = 0.35;

interface Kind {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

const hash = (n: number) => {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

class Figure {
  readonly root: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private action: THREE.AnimationAction | null = null;
  private clip = '';
  used = false;

  constructor(
    readonly kind: string,
    private k: Kind
  ) {
    this.root = cloneSkinned(k.scene);
    this.root.matrixAutoUpdate = false;
    this.mixer = new THREE.AnimationMixer(this.root);
  }

  play(name: string, ts: number, offset: number) {
    if (name !== this.clip) {
      const c = this.k.clips.get(name) ?? this.k.clips.get('Attente');
      if (!c) return;
      const a = this.mixer.clipAction(c);
      a.reset();
      // Départ décalé : deux figurants du même rôle ne bougent pas ensemble.
      a.time = offset % c.duration;
      a.play();
      if (this.action)
        a.crossFadeFrom(this.action, this.clip ? FADE : 0, false);
      this.action = a;
      this.clip = name;
    }
    if (this.action) this.action.timeScale = ts;
  }

  /** Nouveau personnage (figurant recyclé) : pas de fondu depuis l'ancien. */
  reset() {
    this.mixer.stopAllAction();
    this.action = null;
    this.clip = '';
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}

/** Geste et cadence d'un figurant selon son rôle et son déplacement. */
function gesture(
  c: CrewMember,
  speed: number,
  town: boolean
): [string, number] {
  const h = hash(c.seed);
  switch (c.role) {
    case 'walk':
      if (speed > 0.15)
        return ['Marche', Math.min(1.6, Math.max(0.6, speed / WALK_SPEED))];
      return [h % 2 ? 'Regarder' : 'Attente', 1];
    case 'capstan':
      return ['Pousser', 1.1];
    case 'haul':
      return ['Pousser', 0.9];
    case 'scrub':
      return ['Pousser', 0.7];
    case 'look':
      return ['Regarder', 1];
    case 'helm':
      return ['Attente', 1];
    default: {
      const idle = town
        ? ['Attente', 'Repos', 'Boire', 'Parler']
        : ['Attente', 'Repos', 'Regarder'];
      return [idle[h % idle.length], 1];
    }
  }
}

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();

export class Folk {
  readonly root = new THREE.Group();
  private kinds = new Map<string, Kind>();
  private live = new Map<CrewMember, Figure>();
  private pool = new Map<string, Figure[]>();
  private n = 0;
  private disposed = false;

  constructor(
    /** Nombre maximal de figurants réalistes affichés à la fois. */
    readonly cap: number,
    patch: (m: THREE.Material) => void
  ) {
    const loader = new GLTFLoader();
    // La politique de sécurité du site interdit fetch() sur les URL blob: :
    // les textures intégrées au .glb passent par des <img> (autorisées).
    loader.register((parser) => {
      parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
      return { name: 'jdr_textures_img' };
    });
    for (const name of KINDS)
      loader.load(
        `${FOLK_URL}${name}.glb`,
        (gltf) => {
          if (this.disposed) return;
          gltf.scene.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            // Positions quantifiées : la boîte englobante ne suit pas la pose.
            m.frustumCulled = false;
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.envMapIntensity = 0.6;
            patch(mat);
          });
          this.kinds.set(name, {
            scene: gltf.scene,
            clips: new Map(gltf.animations.map((c) => [c.name, c])),
          });
        },
        undefined,
        (err) => console.warn(`Figurants : ${name} introuvable`, err)
      );
  }

  /** Au moins un modèle chargé : sinon la foule simplifiée fait tout. */
  get ready() {
    return this.kinds.size > 0;
  }

  get full() {
    return this.n >= this.cap;
  }

  begin() {
    this.n = 0;
    for (const f of this.live.values()) f.used = false;
  }

  private figure(c: CrewMember, town: boolean): Figure | null {
    let f = this.live.get(c);
    if (f) return f;
    const list = town ? TOWN : SAILORS;
    const kind = list[hash(c.seed + 17) % list.length];
    const k = this.kinds.get(kind);
    if (!k) return null;
    f = this.pool.get(kind)?.pop() ?? new Figure(kind, k);
    f.reset();
    this.live.set(c, f);
    this.root.add(f.root);
    return f;
  }

  /**
   * Place un figurant réaliste ; renvoie false s'il doit être dessiné par la
   * foule simplifiée (plus de place, ou modèle pas encore chargé).
   * `speed` : vitesse au sol (m/s), pour choisir et cadencer la marche.
   */
  add(
    base: THREE.Matrix4,
    c: CrewMember,
    p: CrewPose,
    speed: number,
    scale: number,
    town: boolean
  ): boolean {
    if (this.n >= this.cap) return false;
    const f = this.figure(c, town);
    if (!f) return false;
    this.n++;
    f.used = true;
    // Le modèle regarde vers +z ; l'orientation 0 de crewPose est la proue (+x).
    f.root.matrix
      .copy(base)
      .multiply(_m.makeTranslation(p.pos[0], p.pos[1], p.pos[2]))
      .multiply(_a.makeRotationY(p.yaw + Math.PI / 2))
      .multiply(_m.makeScale(scale, scale, scale));
    f.root.matrixWorldNeedsUpdate = true;
    const [clip, ts] = gesture(c, speed, town);
    f.play(clip, ts, (hash(c.seed) % 1000) / 97);
    return true;
  }

  /** Range les figurants inutilisés et fait avancer les animations. */
  end(dt: number) {
    for (const [c, f] of this.live) {
      if (f.used) {
        f.update(dt);
        continue;
      }
      this.live.delete(c);
      this.root.remove(f.root);
      const l = this.pool.get(f.kind) ?? [];
      l.push(f);
      this.pool.set(f.kind, l);
    }
  }

  dispose() {
    this.disposed = true;
    this.live.clear();
    this.pool.clear();
    for (const k of this.kinds.values())
      k.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const s = m.material as THREE.MeshStandardMaterial;
        for (const t of [s.map, s.normalMap, s.roughnessMap, s.metalnessMap])
          t?.dispose();
        s.dispose();
      });
    this.kinds.clear();
  }
}
