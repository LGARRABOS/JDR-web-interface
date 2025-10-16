import { useEffect, useState } from 'react';

const CharacterCard = ({ character, isEditable = false, onUpdate }) => {
  const [draft, setDraft] = useState(character);

  useEffect(() => {
    setDraft(character);
  }, [character]);

  const handleChange = (field, parser = (value) => value) => (event) => {
    const value = parser(event.target.value);
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleBlur = async () => {
    if (onUpdate) {
      await onUpdate(draft);
    }
  };

  const renderStatField = (field, label) => (
    <label
      key={field}
      className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-3 text-sm shadow-inner"
    >
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {isEditable ? (
        <input
          type="number"
          value={draft[field]}
          onChange={handleChange(field, parseNumber)}
          onBlur={handleBlur}
          className="rounded bg-slate-950 px-2 py-1 text-base font-semibold text-emerald-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      ) : (
        <span className="text-lg font-semibold text-emerald-200">{draft[field]}</span>
      )}
    </label>
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow">
      <div className="flex items-center gap-3">
        {draft.image ? (
          <img src={draft.image} alt={draft.name} className="h-16 w-16 rounded object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-700 text-xl font-bold text-emerald-200">
            {draft.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 space-y-2">
          {isEditable ? (
            <input
              value={draft.name}
              onChange={handleChange('name')}
              onBlur={handleBlur}
              className="w-full rounded bg-slate-900 px-3 py-2 text-lg font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          ) : (
            <h3 className="text-lg font-semibold text-white">{draft.name}</h3>
          )}
          <p className="text-sm text-slate-400">
            PV : {draft.hp} — Mana : {draft.mana} — Vitesse : {draft.speed}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {renderStatField('hp', 'Points de vie')}
        {renderStatField('mana', 'Mana')}
        {renderStatField('speed', 'Vitesse')}
      </div>
      {isEditable && (
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span>PV</span>
            <input
              type="number"
              value={draft.hp}
              onChange={handleChange('hp', parseNumber)}
              onBlur={handleBlur}
              className="rounded bg-slate-900 px-2 py-1 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Mana</span>
            <input
              type="number"
              value={draft.mana}
              onChange={handleChange('mana', parseNumber)}
              onBlur={handleBlur}
              className="rounded bg-slate-900 px-2 py-1 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Vitesse</span>
            <input
              type="number"
              value={draft.speed}
              onChange={handleChange('speed', parseNumber)}
              onBlur={handleBlur}
              className="rounded bg-slate-900 px-2 py-1 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span>Image de profil (URL)</span>
            <input
              type="text"
              value={draft.image || ''}
              onChange={handleChange('image')}
              onBlur={handleBlur}
              placeholder="https://..."
              className="rounded bg-slate-900 px-2 py-1 focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default CharacterCard;
