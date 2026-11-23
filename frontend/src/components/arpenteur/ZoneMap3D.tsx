import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
import { createMapView } from '../../scene3d/mapView';
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
  onBack,
}: {
  map: MapState;
  can: boolean;
  save: (next: MapState, log?: string) => void;
  onClose: () => void;
  /** Retour à la carte des secteurs (quand on y est entré depuis elle). */
  onBack?: () => void;
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
      const zm = new ZoneMapScene(kit, spots, ZONE_PERIOD);
      const first = live.stage?.mapInfo();
      if (first) zm.update(first, 0, state.current);
      const hitOf = (e: PointerEvent) => {
        const p = view.pick(e, zm.hits);
        return {
          spot: spotById(p.obj ? (p.obj.userData.spot as string) : ''),
          x: p.x,
          y: p.y,
        };
      };
      // Vue d'ensemble de la carte, posée sur le bureau.
      const view = createMapView(canvas, wrap, {
        scene: zm.scene,
        bounds: { x: zm.width / 2 + 14, z: zm.depth / 2 + 13 },
        start: {
          pos: new THREE.Vector3(0, 56, 36),
          target: new THREE.Vector3(0, 0, 1),
        },
        frame: (time) =>
          zm.update(live.stage?.mapInfo() ?? null, time, state.current),
        onHover: (e) => {
          const h = hitOf(e);
          setHover(h.spot ? { spot: h.spot, x: h.x, y: h.y } : null);
          if (h.spot) canvas.style.cursor = 'pointer';
          else if (canvas.style.cursor === 'pointer')
            canvas.style.cursor = 'grab';
        },
        onClick: (e) => {
          const h = hitOf(e);
          if (h.spot) pickRef.current(h.spot.id);
        },
        onLeave: () => setHover(null),
      });
      return () => {
        view.dispose();
        zm.dispose();
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
        {onBack && (
          <button
            type="button"
            className="h-8 px-3 rounded-full border border-white/20 text-[#e9dcc0] text-sm hover:bg-white/10"
            onClick={onBack}
          >
            ← Secteurs
          </button>
        )}
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
          Clic gauche maintenu pour déplacer la carte · clic droit pour tourner
          · molette pour zoomer
        </p>
      </div>
    </div>
  );
}
