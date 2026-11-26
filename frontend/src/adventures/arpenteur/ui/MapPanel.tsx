import { useRef, useState } from 'react';
import { ArpenteurAPI } from '@/core/api/client';
import { MARKER_KINDS } from '../model/catalog';
import { nodeName, UNKNOWN, regionById } from '../model/keld';
import { newId, shortDateTime, type Rights } from '../model/logic';
import type { UpdateFn } from '../model/useArpenteur';
import type {
  ArpenteurDoc,
  ArpenteurPayload,
  MapState,
  Marker,
} from '../model/types';
import type { GameStore } from '@/core/realtime/gameStore';
import { getErrorMessage } from '@/shared/utils/errorMessage';
import { WorldMap3D } from './WorldMap3D';
import { MarkerEditor } from './MapMarkers';
import { toUnknown } from '../model/mapActions';
import { spotsOf } from '../model/spots';
import { useTravel } from './useTravel';
import { Btn, Card } from './ui';

interface Props {
  gameId: number;
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  isGM: boolean;
  store: GameStore;
  onError: (msg: string) => void;
}

export function MapPanel({
  gameId,
  doc,
  rights,
  update,
  isGM,
  store,
  onError,
}: Props) {
  const [view, setView] = useState<'reseau' | 'illustree'>('reseau');
  const map = doc.map;
  const [editing, setEditing] = useState<Marker | null>(null);
  const can = rights.map;
  // Voyage en cours : on attend l'arrivée avant de repartir.
  const travel = useTravel(map.travel);

  const save = (next: MapState, log?: string) =>
    update('map', next, { log, immediate: !!log });

  // Maquette 3D des déserts (plein écran), et entrée directe dans la zone.
  const [world, setWorld] = useState<null | 'world' | 'zone'>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'reseau'}
          onClick={() => setView('reseau')}
          className="arp-tab"
        >
          Carte des déserts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'illustree'}
          onClick={() => setView('illustree')}
          className="arp-tab"
        >
          Carte illustrée
        </button>
        <span className="ml-auto text-sm text-fantasy-text-soft">
          {map.sector ? (
            <>
              Position :{' '}
              <strong className="text-fantasy-accent">
                {nodeName(map.sector, map.sectorNames)}
              </strong>
              {regionById(map.sector) && map.sectorNames[map.sector]
                ? ` (${map.sector})`
                : ''}
              {travel && (
                <>
                  {' '}
                  · en route depuis{' '}
                  <strong>{nodeName(travel.from, map.sectorNames)}</strong>,
                  arrivée dans {travel.remaining} s
                </>
              )}
              {map.destination && (
                <>
                  {' '}
                  · cap sur{' '}
                  <strong>{nodeName(map.destination, map.sectorNames)}</strong>
                </>
              )}
            </>
          ) : (
            <>
              Position :{' '}
              <strong className="text-fantasy-accent">Position inconnue</strong>
              {travel && <> · franchit un portail d'Aether</>}
            </>
          )}
        </span>
        {!travel && spotsOf(map.sector || UNKNOWN).length > 0 && (
          <Btn
            className="!h-8 !px-3 text-sm"
            onClick={() => setWorld('zone')}
            title="Maquette 3D de la zone et de ses lieux-dits (ou cliquez sur votre position)"
          >
            🗺 Lieux-dits
          </Btn>
        )}
        {isGM && can && map.sector && !travel && (
          <Btn
            className="!h-8 !px-3 text-sm"
            onClick={() => {
              const { next, log } = toUnknown(map);
              save(next, log);
            }}
            title="Le navire franchit un portail d'Aether et disparaît vers la mer de brume"
          >
            ✦ Envoyer en position inconnue
          </Btn>
        )}
      </div>

      {world && (
        <WorldMap3D
          doc={doc}
          can={can}
          isGM={isGM}
          save={save}
          startInZone={world === 'zone'}
          onClose={() => setWorld(null)}
        />
      )}

      {view === 'reseau' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* La carte se consulte et se manie en 3D, en plein écran. */}
          <Card className="!p-0 overflow-hidden">
            <button
              type="button"
              className="relative block w-full min-h-[260px] sm:min-h-[340px] text-left group overflow-hidden"
              onClick={() => setWorld('world')}
              title="Ouvrir la carte des déserts"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 45%, #5a3a1e 0%, #2a1a0e 60%, #120b06 100%)',
              }}
            >
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="text-5xl drop-shadow" aria-hidden>
                  🗺
                </span>
                <span className="font-heading text-xl sm:text-2xl text-[#f3dfb4] tracking-wide">
                  Carte des déserts de Keld
                </span>
                <span className="text-sm text-[#e9dcc0]/85">
                  {travel
                    ? `En route vers ${nodeName(travel.to, map.sectorNames)}`
                    : `L'arpenteur est à ${nodeName(map.sector, map.sectorNames)}`}
                  {map.destination && !travel
                    ? ` · cap sur ${nodeName(map.destination, map.sectorNames)}`
                    : ''}
                </span>
                <span className="mt-2 arp-plate rounded-xl px-5 py-2.5 font-heading text-base sm:text-lg group-hover:brightness-125 transition">
                  Ouvrir la carte
                </span>
                <span className="text-xs text-[#cdb68c]/70">
                  Voyages, fiches des secteurs, repères et lieux-dits
                </span>
              </span>
            </button>
          </Card>
          <div className="flex flex-col gap-4">
            <Card title="Sillage" subtitle="Derniers déplacements">
              {map.trail.length === 0 ? (
                <p className="text-xs text-fantasy-muted">
                  Aucun déplacement enregistré.
                </p>
              ) : (
                <ol className="flex flex-col gap-1 text-sm">
                  {[...map.trail]
                    .reverse()
                    .slice(0, 10)
                    .map((t, i) => (
                      <li
                        key={`${t.at}${i}`}
                        className="flex justify-between gap-2"
                      >
                        <span
                          className={
                            i === 0
                              ? 'text-fantasy-accent'
                              : 'text-fantasy-text-soft'
                          }
                        >
                          {nodeName(t.sector, map.sectorNames)}
                        </span>
                        <span className="text-xs text-fantasy-muted">
                          {shortDateTime(t.at)}
                        </span>
                      </li>
                    ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <IllustratedMap
          gameId={gameId}
          doc={doc}
          can={can}
          isGM={isGM}
          save={save}
          store={store}
          onError={onError}
          onEditMarker={setEditing}
        />
      )}

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

function IllustratedMap({
  gameId,
  doc,
  can,
  isGM,
  save,
  store,
  onError,
  onEditMarker,
}: {
  gameId: number;
  doc: ArpenteurDoc;
  can: boolean;
  isGM: boolean;
  save: (m: MapState, log?: string) => void;
  store: GameStore;
  onError: (msg: string) => void;
  onEditMarker: (m: Marker) => void;
}) {
  const map = doc.map;
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const toPoint = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const { data } = await ArpenteurAPI.uploadImage(gameId, f);
      store.setArpenteurLocally(data as ArpenteurPayload);
    } catch (e) {
      onError(getErrorMessage(e, 'Image refusée'));
    } finally {
      setUploading(false);
    }
  };

  const ship = drag ?? map.ship;

  return (
    <Card
      title="Carte illustrée"
      subtitle={
        can
          ? 'Faites glisser l’arpenteur ; « Ajouter un repère » puis cliquez sur la carte.'
          : 'Position de l’arpenteur sur la carte du monde'
      }
      actions={
        <>
          {can && map.imageUrl && (
            <>
              <Btn
                onClick={() => setAdding((v) => !v)}
                variant={adding ? 'primary' : 'soft'}
              >
                {adding ? 'Cliquez sur la carte…' : 'Ajouter un repère'}
              </Btn>
              {!map.ship && (
                <Btn onClick={() => save({ ...map, ship: { x: 0.5, y: 0.5 } })}>
                  Placer l'arpenteur
                </Btn>
              )}
            </>
          )}
          {isGM && (
            <>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && upload(e.target.files[0])
                }
              />
              <Btn onClick={() => file.current?.click()} disabled={uploading}>
                {uploading
                  ? 'Envoi…'
                  : map.imageUrl
                    ? 'Changer l’image'
                    : 'Choisir une image'}
              </Btn>
            </>
          )}
        </>
      }
    >
      {!map.imageUrl ? (
        <p className="text-sm text-fantasy-muted py-10 text-center">
          {isGM
            ? 'Ajoutez la carte de Keld (photo ou scan) pour y suivre l’arpenteur.'
            : 'Le MJ n’a pas encore ajouté de carte illustrée.'}
        </p>
      ) : (
        <div
          ref={box}
          className={`relative w-full rounded-xl overflow-hidden ${adding ? 'cursor-crosshair' : ''}`}
          onPointerDown={(e) => {
            if (!adding) return;
            const p = toPoint(e);
            setAdding(false);
            onEditMarker({
              id: newId(),
              label: '',
              kind: 'repere',
              sector: '',
              note: '',
              x: p.x,
              y: p.y,
              hidden: false,
            });
          }}
          onPointerMove={(e) => drag && setDrag(toPoint(e))}
          onPointerUp={() => {
            if (drag) save({ ...map, ship: drag });
            setDrag(null);
          }}
        >
          <img
            src={map.imageUrl}
            alt="Carte du monde"
            className="w-full h-auto block select-none"
            draggable={false}
          />
          {map.markers
            .filter((m) => m.x != null && m.y != null)
            .map((m) => {
              const k = MARKER_KINDS.find((x) => x.id === m.kind);
              return (
                <button
                  key={m.id}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => can && onEditMarker(m)}
                  className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
                  style={{
                    left: `${m.x! * 100}%`,
                    top: `${m.y! * 100}%`,
                    opacity: m.hidden ? 0.6 : 1,
                  }}
                  title={m.note || m.label}
                >
                  <span className="px-1.5 py-0.5 rounded bg-black/70 text-[11px] text-white whitespace-nowrap mb-0.5">
                    {m.label || k?.label}
                  </span>
                  <svg
                    width="18"
                    height="24"
                    viewBox="0 0 18 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M9,23 C3,14 1,10 1,7 a8,8 0 0 1 16,0 c0,3 -2,7 -8,16 Z"
                      fill={k?.color}
                      stroke="#14100c"
                      strokeWidth={1.5}
                    />
                    <circle cx={9} cy={7} r={3} fill="#14100c" />
                  </svg>
                </button>
              );
            })}
          {ship && (
            <div
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${can ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{
                left: `${ship.x * 100}%`,
                top: `${ship.y * 100}%`,
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                if (!can || adding) return;
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setDrag(toPoint(e));
              }}
              title="Arpenteur"
            >
              <span className="absolute inset-0 -m-3 rounded-full bg-cyan-300/40 animate-ping" />
              <svg
                width="54"
                height="40"
                viewBox="0 0 104 80"
                style={{ transform: `rotate(${map.heading}deg)` }}
                aria-hidden="true"
              >
                <path
                  d="M8,62 L4,40 L26,38 L30,24 L48,24 L56,40 L92,38 L100,46 L92,62 Q50,76 8,62 Z"
                  fill="#8c5b34"
                  stroke="#1b140e"
                  strokeWidth={4}
                />
                <line
                  x1={44}
                  y1={38}
                  x2={44}
                  y2={2}
                  stroke="#3b2a1d"
                  strokeWidth={5}
                />
                <path
                  d="M30,6 L58,6 L60,30 L28,30 Z"
                  fill="#efe2c4"
                  stroke="#5d4a36"
                  strokeWidth={2}
                />
              </svg>
            </div>
          )}
        </div>
      )}
      {can && map.imageUrl && map.ship && (
        <label className="mt-3 flex items-center gap-3 text-xs text-fantasy-muted">
          Orientation
          <input
            type="range"
            min={-180}
            max={180}
            value={map.heading > 180 ? map.heading - 360 : map.heading}
            onChange={(e) =>
              save({
                ...map,
                heading: (parseInt(e.target.value, 10) + 360) % 360,
              })
            }
            className="flex-1"
          />
        </label>
      )}
    </Card>
  );
}
