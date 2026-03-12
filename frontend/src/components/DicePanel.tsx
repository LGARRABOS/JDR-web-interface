import { useState } from 'react';

interface DicePanelProps {
  gameId: number;
  onRoll: (expression: string, hidden?: boolean) => void;
  rollError?: string | null;
  lastRoll?: {
    expression: string;
    result: number;
    displayName?: string;
  } | null;
  lastRollHidden?: {
    expression: string;
    result: number;
    displayName?: string;
  } | null;
  isGemma?: boolean;
  isGM?: boolean;
}

const DICE_TYPES = [
  { label: 'd20', expr: '1d20' },
  { label: 'd10', expr: '1d10' },
  { label: 'd6', expr: '1d6' },
  { label: 'd100', expr: '1d100' },
] as const;

function buildExpression(base: string, modifier: number): string {
  if (modifier === 0) return base;
  return modifier > 0 ? `${base}+${modifier}` : `${base}${modifier}`;
}

function getModifierFromExpression(expr: string): number {
  const m = expr.trim().match(/d\d+([+-]\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

function getD20BorderColor(expression: string, result: number): string {
  const lower = expression.toLowerCase();
  if (!lower.includes('d20')) return 'rgba(201,162,39,0.4)';
  if (result <= 0) return 'rgb(127,127,127)';
  const t = Math.min(1, Math.max(0, (result - 1) / 19));
  const r = Math.round(220 - t * 120);
  const g = Math.round(60 + t * 160);
  const b = Math.round(60 + t * 60);
  return `rgb(${r},${g},${b})`;
}

function DiceRollResultCard({
  roll,
}: {
  roll: { expression: string; result: number; displayName?: string };
}) {
  const borderColor = getD20BorderColor(roll.expression, roll.result);
  const modifier = getModifierFromExpression(roll.expression);
  const rawResult = modifier !== 0 ? roll.result - modifier : null;
  return (
    <div
      className="mt-3 rounded-lg bg-fantasy-input-soft border px-3 py-3"
      style={{ borderColor }}
    >
      <p className="text-xs text-fantasy-muted-soft mb-1">
        {roll.displayName ?? 'Lancer'}
      </p>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-fantasy-accent tabular-nums">
            {roll.result}
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-fantasy-surface text-fantasy-text-soft">
            {roll.expression}
          </span>
        </div>
        {rawResult !== null && (
          <p className="text-xs text-fantasy-muted-soft">
            Dé brut : {rawResult}
          </p>
        )}
      </div>
    </div>
  );
}

export function DicePanel({
  gameId: _gameId,
  onRoll,
  rollError,
  lastRoll,
  lastRollHidden,
  isGemma = false,
  isGM = false,
}: DicePanelProps) {
  const [expr, setExpr] = useState('1d20');
  const [selectedDice, setSelectedDice] = useState('1d20');
  const [modifier, setModifier] = useState(0);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'public' | 'hidden'>('public');

  const currentExpr = advancedMode
    ? expr
    : buildExpression(selectedDice, modifier);

  const handleSubmit = (e: React.FormEvent, hidden = false) => {
    e.preventDefault();
    const toRoll = currentExpr.trim();
    if (toRoll) {
      onRoll(toRoll, hidden);
    }
  };

  const renderRollForm = (hidden: boolean) => (
    <form
      onSubmit={(e) => handleSubmit(e, hidden)}
      className="flex flex-col gap-2"
    >
      {isGemma && !advancedMode ? (
        <>
          <div className="flex flex-wrap gap-1">
            {DICE_TYPES.map(({ label, expr: e }) => (
              <button
                key={e}
                type="button"
                onClick={() => setSelectedDice(e)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  selectedDice === e
                    ? 'bg-fantasy-accent text-fantasy-bg'
                    : 'bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-fantasy-text-soft'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-fantasy-muted-soft">
              Modificateur:
            </label>
            <input
              type="number"
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value, 10) || 0)}
              className="w-16 rounded bg-fantasy-input-soft px-2 py-1 text-sm text-fantasy-text-soft border border-fantasy-border-soft"
            />
          </div>
          <button
            type="button"
            onClick={() => setAdvancedMode(true)}
            className="text-xs text-fantasy-muted-soft hover:text-fantasy-text-soft"
          >
            Mode avancé (ex: 2d6+3)
          </button>
        </>
      ) : (
        <input
          type="text"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="2d6+3"
          className="flex-1 rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft"
        />
      )}
      {isGemma && advancedMode && (
        <button
          type="button"
          onClick={() => setAdvancedMode(false)}
          className="text-xs text-fantasy-muted-soft hover:text-fantasy-text-soft"
        >
          Retour aux dés rapides
        </button>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm"
        >
          Lancer
        </button>
      </div>
      {rollError && (
        <p className="mt-2 text-fantasy-error text-xs">{rollError}</p>
      )}
    </form>
  );

  const showTabs = isGemma && isGM;

  return (
    <div className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft p-4">
      <h3 className="font-semibold font-heading mb-2 text-fantasy-text-soft">
        Lancer de dés
      </h3>
      {showTabs ? (
        <>
          <div className="flex gap-2 mb-2 border-b border-fantasy-border-soft">
            <button
              type="button"
              onClick={() => setActiveTab('public')}
              className={`px-3 py-1.5 text-sm font-medium ${
                activeTab === 'public'
                  ? 'border-b-2 border-fantasy-accent text-fantasy-accent'
                  : 'text-fantasy-muted-soft hover:text-fantasy-text-soft'
              }`}
            >
              Dés
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hidden')}
              className={`px-3 py-1.5 text-sm font-medium ${
                activeTab === 'hidden'
                  ? 'border-b-2 border-fantasy-accent text-fantasy-accent'
                  : 'text-fantasy-muted-soft hover:text-fantasy-text-soft'
              }`}
            >
              Dés MJ (cachés)
            </button>
          </div>
          {activeTab === 'public' ? (
            <>
              {renderRollForm(false)}
              {lastRoll && <DiceRollResultCard roll={lastRoll} />}
            </>
          ) : (
            <>
              {renderRollForm(true)}
              {lastRollHidden && <DiceRollResultCard roll={lastRollHidden} />}
            </>
          )}
        </>
      ) : (
        <>
          {renderRollForm(false)}
          {lastRoll && <DiceRollResultCard roll={lastRoll} />}
        </>
      )}
    </div>
  );
}
