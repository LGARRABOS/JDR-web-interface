import { useEffect, useState } from 'react';

interface DiceRollOverlayProps {
  roll: {
    expression: string;
    result: number;
    displayName?: string;
  } | null;
  durationMs?: number;
  /** Si true, rend uniquement le contenu (sans wrapper fixed). Le parent doit gérer le positionnement. */
  inline?: boolean;
}

function getD20Color(result: number): string {
  if (result <= 0) return 'rgb(127,127,127)';
  const t = Math.min(1, Math.max(0, (result - 1) / 19));
  const r = Math.round(220 - t * 120);
  const g = Math.round(60 + t * 160);
  const b = Math.round(60 + t * 60);
  return `rgb(${r},${g},${b})`;
}

function getModifierFromExpression(expr: string): number {
  const m = expr.trim().match(/d\d+([+-]\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

function getRollColor(expression: string, result: number): string {
  const lower = expression.toLowerCase();
  if (lower.includes('d20')) {
    return getD20Color(result);
  }
  return 'rgb(201, 162, 39)'; // fantasy-accent
}

export function DiceRollOverlay({
  roll,
  durationMs = 2500,
  inline = false,
}: DiceRollOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [displayRoll, setDisplayRoll] = useState<typeof roll>(null);

  useEffect(() => {
    if (!roll) return;
    setDisplayRoll(roll);
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setDisplayRoll(null), 300);
    }, durationMs);
    return () => clearTimeout(t);
  }, [roll, durationMs]);

  if (!displayRoll) return null;

  const accentColor = getRollColor(displayRoll.expression, displayRoll.result);
  const modifier = getModifierFromExpression(displayRoll.expression);
  const rawResult =
    modifier !== 0 ? displayRoll.result - modifier : null;

  const content = (
    <div
      className={`transition-all duration-300 ease-out ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
    >
        <div
          className="relative rounded-2xl px-12 py-8 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,0,0,0.2)] overflow-hidden"
          style={{
            background:
              'linear-gradient(145deg, rgba(45,38,32,0.98) 0%, rgba(26,22,18,0.98) 100%)',
            borderLeft: `4px solid ${accentColor}`,
            borderRight: `4px solid ${accentColor}`,
            borderTop: '1px solid rgba(201,162,39,0.3)',
            borderBottom: '1px solid rgba(201,162,39,0.3)',
          }}
        >
          <p className="text-fantasy-muted-soft text-sm mb-3 text-center">
            {displayRoll.displayName ?? 'Lancer'} a lancé
          </p>
          <p
            className="text-[5rem] font-bold text-fantasy-accent leading-none text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {displayRoll.result}
          </p>
          {rawResult !== null && (
            <p className="text-lg text-fantasy-muted-soft text-center mt-1">
              Dé brut : {rawResult}
            </p>
          )}
          <div className="mt-4 flex justify-center">
            <span
              className="px-3 py-1 rounded-lg text-sm font-medium bg-fantasy-input-soft text-fantasy-text-soft border border-fantasy-border-soft"
              style={{ borderColor: `${accentColor}40` }}
            >
              {displayRoll.expression}
            </span>
          </div>
        </div>
    </div>
  );

  if (inline) {
    return <div aria-live="polite">{content}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      aria-live="polite"
    >
      {content}
    </div>
  );
}
