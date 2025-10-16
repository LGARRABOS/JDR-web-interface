import { useState } from 'react';

const DICE_REGEX = /^(\d*)d(\d+)([+-]\d+)?$/i;

const parseExpression = (expression) => {
  const trimmed = expression.trim().replace(/^\/roll\s+/i, '');
  const match = trimmed.match(DICE_REGEX);
  if (!match) {
    throw new Error('Expression invalide');
  }
  return {
    rolls: Number(match[1] || 1),
    faces: Number(match[2]),
    modifier: match[3] ? Number(match[3]) : 0
  };
};

const rollLocalDice = (expression, rng = Math.random) => {
  const { rolls, faces, modifier } = parseExpression(expression);
  const results = Array.from({ length: rolls }, () => Math.floor(rng() * faces) + 1);
  const total = results.reduce((acc, value) => acc + value, modifier);
  return { expression, results, modifier, total };
};

const DiceRoller = ({ onRoll, roller = Math.random, log = [] }) => {
  const [expression, setExpression] = useState('/roll 1d20');
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setError(null);
      const result = rollLocalDice(expression, roller);
      if (onRoll) {
        await onRoll(expression, result);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          className="flex-1 rounded bg-slate-900 px-3 py-2 focus:outline-none"
          placeholder="/roll 1d20+3"
        />
        <button
          type="submit"
          className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-900 transition hover:bg-emerald-400"
        >
          Lancer
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <ul className="mt-3 flex max-h-40 flex-col gap-1 overflow-auto text-sm text-slate-300">
        {log.map((entry, index) => (
          <li key={`${entry.expression}-${index}`} className="rounded bg-slate-900/50 px-2 py-1">
            <span className="font-semibold text-emerald-300">{entry.actor}</span> → {entry.expression} ={' '}
            <span className="font-mono">{entry.result.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export { parseExpression, rollLocalDice };
export default DiceRoller;
