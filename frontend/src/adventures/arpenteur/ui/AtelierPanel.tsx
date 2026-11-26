import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ALLURES,
  COQUE_TYPES,
  EMBLEMS,
  GOUVERNAILS,
  LUMINAIRES,
  MAST_TYPES,
  MATERIALS,
  PONTS,
  PROW_MATERIALS,
  QUILLE_TYPES,
  ROOM_DECKS,
  ROOM_KINDS,
  SCULPTURES,
} from '../model/catalog';
import { newId, shipSection, type Rights } from '../model/logic';
import type { UpdateFn } from '../model/useArpenteur';
import type { ArpenteurDoc, Build, Material, Room } from '../model/types';
import { cityById } from '../model/keld';
import { ShipThumb3D } from './ShipThumb3D';
import { useTravel } from './useTravel';
import {
  Btn,
  Card,
  ColorPicker,
  LiveField,
  ReadOnlyHint,
  SelectField,
} from './ui';

interface Props {
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  /** Le MJ peut lancer des travaux hors du hangar. */
  isGM?: boolean;
}

const label = <T extends string | number>(
  list: { id: T; label: string }[],
  id: T
) => list.find((x) => x.id === id)?.label ?? String(id);

/** Liste lisible des différences entre deux constructions. */
export function buildChanges(a: Build, b: Build): string[] {
  const out: string[] = [];
  if (a.allure !== b.allure) out.push(`Allure ${label(ALLURES, b.allure)}`);
  if (
    a.quille.type !== b.quille.type ||
    a.quille.material !== b.quille.material
  )
    out.push(
      `${QUILLE_TYPES[b.quille.type].label} en ${MATERIALS[b.quille.material].label.toLowerCase()}`
    );
  if (a.coque.type !== b.coque.type || a.coque.material !== b.coque.material)
    out.push(
      `${COQUE_TYPES[b.coque.type].label} en ${MATERIALS[b.coque.material].label.toLowerCase()}`
    );
  if (a.mats.type !== b.mats.type) out.push(label(MAST_TYPES, b.mats.type));
  if (a.mats.sailColor !== b.mats.sailColor) out.push('Nouvelles voiles');
  if (
    a.mats.flagColor !== b.mats.flagColor ||
    a.mats.flagEmblem !== b.mats.flagEmblem
  )
    out.push('Nouveau drapeau');
  if (a.ponts !== b.ponts) out.push(`Ponts : ${label(PONTS, b.ponts)}`);
  if (a.poupe.material !== b.poupe.material)
    out.push(`Poupe en ${MATERIALS[b.poupe.material].label.toLowerCase()}`);
  if (a.poupe.gouvernail !== b.poupe.gouvernail)
    out.push(
      `Gouvernail ${label(GOUVERNAILS, b.poupe.gouvernail).toLowerCase()}`
    );
  if (a.poupe.luminaires !== b.poupe.luminaires)
    out.push(
      `Luminaires : ${label(LUMINAIRES, b.poupe.luminaires).toLowerCase()}`
    );
  if (
    a.proue.sculpture !== b.proue.sculpture ||
    a.proue.material !== b.proue.material
  )
    out.push(
      b.proue.sculpture === 'aucune'
        ? 'Proue sans sculpture'
        : `Sculpture de proue ${label(SCULPTURES, b.proue.sculpture).toLowerCase()} (${PROW_MATERIALS[b.proue.material].label.toLowerCase()})`
    );
  if (a.deco.bands.join() !== b.deco.bands.join())
    out.push('Bandes de couleur');
  if (a.deco.trim !== b.deco.trim) out.push('Dorures');
  if (a.tenue.color !== b.tenue.color || a.tenue.accent !== b.tenue.accent)
    out.push("Tenue de l'équipage");
  const ra = new Map(a.rooms.map((r) => [r.id, r]));
  const rb = new Map(b.rooms.map((r) => [r.id, r]));
  for (const r of b.rooms)
    if (!ra.has(r.id))
      out.push(`Nouvelle pièce : ${r.name || label(ROOM_KINDS, r.kind)}`);
  for (const r of a.rooms)
    if (!rb.has(r.id))
      out.push(`Pièce retirée : ${r.name || label(ROOM_KINDS, r.kind)}`);
  for (const r of b.rooms) {
    const o = ra.get(r.id);
    if (o && JSON.stringify(o) !== JSON.stringify(r))
      out.push(`Pièce modifiée : ${r.name || label(ROOM_KINDS, r.kind)}`);
  }
  return out;
}

