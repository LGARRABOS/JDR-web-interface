import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Vue des maquettes 3D (carte des secteurs, carte des lieux-dits) : rendu,
// caméra fixe à la verticale de la carte (glisser au clic gauche, zoom à la
// molette), précédée à l'ouverture d'un plan qui montre toute la cabine puis
// descend au-dessus du bureau ; survol et clic sur les objets désignés.

/** Plan d'ouverture : d'où part la caméra (vue de la pièce) et combien de temps. */
export interface MapIntro {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Point de passage de la courbe (mouvement en arc, pas en ligne droite). */
  via: THREE.Vector3;
  ms: number;
}

export interface MapView {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Objet visé sous le pointeur (parmi `targets`), et position dans le cadre. */
  pick(
    e: { clientX: number; clientY: number },
    targets: THREE.Object3D[]
  ): { obj: THREE.Object3D | null; x: number; y: number };
  /** Vol de caméra vers un point (cible et distance), en `ms`. */
  flyTo(
    target: THREE.Vector3,
    dist: number,
    ms: number,
    done?: () => void
  ): void;
  dispose(): void;
}

/**
 * Rendu partagé par toutes les maquettes, gardé d'une ouverture à l'autre :
 * programmes et textures déjà prêts sur la carte graphique (pas de gel).
 */
let shared: THREE.WebGLRenderer | null = null;
export function mapRenderer() {
  if (!shared) {
    shared = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    shared.shadowMap.enabled = true;
    shared.shadowMap.type = THREE.PCFSoftShadowMap;
    shared.toneMapping = THREE.ACESFilmicToneMapping;
    shared.toneMappingExposure = 1.05;
    // Maquettes presque immobiles : ombres recalculées à cadence réduite
    // (voir la boucle), pas à chaque image.
    shared.shadowMap.autoUpdate = false;
    shared.domElement.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;touch-action:none';
  }
  return shared;
}

/** Une image sur deux à l'écran : laisse respirer la page entre deux étapes. */
export const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Prépare une maquette sans gel : programmes compilés en parallèle, puis
 * textures envoyées à la carte graphique une par image.
 */
export async function warmScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  progress?: (f: number) => void
) {
  const r = mapRenderer();
  try {
    await Promise.race([
      r.compileAsync(scene, camera),
      new Promise((ok) => setTimeout(ok, 6000)),
    ]);
  } catch {
    // sans importance : le premier rendu compilera
  }
  const tex = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    for (const mm of Array.isArray(m) ? m : m ? [m] : [])
      for (const v of Object.values(mm as unknown as Record<string, unknown>))
        if (v instanceof THREE.Texture) tex.add(v);
  });
  let i = 0;
  for (const t of tex) {
    r.initTexture(t);
    progress?.(++i / Math.max(1, tex.size));
    if (i % 2 === 0) await nextFrame();
  }
}

