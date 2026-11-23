import {
  DESERTS,
  cityById,
  neighbors,
  nodeName,
  regionById,
  UNKNOWN,
} from '../../arpenteur/keld';
import { newId, shortDateTime } from '../../arpenteur/logic';
import { moveTo, toUnknown } from '../../arpenteur/mapActions';
import type { TravelNow } from '../../arpenteur/travel';
import type { ArpenteurDoc, MapState, Marker } from '../../arpenteur/types';
import { MarkerList } from './MapMarkers';
import { Btn, Card, ReadOnlyHint, TextField } from './ui';

// Fiche d'un secteur ou d'une ville (maquette 3D des déserts) : nom, accès,
// départ, cap, outils du MJ (placer, hangar, position inconnue), repères.

export function SectorPanel({
  doc,
  selected,
  can,
  isGM,
  travel,
  reachable,
  save,
  onSelect,
  onEditMarker,
}: {
  doc: ArpenteurDoc;
  selected: string | null;
  can: boolean;
  isGM: boolean;
  travel: TravelNow | null;
  reachable: Set<string>;
  save: (next: MapState, log?: string) => void;
  onSelect: (id: string) => void;
  onEditMarker: (m: Marker) => void;
}) {
  const map = doc.map;
  const act = ({ next, log }: { next: MapState; log: string }) =>
    save(next, log);
  const sel = selected
    ? { id: selected, region: regionById(selected), city: cityById(selected) }
    : null;
  const selMarkers = selected
    ? map.markers.filter((m) => m.sector.toUpperCase() === selected)
    : [];
  return (
    <>
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
              Un lieu hors des cartes : une mer de brume d'Aether, des îlots
              suspendus et des ruines oubliées. On n'y entre et on n'en sort que
              par un portail.
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
                onClick={() => act(toUnknown(map))}
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
                label={sel.region ? 'Nom de la sous-région' : 'Nom de la cité'}
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
                      onClick={() => onSelect(n.id)}
                      className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 text-fantasy-text-soft"
                    >
                      {n.via === 'traversee' ? '⇢' : '□'}{' '}
                      {nodeName(n.id, map.sectorNames)}
                    </button>
                  </li>
                ))}
                {neighbors(sel.id).length === 0 && <li>aucun trajet tracé</li>}
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
                            onClick={() => save({ ...map, destination: '' })}
                          >
                            Annuler le cap
                          </Btn>
                        )}
                        <Btn
                          variant="primary"
                          onClick={() => act(moveTo(map, sel.id))}
                        >
                          Partir
                        </Btn>
                      </>
                    )}
                    {isGM && !reachable.has(sel.id) && (
                      <Btn onClick={() => act(moveTo(map, sel.id, false))}>
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
                <span className="text-xs text-fantasy-muted">Repères</span>
                {can && (
                  <Btn
                    variant="ghost"
                    className="!h-7 !px-2 text-xs"
                    onClick={() =>
                      onEditMarker({
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
                onEdit={onEditMarker}
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
                <li key={`${t.at}${i}`} className="flex justify-between gap-2">
                  <span
                    className={
                      i === 0 ? 'text-fantasy-accent' : 'text-fantasy-text-soft'
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
    </>
  );
}
