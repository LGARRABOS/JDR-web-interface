import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Vue des maquettes 3D (carte des secteurs, carte des lieux-dits) : rendu,
// caméra au-dessus du bureau, glisser au clic gauche, tourner au clic droit,
// zoom à la molette ; survol et clic sur les objets désignés.

export interface MapView {
  renderer: THREE.WebGLRenderer;
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

export function createMapView(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement,
  opts: {
    scene: THREE.Scene;
    /** Limites du point visé (x, z). */
    bounds: { x: number; z: number };
    start: { pos: THREE.Vector3; target: THREE.Vector3 };
    frame: (time: number) => void;
    onHover?: (e: PointerEvent) => void;
    onClick?: (e: PointerEvent) => void;
    onLeave?: () => void;
  }
): MapView {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 900);
  camera.position.copy(opts.start.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(opts.start.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.25;
  controls.screenSpacePanning = false;
  // Clic gauche maintenu : on fait glisser la carte ; clic droit : on tourne
  // autour ; molette : zoom. Au doigt : glisser, pincer.
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.panSpeed = 1.1;
  controls.update();

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
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
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const now = performance.now();
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
    t.y = 0;
    camera.position.x += t.x - ox;
    camera.position.z += t.z - oz;
    controls.update();
    opts.frame((now - t0) / 1000);
    renderer.render(opts.scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    renderer,
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
      controls.dispose();
      renderer.dispose();
    },
  };
}
