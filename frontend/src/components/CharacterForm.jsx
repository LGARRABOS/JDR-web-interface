import React, { useState } from 'react';

const CharacterForm = ({ onSubmit, onCancel, initialValues = {} }) => {
  const [form, setForm] = useState({
    name: initialValues.name || '',
    health: initialValues.health || 0,
    mana: initialValues.mana || 0,
    imageUrl: initialValues.imageUrl || '',
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === 'health' || name === 'mana') {
      setForm((prev) => ({ ...prev, [name]: Number(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Créer / Modifier un personnage</h2>
        <form
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm text-slate-300 mb-1">Nom</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-300 mb-1">PV</label>
              <input
                name="health"
                type="number"
                value={form.health}
                onChange={handleChange}
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Mana</label>
              <input
                name="mana"
                type="number"
                value={form.mana}
                onChange={handleChange}
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Image (URL)</label>
            <input
              name="imageUrl"
              value={form.imageUrl}
              onChange={handleChange}
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-accent text-white"
            >
              Sauvegarder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CharacterForm;
