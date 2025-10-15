import React, { useEffect, useState } from 'react';
import { rollDiceApi } from '../services/api.js';

const DiceRoller = ({ diceSocket }) => {
  const [command, setCommand] = useState('/roll 1d20');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!diceSocket) return;

    const handleRolled = (payload) => {
      setHistory((prev) => [payload, ...prev].slice(0, 20));
    };

    diceSocket.on('rolled', handleRolled);
    return () => {
      diceSocket.off('rolled', handleRolled);
    };
  }, [diceSocket]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!command.trim()) return;

    try {
      const { data } = await rollDiceApi({ command });
      diceSocket?.emit('roll', command);
      setHistory((prev) => [
        { command, result: data, author: 'moi' },
        ...prev,
      ]);
    } catch (error) {
      console.error('Dice roll error', error);
      alert('Erreur lors du lancer de dés');
    }
  };

  return (
    <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">Lancer de dés</h2>
      <form
        onSubmit={handleSubmit}
        className="flex gap-3"
      >
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          className="flex-1 rounded bg-slate-900 border border-slate-700 px-3 py-2"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-accent rounded text-white"
        >
          Lancer
        </button>
      </form>
      <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
        {history.map((item, index) => (
          <li
            key={index}
            className="bg-slate-900/60 border border-slate-800 rounded px-3 py-2"
          >
            <span className="text-accent font-medium">{item.author}</span> :{' '}
            <span className="text-slate-200">{item.command}</span>
            <div className="text-slate-400 text-xs">{item.result.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DiceRoller;
