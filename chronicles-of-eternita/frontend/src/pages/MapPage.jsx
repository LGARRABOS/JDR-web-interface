import { useCallback, useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar.jsx';
import CharacterCard from '../components/CharacterCard.jsx';
import DiceRoller from '../components/DiceRoller.jsx';
import MapCanvas from '../components/MapCanvas.jsx';
import useAuth from '../hooks/useAuth.jsx';
import useSocket from '../hooks/useSocket.js';
import { CharacterService, DiceService, MapService } from '../services/api.js';

const COLOR_PALETTE = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#f97316', '#a78bfa', '#22d3ee'];

const assignColorsToUsers = (currentAssignments, characters) => {
  const assignments = { ...currentAssignments };
  let assignedCount = Object.keys(assignments).length;
  characters.forEach((character) => {
    if (!assignments[character.userId]) {
      assignments[character.userId] = COLOR_PALETTE[assignedCount % COLOR_PALETTE.length];
      assignedCount += 1;
    }
  });
  return assignments;
};

const defaultTokenPosition = (index) => ({
  x: 10 + (index % 5) * 15,
  y: 10 + Math.floor(index / 5) * 20
});

const createPlayerTokens = (characters, previousTokens, colorAssignments) => {
  const previousPositions = previousTokens.reduce((acc, token) => {
    acc[token.id] = { x: token.x, y: token.y };
    return acc;
  }, {});

  return characters.map((character, index) => {
    const id = `char-${character.id}`;
    const position = previousPositions[id] ?? defaultTokenPosition(index);
    return {
      id,
      type: 'player',
      ownerId: character.userId,
      label: character.name,
      color: colorAssignments[character.userId] || COLOR_PALETTE[index % COLOR_PALETTE.length],
      x: position.x,
      y: position.y
    };
  });
};

const buildMapPath = (filePath) => `/${filePath.replace(/^\/*/, '')}`;

const createEnemyTokenId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `enemy-${globalThis.crypto.randomUUID()}`;
  }
  return `enemy-${Date.now()}-${Math.round(Math.random() * 1000)}`;
};

