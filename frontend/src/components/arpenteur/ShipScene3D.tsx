import { useEffect, useRef, useState } from 'react';
import { installedGuns } from '../../arpenteur/logic';
import type { Mood } from '../../arpenteur3d/environment';
import { Stage } from '../../arpenteur3d/stage';
import { desertOf, ShipScene, type ShipSceneProps } from './ShipScene';

// Scène 3D de l'arpenteur (WebGL2). La vue en coupe reste le plan 2D ; sans
// WebGL2, on retombe sur l'ancienne scène dessinée.

function moodNow(): Mood {
  const h = new Date().getHours();
  return h >= 20 || h < 7 ? 'night' : 'dusk';
}

// Point de vue par défaut ; l'utilisateur peut pivoter (glisser) et zoomer (molette, pincement).
const DEFAULT_CAM = { yaw: 0.6, elevation: 0.13, zoom: 1 };
const CAM_LIMITS = { elevMin: 0.02, elevMax: 1.1, zoomMin: 0.35, zoomMax: 1.8 };
type Cam = typeof DEFAULT_CAM;
const clampCam = (c: Cam): Cam => ({
  yaw: c.yaw,
  elevation: Math.min(
    CAM_LIMITS.elevMax,
    Math.max(CAM_LIMITS.elevMin, c.elevation)
  ),
  zoom: Math.min(CAM_LIMITS.zoomMax, Math.max(CAM_LIMITS.zoomMin, c.zoom)),
});
const isDefault = (c: Cam) =>
  Math.abs(c.yaw - DEFAULT_CAM.yaw) < 1e-3 &&
  Math.abs(c.elevation - DEFAULT_CAM.elevation) < 1e-3 &&
  Math.abs(c.zoom - DEFAULT_CAM.zoom) < 1e-3;

function supportsWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function ShipScene3D(props: ShipSceneProps) {
  const {
    doc,
    build,
    view,
    animate = true,
    scaffolding = false,
    className,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // Point de vue visé (les entrées le modifient, l'image le rejoint en douceur).
  const camRef = useRef<Cam>({ ...DEFAULT_CAM });
  const [moved, setMoved] = useState(false);
  const setCam = (c: Cam) => {
    camRef.current = clampCam(c);
    setMoved(!isDefault(camRef.current));
    canvasRef.current?.dispatchEvent(new Event('arp-cam'));
  };
  const [failed, setFailed] = useState(
    () => typeof document !== 'undefined' && !supportsWebGL2()
  );
  const [mood] = useState(moodNow);
  const guns = installedGuns(doc.combat).installed;
  const crew = doc.crew.members.length;
  const desert = desertOf(doc.map.sector);
  // Dégâts arrondis au huitième pour ne pas reconstruire le navire à chaque point.
  const damage =
    Math.round(
      (1 - doc.combat.constitution / Math.max(1, doc.combat.constitutionMax)) *
        8
    ) / 8;
  const use3D = view === 'profil' && !failed;

  // Création du moteur, boucle d'animation et redimensionnement.
  useEffect(() => {
    if (!use3D) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: Stage;
    try {
      stage = new Stage(canvas);
    } catch {
      setFailed(true);
      return;
    }
    stageRef.current = stage;
    const still =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let dirty = true;
    const t0 = performance.now();
    const cur: Cam = { ...camRef.current };
    // Résolution adaptative : on baisse la définition si la machine peine,
    // puis on la remonte quand elle tient la cadence.
    let scale = 1;
    let last = 0;
    let avg = 16.7;
    let calm = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1) * scale;
      stage.setSize(Math.round(r.width * dpr), Math.round(r.height * dpr));
      dirty = true;
    };
    const adapt = (now: number) => {
      const dt = last ? now - last : 16.7;
      last = now;
      if (dt > 250) return; // onglet repris, mesure sans valeur
      avg = avg * 0.92 + dt * 0.08;
      if (avg > 26 && scale > 0.55) {
        scale = Math.max(0.55, scale - 0.15);
        avg = 16.7;
        calm = 0;
        resize();
      } else if (avg < 18) {
        if (++calm > 180 && scale < 1) {
          scale = Math.min(1, scale + 0.1);
          calm = 0;
          resize();
        }
      } else calm = 0;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    // Hors de l'écran (page défilée), on ne dessine plus : économise batterie et GPU.
    let onScreen = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((e) => e.isIntersecting);
            if (onScreen) dirty = true;
          })
        : null;
    io?.observe(canvas);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (still && !dirty) return;
      if (document.hidden || !onScreen) {
        last = 0;
        return;
      }
      dirty = false;
      if (!still) adapt(performance.now());
      // La caméra rejoint le point de vue visé avec un léger amorti.
      const goal = camRef.current;
      const k = still ? 1 : 0.2;
      cur.yaw += (goal.yaw - cur.yaw) * k;
      cur.elevation += (goal.elevation - cur.elevation) * k;
      cur.zoom += (goal.zoom - cur.zoom) * k;
      if (
        Math.abs(goal.yaw - cur.yaw) +
          Math.abs(goal.elevation - cur.elevation) +
          Math.abs(goal.zoom - cur.zoom) >
        1e-4
      )
        dirty = true;
      const wide = canvas.clientWidth / Math.max(1, canvas.clientHeight) > 1.8;
      // En s'éloignant du point de vue par défaut, on recentre peu à peu le navire.
      const off = Math.min(
        1,
        Math.abs(cur.zoom - 1) * 2 +
          Math.abs(cur.elevation - DEFAULT_CAM.elevation) * 3
      );
      stage.render(still ? 2 : (performance.now() - t0) / 1000, {
        yaw: cur.yaw,
        elevation: cur.elevation,
        margin: (wide ? 1.2 : 1.05) * cur.zoom,
        lift: wide ? -0.07 * (1 - off) : 0,
      });
    };
    raf = requestAnimationFrame(frame);
    const onShip = () => {
      dirty = true;
    };
    canvas.addEventListener('arp-ship', onShip);
    canvas.addEventListener('arp-cam', onShip);

    // Pivoter en glissant (souris ou un doigt), zoomer à la molette ou en pinçant.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const move = (dyaw: number, delev: number, zoomMul: number) => {
      const c = camRef.current;
      camRef.current = clampCam({
        yaw: c.yaw + dyaw,
        elevation: c.elevation + delev,
        zoom: c.zoom * zoomMul,
      });
      setMoved(!isDefault(camRef.current));
      dirty = true;
    };
    const spread = () => {
      const [a, b] = [...pts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      pinch = spread();
    };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size >= 2) {
        const d = spread();
        if (pinch > 0 && d > 0) move(0, 0, pinch / d);
        pinch = d;
      } else move(-dx * 0.008, dy * 0.005, 1);
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = spread();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      move(0, 0, Math.exp(e.deltaY * 0.0012));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      canvas.removeEventListener('arp-ship', onShip);
      canvas.removeEventListener('arp-cam', onShip);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      stage.dispose();
      stageRef.current = null;
    };
  }, [use3D, animate]);

  // Mise à jour du navire quand sa construction change.
  useEffect(() => {
    const stage = stageRef.current;
    if (!use3D || !stage) return;
    stage.setEnvironment(desert, mood);
    stage.setShip(build, { guns, crew, damage, scaffolding });
    canvasRef.current?.dispatchEvent(new Event('arp-ship'));
  }, [use3D, animate, build, guns, crew, damage, scaffolding, desert, mood]);

  if (!use3D) return <ShipScene {...props} />;
  const zoomBy = (m: number) =>
    setCam({ ...camRef.current, zoom: camRef.current.zoom * m });
  const btn =
    'h-8 w-8 rounded-full text-[#cdb68c] hover:bg-white/10 font-heading text-base leading-none flex items-center justify-center';
  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={`Arpenteur ${doc.name} — glisser pour pivoter, molette ou pincement pour zoomer`}
      />
      <div className="absolute top-14 right-3 sm:top-16 sm:right-5 arp-lever rounded-full p-1 flex flex-col gap-0.5">
        <button
          type="button"
          className={btn}
          onClick={() => zoomBy(0.8)}
          title="Zoomer"
          aria-label="Zoomer"
        >
          +
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => zoomBy(1.25)}
          title="Dézoomer"
          aria-label="Dézoomer"
        >
          −
        </button>
        <button
          type="button"
          className={`${btn} ${moved ? 'arp-lever-on' : 'opacity-50'}`}
          onClick={() => setCam({ ...DEFAULT_CAM })}
          disabled={!moved}
          title="Point de vue par défaut"
          aria-label="Revenir au point de vue par défaut"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
