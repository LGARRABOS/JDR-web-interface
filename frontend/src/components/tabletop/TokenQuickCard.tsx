import { useEffect, useState } from 'react';
import type { TokenUpdate } from '../../api/client';
import type { Token } from '../../types/game';
import { Close, Eye, EyeOff, Scroll, Trash } from './icons';

interface TokenQuickCardProps {
  token: Token;
  displayName: string;
  isGM: boolean;
  /** Le joueur peut modifier les PV/mana de son propre personnage. */
  canEdit: boolean;
  onUpdate: (id: number, data: TokenUpdate) => void;
  onDelete: (id: number) => void;
  onOpenSheet?: (token: Token) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  PJ: 'Personnage',
  PNJ: 'Ennemi',
  MORT: 'Vaincu',
};

function Gauge({
  label,
  value,
  max,
  color,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[13px]">
        <span className="text-fantasy-text-soft">{label}</span>
        <span className="font-bold tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {editable && (
          <button
            type="button"
            aria-label={`Retirer 1 ${label}`}
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-8 h-8 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-lg leading-none"
          >
            −
          </button>
        )}
        <div className="flex-1 h-2 rounded bg-fantasy-input-soft overflow-hidden">
          <div
            className="h-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        {editable && (
          <button
            type="button"
            aria-label={`Ajouter 1 ${label}`}
            onClick={() => onChange(Math.min(max, value + 1))}
            className="w-8 h-8 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-lg leading-none"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

/** Fiche rapide affichée au-dessus d'un jeton sélectionné. */
export function TokenQuickCard({
  token: t,
  displayName,
  isGM,
  canEdit,
  onUpdate,
  onDelete,
  onOpenSheet,
  onClose,
}: TokenQuickCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [t.id]);

  const hasHp = t.maxHp != null && t.maxHp > 0;
  const hasMana = t.maxMana != null && t.maxMana > 0;
  const statuses = t.statusEffects ?? [];
  const canOpenSheet =
    !!onOpenSheet &&
    (t.kind === 'PNJ' || t.kind === 'MORT') &&
    t.elementId != null;

  // Le serveur passe automatiquement un ennemi à 0 PV en « vaincu ».
  const setHp = (hp: number) => onUpdate(t.id, { hp });

  return (
    <section
      aria-label={`Jeton ${displayName}`}
      className="glass rounded-2xl p-3.5 w-[268px] flex flex-col gap-3 text-fantasy-text cursor-default"
    >
      <div className="flex items-center gap-2.5">
        {t.iconUrl ? (
          <img
            src={t.iconUrl}
            alt=""
            className="w-10 h-10 rounded-full object-cover border-2 border-fantasy-accent"
          />
        ) : (
          <span
            className="w-10 h-10 rounded-full border-2 border-fantasy-accent"
            style={{ backgroundColor: t.color }}
          />
        )}
        <div className="flex-1 min-w-0 leading-tight">
          <div className="font-heading font-semibold truncate">
            {displayName}
          </div>
          <div className="text-[13px] text-fantasy-muted">
            {KIND_LABEL[t.kind] ?? t.kind}
            {isGM &&
              (t.visibleToPlayers ? ' · visible' : ' · caché aux joueurs')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn !w-8 !h-8"
          aria-label="Fermer"
        >
          <Close size={16} />
        </button>
      </div>

      {hasHp && (
        <Gauge
          label="PV"
          value={t.hp ?? t.maxHp ?? 0}
          max={t.maxHp ?? 0}
          color="#c75c5c"
          editable={canEdit}
          onChange={setHp}
        />
      )}
      {hasMana && (
        <Gauge
          label="Mana"
          value={t.mana ?? t.maxMana ?? 0}
          max={t.maxMana ?? 0}
          color="#5b8fd6"
          editable={canEdit}
          onChange={(mana) => onUpdate(t.id, { mana })}
        />
      )}

      {statuses.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {statuses.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              title={s.effect}
              className="px-2.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 text-[13px]"
            >
              {s.name}
              {s.turnsRemaining > 0 &&
                ` · ${s.turnsRemaining} tour${s.turnsRemaining > 1 ? 's' : ''}`}
            </li>
          ))}
        </ul>
      )}

      {(isGM || canOpenSheet) && (
        <div className="flex gap-1.5">
          {canOpenSheet && (
            <button
              type="button"
              onClick={() => onOpenSheet?.(t)}
              className="flex-1 h-9 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-sm flex items-center justify-center gap-1.5"
            >
              <Scroll size={15} /> Fiche
            </button>
          )}
          {isGM && (
            <button
              type="button"
              onClick={() =>
                onUpdate(t.id, { visibleToPlayers: !t.visibleToPlayers })
              }
              className="flex-1 h-9 rounded-lg bg-fantasy-input-soft hover:bg-fantasy-input-hover text-sm flex items-center justify-center gap-1.5"
            >
              {t.visibleToPlayers ? <EyeOff size={15} /> : <Eye size={15} />}
              {t.visibleToPlayers ? 'Cacher' : 'Montrer'}
            </button>
          )}
          {isGM && t.kind !== 'PJ' && (
            <button
              type="button"
              onClick={() =>
                confirmDelete ? onDelete(t.id) : setConfirmDelete(true)
              }
              aria-label={
                confirmDelete
                  ? 'Confirmer la suppression'
                  : 'Supprimer le jeton'
              }
              title={
                confirmDelete ? 'Cliquer à nouveau pour supprimer' : 'Supprimer'
              }
              className={`h-9 rounded-lg text-sm flex items-center justify-center gap-1.5 ${
                confirmDelete
                  ? 'px-3 bg-fantasy-danger text-fantasy-text'
                  : 'w-9 bg-red-400/10 text-red-300 hover:bg-red-400/20'
              }`}
            >
              <Trash size={15} />
              {confirmDelete && 'Supprimer ?'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
