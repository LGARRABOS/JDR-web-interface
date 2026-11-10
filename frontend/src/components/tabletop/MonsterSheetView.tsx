import { useEffect } from 'react';
import type { GameElementFull } from '../MonsterEditorModal';
import { Close } from './icons';

interface MonsterSheetViewProps {
  /** Fiche déjà filtrée par le serveur : seules les rubriques révélées par le MJ sont présentes. */
  element: GameElementFull;
  onClose: () => void;
}

function Section({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-fantasy-muted-soft mb-1">
        {title}
      </h3>
      <p className="text-sm text-fantasy-text-soft whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

/** Fiche d'un monstre vaincu, vue par un joueur (lecture seule). */
export function MonsterSheetView({
  element: e,
  onClose,
}: MonsterSheetViewProps) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasStats = e.maxHp != null || e.maxMana != null;
  const empty =
    !e.description && !e.uniqueTrait && !e.loot && !hasStats && !e.imageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label={`Fiche de ${e.name}`}
        className="glass rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-4 flex flex-col gap-4 text-fantasy-text"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {e.imageUrl ? (
            <img
              src={e.imageUrl}
              alt=""
              className="w-14 h-14 rounded-full object-cover border-2 border-fantasy-accent"
              style={{
                objectPosition: `${e.iconPosX ?? 50}% ${e.iconPosY ?? 50}%`,
              }}
            />
          ) : (
            <span className="w-14 h-14 rounded-full border-2 border-fantasy-border-soft bg-fantasy-input-soft flex items-center justify-center text-2xl">
              💀
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg font-semibold truncate">
              {e.name}
            </h2>
            <p className="text-[13px] text-fantasy-muted">Vaincu</p>
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

        {hasStats && (
          <div className="flex gap-2 text-sm">
            {e.maxHp != null && (
              <span className="px-2.5 py-1 rounded-lg bg-fantasy-input-soft">
                PV max : <b className="tabular-nums">{e.maxHp}</b>
              </span>
            )}
            {e.maxMana != null && e.maxMana > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-fantasy-input-soft">
                Mana max : <b className="tabular-nums">{e.maxMana}</b>
              </span>
            )}
          </div>
        )}
        <Section title="Description" text={e.description} />
        <Section title="Caractéristique unique" text={e.uniqueTrait} />
        <Section title="Butin" text={e.loot} />
        {empty && (
          <p className="text-sm text-fantasy-muted-soft italic">
            Le MJ n&apos;a encore rien révélé sur cette créature.
          </p>
        )}
      </section>
    </div>
  );
}
