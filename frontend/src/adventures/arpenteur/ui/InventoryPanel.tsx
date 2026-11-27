import { useMemo, useState } from 'react';
import { RARITY_COLORS } from '../model/catalog';
import { entrepotAccess } from '../model/entrepot';
import {
  foldKey,
  formatCoins,
  inventoryTotals,
  newId,
  parsePrice,
  suggestCoupons,
  type Rights,
} from '../model/logic';
import type { UpdateFn } from '../model/useArpenteur';
import type { ArpenteurDoc, Inventory, Item } from '../model/types';
import {
  Btn,
  Card,
  Dialog,
  LiveField,
  Meter,
  NumberField,
  ReadOnlyHint,
  SelectField,
  TextField,
} from './ui';
import { useTravel } from './useTravel';

type Which = 'hold' | 'entrepot';
type Sort = 'order' | 'name' | 'weight' | 'rarity' | 'value';

const RARITY_RANK: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  '': 5,
};

interface Props {
  doc: ArpenteurDoc;
  rights: Rights;
  update: UpdateFn;
  initial?: Which;
  /** Le MJ ouvre l'entrepôt partout, même sans amarrage. */
  isGM?: boolean;
}

function typeColor(type: string): string {
  const k = foldKey(type);
  if (k.startsWith('consommable')) return '#9fd27a';
  if (k.startsWith('arme')) return '#e2614d';
  if (k.startsWith('tresor')) return '#e8bd4f';
  if (k.startsWith('babiole')) return '#7fb5e6';
  if (!k) return '#8a8172';
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ['#d88ad8', '#5fc9b8', '#e2876b', '#a7a0e8'][h % 4];
}

