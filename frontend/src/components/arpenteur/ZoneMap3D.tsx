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
import { createMapView, warmScene } from '../../scene3d/mapView';
import { cachedZoneMap, type ZoneMapKit } from '../../scene3d/zoneMap';
import { UNKNOWN } from '../../arpenteur/keld';
import { SceneLoader } from './SceneLoader';
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
  const [ready, setReady] = useState<'wait' | 'ok' | 'none'>('wait');
  const [prog, setProg] = useState({ f: 0, label: 'Ouverture de la carte' });
  const [hover, setHover] = useState<{
    spot: Spot;
    x: number;
    y: number;
  } | null>(null);
  const hoverId = useRef('');
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPos = useRef({ x: 0, y: 0 });
  const placeTip = (x: number, y: number) => {
    tipPos.current = { x, y };
    const el = tipRef.current;
    if (el) {
      el.style.left = `${Math.min(x + 16, (wrapRef.current?.clientWidth ?? 9999) - 270)}px`;
      el.style.top = `${y + 16}px`;
    }
  };
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
    const wrap = wrapRef.current;
    if (!wrap) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    let timer = 0;
    live.mapOpen = true;
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
      void start(kit, wrap);
    };
    const start = async (kit: ZoneMapKit, wrap: HTMLDivElement) => {
      setReady('wait');
      // Maquette gardée d'une ouverture à l'autre ; la première fois, modelée
      // peu à peu, puis préparée sur la carte graphique, sans gel.
      const { scene: zm, fresh } = cachedZoneMap(
        zone || UNKNOWN,
        kit,
        spots,
        ZONE_PERIOD
      );
      const r = wrap.getBoundingClientRect();
      const cam = new THREE.PerspectiveCamera(
        40,
        r.width / Math.max(1, r.height),
        0.5,
        1200
      );
      // Angle unique : la carte sur le bureau, l'équipage dans la cabine derrière.
      cam.position.set(0, 60, 84);
      cam.lookAt(0, 8, -22);
      // (Aussi quand une ouverture précédente a été fermée en plein modelage.)
      void fresh;
      await zm.populate(
        (f) =>
          !disposed && setProg({ f: f * 0.5, label: 'Modelage de la maquette' })
      );
      if (disposed) return;
      const first = live.stage?.mapInfo();
      if (first) zm.update(first, 0, state.current);
      await warmScene(
        zm.scene,
        cam,
        (f) =>
          !disposed &&
          setProg({ f: 0.5 + f * 0.5, label: 'Préparation des matériaux' })
      );
      if (disposed) return;
      const hitOf = (e: PointerEvent) => {
        const p = view.pick(e, zm.hits);
        return {
          spot: spotById(p.obj ? (p.obj.userData.spot as string) : ''),
          x: p.x,
          y: p.y,
        };
      };
      // Vue d'ensemble de la carte, posée sur le bureau.
      const view = createMapView(wrap, {
        scene: zm.scene,
        camera: cam,
        bounds: { x: zm.width / 2 + 14, z: zm.depth / 2 + 13 },
        start: {
          pos: cam.position.clone(),
          target: new THREE.Vector3(0, 8, -22),
        },
        frame: (time) =>
          zm.update(live.stage?.mapInfo() ?? null, time, state.current),
        onHover: (e) => {
          const h = hitOf(e);
          // React seulement quand le lieu survolé change ; la bulle suit la
          // souris directement (pas de rendu de la page à chaque mouvement).
          placeTip(h.x, h.y);
          if ((h.spot?.id ?? '') !== hoverId.current) {
            hoverId.current = h.spot?.id ?? '';
            setHover(h.spot ? { spot: h.spot, x: h.x, y: h.y } : null);
          }
          if (h.spot) view.canvas.style.cursor = 'pointer';
          else if (view.canvas.style.cursor === 'pointer')
            view.canvas.style.cursor = 'grab';
        },
        onClick: (e) => {
          const h = hitOf(e);
          if (h.spot) pickRef.current(h.spot.id);
        },
        onLeave: () => {
          hoverId.current = '';
          setHover(null);
        },
      });
      setReady('ok');
      cleanup = () => view.dispose();
    };
    timer = window.setTimeout(tryStart, 0);
    return () => {
      disposed = true;
      live.mapOpen = false;
      clearTimeout(timer);
      cleanup?.();
    };
    // Maquette ouverte une fois par zone.
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
        <SceneLoader
          visible={ready === 'wait'}
          f={prog.f}
          label={prog.label}
          title="Préparation de la carte…"
          note=""
        />
        {ready === 'none' && (
          <div className="absolute inset-0 flex items-center justify-center text-center p-6 text-[#e9dcc0]">
            {
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
            }
          </div>
        )}
        {hover && (
          <div
            ref={tipRef}
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg bg-[#0b1a24]/90 border border-[#7ff3ff]/50 px-3 py-2 text-[#d8fbff] shadow-lg"
            style={{
              left: Math.min(
                tipPos.current.x + 16,
                (wrapRef.current?.clientWidth ?? 9999) - 270
              ),
              top: tipPos.current.y + 16,
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
          Clic gauche maintenu pour déplacer la carte · molette pour zoomer
        </p>
      </div>
    </div>
  );
}
