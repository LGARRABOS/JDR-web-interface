import { useRef, useState } from 'react';
import { ArpenteurAPI } from '../../api/client';
import { MARKER_KINDS } from '../../arpenteur/catalog';
import {
  CITIES,
  DESERTS,
  REGIONS,
  cityById,
  isKnownNode,
  neighbors,
  nodeName,
  UNKNOWN,
  regionById,
} from '../../arpenteur/keld';
import { newId, shortDateTime, type Rights } from '../../arpenteur/logic';
import type { UpdateFn } from '../../arpenteur/useArpenteur';
import type {
  ArpenteurDoc,
  ArpenteurPayload,
  MapState,
  Marker,
} from '../../arpenteur/types';
import type { GameStore } from '../../realtime/gameStore';
import { getErrorMessage } from '../../utils/errorMessage';
import { KeldMap } from './KeldMap';
import { useTravel } from './useTravel';
import { TRAVEL_SECONDS } from '../../arpenteur/travel';
import {
  Btn,
  Card,
  Dialog,
  LiveField,
  ReadOnlyHint,
  SelectField,
  TextField,
} from './ui';

interface Props {
  gameId: number;
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  isGM: boolean;
  store: GameStore;
  onError: (msg: string) => void;
}

const NODE_OPTIONS = [
  { id: '', label: '—' },
  ...REGIONS.map((r) => ({
    id: r.id,
    label: `${r.id} (${DESERTS[r.desert].name})`,
  })),
  ...CITIES.map((c) => ({ id: c.id, label: c.name })),
];

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
  const [selected, setSelected] = useState<string | null>(map.sector || null);
  const [editing, setEditing] = useState<Marker | null>(null);
  const can = rights.map;
  // Voyage en cours : on attend l'arrivée avant de repartir.
  const travel = useTravel(map.travel);
  const reachable = new Set(
    can && map.sector && !travel ? neighbors(map.sector).map((n) => n.id) : []
  );

  const save = (next: MapState, log?: string) =>
    update('map', next, { log, immediate: !!log });

  // Départ vers une position voisine (voyage animé), ou placement direct par le MJ.
  const moveTo = (id: string, voyage = true) => {
    const name = nodeName(id, map.sectorNames);
    // Depuis la position inconnue, le navire surgit toujours d'un portail.
    const fromUnknown = !map.sector;
    const go = (voyage && !!map.sector && map.sector !== id) || fromUnknown;
    save(
      {
        ...map,
        sector: id,
        destination: map.destination === id ? '' : map.destination,
        trail: [...map.trail, { sector: id, at: new Date().toISOString() }],
        travel: go
          ? {
              from: map.sector || UNKNOWN,
              to: id,
              startedAt: new Date().toISOString(),
              duration: TRAVEL_SECONDS,
            }
          : null,
      },
      `${fromUnknown ? "L'arpenteur surgit d'un portail d'Aether :" : go ? 'En route vers' : 'Arrivée :'} ${name}${regionById(id) && name !== id ? ` (${id})` : ''}`
    );
  };
  // Le MJ renvoie le navire à la position inconnue, par un portail.
  const toUnknown = () =>
    save(
      {
        ...map,
        sector: '',
        destination: '',
        travel: {
          from: map.sector,
          to: UNKNOWN,
          startedAt: new Date().toISOString(),
          duration: TRAVEL_SECONDS,
        },
      },
      "L'arpenteur franchit un portail d'Aether vers l'inconnu"
    );

  const sel = selected
    ? { id: selected, region: regionById(selected), city: cityById(selected) }
    : null;
  const selMarkers = selected
    ? map.markers.filter((m) => m.sector.toUpperCase() === selected)
    : [];

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
          Réseau des déserts
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
        {isGM && can && map.sector && !travel && (
          <Btn
            className="!h-8 !px-3 text-sm"
            onClick={toUnknown}
            title="Le navire franchit un portail d'Aether et disparaît vers la mer de brume"
          >
            ✦ Envoyer en position inconnue
          </Btn>
        )}
      </div>

      {view === 'reseau' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card className="!p-2 sm:!p-3 overflow-hidden">
            <KeldMap
              current={map.sector}
              destination={map.destination}
              names={map.sectorNames}
              trail={map.trail}
              markers={map.markers}
              selected={selected}
              reachable={reachable}
              travel={travel}
              hangar={map.hangar}
              onSelect={setSelected}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-2 text-xs text-fantasy-muted">
              {Object.values(DESERTS).map((d) => (
                <span key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: d.color }}
                  />
                  {d.name}
                </span>
              ))}
              <span>⇢ traversée possible</span>
              <span>□ trajet ville ↔ désert</span>
            </div>
          </Card>
          <div className="flex flex-col gap-4">
            <Card
              title={sel ? nodeName(sel.id, map.sectorNames) : 'Sélection'}
              subtitle={
                sel?.id === UNKNOWN
                  ? "Mer de brume d'Aether, hors de la carte"
                  : sel?.region
                    ? `${sel.id} · désert de ${DESERTS[sel.region.desert].name}`
                    : sel?.city
                      ? sel.city.capital
                        ? 'Capitale'
                        : 'Cité'
                      : 'Cliquez sur une sous-région ou une ville'
              }
            >
              {!can && <ReadOnlyHint doc={doc} section="map" />}
              {sel?.id === UNKNOWN && (
                <div className="flex flex-col gap-3 text-sm text-fantasy-text-soft">
                  <p>
                    Un lieu hors des cartes : une mer de brume d'Aether, des
                    îlots suspendus et des ruines oubliées. On n'y entre et on
                    n'en sort que par un portail.
                  </p>
                  {!map.sector ? (
                    <span className="text-fantasy-accent">
                      ⚓ L'arpenteur est ici.
                      {isGM &&
                        " Choisissez une zone sur la carte pour l'y faire surgir."}
                    </span>
                  ) : isGM && can ? (
                    <Btn
                      variant="primary"
                      onClick={toUnknown}
                      disabled={!!travel}
                      title={travel ? 'Attendez la fin du voyage' : undefined}
                    >
                      ✦ Envoyer l'arpenteur ici
                    </Btn>
                  ) : null}
                </div>
              )}
              {sel && sel.id !== UNKNOWN && (
                <div className="flex flex-col gap-3">
                  {can && (
                    <TextField
                      label={
                        sel.region ? 'Nom de la sous-région' : 'Nom de la cité'
                      }
                      value={map.sectorNames[sel.id] ?? ''}
                      placeholder={sel.city?.name ?? 'Le Désert du phare vert…'}
                      onCommit={(v) =>
                        save({
                          ...map,
                          sectorNames: { ...map.sectorNames, [sel.id]: v },
                        })
                      }
                    />
                  )}
                  <div className="text-xs text-fantasy-muted">
                    <p className="mb-1">Accès direct :</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {neighbors(sel.id).map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(n.id)}
                            className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 text-fantasy-text-soft"
                          >
                            {n.via === 'traversee' ? '⇢' : '□'}{' '}
                            {nodeName(n.id, map.sectorNames)}
                          </button>
                        </li>
                      ))}
                      {neighbors(sel.id).length === 0 && (
                        <li>aucun trajet tracé</li>
                      )}
                    </ul>
                  </div>
                  {can && (
                    <div className="flex flex-wrap gap-2">
                      {map.sector === sel.id ? (
                        <span className="text-sm text-fantasy-accent">
                          ⚓ L'arpenteur est ici.
                        </span>
                      ) : (
                        <>
                          {reachable.has(sel.id) && (
                            <>
                              {map.destination !== sel.id ? (
                                <Btn
                                  onClick={() =>
                                    save(
                                      { ...map, destination: sel.id },
                                      `Cap sur ${nodeName(sel.id, map.sectorNames)}`
                                    )
                                  }
                                >
                                  Mettre le cap
                                </Btn>
                              ) : (
                                <Btn
                                  variant="ghost"
                                  onClick={() =>
                                    save({ ...map, destination: '' })
                                  }
                                >
                                  Annuler le cap
                                </Btn>
                              )}
                              <Btn
                                variant="primary"
                                onClick={() => moveTo(sel.id)}
                              >
                                Partir
                              </Btn>
                            </>
                          )}
                          {isGM && !reachable.has(sel.id) && (
                            <Btn onClick={() => moveTo(sel.id, false)}>
                              {map.sector
                                ? "Placer l'arpenteur ici"
                                : "Faire surgir l'arpenteur ici"}
                            </Btn>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {sel.city && (map.hangar === sel.id || (isGM && can)) && (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-black/25 p-2.5">
                      <span className="text-sm text-fantasy-text">
                        {map.hangar === sel.id
                          ? "🏗 Hangar de l'équipage : l'arpenteur s'y amarre et l'atelier y travaille."
                          : 'Pas de hangar dans cette ville.'}
                      </span>
                      {isGM && can && (
                        <div className="flex flex-wrap gap-2">
                          {map.hangar === sel.id ? (
                            <Btn
                              variant="ghost"
                              onClick={() =>
                                save(
                                  { ...map, hangar: '' },
                                  `Hangar de ${nodeName(sel.id, map.sectorNames)} cédé`
                                )
                              }
                            >
                              Retirer le hangar
                            </Btn>
                          ) : (
                            <Btn
                              onClick={() =>
                                save(
                                  { ...map, hangar: sel.id },
                                  `Hangar acquis à ${nodeName(sel.id, map.sectorNames)}`
                                )
                              }
                            >
                              {map.hangar
                                ? `Déplacer le hangar ici (remplace ${nodeName(map.hangar, map.sectorNames)})`
                                : 'Attribuer un hangar ici'}
                            </Btn>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-fantasy-muted">
                        Repères
                      </span>
                      {can && (
                        <Btn
                          variant="ghost"
                          className="!h-7 !px-2 text-xs"
                          onClick={() =>
                            setEditing({
                              id: newId(),
                              label: '',
                              kind: 'mission',
                              sector: sel.id,
                              note: '',
                              x: null,
                              y: null,
                              hidden: false,
                            })
                          }
                        >
                          + Ajouter
                        </Btn>
                      )}
                    </div>
                    <MarkerList
                      markers={selMarkers}
                      can={can}
                      onEdit={setEditing}
                    />
                  </div>
                </div>
              )}
            </Card>
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

function MarkerList({
  markers,
  can,
  onEdit,
}: {
  markers: Marker[];
  can: boolean;
  onEdit: (m: Marker) => void;
}) {
  if (!markers.length)
    return <p className="text-xs text-fantasy-muted">Aucun repère.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {markers.map((m) => {
        const k = MARKER_KINDS.find((x) => x.id === m.kind);
        return (
          <li key={m.id}>
            <button
              type="button"
              disabled={!can}
              onClick={() => onEdit(m)}
              className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 bg-black/20 hover:bg-black/30 disabled:hover:bg-black/20"
            >
              <span
                className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: k?.color }}
              />
              <span className="min-w-0">
                <span className="text-sm text-fantasy-text">
                  {m.label || k?.label}
                </span>
                {m.hidden && (
                  <span className="ml-1.5 text-[10px] uppercase text-fantasy-muted">
                    caché
                  </span>
                )}
                {m.note && (
                  <span className="block text-xs text-fantasy-muted">
                    {m.note}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
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

function MarkerEditor({
  marker,
  isGM,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  marker: Marker;
  isGM: boolean;
  isNew: boolean;
  onClose: () => void;
  onSave: (m: Marker) => void;
  onDelete: () => void;
}) {
  const [m, setM] = useState<Marker>(marker);
  const set = (p: Partial<Marker>) => setM((x) => ({ ...x, ...p }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'Nouveau repère' : m.label || 'Repère'}
      footer={
        <>
          {!isNew && (
            <Btn
              variant="ghost"
              className="mr-auto text-red-300"
              onClick={onDelete}
            >
              Supprimer
            </Btn>
          )}
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            onClick={() =>
              onSave({
                ...m,
                label:
                  m.label.trim() ||
                  (MARKER_KINDS.find((k) => k.id === m.kind)?.label ??
                    'Repère'),
              })
            }
          >
            Enregistrer
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <LiveField
          label="Nom"
          value={m.label}
          onChange={(v) => set({ label: v })}
          className="col-span-2"
          placeholder="Nid de Draals, oasis…"
        />
        <SelectField
          label="Type"
          value={m.kind}
          options={MARKER_KINDS.map((k) => ({ id: k.id, label: k.label }))}
          onChange={(v) => set({ kind: v })}
        />
        <SelectField
          label="Sous-région / ville"
          value={
            isKnownNode(m.sector.toUpperCase()) ? m.sector.toUpperCase() : ''
          }
          options={NODE_OPTIONS}
          onChange={(v) => set({ sector: v })}
        />
        <LiveField
          label="Note"
          value={m.note}
          multiline
          onChange={(v) => set({ note: v })}
          className="col-span-2"
        />
        {isGM && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-fantasy-text-soft">
            <input
              type="checkbox"
              checked={m.hidden}
              onChange={(e) => set({ hidden: e.target.checked })}
            />
            Caché aux joueurs
          </label>
        )}
      </div>
    </Dialog>
  );
}
