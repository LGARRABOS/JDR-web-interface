import React, { useState } from 'react';
import { uploadMap } from '../services/api.js';
import { useAuth } from '../App.jsx';

const MapUpload = ({ onUploaded }) => {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  if (!user?.isGameMaster) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append('map', file);
    if (name) formData.append('name', name);

    try {
      const { data } = await uploadMap(formData);
      onUploaded(data);
      setName('');
      setFile(null);
    } catch (error) {
      console.error('Upload error', error);
      alert("Impossible d'uploader la carte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800/70 border border-slate-700 rounded-lg p-4 flex flex-wrap items-end gap-4"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="block text-sm text-slate-300 mb-1">Nom de la carte</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
          placeholder="Donne un nom à ta carte"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Fichier</label>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setFile(event.target.files[0])}
          className="text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-accent rounded text-white disabled:opacity-50"
      >
        {loading ? 'Téléversement...' : 'Téléverser'}
      </button>
    </form>
  );
};

export default MapUpload;
