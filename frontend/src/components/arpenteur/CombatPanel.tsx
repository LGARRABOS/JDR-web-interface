import { useState } from 'react';
import { FIRE_STEPS, GUN_TYPES } from '../../arpenteur/catalog';
import {
  GUN_TYPE_IDS,
  canonicalPost,
  clampBattery,
  fireGuns,
  installedGuns,
  newId,
  prepareGuns,
  rangeInfo,
  readyGuns,
  salvoDice,
  shortDateTime,
  type Rights,
} from '../../arpenteur/logic';
import type { UpdateFn } from '../../arpenteur/useArpenteur';
import type {
  ArpenteurDoc,
  Battery,
  Combat,
  GunType,
  Orders,
} from '../../arpenteur/types';
import {
  Btn,
  Card,
  LiveField,
  Meter,
  ReadOnlyHint,
  Stepper,
  healthColor,
} from './ui';
import { RangeDiagram } from './RangeDiagram';

interface Props {
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  /** Lance des dés visibles de tous (dégâts d'une salve). */
  onRoll: (expression: string) => void;
}

export function CombatPanel({ doc, rights, update, onRoll }: Props) {
  const c = doc.combat;
  const o = doc.orders;
  const can = rights.combat;
  const canOrders = rights.orders;
  const ready = readyGuns(c);
  const { installed, slots } = installedGuns(c);
  const ammo = c.ammo.find((a) => a.id === o.ammo) ?? c.ammo[0];
  const [newAmmo, setNewAmmo] = useState('');

  const setCombat = (next: Combat, log?: string) =>
    update('combat', next, { log, immediate: !!log });
  const setOrders = (next: Orders, log?: string) =>
    update('orders', next, { log, immediate: true });

  const setBattery = (deckId: string, t: GunType, b: Battery) =>
    setCombat({
      ...c,
      decks: c.decks.map((d) =>
        d.id === deckId
          ? { ...d, guns: { ...d.guns, [t]: clampBattery(b) } }
          : d
      ),
    });

  const prepare = () => {
    const r = prepareGuns(c, ammo?.id ?? '');
    if (r.loaded + r.primed === 0) return;
    setCombat(
      r.combat,
      `Canons préparés : ${r.loaded} chargé${r.loaded > 1 ? 's' : ''}${ammo ? ` (${ammo.name.toLowerCase()})` : ''}, ${r.primed} amorcé${r.primed > 1 ? 's' : ''}`
    );
    if (canOrders && o.step === 4) setOrders({ ...o, step: 5 });
  };

  const fire = () => {
    const r = fireGuns(c);
    if (!r.fired) return;
    const side = o.target ? rangeInfo(o.target).side : '';
    const name = ammo?.name ?? 'Boulets';
    const dice = salvoDice(name, r.fired);
    setCombat(
      {
        ...r.combat,
        lastSalvo: {
          id: Date.now(),
          at: '',
          guns: r.fired,
          ammo: name,
          side,
          by: '',
          result: dice ?? '',
        },
      },
      `Feu ! ${r.fired} canon${r.fired > 1 ? 's' : ''} (${name.toLowerCase()})${o.target?.label ? ` sur ${o.target.label}` : ''}`
    );
    if (dice) onRoll(dice);
    if (canOrders && o.step === 5) setOrders({ ...o, step: 6 });
  };

  const holders = (posts: string[]) =>
    doc.crew.members
      .filter((m) => posts.includes(canonicalPost(m.post)))
      .map((m) => m.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Coque" subtitle="Constitution de l'arpenteur">
          <div className="flex items-end justify-between gap-3">
            <span
              className="font-heading text-4xl"
              style={{ color: healthColor(c.constitution / c.constitutionMax) }}
            >
              {c.constitution}
              <span className="text-lg text-fantasy-muted">
                {' '}
                / {c.constitutionMax}
              </span>
            </span>
            {can && (
              <Stepper
                value={c.constitution}
                max={c.constitutionMax}
                onChange={(v) => setCombat({ ...c, constitution: v })}
                label="constitution"
              />
            )}
          </div>
          <Meter
            value={c.constitution}
            max={c.constitutionMax}
            color={healthColor(c.constitution / c.constitutionMax)}
            height={12}
            className="mt-2"
          />
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-fantasy-text-soft">Pièces de réparation</span>
            {can ? (
              <Stepper
                value={c.repairParts}
                max={c.repairPartsMax}
                onChange={(v) => setCombat({ ...c, repairParts: v })}
                label="pièces"
                suffix={
                  <span className="text-fantasy-muted font-normal">
                    /{c.repairPartsMax}
                  </span>
                }
              />
            ) : (
              <span className="tabular-nums">
                {c.repairParts} / {c.repairPartsMax}
              </span>
            )}
          </div>
          {can && (
            <Btn
              className="mt-3 w-full"
              disabled={
                c.repairParts <= 0 || c.constitution >= c.constitutionMax
              }
              onClick={() =>
                setCombat(
                  {
                    ...c,
                    constitution: c.constitution + 1,
                    repairParts: c.repairParts - 1,
                  },
                  'Réparation de la coque (+1 constitution, −1 pièce)'
                )
              }
            >
              Réparer (1 pièce → +1)
            </Btn>
          )}
        </Card>

        <Card title="Poudre à canon" subtitle="5 utilisations par baril">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-fantasy-text-soft">Réserve en cale</span>
            {can ? (
              <Stepper
                value={c.powderReserve}
                max={c.powderReserveMax}
                onChange={(v) => setCombat({ ...c, powderReserve: v })}
                label="barils en réserve"
                suffix={
                  <span className="text-fantasy-muted font-normal">
                    /{c.powderReserveMax}
                  </span>
                }
              />
            ) : (
              <span>
                {c.powderReserve} / {c.powderReserveMax} barils
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 min-h-[60px]">
            {c.barrels.length === 0 && (
              <p className="text-xs text-fantasy-muted">
                Aucun baril sur le pont.
              </p>
            )}
            {c.barrels.map((b, i) => (
              <div key={b.id} className="flex flex-col items-center gap-1">
                <BarrelIcon uses={b.uses} max={b.max} />
                {can ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="arp-step !w-6 !h-6 text-xs"
                      disabled={b.uses <= 0}
                      onClick={() =>
                        setCombat({
                          ...c,
                          barrels: c.barrels.map((x) =>
                            x.id === b.id ? { ...x, uses: x.uses - 1 } : x
                          ),
                        })
                      }
                      aria-label={`Baril ${i + 1} : retirer une utilisation`}
                    >
                      −
                    </button>
                    <span className="text-[11px] tabular-nums w-7 text-center">
                      {b.uses}/{b.max}
                    </span>
                    <button
                      type="button"
                      className="arp-step !w-6 !h-6 text-xs"
                      disabled={b.uses >= b.max}
                      onClick={() =>
                        setCombat({
                          ...c,
                          barrels: c.barrels.map((x) =>
                            x.id === b.id ? { ...x, uses: x.uses + 1 } : x
                          ),
                        })
                      }
                      aria-label={`Baril ${i + 1} : ajouter une utilisation`}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] tabular-nums">
                    {b.uses}/{b.max}
                  </span>
                )}
              </div>
            ))}
          </div>
          {can && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn
                disabled={c.powderReserve <= 0}
                onClick={() =>
                  setCombat(
                    {
                      ...c,
                      powderReserve: c.powderReserve - 1,
                      barrels: [...c.barrels, { id: newId(), uses: 5, max: 5 }],
                    },
                    'Un baril de poudre est monté sur le pont'
                  )
                }
              >
                Monter un baril
              </Btn>
              <Btn
                variant="ghost"
                disabled={!c.barrels.some((b) => b.uses === 0)}
                onClick={() =>
                  setCombat({
                    ...c,
                    barrels: c.barrels.filter((b) => b.uses > 0),
                  })
                }
              >
                Retirer les vides
              </Btn>
            </div>
          )}
        </Card>

        <Card title="Munitions">
          <ul className="flex flex-col gap-2">
            {c.ammo.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <label className="flex items-center gap-2 min-w-0">
                  <input
                    type="radio"
                    name="arp-ammo"
                    checked={ammo?.id === a.id}
                    disabled={!canOrders}
                    onChange={() =>
                      setOrders(
                        { ...o, ammo: a.id },
                        `Munition choisie : ${a.name.toLowerCase()}`
                      )
                    }
                    title="Munition à charger (choisie par le capitaine)"
                  />
                  <span className="truncate">{a.name}</span>
                </label>
                <span className="flex items-center gap-1">
                  {can ? (
                    <Stepper
                      value={a.count}
                      max={99999}
                      onChange={(v) =>
                        setCombat({
                          ...c,
                          ammo: c.ammo.map((x) =>
                            x.id === a.id ? { ...x, count: v } : x
                          ),
                        })
                      }
                      label={a.name}
                    />
                  ) : (
                    <span className="tabular-nums font-semibold">
                      {a.count}
                    </span>
                  )}
                  {can && a.id !== 'boulets' && a.id !== 'filets' && (
                    <button
                      type="button"
                      className="icon-btn !w-7 !h-7 text-xs"
                      onClick={() =>
                        setCombat({
                          ...c,
                          ammo: c.ammo.filter((x) => x.id !== a.id),
                        })
                      }
                      aria-label={`Supprimer ${a.name}`}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {can && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAmmo.trim()) return;
                setCombat({
                  ...c,
                  ammo: [
                    ...c.ammo,
                    { id: newId(), name: newAmmo.trim(), count: 0 },
                  ],
                });
                setNewAmmo('');
              }}
            >
              <input
                className="arp-input flex-1 min-w-0"
                value={newAmmo}
                onChange={(e) => setNewAmmo(e.target.value)}
                placeholder="Autre munition…"
              />
              <Btn type="submit" disabled={!newAmmo.trim()}>
                Ajouter
              </Btn>
            </form>
          )}
          <p className="mt-3 text-[11px] text-fantasy-muted">
            La munition cochée est celle que le capitaine fait charger.
          </p>
        </Card>
      </div>

      <Card
        title="Batteries"
        subtitle={`${installed} canon${installed > 1 ? 's' : ''} installé${installed > 1 ? 's' : ''} sur ${slots} emplacement${slots > 1 ? 's' : ''} · ${ready} prêt${ready > 1 ? 's' : ''} à tirer`}
        actions={
          can && (
            <>
              <Btn
                onClick={prepare}
                title="Charge la munition choisie et amorce avec la poudre des barils"
              >
                Préparer les canons
              </Btn>
              <Btn
                variant="primary"
                disabled={ready === 0}
                onClick={fire}
                className="!bg-red-700 hover:!bg-red-600 !text-white"
              >
                Feu ! ({ready})
              </Btn>
            </>
          )
        }
      >
        {!can && <ReadOnlyHint doc={doc} section="combat" />}
        <div className="flex flex-col gap-3 mt-1">
          {c.decks.map((d) => (
            <div
              key={d.id}
              className={`rounded-xl border p-3 ${d.available ? 'border-fantasy-border-soft bg-black/15' : 'border-dashed border-fantasy-border-soft opacity-60'}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="font-heading text-sm">{d.name}</h4>
                <button
                  type="button"
                  disabled={!can}
                  onClick={() =>
                    setCombat({
                      ...c,
                      decks: c.decks.map((x) =>
                        x.id === d.id ? { ...x, available: !x.available } : x
                      ),
                    })
                  }
                  className={`text-[11px] px-2 py-1 rounded-md ${d.available ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}
                >
                  {d.available ? 'Possible' : 'Impossible'}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {GUN_TYPE_IDS.map((t) => (
                  <BatteryCell
                    key={t}
                    label={`${t} · ${GUN_TYPES.find((g) => g.id === t)?.label}`}
                    b={d.guns[t]}
                    can={can}
                    onChange={(b) => setBattery(d.id, t, b)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {c.lastSalvo && (
          <p className="mt-3 text-xs text-fantasy-muted">
            Dernière salve : {c.lastSalvo.guns} canon
            {c.lastSalvo.guns > 1 ? 's' : ''} ({c.lastSalvo.ammo.toLowerCase()})
            {c.lastSalvo.by ? ` par ${c.lastSalvo.by}` : ''}
            {c.lastSalvo.at ? `, ${shortDateTime(c.lastSalvo.at)}` : ''}
            {c.lastSalvo.result
              ? ` · dégâts ${c.lastSalvo.result.toUpperCase()}`
              : ''}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Déroulé de la mise à feu"
          subtitle={
            o.step === 0
              ? 'Aucun tir en cours'
              : `Étape ${o.step} sur ${FIRE_STEPS.length}`
          }
          actions={
            canOrders &&
            (o.step === 0 ? (
              <Btn
                variant="primary"
                onClick={() =>
                  setOrders(
                    { ...o, step: 1 },
                    'Début d’une séance de mise à feu'
                  )
                }
              >
                Commencer
              </Btn>
            ) : (
              <>
                <Btn
                  variant="ghost"
                  disabled={o.step <= 1}
                  onClick={() => setOrders({ ...o, step: o.step - 1 })}
                >
                  ◀
                </Btn>
                {o.step < FIRE_STEPS.length ? (
                  <Btn
                    variant="primary"
                    onClick={() => setOrders({ ...o, step: o.step + 1 })}
                  >
                    Étape suivante
                  </Btn>
                ) : (
                  <Btn
                    variant="primary"
                    onClick={() =>
                      setOrders(
                        { ...o, step: 0 },
                        'Fin de la séance de mise à feu'
                      )
                    }
                  >
                    Terminer
                  </Btn>
                )}
              </>
            ))
          }
        >
          {!canOrders && <ReadOnlyHint doc={doc} section="orders" />}
          <ol className="relative flex flex-col gap-1 mt-1">
            {FIRE_STEPS.map((s, i) => {
              const n = i + 1;
              const state =
                o.step === 0
                  ? 'idle'
                  : n < o.step
                    ? 'done'
                    : n === o.step
                      ? 'current'
                      : 'todo';
              const who = holders(s.posts);
              return (
                <li
                  key={n}
                  className={`flex gap-3 rounded-xl px-3 py-2.5 transition-colors ${state === 'current' ? 'bg-fantasy-accent/12 ring-1 ring-fantasy-accent/60' : ''}`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${state === 'done' ? 'bg-emerald-600/80 text-white' : state === 'current' ? 'bg-fantasy-accent text-fantasy-bg animate-pulse' : 'bg-black/30 text-fantasy-muted'}`}
                  >
                    {state === 'done' ? '✓' : n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${state === 'todo' ? 'text-fantasy-muted' : 'text-fantasy-text'}`}
                    >
                      {s.posts.length > 0 && (
                        <strong className="text-fantasy-accent">
                          {s.posts.join(' + ')} →{' '}
                        </strong>
                      )}
                      {s.title}
                    </p>
                    <p className="text-xs text-fantasy-muted">
                      {s.detail}
                      {who.length > 0 && ` (${who.join(', ')})`}
                    </p>
                    {state === 'current' && n === 2 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.ammo.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            disabled={!canOrders}
                            onClick={() =>
                              setOrders(
                                { ...o, ammo: a.id },
                                `Munition choisie : ${a.name.toLowerCase()}`
                              )
                            }
                            className={`text-xs px-2.5 py-1 rounded-md border ${ammo?.id === a.id ? 'border-fantasy-accent bg-fantasy-accent/15 text-fantasy-accent' : 'border-fantasy-border-soft'}`}
                          >
                            {a.name} ({a.count})
                          </button>
                        ))}
                      </div>
                    )}
                    {state === 'current' && n === 4 && can && (
                      <Btn className="mt-2" onClick={prepare}>
                        Préparer les canons
                      </Btn>
                    )}
                    {state === 'current' && n === 5 && can && (
                      <Btn
                        className="mt-2 !bg-red-700 hover:!bg-red-600 !text-white"
                        disabled={ready === 0}
                        onClick={fire}
                      >
                        Feu ! ({ready} prêt{ready > 1 ? 's' : ''})
                      </Btn>
                    )}
                    {state === 'current' && n === 6 && c.lastSalvo?.result && (
                      <Btn
                        className="mt-2"
                        onClick={() => onRoll(c.lastSalvo!.result)}
                      >
                        Relancer les dégâts ({c.lastSalvo.result.toUpperCase()})
                      </Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card
          title="Portées"
          subtitle={
            canOrders ? 'Cliquez pour placer la cible' : 'Position de la cible'
          }
          actions={
            canOrders &&
            o.target && (
              <Btn
                variant="ghost"
                onClick={() => setOrders({ ...o, target: null })}
              >
                Effacer la cible
              </Btn>
            )
          }
        >
          <RangeDiagram
            target={o.target}
            onTarget={
              canOrders ? (t) => setOrders({ ...o, target: t }) : undefined
            }
            className="max-w-[440px] mx-auto"
          />
          {canOrders && o.target && (
            <LiveField
              label="Nom de la cible"
              value={o.target.label}
              placeholder="Draal, navire pirate…"
              onChange={(v) =>
                update('orders', { ...o, target: { ...o.target!, label: v } })
              }
              className="mt-3"
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function BarrelIcon({ uses, max }: { uses: number; max: number }) {
  const pct = max ? uses / max : 0;
  return (
    <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
      <defs>
        <clipPath id="arp-barrel">
          <path d="M5,3 Q17,0 29,3 Q33,21 29,39 Q17,42 5,39 Q1,21 5,3 Z" />
        </clipPath>
      </defs>
      <path
        d="M5,3 Q17,0 29,3 Q33,21 29,39 Q17,42 5,39 Q1,21 5,3 Z"
        fill="#4a3020"
        stroke="#1d130b"
        strokeWidth={1.5}
      />
      <rect
        x={0}
        y={42 - 40 * pct}
        width={34}
        height={40 * pct}
        fill="#2b2b2b"
        clipPath="url(#arp-barrel)"
        opacity={0.85}
      />
      <path
        d="M3,12 Q17,9 31,12 M3,30 Q17,33 31,30"
        stroke="#8b9097"
        strokeWidth={2}
        fill="none"
      />
    </svg>
  );
}

function BatteryCell({
  label,
  b,
  can,
  onChange,
}: {
  label: string;
  b: Battery;
  can: boolean;
  onChange: (b: Battery) => void;
}) {
  if (b.slots === 0 && !can) {
    return (
      <div className="text-xs text-fantasy-muted rounded-lg bg-black/15 px-3 py-2">
        {label} — aucun emplacement
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-black/20 px-3 py-2.5">
      <p className="text-xs text-fantasy-text-soft mb-2">{label}</p>
      <div className="flex flex-wrap gap-1 mb-2 min-h-[18px]">
        {Array.from({ length: b.slots }, (_, i) => {
          const installed = i < b.installed;
          const loaded = i < b.loaded;
          const primed = i < b.primed;
          const ready = loaded && primed;
          return (
            <span
              key={i}
              title={
                !installed
                  ? 'Emplacement libre'
                  : ready
                    ? 'Prêt à tirer'
                    : loaded
                      ? 'Chargé'
                      : primed
                        ? 'Amorcé'
                        : 'Installé'
              }
              className={`w-5 h-4 rounded-sm grid place-items-center ${!installed ? 'border border-dashed border-fantasy-muted/50' : 'bg-[#3a3f45]'}`}
              style={
                ready
                  ? { boxShadow: '0 0 8px #f0b44a', background: '#5a4a32' }
                  : undefined
              }
            >
              {loaded && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#111]" />
              )}
            </span>
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-1 text-[11px] text-fantasy-muted">
        {(
          [
            ['installed', 'Installés', b.slots],
            ['loaded', 'Chargés', b.installed],
            ['primed', 'Poudre', b.installed],
          ] as const
        ).map(([k, l, max]) => (
          <div key={k} className="flex flex-col items-center gap-0.5">
            <dt>{l}</dt>
            <dd className="text-fantasy-text text-sm">
              {can ? (
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="arp-step !w-5 !h-5 text-[11px]"
                    disabled={b[k] <= 0}
                    onClick={() => onChange({ ...b, [k]: b[k] - 1 })}
                    aria-label={`${l} −1`}
                  >
                    −
                  </button>
                  <span className="tabular-nums w-5 text-center">{b[k]}</span>
                  <button
                    type="button"
                    className="arp-step !w-5 !h-5 text-[11px]"
                    disabled={b[k] >= max}
                    onClick={() => onChange({ ...b, [k]: b[k] + 1 })}
                    aria-label={`${l} +1`}
                  >
                    +
                  </button>
                </span>
              ) : (
                <span className="tabular-nums">
                  {b[k]}/{max}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {can && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-fantasy-muted">
          <span>Emplacements</span>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              className="arp-step !w-5 !h-5 text-[11px]"
              disabled={b.slots <= 0}
              onClick={() => onChange({ ...b, slots: b.slots - 1 })}
              aria-label="Emplacements −1"
            >
              −
            </button>
            <span className="tabular-nums w-5 text-center text-fantasy-text">
              {b.slots}
            </span>
            <button
              type="button"
              className="arp-step !w-5 !h-5 text-[11px]"
              onClick={() => onChange({ ...b, slots: b.slots + 1 })}
              aria-label="Emplacements +1"
            >
              +
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
