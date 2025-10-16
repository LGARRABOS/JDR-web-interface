import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import CharacterCard from '../components/CharacterCard.jsx';
import DiceRoller from '../components/DiceRoller.jsx';
import MapCanvas from '../components/MapCanvas.jsx';
import useAuth from '../hooks/useAuth.jsx';
import useSocket from '../hooks/useSocket.js';
import { CharacterService, DiceService, MapService } from '../services/api.js';

const createTokensFromCharacters = (characters) =>
  characters.map((character, index) => ({
    id: character.id,
    label: character.name,
    x: 10 + (index % 5) * 15,
    y: 10 + Math.floor(index / 5) * 20
  }));

const MapPage = () => {
  const { user } = useAuth();
  const socket = useSocket(Boolean(user));
  const [characters, setCharacters] = useState([]);
  const [mapImage, setMapImage] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [diceLog, setDiceLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const isMJ = useMemo(() => user?.role === 'MJ', [user]);

  const loadCharacters = useCallback(async () => {
    try {
      const { data } = await CharacterService.list();
      setCharacters(data.characters);
      setTokens(createTokensFromCharacters(data.characters));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleTokenMove = (payload) => {
      setTokens((prev) =>
        prev.map((token) => (token.id === payload.id ? { ...token, x: payload.x, y: payload.y } : token))
      );
    };

    const handleDiceResult = (payload) => {
      setDiceLog((prev) => [payload, ...prev].slice(0, 10));
    };

    const handleMapUpdate = (payload) => {
      setMapImage(payload.mapImage);
    };

    socket.on('token:move', handleTokenMove);
    socket.on('dice:result', handleDiceResult);
    socket.on('map:update', handleMapUpdate);

    return () => {
      socket.off('token:move', handleTokenMove);
      socket.off('dice:result', handleDiceResult);
      socket.off('map:update', handleMapUpdate);
    };
  }, [socket]);

  const moveTokenLocally = useCallback((payload) => {
    setTokens((prev) => prev.map((token) => (token.id === payload.id ? { ...token, ...payload } : token)));
  }, []);

  const handleTokenMove = useCallback(
    (payload) => {
      moveTokenLocally(payload);
      if (socket && isMJ) {
        socket.emit('token:move', payload);
      }
    },
    [isMJ, moveTokenLocally, socket]
  );

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('map', file);
    formData.append('name', file.name);
    const { data } = await MapService.upload(formData);
    const uploadedPath = `/${data.map.filePath.replace(/^\/*/, '')}`;
    setMapImage(uploadedPath);
    socket?.emit('map:update', { mapImage: uploadedPath });
  };

  const handleUpdateCharacter = async (updatedCharacter) => {
    await CharacterService.update(updatedCharacter.id, {
      name: updatedCharacter.name,
      hp: updatedCharacter.hp,
      mana: updatedCharacter.mana,
      image: updatedCharacter.image
    });
    setCharacters((prev) => prev.map((char) => (char.id === updatedCharacter.id ? updatedCharacter : char)));
    setTokens((prev) =>
      prev.map((token) =>
        token.id === updatedCharacter.id ? { ...token, label: updatedCharacter.name } : token
      )
    );
  };

  const handleDiceRoll = async (expression) => {
    await DiceService.roll(expression);
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-xl">Chargement des données...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-emerald-400">Carte</h2>
            {isMJ && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <span className="rounded bg-emerald-500 px-3 py-1 font-semibold text-slate-900">Uploader une carte</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleMapUpload} />
              </label>
            )}
          </div>
          <div className="h-[60vh]">
            <MapCanvas mapImage={mapImage} tokens={tokens} onTokenMove={handleTokenMove} isMJ={isMJ} />
          </div>
        </section>
        <aside className="flex flex-col gap-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-emerald-400">Personnages</h2>
            <div className="flex max-h-[40vh] flex-col gap-3 overflow-auto pr-2">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isEditable={isMJ || character.userId === user?.id}
                  onUpdate={handleUpdateCharacter}
                />
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-emerald-400">Lancer de dés</h2>
            <DiceRoller onRoll={handleDiceRoll} log={diceLog} />
          </section>
        </aside>
      </main>
    </div>
  );
};

export default MapPage;
