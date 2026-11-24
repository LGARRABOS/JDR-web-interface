import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { live } from '../../arpenteur3d/live';
import {
  CITIES,
  cityById,
  DESERTS,
  neighbors,
  nodeName,
  REGIONS,
  regionById,
  UNKNOWN,
} from '../../arpenteur/keld';
import { spotsOf, ZONE_PERIOD } from '../../arpenteur/spots';
import type { ArpenteurDoc, MapState, Marker } from '../../arpenteur/types';
import {
  createMapView,
  nextFrame,
  warmScene,
  type MapView,
} from '../../scene3d/mapView';
import {
  cachedWorldMap,
  type WorldMapScene,
  type WorldMapKit,
} from '../../scene3d/worldMap';
import { cachedZoneMap, type ZoneMapKit } from '../../scene3d/zoneMap';
import { SceneLoader } from './SceneLoader';
import { MarkerEditor } from './MapMarkers';
import { SectorPanel } from './SectorPanel';
import { useTravel } from './useTravel';
import { ZoneMap3D } from './ZoneMap3D';

// Carte des déserts de Keld en 3D, plein écran : la grande carte en relief
// sur le bureau du capitaine. Clic sur une sous-région ou une ville : sa fiche
// (départ, cap, outils du MJ, repères) ; clic sur la position du navire :
// on plonge dans la maquette de ses lieux-dits.

