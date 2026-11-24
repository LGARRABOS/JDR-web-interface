import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Équipage de la cabine : personnages réalistes (modèles Meshy riggés,
// squelette Mixamo commun) autour du bureau du capitaine. Chacun charge son
// propre fichier (maillage, textures, animations reciblées) et joue un petit
// programme : attente, discussion, va-et-vient du guetteur le long de la
// galerie. Le chargement est asynchrone : la cabine s'affiche sans eux et ils
// apparaissent dès qu'ils sont prêts.

/** Programme d'un personnage : enchaînement de clips (secondes). */
type Beat = { clip: string; dur: number };

interface Role {
  file: string;
  /** Position au sol (unités de la cabine) et orientation (0 = vers +z). */
  x: number;
  z: number;
  yaw: number;
  beats: Beat[];
  /** Va-et-vient sur l'axe x entre deux bornes (guetteur). */
  pace?: { x0: number; x1: number; speed: number; pause: number };
}

/** Disposition autour du bureau (mêmes repères que buildCabin). */
export interface CrewLayout {
  /** Largeur du bureau, bord du fond (z), hauteur du plancher. */
  deskW: number;
  farZ: number;
  floorY: number;
  /** Échelle : unités par mètre réel. */
  unit: number;
}

const MODELS_URL = '/models/crew/';

function roles(l: CrewLayout): Role[] {
  const half = l.deskW / 2;
  return [
    {
      // Le capitaine, derrière le bureau, explique la route.
      file: 'capitaine',
      x: -28,
      z: l.farZ - 26,
      yaw: 0.35,
      beats: [
        { clip: 'Parler', dur: 7 },
        { clip: 'Attente', dur: 5 },
        { clip: 'Discuter', dur: 6 },
        { clip: 'Repos', dur: 5 },
      ],
    },
    {
      // Le navigateur l'écoute, tourné vers lui et la carte.
      file: 'navigateur',
      x: 40,
      z: l.farZ - 20,
      yaw: -0.55,
      beats: [
        { clip: 'Attente', dur: 8 },
        { clip: 'Discuter', dur: 6 },
        { clip: 'Repos', dur: 6 },
      ],
    },
    {
      // Le contremaître, côté bâbord du bureau.
      file: 'contremaitre',
      x: -half - 30,
      z: -6,
      yaw: Math.PI / 2 - 0.15,
      beats: [
        { clip: 'Repos', dur: 9 },
        { clip: 'Parler', dur: 5 },
        { clip: 'Attente', dur: 7 },
      ],
    },
    {
      // Le maître canonnier, côté tribord.
      file: 'canonnier',
      x: half + 30,
      z: 8,
      yaw: -Math.PI / 2 - 0.2,
      beats: [
        { clip: 'Attente', dur: 11 },
        { clip: 'Discuter', dur: 5 },
        { clip: 'Repos', dur: 8 },
      ],
    },
    {
      // La chirurgienne, entre le coffre et la table d'échecs, suit la discussion.
      file: 'chirurgienne',
      x: -115,
      z: l.farZ - 85,
      yaw: 0.75,
      beats: [
        { clip: 'Repos', dur: 10 },
        { clip: 'Discuter', dur: 6 },
        { clip: 'Attente', dur: 8 },
      ],
    },
    {
      // Le guetteur fait les cent pas devant la galerie.
      file: 'guetteur',
      x: 0,
      z: l.farZ - 112,
      yaw: 0,
      beats: [{ clip: 'Attente', dur: 1 }],
      pace: { x0: -80, x1: 95, speed: 1.15, pause: 3.5 },
    },
  ];
}

class Actor {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private beat = 0;
  private beatT = 0;
  private walkU = 0.5;
  private walkDir = 1;
  private pauseT = 0;

  constructor(
    scene: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private role: Role,
    private unit: number,
    phase: number
  ) {
    this.root.add(scene);
    this.root.scale.setScalar(unit);
    this.root.position.set(role.x, 0, role.z);
    this.root.rotation.y = role.yaw;
    this.mixer = new THREE.AnimationMixer(scene);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.beatT = phase;
    this.play(role.pace ? 'Marche' : role.beats[0].clip, 0);
    // Décale les personnages pour qu'ils ne respirent pas en même temps.
    this.mixer.update(phase);
  }

  private play(name: string, fade = 0.45) {
    const a = this.actions.get(name) ?? this.actions.get('Attente');
    if (!a || a === this.current) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  update(dt: number) {
    const r = this.role;
    if (r.pace) {
      const p = r.pace;
      const span = p.x1 - p.x0;
      if (this.pauseT > 0) {
        this.pauseT -= dt;
        // Se tourne vers la salle pendant la pause, puis repart.
        this.root.rotation.y = THREE.MathUtils.lerp(
          this.root.rotation.y,
          0,
          Math.min(1, dt * 3)
        );
        if (this.pauseT <= 0) this.play('Marche');
      } else {
        this.walkU += (this.walkDir * p.speed * this.unit * dt) / span;
        if (this.walkU >= 1 || this.walkU <= 0) {
          this.walkU = Math.min(1, Math.max(0, this.walkU));
          this.walkDir = -this.walkDir;
          this.pauseT = p.pause;
          this.play('Attente');
        }
        const target = this.walkDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.rotation.y = THREE.MathUtils.lerp(
          this.root.rotation.y,
          target,
          Math.min(1, dt * 6)
        );
      }
      this.root.position.x = p.x0 + this.walkU * span;
    } else {
      this.beatT += dt;
      const b = r.beats[this.beat];
      if (this.beatT > b.dur) {
        this.beatT = 0;
        this.beat = (this.beat + 1) % r.beats.length;
        this.play(r.beats[this.beat].clip);
      }
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const s = mat as THREE.MeshStandardMaterial;
        for (const t of [s.map, s.normalMap, s.roughnessMap, s.metalnessMap])
          t?.dispose();
        mat.dispose();
      }
    });
  }
}

export class CrewCast {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];
  private last: number | null = null;
  private disposed = false;

  constructor(layout: CrewLayout) {
    this.group.position.y = layout.floorY;
    const loader = new GLTFLoader();
    // La politique de sécurité du site interdit fetch() sur les URL blob: :
    // les textures intégrées au .glb passent par des <img> (autorisées).
    loader.register((parser) => {
      parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
      return { name: 'jdr_textures_img' };
    });
    roles(layout).forEach((role, i) => {
      loader.load(
        `${MODELS_URL}${role.file}.glb`,
        (gltf) => {
          if (this.disposed) return;
          gltf.scene.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            // Positions quantifiées : la boîte englobante du maillage ne
            // correspond pas à la pose, on ne cache donc jamais le personnage.
            m.frustumCulled = false;
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.envMapIntensity = 0.6;
          });
          const a = new Actor(
            gltf.scene,
            gltf.animations,
            role,
            layout.unit,
            i * 1.7
          );
          this.actors.push(a);
          this.group.add(a.root);
        },
        undefined,
        (err) => console.warn(`Équipage : ${role.file} introuvable`, err)
      );
    });
  }

  /** `time` : horloge de la scène (secondes). */
  update(time: number) {
    const dt =
      this.last === null ? 0 : Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    for (const a of this.actors) a.update(dt);
  }

  dispose() {
    this.disposed = true;
    for (const a of this.actors) a.dispose();
    this.actors = [];
  }
}