const MapPage = () => {
  const { user } = useAuth();
  const socket = useSocket(Boolean(user));
  const [characters, setCharacters] = useState([]);
  const [mapImage, setMapImage] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [diceLog, setDiceLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [colorAssignments, setColorAssignments] = useState({});
  const [mapCatalog, setMapCatalog] = useState([]);
  const [mapSearch, setMapSearch] = useState('');
  const [mapCatalogLoading, setMapCatalogLoading] = useState(false);
  const [enemyForm, setEnemyForm] = useState({ name: '', image: '' });

  const isMJ = useMemo(() => user?.role === 'MJ', [user]);

  const loadCharacters = useCallback(async () => {
    try {
      const { data } = await CharacterService.list();
      const normalizedCharacters = data.characters.map((character) => ({
        ...character,
        speed: character.speed ?? 0
      }));
      setCharacters(normalizedCharacters);
      setColorAssignments((prevAssignments) => {
        const updatedAssignments = assignColorsToUsers(prevAssignments, normalizedCharacters);
        setTokens((prevTokens) => {
          const enemyTokens = prevTokens.filter((token) => token.type === 'enemy');
          const playerTokens = createPlayerTokens(normalizedCharacters, prevTokens, updatedAssignments);
          return [...playerTokens, ...enemyTokens];
        });
        return updatedAssignments;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMapCatalog = useCallback(
    async (searchTerm = '') => {
      if (!isMJ) {
        return;
      }
      setMapCatalogLoading(true);
      try {
        const params = searchTerm ? { search: searchTerm } : {};
        const { data } = await MapService.list(params);
        setMapCatalog(data.maps);
      } finally {
        setMapCatalogLoading(false);
      }
    },
    [isMJ]
  );

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (isMJ) {
      loadMapCatalog();
    } else {
      setMapCatalog([]);
    }
  }, [isMJ, loadMapCatalog]);

  useEffect(() => {
    if (!isMJ) {
      return undefined;
    }
    const handler = setTimeout(() => {
      loadMapCatalog(mapSearch.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [isMJ, loadMapCatalog, mapSearch]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleSocketTokenMove = (payload) => {
      setTokens((prev) =>
        prev.map((token) => (token.id === payload.id ? { ...token, x: payload.x, y: payload.y } : token))
      );
    };

    const handleSocketTokenAdd = (payload) => {
      setTokens((prev) => {
        if (prev.some((token) => token.id === payload.id)) {
          return prev;
        }
        return [...prev, payload];
      });
    };

    const handleSocketTokenRemove = (payload) => {
      setTokens((prev) => prev.filter((token) => token.id !== payload.id));
    };

    const handleDiceResult = (payload) => {
      setDiceLog((prev) => [payload, ...prev].slice(0, 10));
    };

    const handleMapUpdate = (payload) => {
      setMapImage(payload.mapImage);
    };

    socket.on('token:move', handleSocketTokenMove);
    socket.on('token:add', handleSocketTokenAdd);
    socket.on('token:remove', handleSocketTokenRemove);
    socket.on('dice:result', handleDiceResult);
    socket.on('map:update', handleMapUpdate);

    return () => {
      socket.off('token:move', handleSocketTokenMove);
      socket.off('token:add', handleSocketTokenAdd);
      socket.off('token:remove', handleSocketTokenRemove);
      socket.off('dice:result', handleDiceResult);
      socket.off('map:update', handleMapUpdate);
    };
  }, [socket]);

  const moveTokenLocally = useCallback((payload) => {
    setTokens((prev) => prev.map((token) => (token.id === payload.id ? { ...token, ...payload } : token)));
  }, []);

  const handleTokenMove = useCallback(
    (payload) => {
      const token = tokens.find((item) => item.id === payload.id);
      if (!token) {
        return;
      }
      const canControl = isMJ || (token.type === 'player' && token.ownerId === user?.id);
      if (!canControl) {
        return;
      }
      moveTokenLocally(payload);
      if (socket) {
        socket.emit('token:move', payload);
      }
    },
    [isMJ, moveTokenLocally, socket, tokens, user?.id]
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
    const uploadedPath = buildMapPath(data.map.filePath);
    setMapImage(uploadedPath);
    setMapCatalog((prev) => [data.map, ...prev.filter((map) => map.id !== data.map.id)]);
    socket?.emit('map:update', { mapImage: uploadedPath });
  };

  const handleMapSelect = (map) => {
    const selectedPath = buildMapPath(map.filePath);
    setMapImage(selectedPath);
    socket?.emit('map:update', { mapImage: selectedPath });
  };

  const handleEnemyFormChange = (field) => (event) => {
    const value = event.target.value;
    setEnemyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddEnemyToken = (event) => {
    event.preventDefault();
    const name = enemyForm.name.trim();
    const image = enemyForm.image.trim();
    if (!name || !image) {
      return;
    }
    const newToken = {
      id: createEnemyTokenId(),
      type: 'enemy',
      ownerId: null,
      label: name,
      image,
      x: 50,
      y: 50
    };
    setTokens((prev) => [...prev, newToken]);
    setEnemyForm({ name: '', image: '' });
    socket?.emit('token:add', newToken);
  };

  const handleRemoveEnemyToken = (tokenId) => {
    setTokens((prev) => prev.filter((token) => token.id !== tokenId));
    socket?.emit('token:remove', { id: tokenId });
  };

  const handleUpdateCharacter = async (updatedCharacter) => {
    await CharacterService.update(updatedCharacter.id, {
      name: updatedCharacter.name,
      hp: updatedCharacter.hp,
      mana: updatedCharacter.mana,
      speed: updatedCharacter.speed,
      image: updatedCharacter.image || null
    });
    setCharacters((prev) => prev.map((char) => (char.id === updatedCharacter.id ? updatedCharacter : char)));
    setTokens((prev) =>
      prev.map((token) =>
        token.id === `char-${updatedCharacter.id}` ? { ...token, label: updatedCharacter.name } : token
      )
    );
  };

  const handleDiceRoll = async (expression) => {
    await DiceService.roll(expression);
  };

  const displayedTokens = useMemo(
    () =>
      tokens.map((token) => ({
        ...token,
        draggable: isMJ || (token.type === 'player' && token.ownerId === user?.id)
      })),
    [tokens, isMJ, user?.id]
  );

  const enemyTokens = useMemo(() => tokens.filter((token) => token.type === 'enemy'), [tokens]);

  const normalizedCurrentMap = useMemo(
    () => (mapImage ? mapImage.replace(/^\/*/, '') : null),
    [mapImage]
  );

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
          {isMJ && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-emerald-300">Catalogue de cartes</h3>
                  <button
                    type="button"
                    onClick={() => loadMapCatalog(mapSearch.trim())}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Rafraîchir
                  </button>
                </div>
                <input
                  type="text"
                  value={mapSearch}
                  onChange={(event) => setMapSearch(event.target.value)}
                  placeholder="Rechercher une carte..."
                  className="w-full rounded bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {mapCatalogLoading ? (
                    <p className="text-sm text-slate-400">Chargement du catalogue...</p>
                  ) : mapCatalog.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucune carte disponible pour le moment.</p>
                  ) : (
                    mapCatalog.map((map) => {
                      const normalizedPath = map.filePath.replace(/^\/*/, '');
                      const isActive = normalizedCurrentMap === normalizedPath;
                      return (
                        <button
                          type="button"
                          key={map.id}
                          onClick={() => handleMapSelect(map)}
                          className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition ${
                            isActive ? 'bg-slate-700 text-emerald-300' : 'bg-slate-900 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          <span className="truncate">{map.name}</span>
                          {isActive && <span className="text-xs uppercase text-emerald-400">Active</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="h-[60vh]">
            <MapCanvas mapImage={mapImage} tokens={displayedTokens} onTokenMove={handleTokenMove} />
          </div>
          {isMJ && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-emerald-300">Pions ennemis</h3>
                <form onSubmit={handleAddEnemyToken} className="flex flex-col gap-2 md:flex-row">
                  <input
                    type="text"
                    value={enemyForm.name}
                    onChange={handleEnemyFormChange('name')}
                    placeholder="Nom de l'ennemi"
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    value={enemyForm.image}
                    onChange={handleEnemyFormChange('image')}
                    placeholder="URL de l'image"
                    className="flex-1 rounded bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300"
                    disabled={!enemyForm.name.trim() || !enemyForm.image.trim()}
                  >
                    Ajouter
                  </button>
                </form>
                <div className="flex flex-wrap gap-3">
                  {enemyTokens.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucun pion ennemi pour le moment.</p>
                  ) : (
                    enemyTokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center gap-3 rounded border border-slate-700 bg-slate-900 p-3"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-600">
                          {token.image ? (
                            <img src={token.image} alt={token.label} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-700 text-xs font-semibold uppercase text-emerald-200">
                              {token.label.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-emerald-300">{token.label}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEnemyToken(token.id)}
                            className="text-xs text-rose-400 transition hover:text-rose-300"
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
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