export function InventoryPanel({
  doc,
  rights,
  update,
  initial = 'hold',
  isGM = false,
}: Props) {
  const [which, setWhich] = useState<Which>(initial);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<Sort>('order');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const inv = doc[which];
  const other: Which = which === 'hold' ? 'entrepot' : 'hold';
  // L'entrepôt ne s'ouvre qu'amarré dans une ville (n'importe laquelle).
  const travel = useTravel(doc.map.travel);
  const access = entrepotAccess(doc.map, !!travel);
  const entrepotOpen = isGM || access.open;
  const allowed = (w: Which) => rights[w] && (w === 'hold' || entrepotOpen);
  const can = allowed(which);
  const canMove = allowed('hold') && allowed('entrepot');
  const totals = inventoryTotals(inv.items);
  const types = useMemo(
    () => [...new Set(inv.items.map((i) => i.type).filter(Boolean))],
    [inv.items]
  );

  const save = (next: Inventory, log?: string) =>
    update(which, next, { log, immediate: !!log });

  const list = useMemo(() => {
    const q = foldKey(query);
    const out = inv.items.filter(
      (i) =>
        (!type || i.type === type) &&
        (!q || foldKey(`${i.name} ${i.effect} ${i.type}`).includes(q))
    );
    const by: Record<Sort, (a: Item, b: Item) => number> = {
      order: () => 0,
      name: (a, b) => a.name.localeCompare(b.name, 'fr'),
      weight: (a, b) => b.weight - a.weight,
      rarity: (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity],
      value: (a, b) =>
        (parsePrice(b.price) ?? -1) - (parsePrice(a.price) ?? -1),
    };
    return sort === 'order' ? out : [...out].sort(by[sort]);
  }, [inv.items, query, type, sort]);

  const move = (it: Item) => {
    const target = doc[other];
    update(
      which,
      { ...inv, items: inv.items.filter((x) => x.id !== it.id) },
      { immediate: true }
    );
    update(
      other,
      { ...target, items: [...target.items, it] },
      { log: `${it.name} → ${target.title}`, immediate: true }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {(['hold', 'entrepot'] as Which[]).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={which === w}
            onClick={() => setWhich(w)}
            className="arp-tab"
          >
            {doc[w].title}{' '}
            <span className="opacity-70">({doc[w].items.length})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Poids total"
          value={`${totals.weight}${inv.capacity ? ` / ${inv.capacity}` : ''}`}
        >
          {inv.capacity > 0 && (
            <Meter
              value={totals.weight}
              max={inv.capacity}
              color={totals.weight > inv.capacity ? '#d9573f' : undefined}
            />
          )}
        </Tile>
        <Tile label="Valeur estimée" value={formatCoins(totals.value)} />
        <Tile label="Coupons" value={String(totals.coupons)} />
        <Tile label="Objets" value={String(inv.items.length)} />
      </div>

      <Card
        title={inv.title}
        subtitle={inv.description || undefined}
        actions={
          can && (
            <Btn
              variant="primary"
              onClick={() =>
                setEditing({
                  id: newId(),
                  type: types[0] ?? '',
                  name: '',
                  effect: '',
                  weight: 0,
                  rarity: '',
                  price: '',
                  coupons: null,
                })
              }
            >
              Ajouter un objet
            </Btn>
          )
        }
      >
        {which === 'entrepot' && (
          <p
            className={`text-xs mb-2 ${access.open ? 'text-fantasy-muted' : 'text-amber-200/90'}`}
          >
            {access.open
              ? `📦 Entrepôt acheté à ${access.cityName} : accessible depuis toutes les villes.`
              : isGM
                ? `${access.reason} (Le MJ peut passer outre.)`
                : access.reason}
          </p>
        )}
        {!rights[which] && <ReadOnlyHint doc={doc} section={which} />}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="arp-input flex-1 min-w-[10rem]"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="arp-input"
          >
            <option value="order">Ordre d'origine</option>
            <option value="name">Nom</option>
            <option value="weight">Poids</option>
            <option value="rarity">Rareté</option>
            <option value="value">Valeur</option>
          </select>
        </div>
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setType('')}
              className={`text-xs px-2.5 py-1 rounded-full border ${!type ? 'border-fantasy-accent text-fantasy-accent' : 'border-fantasy-border-soft text-fantasy-muted'}`}
            >
              Tout
            </button>
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t === type ? '' : t)}
                className={`text-xs px-2.5 py-1 rounded-full border ${type === t ? 'border-fantasy-accent text-fantasy-accent' : 'border-fantasy-border-soft text-fantasy-muted'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <p className="text-sm text-fantasy-muted py-6 text-center">
            {inv.items.length ? 'Aucun objet ne correspond.' : 'Vide.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-fantasy-border-soft/60">
            {list.map((it) => {
              const expanded = open === it.id;
              const color = typeColor(it.type);
              return (
                <li key={it.id} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <span
                      className="shrink-0 mt-0.5 w-9 h-9 rounded-lg grid place-items-center text-sm font-heading font-bold"
                      style={{
                        background: `${color}22`,
                        color,
                        border: `1px solid ${color}55`,
                      }}
                      title={it.type}
                    >
                      {(it.type || '?')[0].toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setOpen(expanded ? null : it.id)}
                    >
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] text-fantasy-text">
                          {it.name}
                        </span>
                        {it.rarity && (
                          <span
                            className="text-[10px] font-bold px-1.5 rounded"
                            style={{
                              background: `${RARITY_COLORS[it.rarity]}26`,
                              color: RARITY_COLORS[it.rarity],
                            }}
                          >
                            {it.rarity}
                          </span>
                        )}
                      </span>
                      {it.effect && (
                        <span
                          className={`block text-xs text-fantasy-muted mt-0.5 ${expanded ? '' : 'line-clamp-1'}`}
                        >
                          {it.effect}
                        </span>
                      )}
                    </button>
                    <div className="shrink-0 grid grid-cols-3 gap-3 text-right text-xs tabular-nums">
                      <span title="Poids">
                        <span className="block text-[10px] text-fantasy-muted">
                          poids
                        </span>
                        {it.weight}
                      </span>
                      <span
                        title={
                          parsePrice(it.price) != null
                            ? `${parsePrice(it.price)} PC`
                            : undefined
                        }
                      >
                        <span className="block text-[10px] text-fantasy-muted">
                          prix
                        </span>
                        {it.price || '—'}
                      </span>
                      <span>
                        <span className="block text-[10px] text-fantasy-muted">
                          coupons
                        </span>
                        {it.coupons ?? '—'}
                      </span>
                    </div>
                  </div>
                  {expanded && (can || canMove) && (
                    <div className="mt-2 ml-12 flex flex-wrap gap-2">
                      {can && (
                        <Btn onClick={() => setEditing(it)}>Modifier</Btn>
                      )}
                      {can && (
                        <Btn
                          onClick={() =>
                            save({
                              ...inv,
                              items: [...inv.items, { ...it, id: newId() }],
                            })
                          }
                          variant="ghost"
                        >
                          Dupliquer
                        </Btn>
                      )}
                      {canMove && (
                        <Btn onClick={() => move(it)}>
                          Déplacer vers {doc[other].title}
                        </Btn>
                      )}
                      {can && (
                        <Btn
                          variant="ghost"
                          className="text-red-300"
                          onClick={() =>
                            save(
                              {
                                ...inv,
                                items: inv.items.filter((x) => x.id !== it.id),
                              },
                              `${it.name} retiré de ${inv.title}`
                            )
                          }
                        >
                          Supprimer
                        </Btn>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {can && (
        <Card
          title="Réglages"
          subtitle={`${inv.title} : nom, description, capacité`}
        >
          <div className="grid sm:grid-cols-3 gap-3">
            <TextField
              label="Nom"
              value={inv.title}
              onCommit={(v) => save({ ...inv, title: v })}
            />
            <NumberField
              label="Capacité (poids, 0 = sans limite)"
              value={inv.capacity}
              min={0}
              onCommit={(v) => save({ ...inv, capacity: v })}
            />
            <TextField
              label="Description"
              value={inv.description}
              multiline
              onCommit={(v) => save({ ...inv, description: v })}
              className="sm:col-span-3"
            />
          </div>
        </Card>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          types={types}
          isNew={!inv.items.some((x) => x.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(it) => {
            const exists = inv.items.some((x) => x.id === it.id);
            save(
              {
                ...inv,
                items: exists
                  ? inv.items.map((x) => (x.id === it.id ? it : x))
                  : [...inv.items, it],
              },
              exists ? undefined : `${it.name} ajouté à ${inv.title}`
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="arp-card px-4 py-3.5 flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.12em] text-fantasy-muted">
        {label}
      </span>
      <span className="font-heading text-xl text-fantasy-text">{value}</span>
      {children}
    </div>
  );
}

function ItemEditor({
  item,
  types,
  isNew,
  onClose,
  onSave,
}: {
  item: Item;
  types: string[];
  isNew: boolean;
  onClose: () => void;
  onSave: (it: Item) => void;
}) {
  const [it, setIt] = useState<Item>(item);
  const [weight, setWeight] = useState(String(item.weight));
  const [coupons, setCoupons] = useState(
    item.coupons == null ? '' : String(item.coupons)
  );
  const set = (p: Partial<Item>) => setIt((x) => ({ ...x, ...p }));
  const suggestion = suggestCoupons(it.price);
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'Nouvel objet' : it.name || 'Objet'}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            disabled={!it.name.trim()}
            onClick={() =>
              onSave({
                ...it,
                name: it.name.trim(),
                weight: Math.max(0, parseFloat(weight.replace(',', '.')) || 0),
                coupons:
                  coupons.trim() === ''
                    ? null
                    : Math.max(0, parseInt(coupons, 10) || 0),
              })
            }
          >
            {isNew ? 'Ajouter' : 'Enregistrer'}
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <LiveField
          label="Type"
          value={it.type}
          list="arp-item-types"
          onChange={(v) => set({ type: v })}
          placeholder="Consommable"
        />
        <datalist id="arp-item-types">
          {['Consommable', 'Babiole', 'Arme', 'Trésor', ...types]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((t) => (
              <option key={t} value={t} />
            ))}
        </datalist>
        <SelectField
          label="Rareté"
          value={it.rarity}
          options={[
            { id: '', label: '—' },
            ...(['S', 'A', 'B', 'C', 'D'] as const).map((r) => ({
              id: r,
              label: r,
            })),
          ]}
          onChange={(v) => set({ rarity: v as Item['rarity'] })}
        />
        <LiveField
          label="Nom"
          value={it.name}
          onChange={(v) => set({ name: v })}
          className="col-span-2"
        />
        <LiveField
          label="Effet"
          value={it.effect}
          multiline
          onChange={(v) => set({ effect: v })}
          className="col-span-2"
        />
        <LiveField
          label="Poids (total)"
          type="number"
          value={weight}
          onChange={setWeight}
        />
        <LiveField
          label="Prix (total)"
          value={it.price}
          onChange={(v) => set({ price: v })}
          placeholder="3 PA, 18 PC…"
        />
        <div className="col-span-2 flex items-end gap-2">
          <LiveField
            label="Coupons"
            type="number"
            value={coupons}
            onChange={setCoupons}
            className="flex-1"
          />
          {suggestion != null && String(suggestion) !== coupons && (
            <Btn
              variant="ghost"
              onClick={() => setCoupons(String(suggestion))}
              title="Moitié du prix en PC, arrondie au-dessus"
            >
              Suggérer : {suggestion}
            </Btn>
          )}
        </div>
      </div>
    </Dialog>
  );
}
