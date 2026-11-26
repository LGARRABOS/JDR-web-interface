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
  SCULPTURES,
} from '../model/catalog';
import {
  crewPlaces,
  installedGuns,
  inventoryTotals,
  shortDate,
  shortDateTime,
  type Rights,
} from '../model/logic';
import type { UpdateFn } from '../model/useArpenteur';
import type { ArpenteurDoc, Build, Expedition } from '../model/types';
import { ShipThumb3D } from './ShipThumb3D';
import { Btn, Card, ReadOnlyHint, Stepper, TextField } from './ui';

interface Props {
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  /** Étape de l'évolution montrée dans la scène (null : le navire actuel). */
  previewId: string | null;
  onPreview: (id: string | null, build: Build | null, label?: string) => void;
}

const lbl = <T extends string | number>(
  list: { id: T; label: string }[],
  id: T
) => list.find((x) => x.id === id)?.label ?? String(id);

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border border-black/40 align-[-1px] mr-1.5"
      style={{ background: color }}
    />
  );
}

export function OverviewPanel({
  doc,
  rights,
  update,
  previewId,
  onPreview,
}: Props) {
  const e = doc.expedition;
  const b = doc.build;
  const canExp = rights.expedition;
  const setExp = (next: Expedition, log?: string) =>
    update('expedition', next, { log });
  const guns = installedGuns(doc.combat);
  const hold = inventoryTotals(doc.hold.items);

  const sheet: [string, React.ReactNode][] = [
    ['Allure', lbl(ALLURES, b.allure)],
    [
      'Quille',
      <>
        <Dot color={MATERIALS[b.quille.material].base} />
        {QUILLE_TYPES[b.quille.type].label},{' '}
        {MATERIALS[b.quille.material].label.toLowerCase()}
      </>,
    ],
    [
      'Coque',
      <>
        <Dot color={MATERIALS[b.coque.material].base} />
        {COQUE_TYPES[b.coque.type].label},{' '}
        {MATERIALS[b.coque.material].label.toLowerCase()}
      </>,
    ],
    [
      'Mâts',
      <>
        <Dot color={b.mats.sailColor} />
        {lbl(MAST_TYPES, b.mats.type)}
      </>,
    ],
    [
      'Drapeau',
      <>
        <Dot color={b.mats.flagColor} />
        {lbl(EMBLEMS, b.mats.flagEmblem)}
      </>,
    ],
    ['Ponts', `${lbl(PONTS, b.ponts)} (${b.ponts + 2} ponts)`],
    [
      'Poupe',
      <>
        <Dot color={MATERIALS[b.poupe.material].base} />
        {MATERIALS[b.poupe.material].label}, gouvernail{' '}
        {lbl(GOUVERNAILS, b.poupe.gouvernail).toLowerCase()},{' '}
        {lbl(LUMINAIRES, b.poupe.luminaires).toLowerCase()}
      </>,
    ],
    [
      'Proue',
      b.proue.sculpture === 'aucune' ? (
        'Sans sculpture'
      ) : (
        <>
          <Dot color={PROW_MATERIALS[b.proue.material].base} />
          {lbl(SCULPTURES, b.proue.sculpture)},{' '}
          {PROW_MATERIALS[b.proue.material].label.toLowerCase()}
        </>
      ),
    ],
    [
      'Décor',
      <>
        {b.deco.bands.map((c, i) => (
          <Dot key={i} color={c} />
        ))}
        {b.deco.bands.length
          ? `${b.deco.bands.length} bande${b.deco.bands.length > 1 ? 's' : ''}, `
          : ''}
        dorures <Dot color={b.deco.trim} />
      </>,
    ],
    [
      'Tenue',
      <>
        <Dot color={b.tenue.color} />
        <Dot color={b.tenue.accent} />
        équipage
      </>,
    ],
    [
      'Pièces',
      b.rooms.length ? b.rooms.map((r) => r.name || r.kind).join(', ') : '—',
    ],
  ];

  const steps = doc.history;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card
          title={`Expédition n° ${e.number}`}
          subtitle={e.players ? `Joueurs : ${e.players}` : undefined}
          actions={
            canExp && (
              <Stepper
                value={e.number}
                min={0}
                onChange={(v) =>
                  setExp({ ...e, number: v }, `Expédition n° ${v}`)
                }
                label="numéro d'expédition"
              />
            )
          }
        >
          {!canExp && <ReadOnlyHint doc={doc} section="expedition" />}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-fantasy-muted">
                Coupons restants
              </p>
              <p className="font-heading text-4xl text-fantasy-accent tabular-nums">
                {e.coupons}
              </p>
            </div>
            {canExp && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {[-10, -1, 1, 10].map((d) => (
                  <Btn
                    key={d}
                    variant="soft"
                    className="!h-8 !px-2.5"
                    onClick={() => setExp({ ...e, coupons: e.coupons + d })}
                  >
                    {d > 0 ? `+${d}` : d}
                  </Btn>
                ))}
              </div>
            )}
            {(canExp || e.couponsNote) && (
              <TextField
                label="Note"
                value={e.couponsNote}
                disabled={!canExp}
                onCommit={(v) => setExp({ ...e, couponsNote: v })}
                placeholder="À jour"
                className="w-40"
              />
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField
              label="Quête mécène"
              value={e.patronQuest}
              multiline
              disabled={!canExp}
              onCommit={(v) => setExp({ ...e, patronQuest: v })}
            />
            <TextField
              label="Autre"
              value={e.other}
              multiline
              disabled={!canExp}
              onCommit={(v) => setExp({ ...e, other: v })}
            />
            {canExp && (
              <TextField
                label="Joueurs"
                value={e.players}
                onCommit={(v) => setExp({ ...e, players: v })}
                className="sm:col-span-2"
              />
            )}
          </div>
          {(e.fields.length > 0 || canExp) && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-fantasy-muted mb-2">
                Autres informations
              </p>
              <div className="flex flex-col gap-2">
                {e.fields.map((f, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <TextField
                      value={f.label}
                      disabled={!canExp}
                      onCommit={(v) =>
                        setExp({
                          ...e,
                          fields: e.fields.map((x, j) =>
                            j === i ? { ...x, label: v } : x
                          ),
                        })
                      }
                      className="w-40"
                    />
                    <TextField
                      value={f.value}
                      disabled={!canExp}
                      onCommit={(v) =>
                        setExp({
                          ...e,
                          fields: e.fields.map((x, j) =>
                            j === i ? { ...x, value: v } : x
                          ),
                        })
                      }
                      className="flex-1"
                    />
                    {canExp && (
                      <button
                        type="button"
                        className="icon-btn !w-9 !h-9"
                        onClick={() =>
                          setExp({
                            ...e,
                            fields: e.fields.filter((_, j) => j !== i),
                          })
                        }
                        aria-label="Retirer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {canExp && e.fields.length < 20 && (
                  <Btn
                    variant="ghost"
                    className="self-start"
                    onClick={() =>
                      setExp({
                        ...e,
                        fields: [
                          ...e.fields,
                          { label: 'Ravitaillement', value: '' },
                        ],
                      })
                    }
                  >
                    + Ajouter une information
                  </Btn>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Évolution"
          subtitle={
            steps.length
              ? 'Cliquez une étape pour la revoir dans la scène'
              : 'Chaque amélioration appliquée à l’atelier s’ajoute ici'
          }
        >
          {steps.length === 0 && !doc.pending ? (
            <p className="text-sm text-fantasy-muted">
              Le navire n’a pas encore été amélioré.
            </p>
          ) : (
            <ol className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {steps.map((s, i) => (
                <li key={s.id} className="snap-start shrink-0 w-44">
                  <button
                    type="button"
                    onClick={() =>
                      onPreview(
                        previewId === s.id ? null : s.id,
                        previewId === s.id ? null : s.build,
                        s.label
                      )
                    }
                    className={`w-full rounded-xl border p-2 text-left transition-colors ${previewId === s.id ? 'border-fantasy-accent bg-fantasy-accent/10' : 'border-fantasy-border-soft hover:bg-black/20'}`}
                  >
                    <ShipThumb3D build={s.build} className="w-full h-auto" />
                    <span className="block text-[11px] text-fantasy-muted mt-1">
                      Étape {i + 1} · {shortDate(s.at)}
                    </span>
                    <span className="block text-xs text-fantasy-text line-clamp-2">
                      {s.label}
                    </span>
                    {s.cost && (
                      <span className="block text-[11px] text-fantasy-accent">
                        {s.cost}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {doc.pending && (
                <li className="snap-start shrink-0 w-44">
                  <button
                    type="button"
                    onClick={() =>
                      onPreview(
                        previewId === 'pending' ? null : 'pending',
                        previewId === 'pending' ? null : doc.pending!.build,
                        `En chantier : ${doc.pending!.label}`
                      )
                    }
                    className={`w-full rounded-xl border border-dashed p-2 text-left ${previewId === 'pending' ? 'border-fantasy-accent bg-fantasy-accent/10' : 'border-fantasy-border-soft'}`}
                  >
                    <ShipThumb3D
                      build={doc.pending.build}
                      className="w-full h-auto opacity-80"
                      scaffolding
                    />
                    <span className="block text-[11px] text-amber-300 mt-1">
                      En chantier
                      {doc.pending.duration ? ` · ${doc.pending.duration}` : ''}
                    </span>
                    <span className="block text-xs text-fantasy-text line-clamp-2">
                      {doc.pending.label}
                    </span>
                  </button>
                </li>
              )}
            </ol>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card
          title="Fiche du navire"
          subtitle={`${guns.installed}/${guns.slots} canons · équipage ${crewPlaces(doc.crew.members)}/${doc.crew.capacity} · cale ${hold.weight}${doc.hold.capacity ? `/${doc.hold.capacity}` : ''}`}
        >
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            {sheet.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fantasy-muted">{k}</dt>
                <dd className="text-fantasy-text-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card
          title="Journal de bord"
          subtitle="Ce qui se passe à bord, pour tout le monde"
        >
          {doc.log.length === 0 ? (
            <p className="text-sm text-fantasy-muted">
              Rien n’a encore été consigné.
            </p>
          ) : (
            <ol className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
              {[...doc.log]
                .reverse()
                .slice(0, 60)
                .map((l, i) => (
                  <li key={`${l.at}${i}`} className="flex gap-3 text-sm">
                    <span className="shrink-0 w-24 text-[11px] text-fantasy-muted pt-0.5">
                      {shortDateTime(l.at)}
                    </span>
                    <span className="text-fantasy-text-soft">
                      {l.by && (
                        <strong className="text-fantasy-text font-semibold">
                          {l.by} ·{' '}
                        </strong>
                      )}
                      {l.text}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