export function WorldMap3D({
  doc,
  can,
  isGM,
  save,
  startInZone = false,
  onClose,
}: {
  doc: ArpenteurDoc;
  can: boolean;
  isGM: boolean;
  save: (next: MapState, log?: string) => void;
  startInZone?: boolean;
  onClose: () => void;
}) {
  const map = doc.map;
  const here = map.sector || UNKNOWN;
  const [mode, setMode] = useState<'world' | 'zone'>(
    startInZone && spotsOf(here).length ? 'zone' : 'world'
  );
  const [selected, setSelected] = useState<string | null>(here);
  const [hover, setHover] = useState<{
    id: string;
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
  const [editing, setEditing] = useState<Marker | null>(null);
  const [ready, setReady] = useState<'wait' | 'ok' | 'none'>('wait');
  const [prog, setProg] = useState({ f: 0, label: 'Ouverture de la carte' });
  const [panel, setPanel] = useState(true);
  const travel = useTravel(map.travel);
  const reachable = new Set(
    can && map.sector && !travel ? neighbors(map.sector).map((n) => n.id) : []
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldMapScene | null>(null);
  const viewRef = useRef<MapView | null>(null);
  // État lu par la boucle de rendu.
  const state = useRef({
    current: map.sector,
    travel,
    destination: map.destination,
    selected: selected ?? '',
    hover: '',
    reachable,
    hangar: map.hangar ?? '',
    withSpots: new Set<string>(),
  });
  Object.assign(state.current, {
    current: map.sector,
    travel,
    destination: map.destination,
    selected: selected ?? '',
    hover: hover?.id ?? '',
    reachable,
    hangar: map.hangar ?? '',
  });
  const clickRef = useRef<(id: string) => void>(() => {});
  clickRef.current = (id: string) => {
    const at = map.sector || UNKNOWN;
    // Clic sur la position du navire : on plonge dans ses lieux-dits.
    if (id === at && !travel && spotsOf(at).length) {
      const p = sceneRef.current?.nodePoint(id);
      const v = viewRef.current;
      if (p && v) v.flyTo(p.setY(0), 32, 750, () => setMode('zone'));
      else setMode('zone');
      return;
    }
    setSelected(id);
    setPanel(true);
  };

  useEffect(() => {
    if (mode !== 'world') return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose, editing]);

  useEffect(() => {
    if (mode !== 'world') return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    let timer = 0;
    live.mapOpen = true;
    const tryStart = () => {
      if (disposed) return;
      const kit = live.stage?.mapInfo().native as
        | WorldMapKit
        | null
        | undefined;
      if (!kit) {
        setReady(live.stage ? 'wait' : 'none');
        timer = window.setTimeout(tryStart, 400);
        return;
      }
      void start(kit, wrap);
    };
    const start = async (kit: WorldMapKit, wrap: HTMLDivElement) => {
      setReady('wait');
      setProg({ f: 0.05, label: 'Dépliage de la carte' });
      // Laisse l'écran d'attente s'afficher avant le travail.
      await nextFrame();
      await nextFrame();
      if (disposed) return;
      // Carte gardée d'une ouverture à l'autre (et au retour des lieux-dits).
      const { scene: wm } = cachedWorldMap(kit);
      wm.setNames(map.sectorNames);
      wm.setMarkers(map.markers);
      for (const id of [
        UNKNOWN,
        ...REGIONS.map((r) => r.id),
        ...CITIES.map((c) => c.id),
      ])
        if (spotsOf(id).length) state.current.withSpots.add(id);
      const r = wrap.getBoundingClientRect();
      const cam = new THREE.PerspectiveCamera(
        40,
        r.width / Math.max(1, r.height),
        0.5,
        1200
      );
      // Angle unique, plongeant (~60°) : la carte bien lisible, la cabine autour.
      cam.position.set(0, 64, 38);
      cam.lookAt(0, 0, 1);
      wm.update(0, state.current);
      await warmScene(
        wm.scene,
        cam,
        (f) =>
          !disposed &&
          setProg({ f: 0.1 + f * 0.9, label: 'Préparation des matériaux' })
      );
      if (disposed) return;
      sceneRef.current = wm;
      const nodeOf = (o: THREE.Object3D | null) =>
        o ? (o.userData.node as string) : '';
      // Vue d'ensemble de toute la carte.
      const view = createMapView(wrap, {
        scene: wm.scene,
        camera: cam,
        bounds: { x: wm.width / 2 + 14, z: wm.depth / 2 + 13 },
        start: {
          pos: cam.position.clone(),
          target: new THREE.Vector3(0, 0, 1),
        },
        frame: (time) => wm.update(time, state.current),
        onHover: (e) => {
          const p = view.pick(e, wm.hits);
          const id = nodeOf(p.obj);
          // React seulement quand le secteur survolé change ; la bulle suit
          // la souris directement.
          placeTip(p.x, p.y);
          if (id !== hoverId.current) {
            hoverId.current = id;
            setHover(id ? { id, x: p.x, y: p.y } : null);
          }
          if (id) view.canvas.style.cursor = 'pointer';
          else if (view.canvas.style.cursor === 'pointer')
            view.canvas.style.cursor = 'grab';
        },
        onClick: (e) => {
          const id = nodeOf(view.pick(e, wm.hits).obj);
          if (id) clickRef.current(id);
        },
        onLeave: () => {
          hoverId.current = '';
          setHover(null);
        },
      });
      viewRef.current = view;
      setReady('ok');
      cleanup = () => {
        view.dispose();
        sceneRef.current = null;
        viewRef.current = null;
      };
      // Pendant qu'on regarde la carte, la maquette des lieux-dits de la zone
      // du navire se prépare en arrière-plan : la plongée sera immédiate.
      const at = map.sector || UNKNOWN;
      const zkit = live.stage?.mapInfo().native as
        | ZoneMapKit
        | null
        | undefined;
      if (spotsOf(at).length && zkit) {
        const { scene: zm } = cachedZoneMap(at, zkit, spotsOf(at), ZONE_PERIOD);
        await zm.populate();
        if (disposed) return;
        const zc = new THREE.PerspectiveCamera(40, cam.aspect, 0.5, 1200);
        zc.position.set(0, 64, 38);
        zc.lookAt(0, 0, 1);
        await warmScene(zm.scene, zc);
      }
    };
    timer = window.setTimeout(tryStart, 0);
    return () => {
      disposed = true;
      live.mapOpen = false;
      clearTimeout(timer);
      cleanup?.();
    };
    // Maquette construite à l'ouverture (et au retour des lieux-dits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Noms et repères : mis à jour sur la maquette.
  useEffect(() => {
    sceneRef.current?.setNames(map.sectorNames);
  }, [map.sectorNames, ready]);
  useEffect(() => {
    sceneRef.current?.setMarkers(map.markers);
  }, [map.markers, ready]);

  if (mode === 'zone')
    return (
      <ZoneMap3D
        map={map}
        can={can}
        save={save}
        onClose={onClose}
        onBack={() => setMode('world')}
      />
    );

  const hv = hover
    ? { id: hover.id, region: regionById(hover.id), city: cityById(hover.id) }
    : null;
  const status = travel
    ? `En route vers ${nodeName(travel.to, map.sectorNames)} · arrivée dans ${travel.remaining} s`
    : `Position : ${nodeName(map.sector, map.sectorNames)}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Carte des déserts"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#15100b]">
        <div>
          <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-[#cdb68c] opacity-80">
            Carte
          </p>
          <p className="font-heading text-lg leading-tight text-[#f3dfb4]">
            Déserts de Keld
          </p>
        </div>
        <span className="text-sm text-[#e9dcc0] opacity-90">· {status}</span>
        <div className="ml-auto flex items-center gap-2">
          {!travel && spotsOf(here).length > 0 && (
            <button
              type="button"
              className="h-8 px-3 rounded-full border border-[#7ff3ff]/50 text-[#d8fbff] text-sm hover:bg-white/10"
              onClick={() => clickRef.current(here)}
            >
              ✦ Lieux-dits de la zone
            </button>
          )}
          <button
            type="button"
            className="h-8 px-3 rounded-full border border-white/20 text-[#e9dcc0] text-sm hover:bg-white/10"
            onClick={() => setPanel(!panel)}
          >
            {panel ? 'Masquer la fiche' : 'Afficher la fiche'}
          </button>
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
      <div className="relative flex-1 min-h-0 flex">
        <div ref={wrapRef} className="relative flex-1 min-w-0">
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
                <p className="max-w-md">
                  La carte 3D a besoin de la vue « Profil » du navire en rendu
                  réaliste (en haut de la page). La fiche à droite reste
                  utilisable.
                </p>
              }
            </div>
          )}
          {hover && hv && (
            <div
              ref={tipRef}
              className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg bg-[#1a120b]/92 border border-[#d9a441]/50 px-3 py-2 text-[#f3dfb4] shadow-lg"
              style={{
                left: Math.min(
                  tipPos.current.x + 16,
                  (wrapRef.current?.clientWidth ?? 9999) - 270
                ),
                top: tipPos.current.y + 16,
              }}
            >
              <p className="font-heading text-sm">
                {nodeName(hover.id, map.sectorNames)}
              </p>
              <p className="text-xs opacity-80">
                {hover.id === UNKNOWN
                  ? "Mer de brume d'Aether"
                  : hv.region
                    ? `${hover.id} · désert de ${DESERTS[hv.region.desert].name}`
                    : hv.city?.capital
                      ? 'Capitale'
                      : 'Cité'}
              </p>
              <p className="text-[11px] mt-1 text-[#7ff3ff]">
                {hover.id === here && !travel
                  ? spotsOf(here).length
                    ? "L'arpenteur est ici · cliquer pour voir ses lieux-dits"
                    : "L'arpenteur est ici"
                  : reachable.has(hover.id)
                    ? 'Accessible directement · cliquer pour la fiche'
                    : 'Cliquer pour la fiche'}
              </p>
            </div>
          )}
          <p className="pointer-events-none absolute left-3 bottom-2 text-[11px] text-[#cdb68c] opacity-70">
            Clic gauche maintenu pour déplacer la carte · clic droit pour
            tourner · molette pour zoomer
          </p>
        </div>
        {panel && (
          <aside className="w-[340px] max-w-[85vw] shrink-0 overflow-y-auto border-l border-white/10 bg-[#120d09] p-3 flex flex-col gap-3 max-sm:absolute max-sm:right-0 max-sm:inset-y-0 max-sm:z-20">
            <SectorPanel
              doc={doc}
              selected={selected}
              can={can}
              isGM={isGM}
              travel={travel}
              reachable={reachable}
              save={save}
              onSelect={(id) => setSelected(id)}
              onEditMarker={setEditing}
            />
          </aside>
        )}
      </div>
      {editing && (
        <MarkerEditor
          marker={editing}
          isGM={isGM}
          isNew={!map.markers.some((m) => m.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            const exists = map.markers.some((x) => x.id === m.id);
            save(
              {
                ...map,
                markers: exists
                  ? map.markers.map((x) => (x.id === m.id ? m : x))
                  : [...map.markers, m],
              },
              exists || m.hidden ? undefined : `Repère ajouté : ${m.label}`
            );
            setEditing(null);
          }}
          onDelete={() => {
            save({
              ...map,
              markers: map.markers.filter((x) => x.id !== editing.id),
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
