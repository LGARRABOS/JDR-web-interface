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
      const wide = canvas.clientWidth / Math.max(1, canvas.clientHeight) > 1.8;
      stage.render(still ? 2 : (performance.now() - t0) / 1000, {
        yaw: 0.6,
        elevation: 0.13,
        margin: wide ? 1.2 : 1.05,
        lift: wide ? -0.07 : 0,
      });
    };
    raf = requestAnimationFrame(frame);
    const onShip = () => {
      dirty = true;
    };
    canvas.addEventListener('arp-ship', onShip);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      canvas.removeEventListener('arp-ship', onShip);
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
  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={`Arpenteur ${doc.name}`}
    />
  );
}