export function AtelierPanel({ doc, rights, update, isGM = false }: Props) {
  const can = rights.ship && !doc.pending;
  // Les améliorations se font au hangar de l'équipage, navire amarré.
  const travel = useTravel(doc.map.travel);
  const hangar = doc.map.hangar ?? '';
  const atHangar = !!hangar && doc.map.sector === hangar && !travel;
  const hangarName = hangar
    ? doc.map.sectorNames[hangar] || cityById(hangar)?.name || hangar
    : '';
  const [draft, setDraft] = useState<Build>(doc.build);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [duration, setDuration] = useState('');
  const [deduct, setDeduct] = useState(true);
  const [roomDraft, setRoomDraft] = useState<Room | null>(null);

  // Construction modifiée ailleurs (autre onglet, autre joueur) : on repart d'elle si rien n'est en cours ici.
  useEffect(() => {
    if (!dirty) setDraft(doc.build);
  }, [doc.build, dirty]);

  const changes = useMemo(
    () => buildChanges(doc.build, draft),
    [doc.build, draft]
  );
  const set = (fn: (b: Build) => Build) => {
    setDraft((b) => fn(b));
    setDirty(true);
  };
  const reset = () => {
    setDraft(doc.build);
    setDirty(false);
    setTitle('');
    setCost('');
    setDuration('');
  };
  const name =
    title.trim() ||
    (changes.length === 1 ? changes[0] : `${changes.length} améliorations`);
  const couponCost = /^\s*(\d+)\s*(coupons?)?\s*$/i.exec(cost);
  const canDeduct = !!couponCost && rights.expedition;
  const now = () => new Date().toISOString();

  const historyWith = (build: Build, label2: string, cost2: string) => {
    const entry = { id: newId(), at: now(), label: label2, cost: cost2, build };
    return doc.history.length
      ? [...doc.history, entry]
      : [
          {
            id: newId(),
            at: doc.log[0]?.at ?? now(),
            label: "Construction d'origine",
            cost: '',
            build: doc.build,
          },
          entry,
        ];
  };

  const payCoupons = () => {
    if (canDeduct && deduct) {
      const n = parseInt(couponCost![1], 10);
      update(
        'expedition',
        { ...doc.expedition, coupons: doc.expedition.coupons - n },
        { immediate: true }
      );
    }
  };

  const apply = () => {
    update(
      'ship',
      {
        ...shipSection(doc),
        build: draft,
        history: historyWith(draft, name, cost),
      },
      {
        log: `Amélioration : ${name}${cost ? ` (${cost})` : ''}`,
        immediate: true,
      }
    );
    payCoupons();
    reset();
  };

  const startWorks = () => {
    update(
      'ship',
      {
        ...shipSection(doc),
        pending: {
          label: name,
          cost,
          duration,
          startedAt: now(),
          build: draft,
        },
      },
      {
        log: `Travaux lancés : ${name}${duration ? ` (${duration})` : ''}`,
        immediate: true,
      }
    );
    payCoupons();
    reset();
  };

  const p = doc.pending;
  const section = (t: string, sub: string, body: ReactNode) => (
    <Card title={t} subtitle={sub}>
      <fieldset disabled={!can} className={can ? '' : 'opacity-70'}>
        {body}
      </fieldset>
    </Card>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,440px)_1fr] items-start">
      <div className="xl:sticky xl:top-2 flex flex-col gap-3">
        <div
          className="rounded-2xl overflow-hidden border border-fantasy-border-soft"
          style={{
            background:
              'radial-gradient(ellipse at 50% 85%, #e2bb7a 0%, #9a6a3c 35%, #2a1d14 75%)',
          }}
        >
          <ShipThumb3D
            build={p ? p.build : draft}
            width={960}
            height={420}
            scaffolding={!!p}
            className="w-full h-auto"
          />
        </div>
        {p ? (
          <Card
            title="Travaux en cours"
            subtitle={`${p.label}${p.duration ? ` · ${p.duration}` : ''}${p.cost ? ` · ${p.cost}` : ''}`}
          >
            <p className="text-xs text-fantasy-muted mb-3">
              L'aperçu montre le navire une fois les travaux terminés ; en
              attendant, il est en chantier.
            </p>
            {rights.ship && (
              <div className="flex flex-wrap gap-2">
                <Btn
                  variant="primary"
                  onClick={() =>
                    update(
                      'ship',
                      {
                        ...shipSection(doc),
                        build: p.build,
                        pending: null,
                        history: historyWith(p.build, p.label, p.cost),
                      },
                      { log: `Travaux terminés : ${p.label}`, immediate: true }
                    )
                  }
                >
                  Terminer les travaux
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() =>
                    update(
                      'ship',
                      { ...shipSection(doc), pending: null },
                      {
                        log: `Travaux abandonnés : ${p.label}`,
                        immediate: true,
                      }
                    )
                  }
                >
                  Abandonner
                </Btn>
              </div>
            )}
          </Card>
        ) : (
          <Card
            title={changes.length ? 'Commande au chantier' : 'Chantier'}
            subtitle={
              changes.length
                ? `${changes.length} changement${changes.length > 1 ? 's' : ''}`
                : 'Choisissez des améliorations ci-contre'
            }
          >
            {!rights.ship && <ReadOnlyHint doc={doc} section="ship" />}
            {changes.length > 0 && (
              <>
                <ul className="text-sm text-fantasy-text-soft list-disc pl-5 mb-3">
                  {changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <LiveField
                    label="Intitulé"
                    value={title}
                    placeholder={name}
                    onChange={setTitle}
                    className="col-span-2"
                  />
                  <LiveField
                    label="Coût"
                    value={cost}
                    placeholder="40 coupons, 3 PA…"
                    onChange={setCost}
                  />
                  <LiveField
                    label="Durée des travaux"
                    value={duration}
                    placeholder="3 jours…"
                    onChange={setDuration}
                  />
                </div>
                {canDeduct && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-fantasy-text-soft">
                    <input
                      type="checkbox"
                      checked={deduct}
                      onChange={(e) => setDeduct(e.target.checked)}
                    />
                    Déduire {couponCost![1]} coupons de l'expédition (
                    {doc.expedition.coupons} restants)
                  </label>
                )}
                {!atHangar && (
                  <p className="mt-3 text-xs text-fantasy-accent">
                    {travel
                      ? "L'arpenteur est en route : les travaux attendront l'amarrage au hangar."
                      : hangar
                        ? `Les travaux se font au hangar de l'équipage, à ${hangarName} : l'arpenteur doit s'y trouver.`
                        : "L'équipage n'a pas de hangar : le MJ peut en attribuer un dans une ville, depuis l'onglet Carte."}
                    {isGM && ' En tant que MJ, vous pouvez passer outre.'}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    variant="primary"
                    onClick={apply}
                    disabled={!atHangar && !isGM}
                  >
                    Appliquer maintenant
                  </Btn>
                  <Btn
                    onClick={startWorks}
                    disabled={!duration.trim() || (!atHangar && !isGM)}
                    title={duration.trim() ? undefined : 'Indiquez une durée'}
                  >
                    Lancer les travaux
                  </Btn>
                  <Btn variant="ghost" onClick={reset}>
                    Annuler
                  </Btn>
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {section(
          "Constructeur d'arpenteur",
          'Allure, structure et gréement',
          <div className="flex flex-col gap-5">
            <Group title="Allure">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALLURES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => set((b) => ({ ...b, allure: a.id }))}
                    className={`rounded-xl border p-1.5 text-left transition-colors ${draft.allure === a.id ? 'border-fantasy-accent bg-fantasy-accent/10' : 'border-fantasy-border-soft hover:bg-black/20'}`}
                    title={a.hint}
                  >
                    <ShipThumb3D
                      build={{ ...draft, allure: a.id }}
                      className="w-full h-auto"
                    />
                    <span className="block text-xs font-heading text-center mt-0.5">
                      {a.label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-fantasy-muted mt-1.5">
                {ALLURES.find((a) => a.id === draft.allure)?.hint}
              </p>
            </Group>
            <Group title="Quille">
              <Options
                value={draft.quille.type}
                options={Object.entries(QUILLE_TYPES).map(([id, v]) => ({
                  id: id as 'simple' | 'lourde',
                  label: v.label,
                }))}
                onChange={(t) =>
                  set((b) => ({
                    ...b,
                    quille: {
                      type: t,
                      material: QUILLE_TYPES[t].materials.includes(
                        b.quille.material
                      )
                        ? b.quille.material
                        : QUILLE_TYPES[t].materials[0],
                    },
                  }))
                }
              />
              <Materials
                list={QUILLE_TYPES[draft.quille.type].materials}
                value={draft.quille.material}
                onChange={(m) =>
                  set((b) => ({ ...b, quille: { ...b.quille, material: m } }))
                }
              />
            </Group>
            <Group title="Coque">
              <Options
                value={draft.coque.type}
                options={Object.entries(COQUE_TYPES).map(([id, v]) => ({
                  id: id as 'legere' | 'renforcee',
                  label: v.label,
                }))}
                onChange={(t) =>
                  set((b) => ({
                    ...b,
                    coque: {
                      type: t,
                      material: COQUE_TYPES[t].materials.includes(
                        b.coque.material
                      )
                        ? b.coque.material
                        : COQUE_TYPES[t].materials[0],
                    },
                  }))
                }
              />
              <Materials
                list={COQUE_TYPES[draft.coque.type].materials}
                value={draft.coque.material}
                onChange={(m) =>
                  set((b) => ({ ...b, coque: { ...b.coque, material: m } }))
                }
              />
            </Group>
            <Group title="Mâts">
              <Options
                value={draft.mats.type}
                options={MAST_TYPES}
                onChange={(t) =>
                  set((b) => ({ ...b, mats: { ...b.mats, type: t } }))
                }
              />
            </Group>
            <Group title="Ponts">
              <Options
                value={draft.ponts}
                options={PONTS.map((x) => ({
                  id: x.id,
                  label: `${x.label} — ${x.hint}`,
                }))}
                onChange={(t) => set((b) => ({ ...b, ponts: t }))}
              />
            </Group>
            <Group title="Poupe">
              <Materials
                list={Object.keys(MATERIALS) as Material[]}
                value={draft.poupe.material}
                onChange={(m) =>
                  set((b) => ({ ...b, poupe: { ...b.poupe, material: m } }))
                }
              />
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <SelectField
                  label="Style du gouvernail"
                  value={draft.poupe.gouvernail}
                  options={GOUVERNAILS}
                  onChange={(v) =>
                    set((b) => ({ ...b, poupe: { ...b.poupe, gouvernail: v } }))
                  }
                />
                <SelectField
                  label="Luminaires"
                  value={draft.poupe.luminaires}
                  options={LUMINAIRES}
                  onChange={(v) =>
                    set((b) => ({ ...b, poupe: { ...b.poupe, luminaires: v } }))
                  }
                />
              </div>
            </Group>
            <Group title="Proue">
              <Options
                value={draft.proue.sculpture}
                options={SCULPTURES}
                onChange={(v) =>
                  set((b) => ({ ...b, proue: { ...b.proue, sculpture: v } }))
                }
              />
              {draft.proue.sculpture !== 'aucune' && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(PROW_MATERIALS).map(([id, m]) => (
                    <Swatch
                      key={id}
                      active={draft.proue.material === id}
                      color={m.base}
                      label={m.label}
                      onClick={() =>
                        set((b) => ({
                          ...b,
                          proue: {
                            ...b.proue,
                            material: id as Build['proue']['material'],
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </Group>
          </div>
        )}

        {section(
          'Designer décorateur',
          'Voiles, drapeau, bandes de couleur et dorures',
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorPicker
              label="Voiles"
              value={draft.mats.sailColor}
              onChange={(c) =>
                set((b) => ({ ...b, mats: { ...b.mats, sailColor: c } }))
              }
            />
            <ColorPicker
              label="Drapeau"
              value={draft.mats.flagColor}
              onChange={(c) =>
                set((b) => ({ ...b, mats: { ...b.mats, flagColor: c } }))
              }
            />
            <div className="sm:col-span-2">
              <p className="text-xs text-fantasy-muted mb-1.5">Emblème</p>
              <Options
                value={draft.mats.flagEmblem}
                options={EMBLEMS}
                onChange={(v) =>
                  set((b) => ({ ...b, mats: { ...b.mats, flagEmblem: v } }))
                }
              />
            </div>
            <ColorPicker
              label="Dorures et sabords"
              value={draft.deco.trim}
              onChange={(c) =>
                set((b) => ({ ...b, deco: { ...b.deco, trim: c } }))
              }
            />
            <div className="flex flex-col gap-2">
              <p className="text-xs text-fantasy-muted">
                Bandes de couleur sur la coque (3 au plus)
              </p>
              {draft.deco.bands.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ColorPicker
                    value={c}
                    onChange={(v) =>
                      set((b) => ({
                        ...b,
                        deco: {
                          ...b.deco,
                          bands: b.deco.bands.map((x, j) => (j === i ? v : x)),
                        },
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn !w-8 !h-8"
                    onClick={() =>
                      set((b) => ({
                        ...b,
                        deco: {
                          ...b.deco,
                          bands: b.deco.bands.filter((_, j) => j !== i),
                        },
                      }))
                    }
                    aria-label="Retirer la bande"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {draft.deco.bands.length < 3 && (
                <Btn
                  variant="ghost"
                  className="self-start"
                  onClick={() =>
                    set((b) => ({
                      ...b,
                      deco: { ...b.deco, bands: [...b.deco.bands, '#9b2c2c'] },
                    }))
                  }
                >
                  + Ajouter une bande
                </Btn>
              )}
            </div>
          </div>
        )}

        {section(
          'Tailleur',
          "Code vestimentaire de l'équipage",
          <div className="flex flex-wrap items-center gap-6">
            <svg width="70" height="96" viewBox="0 0 70 96" aria-hidden="true">
              <circle cx={35} cy={16} r={11} fill="#d9ad84" />
              <rect
                x={20}
                y={30}
                width={30}
                height={38}
                rx={9}
                fill={draft.tenue.color}
              />
              <path
                d="M22,34 L48,62"
                stroke={draft.tenue.accent}
                strokeWidth={6}
              />
              <rect x={23} y={66} width={9} height={26} rx={3} fill="#2a1e15" />
              <rect x={38} y={66} width={9} height={26} rx={3} fill="#2a1e15" />
            </svg>
            <div className="flex flex-col gap-3">
              <ColorPicker
                label="Tenue"
                value={draft.tenue.color}
                onChange={(c) =>
                  set((b) => ({ ...b, tenue: { ...b.tenue, color: c } }))
                }
              />
              <ColorPicker
                label="Écharpe et galons"
                value={draft.tenue.accent}
                onChange={(c) =>
                  set((b) => ({ ...b, tenue: { ...b.tenue, accent: c } }))
                }
              />
            </div>
          </div>
        )}

        {section(
          'Pièces et activités',
          'Place prise sur le pont, coût de construction, temps de rénovation',
          <div className="flex flex-col gap-2">
            {draft.rooms.length === 0 && (
              <p className="text-xs text-fantasy-muted">
                Aucune pièce ajoutée. Elles apparaissent dans la vue en coupe.
              </p>
            )}
            {draft.rooms.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm"
              >
                <span className="flex-1 min-w-0">
                  <span className="text-fantasy-text">
                    {r.name || label(ROOM_KINDS, r.kind)}
                  </span>
                  <span className="block text-xs text-fantasy-muted">
                    {label(ROOM_DECKS, r.deck)} · {r.space} place
                    {r.space > 1 ? 's' : ''}
                    {r.cost && ` · ${r.cost}`}
                    {r.time && ` · ${r.time}`}
                  </span>
                </span>
                <Btn
                  variant="ghost"
                  className="!h-8"
                  onClick={() => setRoomDraft(r)}
                >
                  Modifier
                </Btn>
                <button
                  type="button"
                  className="icon-btn !w-8 !h-8"
                  onClick={() =>
                    set((b) => ({
                      ...b,
                      rooms: b.rooms.filter((x) => x.id !== r.id),
                    }))
                  }
                  aria-label="Retirer la pièce"
                >
                  ✕
                </button>
              </div>
            ))}
            {roomDraft ? (
              <div className="rounded-xl border border-fantasy-border-soft p-3 grid sm:grid-cols-3 gap-3">
                <SelectField
                  label="Type"
                  value={roomDraft.kind}
                  options={ROOM_KINDS}
                  onChange={(v) => setRoomDraft({ ...roomDraft, kind: v })}
                />
                <LiveField
                  label="Nom"
                  value={roomDraft.name}
                  placeholder={label(ROOM_KINDS, roomDraft.kind)}
                  onChange={(v) => setRoomDraft({ ...roomDraft, name: v })}
                  className="sm:col-span-2"
                />
                <SelectField
                  label="Pont"
                  value={roomDraft.deck}
                  options={ROOM_DECKS.filter((d) => d.minPonts <= draft.ponts)}
                  onChange={(v) => setRoomDraft({ ...roomDraft, deck: v })}
                />
                <SelectField
                  label="Place prise"
                  value={String(roomDraft.space)}
                  options={[1, 2, 3, 4].map((n) => ({
                    id: String(n),
                    label: `${n} place${n > 1 ? 's' : ''}`,
                  }))}
                  onChange={(v) =>
                    setRoomDraft({ ...roomDraft, space: parseInt(v, 10) })
                  }
                />
                <LiveField
                  label="Coût"
                  value={roomDraft.cost}
                  onChange={(v) => setRoomDraft({ ...roomDraft, cost: v })}
                />
                <LiveField
                  label="Temps de rénovation"
                  value={roomDraft.time}
                  onChange={(v) => setRoomDraft({ ...roomDraft, time: v })}
                />
                <div className="sm:col-span-3 flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setRoomDraft(null)}>
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={() => {
                      const r = roomDraft;
                      set((b) => ({
                        ...b,
                        rooms: b.rooms.some((x) => x.id === r.id)
                          ? b.rooms.map((x) => (x.id === r.id ? r : x))
                          : [...b.rooms, r],
                      }));
                      setRoomDraft(null);
                    }}
                  >
                    Valider
                  </Btn>
                </div>
              </div>
            ) : (
              <Btn
                variant="ghost"
                className="self-start"
                disabled={draft.rooms.length >= 20}
                onClick={() =>
                  setRoomDraft({
                    id: newId(),
                    kind: 'jeux',
                    name: '',
                    deck: 'inferieur',
                    space: 1,
                    cost: '',
                    time: '',
                  })
                }
              >
                + Ajouter une pièce
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-[0.14em] text-fantasy-muted mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Options<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          title={o.hint}
          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${value === o.id ? 'border-fantasy-accent bg-fantasy-accent/15 text-fantasy-accent' : 'border-fantasy-border-soft text-fantasy-text-soft hover:bg-black/20'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatch({
  active,
  color,
  label: text,
  onClick,
  sub,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg border text-sm ${active ? 'border-fantasy-accent bg-fantasy-accent/10' : 'border-fantasy-border-soft hover:bg-black/20'}`}
    >
      <span
        className="w-6 h-6 rounded-md border border-black/40"
        style={{ background: color }}
      />
      <span className="text-left leading-tight">
        <span className="block text-fantasy-text-soft">{text}</span>
        {sub && (
          <span className="block text-[11px] text-fantasy-muted">{sub}</span>
        )}
      </span>
    </button>
  );
}

function Materials({
  list,
  value,
  onChange,
}: {
  list: Material[];
  value: Material;
  onChange: (m: Material) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {list.map((m) => {
        const mat = MATERIALS[m];
        return (
          <Swatch
            key={m}
            active={value === m}
            color={
              mat.patina
                ? `linear-gradient(135deg, ${mat.base} 55%, ${mat.patina})`
                : mat.base
            }
            label={mat.label}
            sub={mat.hint}
            onClick={() => onChange(m)}
          />
        );
      })}
    </div>
  );
}
