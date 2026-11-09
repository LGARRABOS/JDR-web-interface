import { useEffect, useState } from 'react';
import type { RollDisplay } from '../../realtime/gameStore';
import { currentSides, withDie } from './dice';

const DICE = [4, 6, 8, 10, 12, 20, 100];

interface DiceBarProps {
  isGM: boolean;
  onRoll: (expression: string, hidden: boolean) => void;
  error: string | null;
  lastRoll: RollDisplay | null;
  /** Décale la barre vers la gauche quand le panneau latéral est ouvert. */
  panelOpen: boolean;
}

/** Barre de dés flottante en bas de la carte, avec le dernier résultat au-dessus. */
export function DiceBar({
  isGM,
  onRoll,
  error,
  lastRoll,
  panelOpen,
}: DiceBarProps) {
  const [expr, setExpr] = useState('1d20');
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState<RollDisplay | null>(null);

  // Le dernier jet s'affiche quelques secondes au-dessus de la barre.
  useEffect(() => {
    if (!lastRoll) return;
    setToast(lastRoll);
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [lastRoll]);

  const roll = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = expr.trim();
    if (v) onRoll(v, isGM && hidden);
  };
  const sides = currentSides(expr);

  return (
    <div
      className="absolute bottom-4 z-20 flex flex-col items-center gap-2 transition-[left] duration-200"
      style={{
        left: panelOpen ? 'calc(50% - 188px)' : '50%',
        transform: 'translateX(-50%)',
      }}
    >
      {error && (
        <div
          role="alert"
          className="glass rounded-xl px-4 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      {toast && !error && (
        <div
          key={toast.key}
          role="status"
          className="glass rounded-xl px-4 py-2 flex items-center gap-3 animate-[fadeIn_150ms_ease-out]"
        >
          <span className="font-heading font-bold text-2xl text-fantasy-accent-hover tabular-nums">
            {toast.result}
          </span>
          <span className="text-sm">
            <strong>{toast.displayName ?? 'Joueur'}</strong>
            <span className="text-fantasy-muted"> · {toast.expression}</span>
          </span>
        </div>
      )}
      <form
        onSubmit={roll}
        className="glass rounded-2xl p-1.5 flex items-center gap-1.5"
      >
        {DICE.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setExpr((cur) => withDie(cur, d))}
            onDoubleClick={() => onRoll(withDie(expr, d), isGM && hidden)}
            title={`d${d} — double-clic pour lancer directement`}
            aria-pressed={sides === d}
            className={`h-11 ${d === 100 ? 'w-12' : 'w-11'} rounded-lg text-sm font-bold ${
              sides === d
                ? 'bg-fantasy-accent text-fantasy-bg'
                : 'bg-fantasy-surface text-fantasy-text hover:bg-fantasy-surface-hover'
            }`}
          >
            d{d}
          </button>
        ))}
        <div className="w-px h-7 mx-1 bg-fantasy-border-soft" />
        <label htmlFor="dice-expr" className="sr-only">
          Formule de dés
        </label>
        <input
          id="dice-expr"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="ex. 2d6+3"
          autoComplete="off"
          className="w-28 h-11 px-3 rounded-lg bg-fantasy-bg border border-fantasy-border-soft text-[15px] text-fantasy-text placeholder:text-fantasy-muted-soft focus:outline-none focus:border-fantasy-accent"
        />
        {isGM && (
          <label className="flex items-center gap-1.5 px-2 text-sm text-fantasy-text-soft cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="w-4 h-4 accent-fantasy-accent"
            />
            Caché
          </label>
        )}
        <button
          type="submit"
          className="h-11 px-5 rounded-lg bg-fantasy-accent text-fantasy-bg font-bold hover:bg-fantasy-accent-hover"
        >
          Lancer
        </button>
      </form>
    </div>
  );
}
