import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { live } from '../../arpenteur3d/live';
import { nodeName } from '../../arpenteur/keld';
import {
  hopTo,
  OPEN,
  spotById,
  spotsOf,
  ZONE_PERIOD,
  type Spot,
} from '../../arpenteur/spots';
import type { MapState } from '../../arpenteur/types';
import { ZoneMapScene, type ZoneMapKit } from '../../scene3d/zoneMap';
import { useTravel } from './useTravel';

// Carte 3D d'une zone (plein écran) : la maquette en bois de la zone avec ses
// lieux-dits. Un clic sur un lieu y envoie l'arpenteur ; on le voit avancer
// sur la maquette, comme sur la carte des secteurs.

export function ZoneMap3D({
  map,
  can,
  save,
  onClose,
}: {
  map: MapState;
  can: boolean;
  save: (next: MapState, log?: string) => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<'wait' | 'ok' | 'none'>('wait');
  const [hover, setHover] = useState<{
    spot: Spot;
    x: number;
    y: number;
  } | null>(null);
  const zone = map.sector;
  const spots = spotsOf(zone);
  const here = map.spot ?? '';
  const hop = useTravel(map.hop);
  const travel = useTravel(map.travel);
  const busy = !!hop || !!travel;
  // État lu par la boucle de rendu sans la relancer.
  const state = useRef({ here, target: '', hover: '' });
  state.current.here = hop ? '' : here;
  state.current.target = hop && hop.to !== OPEN ? hop.to : '';
  state.current.hover = hover?.spot.id ?? '';
  const pickRef = useRef<(id: string) => void>(() => {});
  pickRef.current = (id: string) => {
    if (!can || busy || id === here) return;
    const { next, log } = hopTo(map, id);
    save(next, log);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    // Les modèles viennent de la scène du navire (rendu réaliste) : on attend
    // qu'elle soit prête.
    const tryStart = () => {
      if (disposed) return;
      const kit = live.stage?.mapInfo().native as ZoneMapKit | null | undefined;
      if (!kit) {
        setReady(live.stage ? 'wait' : 'none');
        timer = window.setTimeout(tryStart, 400);
        return;
      }
      setReady('ok');
      cleanup = start(kit, canvas, wrap);
    };
    let timer = window.setTimeout(tryStart, 0);
    const start = (
      kit: ZoneMapKit,
      canvas: HTMLCanvasElement,
      wrap: HTMLDivElement
    ) => {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const zm = new ZoneMapScene(kit, spots, ZONE_PERIOD);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.5, 600);
      // Vue d'ensemble, légèrement inclinée, centrée sur le navire.
      const first = live.stage?.mapInfo();
      if (first) zm.update(first, 0, state.current);
      const sp = zm.shipPosition();
      const tx = Math.max(
        -zm.width / 2 + 12,
        Math.min(zm.width / 2 - 12, sp.x)
      );
      cam.position.set(tx + 8, 40, 34);
      const controls = new OrbitControls(cam, canvas);
      controls.target.set(tx, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 14;
      controls.maxDistance = 85;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = 1.2;
      controls.screenSpacePanning = false;
      controls.update();
      const resize = () => {
        const r = wrap.getBoundingClientRect();
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(r.width, r.height, false);
        cam.aspect = r.width / Math.max(1, r.height);
        cam.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      resize();
      // Survol et clic sur les lieux-dits.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const pickAt = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1
        );
        ray.setFromCamera(ndc, cam);
        const hit = ray.intersectObjects(zm.hits, false)[0];
        const id = hit ? (hit.object.userData.spot as string) : '';
        return { id, x: e.clientX - r.left, y: e.clientY - r.top };
      };
      let down: { x: number; y: number } | null = null;
      const onMove = (e: PointerEvent) => {
        const p = pickAt(e);
        const s = spotById(p.id);
        setHover(s ? { spot: s, x: p.x, y: p.y } : null);
        canvas.style.cursor = s ? 'pointer' : 'grab';
      };
      const onDown = (e: PointerEvent) =>
        (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        // Un clic (pas un glissé pour tourner la vue) sur un lieu : on y va.
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
          const p = pickAt(e);
          if (p.id) pickRef.current(p.id);
        }
        down = null;
      };
      const onLeave = () => setHover(null);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onLeave);
      const t0 = performance.now();
      let raf = 0;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;
        const info = live.stage?.mapInfo() ?? null;
        zm.update(info, (performance.now() - t0) / 1000, state.current);
        // La vue reste au-dessus de la maquette.
        const t = controls.target;
        t.x = Math.max(-zm.width / 2, Math.min(zm.width / 2, t.x));
        t.z = Math.max(-zm.depth / 2, Math.min(zm.depth / 2, t.z));
        t.y = 0;
        controls.update();
        renderer.render(zm.scene, cam);
      };
      raf = requestAnimationFrame(frame);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        controls.dispose();
        zm.dispose();
        renderer.dispose();
      };
    };
    return () => {
      disposed = true;
      clearTimeout(timer);
      cleanup?.();
    };
    // La maquette est construite une fois par ouverture (et par zone).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  const target = hop && hop.to !== OPEN ? spotById(hop.to) : null;
  const status = travel
    ? 'Voyage en cours'
    : hop
      ? target
        ? `En route vers ${target.name}`
        : 'Reprend le large'
      : here
        ? `Arrêté devant ${spotById(here)?.name ?? here}`
        : 'Au large';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Carte des lieux-dits"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#15100b]">
        <div>
          <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-[#cdb68c] opacity-80">
            Lieux-dits
          </p>
          <p className="font-heading text-lg leading-tight text-[#f3dfb4]">
            {nodeName(zone, map.sectorNames)}
          </p>
        </div>
        <span className="text-sm text-[#e9dcc0] opacity-90">· {status}</span>
        <div className="ml-auto flex items-center gap-2">
          {can && here && !busy && (
            <button
              type="button"
              className="h-8 px-3 rounded-full border border-[#d9a441]/60 text-[#f3dfb4] text-sm hover:bg-white/10"
              onClick={() => {
                const { next, log } = hopTo(map, OPEN);
                save(next, log);
              }}
            >
              ⛵ Reprendre le large
            </button>
          )}
          <button
            type="button"
            className="h-8 w-8 rounded-full text-[#cdb68c] hover:bg-white/10 text-lg"
            onClick={onClose}
            title="Fermer (Échap)"
            aria-label="Fermer la carte"
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: 'grab' }}
        />
        {ready !== 'ok' && (
          <div className="absolute inset-0 flex items-center justify-center text-center p-6 text-[#e9dcc0]">
            {ready === 'wait' ? (
              <p className="font-heading tracking-wide">
                Préparation de la maquette…
              </p>
            ) : (
              <div className="max-w-md flex flex-col gap-3">
                <p>
                  La maquette 3D a besoin de la vue « Profil » du navire en
                  rendu réaliste (en haut de la page).
                </p>
                <div className="flex flex-col gap-1.5">
                  {spots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!can || busy || s.id === here}
                      className="rounded border border-white/15 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
                      onClick={() => pickRef.current(s.id)}
                    >
                      <strong>{s.name}</strong>
                      {s.id === here ? ' · vous êtes ici' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg bg-[#0b1a24]/90 border border-[#7ff3ff]/50 px-3 py-2 text-[#d8fbff] shadow-lg"
            style={{
              left: Math.min(
                hover.x + 16,
                (wrapRef.current?.clientWidth ?? 9999) - 270
              ),
              top: hover.y + 16,
            }}
          >
            <p className="font-heading text-sm">{hover.spot.name}</p>
            <p className="text-xs opacity-85 mt-0.5">{hover.spot.blurb}</p>
            <p className="text-[11px] mt-1 text-[#ffd27a]">
              {hover.spot.id === here && !hop
                ? 'Vous êtes ici'
                : hop && hop.to === hover.spot.id
                  ? 'En route…'
                  : !can
                    ? 'Seuls les postes autorisés dirigent le navire'
                    : busy
                      ? 'Attendez la fin du trajet'
                      : 'Cliquer pour y faire route'}
            </p>
          </div>
        )}
        <p className="pointer-events-none absolute left-3 bottom-2 text-[11px] text-[#cdb68c] opacity-70">
          Glisser pour tourner · clic droit pour déplacer · molette pour zoomer
        </p>
      </div>
    </div>
  );
}
