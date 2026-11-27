import {
  DESERTS,
  cityById,
  neighbors,
  nodeName,
  regionById,
  UNKNOWN,
} from '../model/keld';
import { newId, shortDateTime } from '../model/logic';
import { moveTo, toUnknown } from '../model/mapActions';
import type { TravelNow } from '../model/travel';
import type { ArpenteurDoc, MapState, Marker } from '../model/types';
import { MarkerList } from './MapMarkers';
import { Btn, Card, ReadOnlyHint, TextField } from './ui';

// Fiche d'un secteur ou d'une ville (maquette 3D des déserts) : nom, accès,
// départ, cap, outils du MJ (placer, hangar, entrepôt, position inconnue),
// repères.

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
            {sel.city && (
              <>
                <Property
                  label="hangar"
                  owned={map.hangar === sel.id}
                  current={map.hangar ?? ''}
                  here={sel.id}
                  names={map.sectorNames}
                  ownedText="🏗 Hangar de l'équipage : l'arpenteur s'y amarre et l'atelier y travaille."
                  editable={isGM && can}
                  onSet={(id, log) => save({ ...map, hangar: id }, log)}
                />
                <Property
                  label="entrepôt"
                  owned={map.entrepot === sel.id}
                  current={map.entrepot ?? ''}
                  here={sel.id}
                  names={map.sectorNames}
                  ownedText="📦 Entrepôt de l'équipage : son stock se dépose et se retire depuis n'importe quelle ville."
                  editable={isGM && can}
                  onSet={(id, log) => save({ ...map, entrepot: id }, log)}
                />
              </>
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

/**
 * Bien de l'équipage dans une ville (hangar, entrepôt) : acheté à la table,
 * puis attribué, déplacé ou cédé par le MJ. Un seul de chaque à la fois.
 */
function Property({
  label,
  owned,
  current,
  here,
  names,
  ownedText,
  editable,
  onSet,
}: {
  label: 'hangar' | 'entrepôt';
  owned: boolean;
  current: string;
  here: string;
  names: Record<string, string>;
  ownedText: string;
  editable: boolean;
  onSet: (id: string, log: string) => void;
}) {
  if (!owned && !editable) return null;
  const Label = label[0].toUpperCase() + label.slice(1);
  const city = nodeName(here, names);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-black/25 p-2.5">
      <span className="text-sm text-fantasy-text">
        {owned
          ? ownedText
          : `Pas ${label === 'hangar' ? 'de hangar' : "d'entrepôt"} dans cette ville.`}
      </span>
      {editable && (
        <div className="flex flex-wrap gap-2">
          {owned ? (
            <Btn
              variant="ghost"
              onClick={() => onSet('', `${Label} de ${city} cédé`)}
            >
              Retirer {label === 'hangar' ? 'le hangar' : "l'entrepôt"}
            </Btn>
          ) : (
            <Btn onClick={() => onSet(here, `${Label} acquis à ${city}`)}>
              {current
                ? `Déplacer ${label === 'hangar' ? 'le hangar' : "l'entrepôt"} ici (remplace ${nodeName(current, names)})`
                : `Attribuer ${label === 'hangar' ? 'un hangar' : 'un entrepôt'} ici`}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
