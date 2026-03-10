import { useState } from 'react';

interface DicePanelProps {
  gameId: number;
  onRoll: (expression: string) => void;
  lastRoll?: {
    expression: string;
    result: number;
    displayName?: string;
  } | null;
}

export function DicePanel({
  gameId: _gameId,
  onRoll,
  lastRoll,
}: DicePanelProps) {
  const [expr, setExpr] = useState('1d20');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (expr.trim()) {
      onRoll(expr.trim());
    }
  };

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="font-semibold font-heading mb-2 text-fantasy-text-soft">Lancer de dés</h3>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="2d6+3"
          className="flex-1 rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm"
        >
          Lancer
        </button>
      </form>
      {lastRoll && (
        <p className="mt-2 text-sm text-fantasy-muted-soft">
          {lastRoll.displayName}: {lastRoll.expression} = {lastRoll.result}
        </p>
      )}
    </div>
  );
}