export function createMapView(
  wrap: HTMLElement,
  opts: {
    scene: THREE.Scene;
    /** Limites du point visé (x, z). */
    bounds: { x: number; z: number };
    start: { pos: THREE.Vector3; target: THREE.Vector3 };
    /** Caméra déjà utilisée pour préparer la maquette (facultatif). */
    camera?: THREE.PerspectiveCamera;
    /** Plan d'ouverture (vue de la cabine, puis descente sur la carte). */
    intro?: MapIntro;
    frame: (time: number) => void;
    onHover?: (e: PointerEvent) => void;
    onClick?: (e: PointerEvent) => void;
    onLeave?: () => void;
  }
): MapView {
  const renderer = mapRenderer();
  const canvas = renderer.domElement;
  wrap.prepend(canvas);
  const camera = opts.camera ?? new THREE.PerspectiveCamera(40, 1, 0.5, 1200);
  camera.position.copy(opts.start.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(opts.start.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 28;
  controls.maxDistance = 170;
  // Caméra fixe au-dessus de la carte : pas de rotation, l'angle reste
  // celui du départ. Clic gauche maintenu : on fait glisser la carte ;
  // molette : zoom. Au doigt : glisser, pincer.
  const polar = Math.acos(
    Math.min(
      1,
      Math.max(-1, opts.start.pos.clone().sub(opts.start.target).normalize().y)
    )
  );
  controls.minPolarAngle = polar;
  controls.maxPolarAngle = polar;
  controls.screenSpacePanning = false;
  controls.enableRotate = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.panSpeed = 1.1;
  controls.update();
  // Plan d'ouverture : la caméra part de la vue de la pièce et descend en
  // arc au-dessus de la carte ; un clic l'abrège.
  let intro: { t0: number; a: MapIntro } | null = null;
  if (opts.intro) {
    intro = { t0: performance.now(), a: opts.intro };
    controls.enabled = false;
    camera.position.copy(opts.intro.pos);
    camera.lookAt(opts.intro.target);
  }
  const endIntro = () => {
    if (!intro) return;
    intro = null;
    camera.position.copy(opts.start.pos);
    controls.target.copy(opts.start.target);
    controls.enabled = true;
    controls.update();
  };
  const skip = () => endIntro();
  canvas.addEventListener('pointerdown', skip);
  canvas.addEventListener('wheel', skip, { passive: true });

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    // Netteté plafonnée : au-delà, le coût explose pour un gain invisible.
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick: MapView['pick'] = (e, targets) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(targets, false)[0];
    return {
      obj: hit ? hit.object : null,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  };

  let down: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => opts.onHover?.(e);
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
  };
  const onUp = (e: PointerEvent) => {
    // Un clic (pas un glissé) : sélection.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6)
      opts.onClick?.(e);
    down = null;
    canvas.style.cursor = 'grab';
  };
  const onLeave = () => opts.onLeave?.();
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.style.cursor = 'grab';

  let fly: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    d0: number;
    d1: number;
    t0: number;
    ms: number;
    done?: () => void;
  } | null = null;
  const flyTo: MapView['flyTo'] = (target, dist, ms, done) => {
    fly = {
      from: controls.target.clone(),
      to: target.clone(),
      d0: camera.position.distanceTo(controls.target),
      d1: dist,
      t0: performance.now(),
      ms,
      done,
    };
  };

  const t0 = performance.now();
  let raf = 0;
  let frameN = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const now = performance.now();
    if (intro) {
      const k = Math.min(1, (now - intro.t0) / intro.a.ms);
      // Départ et arrivée en douceur.
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const u = 1 - e;
      const { pos, via, target } = intro.a;
      camera.position.set(
        u * u * pos.x + 2 * u * e * via.x + e * e * opts.start.pos.x,
        u * u * pos.y + 2 * u * e * via.y + e * e * opts.start.pos.y,
        u * u * pos.z + 2 * u * e * via.z + e * e * opts.start.pos.z
      );
      const look = target.clone().lerp(opts.start.target, e);
      camera.lookAt(look);
      opts.frame((now - t0) / 1000);
      if (frameN++ < 3 || frameN % 5 === 0)
        renderer.shadowMap.needsUpdate = true;
      renderer.render(opts.scene, camera);
      if (k >= 1) endIntro();
      return;
    }
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / fly.ms);
      const e = k * k * (3 - 2 * k);
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.lerpVectors(fly.from, fly.to, e);
      camera.position
        .copy(controls.target)
        .addScaledVector(dir, fly.d0 + (fly.d1 - fly.d0) * e);
      if (k >= 1) {
        const d = fly.done;
        fly = null;
        d?.();
      }
    }
    // La vue reste au-dessus du bureau.
    const t = controls.target;
    const ox = t.x,
      oz = t.z;
    t.x = Math.max(-opts.bounds.x, Math.min(opts.bounds.x, t.x));
    t.z = Math.max(-opts.bounds.z, Math.min(opts.bounds.z, t.z));
    t.y = opts.start.target.y;
    camera.position.x += t.x - ox;
    camera.position.z += t.z - oz;
    controls.update();
    opts.frame((now - t0) / 1000);
    // Ombres : à l'ouverture, puis 12 fois par seconde (le navire bouge peu).
    if (frameN++ < 3 || frameN % 5 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(opts.scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    renderer,
    canvas,
    camera,
    controls,
    pick,
    flyTo,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', skip);
      canvas.removeEventListener('wheel', skip);
      controls.dispose();
      // Le rendu est gardé pour la prochaine ouverture ; on le décroche.
      canvas.remove();
    },
  };
}
