import { useEffect, useRef, useState } from 'react';
import { installedGuns } from '../../arpenteur/logic';
import type { Mood } from '../../arpenteur3d/environment';
import { Stage, type Scene } from '../../arpenteur3d/stage';
import { travelEase, travelNow } from '../../arpenteur/travel';
import { useTravel } from './useTravel';
import {
  cityById,
  DESERTS,
  nodeName,
  regionById,
  ROUTES,
} from '../../arpenteur/keld';
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

/** Décor d'une position : désert, et ville d'escale le cas échéant. */
function sceneOf(sector: string, hangar = ''): Scene {
  const id = sector.trim().toUpperCase();
  const city = cityById(id);
  if (city) {
    // Une ville prend la couleur et le paysage du désert qu'elle dessert.
    const route = ROUTES.find(([c]) => c === id);
    const region = route ? regionById(route[1]) : undefined;
    return {
      desert: region?.desert || desertOf(id),
      // Ville du hangar de l'équipage : le navire s'amarre dans sa cale couverte.
      place: {
        city: { id, capital: city.capital, hangar: hangar === id },
      },
      biome: region?.id ?? id,
    };
  }
  return { desert: desertOf(id), place: {}, biome: id };
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
  // Moment de la journée : imposé par le MJ, sinon selon l'heure réelle.
  const [clockMood] = useState(moodNow);
  const mood: Mood = doc.map.mood || clockMood;
  const hangar = doc.map.hangar ?? '';
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const guns = installedGuns(doc.combat).installed;
  const crew = doc.crew.members.length;
  const sector = doc.map.sector;
  const mapTravel = doc.map.travel ?? null;
  const travel = useTravel(mapTravel);
  const travelKey = mapTravel
    ? `${mapTravel.from}|${mapTravel.to}|${mapTravel.startedAt}|${mapTravel.duration}`
    : '';
  // Bandeau d'arrivée, affiché quelques secondes quand un voyage se termine.
  const [banner, setBanner] = useState<{ title: string; sub: string } | null>(
    null
  );
  const wasTraveling = useRef(false);
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
      if (still && !dirty && !stage.traveling) return;
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
    stage.setShip(build, { guns, crew, damage, scaffolding });
    canvasRef.current?.dispatchEvent(new Event('arp-ship'));
  }, [use3D, animate, build, guns, crew, damage, scaffolding]);

  // Décor : désert ou ville. Si un voyage est en cours (même ouvert en route),
  // la scène le joue au point où il en est, calé sur l'heure de départ.
  useEffect(() => {
    const stage = stageRef.current;
    if (!use3D || !stage) return;
    const now = travelNow(mapTravel);
    const reduced =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (now && !reduced) {
      const from = sceneOf(now.from, hangar);
      const to = sceneOf(now.to, hangar);
      stage.setJourney(from, to, moodRef.current, now.start, now.duration);
    } else {
      const here = sceneOf(sector, hangar);
      stage.setEnvironment(
        here.desert,
        moodRef.current,
        here.place,
        here.biome
      );
    }
    canvasRef.current?.dispatchEvent(new Event('arp-ship'));
    // travelKey résume mapTravel ; le moment de la journée a son propre effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3D, animate, sector, travelKey, hangar]);

  // Jour / nuit : passage progressif (instantané si les animations sont réduites).
  useEffect(() => {
    const stage = stageRef.current;
    if (!use3D || !stage) return;
    const reduced =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage.setMood(mood, !reduced);
    canvasRef.current?.dispatchEvent(new Event('arp-ship'));
  }, [use3D, animate, mood]);

  // Fin de voyage : bandeau d'arrivée.
  useEffect(() => {
    if (travel) {
      wasTraveling.current = true;
      return;
    }
    if (!wasTraveling.current) return;
    wasTraveling.current = false;
    const id = sector.trim().toUpperCase();
    const name = nodeName(id, doc.map.sectorNames);
    const d = sceneOf(id).desert;
    setBanner(
      cityById(id)
        ? {
            title: `Arrivée à ${name}`,
            sub:
              hangar === id
                ? "Amarré au hangar de l'équipage"
                : 'Amarré au quai',
          }
        : {
            title: name,
            sub:
              d === 'keld'
                ? 'Arrivée'
                : `Désert de ${DESERTS[d].name}${name !== id ? ` · ${id}` : ''}`,
          }
    );
    const t = setTimeout(() => setBanner(null), 5200);
    return () => clearTimeout(t);
  }, [travel, sector, doc.map.sectorNames]);

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
      {travel && (
        <div
          className="pointer-events-none absolute left-1/2 bottom-3 sm:bottom-24 -translate-x-1/2 arp-plate rounded-xl px-4 py-2 text-center min-w-[220px]"
          role="status"
        >
          <p className="font-heading text-[10px] uppercase tracking-[0.3em] opacity-80">
            En route vers
          </p>
          <p className="font-heading text-base sm:text-lg leading-tight">
            {nodeName(travel.to, doc.map.sectorNames)}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full bg-[#7ff3ff]"
              style={{ width: `${Math.round(travelEase(travel.p) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] opacity-80">
            arrivée dans {travel.remaining} s
          </p>
        </div>
      )}
      {banner && (
        <div
          key={banner.title}
          className="arp-travel-banner pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center"
          role="status"
        >
          <p className="font-heading text-[11px] sm:text-xs uppercase tracking-[0.35em] text-[#f3dfb4] opacity-90 drop-shadow">
            {banner.sub}
          </p>
          <p className="font-heading text-2xl sm:text-4xl text-[#fff3d6] drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {banner.title}
          </p>
        </div>
      )}
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
        {props.onMood && (
          <button
            type="button"
            className={btn}
            onClick={() => props.onMood?.(mood === 'night' ? 'dusk' : 'night')}
            title={
              mood === 'night'
                ? 'Faire lever le jour (pour tous)'
                : 'Faire tomber la nuit (pour tous)'
            }
            aria-label={
              mood === 'night' ? 'Passer au jour' : 'Passer à la nuit'
            }
          >
            {mood === 'night' ? '☀' : '☾'}
          </button>
        )}
      </div>
    </div>
  );
}
