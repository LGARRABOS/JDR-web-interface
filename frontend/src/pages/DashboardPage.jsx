import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import MapUpload from '../components/MapUpload.jsx';
import MapCanvas from '../components/MapCanvas.jsx';
import CharacterCard from '../components/CharacterCard.jsx';
import CharacterForm from '../components/CharacterForm.jsx';
import DiceRoller from '../components/DiceRoller.jsx';
import { createCharacter, fetchCharacters, updateCharacter } from '../services/api.js';
import { useSocket } from '../hooks/useSocket.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const DashboardPage = () => {
  const { map: mapSocket, dice: diceSocket } = useSocket('default');
  const [characters, setCharacters] = useState([]);
  const [showCharacterForm, setShowCharacterForm] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [activeMap, setActiveMap] = useState(null);

  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const { data } = await fetchCharacters();
        setCharacters(data);
      } catch (error) {
        console.error('Failed to load characters', error);
      }
    };

    loadCharacters();
  }, []);

  useEffect(() => {
    if (!mapSocket) return;

    const handleTokenUpdate = (payload) => {
      setTokens((prev) =>
        prev.map((token) => (token.id === payload.id ? { ...token, ...payload } : token)),
      );
    };

    const handleMapState = (state) => {
      setTokens(state.tokens || []);
    };

    mapSocket.on('token-update', handleTokenUpdate);
    mapSocket.on('map-state', handleMapState);

    return () => {
      mapSocket.off('token-update', handleTokenUpdate);
      mapSocket.off('map-state', handleMapState);
    };
  }, [mapSocket]);

  const handleCharacterSubmit = async (form) => {
    try {
      if (editingCharacter) {
        const { data } = await updateCharacter(editingCharacter._id, form);
        setCharacters((prev) =>
          prev.map((character) =>
            character._id === data._id ? data : character,
          ),
        );
      } else {
        const { data } = await createCharacter(form);
        setCharacters((prev) => [...prev, data]);
      }
      setShowCharacterForm(false);
      setEditingCharacter(null);
    } catch (error) {
      console.error('Failed to save character', error);
      alert('Sauvegarde du personnage impossible');
    }
  };

  const handleTokenMove = (payload) => {
    setTokens((prev) =>
      prev.map((token) => (token.id === payload.id ? { ...token, ...payload } : token)),
    );
    mapSocket?.emit('token-update', payload);
  };

  const handleCreateToken = (position) => {
    const newToken = {
      id: `token-${Date.now()}`,
      name: 'Nouveau',
      ...position,
    };
    setTokens((prev) => {
      const updated = [...prev, newToken];
      mapSocket?.emit('map-state', { tokens: updated });
      return updated;
    });
  };

  const handleMapUploaded = (map) => {
    setActiveMap(map);
  };

  const mapImageUrl = useMemo(() => {
    if (!activeMap?.imagePath) return null;
    if (activeMap.imagePath.startsWith('http')) return activeMap.imagePath;
    return `${API_BASE_URL}/${activeMap.imagePath}`;
  }, [activeMap]);

  return (
    <Layout>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-4">
          <MapUpload onUploaded={handleMapUploaded} />
          <MapCanvas
            mapImage={mapImageUrl}
            tokens={tokens}
            onTokenMove={handleTokenMove}
            onCreateToken={handleCreateToken}
          />
          <button
            onClick={() => {
              setEditingCharacter(null);
              setShowCharacterForm(true);
            }}
            className="px-4 py-2 bg-accent rounded text-white"
          >
            Créer un personnage
          </button>
          <div className="grid md:grid-cols-2 gap-4">
            {characters.map((character) => (
              <CharacterCard
                key={character._id}
                character={character}
                onEdit={() => {
                  setEditingCharacter(character);
                  setShowCharacterForm(true);
                }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <DiceRoller diceSocket={diceSocket} />
          <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-slate-100">Conseils rapides</h2>
            <ul className="text-sm text-slate-300 list-disc pl-4 space-y-1 mt-2">
              <li>Double-clique sur la carte pour ajouter un jeton (MJ uniquement).</li>
              <li>Glisse un jeton pour déplacer sa position.</li>
              <li>Partage le lien du lancer pour garder une trace des tirages.</li>
              <li>Prépare plusieurs campagnes en adaptant les identifiants de salle.</li>
            </ul>
          </div>
        </div>
      </div>
      {showCharacterForm && (
        <CharacterForm
          onSubmit={handleCharacterSubmit}
          onCancel={() => {
            setShowCharacterForm(false);
            setEditingCharacter(null);
          }}
          initialValues={editingCharacter}
        />
      )}
    </Layout>
  );
};

export default DashboardPage;
